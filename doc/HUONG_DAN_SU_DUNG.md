# CẨM NANG HƯỚNG DẪN SỬ DỤNG DÀNH CHO GIÁO VIÊN

Tài liệu này hướng dẫn từng bước cụ thể cách sử dụng ứng dụng trong công việc giảng dạy hằng ngày.

---

## 🔐 Bước 0: Đăng ký, Xác minh Email & Đăng nhập Tài khoản

1. **Đăng ký tài khoản mới**:
   * Tại màn hình **Đăng nhập**, bấm **"Đăng ký ngay"**.
   * Nhập **Họ và tên**, **Email**, **Mật khẩu** (tối thiểu 8 ký tự, có cả chữ cái và chữ số; thanh độ mạnh sẽ hiển thị trực tiếp), **Trường/Đơn vị** và **Số điện thoại** (tùy chọn).
   * Tích chọn đồng ý **Điều khoản và Chính sách bảo mật** (dữ liệu học sinh thuộc quyền riêng tư tuyệt đối của từng giáo viên, kể cả Admin cũng không xem được) và bấm **"Đăng ký tài khoản"**.
2. **Xác minh địa chỉ Email**:
   * Kiểm tra hộp thư để bấm vào nút **"Xác minh địa chỉ Email"** (có nút **"Gửi lại thư xác minh"** sau mỗi 60 giây).
   * Nếu email đã xác minh trùng với `ADMIN_EMAIL` cấu hình trên máy chủ, tài khoản tự động trở thành **Quản trị viên (Admin)** và kích hoạt ngay. Với tài khoản giáo viên ở chế độ mặc định, màn hình **"Tài khoản đang chờ Admin duyệt"** sẽ hiển thị kèm nút **"Gửi lại thông báo cho Admin"**.
3. **Đăng nhập & Giữ phiên trên iPhone (Màn hình chính PWA)**:
   * Có thể đăng nhập bằng **Email + Mật khẩu** (mặc định bật *"Ghi nhớ đăng nhập"* 30 ngày) hoặc bấm **"Tiếp tục với Google"** (chuyển trang toàn màn hình, tương thích hoàn toàn khi mở từ Màn hình chính iPhone).
4. **Cổng Quản trị Hệ thống (Dành riêng cho tài khoản Admin `/admin`)**:
   * Khi đăng nhập bằng tài khoản Admin (`email === ADMIN_EMAIL`), ứng dụng mở thẳng **Cổng Quản trị Hệ thống** với 4 phân hệ: **Duyệt & Quản lý Giáo viên**, **Mã mời Giáo viên**, **Chế độ Đăng ký & Bảo mật**, và **Nhật ký Kiểm toán**.
   * Nếu Admin cũng có lịch dạy cá nhân, có thể bấm mục **"Lịch dạy cá nhân"** ở thanh bên để chuyển sang công cụ xếp lịch riêng.
5. **Trang Hồ sơ & Bảo mật Cá nhân (`/profile` cho cả Admin và Giáo viên)**:
   * Bấm vào mục **"Hồ sơ"** trên thanh điều hướng để cập nhật Họ tên, Số điện thoại, Trường/Đơn vị công tác, Đổi mật khẩu, hoặc bấm **"Đăng xuất khỏi tất cả các thiết bị khác"**. Giáo viên có thể tải bản sao lưu `.json` hoặc tự xóa tài khoản cá nhân tại đây.

---

## 🚀 Bước 1: Khởi tạo Lớp học và Học sinh

### 1.1. Thêm lớp dạy thêm mới
1. Bấm vào tab **"Lớp"** trên thanh điều hướng dưới cùng.
2. Bấm nút **"+ Thêm lớp"** ở góc trên bên phải.
3. Nhập các thông tin:
   * **Tên lớp**: Ví dụ `Toán 9 Ôn thi`, `Toán 12 ĐH`.
   * **Địa điểm**: Ví dụ `Nhà riêng (Cầu Giấy)`, `Trung tâm ABC`.
   * **Giá / buổi**: Mức học phí chung cho 1 buổi học (vd `150000`).
   * **Màu sắc**: Chọn màu đại diện để dễ phân biệt trên thời gian biểu.
4. Bấm **"Thêm lớp"**.

