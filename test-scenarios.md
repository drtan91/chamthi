# TEST SCENARIOS – KỊCH BẢN KIỂM THỬ CHI TIẾT

> **Tài liệu:** Kịch bản Kiểm thử Toàn diện (Comprehensive Test Scenarios)  
> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Quy mô:** 29 Kịch bản kiểm thử trọng yếu tích hợp các điều kiện biên, kiểm thử đồng thời và bảo mật khắt khe

---

## MA TRẬN 29 KỊCH BẢN KIỂM THỬ

### TC-01: Tạo đội và kiểm tra thứ tự cố định ban đầu
- **Mục tiêu:** Kiểm tra thứ tự hiển thị của các đội tuân thủ đúng thứ tự tạo ban đầu của Admin.
- **Tiền điều kiện:** Admin đã đăng nhập vào hệ thống.
- **Các bước thực hiện:**
  1. Admin lần lượt tạo 3 đội thi: "Đội Alpha", "Đội Beta", "Đội Gamma".
  2. Quan sát thứ tự hiển thị trên màn hình Admin.
  3. Mở tab ẩn danh, đăng nhập bằng tài khoản Người tham gia và quan sát thứ tự.
  4. F5 tải lại trang ở cả 2 tab.
- **Kết quả kỳ vọng:**
  - Danh sách hiển thị chính xác theo thứ tự: 1. Đội Alpha -> 2. Đội Beta -> 3. Đội Gamma.
  - Sau khi F5, thứ tự hoàn toàn không đổi.

---

### TC-02: Thay đổi điểm nhiều lần nhưng thứ tự không đổi
- **Mục tiêu:** Kiểm tra nguyên tắc bất biến không tự động sắp xếp theo điểm số.
- **Tiền điều kiện:** 3 đội Alpha, Beta, Gamma đã được tạo.
- **Các bước thực hiện:**
  1. Cho khán giả chấm Đội Gamma đạt điểm tối đa (50 điểm).
  2. Cho khán giả chấm Đội Alpha đạt điểm thấp (20 điểm).
  3. Admin điều chỉnh điểm thưởng đồng đội của Đội Beta thành +3.
  4. Admin điều chỉnh ngôi sao may mắn của Đội Gamma thành +5.
- **Kết quả kỳ vọng:**
  - Điểm của các đội cập nhật chính xác trên màn hình.
  - Vị trí các dòng trong bảng 4 cột vẫn cố định: 1. Đội Alpha, 2. Đội Beta, 3. Đội Gamma. Tuyệt đối không đảo vị trí Đội Gamma lên đầu bảng.

---

### TC-03: Tải video lần đầu cho đội thi
- **Mục tiêu:** Kiểm tra tính năng tải video dự thi của Admin.
- **Tiền điều kiện:** Đội Alpha đang ở trạng thái chưa có video.
- **Các bước thực hiện:**
  1. Admin mở chi tiết Đội Alpha.
  2. Chọn tệp video định dạng MP4 dung lượng 25MB.
  3. Bấm tải lên và theo dõi thanh tiến trình (Upload Progress Bar).
- **Kết quả kỳ vọng:**
  - Thanh tiến trình chạy mượt từ 0% đến 100%.
  - Tải lên thành công, video được lưu trên Supabase Storage bucket `team-videos`.
  - Trình phát video hiển thị và phát được video vừa tải.
  - Trạng thái Đội Alpha trên bảng chính chuyển thành "Đã có video".

---

### TC-04: Thay thế video an toàn 6 bước và xử lý hàng đợi dọn dẹp Storage
- **Mục tiêu:** Xác minh quy trình 6 bước thay thế video: tải thành công video mới trước, cập nhật DB, nếu lỗi DB thì rollback dọn dẹp file mới qua `storage_cleanup_jobs`, xóa file cũ trên Storage; nếu xóa file cũ lỗi thì ghi nhận job để retry sau.
- **Tiền điều kiện:** Đội Alpha đã có Video 1 đang phát bình thường.
- **Các bước thực hiện:**
  - **Tình huống A (Thay thế thành công):**
    1. Admin chọn tệp Video 2 tải lên.
    2. Video 2 tải lên Storage thành công -> Database cập nhật liên kết Video 2 -> File Video 1 cũ được gỡ bỏ khỏi Storage.
  - **Tình huống B (Lỗi upload video mới):**
    3. Admin chọn Video 3 nhưng ngắt kết nối mạng giữa chừng.
    4. Hệ thống báo lỗi upload; Video 2 cũ vẫn giữ nguyên vẹn trên database và Storage.
  - **Tình huống C (Lỗi cập nhật DB):**
    5. Video 4 upload Storage thành công nhưng mô phỏng lỗi DB.
    6. Database giữ nguyên Video 2; File Video 4 được đưa vào bảng `storage_cleanup_jobs` với lý do `ROLLBACK_NEW_VIDEO`.
  - **Tình huống D (Lỗi xóa video cũ):**
    7. Database cập nhật Video 5 thành công nhưng lệnh xóa Video 2 trên Storage bị lỗi mạng.
    8. Video 5 vẫn chạy bình thường trên webapp; File Video 2 được ghi vào `storage_cleanup_jobs` (`reason = 'REPLACE_VIDEO'`) với trạng thái `pending`.
