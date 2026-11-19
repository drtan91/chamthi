# ACCEPTANCE CRITERIA – BỘ TIÊU CHÍ NGHIỆM THU HỆ THỐNG

> **Dự án:** Webapp Bình chọn & Chấm điểm Hội thi hát  
> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Tổng số tiêu chí:** 44 Tiêu chí chia làm 5 nhóm chuyên biệt (Nhóm A đến E)

---

## BẢNG TỔNG HỢP TIÊU CHÍ NGHIỆM THU

### NHÓM A – QUẢN TRỊ VIÊN (ADMIN)

| Mã AC | Tiêu chí | Điều kiện tiên quyết | Hành động kiểm thử | Kết quả kỳ vọng đạt chuẩn |
|---|---|---|---|---|
| **AC-01** | Admin chỉ có một màn hình quản lý chính | Đăng nhập tài khoản Admin | Quan sát cấu trúc giao diện | Chỉ có 1 màn hình chính duy nhất hiển thị bảng và các nút chức năng; tuyệt đối không có 2 tab quản lý như thiết kế cũ. |
| **AC-02** | Bảng quản lý có đúng 4 cột | Admin ở màn hình chính | Đếm số cột trên bảng dữ liệu | Bảng có chính xác 4 cột: 1. Tên đội thi; 2. Điểm khán giả; 3. Điểm thưởng đồng đội; 4. Ngôi sao may mắn. Không có cột thứ 5. |
| **AC-03** | Admin tạo được nhiều đội thi | Admin ở màn hình chính | Bấm "Thêm đội thi", nhập tên các đội và lưu | Các đội thi được lưu vào Supabase và xuất hiện ngay trên bảng danh sách. |
| **AC-04** | Đội thi hiển thị theo thứ tự tạo ban đầu | Tạo từ 3 đến 5 đội theo thứ tự Đội A, Đội B, Đội C | Tải lại trang (F5) hoặc mở tab mới | Danh sách luôn hiển thị đúng thứ tự Đội A, Đội B, Đội C theo `display_order` ban đầu. |
| **AC-05** | Thứ tự đội không đổi khi điểm thay đổi | Danh sách đội đã có điểm | Nhập thêm điểm cho Đội C để Đội C có điểm cao nhất | Vị trí các dòng trong bảng không thay đổi; Đội C không bị nhảy lên đầu bảng. |
| **AC-06** | Mở cửa sổ chi tiết của từng đội | Bấm vào dòng của một đội thi bất kỳ | Quan sát giao diện Modal | Cửa sổ chi tiết đội mở ra với đầy đủ các khu vực: sửa tên, quản lý video, chọn điểm thưởng, chọn ngôi sao may mắn. |
| **AC-07** | Admin sửa được tên đội thi | Mở chi tiết đội thi | Thay đổi tên đội và bấm "Lưu thay đổi" | Tên đội được cập nhật trên database và hiển thị tên mới trên bảng chính. |
| **AC-08** | Tải lên một video cho mỗi đội | Đội chưa có video | Chọn tệp video hợp lệ (mp4/webm) và tải lên | Thanh tiến trình hiển thị; video tải lên Supabase Storage thành công; hiển thị video player trong modal. |
| **AC-09** | Thay thế video an toàn 6 bước & Cleanup Jobs | Đội đang có Video cũ | Bấm "Thay thế video", chọn Video mới tải lên | Video mới phải tải thành công lên Storage và lưu liên kết DB trước, sau đó mới gỡ video cũ. Nếu xóa video cũ lỗi, ghi vào `storage_cleanup_jobs` để retry. Tuyệt đối không để một đội có nhiều video hiện hành. |
| **AC-09B** | Giữ nguyên video cũ khi thay thế thất bại | Đội đang có Video cũ | Thử thay thế bằng video mới nhưng ngắt mạng/lỗi file giữa chừng | Hệ thống báo lỗi; video cũ vẫn được giữ nguyên vẹn 100% làm video hiện hành của đội; file mới nếu có được đưa vào `storage_cleanup_jobs` để dọn dẹp. |
| **AC-10** | Xóa video và cập nhật trạng thái | Đội đang có video | Bấm "Xóa video" và xác nhận hộp thoại | Video bị gỡ bỏ; trạng thái đội chuyển thành "Chưa có video"; khán giả lập tức không thể chấm hoặc sửa điểm cho đội này. |
| **AC-11** | Điểm thưởng đồng đội chỉ nhận 0 hoặc +3 | Mở chi tiết đội | Kiểm tra bộ chọn Điểm thưởng đồng đội | Chỉ có 2 tùy chọn duy nhất: `0` hoặc `+3`. Không cho phép nhập giá trị tự do khác. |
| **AC-12** | Ngôi sao may mắn chỉ nhận +5 hoặc -5 | Mở chi tiết đội | Kiểm tra bộ chọn Ngôi sao may mắn | Chỉ có 2 tùy chọn duy nhất: `+5` hoặc `-5`. Không cho phép chọn giá trị khác. |
| **AC-13** | Khóa chấm điểm là thao tác một chiều | Màn hình Admin đang mở chấm điểm | Bấm nút "KHÓA CHẤM ĐIỂM" ở cuối màn hình và xác nhận hộp thoại | Khóa dòng `system_settings FOR UPDATE`. Hệ thống chuyển sang trạng thái đã khóa; nút chuyển thành nhãn "Đã khóa chấm điểm"; không cung cấp nút mở khóa cho Admin sự kiện thông thường. |
| **AC-14** | Lưu người thực hiện và thời điểm khóa | Admin bấm khóa thành công | Kiểm tra dữ liệu trong bảng `system_settings` và `audit_logs` | Trường `locked_by` lưu ID Admin; trường `locked_at` lưu thời điểm UTC chính xác; `is_locked = true`. |
| **AC-14B** | Mở khóa khẩn cấp có ghi nhận lý do | Đã khóa; phát sinh sự cố khẩn cấp | Super Admin gọi thủ tục mở khóa khẩn cấp kèm lý do | Hệ thống mở khóa thành công; bảng `audit_logs` ghi nhận đầy đủ: người thực hiện, thời gian, và lý do mở khóa bắt buộc (tối thiểu 5 ký tự). |

