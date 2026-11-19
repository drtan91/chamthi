# API CONTRACTS & INTEGRATION SPECIFICATION

> **Tài liệu:** Hợp đồng Giao tiếp API & Thao tác Dữ liệu Supabase Client (API Contracts)  
> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Giao thức:** HTTPS REST / RPC & Supabase Realtime WebSocket

---

## 1. TỔNG QUAN PHƯƠNG THỨC GIAO TIẾP

Hệ thống sử dụng **Supabase Client SDK** và **Supabase Edge Functions** để giao tiếp an toàn giữa Frontend (React TypeScript Vite) và Backend (Supabase Engine).

- **Thao tác đọc dữ liệu bảng điểm / đội thi:** Sử dụng RPC `get_team_board()`. Bảng điểm có chính xác 4 cột nghiệp vụ, không thêm cột tổng điểm.
- **Thao tác đọc danh sách người tham gia công khai:** Sử dụng View an toàn `view_participants_public` chỉ trả về đúng 4 trường: `id`, `username`, `name`, `is_active`. **Tuyệt đối không để lộ `auth_user_id`**.
- **Thao tác chấm điểm:** Bắt buộc 100% sử dụng RPC `submit_vote()` (Khóa chia sẻ dòng `FOR SHARE`, Client bị cấm ghi trực tiếp vào bảng `votes` qua REST API).
- **Thao tác quản trị khóa/mở khóa & trạng thái tài khoản:** Bắt buộc sử dụng các RPC `lock_voting_system()` (Khóa độc quyền dòng `FOR UPDATE`), `emergency_unlock_system()`, `deactivate_participant()`, `deactivate_all_participants()`.
- **Thao tác đăng nhập & nạp danh sách:** Sử dụng các Supabase Edge Functions: `participant-login`, `import-participants`.

---

## 2. HỢP ĐỒNG XÁC THỰC VÀ QUẢN LÝ TÀI KHOẢN (AUTHENTICATION & PARTICIPANTS)

### 2.1. Đăng nhập Quản trị viên (Admin / Super Admin Login)
- **Phương thức:** `supabase.auth.signInWithPassword`
- **Request Payload:**
```json
{
  "email": "admin@hoithihat.vn",
  "password": "<secure_admin_password>"
}
```
- **Quy tắc phân quyền (Role Invariant):**
  - Quyền quản trị được lưu trữ độc quyền trong trường `app_metadata` của Supabase Auth:
    `app_metadata: { "role": "admin" }` hoặc `app_metadata: { "role": "super_admin" }`.
  - Mọi RPC và Database Policies kiểm tra quyền thông qua:
    `auth.jwt() -> 'app_metadata' ->> 'role'`.
- **Response Success (200 OK):**
```json
{
  "user": {
    "id": "e3a1f4b2-0000-0000-0000-111122223333",
    "email": "admin@hoithihat.vn",
    "app_metadata": { "role": "admin" }
  },
  "session": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "..."
  }
}
```

---

### 2.2. Đăng nhập Người tham gia qua Backend Edge Function (`participant-login`)
- **Mục tiêu an toàn:** Người tham gia **chỉ cần nhập `username` và `password 123`**, hoàn toàn **không cần nhập email hay số điện thoại**.
- **Endpoint:** `POST /functions/v1/participant-login`
- **Request Payload:**
```json
{
  "username": "user001",
  "password": "123"
}
```
- **Xử lý an toàn phía Backend:**
  1. Chuẩn hóa `username` thành chữ thường: `clean_username = username.trim().toLowerCase()`.
  2. Kiểm tra tài khoản trong bảng `participants`:
     - Nếu không tìm thấy: Trả về HTTP 401 `ERR_INVALID_CREDENTIALS` (*"Tên đăng nhập hoặc mật khẩu không chính xác."*).
     - Nếu `is_active = FALSE`: Trả về HTTP 403 `ERR_ACCOUNT_DEACTIVATED` (*"Tài khoản của bạn đã bị vô hiệu hóa bởi Ban tổ chức."*).
  3. **Cơ chế ánh xạ Internal Email:**
     - Sử dụng biến môi trường máy chủ: `AUTH_INTERNAL_DOMAIN` (chuẩn mặc định: `participant.internal` theo RFC 6761 hoặc domain chính thức do người dùng xác nhận).
     - Ánh xạ ngầm: `internal_email = `${clean_username}@${AUTH_INTERNAL_DOMAIN}``.
     - *Yêu cầu bắt buộc:* Bắt buộc thực hiện kiểm thử xác thực (Pre-flight Auth Test) tạo và đăng nhập tài khoản mẫu trên môi trường Supabase Auth mục tiêu trước khi chạy sự kiện chính thức.
  4. Backend gọi Supabase Auth API: `supabase.auth.signInWithPassword({ email: internal_email, password })`.
  5. Trả về token phiên (JWT `access_token`, `refresh_token`, `user`) cho client.
  6. Frontend gọi `supabase.auth.setSession({ access_token, refresh_token })` để thiết lập phiên làm việc.