### 1.2. Thêm lịch học cố định hằng tuần cho lớp
1. Bấm vào thẻ lớp vừa tạo để vào trang **Chi tiết lớp**.
2. Chuyển sang tab **"Lịch học"**.
3. Bấm **"+ Thêm lịch học cố định"**:
   * Chọn thứ trong tuần (vd Thứ 3, Thứ 7).
   * Chọn giờ bắt đầu và giờ kết thúc (vd `18:00` đến `19:30`).
   * Chọn ngày bắt đầu áp dụng.
4. Bấm **"Thêm lịch"**. Lịch này sẽ tự động lặp lại hằng tuần trên Thời gian biểu.

### 1.3. Thêm học sinh nhanh bằng cách dán danh sách
1. Trong trang Chi tiết lớp, tại tab **"Học sinh"**, bấm nút **"Dán danh sách"**.
2. Dán toàn bộ danh sách họ tên học sinh lấy từ file Excel hoặc Zalo (mỗi tên một dòng):
   ```text
   Nguyễn Văn A
   Trần Thị B
   Lê Hoàng Nam
   ```
3. Bấm **"Thêm học sinh"**. Toàn bộ học sinh sẽ được tạo ngay lập tức.
4. Nếu học sinh nào có **giá học phí riêng** (ví dụ con giáo viên được giảm giá), bấm biểu tượng bút chì để chỉnh sửa và điền vào ô *"Giá riêng/buổi"*.
5. **Học sinh Học thử**: Phí học thử ban đầu mặc định **bằng học phí đi học chính thức**, và giáo viên có thể thay đổi trạng thái (*Đang học / Học thử / Đã nghỉ*) cũng như chỉnh mức phí học thử (*Bằng phí học / Miễn phí 0đ / Nhập mức riêng*) bất cứ lúc nào tại Hồ sơ học sinh, Điểm danh hoặc Bảng học phí.

---

## 📅 Bước 2: Quản lý Thời gian biểu kiểu Google Calendar & Bảng tiết của Trường

Màn hình **"Lịch"** được thiết kế bám sát trải nghiệm của Google Calendar trên cả máy tính và điện thoại.

### 2.1. Chuyển đổi các chế độ xem & Lọc Sáng / Chiều / Tối
* **Các chế độ xem**: Chọn trên thanh công cụ: **Ngày** (`D`) | **Tuần** (`W`) | **Tháng** (`M`) | **4 ngày** (`X`) | **Lịch biểu** (`A`) | **Bảng tiết của trường** (`P`).
* **Bộ lọc buổi nhanh**: Bấm **Tất cả | 🌅 Sáng | ☀️ Chiều | 🌙 Tối** để phóng to và chỉ tập trung vào khung giờ cần xem.
* **Bảng tiết của trường**: Hiển thị dạng bảng giấy truyền thống (cột `T2–T7`, hàng `S1–S5` và `C1–C5`), bấm trực tiếp vào từng ô để điền tên lớp (`10A1`), đặt là tiết **"Trực"** hoặc xóa trống.
* **Xuất ảnh Thời khóa biểu tuần**: Bấm nút **Xuất lịch** để tải ảnh PNG toàn tuần (chia sẵn Sáng / Chiều / Tối) để gửi Zalo hoặc lưu về điện thoại, hoặc tải file `.ics` cho Google Calendar.

### 2.2. Nhận diện các khối lịch
* 🟦 **Khối xanh dương**: Tiết dạy ở trường phổ thông (tự gộp các tiết liền nhau cùng lớp như `S1–S2 · 10A1`).
* Slate **Khối xám xanh (nhãn Trực)**: Tiết trực giám thị / trực trường / dự giờ.
* 🟧 **Khối cam**: Lớp dạy thêm theo lịch cố định hằng tuần.
* 🟪 **Khối tím (nhãn Phát sinh / Bù)**: Buổi dạy thêm ngoài lịch hoặc buổi dạy bù.
* ⬜ **Khối mờ có gạch ngang**: Buổi đã bị dời hoặc đã bị hủy. Có mũi tên chỉ sang ngày giờ mới.

