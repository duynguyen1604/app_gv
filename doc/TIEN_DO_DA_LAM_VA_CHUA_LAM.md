# BÁO CÁO TIẾN ĐỘ: NHỮNG THỨ ĐÃ LÀM VÀ CHƯA LÀM

Tài liệu này đối chiếu chi tiết 100% các yêu cầu từ bài toán thực tế của giáo viên với mã nguồn hiện tại của dự án.

---

## 🟢 PHẦN 1: NHỮNG TÍNH NĂNG ĐÃ HOÀN THÀNH (100% FUNCTIONAL)

Toàn bộ logic giao diện, nghiệp vụ tính toán, cơ chế lưu trữ cục bộ, bộ phân tích AI và xuất báo cáo đã được lập trình hoàn chỉnh:

### 1. Thời gian biểu tuần (Màn hình chính)
- [x] **Lưới lịch cả tuần T2 – CN**: Hiển thị trên cùng một màn hình với 7 cột trực quan.
- [x] **Chế độ xem 1 Ngày trên điện thoại**: Thanh chuyển đổi nhanh các thứ trong tuần (T2 đến CN), tối ưu thao tác một tay trên mobile.
- [x] **Điều hướng tuần**: Tuần trước / Tuần này / Tuần sau, định dạng hiển thị ngày tiếng Việt chuẩn (`dd/MM/yyyy`).
- [x] **4 loại khối lịch phân biệt màu sắc và nhãn**:
  * 🟦 **Lịch trường (Xanh dương)**: Tên lớp trường, môn học, phòng học, giờ bắt đầu/kết thúc.
  * 🟧 **Dạy thêm cố định (Cam)**: Theo quy tắc lặp hằng tuần của từng lớp dạy thêm.
  * 🟪 **Buổi phát sinh (Tím)**: Có nhãn riêng `Phát sinh`.
  * ⬜ **Buổi đã dời**: Hiển thị mờ, gạch ngang ở vị trí gốc kèm mũi tên và ghi chú chuyển sang ngày/giờ mới (`➔ Dời sang [Ngày] [Giờ]`).
- [x] **Tương tác khi bấm vào khối lịch**:
  * Mở Bottom Sheet xem chi tiết buổi học (thời gian, phòng, địa điểm, ghi chú).
  * **Vào điểm danh**: Chuyển hướng trực tiếp vào màn điểm danh của lớp đó.
  * **Dời sang ngày/giờ khác**: Chỉ ảnh hưởng tuần đang xem, tuần sau vẫn giữ lịch cũ. Tự động kiểm tra trùng lịch ngay khi chọn ngày/giờ mới.
  * **Hủy buổi này**: Cho phép nhập lý do, tùy chọn tích *"Cần dạy bù"*.
  * **Xóa buổi phát sinh**: Cho phép gỡ bỏ buổi phát sinh khỏi lịch.
- [x] **Bấm vào ô trống / Nút "+ Buổi phát sinh"**: Mở form thêm buổi ngoài lịch với đầy đủ chọn lớp, ngày, giờ, ghi chú.
- [x] **Cảnh báo trùng lịch tập trung (`conflictDetector.ts`)**:
  * Cảnh báo đỏ nổi bật ngay lập tức nếu trùng giờ với tiết trường hoặc lớp dạy thêm khác.
  * Cảnh báo thời gian di chuyển nếu hai buổi học liên tiếp khác địa điểm cách nhau dưới 20 phút.
- [x] **Khung "Buổi cần dạy bù"**:
  * Tự động lọc các buổi bị hủy có đánh dấu `needs_makeup = true` và chưa có buổi bù.
  * Nút *"Xếp bù ngay"* tự động tạo buổi phát sinh và liên kết khóa ngoại với buổi hủy gốc.
