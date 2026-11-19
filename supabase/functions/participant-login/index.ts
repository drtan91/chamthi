// Supabase Edge Function: participant-login
// Phiên bản: 1.5.4 (Explicit Error Mapping Architecture & Pre-acceptance Status Verification)
// Đăng nhập khán giả bằng username và password 123 (tự động ánh xạ email nội bộ)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const internalDomain = Deno.env.get("AUTH_INTERNAL_DOMAIN") || "participant.internal";

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase configuration in environment variables.");
    }

    const { username, password } = await req.json();

    if (!username || !password) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ERR_MISSING_CREDENTIALS",
            message: "Tên đăng nhập và mật khẩu không được để trống.",
          },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    const internalEmail = `${cleanUsername}@${internalDomain}`;

    // Khởi tạo Supabase Client
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 1. Kiểm tra trạng thái tài khoản trong bảng participants
    const { data: participant, error: pError } = await supabase
      .from("participants")
      .select("id, username, name, is_active")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (pError || !participant) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ERR_INVALID_CREDENTIALS",
            message: "Tên đăng nhập hoặc mật khẩu không chính xác.",
          },
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (participant.is_active === false) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ERR_ACCOUNT_DEACTIVATED",
            message: "Tài khoản của bạn đã bị vô hiệu hóa bởi Ban tổ chức.",
          },
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Gọi Supabase Auth để đăng nhập với internal email và password
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: internalEmail,
      password: password,
    });

    if (authError || !authData.session) {
      return new Response(
        JSON.stringify({
          error: {
            code: "ERR_INVALID_CREDENTIALS",
            message: "Tên đăng nhập hoặc mật khẩu không chính xác.",
          },
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Trả về token phiên và thông tin người tham gia
    return new Response(
      JSON.stringify({
        success: true,
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
        },
        user: {
          id: participant.id,
          username: participant.username,
          name: participant.name,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: {
          code: "ERR_INTERNAL_SERVER_ERROR",
          message: err.message || "Đã xảy ra lỗi hệ thống khi xử lý đăng nhập.",
        },
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