### 2.2. Dời một buổi học sang ngày khác
1. Chạm vào khối buổi học muốn dời.
2. Bấm chọn **"🔄 Dời sang ngày/giờ khác (tuần này)"**.
3. Chọn ngày mới, giờ bắt đầu và giờ kết thúc mới.
4. Hệ thống sẽ **tự động kiểm tra trùng lịch**: Nếu trùng với tiết trường hoặc lớp khác, hệ thống sẽ hiện cảnh báo đỏ ngay lập tức.
5. Xem trước tin nhắn Zalo đã được soạn sẵn ở khung bên dưới $\rightarrow$ Bấm nút **"Sao chép tin"** để dán gửi vào nhóm Zalo phụ huynh.
6. Bấm **"Xác nhận dời"**.

> [!NOTE]
> Thao tác dời buổi chỉ áp dụng cho tuần hiện tại. Sang tuần tiếp theo, lịch học sẽ tự động quay trở về ngày và giờ cố định ban đầu.

### 2.3. Hủy buổi học & Đánh dấu cần dạy bù
1. Chạm vào buổi học cần hủy.
2. Bấm chọn **"❌ Hủy buổi này"**.
3. Nhập lý do nghỉ (vd *"Cô bận họp đột xuất"*).
4. Tích chọn ô **"Đánh dấu cần dạy bù cho buổi này"** (mặc định được bật).
5. Bấm nút **"Sao chép tin"** để gửi thông báo nghỉ cho phụ huynh qua Zalo.
6. Bấm **"Xác nhận hủy buổi"**.
7. Ngay lập tức, khung cảnh báo **"Buổi cần dạy bù"** trên đầu trang sẽ ghi nhận buổi này.

### 2.4. Xếp lịch dạy bù
1. Tại khung màu vàng **"Buổi cần dạy bù"** ở đầu màn hình, bấm nút **"Xếp bù ngay"**.
2. Chọn ngày và giờ học bù.
3. Bấm **"Xếp lịch bù"**. Buổi bù sẽ xuất hiện trên lịch với màu tím và tự động liên kết với buổi bị hủy trước đó.

---

## 🤖 Bước 3: Nhập lịch Thông minh từ Tin nhắn Zalo và Ảnh TKB

### 3.1. Dán tin nhắn Zalo / SMS
1. Tại màn hình Thời gian biểu, bấm nút **"Dán tin nhắn Zalo"** ở thanh công cụ phía trên.
2. Sao chép tin nhắn của phụ huynh hoặc học sinh từ Zalo rồi dán vào khung văn bản. Có thể dán nhiều tin cùng lúc, ví dụ:
   ```text
   T7 sáng dạy lớp 9 từ 9h-11h
   Mai dời lớp 10 sang 19h30 nhé cô
   Tối nay nghỉ lớp 11 do mưa to
   ```
3. Bấm **"Phân tích tin nhắn"**.
4. **Kiểm tra và sửa tay**: Bảng xem trước sẽ hiển thị kết quả phân tích.
   * Thầy/cô có thể chỉnh sửa lại giờ, ngày hoặc chọn lại lớp nếu muốn.
   * Các ô có nghi vấn sẽ được tô màu vàng.
   * Nếu buổi học bị trùng với lịch trường, hệ thống sẽ báo đỏ cảnh báo.
5. Bấm **"Xác nhận lưu"** để hệ thống tự động đưa các buổi học vào lịch.

### 3.2. Quét Thời khóa biểu trường từ ảnh chụp
1. Bấm nút **"Nhập TKB trường từ ảnh"**.
2. Nhấn vào khung để tải ảnh chụp thời khóa biểu trường của bạn.
3. Bấm **"Trích xuất thời khóa biểu"**.
4. Kiểm tra danh sách các tiết học (Thứ, Tiết, Lớp, Môn, Phòng). Thầy/cô có thể sửa tay từng ô hoặc thêm/bớt tiết học.
5. Chọn khoảng thời gian áp dụng (ví dụ từ đầu học kỳ đến cuối học kỳ).
6. Bấm **"Lưu vào lịch"**. Toàn bộ tiết trường sẽ xuất hiện trên màn hình tuần dưới dạng các khối màu xanh dương.

---

## 📝 Bước 4: Điểm danh Buổi học trong 2 Chạm

