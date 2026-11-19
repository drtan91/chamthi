# DỰ ÁN BÌNH CHỌN VÀ CHẤM ĐIỂM HỘI THI HÁT
## CONSTITUTION – NGUYÊN TẮC BẤT BIẾN VÀ ĐIỀU LỆ THIẾT KẾ

> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Trạng thái:** Hiệu lực (Active & Locked)  
> **Đối tượng áp dụng:** Toàn bộ kiến trúc sư, lập trình viên, tester và quy trình CI/CD của dự án.

---

### 1. MỤC ĐÍCH VÀ PHẠM VI
Tài liệu này xác định các quy tắc cốt lõi, nguyên tắc bất biến (invariants) và giới hạn thiết kế kỹ thuật của hệ thống Webapp Bình chọn & Chấm điểm Hội thi hát. Mọi tài liệu đặc tả, thiết kế dữ liệu, giao diện và mã nguồn sau này bắt buộc phải tuân thủ tuyệt đối các điều khoản trong tài liệu này mà không có ngoại lệ.

---

### 2. TÁM NGUYÊN TẮC BẤT BIẾN (CORE INVARIANTS)

#### Điều 1: Bất biến cấu trúc bảng điểm (4-Column Invariant)
1. Cả giao diện Quản trị viên (Admin) và Người tham gia (Participant) chỉ hiển thị bảng điểm có **chính xác 4 cột**:
   - Cột 1: **Tên đội thi**
   - Cột 2: **Điểm khán giả**
   - Cột 3: **Điểm thưởng đồng đội**
   - Cột 4: **Ngôi sao may mắn**
2. **Tuyệt đối cấm:**
   - Không được thêm cột thứ 5 (như cột "Tổng điểm", "Xếp hạng", "Hành động" riêng biệt ngoài dòng...).
   - Không được gộp Điểm thưởng đồng đội hoặc Ngôi sao may mắn vào Điểm khán giả.
   - Điểm khán giả là giá trị độc lập, phản ánh thuần túy đánh giá từ người tham gia.

#### Điều 2: Bất biến thứ tự hiển thị (Deterministic Creation Order)
1. Danh sách đội thi trên mọi thiết bị và giao diện luôn giữ nguyên **thứ tự tạo ban đầu của Admin** (dựa vào trường `display_order` cố định tăng dần).
2. **Tuyệt đối cấm:**
   - Không tự động sắp xếp theo Điểm khán giả (từ cao xuống thấp hoặc ngược lại).
   - Không tự động sắp xếp theo Điểm thưởng hay Ngôi sao may mắn.
   - Không làm thay đổi vị trí dòng của các đội khi điểm số được cập nhật theo thời gian thực.

#### Điều 3: Bất biến giao diện Admin màn hình đơn (Single-Screen Admin Invariant)
1. Giao diện Admin chỉ có **một màn hình chính duy nhất**.
2. **Tuyệt đối cấm:**
   - Không chia thành 2 tab (ví dụ: Tab 1 Quản lý đội, Tab 2 Quản lý điểm như bản thiết kế cũ).
   - Tất cả thông tin tổng quan, danh sách 4 cột và nút thao tác Khóa chấm điểm phải nằm trên cùng một luồng giao diện màn hình chính (các chi tiết chỉnh sửa đội được mở qua cửa sổ Modal).

#### Điều 4: Bất biến quy tắc tính điểm trung bình và bảng điểm tổng hợp (Average Score & Secure Aggregation Invariant)
1. Điểm khán giả tính bằng trung bình cộng tổng điểm các phiếu hợp lệ hiện hành:
   $$\text{Điểm khán giả} = \frac{\sum (\text{Giọng hát}_i + \text{Khuấy động}_i)}{N}$$
2. **Quy tắc làm tròn và hiển thị:**
   - Hiển thị **tối đa 2 chữ số thập phân**.
   - Quy tắc làm tròn số học phải thống nhất tuyệt đối giữa Database (`ROUND(..., 2)`) và giao diện Frontend.
   - Khi một đội chưa có phiếu chấm hợp lệ nào ($N = 0$), cột Điểm khán giả bắt buộc hiển thị chính xác chuỗi: **“Chưa có điểm”**. Tuyệt đối không hiển thị `0`, `0.00` hoặc để trống.
3. **Bảo mật Bảng điểm tổng hợp (Secure Aggregation):**
   - Bảng điểm toàn thể được tổng hợp an toàn qua hàm `SECURITY DEFINER` `get_team_board()` (với `SET search_path = public, pg_temp`), đảm bảo mọi người xem đều thấy đúng trung bình điểm cộng đồng mà không bị RLS làm sai lệch, tối ưu hóa băng thông mạng cho thiết bị di động.

