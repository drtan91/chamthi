// Supabase Edge Function: import-participants
// Phiên bản: 1.5.4 (Explicit Error Mapping Architecture & Pre-acceptance Status Verification)
// Nhập danh sách ~300 người tham gia từ file Excel (.xlsx) với 4 cột (STT, username, password, name)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalDomain = Deno.env.get("AUTH_INTERNAL_DOMAIN") || "participant.internal";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase Service Role configuration.");
    }

    // Khởi tạo Supabase Admin Client với Service Role Key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Xác thực quyền Admin / Super Admin từ JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: { code: "ERR_UNAUTHORIZED", message: "Yêu cầu đăng nhập." } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: { code: "ERR_UNAUTHORIZED", message: "Phiên đăng nhập không hợp lệ." } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerRole = user.app_metadata?.role;
    if (callerRole !== "admin" && callerRole !== "super_admin") {
      return new Response(
        JSON.stringify({ error: { code: "ERR_UNAUTHORIZED_ACCESS", message: "Bạn không có quyền thực hiện thao tác này." } }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Tiếp nhận file Excel từ FormData
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(
        JSON.stringify({ error: { code: "ERR_MISSING_FILE", message: "Vui lòng chọn file Excel để tải lên." } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

    if (!rawRows || rawRows.length < 2) {
      return new Response(
        JSON.stringify({ error: { code: "ERR_EMPTY_FILE", message: "File Excel không có dữ liệu." } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Kiểm tra cấu trúc tiêu đề 4 cột: STT, username, password, name
    const headers = rawRows[0].map((h: any) => String(h || "").trim().toLowerCase());
    const requiredHeaders = ["stt", "username", "password", "name"];
    const isValidStructure = requiredHeaders.every((reqHeader) => headers.includes(reqHeader));

    if (!isValidStructure) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ERR_INVALID_FILE_STRUCTURE",
            message: "Cấu trúc file Excel không hợp lệ. File phải chứa các cột: STT, username, password, name.",
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sttIdx = headers.indexOf("stt");
    const userIdx = headers.indexOf("username");
    const nameIdx = headers.indexOf("name");

    const dataRows = rawRows.slice(1);
    const seenUsernamesInFile = new Set<string>();
    const rowErrors: any[] = [];
    const validCandidates: any[] = [];

    // 4. Validate từng dòng
    dataRows.forEach((row, idx) => {
      const rowNum = idx + 2; // Số dòng thực tế trong Excel (header là dòng 1)
      const sttVal = row[sttIdx] !== undefined ? row[sttIdx] : (idx + 1);
      const rawUsername = row[userIdx] !== undefined ? String(row[userIdx]).trim() : "";
      const rawName = row[nameIdx] !== undefined ? String(row[nameIdx]).trim() : "";

      if (!rawUsername) {
        rowErrors.push({
          row: rowNum,
          stt: sttVal,
          username: "",
          error_code: "ERR_MISSING_REQUIRED_FIELD",
          message: `Dòng ${rowNum} (STT ${sttVal}): Cột 'username' không được để trống.`,
        });
        return;
      }

      const cleanUsername = rawUsername.toLowerCase();

      if (seenUsernamesInFile.has(cleanUsername)) {
        rowErrors.push({
          row: rowNum,
          stt: sttVal,
          username: cleanUsername,
          error_code: "ERR_DUPLICATE_USERNAME_IN_FILE",
          message: `Dòng ${rowNum} (STT ${sttVal}): Tên đăng nhập '${cleanUsername}' bị trùng lặp trong file.`,
        });
        return;
      }

      seenUsernamesInFile.add(cleanUsername);
      validCandidates.push({
        row: rowNum,
        stt: sttVal,
        username: cleanUsername,
        name: rawName,
      });
    });

    if (rowErrors.length > 0 && validCandidates.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          summary: {
            total_rows: dataRows.length,
            successful_count: 0,
            skipped_count: 0,
            failed_count: rowErrors.length,
          },
          errors: rowErrors,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Kiểm tra danh sách username đã tồn tại trong database
    const { data: existingParticipants, error: existError } = await supabaseAdmin
      .from("participants")
      .select("username")
      .in("username", Array.from(seenUsernamesInFile));

    if (existError) {
      throw existError;
    }

    const existingUsernameSet = new Set((existingParticipants || []).map((p: any) => p.username));

    const details: any[] = [];
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = rowErrors.length;

    // 6. Xử lý tạo tài khoản từng dòng với mật khẩu cố định 123
    for (const candidate of validCandidates) {
      if (existingUsernameSet.has(candidate.username)) {
        skippedCount++;
        details.push({
          stt: candidate.stt,
          username: candidate.username,
          name: candidate.name,
          status: "SKIPPED_EXISTING",
        });
        continue;
      }

      const internalEmail = `${candidate.username}@${internalDomain}`;

      // Tạo tài khoản Auth Admin API (Mật khẩu cố định '123')
      const { data: authCreated, error: authCreateErr } = await supabaseAdmin.auth.admin.createUser({
        email: internalEmail,
        password: "123",
        email_confirm: true,
        app_metadata: { role: "participant" },
        user_metadata: { name: candidate.name, username: candidate.username },
      });

      if (authCreateErr || !authCreated.user) {
        failedCount++;
        rowErrors.push({
          row: candidate.row,
          stt: candidate.stt,
          username: candidate.username,
          error_code: "ERR_AUTH_CREATE_FAILED",
          message: `Dòng ${candidate.row} (STT ${candidate.stt}): Tạo tài khoản Auth thất bại: ${authCreateErr?.message}`,
        });
        continue;
      }

      const authUserId = authCreated.user.id;

      // Lưu bản ghi vào bảng participants
      const { error: insertErr } = await supabaseAdmin.from("participants").insert({
        auth_user_id: authUserId,
        username: candidate.username,
        name: candidate.name || null,
        is_active: true,
      });

      if (insertErr) {
        // Rollback dọn dẹp tài khoản mồ côi
        await supabaseAdmin.auth.admin.deleteUser(authUserId);

        failedCount++;
        rowErrors.push({
          row: candidate.row,
          stt: candidate.stt,
          username: candidate.username,
          error_code: "ERR_PARTICIPANT_INSERT_FAILED",
          message: `Dòng ${candidate.row} (STT ${candidate.stt}): Lưu dữ liệu người tham gia thất bại: ${insertErr.message}`,
        });
        continue;
      }

      successCount++;
      details.push({
        stt: candidate.stt,
        username: candidate.username,
        name: candidate.name,
        status: "CREATED",
      });
    }

    return new Response(
      JSON.stringify({
        success: failedCount === 0,
        summary: {
          total_rows: dataRows.length,
          successful_count: successCount,
          skipped_count: skippedCount,
          failed_count: failedCount,
        },
        details,
        errors: rowErrors.length > 0 ? rowErrors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: {
          code: "ERR_INTERNAL_SERVER_ERROR",
          message: err.message || "Đã xảy ra lỗi hệ thống khi nạp file Excel.",
        },
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