1. Trên màn hình Thời gian biểu, bấm vào buổi học của ngày hôm nay $\rightarrow$ Chọn **"Vào điểm danh buổi này"** (hoặc vào tab *Lớp* $\rightarrow$ chọn lớp $\rightarrow$ tab *Điểm danh*).
2. Mặc định hệ thống tự chọn buổi học gần nhất.
3. Điểm danh cực nhanh:
   * Nếu cả lớp đi đủ: Bấm nút **"Tất cả có mặt"** (1 chạm là xong cả lớp).
   * Nếu có học sinh vắng: Bấm nút **"Vắng"** ở dòng của học sinh đó (hệ thống tinh gọn tối ưu gồm 2 trạng thái: **Có mặt** và **Vắng**).
4. Mở rộng phần **"📝 Nội dung buổi học"** bên dưới để ghi chép nội dung bài giảng và bài tập về nhà. Dữ liệu sẽ tự động lưu lại.

---

## 💵 Bước 5: Quản lý Công nợ Học phí FIFO, Ghi nhận Khoản thu & Xuất Báo cáo (Mục 2.9)

Vào tab **"Học phí"**, bạn có 2 chế độ chuyển nhanh trên thanh tiêu đề: **"Theo tháng"** và **"Công nợ"**.

1. **Chế độ "Theo tháng" & Chi tiết từng buổi của học sinh**:
   * Chọn tháng cần xem (ví dụ `Tháng 11/2026`).
   * Hệ thống tự động đếm số buổi **Có mặt trong giai đoạn Đang học** $\times$ Đơn giá = **Phải thu**; các buổi trong giai đoạn **Học thử** hiển thị ở cột **"Học thử"** với đơn giá `0đ` kèm dòng ghi chú (ví dụ `"Học thử 04/11–06/11 (2 buổi miễn phí), chính thức từ 11/11"`).
   * Bấm trực tiếp vào **tên học sinh** hoặc nút **"Chi tiết"** để mở ngăn **Chi tiết học phí tháng** (`StudentFeeDetailDrawer`) gồm lịch tháng thu nhỏ chấm màu từng buổi, bảng liệt kê từng buổi học trong tháng (sửa nhanh điểm danh ngay tại dòng) và 3 nút: **"Gửi phụ huynh"**, **"Xuất ảnh"** (PNG), **"Xuất PDF"**.
   * Cột **Đã thu** và **Còn thiếu / Dư** tự động phân bổ các khoản thu vào tháng nợ cũ nhất trước (**FIFO**). Mỗi tháng hiển thị trạng thái: `Đủ`, `Còn thiếu`, `Chưa đóng` hoặc `Đóng dư`.
   * **Chốt tháng**: Khi chọn một lớp cụ thể, bấm nút **"Chốt tháng"** để khóa số tiền phải thu của tháng đó (các thay đổi điểm danh hay đơn giá về sau sẽ không làm đổi số đã chốt trừ khi bấm **"Mở chốt"**).
2. **Chuyển Học thử sang Đang học, Học ghép & Chuyển lớp giữa tháng**:
   * Trong trang Chi tiết lớp, khi học sinh học thử đã có mặt đủ 2 buổi, thanh nhắc màu vàng sẽ hiện ở đầu trang $\rightarrow$ Bấm **"Chuyển sang đang học"** để chọn ngày bắt đầu tính phí và xem trước học phí dự kiến.
   * Để cho học sinh học bù/học ghép sang lớp khác 1–2 buổi, bấm **"Học ghép 1-2 buổi"** (trong danh sách điểm danh hoặc tab Học ghép). Để đăng ký học thêm dài hạn ở lớp thứ 2 hoặc chuyển hẳn sang lớp mới giữa tháng, bấm **"Học thêm dài hạn"** hoặc **"Chuyển lớp"**.
3. **Ghi nhận khoản thu (và gộp khoản thu cho anh chị em)**:
   * Bấm nút **"Thu tiền"** ở dòng học sinh (hoặc trong trang Chi tiết lớp $\rightarrow$ tab Học sinh).
   * Nhập số tiền (mặc định bằng số đang nợ, có nút gợi ý nhanh **"Đóng đủ số còn thiếu"**), chọn ngày thu, hình thức (`Tiền mặt` / `Chuyển khoản` / `Khác`) và ghi chú.
   * Nếu phụ huynh có nhiều con theo học (anh chị em cùng SĐT hoặc tên phụ huynh), bật tùy chọn **"Gộp khoản thu cho nhiều học sinh cùng phụ huynh"** để nhập tổng tiền và tự chia theo nợ của từng em (cho phép sửa tay).
