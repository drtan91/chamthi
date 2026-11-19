# FUNCTIONAL & TECHNICAL SPECIFICATION (SPEC)
## HỆ THỐNG WEBAPP BÌNH CHỌN VÀ CHẤM ĐIỂM HỘI THI HÁT

> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Trạng thái:** Sẵn sàng Triển khai (Ready for Implementation)  
> **Hệ thống mục tiêu:** Mobile Web, PWA (iOS Safari / Android Chrome) & Desktop Browser

---

## 1. MỤC TIÊU VÀ TỔNG QUAN

Xây dựng ứng dụng web phục vụ bình chọn và chấm điểm các đội thi trong một kỳ hội diễn văn nghệ (Single-Event Lifecycle) với quy mô phục vụ khoảng 300 người tham gia đồng thời.

Hệ thống bảo đảm:
- Trải nghiệm mượt mà, thân thiện trên điện thoại iPhone, Android và máy tính để bàn.
- Khả năng cài đặt như ứng dụng web cấp tiến (Progressive Web App - PWA).
- Quản lý danh sách đội thi, video dự thi hiện hành, điểm thưởng đồng đội và ngôi sao may mắn.
- Cho phép khán giả xem video dự thi và thực hiện chấm điểm theo 2 tiêu chí.
- Tự động tính toán và làm tròn điểm trung bình khán giả (tối đa 2 chữ số thập phân, đồng bộ số học giữa cơ sở dữ liệu và giao diện).
- Cơ chế khóa chấm điểm một chiều chống tranh chấp, bảo vệ toàn vẹn tuyệt đối ở tầng cơ sở dữ liệu.
- Lưu trữ và xử lý dữ liệu nhất quán trên nền tảng Supabase (Auth, PostgreSQL, Storage, Realtime).

---

## 2. KIẾN TRÚC VÀ CÔNG NGHỆ CHUẨN

- **Frontend Core:** React 18+ với TypeScript, khởi tạo bằng Vite.
- **Styling:** Tailwind CSS (thiết kế Mobile-First, tối ưu cho màn hình cảm ứng di động).
- **PWA Capabilities:** Web App Manifest, Service Worker lưu cache tài nguyên tĩnh, chạy độc lập (Standalone Display Mode).
- **Backend & Cloud Services (Supabase):**
  - **Supabase Auth:** Quản lý tài khoản Admin/Super Admin và người tham gia (Participant).
  - **PostgreSQL Engine:** Lưu trữ dữ liệu quan hệ, thực thi Stored Procedures (RPC), Database Triggers, Row Level Security (RLS).
  - **Supabase Storage:** Lưu trữ và phân phối video dự thi qua CDN (Bucket: `team-videos`).
  - **Supabase Realtime:** Đồng bộ trạng thái khóa chấm điểm và điểm số tức thời qua WebSocket.
  - **Supabase Edge Functions:** Xử lý logic nhạy cảm phía máy chủ (`import-participants`, `participant-login`).
- **Hosting & CI/CD:** Vercel (Edge Network Hosting), GitHub (Quản lý mã nguồn).

---

## 3. ĐẶC TẢ GIAO DIỆN VÀ TÍNH NĂNG ADMIN

Giao diện Quản trị viên chỉ có **một màn hình chính duy nhất (Single-Screen Dashboard)**, loại bỏ hoàn toàn thiết kế 2 tab cũ.

### 3.1. Bảng quản lý điểm đội thi
Bảng hiển thị cố định **chính xác 4 cột**:
1. **Tên đội thi**: Tên hiển thị của đội.
2. **Điểm khán giả**: Điểm trung bình cộng các phiếu hợp lệ hiện hành, làm tròn tối đa 2 chữ số thập phân (hoặc hiển thị `"Chưa có điểm"` nếu $N = 0$).
3. **Điểm thưởng đồng đội**: Giá trị nhận `0` hoặc `+3`.
4. **Ngôi sao may mắn**: Giá trị nhận `+5` hoặc `-5`.

**Quy tắc thứ tự hiển thị (Deterministic Order):**
- Thứ tự các đội hiển thị cố định 100% theo thứ tự Admin tạo ban đầu (`display_order` tăng dần).
- Tuyệt đối không tự động sắp xếp lại theo điểm khán giả, điểm thưởng hoặc ngôi sao may mắn.
- Vị trí các dòng giữ nguyên không đổi khi điểm số được cập nhật theo thời gian thực.

### 3.2. Quản lý chi tiết đội thi (Modal)
Khi Admin bấm vào một dòng đội thi, mở cửa sổ Modal cho phép:
- Chỉnh sửa tên đội thi.
- Tải lên video dự thi đầu tiên.
- Quy trình thay thế video an toàn 6 bước.
- Xóa video hoàn toàn.
- Thiết lập Điểm thưởng đồng đội: Chỉ được chọn `0` hoặc `+3`.
- Thiết lập Ngôi sao may mắn: Chỉ được chọn `+5` hoặc `-5`.

