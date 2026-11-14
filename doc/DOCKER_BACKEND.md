# HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH DOCKER BACKEND

Tài liệu này hướng dẫn chi tiết cách thức triển khai và vận hành toàn bộ hệ thống bằng **Docker & Docker Compose**, giải quyết triệt để bài toán: **Tự động gửi email lịch dạy mỗi sáng 24/7 ngay cả khi giáo viên tắt điện thoại và máy tính**.

---

## 🐳 1. Kiến trúc Container Tổng thể

Hệ thống được đóng gói thành 3 dịch vụ biệt lập trong tệp `docker-compose.yml`:

```mermaid
flowchart TD
    Client["Trình duyệt Điện thoại / Máy tính"] -->|Cổng 80| Nginx["Frontend Container (Nginx Alpine)"]
    Nginx -->|Phục vụ SPA tĩnh| HTML["React 18 Production Bundle"]
    Nginx -->|Reverse Proxy /api/| NodeApp["Backend Container (Node.js 20 Express)"]
    
    subgraph Backend_Container["Backend Container (app_gv_backend)"]
        API["Express REST API (Port 4000)"]
        CronService["Cron Worker 24/7 (node-cron)"]
        AIGateway["Gemini AI Proxy (Ẩn API Key)"]
        Mailer["Nodemailer Service"]
        
        CronService -->|Kiểm tra giờ gửi| Mailer
        API --> Mailer
    end
    
    NodeApp -->|Cổng 5432| DB["Database Container (PostgreSQL 16)"]
    Mailer -->|Gửi email tự động| Gmail["Gmail SMTP Server"]
    Gmail --> TeacherEmail["Hòm thư Gmail Giáo viên"]
```

### Các dịch vụ trong `docker-compose.yml`:
1. **`postgres` (Database)**: 
   - Sử dụng image chính thức `postgres:16-alpine`.
   - Tự động nạp cấu trúc đầy đủ các bảng cơ sở dữ liệu (bao gồm `profiles`, `app_settings`, `invites`, `audit_log`, `students` với `trial_price`, `student_enrollments`, `student_status_history`, `session_guests`, `school_periods`, `school_schedule`, `school_week_configs`, `payment_transactions`, `month_locks`, `change_log`, `calendar_event_map`, `calendar_sync_log`, `gcal_tokens` và chính sách **Row Level Security - RLS**) từ `backend/sql/init.sql` và `backend/sql/002_supabase_auth_profiles.sql`.
   - Dữ liệu được bảo toàn bền vững trong Docker Volume `postgres_data`.
2. **`backend` (API + Automated Cron + Google Calendar One-Way Sync)**:
   - Viết bằng Node.js + TypeScript + Express.
   - Tích hợp tiến trình `node-cron` chạy ngầm 24/7:
     * Mỗi phút kiểm tra giờ gửi email (`settings.notify_time`, mặc định `06:00` sáng theo giờ Việt Nam `Asia/Ho_Chi_Minh`) để tự động truy vấn lịch dạy thực tế trong ngày và gửi email về hòm thư của giáo viên.
     * Mỗi ngày lúc `01:00` sáng (`0 1 * * *`) tự động chạy tác vụ nền đẩy thêm các tuần mới phía trước lên lịch riêng `"Lịch dạy"` trên Google Calendar (`syncUserGoogleCalendar`).
   - Cung cấp API đồng bộ dữ liệu hai chiều (`GET/PUT /api/sync`), các API đồng bộ một chiều Google Calendar (`/api/gcal/auth-url`, `/api/gcal/callback`, `/api/gcal/connect`, `/api/gcal/sync-now`, `/api/gcal/clear-events`, `/api/gcal/disconnect`, `/api/gcal/feed.ics`) với mã kết nối OAuth mã hóa **AES-256-GCM** lưu phía server (`gcal_tokens`), và API Gateway gọi Gemini AI an toàn.
   - Khi container khởi động, backend tự chạy `ensureSchema()` để tạo bảng/chỉ mục nếu volume Postgres chưa có schema hoặc schema cũ thiếu ràng buộc.
3. **`frontend` (Web App + Nginx Reverse Proxy)**:
   - Build ứng dụng React/Vite bằng Docker multi-stage build siêu nhẹ.
   - Chạy máy chủ Nginx lắng nghe ở cổng `80` (hoặc cổng tùy chỉnh trong `.env`).
   - Tự động chuyển tiếp toàn bộ yêu cầu `/api/*` sang container `backend:4000`.

---

## ⚙️ 2. Hướng dẫn Khởi chạy Từng Bước

