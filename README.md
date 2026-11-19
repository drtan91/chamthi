# WEBAPP BÌNH CHỌN VÀ CHẤM ĐIỂM HỘI THI HÁT

> **Hệ thống Webapp PWA Bình chọn & Chấm điểm Trực tiếp cho Hội thi Văn nghệ**  
> **Quy mô phục vụ:** ~300 Khán giả đồng thời  
> **Phiên bản:** 1.5.4 (Explicit Error Mapping Architecture, Pre-acceptance Status Verification & Individual Request Audit)  
> **Trạng thái:** BẮT ĐẦU TRIỂN KHAI (Execution in Progress)

---

## 1. BỘ TÀI LIỆU ĐẶC TẢ HỆ THỐNG (SPEC KIT)

| Tài liệu | Mô tả | Trạng thái |
|---|---|:---:|
| [constitution.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/constitution.md) | 8 Nguyên tắc bất biến và điều lệ thiết kế cốt lõi | v1.5.4 (Đã duyệt) |
| [spec.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/spec.md) | Đặc tả yêu cầu chức năng và kỹ thuật toàn diện | v1.5.4 (Đã duyệt) |
| [data-model.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/data-model.md) | Mô hình dữ liệu quan hệ, Triggers, RPC, RLS và Deep Snapshot | v1.5.4 (Đã duyệt) |
| [api-contracts.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/api-contracts.md) | Hợp đồng API, Edge Functions, mã lỗi và kiến trúc ánh xạ lỗi | v1.5.4 (Đã duyệt) |
| [acceptance-criteria.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/acceptance-criteria.md) | 44 Tiêu chí nghiệm thu hệ thống (AC-01 đến AC-42) | v1.5.4 (Đã duyệt) |
| [test-scenarios.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/test-scenarios.md) | 29 Kịch bản kiểm thử chi tiết (TC-01 đến TC-29) | v1.5.4 (Đã duyệt) |
| [plan.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/plan.md) | Kế hoạch triển khai kiến trúc hệ thống | v1.5.4 (Đã duyệt) |
| [tasks.md](file:///d:/GOOGLE%20DRIVE/5_ai/VANNGHE/tasks.md) | Danh mục nhiệm vụ WBS và tiến độ thực thi | v1.5.4 (Đang chạy) |

---

## 2. NGUYÊN TẮC BẤT BIẾN CỐT LÕI
1. **Bảng điểm đúng 4 cột:** Tên đội thi, Điểm khán giả, Điểm thưởng đồng đội (0/+3), Ngôi sao may mắn (+5/-5). Không có cột tổng điểm.
2. **Thứ tự cố định:** Giữ nguyên theo thứ tự ban đầu của Admin, không tự nhảy thứ tự khi điểm thay đổi.
3. **Màn hình Admin đơn nhất:** Một màn hình chính duy nhất, không dùng 2 tab.
4. **Điểm trung bình và làm tròn:** Hiển thị tối đa 2 chữ số thập phân (`ROUND(..., 2)`). Chưa có phiếu hiển thị **“Chưa có điểm”**.
5. **Quy trình thay video an toàn 6 bước:** Upload video mới trước, lưu DB, xóa video cũ sau; nếu xóa video cũ lỗi ghi nhận vào `storage_cleanup_jobs` để retry.
6. **Khóa chấm điểm một chiều & Khóa chia sẻ dòng:** `submit_vote` dùng `FOR SHARE` cho 300 người chấm cùng lúc; `lock_voting_system` dùng `FOR UPDATE`; lỗi trả về HTTP 403 `ERR_VOTING_LOCKED` **“Đã khóa chấm điểm”**.
7. **Nhập danh sách từ Excel:** 4 cột `STT`, `username`, `password`, `name`. Mật khẩu khởi tạo `123`. Email nội bộ ngầm qua `AUTH_INTERNAL_DOMAIN`. Không để lộ Service Role Key. View công khai `view_participants_public` không để lộ `auth_user_id`.
8. **Một người 1 phiếu duy nhất:** Điểm giọng hát (1-25) và khuấy động (1-25). Chấm lại cập nhật phiếu cũ qua UPSERT.
