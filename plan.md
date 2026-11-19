# IMPLEMENTATION PLAN – KẾ HOẠCH TRIỂN KHAI VÀ KIẾN TRÚC HỆ THỐNG

> **Dự án:** Webapp Bình chọn & Chấm điểm Hội thi hát  
> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Giai đoạn hiện tại:** BẮT ĐẦU THỰC THI (Implementation Phase: Database Schema & Frontend Application)  
> **Phạm vi vòng đời:** Single-Event Lifecycle (~300 Người tham gia)

---

## 1. TỔNG QUAN KIẾN TRÚC KỸ THUẬT

```
+---------------------------------------------------------------------------------+
|                                 CLIENT DEVICES                                  |
|   +------------------------------------+   +--------------------------------+   |
|   |         ADMIN WORKSTATION          |   |  PARTICIPANT MOBILE / TABLET   |   |
|   |  - Single-Screen Admin Dashboard   |   |  - Mobile PWA Interface        |   |
|   |  - Safe Video Replacement Modal    |   |  - Video Player Modal (Lazy)   |   |
|   |  - One-Way Voting Lock Sticky Btn  |   |  - 2-Criteria Scoring Form     |   |
|   |  - (No Unlock Button on Event UI)  |   |  - Username + Password 123     |   |
|   |  - storage_cleanup_jobs Inspection |   |  - view_participants_public    |   |
|   +-----------------+------------------+   +---------------+----------------+   |
+---------------------|--------------------------------------|--------------------+
                      | HTTPS / WSS                          | HTTPS / WSS
                      v                                      v
+---------------------------------------------------------------------------------+
|                           FRONTEND HOSTING (VERCEL EDGE)                        |
|   - React 18 + TypeScript + Vite                                                |
|   - Tailwind CSS Responsive Design (Mobile-First)                               |
|   - Consistent Arithmetic Rounding (Max 2 Decimals: ROUND(..., 2))              |
|   - PWA Manifest + Service Worker (Static assets caching)                       |
|   - Client SDK Error Mapping Wrapper (Catch PostgREST exception -> HTTP 403)    |
+---------------------------------------------------------------------------------+
                                       |
                                       v Supabase Client SDK
+---------------------------------------------------------------------------------+
|                           SUPABASE CLOUD INFRASTRUCTURE                         |
|   +---------------------+   +---------------------+   +---------------------+   |
|   |    SUPABASE AUTH    |   |  SUPABASE STORAGE   |   |  SUPABASE REALTIME  |   |
|   | - Admin / SuperAdmin|   | - 'team-videos'     |   | - Lock State sync   |   |
|   | - Auth Admin API    |   | - 6-Step Safe Video |   | - Board Score sync  |   |
|   |   (Service Role Key)|   |   Replacement &     |   |   (Max 2 decimals)  |   |
|   | - No Public Signup  |   |   cleanup_jobs queue|   |                     |   |
|   +----------+----------+   +----------+----------+   +----------+----------+   |
|              |                         |                         |              |
|              +-------------------------+-------------------------+              |
|                                        |                                        |
|                                        v                                        |
|                           POSTGRESQL DATABASE ENGINE                            |
|   - Tables: system_settings, teams, participants, votes,                        |
|             storage_cleanup_jobs, audit_logs                                    |
|   - Locking: submit_vote (FOR SHARE) vs lock_voting_system (FOR UPDATE)         |
|   - Triggers: Enforce Lock (BEFORE INSERT/UPDATE FOR SHARE), Video Check        |
|   - Procedures: submit_vote, lock_voting_system, emergency_unlock_system,       |
|                 deactivate_participant, deactivate_all_participants             |
|   - Views & RPC: get_team_board() (4 columns), view_participants_public         |
|   - Row Level Security (RLS): Strict writes via RPC, safe public views          |
+---------------------------------------------------------------------------------+
```

---

## 2. NGUYÊN TẮC THIẾT KẾ ĐÃ ĐỒNG BỘ TRONG KẾ HOẠCH

1. **Điểm trung bình và làm tròn:**
   - Điểm khán giả = Trung bình cộng tổng điểm các phiếu hợp lệ hiện hành.
   - Thống nhất cơ chế làm tròn `ROUND(..., 2)` giữa Database View/RPC và Frontend UI, hiển thị tối đa 2 chữ số thập phân.
   - Nếu chưa có phiếu nào, hiển thị chính xác chuỗi: **“Chưa có điểm”**.