---

### NHÓM B – NGƯỜI THAM GIA & NHẬP EXCEL (PARTICIPANT & EXCEL IMPORT)

| Mã AC | Tiêu chí | Điều kiện tiên quyết | Hành động kiểm thử | Kết quả kỳ vọng đạt chuẩn |
|---|---|---|---|---|
| **AC-15** | Nhập danh sách từ file Excel (.xlsx) | File Excel chuẩn gồm 4 cột: `STT`, `username`, `password`, `name` | Admin tải file lên qua giao diện | Backend kiểm tra cấu trúc file hợp lệ, xử lý nạp thành công vào hệ thống. Mật khẩu khởi tạo cố định `123`. |
| **AC-15A** | Kiểm tra dữ liệu bắt buộc và username trùng | File Excel có dòng thiếu `username` hoặc bị trùng `username` | Admin tải file lên | Hệ thống báo lỗi chi tiết theo số dòng: chỉ rõ dòng thiếu dữ liệu hoặc dòng bị trùng lặp. |
| **AC-15B** | Tạo tài khoản Supabase Auth an toàn qua Admin API | File Excel hợp lệ | Backend tiếp nhận và xử lý | Sử dụng Supabase Auth Admin API tại Backend để tạo tài khoản; liên kết 1-1 bản ghi `participants` với `auth_user_id`. |
| **AC-15C** | Không để Service Role Key xuất hiện ở Frontend | Kiểm tra bundle mã nguồn frontend, network tab và client state | Soát xét toàn bộ client code | Service Role Key chỉ tồn tại trong biến môi trường backend/Edge Function; tuyệt đối không rò rỉ ở Frontend. |
| **AC-15D** | Zero Plaintext Password trong database và log | Quá trình import hoàn tất | Tra soát database bảng `participants`, `audit_logs`, cloud log và báo cáo | Tuyệt đối không lưu mật khẩu dạng thô (plaintext) trong DB; không ghi mật khẩu vào log hoặc file báo cáo lỗi. |
| **AC-15E** | Tính Idempotent khi tải lại file Excel | Danh sách người tham gia đã import thành công | Admin tải lại file Excel vừa import | Hệ thống xử lý an toàn: bỏ qua các tài khoản đã tồn tại, không tạo tài khoản trùng lặp và không gây lỗi crash. |
| **AC-15F** | Đăng nhập bằng username/password không bắt buộc đổi | Người tham gia có tài khoản được import với pass `123` | Nhập username và password đăng nhập | Backend tự ánh xạ email nội bộ `${clean_username}@${AUTH_INTERNAL_DOMAIN}`; không yêu cầu email/SĐT; vào thẳng màn hình bảng điểm; không yêu cầu đổi mật khẩu. |
| **AC-15G** | Không sử dụng IMEI/phần cứng & chống tạo nhiều danh tính | Người tham gia đăng nhập | Kiểm tra luồng cấp quyền | 1 username map 1-1 với 1 danh tính duy nhất; không đòi hỏi quyền truy cập IMEI hay phần cứng thiết bị. |
| **AC-15H** | Vô hiệu hóa tài khoản bởi Admin & Super Admin | Admin/Super Admin thao tác vô hiệu hóa | Gọi lệnh vô hiệu hóa từng người hoặc vô hiệu hóa toàn bộ sau hội thi | Cờ `is_active = FALSE`; tài khoản bị chặn không thể đăng nhập hoặc gửi phiếu; ghi nhận đầy đủ lý do vào `audit_logs`. |
| **AC-15I** | Chặn tự đăng ký tài khoản (Public Signup Disabled) | Người dùng cố gọi API `auth.signUp` | Gửi request đăng ký tài khoản tự do | Hệ thống từ chối với lỗi 403 Forbidden; chỉ tài khoản do Admin nạp mới tồn tại. |
| **AC-16** | Bảng điểm hiển thị đủ 4 cột giống Admin | Người tham gia đăng nhập bằng username/password | Quan sát màn hình chính | Bảng điểm có đủ 4 cột giống hệt Admin: Tên đội, Điểm khán giả, Điểm thưởng đồng đội, Ngôi sao may mắn. Không có cột tổng điểm. |
| **AC-17** | Thứ tự đội thi giống hệt thứ tự Admin tạo | Khán giả mở màn hình chính | So sánh thứ tự với màn hình Admin | Thứ tự các đội thi trùng khớp 100% với thứ tự Admin đã tạo; không tự sắp xếp theo điểm. |
| **AC-18** | Mở chi tiết đội và xem video | Đội đã có video tải lên | Bấm vào đội thi | Modal mở ra, video tải theo cơ chế lazy load và phát trực tiếp ổn định trên trình duyệt điện thoại (`playsinline`). |
| **AC-19** | Đội chưa có video không cho chấm điểm | Đội chưa được tải video (hoặc vừa bị xóa video) | Bấm vào đội thi đó | Hiển thị thông báo đội chưa có video; form chấm điểm bị vô hiệu hóa, không có nút gửi điểm. |
| **AC-20** | Điểm giọng hát chỉ nhận số nguyên từ 1 đến 25 | Mở form chấm điểm của đội hợp lệ | Thử nhập: 0, 26, -5, 12.5 | Hệ thống chặn và báo lỗi; chỉ chấp nhận các số nguyên trong đoạn $[1, 25]$. |
| **AC-21** | Điểm khuấy động chỉ nhận số nguyên từ 1 đến 25 | Mở form chấm điểm | Thử nhập: 0, 30, chữ cái, số lẻ thập phân | Hệ thống chặn và báo lỗi; chỉ chấp nhận các số nguyên trong đoạn $[1, 25]$. |
| **AC-22** | Xác nhận chấm điểm thành công | Nhập điểm Giọng hát 20, Khuấy động 22 | Bấm "XÁC NHẬN CHẤM ĐIỂM" | Gọi `submit_vote` với khóa `FOR SHARE`; phiếu được lưu vào bảng `votes`; hiển thị thông báo thành công; điểm khán giả cập nhật trên bảng. |
| **AC-23** | Chấm lại sẽ cập nhật phiếu cũ (UPSERT) | Đã chấm đội A trước đó | Mở lại đội A, đổi điểm thành 22 và 24, bấm cập nhật | Bản ghi cũ trong bảng `votes` được UPDATE qua mệnh đề `ON CONFLICT DO UPDATE`; không sinh thêm dòng mới; tổng số phiếu không tăng. |
| **AC-24** | Một người chỉ có duy nhất 1 phiếu cho 1 đội | Người dùng cố tình gửi nhiều request đồng thời | Kiểm tra dữ liệu trong bảng `votes` | Database bắt ràng buộc `UNIQUE(participant_id, team_id)`; chỉ duy nhất 1 phiếu tồn tại. |
| **AC-25** | Chỉ tạo/sửa phiếu của mình & Chống giả mạo & Bảo vệ quyền riêng tư | Đăng nhập tài khoản A | Cố truyền participant_id của B hoặc truy vấn thông tin | Hàm ghi điểm tự động lấy `v_participant_id` từ `auth.uid()` của session; không thể giả mạo `participant_id`; xem danh sách người tham gia qua `view_participants_public` chỉ gồm 4 trường (`id, username, name, is_active`), tuyệt đối không lộ `auth_user_id`. |