- **Kết quả kỳ vọng:**
  - Không bao giờ có tình trạng đội thi bị mất video hiện hành hoặc mang nhiều video cùng lúc.

---

### TC-05: Xóa video hoàn toàn và cập nhật trạng thái "Chưa có video"
- **Mục tiêu:** Kiểm tra chức năng xóa video của Admin và phản ứng của hệ thống.
- **Tiền điều kiện:** Đội Alpha đang có video hiện hành.
- **Các bước thực hiện:**
  1. Admin mở chi tiết Đội Alpha, bấm nút "Xóa video".
  2. Hộp thoại xác nhận xuất hiện: *"Bạn có chắc chắn muốn xóa video dự thi của đội này?"*. Admin bấm Xác nhận.
  3. Mở tab của Khán giả xem trạng thái Đội Alpha.
- **Kết quả kỳ vọng:**
  - Database cập nhật `teams.video_url = NULL, video_path = NULL`. File trên Storage bị gỡ bỏ.
  - Trạng thái đội chuyển thành "Chưa có video".
  - Màn hình khán giả hiển thị cảnh báo chưa có video và vô hiệu hóa nút gửi điểm.

---

### TC-06: Ràng buộc điểm thưởng đồng đội chỉ nhận 0 hoặc +3
- **Mục tiêu:** Kiểm tra tính toàn vẹn của dữ liệu Điểm thưởng đồng đội.
- **Các bước thực hiện:**
  1. Admin mở chi tiết Đội Beta.
  2. Kiểm tra bộ chọn Điểm thưởng: chỉ có 2 nút chọn `0` và `+3`.
  3. Dùng Developer Tools / Console thử gửi request cập nhật giá trị khác (ví dụ: `teammate_bonus = 2` hoặc `5`).
- **Kết quả kỳ vọng:**
  - Giao diện không cho phép nhập giá trị tự do.
  - Request trực tiếp bị Database CHECK constraint `CHECK (teammate_bonus IN (0, 3))` từ chối.

---

### TC-07: Ràng buộc ngôi sao may mắn chỉ nhận +5 hoặc -5
- **Mục tiêu:** Kiểm tra tính toàn vẹn của dữ liệu Ngôi sao may mắn.
- **Các bước thực hiện:**
  1. Admin mở chi tiết Đội Gamma.
  2. Kiểm tra bộ chọn Ngôi sao may mắn: chỉ có 2 nút chọn `+5` và `-5`.
  3. Thử gửi request cập nhật giá trị `lucky_star = 0` hoặc `10`.
- **Kết quả kỳ vọng:**
  - Giao diện chỉ cho phép chọn +5 hoặc -5.
  - Request không hợp lệ bị Database CHECK constraint `CHECK (lucky_star IN (5, -5))` từ chối.

---

### TC-08: Người tham gia xem video dự thi
- **Mục tiêu:** Kiểm tra trải nghiệm xem video của khán giả.
- **Tiền điều kiện:** Đội Alpha đã có video.
- **Các bước thực hiện:**
  1. Khán giả bấm vào Đội Alpha để mở Modal chấm điểm.
  2. Bấm phát video.
- **Kết quả kỳ vọng:**
  - Video chỉ bắt đầu tải khi mở modal (Lazy load).
  - Trình phát video phát mượt mà, hỗ trợ thuộc tính `playsinline` trên iOS Safari.

---

### TC-09: Chặn người tham gia chấm điểm khi đội chưa có video
- **Mục tiêu:** Xác minh nguyên tắc: không cho phép chấm điểm khi đội chưa có video.
- **Tiền điều kiện:** Đội Beta chưa có video.
- **Các bước thực hiện:**
  1. Khán giả bấm vào Đội Beta.
  2. Quan sát giao diện Modal.
  3. Dùng console gọi RPC `submit_vote` cho Đội Beta.
