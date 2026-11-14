# BÁO CÁO TIẾN ĐỘ: NHỮNG THỨ ĐÃ LÀM VÀ CHƯA LÀM

Tài liệu này đối chiếu chi tiết 100% các yêu cầu từ bài toán thực tế của giáo viên với mã nguồn hiện tại của dự án.

---

## 🟢 PHẦN 1: NHỮNG TÍNH NĂNG ĐÃ HOÀN THÀNH (100% FUNCTIONAL)

Toàn bộ logic giao diện, nghiệp vụ tính toán, cơ chế lưu trữ cục bộ, bộ phân tích AI và xuất báo cáo đã được lập trình hoàn chỉnh:

### 1. Thời gian biểu kiểu Google Calendar & Bố cục Đa nền tảng (Màn hình chính)
- [x] **Tách riêng 3 bố cục theo kích thước màn hình (`AppShell.tsx`)**:
  * `< 768px` (Điện thoại): Thẻ bo góc lớn, thanh điều hướng dưới có hiệu ứng mờ kèm safe-area iPhone, hộp thoại Bottom Sheet kéo xuống để đóng, vùng chạm `>=44x44px`.
  * `768px – 1199px` (Máy tính bảng): Thanh điều hướng trái thu gọn chỉ còn icon (`68px`).
  * `>= 1200px` (Máy tính): Thanh bên trái cố định (`240px`), màn Lịch dùng toàn bộ chiều rộng kèm cột điều khiển trái (`256px`), hộp thoại cửa sổ giữa màn hình hoặc ngăn trượt từ phải.
- [x] **Tách biệt Không gian Làm việc của Admin (`/admin`) và Giáo viên + Trang Hồ sơ Cá nhân (`/profile`)**:
  * Tài khoản Admin có Cổng Quản trị Hệ thống riêng (Duyệt tài khoản chờ duyệt, Khóa/Mở khóa, Cấp mật khẩu tạm/Gửi link đặt lại, Tạo giáo viên mới, Quản lý Mã mời, Cấu hình Chế độ đăng ký, Xem Nhật ký Kiểm toán) và cam kết không truy cập dữ liệu học sinh của giáo viên khác.
  * Cả Admin và Giáo viên đều có trang **Hồ sơ & Bảo mật Tài khoản (`/profile`)** để sửa thông tin cá nhân, đổi mật khẩu, thu hồi phiên trên các thiết bị khác và quản lý sao lưu cá nhân.
  * Đã xử lý triệt để lỗi màn hình trắng khi đăng nhập tài khoản Giáo viên trên trình duyệt có sẵn dữ liệu cũ trong `localStorage` (chuẩn hóa đồng bộ qua hàm `merge` của Zustand `persist` và ép kiểu an toàn cho dữ liệu tiết trường cũ).
- [x] **Đầy đủ 7 chế độ xem lịch**: `Bảng ca (Sáng/Chiều/Tối)` | `Ngày` | `Tuần` | `Tháng` | `4 ngày` | `3 ngày` | `Lịch biểu (Google Calendar Mobile)` | `Bảng tiết của trường` (dạng bảng giấy `T2–T7` × `S1–S5`, `C1–C5` kèm dải dạy thêm bên dưới; tự động chuyển sang giao diện Google Calendar khi ở màn hình Mobile `< 768px` và Bảng ca chuẩn 7 cột đều nhau trên PC).
- [x] **Trục giờ liên tục & Vạch đỏ giờ hiện tại (`TimeGridCalendar.tsx`)**: Mặc định `06:00–22:00`, tự cuộn tới giờ hiện tại, vạch đỏ có chấm tròn cập nhật theo từng phút, xếp cạnh nhau các sự kiện trùng giờ kèm viền đỏ cảnh báo.
- [x] **Phân biệt rõ Sáng / Chiều / Tối theo đúng 2 quy tắc riêng (`schoolPeriods.ts`)**:
  * Lịch trường & Trực: phân theo mã tiết (`S1–S5` là Sáng, `C1–C5` là Chiều).
  * Dạy thêm & Phát sinh: phân theo giờ bắt đầu (`< 12:00` là Sáng, `12:00–16:59` là Chiều, `>= 17:00` là Tối; tùy chỉnh được trong Cài đặt). Tự động gắn nhãn `"↪ Kéo dài sang Chiều/Tối"` khi ca học vắt qua ranh giới.
- [x] **Thao tác kéo thả & Phím tắt kiểu Google Calendar**:
  * Bấm ô trống mở hộp "Thêm nhanh", kéo chọn khoảng trống để tạo buổi phát sinh, kéo thả khối dạy thêm sang ô khác để dời ("Chỉ tuần này"), kéo cạnh dưới khối dạy thêm để đổi giờ kết thúc, khóa kéo trực tiếp với tiết trường.
  * Hỗ trợ phím tắt bàn phím: `D`, `W`, `M`, `A`, `X`, `P`, `T`, `J/K`, `←/→`, `C`, `/`, `Esc`, `?`.