- [x] **Tóm tắt "Hôm nay"**: Hiển thị ngay đầu màn hình chính các buổi dạy hôm nay theo thứ tự giờ.
- [x] **Sao chép tuần**: Nút sao chép toàn bộ các buổi dời/hủy của tuần này sang tuần tiếp theo chỉ với 1 click.
- [x] **In / Xuất lịch**: Hỗ trợ in chuẩn CSS (@media print) cho toàn bộ tuần dạy.

---

### 2. Danh sách lớp dạy thêm & Chi tiết lớp
- [x] **Thẻ lớp học**: Tên lớp, địa điểm, các thứ học cố định, sĩ số, giá/buổi, màu sắc đại diện.
- [x] **Thêm / Sửa / Xóa lớp**: Có hộp thoại xác nhận xóa (`ConfirmDialog`) để tránh xóa nhầm dữ liệu.
- [x] **Tab trong chi tiết lớp**: 3 tab rõ ràng (Học sinh, Lịch học cố định, Điểm danh).
- [x] **Quản lý học sinh**:
  * Thêm học sinh đơn lẻ hoặc **dán danh sách hàng loạt** (mỗi tên một dòng).
  * Hồ sơ: Tên, tên phụ huynh, SĐT phụ huynh (gọi nhanh bằng liên kết `tel:`), ghi chú.
  * Đơn giá riêng (`custom_price`): Ghi đè giá chung của lớp (nếu học sinh có giá ưu đãi).
  * Trạng thái học sinh: **Đang học / Học thử / Đã nghỉ**. Học sinh đã nghỉ sẽ tự động ẩn khỏi danh sách điểm danh nhưng vẫn giữ toàn bộ dữ liệu lịch sử.

---

### 3. Điểm danh tối đa 2 chạm
- [x] **Chọn buổi điểm danh**: Dropdown chọn buổi theo lịch thực tế (bao gồm cả buổi dời, buổi bù, buổi phát sinh).
- [x] **3 nút bấm nhanh**: `Có mặt` (Xanh lá) / `Vắng` (Đỏ) / `Vắng có phép` (Vàng). Bấm lại lần nữa để hủy chọn.
- [x] **Nút "Tất cả có mặt"**: Điểm danh toàn bộ học sinh chỉ trong 1 chạm.
- [x] **Thống kê sĩ số trực quan**: Hiển thị ngay số lượng Có mặt / Vắng / Có phép của buổi học.
- [x] **Ghi chú buổi học**: Nhập nội dung bài dạy hôm nay và bài tập về nhà, tự động lưu lại.

---

### 4. Tổng hợp học phí & Doanh thu
- [x] **Bộ lọc**: Chọn tháng (12 tháng gần nhất) và chọn xem theo từng lớp hoặc tất cả lớp.
- [x] **Công thức tính tiền chuẩn xác 100%**:
  * $\text{Thành tiền} = \text{Số buổi CÓ MẶT} \times \text{Đơn giá/buổi}$.
  * Học sinh vắng (dù có phép hay không phép) **không tính tiền**.
  * Buổi bị hủy **không tính tiền**.
  * Học sinh trạng thái **Học thử (trial)** được miễn phí (0đ).
  * Buổi dời, buổi bù, buổi phát sinh được tính chuẩn xác vì điểm danh gắn với buổi học thực tế.
- [x] **Tình trạng đóng tiền**: Ô tròn tích chọn `Đã đóng / Chưa đóng` theo từng học sinh cho từng tháng.
- [x] **3 Thẻ KPI tổng quan**: `Tổng phải thu` | `Đã thu` | `Còn lại chưa thu`.
- [x] **Xuất file Excel (`.xlsx`)**: Xuất bảng tính Excel đầy đủ cột, định dạng chuẩn thông qua thư viện SheetJS.
- [x] **Soạn tin nhắn nhắc học phí Zalo**: 1 chạm copy tin nhắn gửi phụ huynh với nội dung chi tiết số buổi và số tiền cần đóng.
- [x] **Gửi báo cáo qua Gmail**: Tự động mở ứng dụng gửi thư với nội dung tổng hợp học phí đã soạn sẵn.
- [x] **Biểu đồ thống kê thu nhập**: Chế độ xem biểu đồ so sánh doanh thu và tỷ lệ hoàn thành thu phí giữa các lớp.