- **Response Success (200 OK):**
```json
{
  "success": true,
  "session": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "...",
    "expires_in": 3600
  },
  "user": {
    "id": "7b2c4518-d06e-41d3-a442-888999aabbcc",
    "username": "user001",
    "name": "Nguyễn Văn A"
  }
}
```

---

### 2.3. Hợp đồng Đọc Danh Sách Người Tham Gia Công Khai (`view_participants_public`)
- **Mục tiêu bảo mật:** Cho phép khán giả xem danh sách người tham gia nhưng **tuyệt đối không để lộ `auth_user_id`** hay thông tin nội bộ.
- **Quy chuẩn dữ liệu:** View trả về chính xác 4 trường: `id`, `username`, `name`, `is_active`.
- **Phương thức SDK:**
  ```javascript
  const { data: participants, error } = await supabase
    .from('view_participants_public')
    .select('id, username, name, is_active')
    .order('username', { ascending: true });
  ```
- **Response Success (200 OK):**
```json
[
  {
    "id": "7b2c4518-d06e-41d3-a442-888999aabbcc",
    "username": "user001",
    "name": "Nguyễn Văn A",
    "is_active": true
  },
  {
    "id": "8c3d5629-e17f-52e4-b553-999000bbccdd",
    "username": "user002",
    "name": "Trần Thị B",
    "is_active": true
  }
]
```

---

### 2.4. Hợp đồng Nhập người tham gia từ Excel (`import-participants`)
- **Endpoint:** `POST /functions/v1/import-participants` (Supabase Edge Function)
- **Quyền hạn:** Header `Authorization: Bearer <ADMIN_ACCESS_TOKEN>` (Kiểm tra `app_metadata.role IN ('admin', 'super_admin')`).
- **Cấu trúc File Excel (.xlsx):** Bắt buộc 4 cột: `STT`, `username`, `password`, `name`.
- **Quy tắc xử lý:**
  1. Backend chuẩn hóa `username` thành chữ thường: `lower(trim(username))`.
  2. **Mật khẩu cố định 123:** Bất kể ô password trong Excel điền gì hoặc để trống, backend **luôn luôn gán cố định mật khẩu `123`** cho mọi tài khoản participant.
  3. **Không tạo tài khoản trùng (Idempotent):** Kiểm tra `username` đã tồn tại thì bỏ qua và gán trạng thái `SKIPPED_EXISTING`.
  4. **Xử lý tài khoản mồ côi (Orphaned Auth User Cleanup):**
     - Tạo Auth User: `auth.admin.createUser({ email: internal_email, password: '123', email_confirm: true, app_metadata: { role: 'participant' } })`.
     - Lưu bảng `participants` liên kết `auth_user_id`.
     - **Nếu lưu `participants` thất bại:** Backend gọi ngay lập tức `auth.admin.deleteUser(auth_user_id)` để rollback/dọn dẹp tài khoản mồ côi khỏi `auth.users`.
- **Request:** `multipart/form-data` (Field: `file`).
- **Response Success (200 OK):**
```json
{
  "success": true,
  "summary": {
    "total_rows": 300,
    "successful_count": 298,
    "skipped_count": 2,
    "failed_count": 0
  },
  "details": [
    { "stt": 1, "username": "user001", "name": "Nguyễn Văn A", "status": "CREATED" },
    { "stt": 2, "username": "user002", "name": "Trần Thị B", "status": "SKIPPED_EXISTING" }
  ]
}
```

---