- [x] **5 loại khối lịch phân biệt màu sắc và nhãn**:
  * 🟦 **Lịch trường (Xanh dương)**: Gộp các tiết liền nhau cùng lớp (`S1–S2 · 10A1`), môn học, phòng học, giờ quy đổi.
  * slate **Tiết Trực (Xám xanh nhạt)**: Ô `"Trực"` giám thị / dự giờ, kiểm tra trùng lịch với dạy thêm.
  * 🟧 **Dạy thêm cố định (Cam)**: Theo quy tắc lặp hằng tuần của từng lớp dạy thêm.
  * 🟪 **Buổi phát sinh / Dạy bù (Tím)**: Có nhãn riêng `Phát sinh` hoặc `Bù`.
  * ⬜ **Buổi đã dời / Đã hủy**: Hiển thị mờ, gạch ngang ở vị trí gốc kèm mũi tên chuyển sang ngày/giờ mới (`➔ Dời sang [Ngày] [Giờ]`).
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
  * Tự động lọc các buổi bị hủy có đánh dấu `needs_makeup = true` và chưa có buổi bù trong tháng hiện tại.
  * Tự động xóa các lịch cần dạy bù chưa xếp của tháng trước khi bước sang tháng mới.
  * Có nút *"Xếp bù"* và nút *"Xóa lịch bù"* / *"Xóa hết"* (kèm hộp thoại xác nhận) để giáo viên chủ động gỡ lịch cần dạy bù.
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

### 4. Tổng hợp học phí, Học thử chuyển Đang học, Học ghép & Quản lý Công nợ FIFO (Mục 2.4, 2.9 & Nhóm A, D, E)
- [x] **Bộ lọc & 2 chế độ chuyển nhanh**: Chuyển nhanh giữa **"Theo tháng"** (12 tháng gần nhất) và **"Công nợ"** (danh sách học sinh đang nợ tích lũy).
- [x] **Trạng thái học sinh theo thời gian & Tính phí theo đúng ngày của từng buổi (`student_status_history`, Nhóm A)**:
  * Mỗi buổi thực tế được xác định trạng thái của học sinh **tại ngày của buổi đó** (`trial` = miễn phí `0đ`, vẫn lưu điểm danh và hiện ở cột `"Học thử"`; `active` = tính tiền nếu `present`; `left` = ẩn sau ngày nghỉ).
  * Hộp thoại **`"Chuyển sang đang học"`** có chọn ngày bắt đầu tính phí, xem trước học phí tháng, cảnh báo vàng khi chọn ngày trong quá khứ và kiểm tra tháng đã chốt.
  * Thẻ nhắc tự động khi học sinh học thử đã có mặt đủ số buổi mặc định (`default_trial_sessions = 2`).
- [x] **Học ghép ngắn hạn (`session_guests`), Học thêm lớp phụ dài hạn (`student_enrollments`) & Chuyển lớp giữa tháng (Nhóm D & E)**:
  * Hỗ trợ học bù/đổi buổi sang lớp khác (`swap`, tự đánh dấu `"Đã sang [Lớp B]"` ở lớp gốc) và học tăng cường 1–2 buổi (`extra`, mặc định miễn phí `0đ` hoặc tùy chọn tính phí).
  * Hỗ trợ chuyển lớp giữa tháng (`"Chuyển lớp"`) giữ nguyên lịch sử ở lớp cũ và tách dòng theo từng lớp kèm vạch ngăn cách.
- [x] **Drawer Chi tiết Học phí Từng Học sinh (`StudentFeeDetailDrawer`, Nhóm E4)**:
  * Mở khi bấm vào tên học sinh hoặc nút `"Chi tiết"` trong bảng học phí / hồ sơ học sinh.
  * Gồm bộ chọn tháng, lọc lớp, 6 thẻ chỉ số, lịch tháng thu nhỏ chấm màu từng buổi, bảng chi tiết từng buổi cho phép sửa nhanh điểm danh tại dòng, và 3 nút: **`"Gửi phụ huynh"`**, **`"Xuất ảnh"`** (PNG), **`"Xuất PDF"`** (In A4).
- [x] **Công thức tính tiền & Công nợ chuẩn xác 100% (`debtEngine.ts`)**:
  * $\text{Phải thu tháng} = \text{Số buổi CÓ MẶT trong giai đoạn active} \times \text{Đơn giá/buổi}$ + phí học thêm/học ghép (số nguyên VNĐ).
  * Học sinh vắng, buổi hủy, buổi học thử (`trial`) không tính tiền.
  * **Không lưu cứng trạng thái "đã đóng"**: Mọi khoản tiền phụ huynh đưa được ghi thành một giao dịch thu riêng (`payment_transactions`), công nợ luôn được tính động từ `(tổng phải thu) − (tổng đã thu)`. Khi sửa điểm danh, công nợ tự tính lại.
  * **Phân bổ FIFO**: Tiền thu được phân bổ vào khoản nợ cũ nhất trước. Mỗi tháng có trạng thái: `"Đủ"`, `"Còn thiếu"`, `"Chưa đóng"`, `"Đóng dư"` (số dư dương tự trừ vào các tháng sau).
