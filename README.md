# 📚 Hệ Thống Quản Lý Lịch Dạy & Lớp Dạy Thêm Cho Giáo Viên
### *(Teacher Schedule & Class Manager)*

[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite%20%7C%20TypeScript-blue?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v3-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Backend](https://img.shields.io/badge/Backend-Node.js%2020%20%7C%20Express-green?logo=nodedotjs)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%2016-336791?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Container-Docker%20Compose-2496ed?logo=docker)](https://www.docker.com/)
[![AI](https://img.shields.io/badge/AI-Gemini%201.5%20%2B%20NLP%20Tiếng%20Việt-orange?logo=google)](https://aistudio.google.com/)

> Ứng dụng web toàn diện được thiết kế chuyên biệt cho **giáo viên tại Việt Nam**: tối ưu giao diện trên điện thoại (Mobile-First), giao diện tiếng Việt thân thiện, tích hợp AI đọc hiểu tin nhắn hẹn lịch Zalo và quét ảnh Thời khóa biểu trường, tự động tính học phí theo số buổi có mặt thực tế và gửi email báo lịch dạy hằng ngày lúc 06:00 sáng 24/7.

---

## 🌟 Điểm Nổi Bật Của Hệ Thống

| Tính năng | Mô tả chi tiết |
| :--- | :--- |
| 📅 **Hợp nhất Lịch Dạy** | Xem trọn vẹn cả tuần trên một màn hình: Lịch trường (xanh dương), Lớp dạy thêm cố định (cam), Buổi phát sinh (tím). Tự động gạch ngang buổi dời và hiển thị mũi tên chỉ ngày giờ mới. |
| ⚠️ **Phát hiện Trùng Lịch** | Thuật toán kiểm tra xung đột thời gian thực: Báo động đỏ khi trùng giờ, báo vàng khi khoảng cách giữa 2 ca dạy ít hơn 20 phút (không kịp di chuyển). |
| 🤖 **AI Đọc Tin Nhắn Zalo** | Bộ NLP Tiếng Việt offline tự động trích xuất ý định từ tin nhắn phụ huynh/học sinh (*"mai dời lớp 10 sang 19h30"*, *"T7 học 9h-11h"*). Có bảng xem trước cho phép sửa tay từng ô trước khi lưu. |
| 📷 **AI Quét Ảnh TKB Trường** | Tích hợp Google Gemini 1.5 Flash Vision quét ảnh chụp thời khóa biểu trường, tự động bóc tách thứ, tiết, lớp, môn và phòng học. |
| 📝 **Điểm Danh 1–2 Chạm** | Tối ưu thao tác trên di động: Nút "Tất cả có mặt", đổi trạng thái Vắng / Có phép cực nhanh, ghi chú bài giảng cho từng buổi. |
| 💰 **Tính Học Phí Thực Tế** | $\text{Học phí} = \text{Số buổi CÓ MẶT} \times \text{Đơn giá}$. Tự động loại trừ buổi nghỉ, buổi hủy, học thử. Soạn tin nhắn Zalo nhắc học phí 1-chạm và xuất file Excel (`.xlsx`). |
| ⏰ **Trợ Lý Email 24/7** | Tiến trình Docker Cron chạy ngầm 24/7 tự động gửi email tổng hợp lịch dạy mỗi sáng lúc 06:00 ngay cả khi giáo viên tắt máy tính/điện thoại. Tự động bỏ qua ngày lễ. |
| 🔄 **Đồng Bộ Hai Chiều** | Hoạt động Offline hoàn toàn (Zustand + LocalStorage) kết hợp đồng bộ hai chiều mượt mà với PostgreSQL 16 qua REST API. |

---

## 🏗️ Kiến Trúc Thư Mục (Clean Monorepo)

Dự án được cấu trúc rõ ràng, chuẩn mực và dễ bảo trì:

```
app_gv/
├── 🌐 frontend/            # Giao diện người dùng (React 18, TypeScript, Vite, Tailwind CSS)
│   ├── src/
│   │   ├── components/    # Schedule Modals, UI Buttons, Navbars, Confirm Dialogs
│   │   ├── pages/         # SchedulePage, ClassesPage, ClassDetailPage, FeesPage, SettingsPage
│   │   ├── store/         # Zustand Store & LocalStorage Persistence
│   │   ├── lib/           # AI Parsers, Conflict Detectors, Date Utilities, Backend Sync
│   │   └── types/         # TypeScript Data Models
│   ├── public/            # Favicon, SVG Assets
│   ├── Dockerfile         # Multi-stage Docker build với Nginx Alpine
│   ├── nginx.conf         # Cấu hình reverse proxy chuyển tiếp /api
│   └── package.json       # Dependencies của Frontend
│
├── ⚙️ backend/             # Dịch vụ máy chủ (Node.js, Express, TypeScript, Cron Service)
│   ├── src/
│   │   ├── server.ts      # REST API (/api/sync, /api/health, /api/email/test, /api/ai/*)
│   │   ├── cron.ts        # Tiến trình Cron chạy ngầm 24/7 tự động gửi Gmail 06:00
│   │   ├── mailer.ts      # Dịch vụ gửi email HTML lịch dạy qua SMTP / Gmail App Password
│   │   ├── sync.ts        # Đọc & ghi đồng bộ 11 bảng PostgreSQL
│   │   ├── db.ts          # PostgreSQL Connection Pool
│   │   └── schema.ts      # Tự động đồng bộ schema database khi khởi động
│   ├── sql/init.sql       # Script khởi tạo 11 bảng PostgreSQL
│   ├── Dockerfile         # Multi-stage Docker build cho Node 20
│   └── package.json       # Dependencies của Backend
│
├── 🐳 docker/              # Cấu hình phụ trợ Docker & Nginx
├── 📚 doc/                 # Toàn bộ tài liệu chi tiết của dự án
│   ├── README.md          # Tổng quan dự án & hướng dẫn vận hành
│   ├── QUY_TAC_PHAT_TRIEN.md # Quy tắc bắt buộc khi thêm/sửa/xóa mã nguồn
│   ├── CHANGELOG.md       # Nhật ký thay đổi chi tiết theo thời gian
│   ├── DOCKER_BACKEND.md  # Cẩm nang Docker Compose, Cron Service & PostgreSQL
│   ├── TIEN_DO_DA_LAM_VA_CHUA_LAM.md # Tiến độ và lộ trình tính năng
│   ├── KIEN_TRUC_VA_MO_HINH_DU_LIEU.md # Giải thích thuật toán & mô hình dữ liệu
│   └── HUONG_DAN_SU_DUNG.md # Cẩm nang hướng dẫn sử dụng cho giáo viên
│
├── 📄 docker-compose.yml   # Điều phối 3 container: postgres, backend, frontend
├── 📄 package.json         # Tệp script điều phối ở thư mục gốc
├── 📄 .env.example         # Mẫu cấu hình biến môi trường
└── 📄 AGENTS.md            # Quy tắc phát triển dành cho Developers & AI Agents
```

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy

### 1. Yêu cầu môi trường
- [Node.js](https://nodejs.org/) (phiên bản 18.x hoặc 20.x LTS trở lên)
- [Docker](https://www.docker.com/) & Docker Compose (nếu chạy toàn bộ hệ thống bằng container)

---

### 2. Chạy môi trường Phát triển (Local Development)

```powershell
# 1. Cài đặt toàn bộ thư viện (Frontend & Backend)
npm run install:all

# 2. Khởi chạy Giao diện Frontend (Vite)
npm run dev

# 3. (Tùy chọn) Chạy Backend API trên một terminal khác
npm run dev:backend
```

- Giao diện Web: `http://localhost:5173`
- Backend API: `http://localhost:4000/api/health`

---

### 3. Khởi chạy Trọn Gói bằng Docker Compose (Khuyên dùng cho Production)

Chỉ bằng **1 câu lệnh duy nhất**, toàn bộ hệ thống gồm 3 container (**PostgreSQL 16**, **Backend + 24/7 Cron**, **Frontend Nginx**) sẽ sẵn sàng hoạt động:

```powershell
# 1. Sao chép cấu hình môi trường
cp .env.example .env

# 2. Khởi chạy toàn bộ hệ thống
docker compose up -d --build
```

- **Ứng dụng Web**: `http://localhost` (cổng `80`)
- **API Health Check**: `http://localhost/api/health`
- Xem log chi tiết dịch vụ Cron & Email: `docker compose logs -f backend`

---

### 4. Biên dịch Dự án (Production Build)

```powershell
# Build mã nguồn giao diện (kết quả tại frontend/dist/):
npm run build

# Build mã nguồn máy chủ backend (kết quả tại backend/dist/):
npm run build:backend
```

---

## 📖 Tài Liệu Tham Khảo Chi Tiết

Mọi tài liệu kỹ thuật chuyên sâu được lưu trữ đầy đủ trong thư mục [**`doc/`**](file:///d:/app_gv/doc):

- 📜 [**`doc/QUY_TAC_PHAT_TRIEN.md`**](file:///d:/app_gv/doc/QUY_TAC_PHAT_TRIEN.md): Quy tắc bắt buộc cập nhật tài liệu khi thay đổi mã nguồn.
- 🕒 [**`doc/CHANGELOG.md`**](file:///d:/app_gv/doc/CHANGELOG.md): Nhật ký lịch sử các lần cập nhật tính năng.
- 🐳 [**`doc/DOCKER_BACKEND.md`**](file:///d:/app_gv/doc/DOCKER_BACKEND.md): Hướng dẫn chi tiết triển khai Docker, Cron Service và PostgreSQL.
- 📐 [**`doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md`**](file:///d:/app_gv/doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md): Kiến trúc dữ liệu và giải thuật phát hiện xung đột lịch.
- 🎓 [**`doc/HUONG_DAN_SU_DUNG.md`**](file:///d:/app_gv/doc/HUONG_DAN_SU_DUNG.md): Cẩm nang hướng dẫn sử dụng dành cho giáo viên.
- 📊 [**`doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md`**](file:///d:/app_gv/doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md): Bảng theo dõi tiến độ chi tiết.

---

## 📄 Bản Quyền & Giấy Phép

Phát triển dành riêng cho cộng đồng giáo viên Việt Nam. Tối ưu cho trải nghiệm dạy học hiện đại, chính xác và tiện lợi.