---

### NHÓM C – QUY TẮC TÍNH ĐIỂM (SCORING LOGIC)

| Mã AC | Tiêu chí | Điều kiện tiên quyết | Hành động kiểm thử | Kết quả kỳ vọng đạt chuẩn |
|---|---|---|---|---|
| **AC-26** | Điểm khán giả = Trung bình cộng tổng điểm các phiếu | Có 3 phiếu hợp lệ: (20+22=42), (23+21=44), (19+24=43) | Kiểm tra cột Điểm khán giả | Điểm hiển thị = $(42 + 44 + 43) / 3 = 43.00$ (hoặc 43) điểm; làm tròn số học chuẩn xác qua hàm `get_team_board()`. |
| **AC-26B** | Hiển thị tối đa 2 chữ số thập phân, thống nhất làm tròn | Có 3 phiếu: (20+22=42), (23+21=44), (25+25=50) | Tính $(42+44+50)/3 = 45.3333...$ | Hiển thị chính xác **45.33**; quy tắc làm tròn `ROUND(..., 2)` thống nhất 100% giữa Database RPC và Giao diện. |
| **AC-27** | Điểm khán giả tự tính lại khi phiếu được sửa | Người thứ 3 sửa điểm | Kiểm tra lại điểm hiển thị | Điểm cập nhật tức thì theo giá trị mới nhất. |
| **AC-28** | Phiếu trùng không được tính nhiều lần | Người dùng bấm gửi liên tục | Kiểm tra số lượng phiếu tham gia phép chia | Mẫu số $N$ vẫn là số người tham gia duy nhất; không bị nhân đôi số điểm. |
| **AC-29** | Đội chưa có phiếu hiển thị "Chưa có điểm" | Đội thi mới tạo, chưa ai chấm | Xem cột Điểm khán giả | Hiển thị chính xác chuỗi: **“Chưa có điểm”**; tuyệt đối không hiển thị `0`, `0.00` hoặc để trống. |
| **AC-30** | Bảng điểm có đủ 4 cột, không phát sinh cột thứ 5 | Quan sát giao diện ở mọi độ phân giải màn hình | Đếm số lượng cột hiển thị | Bảng chỉ có 4 cột: Tên đội, Điểm khán giả, Điểm thưởng, Ngôi sao may mắn. Không có cột tổng điểm. |
| **AC-31** | Thứ tự đội không đổi khi điểm khán giả thay đổi | Điểm khán giả của các đội biến động liên tục | Theo dõi bảng điểm | Thứ tự các hàng của đội giữ nguyên 100% theo thứ tự ban đầu. |