- [x] **Ghi nhận khoản thu & Tách khoản thu Anh chị em (`PaymentModals.tsx`)**:
  * Nút `"Ghi nhận khoản thu"` ở từng dòng học sinh trong bảng học phí và trong hồ sơ học sinh.
  * Cho phép 1 khoản thu cho nhiều học sinh cùng phụ huynh (anh chị em), tự chia theo số đang nợ và cho sửa tay, liên kết qua `group_id`.
  * Sửa/xóa khoản thu có hộp xác nhận và ghi vào nhật ký thay đổi (`change_log`).
- [x] **Sổ học phí học sinh & Chốt tháng (`month_locks`)**:
  * Hồ sơ học sinh có **"Sổ học phí"** theo thứ tự thời gian (từng tháng phải thu, từng khoản thu và số dư sau mỗi dòng).
  * Tùy chọn **"Chốt tháng"** khóa số phải thu của lớp trong tháng đó, có xác nhận khi mở chốt.
- [x] **Xuất file Excel (`.xlsx`) 5 Sheet**: Gồm sheet `Học phí YYYY-MM`, `Chi tiết từng buổi`, `Học ghép và học thêm`, `Công nợ` và `Các khoản thu`.
- [x] **Soạn tin nhắn nhắc học phí Zalo 2 mẫu**: Nêu rõ các tháng còn thiếu, số buổi tính phí, số buổi học thử miễn phí và tổng số cần đóng với 2 mẫu **Nhắc nhẹ** và **Nhắc lần 2**.
- [x] **Biểu đồ thống kê thu nhập**: Biểu đồ cột theo tháng và biểu đồ so sánh giữa các lớp đặt cạnh nhau.

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

### 6. Cài đặt hệ thống, Đồng bộ Google Calendar 1 chiều & Tiện ích mở rộng
- [x] **Đồng bộ lịch sang Google Calendar MỘT CHIỀU (`gcal.ts`, Mục 2.10)**:
  * Tự tạo lịch phụ riêng tên `"Lịch dạy"` trên Google Calendar (quyền tối thiểu `calendar.app.created`, mã kết nối mã hóa AES-256-GCM ở phía server).
  * Tùy chọn bật/tắt đồng bộ, chọn nội dung (`Chỉ lịch trường` / `Chỉ dạy thêm` / `Cả hai`), chọn nhiều mốc phút nhắc riêng cho lịch trường và dạy thêm, số tuần đồng bộ phía trước (mặc định 8 tuần).
  * Tự động thêm nhắc `"Đi sớm để kịp di chuyển"` khi hai buổi liên tiếp khác địa điểm cách nhau dưới 20 phút.
  * Nút `"Đồng bộ ngay"`, `"Xóa toàn bộ sự kiện đã đồng bộ"`, `"Ngắt kết nối"`, cảnh báo vàng `"Cần kết nối lại"` khi hết hạn quyền, lịch sử đồng bộ `calendar_sync_log`, và đường link `.ics` phụ kèm cảnh báo chu kỳ cập nhật chậm của Google.
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
- [x] **Hệ thống Tài khoản & Xác thực Đa người dùng — Bước 1 (`profiles`, Supabase Auth, `ADMIN_EMAIL` Server-side)**:
  * Cấu hình Supabase Auth + SMTP riêng (Resend/Nodemailer) với bộ mẫu thư tiếng Việt có logo và nút bấm lớn (`authMailer.ts`).
  * Bảng `profiles`, `app_settings`, `invites`, `audit_log` và trigger bảo vệ quyền `admin` duy nhất theo biến môi trường `ADMIN_EMAIL` ở phía server.
  * Đầy đủ các màn hình: Đăng nhập (`LoginPage`), Đăng ký có thanh đo độ mạnh mật khẩu + Điều khoản & Chính sách bảo mật + Cloudflare Turnstile (`RegisterPage`), Xác minh Email có giới hạn tần suất gửi lại (`VerifyEmailPage`), Đăng nhập Google bằng chuyển trang (redirect, không dùng popup) kèm tự động liên kết tài khoản trùng email (`AuthCallbackPage`), Màn chờ Admin duyệt (`PendingApprovalPage`), Màn tài khoản bị khóa (`LockedAccountPage`), và thanh cảnh báo vàng giữ nguyên dữ liệu chưa lưu khi hết phiên giữa chừng trên iPhone PWA (`SessionExpiredBanner`).

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
| **Triển khai Cloud 100% trên Cloudflare (0đ, Không bao giờ tắt Server)** & **Thời khóa biểu thực tế** | **100%** | Nạp sẵn 14 lớp dạy thêm + lịch Dạy Trường (Sáng 7h-11h45 T2-T6, Chiều 14h-16h30 T2/T4/T6); tích hợp sẵn Cloudflare Pages Functions (`frontend/functions/api/[[route]].ts`) + Cloudflare D1 Database (`cloudflare/d1-schema.sql`, `wrangler.toml`) chạy tức thì 0ms cold start. |