### 2.5. Vô hiệu hóa từng tài khoản (`deactivate_participant`)
- **Phương thức RPC:** `supabase.rpc('deactivate_participant', { p_participant_id, p_is_active, p_reason })`
- **Quyền hạn:** `auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'super_admin')`.
- **Request Payload:**
```json
{
  "p_participant_id": "7b2c4518-d06e-41d3-a442-888999aabbcc",
  "p_is_active": false,
  "p_reason": "Vi phạm quy chế bình chọn sự kiện"
}
```
- **Response Success (200 OK):**
```json
{
  "success": true,
  "participant_id": "7b2c4518-d06e-41d3-a442-888999aabbcc",
  "is_active": false,
  "message": "Cập nhật trạng thái người tham gia thành công."
}
```

---

### 2.6. Vô hiệu hóa toàn bộ tài khoản sau hội thi (`deactivate_all_participants`)
- **Phương thức RPC:** `supabase.rpc('deactivate_all_participants', { p_reason })`
- **Quyền hạn:** **Chỉ dành riêng cho Super Admin** (`auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'`).
- **Request Payload:**
```json
{
  "p_reason": "Bế mạc hội thi hát, đóng toàn quyền truy cập của khán giả."
}
```
- **Response Success (200 OK):**
```json
{
  "success": true,
  "deactivated_count": 300,
  "message": "Đã vô hiệu hóa toàn bộ tài khoản participant sau hội thi."
}
```

---

## 3. HỢP ĐỒNG BẢNG ĐIỂM & QUẢN LÝ VIDEO AN TOÀN

### 3.1. Lấy Bảng Điểm 4 Cột Nghiệp Vụ (`get_team_board`)
- **Phương thức RPC:** `supabase.rpc('get_team_board')`
- **Thuộc tính hàm:** `SECURITY DEFINER SET search_path = public, pg_temp`.
- **Quyền truy cập:** Công khai cho cả `anon` và `authenticated`.
- **Quy tắc bảng điểm:** Hiển thị chính xác 4 cột đã thống nhất:
  1. `team_name`: Tên đội thi.
  2. `display_audience_score`: Điểm khán giả (làm tròn tối đa 2 chữ số thập phân, nếu 0 phiếu hiển thị `"Chưa có điểm"`).
  3. `teammate_bonus`: Điểm thưởng đồng đội (0 hoặc 3).
  4. `lucky_star`: Ngôi sao may mắn (+5 hoặc -5).
  - **Tuyệt đối không có cột tổng điểm** hay cột điểm bổ sung nào khác.
  - Thứ tự hiển thị cố định theo `display_order` ban đầu.
- **Response Success (200 OK):**
```json
[
  {
    "team_id": "c1f10825-97e3-4f93-a4a5-111111111111",
    "team_name": "Đội Sao Mai",
    "display_order": 1,
    "video_url": "https://...supabase.co/storage/v1/object/public/team-videos/c1f.../video.mp4",
    "valid_vote_count": 285,
    "raw_audience_score": 43.33,
    "display_audience_score": "43.33",
    "teammate_bonus": 3,
    "lucky_star": 5
  },
  {
    "team_id": "c2f20825-97e3-4f93-a4a5-222222222222",
    "team_name": "Đội Họa Mi",
    "display_order": 2,
    "video_url": null,
    "valid_vote_count": 0,
    "raw_audience_score": null,
    "display_audience_score": "Chưa có điểm",
    "teammate_bonus": 0,
    "lucky_star": -5
  }
]
```

---

### 3.2. Quy trình Thay thế Video An toàn & Xóa Video

#### A. Quy trình Thay thế Video Hiện Tại (6 Bước Bắt buộc)
1. **Bước 1 (Upload video mới):** Upload tệp video mới lên Storage Bucket `team-videos` dưới một đường dẫn định danh mới:  
   `new_path = `${team_id}/video_${Date.now()}_${uuid}.mp4``.
2. **Bước 2 (Kiểm tra Upload):**  
   - Nếu upload thất bại: Dừng thao tác ngay lập tức, giữ nguyên video cũ và đường dẫn cũ trong database.
3. **Bước 3 (Cập nhật Database):**  
   - Nếu upload thành công: Cập nhật `teams.video_url` và `teams.video_path = new_path` trong database.
4. **Bước 4 (Xử lý khi cập nhật Database thất bại):**  
   - Nếu cập nhật database thất bại: Giữ nguyên video cũ cho đội thi.  
   - Tiến hành xóa file mới vừa upload; nếu xóa ngay thất bại thì tạo một bản ghi dọn dẹp vào bảng `storage_cleanup_jobs` với `reason = 'ROLLBACK_NEW_VIDEO'`.