### 3.3. Quy trình Thay thế Video An toàn & Xóa Video (Safe Video Workflow)
- **Mỗi đội chỉ có tối đa một video hiện hành.**
- **Quy trình 6 bước thay thế video an toàn:**
  1. Upload video mới lên Supabase Storage với tên định danh duy nhất mới.
  2. Nếu upload thất bại: dừng thao tác ngay, giữ nguyên video cũ và URL cũ trong database.
  3. Nếu upload thành công: cập nhật database `teams.video_url` và `video_path`.
  4. Nếu cập nhật database thất bại: giữ nguyên video cũ cho đội thi, xóa file mới vừa upload hoặc ghi nhận vào bảng `storage_cleanup_jobs` với lý do `ROLLBACK_NEW_VIDEO`.
  5. Cập nhật database thành công mới tiến hành gọi API xóa file video cũ trên Storage.
  6. Nếu xóa video cũ trên Storage thất bại: video mới vẫn hoạt động bình thường trên hệ thống; ghi nhận công việc xóa lại vào `storage_cleanup_jobs` (`reason = 'REPLACE_VIDEO'`) để tiến trình nền tự động dọn dẹp sau.
- **Thao tác xóa video hoàn toàn:**
  - Admin bấm xác nhận trên hộp thoại cảnh báo.
  - Cập nhật database `teams.video_url = NULL, video_path = NULL`.
  - Gọi API xóa file trên Storage (nếu lỗi ghi vào `storage_cleanup_jobs`).
  - Khi đội chưa có video, database từ chối mọi yêu cầu chấm hoặc sửa điểm của khán giả.

### 3.4. Tính năng Khóa chấm điểm (Một chiều trên giao diện thông thường)
- Nút bấm lớn đặt tại chân màn hình Admin: **"KHÓA CHẤM ĐIỂM"**.
- Quy trình:
  1. Admin bấm nút: Hiển thị hộp thoại xác nhận.
  2. Khi Admin xác nhận:
     - Gọi RPC `lock_voting_system()`.
     - Database thực hiện khóa dòng `system_settings WHERE id = 1 FOR UPDATE`. Chờ toàn bộ các transaction `submit_vote` đang giữ `FOR SHARE` kết thúc.
     - Cập nhật `is_locked = TRUE, locked_at = NOW(), locked_by = auth.uid()`.
     - Broadcast tín hiệu khóa qua Supabase Realtime đến tất cả client.
     - Nút chuyển thành nhãn trạng thái: **"Đã khóa chấm điểm"** và bị vô hiệu hóa hoàn toàn.
  3. **Quy tắc một chiều:** Không cung cấp nút mở khóa thông thường cho Admin sự kiện trên giao diện.
  4. **Cơ chế mở khóa khẩn cấp do sự cố (Emergency Unlock):**
     - Chỉ được thực hiện bởi tài khoản có quyền Super Admin (`auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'`) thông qua RPC `emergency_unlock_system(p_reason)`.
     - Bắt buộc phải nhập và lưu trữ: Người thực hiện, Thời gian mở khóa, Lý do mở khóa (Reason) vào bảng `audit_logs`.

### 3.5. Nhập danh sách người tham gia từ file Excel (.xlsx) & Vô hiệu hóa tài khoản
1. **Cấu trúc tệp Excel chuẩn:**
   - Cột 1: `STT` - Số thứ tự dòng.
   - Cột 2: `username` - Tên đăng nhập (Bắt buộc, duy nhất).
   - Cột 3: `password` - Mật khẩu khởi tạo (Hệ thống luôn gán cố định `123`, không yêu cầu người dùng đổi mật khẩu).
   - Cột 4: `name` - Họ và tên hiển thị của người tham gia.
2. **Quy trình xử lý an toàn tại Backend Edge Function (`import-participants`):**
   - Chuẩn hóa `username` thành chữ thường: `lower(trim(username))`.
   - Ánh xạ email nội bộ an toàn: `${clean_username}@${AUTH_INTERNAL_DOMAIN}` (mặc định `participant.internal` theo RFC 6761).
   - Tạo tài khoản Supabase Auth độc quyền tại backend với Service Role Key: `auth.admin.createUser`. Tuyệt đối không để lộ Service Role Key ở frontend.
   - Lưu bản ghi liên kết vào bảng `participants` (`auth_user_id`).
   - Xử lý tài khoản mồ côi: Nếu lưu `participants` lỗi, gọi ngay `auth.admin.deleteUser(auth_user_id)` để rollback.
   - Tính Idempotency khi nạp lại: Bỏ qua các username đã tồn tại, không tạo trùng và không crash app.
   - Zero Plaintext Password: Tuyệt đối không lưu mật khẩu thô trong database, log hay file báo cáo.
