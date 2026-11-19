# WORK BREAKDOWN STRUCTURE (TASKS) – DANH MỤC NHIỆM VỤ DỰ ÁN

> **Dự án:** Webapp Bình chọn & Chấm điểm Hội thi hát  
> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Trạng thái:** BẮT ĐẦU TRIỂN KHAI (Execution in Progress)

---

## BẢNG TIẾN ĐỘ TỔNG QUAN

- **Giai đoạn 0: Hoàn thiện Bộ tài liệu Đặc tả (Spec Kit):** 100% Hoàn thành
- **Giai đoạn 1: Cơ sở dữ liệu & Supabase Backend:** 100% Hoàn thành (`01_schema.sql`)
- **Giai đoạn 2: Supabase Edge Functions:** 100% Hoàn thành (`participant-login`, `import-participants`)
- **Giai đoạn 3: Phát triển Ứng dụng Frontend (React + Vite + Tailwind + PWA):** 100% Hoàn thành (Build Verified)
- **Giai đoạn 4: Tích hợp Realtime, Khóa & Quản lý Video An toàn:** 100% Hoàn thành
- **Giai đoạn 5: Kiểm thử, Tối ưu hóa & Nghiệm thu:** 🔄 Sẵn sàng thực thi

---

## CHI TIẾT DANH MỤC NHIỆM VỤ

### GIAI ĐOẠN 0: ĐẶC TẢ HỆ THỐNG VÀ QUY CHUẨN THIẾT KẾ (SPEC KIT) - [100% HOÀN TẤT]
- [x] **TASK-001:** Thiết lập tài liệu 8 nguyên tắc bất biến (`constitution.md` v1.5.4).
- [x] **TASK-002:** Thiết lập đặc tả chức năng chi tiết và quy tắc nghiệp vụ (`spec.md` v1.5.4).
- [x] **TASK-003:** Thiết lập mô hình dữ liệu quan hệ, View 4 cột, Trigger và RLS (`data-model.md` v1.5.4).
- [x] **TASK-004:** Thiết lập hợp đồng API, quy trình thay video 6 bước, RPC và mã lỗi (`api-contracts.md` v1.5.4).
- [x] **TASK-005:** Thiết lập bộ 44 tiêu chí nghiệm thu AC-01 đến AC-42 (`acceptance-criteria.md` v1.5.4).
- [x] **TASK-006:** Thiết lập ma trận 29 kịch bản kiểm thử chi tiết (`test-scenarios.md` v1.5.4).
- [x] **TASK-007:** Xây dựng kế hoạch triển khai kiến trúc hệ thống (`plan.md` v1.5.4).
- [x] **TASK-008:** Xây dựng danh mục nhiệm vụ chi tiết (`tasks.md` v1.5.4).

---

### GIAI ĐOẠN 1: THIẾT LẬP DỮ LIỆU VÀ BACKEND SUPABASE - [100% HOÀN TẤT]
- [x] **TASK-101:** Xây dựng file Migration SQL hoàn chỉnh:
  - Bảng `system_settings` (id = 1, is_locked).
  - Bảng `teams` (`teammate_bonus IN (0, 3)`, `lucky_star IN (5, -5)`).
  - Bảng `participants` (UNIQUE `username`, UNIQUE `auth_user_id`, `is_active`).
  - Bảng `votes` (UNIQUE `(participant_id, team_id)`, điểm 1-25).
  - Bảng `storage_cleanup_jobs` (lưu hàng đợi dọn dẹp file Storage).
  - Bảng `audit_logs` (ghi nhận `reason` bắt buộc).
- [x] **TASK-102:** Xây dựng View `view_participants_public` chỉ gồm 4 trường (`id, username, name, is_active`), bảo vệ tuyệt đối không lộ `auth_user_id`.
- [x] **TASK-103:** Viết Database Triggers bảo vệ tính toàn vẹn:
  - `fn_enforce_voting_lock` dùng `FOR SHARE`, gọi `set_config('response.status', '403', true)` ném lỗi `ERR_VOTING_LOCKED` "Đã khóa chấm điểm".
  - `fn_enforce_team_video` kiểm tra video hiện hành trên cả INSERT và UPDATE.
  - `fn_enforce_active_participant` kiểm tra tài khoản còn hoạt động.