5. **Bước 5 (Gỡ bỏ Video cũ):**  
   - Chỉ sau khi database cập nhật `video_url` mới thành công, tiến hành gọi API xóa file video cũ trên Storage.
6. **Bước 6 (Khắc phục lỗi xóa video cũ):**  
   - Nếu thao tác xóa video cũ trên Storage thất bại: Video mới vẫn hoạt động bình thường trên hệ thống.  
   - Backend/Client ghi nhận công việc xóa lại vào bảng `storage_cleanup_jobs` (`reason = 'REPLACE_VIDEO'`, `status = 'pending'`) để tiến trình nền tự động dọn dẹp sau.

#### B. Quy trình Xóa Video Hoàn Toàn
1. Admin bấm nút "Xóa video" và bấm xác nhận trên hộp thoại cảnh báo.
2. Cập nhật trạng thái đội trong database:  
   `UPDATE teams SET video_url = NULL, video_path = NULL WHERE id = team_id`.
3. Chỉ sau khi database xác nhận cập nhật thành công, gọi lệnh xóa file trên Storage (nếu lỗi ghi vào `storage_cleanup_jobs`).
4. Khi `teams.video_url IS NULL`, trigger `trg_enforce_team_video` và hàm `submit_vote` lập tức từ chối mọi thao tác chấm mới hoặc sửa điểm của khán giả đối với đội thi này.

---

## 4. HỢP ĐỒNG CHẤM ĐIỂM (PARTICIPANT VOTING CONTRACTS)

### 4.1. Lấy phiếu chấm hiện tại của người tham gia
- Người tham gia có thể truy vấn phiếu của chính mình:
  ```javascript
  const { data: myVote } = await supabase
    .from('votes')
    .select('*')
    .eq('team_id', team_id)
    .eq('participant_id', currentParticipantId)
    .maybeSingle();
  ```
- **Bảo toàn tính toàn vẹn:** Mỗi người tham gia chỉ có duy nhất 1 bản ghi phiếu cho 1 đội thi (`UNIQUE(participant_id, team_id)`).

---

### 4.2. Gửi mới hoặc Cập nhật phiếu chấm (`submit_vote`)
- **Phương thức RPC:** `supabase.rpc('submit_vote', { p_team_id, p_vocal, p_performance })`
- **Tối ưu hóa Khóa Chia Sẻ Đồng Thời (`FOR SHARE`):**
  - Hàm thực hiện: `SELECT is_locked FROM system_settings WHERE id = 1 FOR SHARE`.
  - Khóa `FOR SHARE` cho phép ~300 người tham gia có thể gửi phiếu đồng thời mà không bị lock/queue chặn lẫn nhau, mang lại tốc độ phản hồi tức thì.
  - Khi Admin phát lệnh khóa `lock_voting_system` (`FOR UPDATE`), lệnh khóa sẽ đợi các transaction `FOR SHARE` đang xử lý hoàn tất.
  - Ngay sau khi lệnh khóa commit, mọi transaction đến sau khi acquire được `FOR SHARE` sẽ đọc thấy `is_locked = TRUE` và bị từ chối ngay lập tức.
- **Kiến trúc Ánh xạ Mã lỗi `ERR_VOTING_LOCKED` sang HTTP 403:**
  - Không mặc định PostgREST tự động trả HTTP 403 từ PostgreSQL `RAISE EXCEPTION`.
  - Hàm PL/pgSQL gọi lệnh: `PERFORM set_config('response.status', '403', true);` để thiết lập HTTP status 403.
  - Tầng Client SDK Wrapper / API Gateway chịu trách nhiệm chốt chặn: bắt lỗi `ERR_VOTING_LOCKED` và đảm bảo response trả về client luôn luôn là:
    - **HTTP Status:** `403 Forbidden`
    - **Code:** `ERR_VOTING_LOCKED`
    - **Message:** **“Đã khóa chấm điểm”**
  - **Điều kiện bắt buộc trước khi nghiệm thu:** Bắt buộc phải thực hiện kiểm thử trên instance Supabase mục tiêu để xác minh mã HTTP 403 được truyền tải chính xác đến client.
- **Chống Giả mạo & Cấm ghi trực tiếp:**
  - Client tuyệt đối không truyền `participant_id`. Server tự động trích xuất `v_participant_id` từ `auth.uid()`.
  - Quyền `INSERT, UPDATE, DELETE` trực tiếp trên bảng `votes` bị thu hồi đối với client. Mọi thao tác bắt buộc qua `submit_vote`.