---

### 5. Nhập lịch thông minh bằng AI (Zalo & Ảnh TKB)
- [x] **Nhập lịch từ tin nhắn Zalo/SMS (`ZaloMessageModal.tsx`)**:
  * Cho phép dán văn bản nhiều tin nhắn cùng lúc.
  * Bộ giải mã NLP tiếng Việt tích hợp sẵn: Hiểu các từ ngữ tự nhiên như *"mai"*, *"tối nay"*, *"T7 sáng"*, *"9h-11h"*, *"19h30"*, *"nghỉ do mưa"*, *"dời sang thứ 5"*, tự động khớp tên lớp trong danh bạ.
  * Sẵn sàng kết nối Google Gemini 1.5 Flash API khi người dùng cấu hình API Key.
  * **Bảng xem trước (Preview Table)**: Cho phép giáo viên **kiểm tra và sửa tay từng ô** trước khi bấm xác nhận lưu.
  * Đánh dấu màu vàng các ô thông tin chưa rõ (*ambiguity*) hoặc độ tin cậy thấp.
  * Kiểm tra và gắn cờ cảnh báo đỏ nếu buổi dự kiến thêm bị trùng lịch.
- [x] **Nhập lịch trường từ ảnh thời khóa biểu (`SchoolImageModal.tsx`)**:
  * Tải ảnh chụp thời khóa biểu trường (PNG, JPG) kèm xem trước ảnh.
  * Tích hợp Gemini Vision API để quét và trích xuất danh sách tiết học theo mẫu JSON chuẩn.
  * Cho phép **sửa tay từng ô**, thêm tiết, xóa tiết, chọn thứ, giờ bắt đầu/kết thúc, môn học, phòng học.
  * Chọn khoảng thời gian áp dụng (từ ngày ... đến ngày ...) theo học kỳ.
  * Hộp thoại xác nhận an toàn khi ghi đè thời khóa biểu cũ.

---

### 6. Cài đặt hệ thống & Tiện ích mở rộng
- [x] **Chế độ Sáng / Tối (Dark/Light mode)**: Tương thích toàn bộ giao diện và bảng biểu.
- [x] **Thông báo lịch dạy qua Gmail**:
  * Cài đặt email nhận, giờ gửi hằng ngày, nội dung gửi (trường / dạy thêm / cả hai).
  * Xem trước email hôm nay với lịch thực tế đã tính dời/hủy/phát sinh.
  * Nút *"Gửi thử"* và lưu lịch sử thông báo gửi.
- [x] **Quản lý ngày nghỉ lễ / Nghỉ chung**:
  * Thêm ngày nghỉ lễ (20/11, Tết, lễ quốc gia...).
  * Hệ thống tự động ẩn tất cả các buổi học trong ngày đó mà không cần giáo viên phải hủy thủ công từng lớp.
- [x] **Sao lưu & Khôi phục dữ liệu (Backup & Restore)**:
  * Xuất toàn bộ dữ liệu ra file `.json` để lưu trữ an toàn.
  * Khôi phục toàn bộ trạng thái chỉ bằng việc tải file backup lên.

---

## 🟡 PHẦN 2: HẠ TẦNG DOCKER BACKEND & CÁC BƯỚC NÂNG CẤP TIẾP THEO

