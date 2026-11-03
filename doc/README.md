# HỆ THỐNG QUẢN LÝ LỊCH DẠY VÀ LỚP DẠY THÊM CHO GIÁO VIÊN (TEACHER SCHEDULE & CLASS MANAGER)

> **Dành riêng cho giáo viên Việt Nam**: Tối ưu hóa trên thiết bị di động (Mobile-First), giao diện tiếng Việt thân thiện, tích hợp AI đọc tin nhắn Zalo và ảnh Thời khóa biểu trường, tự động tính học phí theo số buổi có mặt thực tế.

---

## 📖 1. Giới thiệu Dự Án

### 1.1. Bối cảnh thực tế
Đa số giáo viên tại Việt Nam vừa giảng dạy tại các trường phổ thông (theo thời khóa biểu cố định hoặc thay đổi theo học kỳ), vừa mở các lớp dạy thêm tại nhà hoặc tại các trung tâm. 
Đặc thù công việc phát sinh nhiều bất cập trong quản lý:
1. **Lịch dạy thường xuyên biến động**: Học sinh xin đổi lịch vì bận học ở trường, giáo viên bận họp đột xuất phải dời buổi sang ngày khác, các buổi học bù phát sinh liên tục.
2. **Kênh trao đổi chính là Zalo**: Phụ huynh và học sinh chủ yếu nhắn tin xin nghỉ, hẹn lịch qua Zalo bằng văn bản ngắn gọn (ví dụ: *"T7 tuần này cho cháu học từ 9h-11h"*, *"Cô ơi mai lớp 10 dời sang 19h30"*...). Việc sao chép thủ công vào sổ tay rất dễ quên hoặc xếp trùng lịch.
3. **Thời khóa biểu trường bằng ảnh chụp**: Mỗi đầu học kỳ hoặc mỗi đợt đổi tiết, nhà trường gửi ảnh TKB dạng lưới/bảng, việc nhập lại từng tiết vào ứng dụng rất mất thời gian.
4. **Điểm danh và học phí phức tạp**: Phụ huynh chỉ chấp nhận đóng tiền theo số buổi học sinh thực tế có mặt. Các buổi nghỉ (có phép hoặc không phép), buổi cô bận nghỉ, buổi học thử **không được tính tiền**. Việc tính toán thủ công vào cuối tháng dễ nhầm lẫn và gây tranh cãi.

### 1.2. Mục tiêu của ứng dụng
Xây dựng một giải pháp Web App toàn diện, hoạt động mượt mà trên điện thoại và máy tính, giải quyết trọn vẹn chu trình làm việc của người thầy:
- **Hợp nhất thời gian biểu**: Xem toàn bộ lịch trường và lịch dạy thêm trên cùng một màn hình.
- **Tự động hóa bằng AI**: Đọc hiểu tin nhắn Zalo và quét ảnh thời khóa biểu trường với bảng kiểm tra cho phép sửa tay.
- **Điểm danh 1-2 chạm**: Tối ưu thao tác trên di động, điểm danh nhanh, ghi chú bài giảng.
- **Tự động hóa học phí**: Tính toán chuẩn xác theo số buổi có mặt thực tế, tạo tin nhắn nhắc học phí Zalo 1-chạm, xuất file Excel (`.xlsx`) chuyên nghiệp.
- **Trợ lý thông báo**: Soạn lịch dạy hằng ngày gửi về Gmail cá nhân của giáo viên.

---

## 🛠️ 2. Công nghệ sử dụng (Tech Stack)

