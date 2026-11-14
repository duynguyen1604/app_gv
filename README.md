# 📚 Hệ Thống Quản Lý Lịch Dạy & Lớp Dạy Thêm Cho Giáo Viên
### *(Teacher Schedule & Class Manager)*

[![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite%20%7C%20TypeScript-blue?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v3-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Cloudflare](https://img.shields.io/badge/Deploy-Cloudflare%20Pages%20%2B%20D1%20Edge-F38020?logo=cloudflare)](https://pages.cloudflare.com/)
[![Backend](https://img.shields.io/badge/Backend-Node.js%2020%20%7C%20Express-green?logo=nodedotjs)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-Cloudflare%20D1%20%7C%20PostgreSQL%2016-336791?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Container-Docker%20Compose-2496ed?logo=docker)](https://www.docker.com/)
[![AI](https://img.shields.io/badge/AI-Gemini%201.5%20%2B%20NLP%20Tiếng%20Việt-orange?logo=google)](https://aistudio.google.com/)

> Ứng dụng web toàn diện được thiết kế chuyên biệt cho **giáo viên tại Việt Nam**: tối ưu giao diện trên điện thoại (Mobile-First, lịch kiểu Google Calendar), đa tài khoản bảo mật (Email/Mật khẩu + Google OAuth tự kích hoạt), tích hợp AI đọc tin nhắn Zalo và quét ảnh Thời khóa biểu trường, tính học phí & công nợ FIFO minh bạch, đồng bộ Google Calendar 1 chiều và triển khai miễn phí **100% trên Cloudflare Pages + D1** (không tắt server, 0ms cold start) hoặc **Docker Compose**.

---

## 🌟 Điểm Nổi Bật Của Hệ Thống

| Tính năng | Mô tả chi tiết |
| :--- | :--- |
| 📅 **Hợp nhất Lịch Dạy & Mobile Google Calendar** | Xem trọn vẹn cả tuần trên PC dạng ma trận và trên điện thoại theo giao diện **Agenda/Day chuẩn Google Calendar**. Phân biệt 4 màu: Lịch trường, Trực, Dạy thêm cố định, Buổi phát sinh. |
| ➕ **Lịch Học Phát Sinh (Tùy chọn học phí riêng)** | Tạo, sửa, xóa buổi học phát sinh ngay trong từng lớp hoặc trên lịch. Hỗ trợ ô **"Học phí buổi này"** (để trống = dùng giá mặc định của lớp; nhập số tiền = tính riêng theo giá đó). |
| ⚠️ **Phát hiện Trùng Lịch & Di Chuyển** | Thuật toán kiểm tra xung đột thời gian thực: Báo đỏ khi trùng giờ, báo vàng khi khoảng cách giữa 2 ca dạy khác địa điểm dưới 20 phút. |
| 🤖 **AI Đọc Tin Nhắn Zalo & Quét Ảnh TKB** | Bộ NLP Tiếng Việt offline + Google Gemini 1.5 Flash Vision trích xuất tin nhắn hẹn/dời lịch và ảnh thời khóa biểu trường, kèm bảng xem trước cho phép sửa tay từng ô. |
| 📝 **Điểm Danh 1–2 Chạm** | Tối ưu trên di động: Nút "Tất cả có mặt", đổi trạng thái Có mặt / Vắng / Có phép cực nhanh, ghi chú nội dung bài dạy cho từng buổi (kể cả buổi phát sinh). |
| 💰 **Học Phí, Công Nợ FIFO & Lọc Theo Lớp** | $\text{Học phí} = \text{Số buổi CÓ MẶT} \times \text{Đơn giá}$. Bộ lọc theo **Tháng + Lớp**, hỗ trợ học thử miễn phí, học ghép, chốt tháng, phân bổ FIFO, nhắc Zalo 2 mẫu và xuất Excel (`.xlsx`) 5 sheet. |
| 🔐 **Đa Tài Khoản & Google OAuth** | Đăng nhập/Đăng ký bằng Email/Mật khẩu hoặc **Google OAuth** (tự động kích hoạt không cần chờ Admin duyệt). Dữ liệu từng giáo viên tách biệt hoàn toàn, tài khoản mới bắt đầu sạch 100%. |
| 🧭 **Hướng Dẫn Sử Dụng (Onboarding 6 Bước)** | Tự động hiện 1 lần cho tài khoản mới (Email & Google) với spotlight/tooltip chỉ dẫn từng khu vực; lưu trạng thái `onboarding_completed` trên server theo tài khoản và có nút **Hướng dẫn (?)** để xem lại bất cứ lúc nào. |
| 💬 **Trợ Lý AI HDSD & Liên Hệ Admin** | Hộp chat góc màn hình hỗ trợ **AI HDSD** (Gemini + fallback rule-based, có guardrail chống hỏi ngoài luồng & bảo mật tài khoản) và tab **Liên hệ Admin** cho phép giáo viên gửi đơn *Hỗ trợ / Khiếu nại / Báo lỗi* kèm **chat 2 chiều** với Quản trị viên. |
| 📆 **Google Calendar & Email Tự Động** | Đồng bộ 1 chiều sang lịch phụ `"Lịch dạy"` trên Google Calendar, gửi email lịch dạy hằng ngày qua Resend Edge API / Gmail SMTP Cron 24/7. |
| ☁️ **Cloudflare Pages + D1 / Docker** | Chạy tức thì trên Cloudflare Pages Functions + Cloudflare D1 (`0ms` cold start, miễn phí, không ngủ đông) hoặc tự host qua Docker Compose + PostgreSQL 16. |

---

## 🏗️ Kiến Trúc Thư Mục (Clean Monorepo)

```
app_gv/
├── 🌐 frontend/            # Giao diện người dùng (React 18, TypeScript, Vite, Tailwind CSS, Zustand)
│   ├── functions/api/     # Entrypoint & router tổng Cloudflare Pages Functions ([[route]].ts)
│   ├── edge-api/          # Edge API tách theo module (types, middleware, shared, modules/{auth,profile,admin,support,sync,notification,ai,health,gcal})
│   ├── src/
│   │   ├── components/    # OnboardingTour, HelpAssistantWidget, Schedule Modals, UI Buttons, TopBar, AppShell, BottomNav
│   │   ├── pages/         # SchedulePage, ClassesPage, ClassDetailPage, FeesPage, SettingsPage, Auth & Admin
│   │   ├── store/         # Zustand Stores (useAppStore, useAuthStore) & LocalStorage Persistence
│   │   ├── lib/           # AI Parsers, Conflict Detectors, Debt Engine, Backend Sync, Auth API Helpers
│   │   └── types/         # TypeScript Data Models
│   ├── public/            # Favicon, _routes.json, _redirects, PWA assets
│   └── package.json       # Dependencies của Frontend
│
├── ⚡ functions/api/       # Re-export Cloudflare Pages Functions khi deploy từ thư mục gốc
├── ☁️ cloudflare/          # Schema SQL cho Cloudflare D1 (`d1-schema.sql`)
│
├── ⚙️ backend/             # Dịch vụ máy chủ tự host (Node.js 20, Express, TypeScript, Cron 24/7)
│   ├── src/
│   │   ├── server.ts      # REST API (/api/auth/*, /api/profile/*, /api/admin/*, /api/sync, /api/gcal/*)
│   │   ├── auth.ts        # Xác thực JWT, Google OAuth, phân quyền Admin/GV, onboarding_completed
│   │   ├── cron.ts        # Tiến trình Cron chạy ngầm 24/7 tự động gửi Gmail 06:00
│   │   ├── mailer.ts      # Gửi email HTML lịch dạy qua SMTP / Gmail App Password
│   │   ├── gcal.ts        # Đồng bộ Google Calendar 1 chiều & feed .ics
│   │   └── sync.ts        # Đọc & ghi đồng bộ PostgreSQL
│   ├── sql/init.sql       # Script khởi tạo schema PostgreSQL 16
│   └── package.json       # Dependencies của Backend
│
├── 🐳 docker/              # Cấu hình phụ trợ Docker & Nginx
├── 📚 doc/                 # Toàn bộ tài liệu chi tiết của dự án
│   ├── README.md          # Tổng quan dự án & hướng dẫn vận hành
│   ├── QUY_TAC_PHAT_TRIEN.md # Quy tắc bắt buộc khi thêm/sửa/xóa mã nguồn
│   ├── CHANGELOG.md       # Nhật ký thay đổi chi tiết theo thời gian
│   ├── CLOUDFLARE_DEPLOY.md # Hướng dẫn deploy miễn phí lên Cloudflare Pages + D1
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

## 🚀 Hướng Dẫn Cài Đặt & Triển Khai

### 1. Chạy môi trường Phát triển (Local Development)

- Yêu cầu: [Node.js](https://nodejs.org/) 18.x / 20.x LTS trở lên.

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

### 2. Deploy Cloud Miễn Phí Trên Cloudflare Pages + D1 (Khuyên dùng)

Hệ thống chạy hoàn toàn Serverless trên Cloudflare Edge (`0ms` cold start, không bao giờ tự tắt server):
1. Kết nối repo GitHub vào **Cloudflare Workers & Pages** (Build command: `npm run build`, Build output: `dist`, Root directory: `frontend`).
2. Tạo database **Cloudflare D1** và gắn Binding tên **`DB`** trong **Settings -> Bindings** của Pages.
3. Cấu hình các biến môi trường cần thiết (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY`...).
4. Xem hướng dẫn từng bước chi tiết tại [**`doc/CLOUDFLARE_DEPLOY.md`**](file:///d:/app_gv/doc/CLOUDFLARE_DEPLOY.md).

---

### 3. Tự Host Trọn Gói bằng Docker Compose

```powershell
# 1. Sao chép cấu hình môi trường
cp .env.example .env

# 2. Khởi chạy toàn bộ 3 container (PostgreSQL 16 + Backend/Cron + Frontend Nginx)
docker compose up -d --build
```

- **Ứng dụng Web**: `http://localhost` (cổng `80`)
- **API Health Check**: `http://localhost/api/health`
- Xem log dịch vụ Cron & Email: `docker compose logs -f backend`

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
- ☁️ [**`doc/CLOUDFLARE_DEPLOY.md`**](file:///d:/app_gv/doc/CLOUDFLARE_DEPLOY.md): Hướng dẫn deploy đầy đủ lên Cloudflare Pages + D1 + Google OAuth.
- 🐳 [**`doc/DOCKER_BACKEND.md`**](file:///d:/app_gv/doc/DOCKER_BACKEND.md): Hướng dẫn chi tiết triển khai Docker, Cron Service và PostgreSQL.
- 📐 [**`doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md`**](file:///d:/app_gv/doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md): Kiến trúc dữ liệu và giải thuật phát hiện xung đột lịch, công nợ FIFO.
- 🎓 [**`doc/HUONG_DAN_SU_DUNG.md`**](file:///d:/app_gv/doc/HUONG_DAN_SU_DUNG.md): Cẩm nang hướng dẫn sử dụng dành cho giáo viên.
- 📊 [**`doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md`**](file:///d:/app_gv/doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md): Bảng theo dõi tiến độ chi tiết.

---