- **Kết quả kỳ vọng:**
  - Giao diện hiển thị thông báo rõ: *"Đội thi này hiện chưa có video dự thi. Bạn chưa thể thực hiện chấm điểm."*
  - Form chấm điểm bị vô hiệu hóa; không có nút gửi điểm.
  - Lệnh gọi trực tiếp bị Trigger `trg_enforce_team_video` chặn đứng, trả về mã lỗi `ERR_NO_VIDEO`.

---

### TC-10: Kiểm tra biên điểm số: Giọng hát (1-25) và Khuấy động (1-25)
- **Mục tiêu:** Xác minh thang điểm hợp lệ chỉ chấp nhận số nguyên từ 1 đến 25.
- **Các bước thực hiện:**
  1. Khán giả mở form chấm điểm Đội Alpha.
  2. Thử nhập Giọng hát: `0`, `-1`, `26`, `15.5`, `abc`.
  3. Thử nhập Khuấy động: `0`, `-3`, `30`, `20.2`.
- **Kết quả kỳ vọng:**
  - Form validate tại chỗ, báo đỏ và không cho bấm gửi.
  - Nếu cố tình gửi request qua API: Database CHECK constraint từ chối lưu.

---

### TC-11: Chấm điểm lần đầu và Chấm lại (Cập nhật phiếu cũ qua UPSERT)
- **Mục tiêu:** Kiểm tra cơ chế một người một phiếu và cập nhật phiếu cũ khi chấm lại.
- **Các bước thực hiện:**
  1. Khán giả A chấm Đội Alpha: Giọng hát 20, Khuấy động 20 (Tổng = 40).
  2. Sau đó mở lại Đội Alpha, sửa thành: Giọng hát 24, Khuấy động 25 (Tổng = 49).
  3. Bấm "XÁC NHẬN CHẤM ĐIỂM".
  4. Kiểm tra số lượng bản ghi trong database `SELECT count(*) FROM votes WHERE participant_id = A AND team_id = Alpha`.
- **Kết quả kỳ vọng:**
  - Số bản ghi vẫn là 1 (không tăng lên 2 nhờ mệnh đề `ON CONFLICT DO UPDATE`).
  - Điểm cũ bị ghi đè bởi điểm mới.
  - Điểm khán giả trên bảng tính toán lại theo điểm mới 49.

---

### TC-12: Hai người cùng chấm cho một đội thi
- **Mục tiêu:** Kiểm tra việc tính trung bình cộng giữa 2 phiếu độc lập.
- **Các bước thực hiện:**
  1. Khán giả 1 chấm: Giọng hát 20, Khuấy động 20 (Tổng = 40).
  2. Khán giả 2 chấm: Giọng hát 25, Khuấy động 25 (Tổng = 50).
- **Kết quả kỳ vọng:**
  - Bảng `votes` có 2 bản ghi riêng biệt của 2 `participant_id`.
  - Cột Điểm khán giả của Đội Alpha hiển thị chính xác: $(40 + 50) / 2 = 45$ điểm.

---

### TC-13: Định danh người tham gia và chống tạo nhiều danh tính
- **Mục tiêu:** Kiểm tra nguyên tắc 1 người 1 tài khoản duy nhất, không trùng lặp, không dùng IMEI/phần cứng.
- **Các bước thực hiện:**
  1. Khán giả đăng nhập trên Trình duyệt 1 với username `user001`.
  2. Mở Trình duyệt 2, đăng nhập lại cùng username `user001`.
- **Kết quả kỳ vọng:**
  - Không có username trùng lặp trong DB (`UNIQUE` constraint).
  - Không phát sinh danh tính mới; cả 2 trình duyệt đều liên kết đến duy nhất 1 `participant_id` (`auth_user_id`).
  - Không có yêu cầu quyền truy cập IMEI hay thông tin phần cứng thiết bị.

---

### TC-14: Người tham gia thử sửa phiếu của người khác & Chống giả mạo participant_id
- **Mục tiêu:** Kiểm thử cơ chế chống giả mạo `participant_id` và phân quyền thao tác phiếu.
- **Các bước thực hiện:**
  1. Khán giả 1 thử chạy lệnh UPDATE trực tiếp trên REST API để đổi điểm phiếu của Khán giả 2.
  2. Khán giả 1 thử gọi RPC `submit_vote` với ý định chấm điểm thay cho Khán giả 2.