- **Request Payload:**
```json
{
  "p_team_id": "c1f10825-97e3-4f93-a4a5-111111111111",
  "p_vocal": 20,
  "p_performance": 23
}
```
- **Response Success (200 OK):**
```json
{
  "success": true,
  "message": "Phiếu chấm đã được ghi nhận thành công.",
  "data": {
    "vote_id": "8f8a1b2c-0000-0000-0000-111122223333",
    "team_id": "c1f10825-97e3-4f93-a4a5-111111111111",
    "vocal_score": 20,
    "performance_score": 23,
    "total_score": 43
  }
}
```
- **Response Error (403 Forbidden - Hệ thống đã khóa):**
```json
{
  "error": {
    "code": "ERR_VOTING_LOCKED",
    "message": "Đã khóa chấm điểm"
  }
}
```

---

## 5. HỢP ĐỒNG KHÓA CHẤM ĐIỂM VÀ MỞ KHÓA KHẨN CẤP

### 5.1. Kích hoạt Khóa chấm điểm (`lock_voting_system`)
- **Phương thức RPC:** `supabase.rpc('lock_voting_system')`
- **Quyền hạn:** Tài khoản Admin / Super Admin (`auth.jwt() -> 'app_metadata' ->> 'role' IN ('admin', 'super_admin')`).
- **Khóa độc quyền dòng (`FOR UPDATE`):**
  - Khóa dòng `system_settings WHERE id = 1 FOR UPDATE`. Chờ toàn bộ các transaction `submit_vote` đang giữ `FOR SHARE` kết thúc.
  - Cập nhật `is_locked = TRUE` và commit transaction.
- **Response Success (200 OK):**
```json
{
  "success": true,
  "message": "Đã khóa chấm điểm",
  "data": {
    "is_locked": true,
    "locked_at": "2026-11-15T14:30:00Z",
    "locked_by": "e3a1f4b2-0000-0000-0000-111122223333"
  }
}
```

---

### 5.2. Mở khóa khẩn cấp do sự cố (`emergency_unlock_system`)
- **Phương thức RPC:** `supabase.rpc('emergency_unlock_system', { p_reason })`
- **Quyền hạn:** **Chỉ tài khoản Super Admin** (`auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'`).
- **Request Payload:**
```json
{
  "p_reason": "Sự cố mất điện hội trường tại tiết mục 03, mở khóa bổ sung 10 phút cho khán giả chấm điểm lại."
}
```
- **Response Success (200 OK - Khớp 100% với Data Model):**
```json
{
  "success": true,
  "message": "Đã mở khóa khẩn cấp thành công.",
  "data": {
    "is_locked": false,
    "unlocked_at": "2026-11-15T14:45:00Z",
    "unlocked_by": "e3a1f4b2-0000-0000-0000-111122223333",
    "reason": "Sự cố mất điện hội trường tại tiết mục 03, mở khóa bổ sung 10 phút cho khán giả chấm điểm lại."
  }
}
```

---

## 6. MÃ LỖI VÀ CHUẨN ĐỊNH DẠNG LỖI TOÀN HỆ THỐNG

### 6.1. Kiến Trúc Ánh Xạ Lỗi Đa Tầng (Multi-Layer Error Mapping Architecture)
1. **Tầng Cơ sở Dữ liệu (PL/pgSQL):**
   - Sử dụng lệnh `PERFORM set_config('response.status', '<HTTP_STATUS>', true);` trước câu lệnh `RAISE EXCEPTION` để định hướng mã trạng thái cho PostgREST.
   - Thiết lập tường minh `USING MESSAGE = '<Thông điệp tiếng Việt>', DETAIL = '<MÃ_LỖI_NỘI_BỘ>'`.
2. **Tầng Client SDK Wrapper / Gateway:**
   - Chịu trách nhiệm bảo vệ cuối cùng (Defensive Mapping): Nếu PostgREST trả mã trạng thái mặc định (400 hoặc 500), tầng Client SDK tự động phân tích `error.message` hoặc `error.details` để chuẩn hóa response trả về giao diện đúng chuẩn HTTP 403 Forbidden và payload JSON thống nhất.
3. **Điều Kiện Bắt Buộc Trước Khi Nghiệm Thu (Pre-acceptance Verification):**
   - Phải thực thi kịch bản kiểm thử gọi `submit_vote` khi hệ thống đã khóa trên chính môi trường Supabase của dự án để thẩm định xem PostgREST có tự động ánh xạ thành HTTP 403 hay cần bổ sung lớp xử lý tại SDK Wrapper.