#### Điều 5: Bất biến quy trình video và điều kiện chấm điểm (Safe Video & Two-Way Trigger Invariant)
1. Mỗi đội thi chỉ có **tối đa một video dự thi hiện hành**.
2. **Quy trình thay thế 6 bước an toàn (Safe Video Replacement Workflow):**
   - Bước 1: Upload file video mới với đường dẫn định danh duy nhất mới vào Storage.
   - Bước 2: Nếu upload thất bại, dừng ngay và giữ nguyên video cũ.
   - Bước 3: Nếu upload thành công, cập nhật database `teams.video_url` và `video_path`.
   - Bước 4: Nếu cập nhật database thất bại, giữ nguyên video cũ và đưa file mới upload vào bảng `storage_cleanup_jobs` với lý do `ROLLBACK_NEW_VIDEO`.
   - Bước 5: Cập nhật database thành công mới tiến hành xóa file video cũ trên Storage.
   - Bước 6: Nếu xóa video cũ thất bại, video mới vẫn chạy bình thường; đưa công việc xóa lại vào `storage_cleanup_jobs` với lý do `REPLACE_VIDEO` để retry sau.
3. **Trigger bảo vệ 2 chiều (INSERT & UPDATE):**
   - Người tham gia chỉ được gửi mới hoặc chỉnh sửa phiếu khi đội đã có video hiện hành (`video_url IS NOT NULL`).
   - Nếu Admin xóa video của đội (`video_url = NULL`), hệ thống lập tức chặn người tham gia gửi phiếu mới lẫn cập nhật phiếu cũ cho đội đó.

#### Điều 6: Bất biến khóa chấm điểm tuần tự hóa một chiều & Kiến trúc Ánh xạ Lỗi (Serialized Lock & Error Mapping Invariant)
1. Thao tác **KHÓA CHẤM ĐIỂM** là thao tác **một chiều** trên giao diện Admin thông thường:
   - Phải có hộp thoại xác nhận trước khi thực hiện. Không cung cấp nút mở khóa thông thường cho Admin sự kiện.
   - **Tối ưu hóa khóa dòng đồng thời:**
     - `submit_vote` sử dụng khóa chia sẻ dòng: `SELECT is_locked FROM system_settings WHERE id = 1 FOR SHARE;` cho phép 300 người chấm cùng lúc không bị nghẽn.
     - `lock_voting_system` sử dụng khóa độc quyền dòng: `SELECT is_locked FROM system_settings WHERE id = 1 FOR UPDATE;` chờ tất cả `submit_vote` đang xử lý hoàn tất, sau đó cập nhật `is_locked = TRUE`.
     - Trigger `trg_enforce_voting_lock` sử dụng `FOR SHARE` bảo vệ đồng thời cả `INSERT` và `UPDATE`.
   - **Kiến trúc ánh xạ lỗi sang HTTP 403:**
     - Database PL/pgSQL gọi `PERFORM set_config('response.status', '403', true);` kèm `RAISE EXCEPTION 'ERR_VOTING_LOCKED' USING MESSAGE = 'Đã khóa chấm điểm', DETAIL = 'ERR_VOTING_LOCKED';`.
     - Tầng Client SDK Wrapper / Gateway chịu trách nhiệm chốt chặn chuẩn hóa response đến tay client: HTTP Status `403 Forbidden`, code `ERR_VOTING_LOCKED`, message **“Đã khóa chấm điểm”**.
     - Bắt buộc kiểm thử trên Supabase mục tiêu trước khi nghiệm thu.
2. **Xử lý sự cố mở khóa đặc biệt (Emergency Unlock):**
   - Chỉ tài khoản có **quyền Super Admin** được xác thực từ `auth.jwt() -> 'app_metadata' ->> 'role' = 'super_admin'` mới được phép thực hiện mở khóa trong tình huống sự cố bất khả kháng.
   - Mọi lần mở khóa bắt buộc phải ghi nhật ký hệ thống (`audit_logs`) gồm: **Người thực hiện, Thời gian mở khóa, và Lý do mở khóa (Reason)**.

#### Điều 7: Bất biến định danh, xác thực và nhập danh sách từ Excel (Participant Identity & Import Invariant)
1. **Phạm vi phục vụ một lần & Nhập từ Excel (.xlsx):**
   - Ứng dụng phục vụ duy nhất một kỳ hội thi (sử dụng một lần).
   - Admin nạp danh sách khoảng 300 người tham gia qua file Excel với đúng 4 cột: `STT`, `username`, `password`, `name`.
   - Không yêu cầu email hoặc số điện thoại thật của participant.
   - **Mật khẩu khởi tạo cố định là `123` cho tất cả participant**, không cho phép từng dòng tự đặt mật khẩu riêng; không yêu cầu đổi mật khẩu lần đầu.
2. **Cơ chế ánh xạ nội bộ & Kiểm thử tương thích Auth:**
   - Người tham gia **chỉ nhập username và password 123**.
   - Backend ánh xạ ngầm sang email nội bộ qua domain cấu hình `AUTH_INTERNAL_DOMAIN`. Không tự tiện bịa domain thương hiệu khi chưa có sự xác nhận của người dùng.
   - Bắt buộc chạy kịch bản kiểm thử tạo và đăng nhập tài khoản mẫu trên môi trường Supabase Auth mục tiêu trước khi triển khai chính thức.
   - **Tắt hoàn toàn tính năng tự đăng ký (Public Signup Disabled)**; chỉ Admin API mới được phép tạo tài khoản.
   - Mỗi tài khoản Supabase Auth map 1-1 với đúng 1 bản ghi `participants` (`auth_user_id`).