- **Kết quả kỳ vọng:**
  - Quyền UPDATE trực tiếp trên bảng `votes` bị REVOKE và RLS từ chối (`count: 0`).
  - RPC `submit_vote` không nhận `participant_id` từ client; server tự trích xuất `v_participant_id` từ `auth.uid()`, do đó Khán giả 1 chỉ có thể sửa phiếu của chính mình.

---

### TC-15: Khóa chấm điểm một chiều trên giao diện Admin và Mở khóa khẩn cấp
- **Mục tiêu:** Xác minh khóa là một chiều cho Admin sự kiện; không có nút mở khóa thông thường; mở khóa sự cố chỉ Super Admin có quyền và bắt buộc ghi nhật ký có lý do.
- **Các bước thực hiện:**
  - **Phần 1: Khóa một chiều:**
    1. Admin sự kiện bấm "KHÓA CHẤM ĐIỂM" ở cuối màn hình và xác nhận hộp thoại.
    2. Quan sát giao diện Admin: Nút chuyển thành nhãn "Đã khóa chấm điểm", không có nút mở khóa nào xuất hiện.
  - **Phần 2: Thử mở khóa trái phép:**
    3. Thử dùng tài khoản Admin thông thường gọi RPC `emergency_unlock_system`.
    4. Kiểm tra: Bị từ chối với lỗi 403 Forbidden.
  - **Phần 3: Mở khóa khẩn cấp bởi Super Admin:**
    5. Đăng nhập quyền Super Admin, gọi thủ tục mở khóa khẩn cấp không truyền lý do -> Bị từ chối lỗi thiếu lý do.
    6. Truyền lý do hợp lệ: "Mở lại 5 phút do sự cố âm thanh".
    7. Mở khóa thành công; kiểm tra bảng `audit_logs` có đầy đủ: `performed_by`, thời gian, và lý do đã nhập.

---

### TC-16: Người tham gia thử gửi điểm sau khi khóa bằng giao diện
- **Mục tiêu:** Kiểm tra phản hồi của giao diện Client khi đã khóa.
- **Tiền điều kiện:** Hệ thống đã ở trạng thái khóa (TC-15).
- **Các bước thực hiện:**
  1. Khán giả mở ứng dụng trên điện thoại.
  2. Mở một đội thi để thử gửi điểm.
- **Kết quả kỳ vọng:**
  - Giao diện hiển thị biểu ngữ/thông báo chuẩn: **“Đã khóa chấm điểm”**.
  - Không thể nhập điểm; nút gửi bị vô hiệu hóa hoặc ẩn hoàn toàn.

---

### TC-17: Người tham gia thử gửi điểm sau khi khóa bằng API trực tiếp
- **Mục tiêu:** Kiểm tra cơ chế bảo vệ ở tầng Database/Backend (chặn bypass UI).
- **Tiền điều kiện:** Hệ thống đã khóa.
- **Các bước thực hiện:**
  1. Mở Postman hoặc curl gọi trực tiếp RPC `submit_vote` hoặc gửi câu lệnh INSERT/UPDATE vào bảng `votes`.
- **Kết quả kỳ vọng:**
  - Database Trigger kích hoạt, hủy bỏ (Rollback) transaction.
  - Phản hồi trả về lỗi HTTP 403 Forbidden kèm mã lỗi `ERR_VOTING_LOCKED` và thông điệp: **“Đã khóa chấm điểm”**.
  - Bảng `votes` không có thêm bất kỳ bản ghi nào mới.

---

### TC-18: Kiểm tra điểm trung bình, làm tròn tối đa 2 chữ số thập phân và "Chưa có điểm"
- **Mục tiêu:** Kiểm tra tính nhất quán giữa Database và Giao diện: hiển thị tối đa 2 chữ số thập phân (`ROUND(..., 2)`) và hiển thị "Chưa có điểm" khi chưa có phiếu.
- **Tiền điều kiện:** Đội Delta mới tạo chưa có ai chấm; Đội Alpha có 3 phiếu.
- **Các bước thực hiện:**
  1. Xem điểm Đội Delta trên màn hình Admin và Khán giả -> Kiểm tra hiển thị.
  2. Cho 3 khán giả chấm Đội Alpha:
     - Khán giả 1: Giọng hát 20, Khuấy động 22 (Tổng = 42).
     - Khán giả 2: Giọng hát 23, Khuấy động 21 (Tổng = 44).
     - Khán giả 3: Giọng hát 25, Khuấy động 25 (Tổng = 50).
  3. Tính toán lý thuyết: $(42 + 44 + 50) / 3 = 136 / 3 = 45.33333...$
  4. Kiểm tra giá trị hiển thị trên cả màn hình Admin và màn hình Người tham gia.