### 6.2. Bảng Danh Mục Mã Lỗi Toàn Hệ Thống

| HTTP Status | Mã lỗi nội bộ | Thông điệp hiển thị chính xác | Tình huống kích hoạt |
|---|---|---|---|
| `403 Forbidden` | `ERR_VOTING_LOCKED` | **“Đã khóa chấm điểm”** | Người dùng gửi mới hoặc sửa điểm khi hệ thống đã khóa |
| `403 Forbidden` | `ERR_ACCOUNT_DEACTIVATED` | **“Tài khoản của bạn đã bị vô hiệu hóa bởi Ban tổ chức.”** | Người tham gia bị vô hiệu hóa cố đăng nhập hoặc chấm điểm |
| `400 Bad Request` | `ERR_NO_VIDEO` | **“Đội thi chưa có video dự thi, không thể chấm điểm.”** | Cố tình chấm điểm hoặc sửa điểm cho đội có `video_url IS NULL` |
| `400 Bad Request` | `ERR_INVALID_SCORE_RANGE` | **“Điểm chấm phải là số nguyên từ 1 đến 25.”** | Nhập điểm = 0, điểm < 1, điểm > 25 hoặc số thập phân |
| `401 Unauthorized` | `ERR_INVALID_CREDENTIALS` | **“Tên đăng nhập hoặc mật khẩu không chính xác.”** | Đăng nhập sai username hoặc password |
| `403 Forbidden` | `ERR_UNAUTHORIZED_ACCESS` | **“Bạn không có quyền thực hiện thao tác này.”** | Người tham gia cố gọi hàm dành riêng cho Admin |
| `403 Forbidden` | `ERR_FORBIDDEN` | **“Chỉ quản trị hệ thống đặc biệt mới có quyền mở khóa.”** | Admin thông thường cố tình gọi hàm của Super Admin |
| `400 Bad Request` | `ERR_UNLOCK_REASON_REQUIRED` | **“Bắt buộc phải cung cấp lý do mở khóa hợp lệ.”** | Mở khóa khẩn cấp nhưng để trống lý do (< 5 ký tự) |
| `400 Bad Request` | `ERR_REASON_REQUIRED` | **“Bắt buộc phải cung cấp lý do thay đổi trạng thái tài khoản.”** | Vô hiệu hóa tài khoản nhưng không nhập lý do |
| `400 Bad Request` | `ERR_INVALID_FILE_STRUCTURE` | **“Cấu trúc file Excel không hợp lệ. File phải chứa các cột: STT, username, password, name.”** | Tải lên file Excel sai tên cột |

---

## 7. ĐỒNG BỘ REALTIME

- **Kênh `public:system_settings`:**
  - Lắng nghe sự kiện `UPDATE` trên bảng `system_settings`.
  - Khi `is_locked` chuyển sang `TRUE`, giao diện người dùng lập tức vô hiệu hóa các nút chấm điểm và hiển thị thông báo **“Đã khóa chấm điểm”**.
- **Kênh `public:teams`:**
  - Lắng nghe thay đổi video (`video_url`), điểm thưởng đồng đội (`teammate_bonus`), ngôi sao may mắn (`lucky_star`) để cập nhật giao diện Admin và khán giả tức thời.
- **Kênh `public:votes`:**
  - Lắng nghe sự kiện thay đổi phiếu chấm để kích hoạt gọi lại `get_team_board()` cập nhật điểm trung bình khán giả tức thời.

---

## 8. KỊCH BẢN KIỂM THỬ XÁC MINH TOÀN VẸN DỮ LIỆU & CONCURRENCY V1.5.4

### 8.1. Kiểm thử Concurrency: 300 Người gửi phiếu đồng thời trong lúc Admin khóa hệ thống

#### A. Mục tiêu & Nguyên tắc thẩm định khoa học
1. **Phân định rõ ràng giữa Commit Giao dịch Database và Thời điểm Client nhận HTTP Response:**
   - Trong môi trường mạng phân tán, một transaction có thể đã commit thành công vào database *trước* khi Admin commit khóa, nhưng client nhận HTTP response 200 OK *sau* thời điểm Admin nhận response.
   - **Tuyệt đối không dùng thời điểm client nhận HTTP response để phán đoán thứ tự commit giao dịch.**