3. **Xử lý tài khoản an toàn ở Backend & Dọn dẹp tài khoản mồ côi:**
   - Toàn bộ thao tác tạo tài khoản Supabase Auth thực hiện độc quyền qua **Supabase Auth Admin API tại Backend / Edge Function**.
   - **Tuyệt đối cấm:** Không để lộ Service Role Key ở Frontend trong bất kỳ tình huống nào.
   - Tuyệt đối không lưu trữ mật khẩu dạng văn bản thô (plaintext) trong database hoặc log hệ thống/file báo cáo.
   - **Chống tài khoản mồ côi:** Nếu tạo Supabase Auth User thành công nhưng lưu vào `participants` thất bại, backend phải rollback gọi xóa ngay tài khoản Auth vừa tạo.
4. **Tính lũy thừa (Idempotency) khi nạp lại file:**
   - Khi Admin tải lại file Excel, hệ thống bỏ qua các username đã tồn tại, tuyệt đối không tạo tài khoản trùng lặp và không crash; báo cáo kết quả chi tiết từng dòng.
5. **Thống nhất kiểm tra Role từ `app_metadata` & Quyền riêng tư:**
   - Quyền Admin/Super Admin bắt buộc đọc từ: `auth.jwt() -> 'app_metadata' ->> 'role'`. Cấm đọc từ `user_metadata` hoặc `auth.jwt() ->> 'role'`.
   - Không cần che giấu phiếu cá nhân của nhau. Tuy nhiên, bảng `participants` bảo vệ tuyệt đối không để lộ `auth_user_id` qua view công khai `view_participants_public` chỉ gồm 4 trường (`id, username, name, is_active`).
   - Client tuyệt đối không truyền `participant_id` khi ghi điểm; Backend/Database tự động suy ra `participant_id` từ `auth.uid()`, triệt tiêu 100% nguy cơ giả mạo `participant_id`.
   - Cấm Client ghi trực tiếp vào bảng `votes` qua REST API; mọi thao tác chấm điểm bắt buộc qua RPC `submit_vote`.
6. **Cơ chế vô hiệu hóa tài khoản:**
   - `deactivate_participant`: Xác thực quyền `admin` hoặc `super_admin` bên trong hàm, có ghi log kèm lý do.
   - `deactivate_all_participants`: Dành riêng cho `super_admin` sau khi kết thúc hội thi, có ghi log kèm lý do.
   - Mọi hàm `SECURITY DEFINER` bắt buộc có `SET search_path = public, pg_temp;`.
7. **Không dùng mã phần cứng:** Tuyệt đối không sử dụng IMEI hoặc mã phần cứng thiết bị làm phương thức định danh bắt buộc.

#### Điều 8: Bất biến phiếu chấm duy nhất và thang điểm chuẩn (Score Range & Single-Vote Invariant)
1. Mỗi người tham gia chỉ sở hữu **duy nhất một phiếu hiện hành cho mỗi đội thi**, bảo vệ bằng ràng buộc Database `UNIQUE(participant_id, team_id)`.
2. Chấm lại sẽ cập nhật phiếu cũ (UPDATE qua mệnh đề UPSERT `ON CONFLICT DO UPDATE`), không tạo bản ghi mới.
3. Điểm Giọng hát: Số nguyên từ **1 đến 25**.
4. Điểm Khuấy động sân khấu: Số nguyên từ **1 đến 25**.
5. Cấm số 0, cấm số âm, cấm số thập phân, cấm điểm > 25. Tổng điểm 1 phiếu nằm trong khoảng **2 đến 50**.
6. Điểm thưởng đồng đội chỉ nhận `0` hoặc `+3`. Ngôi sao may mắn chỉ nhận `+5` hoặc `-5`.

---

### 3. CHUẨN CÔNG NGHỆ VÀ MỤC TIÊU VẬN HÀNH
- **Frontend:** React 18+ với TypeScript, Vite làm build tool.
- **Styling:** Tailwind CSS (thiết kế Mobile-First, responsive mượt mà trên iPhone/Android/Desktop).
- **Trải nghiệm ứng dụng:** Progressive Web App (PWA) có khả năng cài đặt lên màn hình chính thiết bị.
- **Backend & Database:** Supabase (PostgreSQL, Supabase Auth, Supabase Storage, Row Level Security, Realtime).
- **Hạ tầng & Triển khai:** GitHub (quản lý mã nguồn), Vercel (Hosting Frontend).
- **Tải mục tiêu:** Hỗ trợ tối thiểu 300 người dùng đồng thời trong sự kiện trực tiếp mà không nghẽn tài nguyên.