- **Kết quả kỳ vọng:**
  - Đội Delta hiển thị chính xác chuỗi: **“Chưa có điểm”** (không hiển thị `0` hoặc `0.00`).
  - Đội Alpha hiển thị chính xác: **45.33** (làm tròn số học 2 chữ số thập phân).
  - Giá trị trên Database RPC `get_team_board()` và trên giao diện người dùng khớp nhau 100%.

---

### TC-19: Kiểm tra bảng điểm trên điện thoại và máy tính
- **Mục tiêu:** Đảm bảo hiển thị đúng 4 cột, không gộp điểm, không thêm cột thứ 5 trên các kích thước màn hình khác nhau.
- **Kết quả kỳ vọng:**
  - Ở mọi thiết bị, bảng luôn có đúng 4 cột: 1. Tên đội, 2. Điểm khán giả, 3. Điểm thưởng đồng đội, 4. Ngôi sao may mắn.
  - Không xuất hiện cột tổng điểm thứ năm.

---

### TC-20: Kiểm tra tải và phát video với nhiều người xem đồng thời
- **Mục tiêu:** Đảm bảo hiệu năng tải và phát video không làm tê liệt hệ thống.
- **Kết quả kỳ vọng:**
  - Video stream mượt mà qua CDN của Supabase Storage, không gây nghẽn băng thông app chính.
  - Phát ổn định trên iOS Safari và Android Chrome với thuộc tính `playsinline`.

---

### TC-21: Nhập danh sách người tham gia từ file Excel (.xlsx) hợp lệ
- **Mục tiêu:** Kiểm tra luồng import file Excel chuẩn quy mô 300 người tham gia với 4 cột (`STT`, `username`, `password`, `name`).
- **Kết quả kỳ vọng:**
  - Backend Edge Function kiểm tra file thành công.
  - Tạo 300 tài khoản Supabase Auth tương ứng bằng Admin API với mật khẩu cố định `123`.
  - Tạo 300 bản ghi `participants` liên kết 1-1 với `auth_user_id`.
  - Báo cáo kết quả: 300 dòng thành công, 0 dòng lỗi.

---

### TC-22: Kiểm tra cấu trúc file và dữ liệu bắt buộc (Validation dòng lỗi)
- **Mục tiêu:** Kiểm tra khả năng bắt lỗi theo từng dòng khi file Excel thiếu cột hoặc thiếu `username`.
- **Kết quả kỳ vọng:**
  - Sai tên cột: Báo lỗi "Cấu trúc file Excel không hợp lệ. File phải chứa các cột: STT, username, password, name."
  - Thiếu username: Chỉ ra chính xác theo số dòng / STT.

---

### TC-23: Xử lý username trùng lặp và tính Idempotency khi Re-upload
- **Mục tiêu:** Đảm bảo khi Admin tải lại file hoặc file có username trùng, hệ thống không tạo tài khoản trùng lặp và không crash.
- **Kết quả kỳ vọng:**
  - Hệ thống nhận diện các username đã tồn tại, gán trạng thái `SKIPPED_EXISTING`, không sinh thêm tài khoản Auth, không crash.

---

### TC-24: Xác minh bảo mật: Service Role Key & Không lưu mật khẩu plaintext
- **Mục tiêu:** Xác minh Service Role Key không xuất hiện ở Frontend và mật khẩu không bị lưu dạng văn bản thô.
- **Kết quả kỳ vọng:**
  - Tuyệt đối không tìm thấy Service Role Key ở phía client (chỉ có Anon Key).
  - Bảng `participants` hoàn toàn không có cột mật khẩu.
  - Log và báo cáo kết quả chỉ ghi nhận `username`, `name`, `status`, tuyệt đối không ghi mật khẩu `123`.

---