2. **Xử lý đặc thù của UPSERT & Dữ liệu sẵn có trong Database:**
   - Hàm `submit_vote` sử dụng cơ chế `UPSERT` (`INSERT ... ON CONFLICT (participant_id, team_id) DO UPDATE`).
   - Do đó, một request thành công có thể tạo mới một dòng (`INSERT`) hoặc cập nhật điểm trên dòng đã có (`UPDATE`).
   - Bảng `votes` tại thời điểm kiểm thử có thể đã chứa sẵn dữ liệu phiếu của các đội khác hoặc các phiếu chấm thử nghiệm trước đó.
   - **Vì vậy, tuyệt đối không được mặc định số dòng trong snapshot database bằng số request thành công, và không suy ra số request thành công chỉ từ số dòng trong snapshot.**
3. **Cơ chế thẩm định hai lớp & Ánh xạ mã lỗi HTTP 403:**
   - *Lớp 1 (Request-Level Audit):* Ghi nhận chi tiết kết quả từng request độc lập (HTTP Status, mã lỗi, và `vote_id` trả về đối với request thành công). Mọi request bị từ chối sau khóa bắt buộc nhận HTTP 403 Forbidden, code `ERR_VOTING_LOCKED`, message **“Đã khóa chấm điểm”**.
   - *Lớp 2 (Database-Level Deep Snapshot):* Chụp toàn bộ bảng `votes` ngay sau khi Admin khóa thành công ($S_{lock}$) và đối chiếu field-by-field với snapshot sau khi 300 request kết thúc ($S_{final}$). Đồng thời cross-check từng `vote_id` thành công vào $S_{lock}$.
4. **Điều kiện bắt buộc trước khi nghiệm thu (Pre-acceptance Test Condition):**
   - Bắt buộc kiểm thử thực tế trên instance Supabase mục tiêu để xác minh rằng mã lỗi `ERR_VOTING_LOCKED` được chuyển tải chính xác thành HTTP 403 Forbidden đến tay client thông qua cơ chế `PERFORM set_config('response.status', '403', true)` hoặc qua lớp Client SDK Wrapper.

#### B. Điều kiện chuẩn bị môi trường kiểm thử (Prerequisites & Test Setup)
Trước khi phát lệnh kiểm thử tại thời điểm $T_0$, môi trường phải thỏa mãn 100% các điều kiện:
1. **Tài khoản người tham gia:** Đã khởi tạo 300 tài khoản participant riêng biệt, tất cả đều đang ở trạng thái hoạt động (`is_active = TRUE`).
2. **Xác thực:** Cả 300 tài khoản đều đã đăng nhập thành công và sở hữu JWT access token hợp lệ sẵn sàng gửi request.
3. **Đội thi hợp lệ:** Đội thi được chọn làm mục tiêu kiểm thử (`target_team_id`) bắt buộc đã có video dự thi hợp lệ (`video_url IS NOT NULL`).
4. **Dữ liệu chấm điểm hợp lệ:** 300 requests đều mang điểm số nguyên hợp lệ trong thang điểm 1 đến 25 (`p_vocal`, `p_performance`).
5. **Kiểm soát trạng thái ban đầu của phiếu:**
   - **Tùy chọn A (Môi trường sạch):** Xác nhận trước $T_0$, chưa có bất kỳ bản ghi phiếu nào trong bảng `votes` của 300 participants này đối với `target_team_id`.
   - **Tùy chọn B (Môi trường có sẵn phiếu):** Nếu đã có phiếu tồn tại từ trước, bắt buộc chụp snapshot ban đầu $S_{initial}$ của bảng `votes` để ghi nhận chính xác trạng thái điểm ban đầu trước $T_0$.
6. **Trạng thái hệ thống:** Khởi đầu với `system_settings.is_locked = FALSE`.

#### C. Quy trình thực hiện chi tiết
1. **Kích hoạt tải đồng thời:**
   - Tại thời điểm $T_0$, 300 virtual users (VUs) đồng loạt phát lệnh gọi RPC `submit_vote(target_team_id, vocal, perf)`.
   - Tại thời điểm $T_0 + 20ms$ (khi các transaction đang trong quá trình thực thi), Admin gọi RPC `lock_voting_system()`.