---

### NHÓM D – KHÓA CHẤM ĐIỂM (LOCK VOTING MECHANISM)

| Mã AC | Tiêu chí | Điều kiện tiên quyết | Hành động kiểm thử | Kết quả kỳ vọng đạt chuẩn |
|---|---|---|---|---|
| **AC-32** | Admin khóa chấm điểm sau khi xác nhận | Admin ở màn hình chính | Bấm "KHÓA CHẤM ĐIỂM", chọn xác nhận | Hệ thống kích hoạt khóa thành công với `FOR UPDATE` trên `system_settings`. |
| **AC-33** | Khán giả nhận thông báo "Đã khóa chấm điểm" | Đang mở app trên điện thoại khán giả | Admin kích hoạt khóa | Giao diện khán giả nhận tín hiệu Realtime, hiển thị banner/thông báo chính xác: **“Đã khóa chấm điểm”**. |
| **AC-34** | Không thể gửi phiếu mới sau khi khóa | Hệ thống đã khóa | Khán giả mở đội chưa chấm và cố bấm gửi | Nút gửi bị vô hiệu hóa trên giao diện; nhận mã lỗi `ERR_VOTING_LOCKED` và thông báo **“Đã khóa chấm điểm”**. |
| **AC-35** | Không thể sửa phiếu cũ sau khi khóa | Hệ thống đã khóa | Khán giả mở lại đội đã chấm trước đó | Các ô nhập điểm ở trạng thái chỉ đọc (Read-only); nút cập nhật bị ẩn/vô hiệu hóa. |
| **AC-36** | Backend/Database từ chối ghi sau khi khóa | Hệ thống đã khóa | Dùng REST API hoặc console gọi `INSERT/UPDATE` trực tiếp | Quyền trực tiếp bị REVOKE; nếu gọi qua RPC, trigger và hàm ném lỗi HTTP 403 Forbidden kèm code `ERR_VOTING_LOCKED` và thông báo **“Đã khóa chấm điểm”**. |
| **AC-37** | Xử lý tranh chấp khóa đồng thời và tính bất biến | 300 VUs gửi điểm đồng thời khi Admin bấm khóa | Kiểm thử Concurrency hai lớp (Request Audit + Deep Snapshot) | Mọi request thành công có `vote_id` nằm trong snapshot $S_{lock}$; mọi request bị chặn nhận HTTP 403 Forbidden `ERR_VOTING_LOCKED` "Đã khóa chấm điểm"; đối chiếu $S_{final} \equiv S_{lock}$ field-by-field, không có INSERT/UPDATE sau khóa. |