4. **Chế độ "Công nợ" & Sổ học phí**:
   * Chuyển sang chế độ **"Công nợ"** để xem 3 chỉ số: `Tổng đang nợ`, `Tổng đang dư`, `Số phụ huynh đang nợ` và danh sách học sinh đang nợ (kể cả học sinh đã nghỉ mà còn nợ), mặc định sắp xếp theo **nợ lâu nhất**.
   * Bấm **"Sổ học phí"** để mở bảng theo thứ tự thời gian gồm từng tháng (phải thu), từng khoản thu, số dư sau mỗi dòng và nhật ký sửa/xóa khoản thu.
5. **Nhắc học phí qua Zalo (2 mẫu tin)**:
   * Bấm biểu tượng tin nhắn cạnh tên học sinh $\rightarrow$ Chọn mẫu **"Nhắc nhẹ"** hoặc **"Nhắc lần 2"**. Tin nhắn tự động liệt kê rõ từng tháng còn thiếu và tổng số tiền cần đóng.
6. **Xuất file Excel (`.xlsx`) 5 Sheet**:
   * Bấm nút **"Xuất Excel"** để tải file bảng tính gồm 5 sheet: `Học phí YYYY-MM`, `Chi tiết từng buổi`, `Học ghép và học thêm`, `Công nợ` và `Các khoản thu`.

---

## ⚙️ Bước 6: Đồng bộ Google Calendar Một chiều, Thông báo Gmail & Sao lưu (Mục 2.10)

Vào tab **"Cài đặt"**:

1. **Đồng bộ lịch sang Google Calendar (Một chiều)**:
   * Mở nhóm **"Google Calendar & AI"** $\rightarrow$ Bấm **"Kết nối Google Calendar"**.
   * Ứng dụng tự tạo một lịch phụ riêng tên **"Lịch dạy"** trên Google Calendar để xem trên điện thoại, đồng hồ thông minh và nhận thông báo nhắc trước giờ dạy mà không lẫn với lịch cá nhân.
   * Tùy chỉnh: Bật/tắt đồng bộ, chọn nội dung (`Chỉ lịch trường` / `Chỉ dạy thêm` / `Cả hai`), chọn nhiều mốc phút nhắc riêng cho lịch trường và dạy thêm (mặc định `30 phút`), chọn số tuần đồng bộ phía trước (mặc định `8 tuần`), và bật nhắc **"Đi sớm để kịp di chuyển"** khi 2 ca liên tiếp khác địa điểm cách nhau dưới 20 phút.
   * Có các nút **"Đồng bộ ngay"**, **"Xóa sự kiện đã đồng bộ"**, **"Ngắt kết nối"** và bảng **Lịch sử đồng bộ**.
2. **Chế độ Sáng / Tối**: Gạt công tắc Dark Mode để bảo vệ mắt khi làm việc buổi tối.
3. **Đồng bộ PostgreSQL**: Khi Docker backend đang chạy, dữ liệu tự đẩy lên database. Bấm **Đồng bộ DB** nếu cần kéo/đẩy tay.
4. **Cấu hình AI (Google Gemini)**: Điền Gemini API Key cá nhân để tăng độ chính xác khi đọc ảnh TKB trường hoặc tin nhắn Zalo.
5. **Cài đặt thông báo Gmail**: Nhập địa chỉ Gmail, chọn giờ gửi hằng ngày (vd `06:00` sáng) và bấm **"Xem trước nội dung email"**.
6. **Quản lý ngày nghỉ lễ & Sao lưu dữ liệu (Backup & Restore)**:
   * Thêm ngày nghỉ lễ để tự động ẩn toàn bộ lịch dạy trong ngày đó.
   * Bấm **"Tải file sao lưu (.json)"** hoặc **"Khôi phục từ file JSON"** để bảo toàn toàn bộ dữ liệu lịch, điểm danh, giao dịch thu học phí và chốt tháng.