### 1. Hạ tầng Backend Docker (ĐÃ HOÀN THIỆN VÀ DỰNG DATABASE)
- [x] **PostgreSQL 16 Container**: Image chính thức, tự động nạp cấu trúc 11 bảng + nhật ký (`backend/sql/init.sql`), chỉ mục, CHECK, unique theo giáo viên; dữ liệu bền vững qua Docker Volume. Backend còn tự `ensureSchema()` mỗi lần khởi động.
- [x] **Backend API Container (Node.js 20 Express + TypeScript)**: `GET/PUT/POST /api/sync` (đủ `session_notes` và `notification_log`), `/api/health`, `/api/email/test`, `/api/ai/parse-zalo`, `/api/ai/parse-school-image`.
- [x] **Đồng bộ frontend ↔ Postgres**: `src/lib/backendSync.ts` kéo/đẩy tự động; màn Cài đặt có nút đồng bộ tay.
- [x] **Dịch vụ Cron tự động gửi email 24/7 (`backend/src/cron.ts`)**: Sử dụng tiến trình `node-cron` chạy ngầm 24/7 bên trong container, kiểm tra giờ mỗi phút theo múi giờ `Asia/Ho_Chi_Minh` và tự động gửi email lịch dạy hôm nay qua Gmail SMTP lúc 06:00 sáng **ngay cả khi giáo viên tắt máy tính và điện thoại**.
- [x] **Frontend Container (Nginx Alpine)**: Tự động phục vụ SPA và reverse proxy các yêu cầu `/api/` sang backend container.
- [x] **Tái cấu trúc thư mục Monorepo sạch**: Tách biệt rõ ràng `frontend/` và `backend/`, thư mục gốc gọn gàng chỉ gồm 4 thư mục chính (`frontend/`, `backend/`, `docker/`, `doc/`) và tệp điều phối `package.json`, `docker-compose.yml`.
- [x] **Docker Compose (`docker-compose.yml`)**: Khởi động toàn bộ cụm 3 dịch vụ chỉ bằng 1 lệnh `docker compose up -d`.

---

### 2. Các bước nâng cấp tiếp theo khi triển khai thực tế trên máy chủ
1. **Điền thông tin tài khoản Gmail trong file `.env`**: Điền `SMTP_USER` (địa chỉ Gmail) và `SMTP_PASS` (Mật khẩu ứng dụng 16 ký tự của Gmail) để kích hoạt gửi thư thật.
2. **Cấu hình Google OAuth Login**: Kết nối Google Client ID để giáo viên đăng nhập trực tiếp bằng nút "Đăng nhập với Google" nếu triển khai nhiều tài khoản trên cùng 1 server.
3. **Cấu hình SSL / Tên miền**: Trỏ tên miền (ví dụ: `lichday.yourdomain.com`) về máy chủ VPS và kích hoạt chứng chỉ SSL Let's Encrypt (Certbot / Nginx Proxy Manager).

---

## 📊 BẢNG TỔNG KẾT TIẾN ĐỘ THEO YÊU CẦU ĐẶT HÀNG

| Hạng mục yêu cầu | Tình trạng | Ghi chú |
| :--- | :---: | :--- |
| **Giai đoạn 1**: Lớp, Học sinh, Điểm danh, Học phí | **100%** | Hoàn thành xuất sắc, có thêm dán danh sách hàng loạt & xuất Excel `.xlsx`. |
| **Giai đoạn 2**: Thời gian biểu tuần, Dời/Hủy/Phát sinh, Trùng lịch, Buổi bù | **100%** | Đầy đủ 4 màu, thuật toán kiểm tra trùng lịch tập trung và cảnh báo di chuyển. |
| **Giai đoạn 3**: Nhập lịch Zalo & Ảnh TKB trường bằng AI | **100%** | Hoàn thành modal xem trước, sửa tay từng ô, tô vàng ô chưa rõ, cảnh báo đỏ. |
| **Giai đoạn 4**: Email Gmail hằng ngày, Nhắc học phí Zalo, Xuất Excel | **100%** | Client hoàn thành 100%; Đã bổ sung Docker Backend + 24/7 Cron Service gửi email khi tắt máy. |
| **Giai đoạn 5**: Nghỉ lễ, Sao chép tuần, In ấn, Thống kê thu nhập, Sao lưu | **100%** | Hoàn thành toàn bộ các tính năng mở rộng. |
| **Hạ tầng Docker**: Compose, Postgres 16, Backend API, Nginx | **100%** | Đã sẵn sàng `docker compose up -d` với đầy đủ tài liệu hướng dẫn. |