---

### NHÓM E – THIẾT BỊ VÀ VẬN HÀNH (DEVICES & OPERATIONS)

| Mã AC | Tiêu chí | Điều kiện tiên quyết | Hành động kiểm thử | Kết quả kỳ vọng đạt chuẩn |
|---|---|---|---|---|
| **AC-38** | Hoạt động tốt trên Android, iPhone, Desktop | Truy cập app trên iPhone Safari, Android Chrome, PC Edge | Kiểm tra bố cục, font chữ, cảm ứng | Giao diện co giãn chuẩn (Responsive Mobile-First), không vỡ khung hình, nút bấm cảm ứng nhạy, thao tác mượt mà. |
| **AC-39** | Cài đặt được như ứng dụng PWA | Mở app trên trình duyệt mobile | Bấm "Thêm vào màn hình chính" (Add to Home Screen) | Biểu tượng ứng dụng xuất hiện trên màn hình chính thiết bị; mở ra dạng standalone không có thanh địa chỉ web. |
| **AC-40** | Video phát mượt mà trên thiết bị di động | Mở xem video dự thi trên iPhone và Android | Nhấn play video | Video phát trực tiếp trong khung (`playsinline`), âm thanh và hình ảnh đồng bộ mượt mà. |
| **AC-41** | Chịu tải khoảng 300 người dùng đồng thời | Giả lập 300 client kết nối xem bảng và gửi điểm với cơ chế `FOR SHARE` | Đo lường độ trễ và tỷ lệ lỗi | Tỷ lệ thành công > 99.5%; thời gian phản hồi API trung bình dưới 500ms; không treo hệ thống; không deadlock. |
| **AC-42** | Lưu trữ bền bỉ trên Supabase | Đã chấm điểm trên thiết bị A | Đăng nhập mã đó trên thiết bị B hoặc tải lại trang | Dữ liệu phiếu chấm và điểm số hiển thị đồng nhất, không bị mất mát dữ liệu. |