2. **Quy trình thay thế video an toàn 6 bước & Bảng `storage_cleanup_jobs`:**
   - Upload file mới $\to$ Nếu upload lỗi thì dừng và giữ video cũ $\to$ Cập nhật database $\to$ Nếu DB lỗi thì rollback giữ video cũ và dọn dẹp file mới qua `storage_cleanup_jobs` $\to$ Cập nhật DB thành công mới xóa video cũ $\to$ Nếu xóa video cũ lỗi thì ghi nhận vào `storage_cleanup_jobs` để retry sau.
   - Xóa video hoàn toàn: Admin xác nhận $\to$ Cập nhật DB thành `NULL` $\to$ Xóa file Storage. Khi đội chưa có video, database từ chối mọi yêu cầu chấm hoặc sửa điểm.
3. **Cơ chế khóa chấm điểm một chiều & Khóa chia sẻ dòng:**
   - `submit_vote` dùng `SELECT ... FOR SHARE` trên `system_settings WHERE id = 1` cho phép 300 người chấm đồng thời không nghẽn.
   - `lock_voting_system` dùng `SELECT ... FOR UPDATE` chờ tất cả `submit_vote` hoàn tất, sau đó cập nhật `is_locked = TRUE`.
   - Lỗi trả về: HTTP 403 Forbidden, `ERR_VOTING_LOCKED`, **“Đã khóa chấm điểm”**.
   - Mở khóa khẩn cấp do sự cố: Chỉ Super Admin có quyền qua RPC chuyên dụng, bắt buộc ghi log vào `audit_logs`.
4. **Nhập người tham gia từ Excel và bảo mật danh tính:**
   - Admin tải file Excel (.xlsx) gồm 4 cột: `STT`, `username`, `password`, `name`.
   - Mật khẩu cố định `123`, không yêu cầu đổi mật khẩu.
   - Ánh xạ email nội bộ an toàn `${clean_username}@${AUTH_INTERNAL_DOMAIN}` (mặc định `participant.internal`).
   - Xử lý tạo tài khoản Supabase Auth độc quyền tại Backend/Edge Function qua Admin API với Service Role Key.
   - `view_participants_public` chỉ gồm 4 trường (`id, username, name, is_active`), không bao giờ để lộ `auth_user_id`.

---

## 3. LỘ TRÌNH THỰC THI (EXECUTION PHASES)

### Giai đoạn 1: Thiết lập Schema PostgreSQL, Triggers, RPC & Views
1. Viết mã nguồn SQL khởi tạo hoàn chỉnh: `supabase/migrations/01_schema.sql`.
2. Tạo các bảng: `system_settings`, `teams`, `participants`, `votes`, `storage_cleanup_jobs`, `audit_logs`.
3. Tạo View `view_participants_public` bảo vệ quyền riêng tư.
4. Cài đặt các hàm và trigger: `fn_enforce_voting_lock`, `fn_enforce_team_video`, `fn_enforce_active_participant`.
5. Cài đặt các Stored Procedures: `submit_vote`, `lock_voting_system`, `emergency_unlock_system`, `deactivate_participant`, `deactivate_all_participants`, `get_team_board`.
6. Cài đặt chính sách RLS bảo mật tuyệt đối.

### Giai đoạn 2: Phát triển Backend Edge Functions
1. `participant-login`: Đăng nhập bằng `username` và `password 123`, tự động ánh xạ email nội bộ.
2. `import-participants`: Đọc file Excel 4 cột, tạo tài khoản Supabase Auth với mật khẩu `123`, chống trùng lặp, dọn dẹp tài khoản mồ côi.

### Giai đoạn 3: Xây dựng Ứng dụng Frontend (React + Vite + Tailwind CSS + PWA)
1. Khởi tạo cấu trúc dự án React 18 TypeScript.
2. Thiết lập Tailwind CSS và PWA Manifest + Service Worker.
3. Xây dựng dịch vụ API client Supabase và Client Error Wrapper.
4. Xây dựng Màn hình Đăng nhập (Admin & Khán giả).
5. Xây dựng Màn hình Admin đơn nhất: Bảng 4 cột, Modal chi tiết đội, Quy trình thay video 6 bước, Modal import Excel, Nút khóa chấm điểm.
6. Xây dựng Màn hình Khán giả: Bảng 4 cột, Modal xem video (`playsinline`), Form chấm 2 tiêu chí (1-25), Banner thông báo khi đã khóa.

### Giai đoạn 4: Kiểm thử, Tối ưu hóa & Hoàn tất
1. Kiểm tra 29 kịch bản kiểm thử (TC-01 đến TC-29).
2. Kiểm tra tính toàn vẹn Deep Snapshot và Concurrency.
3. Đóng gói và nghiệm thu.