2. **Chụp Deep Snapshot ngay khi Admin Khóa Thành công:**
   - Ngay tại thời điểm RPC `lock_voting_system()` trả về HTTP 200 OK thành công trên kết nối của Admin, thực hiện truy vấn snapshot toàn bộ bảng `votes`:
     ```sql
     -- Snapshot S_lock
     SELECT id, participant_id, team_id, vocal_score, performance_score, created_at, updated_at 
     FROM votes 
     ORDER BY id ASC;
     ```
   - Lưu trữ toàn bộ kết quả của snapshot này thành tập hợp $S_{lock}$.
3. **Ghi nhận và thu thập kết quả từng Request:**
   - Chờ toàn bộ 300 kết nối hoàn tất phản hồi.
   - Thu thập và phân loại từng request $i \in [1, 300]$:
     - Ghi nhận `HTTP Status` (200 OK hoặc 403 Forbidden).
     - Với request thành công (200 OK): Lưu lại mã phiếu trả về $\text{vote\_id}_i$, cùng điểm số đã gửi ($\text{vocal}_i, \text{perf}_i$). Giả sử có $m$ requests thành công ($0 \le m \le 300$).
     - Với request thất bại (403 Forbidden): Lưu lại mã lỗi và thông điệp lỗi. Giả sử có $300 - m$ requests thất bại.
4. **Chụp Deep Snapshot Lần Hai:**
   - Ngay sau khi request thứ 300 kết thúc, thực hiện truy vấn snapshot lần thứ hai:
     ```sql
     -- Snapshot S_final
     SELECT id, participant_id, team_id, vocal_score, performance_score, created_at, updated_at 
     FROM votes 
     ORDER BY id ASC;
     ```
   - Lưu trữ toàn bộ kết quả thành tập hợp $S_{final}$.

#### D. Tiêu chí xác minh đối chiếu dữ liệu (Verification Criteria)
1. **Đối chiếu kết quả từng Request độc lập:**
   - Với đúng $m$ requests nhận HTTP 200 OK:
     - Tập hợp các mã phiếu thành công $V_{success} = \{ \text{vote\_id}_1, \dots, \text{vote\_id}_m \}$.
     - **Bắt buộc:** Mọi $\text{vote\_id} \in V_{success}$ phải tồn tại trong snapshot $S_{lock}$.
     - Điểm số `vocal_score` và `performance_score` của dòng tương ứng trong $S_{lock}$ phải khớp chính xác 100% với giá trị mà request đó đã gửi.
   - Với đúng $300 - m$ requests nhận HTTP 403 Forbidden:
     - 100% các request này bắt buộc nhận HTTP status 403 Forbidden.
     - Mã lỗi: `ERR_VOTING_LOCKED`.
     - Thông điệp lỗi hiển thị chính xác: **“Đã khóa chấm điểm”**.
2. **Đối chiếu Deep Snapshot Bất biến ($S_{final} \equiv S_{lock}$):**
   - Số lượng bản ghi: $|S_{final}| = |S_{lock}|$.
   - **Đối chiếu chi tiết từng trường của từng dòng dữ liệu (Field-by-Field):**
     - `id`: Không có bất kỳ ID phiếu nào xuất hiện mới trong $S_{final}$ so với $S_{lock}$.
     - `participant_id`, `team_id`: Cặp định danh giữ nguyên vẹn.
     - `vocal_score`, `performance_score`: Không có bất kỳ điểm số nào bị thay đổi giữa $S_{lock}$ và $S_{final}$.
     - `created_at`, `updated_at`: Không có bất kỳ timestamp nào bị thay đổi.
   - **Kết luận:** Chứng minh tuyệt đối không có bất kỳ thao tác chèn mới (`INSERT`) hay sửa đổi (`UPDATE`) nào có thể lọt vào database sau khi transaction khóa của Admin commit.
3. **Xác minh không Deadlock:**
   - 100% 300 kết nối đều nhận phản hồi rõ ràng (thành công 200 OK hoặc lỗi 403 `ERR_VOTING_LOCKED`). Không phát sinh lỗi cơ sở dữ liệu `deadlock detected` hay `statement timeout`.

### 8.2. Kiểm thử Bảo vệ Quyền Riêng Tư Người Tham Gia
- Gửi truy vấn từ token của khán giả thông thường tới REST endpoint `/rest/v1/participants`: Chỉ đọc được các trường qua View công khai `view_participants_public` (`id, username, name, is_active`).
- Xác nhận không có API nào để lộ `auth_user_id` của khán giả khác ra ngoài client.