- [x] **TASK-104:** Thiết lập Row Level Security (RLS) Policies:
  - Phân quyền Admin toàn quyền đọc/ghi qua `app_metadata`.
  - Thu hồi quyền `INSERT, UPDATE, DELETE` trực tiếp trên bảng `votes` đối với client; bắt buộc ghi qua `submit_vote`.
- [x] **TASK-105:** Xây dựng Stored Procedures (RPC):
  - `submit_vote`: Khóa dòng `FOR SHARE`, trích xuất `participant_id` từ `auth.uid()`, UPSERT an toàn.
  - `lock_voting_system`: Khóa dòng `FOR UPDATE`, cập nhật `is_locked = TRUE`, ghi nhật ký `audit_logs`.
  - `emergency_unlock_system`: Chỉ Super Admin mở khóa kèm lý do bắt buộc.
  - `deactivate_participant`: Vô hiệu hóa từng tài khoản.
  - `deactivate_all_participants`: Vô hiệu hóa toàn bộ tài khoản sau hội thi.
  - `get_team_board`: Tổng hợp điểm trung bình 4 cột chuẩn, làm tròn 2 số thập phân.

---

### GIAI ĐOẠN 2: SUPABASE EDGE FUNCTIONS - [100% HOÀN TẤT]
- [x] **TASK-201:** Xây dựng Edge Function `participant-login`: Đăng nhập với username và password 123, tự động ánh xạ email nội bộ `${clean_username}@${AUTH_INTERNAL_DOMAIN}`.
- [x] **TASK-202:** Xây dựng Edge Function `import-participants`: Tiếp nhận file Excel 4 cột (`STT`, `username`, `password`, `name`), tạo tài khoản Auth bằng Admin API, dọn dẹp tài khoản mồ côi nếu lỗi, hỗ trợ nạp lại an toàn (idempotent).

---

### GIAI ĐOẠN 3: PHÁT TRIỂN GIAO DIỆN FRONTEND & PWA - [100% HOÀN TẤT]
- [x] **TASK-301:** Khởi tạo dự án React + TypeScript + Vite + Tailwind CSS theo chuẩn Mobile-First.
- [x] **TASK-302:** Cấu hình PWA (Progressive Web App): `manifest.json`, Service Worker cache tài nguyên tĩnh, chạy standalone.
- [x] **TASK-303:** Xây dựng Supabase Client & Error Mapping Wrapper chuẩn hóa mã lỗi HTTP 403.
- [x] **TASK-304:** Phát triển Màn hình Đăng nhập (Admin và Khán giả).
- [x] **TASK-305:** Xây dựng Màn hình Admin (Màn hình đơn nhất - Không đa tab):
  - Bảng 4 cột quản lý điểm đội thi cố định thứ tự ban đầu.
  - Modal Quản lý chi tiết đội: sửa tên, quy trình thay video an toàn 6 bước, xóa video, chọn điểm thưởng (0/+3), chọn ngôi sao (+5/-5).
  - Modal Import Excel người tham gia: upload file, hiển thị báo cáo chi tiết từng dòng.
  - Nút **KHÓA CHẤM ĐIỂM** một chiều có xác nhận.
- [x] **TASK-306:** Xây dựng Màn hình Người tham gia:
  - Bảng điểm 4 cột đồng bộ.
  - Modal xem video (lazy load, `playsinline` mượt trên mobile).
  - Form chấm 2 tiêu chí (Giọng hát: 1-25, Khuấy động: 1-25) kèm validate số nguyên.
  - Trạng thái vô hiệu hóa và banner hiển thị thông báo khi hệ thống khóa: **“Đã khóa chấm điểm”**.

---

### GIAI ĐOẠN 4: KIỂM THỬ & TỐI ƯU HÓA
- [ ] **TASK-401:** Kiểm thử Concurrency 300 VUs đồng thời với lệnh khóa của Admin (Request Audit + Deep Snapshot).
- [ ] **TASK-402:** Kiểm thử Quy trình thay thế video 6 bước và xử lý hàng đợi `storage_cleanup_jobs`.
- [ ] **TASK-403:** Kiểm thử nghiệm thu 29 kịch bản TC-01 đến TC-29.
