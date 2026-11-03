# NHẬT KÝ THAY ĐỔI DỰ ÁN (PROJECT CHANGELOG)

Tất cả các thay đổi đáng chú ý (Thêm mới, Chỉnh sửa, Xóa bỏ) trong dự án Quản lý Lịch dạy Giáo viên được ghi lại chi tiết tại tệp này theo định dạng chuẩn [Keep a Changelog](https://keepachangelog.com/).

---

## [2026-11-03] - Bổ sung tệp giới thiệu dự án `README.md` ở thư mục gốc

### ➕ Đã thêm (Added)
- Tạo tệp [`README.md`](file:///d:/app_gv/README.md) ở thư mục gốc: Tổng quan dự án, tính năng nổi bật (AI Zalo, Quét TKB Gemini Vision, tính học phí thực tế, Cron 24/7 gửi Gmail, Postgres sync), sơ đồ kiến trúc monorepo và hướng dẫn cài đặt / khởi chạy chi tiết bằng `npm` và `docker compose`.

---

## [2026-11-03] - Tái cấu trúc chuẩn hóa thư mục (Gom Frontend vào `frontend/`)

### ➕ Đã thêm (Added)
- Thư mục riêng [`frontend/`](file:///d:/app_gv/frontend) chứa toàn bộ mã nguồn giao diện (React 18, TypeScript, Vite, Tailwind CSS).
- Tạo tệp [`frontend/nginx.conf`](file:///d:/app_gv/frontend/nginx.conf) và [`frontend/.dockerignore`](file:///d:/app_gv/frontend/.dockerignore) giúp container frontend hoàn toàn độc lập và tự đóng gói.
- Tạo tệp điều phối [`package.json`](file:///d:/app_gv/package.json) tại thư mục gốc với các lệnh tiện ích: `npm run dev` (chạy frontend), `npm run dev:backend` (chạy backend), `npm run build`, `npm run build:backend`, `npm run install:all`.

### 🔄 Đã sửa (Changed)
- Di chuyển toàn bộ tệp phân tán ở thư mục gốc vào `frontend/`: `src/`, `public/`, `index.html`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `package.json`, `package-lock.json`, `Dockerfile`.
- Cập nhật [`docker-compose.yml`](file:///d:/app_gv/docker-compose.yml): Đổi build context của dịch vụ `frontend` thành `context: ./frontend`.
- Cập nhật [`frontend/Dockerfile`](file:///d:/app_gv/frontend/Dockerfile): Sửa đường dẫn cấu hình Nginx thành `COPY nginx.conf /etc/nginx/conf.d/default.conf`.
- Cập nhật [`.gitignore`](file:///d:/app_gv/.gitignore) và [`.dockerignore`](file:///d:/app_gv/.dockerignore) tại thư mục gốc để tương thích cấu trúc mới.

---

## [2026-11-03] - Hoàn thiện Backend API và dựng PostgreSQL

### ➕ Đã thêm (Added)
- Hoàn thiện REST API đồng bộ hai chiều: `GET/PUT/POST /api/sync` ghi/đọc đủ 11 bảng + `session_notes` + `notification_log`.
- Thêm `POST /api/ai/parse-school-image` (Gemini Vision proxy trên server).
- Thêm `backend/src/schema.ts` tự áp schema khi khởi động (kể cả volume Postgres đã tồn tại, không chỉ lần `init.sql` đầu tiên).
- Thêm `backend/src/sync.ts`, `backend/src/serialize.ts`, `backend/src/gemini.ts`.
- Frontend: `src/lib/backendSync.ts` kéo/đẩy PostgreSQL; Cài đặt có mục **Đồng bộ PostgreSQL**; gửi thử email gọi backend thật.
- `vite.config.ts` reverse proxy `/api` → `localhost:4000` khi chạy `npm run dev`.

### 🔄 Đã sửa (Changed)
- `backend/sql/init.sql`: chỉ mục, CHECK, unique theo `user_id` (ngày lễ không còn UNIQUE toàn cục theo `date`).
- Cron tính thứ trong tuần theo múi giờ `Asia/Ho_Chi_Minh`.
- Backend lắng nghe `0.0.0.0`, `package.json` `"type": "module"`, Docker image copy `sql/`.
- Nút **Gửi thử** trên Cài đặt gọi `POST /api/email/test` thay vì chỉ mô phỏng trên trình duyệt.

### 🐛 Đã sửa lỗi (Fixed)
- `GET /api/sync` trước đây thiếu `session_notes` và nhật ký email; cột `DATE` của Postgres được serialize thành `YYYY-MM-DD` cho khớp frontend.

---

## [2026-11-03] - Thêm Quy tắc Phát triển Dự án & Đóng gói Docker Backend

### ➕ Đã thêm (Added)
- **Quy tắc bắt buộc**: Tạo tệp [`doc/QUY_TAC_PHAT_TRIEN.md`](file:///c:/Users/MSI/app_gv/doc/QUY_TAC_PHAT_TRIEN.md) và [`AGENTS.md`](file:///c:/Users/MSI/app_gv/AGENTS.md) quy định: Mọi thao tác thêm hoặc xóa trong dự án đều bắt buộc phải ghi lại trong thư mục `doc/`.
- **Hạ tầng Docker Backend**:
  * Tạo [`docker-compose.yml`](file:///c:/Users/MSI/app_gv/docker-compose.yml) cấu hình 3 container: `postgres` (PostgreSQL 16), `backend` (Express API + Cron Service 24/7), `frontend` (Nginx Alpine).
  * Tạo [`backend/package.json`](file:///c:/Users/MSI/app_gv/backend/package.json) và [`backend/tsconfig.json`](file:///c:/Users/MSI/app_gv/backend/tsconfig.json).
  * Tạo [`backend/Dockerfile`](file:///c:/Users/MSI/app_gv/backend/Dockerfile) (Node 20 Alpine multi-stage).
  * Tạo [`backend/sql/init.sql`](file:///c:/Users/MSI/app_gv/backend/sql/init.sql) định nghĩa 11 bảng cơ sở dữ liệu PostgreSQL cho container database.
  * Tạo [`backend/src/db.ts`](file:///c:/Users/MSI/app_gv/backend/src/db.ts) kết nối connection pool PostgreSQL.
  * Tạo [`backend/src/mailer.ts`](file:///c:/Users/MSI/app_gv/backend/src/mailer.ts) dịch vụ gửi email HTML lịch dạy qua SMTP / Gmail App Password.
  * Tạo [`backend/src/cron.ts`](file:///c:/Users/MSI/app_gv/backend/src/cron.ts) tiến trình ngầm 24/7 kiểm tra giờ mỗi phút và tự động gửi email lúc 06:00 sáng ngay cả khi giáo viên tắt máy tính/điện thoại.
  * Tạo [`backend/src/server.ts`](file:///c:/Users/MSI/app_gv/backend/src/server.ts) cung cấp REST API (`/api/health`, `/api/sync`, `/api/email/test`, `/api/ai/parse-zalo`).
  * Tạo [`Dockerfile`](file:///c:/Users/MSI/app_gv/Dockerfile) và [`docker/nginx.conf`](file:///c:/Users/MSI/app_gv/docker/nginx.conf) đóng gói ứng dụng frontend với reverse proxy `/api`.
  * Tạo [`.env.example`](file:///c:/Users/MSI/app_gv/.env.example) mẫu cấu hình biến môi trường.
  * Tạo tài liệu hướng dẫn vận hành [`doc/DOCKER_BACKEND.md`](file:///c:/Users/MSI/app_gv/doc/DOCKER_BACKEND.md).

---

## [2026-11-03] - Xây dựng Hoàn thiện Hệ thống Quản lý Lịch dạy (Giai đoạn 1 đến 5)

### ➕ Đã thêm (Added)
- **Cấu hình & Khởi tạo**:
  * Dự án React 18 + TypeScript + Vite.
  * Cấu hình Tailwind CSS v3 với Dark Mode (`class`), màu sắc sư phạm: Trường (xanh dương), Dạy thêm cố định (cam), Phát sinh (tím), Cảnh báo (đỏ).
- **Màn hình Thời gian biểu tuần ([`src/pages/SchedulePage.tsx`](file:///c:/Users/MSI/app_gv/src/pages/SchedulePage.tsx))**:
  * Lưới cả tuần T2–CN và chế độ 1 ngày trên di động.
  * 4 khối màu nhận diện rõ ràng. Buổi dời hiển thị mờ, gạch ngang, mũi tên chỉ ngày giờ mới.
  * Thao tác dời buổi (tuần này), hủy buổi (kèm tùy chọn cần dạy bù), thêm buổi phát sinh.
  * Bộ cảnh báo trùng lịch tập trung ([`src/lib/conflictDetector.ts`](file:///c:/Users/MSI/app_gv/src/lib/conflictDetector.ts)): Báo đỏ trùng giờ, báo vàng thiếu thời gian di chuyển (< 20 phút).
  * Khung "Buổi cần dạy bù" và nút "Xếp bù ngay".
  * Tóm tắt "Hôm nay" và nút sao chép tuần.
- **AI Parser ([`src/lib/aiParser.ts`](file:///c:/Users/MSI/app_gv/src/lib/aiParser.ts), [`ZaloMessageModal.tsx`](file:///c:/Users/MSI/app_gv/src/components/schedule/ZaloMessageModal.tsx), [`SchoolImageModal.tsx`](file:///c:/Users/MSI/app_gv/src/components/schedule/SchoolImageModal.tsx))**:
  * Dán tin nhắn Zalo/SMS: Bộ NLP tiếng Việt nhận diện tự nhiên offline (mai, tối nay, T7 sáng, 9h-11h, dời, nghỉ...), bảng xem trước cho sửa tay từng ô, tô vàng ô chưa rõ, cảnh báo đỏ nếu trùng lịch.
  * Quét ảnh TKB trường: Tích hợp Gemini Vision, bảng kiểm tra sửa tay từng ô, đặt hạn học kỳ, xác nhận ghi đè.
- **Quản lý lớp & Điểm danh ([`src/pages/ClassesPage.tsx`](file:///c:/Users/MSI/app_gv/src/pages/ClassesPage.tsx), [`ClassDetailPage.tsx`](file:///c:/Users/MSI/app_gv/src/pages/ClassDetailPage.tsx))**:
  * Thẻ lớp, thêm/sửa/xóa lớp (hộp xác nhận).
  * Dán danh sách học sinh hàng loạt.
  * Hồ sơ học sinh, trạng thái đang học / học thử / đã nghỉ, gọi điện nhanh `tel:`.
  * Điểm danh tối đa 2 chạm (Có mặt, Vắng, Vắng có phép) và nút "Tất cả có mặt". Ghi chú nội dung bài giảng.
- **Tổng hợp học phí & Thống kê ([`src/pages/FeesPage.tsx`](file:///c:/Users/MSI/app_gv/src/pages/FeesPage.tsx))**:
  * Tính tiền: $\text{Thành tiền} = \text{Số buổi CÓ MẶT} \times \text{Đơn giá}$. Vắng, hủy, học thử không tính tiền.
  * Tích chọn Đã đóng / Chưa đóng, thống kê Phải thu, Đã thu, Còn lại.
  * Xuất file Excel (`.xlsx`) bằng SheetJS.
  * Soạn tin nhắn Zalo nhắc học phí 1-chạm và biểu đồ thống kê thu nhập.
- **Cài đặt & Tiện ích ([`src/pages/SettingsPage.tsx`](file:///c:/Users/MSI/app_gv/src/pages/SettingsPage.tsx))**:
  * Dark/Light mode.
  * Xem trước email hôm nay và gửi thử.
  * Quản lý ngày nghỉ lễ (tự ẩn mọi buổi học hôm đó).
  * Sao lưu toàn bộ dữ liệu ra file `.json` và khôi phục khi đổi máy.
- **Thư mục Tài liệu `doc/`**:
  * [`doc/README.md`](file:///c:/Users/MSI/app_gv/doc/README.md)
  * [`doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md`](file:///c:/Users/MSI/app_gv/doc/TIEN_DO_DA_LAM_VA_CHUA_LAM.md)
  * [`doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md`](file:///c:/Users/MSI/app_gv/doc/KIEN_TRUC_VA_MO_HINH_DU_LIEU.md)
  * [`doc/HUONG_DAN_SU_DUNG.md`](file:///c:/Users/MSI/app_gv/doc/HUONG_DAN_SU_DUNG.md)

### ❌ Đã xóa (Removed)
- Xóa các tệp dư thừa sinh ra từ template mặc định của Vite: `src/main.ts`, `src/counter.ts`, `src/style.css` (đã thay thế hoàn toàn bằng `src/main.tsx` và `src/index.css`).