### TC-25: Người tham gia đăng nhập bằng tài khoản được import từ Excel
- **Mục tiêu:** Kiểm tra luồng đăng nhập của người tham gia với thông tin được import (mật khẩu mặc định 123, không yêu cầu đổi pass, không yêu cầu email/SĐT).
- **Kết quả kỳ vọng:**
  - Backend tự động ánh xạ ngầm `${clean_username}@${AUTH_INTERNAL_DOMAIN}` để Supabase Auth xử lý.
  - Đăng nhập thành công, chuyển thẳng vào Màn hình chính hiển thị bảng điểm 4 cột. Không yêu cầu đổi mật khẩu.

---

### TC-26: Vô hiệu hóa tài khoản bởi Admin và Vô hiệu hóa hàng loạt bởi Super Admin
- **Mục tiêu:** Kiểm tra chức năng vô hiệu hóa từng người và vô hiệu hóa toàn bộ 300 tài khoản sau hội thi.
- **Kết quả kỳ vọng:**
  - Cờ `is_active = FALSE`; tài khoản bị chặn không thể đăng nhập hoặc gửi phiếu; ghi nhận đầy đủ lý do vào `audit_logs`.

---

### TC-27: Chặn tự đăng ký tài khoản (Disable Public Signup)
- **Mục tiêu:** Đảm bảo người ngoài không thể tự tạo tài khoản tham gia chấm thi.
- **Kết quả kỳ vọng:**
  - Supabase Auth từ chối yêu cầu (Signup disabled). Chỉ tài khoản do Admin nạp mới tồn tại.

---

### TC-28: Kiểm thử Cơ chế Ánh xạ Mã lỗi HTTP 403 (Pre-acceptance Verification)
- **Mục tiêu:** Xác minh trên instance Supabase mục tiêu rằng khi hệ thống đã khóa, mã lỗi `ERR_VOTING_LOCKED` được chuyển tải chính xác thành HTTP Status 403 Forbidden tới client.
- **Tiền điều kiện:** Hệ thống đã khóa (`is_locked = TRUE`).
- **Các bước thực hiện:**
  1. Gửi request gọi `submit_vote` từ client SDK.
  2. Bắt response nhận được tại Network Tab và SDK error object.
- **Kết quả kỳ vọng:**
  - Mã HTTP status là `403 Forbidden`.
  - Body payload chứa: `{ "error": { "code": "ERR_VOTING_LOCKED", "message": "Đã khóa chấm điểm" } }`.

---

### TC-29: Kiểm thử Concurrency 300 Người gửi phiếu đồng thời khi Admin bấm khóa
- **Mục tiêu:** Thẩm định khả năng chịu tải đồng thời với cơ chế `FOR SHARE` và tính tuần tự hóa tuyệt đối với `FOR UPDATE` của Admin.
- **Tiền điều kiện (Prerequisites):**
  1. 300 tài khoản participant riêng biệt, đều đang hoạt động (`is_active = TRUE`).
  2. 300 tài khoản đều đã đăng nhập sở hữu JWT token hợp lệ.
  3. Đội thi kiểm thử (`target_team_id`) có video hợp lệ.
  4. Điểm gửi lên đều hợp lệ (1-25).
  5. Đã ghi nhận snapshot ban đầu $S_{initial}$ hoặc môi trường sạch chưa có phiếu cho đội này.
  6. Khởi đầu với `is_locked = FALSE`.
- **Các bước thực hiện:**
  1. Tại $T_0$, 300 virtual users đồng loạt gọi `submit_vote(target_team_id, vocal, perf)`.
  2. Tại $T_0 + 20ms$, Admin gọi `lock_voting_system()`.
  3. Ngay khi Admin nhận response thành công, chụp Deep Snapshot $S_{lock}$ toàn bộ bảng `votes`.
  4. Chờ toàn bộ 300 VUs hoàn tất, thu thập HTTP status, response body, `vote_id`.
  5. Chụp Deep Snapshot $S_{final}$ toàn bộ bảng `votes`.
- **Kết quả kỳ vọng:**
  - *Request-Level:* Giả sử có $m$ requests nhận HTTP 200 OK $\to$ tất cả các `vote_id` này bắt buộc có mặt trong $S_{lock}$ với đúng điểm đã gửi. Đúng $300 - m$ requests còn lại nhận HTTP 403 `ERR_VOTING_LOCKED` với thông báo **“Đã khóa chấm điểm”**.
  - *Deep Snapshot:* Đối chiếu $S_{final} \equiv S_{lock}$ trên từng trường (`id, participant_id, team_id, vocal_score, performance_score, created_at, updated_at`), đảm bảo không có INSERT mới hay UPDATE điểm sau thời điểm khóa.
  - Không xảy ra deadlock hay timeout.