3. **Chức năng vô hiệu hóa tài khoản:**
   - `deactivate_participant`: Admin/Super Admin vô hiệu hóa từng tài khoản vi phạm.
   - `deactivate_all_participants`: Super Admin vô hiệu hóa toàn bộ tài khoản sau hội thi.

---

## 4. ĐẶC TẢ GIAO DIỆN VÀ TÍNH NĂNG NGƯỜI THAM GIA

### 4.1. Đăng nhập và Xác thực Người tham gia
- Người tham gia chỉ cần nhập 2 thông tin: `username` và `password 123`.
- Không bắt buộc email hoặc số điện thoại thật.
- Gửi yêu cầu tới Supabase Edge Function `participant-login`. Backend kiểm tra `is_active`, ánh xạ email nội bộ, gọi Supabase Auth và trả về JWT session.

### 4.2. Màn hình chính Người tham gia & Quyền riêng tư
- Bảng điểm 4 cột hiển thị đồng bộ tuyệt đối với Admin.
- Thứ tự đội thi giữ nguyên 100% theo thứ tự Admin tạo ban đầu.
- Quyền riêng tư: Khán giả xem được danh sách khán giả và phiếu chấm nhưng **tuyệt đối không xem được `auth_user_id`** của tài khoản khác (bảo vệ qua View `view_participants_public` chỉ có `id, username, name, is_active`).

### 4.3. Xem video và Chấm điểm (Team Scoring Modal)
- Bấm vào một đội thi để mở Modal chi tiết:
  1. Kiểm tra video: Nếu đội chưa có video, hiển thị thông báo và vô hiệu hóa form chấm điểm. Nếu có video, tải theo cơ chế lazy load, phát mượt trên iOS (`playsinline`) và Android Chrome.
  2. Form chấm 2 tiêu chí:
     - Giọng hát: Số nguyên từ 1 đến 25.
     - Khuấy động sân khấu: Số nguyên từ 1 đến 25.
  3. Gửi điểm: Gọi RPC `submit_vote(p_team_id, p_vocal, p_performance)`.
     - Server tự trích xuất `v_participant_id` từ `auth.uid()`, client không truyền `participant_id`.
     - Sử dụng khóa chia sẻ `FOR SHARE` trên `system_settings WHERE id = 1` tối ưu cho 300 người chấm cùng lúc.
     - Nếu hệ thống đã khóa: Nhận HTTP 403 Forbidden, code `ERR_VOTING_LOCKED`, thông báo chính xác: **“Đã khóa chấm điểm”**.
  4. Chấm lại: Tự động cập nhật (UPDATE qua mệnh đề UPSERT `ON CONFLICT DO UPDATE`) trên bản ghi phiếu cũ của `(participant_id, team_id)`, không tạo bản ghi mới.

---

## 5. QUY TẮC TÍNH TOÁN ĐIỂM TRUNG BÌNH VÀ LÀM TRÒN

1. Điểm khán giả của Đội thi $T$ được tính theo trung bình cộng tổng điểm của các phiếu hợp lệ hiện hành:
   $$\text{Audience Score}_T = \frac{\sum_{i=1}^{N_T} (\text{Vocal Score}_{i,T} + \text{Performance Score}_{i,T})}{N_T}$$
2. Hiển thị tối đa 2 chữ số thập phân, thống nhất làm tròn số học chuẩn `ROUND(..., 2)`.
3. Trường hợp chưa có phiếu ($N_T = 0$): Hiển thị chính xác chuỗi: **“Chưa có điểm”**.
4. Bảng điểm chỉ có đúng 4 cột, không có cột tổng điểm.

---

## 6. ĐẶC TẢ BẢO VỆ DỮ LIỆU, RLS VÀ CHỐNG TRANH CHẤP

1. Bảng `votes`:
   - `SELECT`: Cho phép người dùng authenticated và anon đọc bảng điểm và phiếu.
   - `INSERT, UPDATE, DELETE`: Thu hồi quyền ghi trực tiếp từ Client. Mọi thao tác bắt buộc qua RPC `submit_vote`.
2. Khóa tuần tự hóa:
   - `submit_vote` dùng `FOR SHARE`.
   - `lock_voting_system` dùng `FOR UPDATE`.
   - Trigger `trg_enforce_voting_lock` dùng `FOR SHARE`.
   - Lỗi trả về: HTTP 403 Forbidden, `ERR_VOTING_LOCKED`, **“Đã khóa chấm điểm”**. Bắt buộc chạy kịch bản kiểm thử trên Supabase mục tiêu trước khi nghiệm thu.

---

## 7. QUẢN LÝ VIDEO DỰ THI VÀ PWA

- Storage Bucket: `team-videos`.
- PWA: Hỗ trợ Add to Home Screen, service worker cache tài nguyên tĩnh, chạy standalone.
- Trình phát video: Lazy load, HTML5 `playsinline`.