| Thành phần | Công nghệ lựa chọn | Lý do sử dụng |
| :--- | :--- | :--- |
| **Giao diện (Frontend)** | React 18 + TypeScript + Vite | Tốc độ tải trang cực nhanh, kiểm soát chặt chẽ kiểu dữ liệu, bảo đảm tính ổn định. |
| **Styling** | Tailwind CSS v3 + CSS Variables | Thiết kế Mobile-First, giao diện hiện đại, hỗ trợ Dark Mode / Light Mode hoàn hảo. |
| **Hạ tầng Backend & Cron** | Docker + Node.js (Express) + PostgreSQL 16 | REST `/api/sync` hai chiều, database 11 bảng, cron gửi email 24/7. |
| **Quản lý trạng thái (State)** | Zustand + LocalStorage Persistence | Dữ liệu được lưu trữ trực tiếp trên trình duyệt, không bị mất khi reload hoặc mất mạng, phản hồi tức thì. |
| **Xử lý ngày giờ** | `date-fns` (Locale Việt Nam) | Định dạng ngày tháng kiểu Việt Nam (`dd/MM/yyyy`), tuần bắt đầu từ Thứ Hai, múi giờ `Asia/Ho_Chi_Minh`. |
| **Xử lý Excel** | SheetJS (`xlsx`) | Xuất file Excel bảng tính chuẩn (`.xlsx`) trực tiếp từ client. |
| **Biểu tượng (Icons)** | Lucide React | Hệ thống icon tối giản, nhẹ, chuẩn thiết kế hiện đại. |
| **Trí tuệ nhân tạo (AI)** | Google Gemini 1.5 API + Vietnamese Rule-based NLP | Hybrid AI: Vừa có bộ phân tích tiếng Việt chạy offline ngay lập tức, vừa kết nối được Gemini Vision để đọc ảnh TKB. |

---

## 📁 3. Cấu trúc thư mục tài liệu (`/doc`)

1. **`doc/README.md`**: Giới thiệu dự án, công nghệ, hướng dẫn khởi chạy.
2. **`doc/QUY_TAC_PHAT_TRIEN.md`**: **Quy tắc bắt buộc** mọi lần thêm/xóa/sửa đều phải ghi lại trong `doc/`.
3. **`doc/CHANGELOG.md`**: Nhật ký thay đổi chi tiết theo thời gian (Added, Changed, Removed, Fixed).
4. **`doc/DOCKER_BACKEND.md`**: Hướng dẫn triển khai Backend, Database PostgreSQL và Cron Service bằng Docker Compose.
5. **`doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md`**: Bảng chi tiết toàn bộ tính năng **ĐÃ HOÀN THÀNH** và danh sách các hạng mục **CẦN MỞ RỘNG / NÂNG CẤP**.
6. **`doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md`**: Giải thích kiến trúc, công thức tính lịch thực tế, logic phát hiện xung đột lịch, mô hình dữ liệu.
7. **`doc/HUONG_DAN_SU_DUNG.md`**: Cẩm nang hướng dẫn sử dụng từng bước dành cho giáo viên.

---

## 🚀 4. Hướng dẫn cài đặt và khởi chạy dự án

### Yêu cầu môi trường
- **Node.js**: Phiên bản 18.x hoặc 20.x trở lên.
- **Trình quản lý gói**: `npm` (hoặc `yarn`, `pnpm`).

### Các bước khởi chạy:
```powershell
# 1. Di chuyển vào thư mục dự án
cd c:\Users\MSI\app_gv

# 2. Cài đặt các gói phụ thuộc (nếu chưa cài)
npm install

# 3. Khởi chạy môi trường phát triển (Development)
npm run dev
```

Sau khi chạy lệnh, mở trình duyệt tại địa chỉ hiển thị trên terminal (thường là `http://localhost:5173`).

### Khởi chạy toàn bộ hệ thống bằng Docker Compose:
```powershell
# Chạy Frontend + Backend API + PostgreSQL 16 + 24/7 Cron Service
docker compose up -d --build
```
Ứng dụng sẽ hoạt động tại `http://localhost`, API tại `http://localhost/api/health`. Xem thêm chi tiết tại [**`doc/DOCKER_BACKEND.md`**](file:///c:/Users/MSI/app_gv/doc/DOCKER_BACKEND.md).

### Biên dịch bản phát hành (Production Build tĩnh):
```powershell
npm run build
```
Bản build tĩnh tối ưu sẽ được tạo trong thư mục `dist/`, sẵn sàng triển khai lên Vercel, Netlify, Cloudflare Pages hoặc Firebase Hosting.