### Bước 1: Chuẩn bị tệp cấu hình môi trường `.env`
Sao chép tệp `.env.example` thành `.env`:
```powershell
cp .env.example .env
```
Mở tệp `.env` và điền các thông tin:
* `DB_PASSWORD`: Mật khẩu bảo mật cho cơ sở dữ liệu PostgreSQL.
* `GEMINI_API_KEY`: API Key lấy miễn phí tại [Google AI Studio](https://aistudio.google.com/).
* `SMTP_USER`: Địa chỉ Gmail của giáo viên dùng để gửi thư (vd: `giaovien.toan@gmail.com`).
* `SMTP_PASS`: **Mật khẩu ứng dụng (App Password 16 ký tự)** của Gmail. Lấy tại: [Tài khoản Google $\rightarrow$ Bảo mật $\rightarrow$ Mật khẩu ứng dụng](https://myaccount.google.com/apppasswords).

### Bước 2: Khởi động hệ thống bằng Docker Compose
Chạy lệnh duy nhất sau tại thư mục gốc của dự án:
```powershell
docker compose up -d --build
```

Lệnh này sẽ tự động:
1. Tải các base image Node, Nginx và PostgreSQL.
2. Khởi tạo cơ sở dữ liệu và 11 bảng dữ liệu chuẩn.
3. Biên dịch Backend và khởi chạy dịch vụ Cron 24/7.
4. Biên dịch Frontend và khởi chạy Nginx.

### Bước 3: Truy cập ứng dụng
* Mở trình duyệt web trên máy tính hoặc điện thoại: `http://localhost` (hoặc IP máy chủ).
* Kiểm tra API Backend: `http://localhost/api/health` hoặc `http://localhost:4000/api/health` $\rightarrow$ Trả về JSON trạng thái cơ sở dữ liệu và thời gian múi giờ `Asia/Ho_Chi_Minh`.
* Đồng bộ dữ liệu: frontend tự `GET/PUT /api/sync`. Có thể đẩy tay từ **Cài đặt → Đồng bộ PostgreSQL**.

### Chạy riêng Database + Backend (không build frontend)
```powershell
docker compose up -d --build postgres backend
```
Postgres lắng nghe `localhost:5432` (user `postgres`, database `app_gv`, mật khẩu lấy từ `.env`). Backend lắng nghe `localhost:4000`.

---

## ⏰ 3. Cơ chế Hoạt động của Cron Job Gửi Email 24/7

Yêu cầu gốc: *"Mỗi ngày tự gửi lịch dạy của ngày đó qua Gmail cho tôi"*.

Khi chạy bằng Docker:
1. Container `backend` có biến môi trường `TZ=Asia/Ho_Chi_Minh`.
2. Hàm `startCronJobs()` trong `backend/src/cron.ts` kích hoạt tiến trình kiểm tra mỗi phút (`* * * * *`).
3. Tại thời điểm khớp với `notify_time` (ví dụ `06:00` sáng):
   - Truy vấn bảng `holidays`: Nếu hôm nay là ngày nghỉ lễ $\rightarrow$ Tự động bỏ qua không gửi email.
   - Truy vấn các tiết trường hôm nay từ `school_schedule`.
   - Truy vấn các lớp dạy thêm cố định từ `schedule_rules` (đã trừ các buổi bị hủy/dời).
   - Truy vấn các buổi phát sinh và buổi dời đến trong ngày.
   - Soạn thư HTML giao diện đẹp mắt và gửi qua hàm `sendScheduleEmail()`.
   - Ghi lại kết quả thành công hoặc lỗi vào bảng `notification_log`.
4. **Giáo viên không cần mở trình duyệt web hay bật máy tính**, email vẫn gửi đến điện thoại đúng giờ mỗi sáng.

---

## 🛠️ 4. Các Lệnh Quản trị Docker Thường dùng

| Nhu cầu | Lệnh thực hiện |
| :--- | :--- |
| **Xem trạng thái các container** | `docker compose ps` |
| **Xem log trực tiếp của Backend & Cron** | `docker compose logs -f backend` |
| **Xem log của Database** | `docker compose logs -f postgres` |
| **Khởi động lại toàn bộ dịch vụ** | `docker compose restart` |
| **Dừng hệ thống** | `docker compose down` |
| **Sao lưu dữ liệu PostgreSQL ra file SQL** | `docker exec -t app_gv_postgres pg_dump -U postgres app_gv > backup.sql` |
| **Khôi phục dữ liệu từ file SQL** | `docker exec -i app_gv_postgres psql -U postgres app_gv < backup.sql` |

---

## ☁️ 5. Phương án Deploy Online 100% Miễn phí (0đ/tháng)

Nếu không muốn bật máy tính cá nhân chạy Docker mà muốn đưa ứng dụng lên Internet miễn phí hoàn toàn (dùng tốt trên điện thoại iPhone/Android và máy tính ở mọi nơi), dự án đã được cấu hình sẵn bộ tệp triển khai **100% Free Tier**:

### Kiến trúc Cloud 0đ:
1. **Frontend (Giao diện Web & PWA)**: **Cloudflare Pages** (hoặc **Vercel Free**) — Băng thông không giới hạn, SSL miễn phí, tốc độ CDN toàn cầu. Đã cấu hình sẵn `frontend/public/_redirects` và `frontend/vercel.json`.
2. **Database & Auth (Cơ sở dữ liệu PostgreSQL)**: **Supabase Free Tier** (hoặc **Neon.tech Free**) — 500MB PostgreSQL miễn phí trọn đời + 50.000 người dùng Supabase Auth miễn phí.
3. **Backend API & Cron**: **Render.com Free Web Service** — Đã cấu hình sẵn tệp `render.yaml` ở thư mục gốc và hỗ trợ biến `DATABASE_URL` có SSL trong `backend/src/db.ts`.
4. **Giữ ấm & Gửi Email tự động 24/7**: **GitHub Actions Free Cron** (`.github/workflows/cron-keepalive.yml`) kết hợp **Gmail App Password** (miễn phí 500 email/ngày).

### Các bước thực hiện nhanh (10 phút):

#### Bước 1: Tạo Database PostgreSQL miễn phí trên Supabase
1. Đăng nhập [Supabase.com](https://supabase.com/) (bằng GitHub) $\rightarrow$ **New Project**.
2. Vào mục **SQL Editor**, dán nội dung tệp `backend/sql/init.sql` và `backend/sql/002_supabase_auth_profiles.sql` rồi bấm **Run** để khởi tạo toàn bộ bảng và chính sách bảo mật RLS.
3. Vào **Project Settings $\rightarrow$ Database $\rightarrow$ Connection string (URI)**, sao chép chuỗi kết nối `postgresql://postgres.[ref]:[password]@aws-0-...pooler.supabase.com:6543/postgres`.

#### Bước 2: Deploy Backend miễn phí lên Render.com
1. Đẩy mã nguồn dự án lên kho **GitHub** cá nhân của bạn.
2. Đăng nhập [Render.com](https://render.com/) $\rightarrow$ **New + $\rightarrow$ Blueprint** (hoặc **Web Service**) và chọn kho GitHub của dự án (Render sẽ tự nhận tệp `render.yaml`).
3. Tại mục **Environment Variables** trên Render, điền:
   - `DATABASE_URL`: Chuỗi URI PostgreSQL vừa lấy từ Supabase.
   - `ADMIN_EMAIL`: Email quản trị viên của bạn.
   - `SMTP_USER` & `SMTP_PASS`: Gmail và Mật khẩu ứng dụng 16 ký tự (nếu dùng gửi lịch qua email).
   - `FRONTEND_URL`: Địa chỉ trang web Frontend sau khi tạo ở Bước 3.
4. Sau khi Render build xong, bạn sẽ nhận được URL Backend dạng `https://app-gv-backend.onrender.com`.

#### Bước 3: Deploy Frontend miễn phí lên Cloudflare Pages (hoặc Vercel)
1. Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com/) $\rightarrow$ **Workers & Pages $\rightarrow$ Create $\rightarrow$ Pages $\rightarrow$ Connect to Git**.
2. Chọn kho GitHub của dự án, thiết lập thông số Build:
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
3. Thêm biến môi trường (Environment Variables):
   - `VITE_API_URL`: `https://app-gv-backend.onrender.com` (URL Backend ở Bước 2).
   - *(Tùy chọn)* `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` nếu bật Google OAuth qua Supabase.
4. Bấm **Save and Deploy** $\rightarrow$ Nhận ngay tên miền miễn phí `https://app-gv.pages.dev`.

#### Bước 4: Bật GitHub Actions giữ ấm Backend & Cron 06:00 sáng
1. Trên kho GitHub của bạn, vào **Settings $\rightarrow$ Secrets and variables $\rightarrow$ Actions $\rightarrow$ New repository secret**.
2. Tạo secret tên `BACKEND_URL` với giá trị `https://app-gv-backend.onrender.com`.
3. Workflow `.github/workflows/cron-keepalive.yml` sẽ tự động ping giữ ấm máy chủ miễn phí mỗi 14 phút và đánh thức tiến trình gửi email lịch dạy đúng 06:00 sáng giờ Việt Nam.

