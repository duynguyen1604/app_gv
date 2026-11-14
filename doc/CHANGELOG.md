# NHẬT KÝ THAY ĐỔI DỰ ÁN (PROJECT CHANGELOG)

Tất cả các thay đổi đáng chú ý (Thêm mới, Chỉnh sửa, Xóa bỏ) trong dự án Quản lý Lịch dạy Giáo viên được ghi lại chi tiết tại tệp này theo định dạng chuẩn [Keep a Changelog](https://keepachangelog.com/).

## [2026-11-14] - Bổ Sung Trợ Lý AI Chatbox Hướng Dẫn Sử Dụng Ở Góc Màn Hình

### ➕ Đã thêm (Added)
- **Widget Trợ lý AI góc màn hình ([`frontend/src/components/onboarding/HelpAssistantWidget.tsx`](file:///d:/app_gv/frontend/src/components/onboarding/HelpAssistantWidget.tsx), [`frontend/src/components/layout/AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx))**:
  * Thêm nút **Hỏi AI HDSD** nổi ở góc dưới phải màn hình (tự né thanh `BottomNav` trên điện thoại và tự ẩn khi `OnboardingTour` đang mở).
  * Khi bấm vào sẽ mở hộp chat **Trợ lý hướng dẫn App** kèm gợi ý câu hỏi nhanh theo trang đang mở, nút **Chỉ nút trang này** (mở hướng dẫn spotlight), hỗ trợ Dark/Light mode, phím `Esc`, và lưu lịch sử chat riêng theo từng `userId` trong `sessionStorage`.
- **Endpoint AI HDSD có khóa phạm vi & bảo mật 2 lớp ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts))**:
  * Thêm `POST /api/ai/help-chat` yêu cầu đăng nhập.
  * Lớp bảo vệ 1 (`checkHelpChatGuardrail`): chặn tức thì các yêu cầu ngoài luồng (viết code, giải toán, thời tiết, tin tức...) và chặn tuyệt đối các câu hỏi dò mật khẩu, token, API key, tài khoản/dữ liệu người khác hoặc prompt injection.
  * Lớp bảo vệ 2 (`APP_HELP_SYSTEM_PROMPT`): gọi Google Gemini (nếu có `GEMINI_API_KEY`) với `systemInstruction` siết chặt phạm vi và không truyền bất kỳ dữ liệu nhạy cảm nào; tự động fallback sang kho hướng dẫn tiếng Việt (`buildRuleBasedHelpReply`) khi chưa cấu hình Gemini Key.

---

## [2026-11-14] - Giới Hạn Lưu Nhật Ký Kiểm Toán Trong 30 Ngày Gần Nhất

### 🔧 Đã sửa (Changed)
- **Tự động dọn dẹp `auditLogs` quá 30 ngày ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts))**:
  * Thêm hàm `pruneAuditLogsLast30Days(store)` chỉ giữ lại các bản ghi trong 30 ngày gần nhất (`AUDIT_LOG_RETENTION_MS = 30 ngày`, giới hạn tối đa 1000 bản ghi để bảo vệ dung lượng KV/D1).
  * Tự động lọc khi nạp `loadAuthStore` và mỗi khi ghi thêm nhật ký mới ở `appendAuditLog`.

---

## [2026-11-14] - Fix Ô Nhập "Số Lượt Dùng Tối Đa" & "Hạn Sử Dụng" Không Xóa Được Số Mặc Định

### 🐛 Đã sửa (Fixed)
- **Cho phép xóa trắng để nhập số mới ở form Tạo mã mời ([`frontend/src/pages/admin/AdminDashboardPage.tsx`](file:///d:/app_gv/frontend/src/pages/admin/AdminDashboardPage.tsx))**:
  * Đổi `inviteMaxUses` và `inviteExpireDays` sang state chuỗi (`string`) khi đang gõ để người dùng có thể xóa hết số `1` (hoặc `14`) rồi nhập số mới bình thường, và tự chuẩn hóa giá trị hợp lệ khi `onBlur` hoặc bấm tạo mã mời.

---

## [2026-11-14] - Fix Đếm Sai Số "GV Đang Hoạt Động" & Chống Trùng Lặp Tài Khoản Trong Admin Overview

### 🐛 Đã sửa (Fixed)
- **Thống kê `stats` trong `GET /api/admin/overview` ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts))**:
  * Sửa `pendingCount`, `activeCount`, `lockedCount`, `unverifiedCount`, `activeLast7Days` chỉ đếm trên `teachers` (`role === 'teacher'`), không đếm gộp tài khoản `admin` vào thẻ **"GV Đang hoạt động"**.
  * Bổ sung bước khử trùng lặp `store.users` theo email chuẩn hóa (`normalizeEmail(u.email)`) trong `loadAuthStore` để tránh đếm 2 lần nếu trước đó từng có bản ghi trùng email.

---

## [2026-11-14] - Bổ Sung Ghi Nhận Đầy Đủ Nhật Ký Kiểm Toán (Audit Logs) Trên Cloudflare Edge

### 🐛 Đã sửa (Fixed)
- **Ghi nhận đầy đủ mọi sự kiện vào `store.auditLogs` ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts))**:
  * Trước đây `appendAuditLog` chỉ được gọi ở 2 nơi (đăng ký mới & admin tạo tài khoản), khiến các thao tác khác không xuất hiện trong **Nhật ký kiểm toán**.
  * Đã bổ sung `appendAuditLog` cho đầy đủ các hành động: đăng nhập (`login_success`, `login_google_redirect`, `google_account_linked`), duyệt tài khoản (`admin_approve_account`, `admin_bulk_approve`), khóa/mở khóa (`admin_lock_account`, `admin_unlock_account`), cấp mật khẩu mới (`admin_set_temp_password`), xóa tài khoản (`admin_delete_account`), đổi cài đặt (`admin_update_settings`), và tạo/thu hồi/xóa mã mời (`admin_create_invite`, `admin_revoke_invite`, `admin_delete_invite`).

---

## [2026-11-14] - Gỡ Bỏ Mục "Lịch Dạy Cá Nhân" Khỏi Tài Khoản Quản Trị Viên (Admin)

### 🔧 Đã sửa (Changed)
- **Tách biệt hoàn toàn giao diện Admin khỏi các trang dạy học cá nhân ([`frontend/src/components/layout/AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx), [`frontend/src/pages/admin/AdminDashboardPage.tsx`](file:///d:/app_gv/frontend/src/pages/admin/AdminDashboardPage.tsx), [`frontend/src/App.tsx`](file:///d:/app_gv/frontend/src/App.tsx))**:
  * Xóa mục **"Lịch dạy cá nhân (Tùy chọn)"** (`ADMIN_PERSONAL_ITEMS`) khỏi thanh điều hướng của tài khoản `admin` trong [`AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx).
  * Xóa nút/liên kết **"Mở Lịch dạy cá nhân của tôi"** trên banner của [`AdminDashboardPage.tsx`](file:///d:/app_gv/frontend/src/pages/admin/AdminDashboardPage.tsx).
  * Bổ sung `TeacherOnlyRoute` trong [`App.tsx`](file:///d:/app_gv/frontend/src/App.tsx) để tự động điều hướng tài khoản `admin` về `/admin` nếu truy cập `/schedule`, `/classes`, `/fees`, `/settings`.

---

## [2026-11-14] - Fix Quyền Admin Cấu Hình Từ Cloudflare Pages Không Tạo Được Mã Mời Giáo Viên

### 🐛 Đã sửa & Kiểm thử (Fixed & Tested)
- **Tự động nâng quyền `admin` cho `ADMIN_EMAIL` & vá dữ liệu `invites` cũ ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts))**:
  * Khi tài khoản đã từng đăng nhập trước đó với quyền `teacher` rồi mới được cấu hình làm `ADMIN_EMAIL` trên Cloudflare Pages (kể cả khi không đặt `DEFAULT_ADMIN_PASSWORD`), `loadAuthStore` và luồng đăng nhập Google tự động cập nhật `role = 'admin'`, `status = 'active'`, `email_verified = true`.
  * Chuẩn hóa các mảng `sessions`, `tokens`, `invites`, `auditLogs` trong `loadAuthStore` khi đọc dữ liệu cũ từ D1/KV để tránh lỗi `store.invites` bị `undefined` khi tạo mã mời (`POST /api/admin/invites`).
  * Kiểm tra trùng mã mời tùy chỉnh (`customCode`) trả về thông báo lỗi `400` rõ ràng thay vì tạo trùng.
  * Đã chạy kiểm thử thực tế với `handleApiRequest` cho cả 2 trường hợp (Admin tạo mới từ `ADMIN_EMAIL + DEFAULT_ADMIN_PASSWORD` và Admin được nâng quyền từ `ADMIN_EMAIL` qua Google OAuth) đều tạo/thu hồi/xóa mã mời thành công.

---

## [2026-11-14] - Xóa Bỏ Toàn Bộ Tài Khoản & Mật Khẩu Admin Mặc Định Cố Định Trong Mã Nguồn

### 🔒 Bảo mật (Security)
- **Không còn hardcode email/mật khẩu Admin và tài khoản mẫu trong [`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts)**:
  * Xóa bỏ hoàn toàn các chuỗi fallback cố định (`admin@lichday.vn`, `Admin123456`, `giaovien@lichday.vn`, `Giaovien123`).
  * Tài khoản Admin/mẫu chỉ được khởi tạo tự động nếu người vận hành cấu hình đầy đủ qua biến môi trường (`ADMIN_EMAIL` + `DEFAULT_ADMIN_PASSWORD`, hoặc `DEFAULT_TEACHER_EMAIL` + `DEFAULT_TEACHER_PASSWORD`) trên Cloudflare Pages.
  * API `GET /api/profile/me` chỉ trả về `adminEmailConfigured` khi người gọi đang là `admin`, tránh lộ email quản trị cho tài khoản giáo viên.
  * Tự động dọn xóa tài khoản admin mặc định cũ (`admin@lichday.vn`) và các phiên đăng nhập của nó trong `loadAuthStore` nếu `ADMIN_EMAIL` không còn đặt là `admin@lichday.vn`.

---

## [2026-11-14] - Fix Rò Rỉ `settings` Giữa Các Tài Khoản & Fix Lỗi Email Không Hiển Thị Lịch Dạy Thực Tế

### 🐛 Đã sửa (Fixed)
- **Cô lập `settings` theo từng tài khoản khi đăng xuất / đổi tài khoản ([`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts))**:
  * Trước đây `setUserId(id)` reset dữ liệu lớp/học sinh/lịch nhưng quên reset `settings`, khiến `notify_email` (và các cài đặt khác) của tài khoản A bị giữ lại khi đăng nhập tài khoản B.
  * Đã bổ sung `settings: { ...DEFAULT_SETTINGS, user_id: nextId }` vào `setUserId` để mỗi tài khoản dùng cấu hình riêng biệt hoàn toàn.
- **Sửa bộ tính lịch gửi email trên Edge khớp 100% với lịch dạy thực tế ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts), [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx))**:
  * Sửa `computeDailyEmailItemsForState` để đọc đúng các trường dữ liệu thực tế: `schoolSchedule` (`week_start`, `period_code`, `cell_type === 'duty'`, `class_name`, `subject`, `room`, `note`), `sessionExceptions` (`action === 'cancelled' | 'moved'`, `new_start`, `new_end`), `extraSessions` và `FALLBACK_SCHOOL_PERIODS` (`S1–S5`, `C1–C5`).
  * Lọc bỏ các buổi đã dời đi (`!s.is_moved`) khỏi `todayComputedSessions` khi xem trước & gửi email thử trong [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx).

---

## [2026-11-14] - Sửa Lỗi Điền Sẵn Email & Tối Ưu Giao Diện Mục "Google Calendar & AI" Trong Cài Đặt Hệ Thống

### 🔧 Đã sửa & Cải thiện (Fixed & Improved)
- **Tự động điền đúng Gmail của tài khoản đang đăng nhập ([`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx))**:
  * Khi bấm **Kết nối Google Calendar** hoặc **Kết nối lại**, ô email tự động ưu tiên lấy `settings.gcal_account_email` hoặc `profile.email` của tài khoản đang đăng nhập thay vì mặc định cứng `giaovien@gmail.com`.
  * Bổ sung nút bấm nhanh **"Dùng email đang đăng nhập"** trong modal kết nối Google Calendar và **"Dùng email tài khoản"** ở mục **Thông báo Gmail**.
- **Tinh gọn nội dung chưa hợp lý trong tab "Google Calendar & AI" ([`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx))**:
  * Thu gọn ô nhập kỹ thuật `Google OAuth Access Token` vào mục **Tùy chọn nâng cao** và hướng dẫn rõ cách dùng đường link `.ics` khi không có Token.
  * Cập nhật tên và mô tả mục **Đồng bộ dữ liệu đám mây (Cloud Sync)** (bỏ nhãn cứng `PostgreSQL 16 / Docker Backend` để phù hợp khi chạy trên Cloudflare D1 Edge).
  * Cập nhật mục **Trí tuệ nhân tạo (Google Gemini Vision)**: ghi rõ **Không bắt buộc** vì app đã có bộ đọc tiếng Việt tích hợp sẵn, kèm link lấy key miễn phí tại `aistudio.google.com`.

---

## [2026-11-14] - Trợ Lý Email Lịch Dạy Hàng Ngày 24/7 Trên Cloudflare Edge (Resend + Cron)

### ➕ Đã thêm & Nâng cấp (Added & Changed)
- **Tích hợp gửi email qua Resend API & Endpoint Cron 24/7 ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts))**:
  * Nâng cấp `POST /api/email/test`: gửi email lịch dạy thực tế qua **Resend API** (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`), tự động dựng HTML bảng lịch dạy rõ ràng theo giờ/loại/lớp/địa điểm, fallback trả lỗi chi tiết nếu thiếu biến môi trường.
  * Thêm endpoint `GET / POST /api/cron/daily-email` (bảo vệ bằng `CRON_SECRET` qua query `?secret=`, header `x-cron-secret`, hoặc `Authorization: Bearer`):
    - Quét danh sách `state:<userId>` trong Cloudflare D1/KV bằng hàm mới `kvListByPrefix`.
    - Kiểm tra người dùng có bật `settings.email_enabled`, có `settings.notification_email`, khớp khung giờ gửi (`settings.notify_time` theo múi giờ Việt Nam `UTC+7`), và chưa gửi trùng trong ngày (`last_daily_email_date`).
    - Tự động tính lịch dạy trong ngày (`computeDailyEmailItemsForState`) gồm cả lịch trường học, lịch dạy thêm cố định, buổi dời/hủy, buổi phát sinh và ngày nghỉ lễ.
    - Gửi email qua `sendEmailViaResend`, ghi nhật ký `notificationLogs` và đánh dấu `last_daily_email_date` để không gửi trùng.
  * Người dùng cuối (giáo viên) không cần tự cấu hình kỹ thuật — chỉ cần bật thông báo, nhập email và chọn giờ nhận trong trang Cài đặt.

---

- **Cập nhật Tài liệu tổng quan ([`README.md`](file:///d:/app_gv/README.md), [`doc/README.md`](file:///d:/app_gv/doc/README.md))**:
  * Bổ sung đầy đủ các tính năng mới nhất: Cloudflare Pages Functions + D1 Edge (`0ms` cold start), Google OAuth tự kích hoạt, Lịch học phát sinh có tùy chọn học phí riêng, Lọc học phí theo lớp, Lịch di động kiểu Google Calendar, và Hướng dẫn sử dụng 6 bước (`OnboardingTour`) lưu trạng thái theo tài khoản.

---

## [2026-11-14] - Bổ Sung Tính Năng "Hướng Dẫn Sử Dụng" (Interactive Step-by-Step Onboarding Tour) Lưu Trạng Thái Theo Tài Khoản Trên Server

### ➕ Đã thêm & Nâng cấp (Added & Changed)
- **Nâng cấp Hướng dẫn chi tiết vào từng trang & chỉ từng nút bấm + Menu chọn hướng dẫn riêng từng trang ([`frontend/src/components/onboarding/OnboardingTour.tsx`](file:///d:/app_gv/frontend/src/components/onboarding/OnboardingTour.tsx), [`frontend/src/store/useAuthStore.ts`](file:///d:/app_gv/frontend/src/store/useAuthStore.ts), [`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx), [`frontend/src/pages/ClassesPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassesPage.tsx), [`frontend/src/pages/ClassDetailPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassDetailPage.tsx), [`frontend/src/pages/FeesPage.tsx`](file:///d:/app_gv/frontend/src/pages/FeesPage.tsx), [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx))**:
  * Khi bấm nút **"Hướng dẫn (?)"** ở bất kỳ trang nào (kể cả trang Lịch dạy trên mobile & desktop), hộp chọn **Hướng dẫn sử dụng từng trang** mở ra cho phép:
    1. Bấm 1 chạm để xem **"Hướng dẫn chi tiết trang đang mở"** (tự động khoanh sáng từng nút bấm thật ngay trên trang đó).
    2. Chọn xem hướng dẫn riêng của bất kỳ trang nào (*Trang Lịch dạy*, *Danh sách Lớp học*, *Chi tiết Lớp & Điểm danh*, *Học phí & Công nợ*, *Cài đặt hệ thống*, *Hồ sơ cá nhân*) — hệ thống tự chuyển tới trang đó và chỉ từng nút bấm.
    3. Hoặc chọn **"Xem toàn bộ hướng dẫn từ đầu"** để hệ thống tự đi qua từng trang và chỉ từng nút bấm chính.
- **Lưu trạng thái `onboarding_completed` theo tài khoản người dùng trên Server / Database ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts), [`backend/src/auth.ts`](file:///d:/app_gv/backend/src/auth.ts), [`backend/src/server.ts`](file:///d:/app_gv/backend/src/server.ts), [`frontend/src/types/index.ts`](file:///d:/app_gv/frontend/src/types/index.ts), [`frontend/src/lib/supabase.ts`](file:///d:/app_gv/frontend/src/lib/supabase.ts), [`frontend/src/store/useAuthStore.ts`](file:///d:/app_gv/frontend/src/store/useAuthStore.ts))**:
  * Bổ sung trường `onboarding_completed?: boolean` vào `UserProfile` / `StoredUser` / `UserProfileRecord` và API `POST /api/profile/onboarding-complete` (cùng hỗ trợ cập nhật qua `PUT /api/profile/me`).
  * Tài khoản mới tạo từ bây giờ (qua cả đăng ký Email/Mật khẩu lẫn đăng nhập Google lần đầu) được gán `onboarding_completed: false` để hướng dẫn tự động hiện đúng 1 lần khi vào ứng dụng lần đầu.
  * Tài khoản cũ đã có sẵn trước khi có tính năng này mặc định `onboarding_completed: true` (đánh dấu là đã xem để không làm phiền, nhưng vẫn có thể bấm nút **"Hướng dẫn"** để xem bất cứ lúc nào).
  * Khi người dùng hoàn thành hoặc bấm **"Bỏ qua"**, nút **X**, phím **Esc**, hay bấm ra vùng nền bên ngoài, trạng thái `onboarding_completed = true` được lưu trực tiếp lên server/database theo tài khoản (đổi điện thoại hoặc đăng nhập trên máy tính khác cũng không bị hiện lại).
- **Giao diện Hướng dẫn từng bước có Spotlight & Tooltip thông minh ([`frontend/src/components/onboarding/OnboardingTour.tsx`](file:///d:/app_gv/frontend/src/components/onboarding/OnboardingTour.tsx))**:
  * Gồm 6 bước ngắn gọn, dễ hiểu bằng tiếng Việt kèm khung sáng làm nổi bật đúng phần giao diện đang giải thích (`spotlight` + `tooltip`):
    1. Chào mừng và giới thiệu ứng dụng.
    2. Cách thêm lớp học và học sinh (`Lớp & Điểm danh`).
    3. Cách xếp lịch dạy và tạo **Lịch học phát sinh** có học phí riêng (`Lịch dạy`).
    4. Cách điểm danh nhanh mỗi buổi học (`Có mặt / Vắng / Có phép`).
    5. Cách xem học phí, lọc theo lớp và ghi nhận thu tiền (`Học phí`).
    6. Cách vào `Cài đặt` và nơi bấm nút **"Hướng dẫn (?)"** để mở lại bất cứ lúc nào.
  * Đầy đủ điều khiển: chỉ báo tiến độ `"Bước X/6"`, chấm tiến độ, nút `"Quay lại"`, `"Tiếp tục"`, bước cuối là `"Bắt đầu dùng"`, nút `"Bỏ qua"` luôn hiện rõ ở mọi bước, nút đóng `X`, phím `Esc` và đóng khi bấm ra ngoài.
  * Tự động tính toán vị trí thẻ hướng dẫn trên cả điện thoại màn hình nhỏ và máy tính để không bao giờ tràn màn hình hoặc đè lên phần giao diện đang được giải thích; hỗ trợ chế độ Sáng/Tối và tôn trọng `prefers-reduced-motion`.
- **Nút cố định mở lại Hướng dẫn bất cứ lúc nào ([`frontend/src/components/ui/TopBar.tsx`](file:///d:/app_gv/frontend/src/components/ui/TopBar.tsx), [`frontend/src/components/layout/AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx), [`frontend/src/components/ui/BottomNav.tsx`](file:///d:/app_gv/frontend/src/components/ui/BottomNav.tsx), [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx))**:
  * Thêm nút **"Hướng dẫn"** (biểu tượng dấu hỏi `?`) trên thanh `TopBar` (mọi trang trên điện thoại & máy tính), trên thanh điều hướng trái (`AppShell`) và trong trang `Cài đặt` (`SettingsPage`).
  * Bấm vào sẽ chạy lại toàn bộ hướng dẫn từ Bước 1/6 mà không làm thay đổi trạng thái `onboarding_completed = true` đã lưu.

---

## [2026-11-14] - Sửa Lỗi Giật Cuộn Trang (Scroll Jump), Bổ Sung "Lịch Học Phát Sinh" Có Tùy Chọn Học Phí Riêng & Bộ Lọc Theo Lớp Ở Trang Học Phí

### 🛠️ Đã sửa & Bổ sung (Fixed & Added)
- **1. Sửa triệt để lỗi giật vị trí cuộn (Scroll Jump) trên trang "Cài đặt hệ thống" của người dùng và "Cài đặt lịch dạy" của Admin ([`frontend/src/components/ui/TopBar.tsx`](file:///d:/app_gv/frontend/src/components/ui/TopBar.tsx), [`frontend/src/index.css`](file:///d:/app_gv/frontend/src/index.css), [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx), [`frontend/src/components/layout/AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx), [`frontend/src/pages/admin/AdminDashboardPage.tsx`](file:///d:/app_gv/frontend/src/pages/admin/AdminDashboardPage.tsx), [`frontend/src/pages/ClassDetailPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassDetailPage.tsx))**:
  * **Nguyên nhân gốc**:
    1. `TopBar.tsx` trước đây gắn sự kiện `window.scrollY > 24` để bật trạng thái `compact`, làm ẩn dòng `subtitle` và thu nhỏ padding/font-size (~28px). Khi cuộn qua mốc `24px`, chiều cao trang giảm đột ngột kéo `scrollY` tụt ngược xuống `< 24px`, kích hoạt lại `compact = false` và tạo vòng lặp giật vị trí cuộn liên tục, đồng thời làm lệch vị trí `top` của thanh danh mục `sticky` bên dưới trên cả điện thoại và máy tính.
    2. `index.css` đặt `overflow-x: hidden` đồng thời trên cả `html` và `body`, gây xung đột vùng cuộn (dual scroll container) và làm hỏng cơ chế neo vị trí cuộn tự nhiên (`overflow-anchor`) của trình duyệt khi dữ liệu thay đổi.
    3. `AdminDashboardPage.tsx` gọi `setSearchParams({ tab })` không có `preventScrollReset: true`.
  * **Giải pháp**:
    - Giữ chiều cao `TopBar` ổn định tuyệt đối khi cuộn (chỉ đổi đổ bóng `shadow-xs`), gắn `overflowAnchor: 'none'` cho các thanh `sticky` (`TopBar`, thanh danh mục `SettingsPage`, sidebar `AppShell`, tab bar `ClassDetailPage`).
    - Chuyển `overflow-x: hidden` trên `html, body` sang `overflow-x: clip; overflow-anchor: auto;`.
    - Bổ sung `{ replace: true, preventScrollReset: true }` khi chuyển tab trong `AdminDashboardPage.tsx` và hiển thị tiêu đề `"Cài đặt lịch dạy"` khi Admin mở trang `/settings`.
- **2. Lớp học: Thêm chức năng "Lịch học phát sinh" kèm ô "Học phí buổi này", hỗ trợ Sửa & Xóa ([`frontend/src/types/index.ts`](file:///d:/app_gv/frontend/src/types/index.ts), [`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts), [`frontend/src/lib/conflictDetector.ts`](file:///d:/app_gv/frontend/src/lib/conflictDetector.ts), [`frontend/src/lib/debtEngine.ts`](file:///d:/app_gv/frontend/src/lib/debtEngine.ts), [`frontend/src/components/schedule/SessionActionModals.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SessionActionModals.tsx), [`frontend/src/components/schedule/ScheduleExtraModals.tsx`](file:///d:/app_gv/frontend/src/components/schedule/ScheduleExtraModals.tsx), [`frontend/src/pages/ClassesPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassesPage.tsx), [`frontend/src/pages/ClassDetailPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassDetailPage.tsx), [`backend/sql/init.sql`](file:///d:/app_gv/backend/sql/init.sql), [`backend/src/sync.ts`](file:///d:/app_gv/backend/src/sync.ts))**:
  * Bổ sung trường tùy chọn `custom_price?: number | null` (**"Học phí buổi này"**) vào `ExtraSession`:
    - Nếu nhập số tiền: buổi học phát sinh dùng mức giá này thay cho giá mặc định của lớp.
    - Nếu để trống: giữ nguyên giá mặc định của lớp.
  * Thêm mục quản lý **"Lịch học phát sinh"** trực tiếp trên từng thẻ lớp tại trang Danh sách lớp (`ClassesPage.tsx`) và trong trang Chi tiết lớp (`ClassDetailPage.tsx`), cũng như trên hộp chi tiết buổi học ở trang Lịch dạy (`ScheduleExtraModals.tsx`).
  * Hỗ trợ **Tạo mới**, **Điểm danh**, **Sửa** (tự động đồng bộ bản ghi điểm danh và ghi chú buổi học nếu đổi ngày/giờ/lớp) và **Xóa** (tự động dọn sạch điểm danh của buổi phát sinh đã xóa) kèm tính học phí chính xác theo mức giá của buổi phát sinh trong `debtEngine.ts`.
- **3. Học phí: Nâng cấp bộ lọc theo lớp kết hợp cùng bộ lọc tháng ([`frontend/src/pages/FeesPage.tsx`](file:///d:/app_gv/frontend/src/pages/FeesPage.tsx), [`frontend/src/lib/debtEngine.ts`](file:///d:/app_gv/frontend/src/lib/debtEngine.ts))**:
  * Nâng cấp `buildFeeRowFromProfile(profile, selectedMonth, filterClassId)` để khi chọn một lớp cụ thể trên trang Học phí (hoặc chọn `"Tất cả lớp"`), danh sách học sinh và toàn bộ các số tổng (**Phải thu**, **Đã thu**, **Còn thiếu**) chỉ tính riêng cho lớp đã chọn (kể cả với học sinh học nhiều lớp hoặc chuyển lớp trong tháng).
  * Hiển thị bộ lọc chọn lớp đồng bộ cùng bộ lọc tháng trên cả thanh điều khiển đầu trang và thanh lọc nhanh của bảng dữ liệu.

---

## [2026-11-14] - Chuyển Đổi Kiến Trúc Deploy 100% Lên Cloudflare (Cloudflare Pages + Pages Functions `/api/*` + Cloudflare D1 Edge Database — Không Bao Giờ Tắt Server / 0ms Cold Start)

### 🚀 Đã thêm & Nâng cấp (Added & Changed)
- **Tích hợp Backend Serverless trực tiếp trên Cloudflare Pages Functions (`frontend/functions/api/[[route]].ts` & `functions/api/[[route]].ts`)**:
  * Loại bỏ sự phụ thuộc vào Render.com Free Tier (vốn tự tắt server sau 15 phút không dùng và phải đợi 30–50 giây để wake up).
  * Xây dựng bộ định tuyến Edge API hoàn chỉnh tại [`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts) và [`functions/api/[[route]].ts`](file:///d:/app_gv/functions/api/[[route]].ts) chạy trực tiếp trên mạng lưới Cloudflare V8 Edge (0ms cold start, phản hồi tức thì `< 20ms`, miễn phí 100.000 requests/ngày).
  * Hỗ trợ đầy đủ các nhóm API trên cùng một tên miền `*.pages.dev` (không cần cấu hình CORS hay server tách rời):
    - Xác thực & Phiên đăng nhập (`/api/auth/login`, `/api/auth/register`, `/api/auth/me`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/public-config`), tự động khởi tạo sẵn tài khoản Admin (`admin@lichday.vn` / `Admin123456`) và Giáo viên (`giaovien@lichday.vn` / `Giaovien123`).
    - Hồ sơ cá nhân & Bảo mật (`/api/profile/me`, `/api/profile/change-password`, `/api/profile/revoke-other-sessions`).
    - Quản trị viên Admin (`/api/admin/overview`, `/api/admin/users/*`, `/api/admin/settings`, `/api/admin/invites/*`).
    - Đồng bộ dữ liệu đám mây 2 chiều (`GET / PUT / POST /api/sync`) cho toàn bộ 14 lớp học, thời khóa biểu trường, học sinh, điểm danh và học phí.
    - Gửi email qua Resend HTTP Edge API (`/api/email/test`) và phân tích tin nhắn Zalo tiếng Việt (`/api/ai/parse-zalo`).
- **Cơ sở dữ liệu Cloudflare D1 SQLite Edge ([`cloudflare/d1-schema.sql`](file:///d:/app_gv/cloudflare/d1-schema.sql))**:
  * Lưu trữ bền vững toàn bộ tài khoản và dữ liệu lịch dạy trong bảng `kv_store` trên Cloudflare D1 (miễn phí 5GB lưu trữ + 5 triệu lượt đọc/ngày).
  * Tự động khởi tạo bảng `CREATE TABLE IF NOT EXISTS kv_store` ngay ở request đầu tiên (không lo lỗi thiếu bảng khi mới gắn D1) và có bộ nhớ dự phòng tự động nếu người dùng chưa kịp gắn binding `DB`.
  * Gỡ bỏ tệp `wrangler.toml` / `frontend/wrangler.toml` để Cloudflare Pages Dashboard mở khóa nút **`+ Add` Bindings** trực tiếp trên giao diện web (không bị khóa bởi chế độ quản lý qua file `wrangler.toml`).
- **Chuẩn hóa URL kết nối API phía Frontend & Ẩn hộp Tài khoản mẫu khi Deploy ([`frontend/src/lib/supabase.ts`](file:///d:/app_gv/frontend/src/lib/supabase.ts), [`frontend/src/lib/backendSync.ts`](file:///d:/app_gv/frontend/src/lib/backendSync.ts), [`frontend/src/pages/auth/LoginPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/LoginPage.tsx), [`frontend/public/_redirects`](file:///d:/app_gv/frontend/public/_redirects), [`frontend/public/_routes.json`](file:///d:/app_gv/frontend/public/_routes.json), [`package.json`](file:///d:/app_gv/package.json))**:
  * Gỡ bỏ giá trị mặc định cứng `http://localhost:4000` trong `supabase.ts`, hợp nhất `VITE_API_URL` / `VITE_API_BASE_URL` mặc định về `''` (same-origin `/api/*`), bổ sung `_routes.json` để Cloudflare Pages định tuyến chính xác 100% các request `/api/*` vào Pages Functions.
  * Đồng bộ cấu trúc phản hồi JSON của `frontend/functions/api/[[route]].ts` (`success: true`, `sessionToken`, `expiresAt`, `status: 'active'`) khớp tuyệt đối với `supabase.ts`.
  * Ẩn hộp **"Tài khoản mẫu để kiểm tra nhanh Bước 1"** trên màn hình Đăng nhập (`LoginPage.tsx`) và các nút tài khoản mẫu trên `AuthCallbackPage.tsx` khi build bản Production/Deploy (chỉ hiển thị ở môi trường `import.meta.env.DEV`) và loại bỏ tài khoản mẫu `choduyet@lichday.vn`.
  * **Tự động kích hoạt ngay tài khoản khi Đăng ký / Đăng nhập bằng Google (Không cần chờ Admin duyệt)** ([`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts), [`backend/src/auth.ts`](file:///d:/app_gv/backend/src/auth.ts)): Mọi tài khoản mới đăng ký hoặc đăng nhập qua Google (`/api/auth/google/url`, `/api/auth/google/callback`, `/api/auth/google/redirect-complete`, `/api/auth/sync-supabase`) đều được gán `status: 'active'` và `email_verified: true` ngay lập tức để vào thẳng ứng dụng mà không phải qua màn hình chờ duyệt.
  * **Tách biệt hoàn toàn dữ liệu theo từng tài khoản & Reset sạch Database (`v3_clean_*`)** ([`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts), [`frontend/src/store/initialData.ts`](file:///d:/app_gv/frontend/src/store/initialData.ts), [`frontend/src/lib/backendSync.ts`](file:///d:/app_gv/frontend/src/lib/backendSync.ts), [`frontend/src/App.tsx`](file:///d:/app_gv/frontend/src/App.tsx), [`frontend/functions/api/[[route]].ts`](file:///d:/app_gv/frontend/functions/api/[[route]].ts)):
    - Mọi tài khoản mới tạo (qua Đăng ký hoặc Google) đều bắt đầu **trống 100%** (0 lớp học, 0 học sinh, 0 lịch dạy); chỉ duy nhất tài khoản mặc định của bạn (`giaovien@lichday.vn`) mới được nạp sẵn bộ 14 lớp dạy thêm và lịch dạy trường.
    - Ngăn chặn việc rò rỉ dữ liệu từ `localStorage` của tài khoản trước sang tài khoản mới khi chuyển đổi người dùng (`setUserId`) và tự động dọn sạch toàn bộ bản ghi cũ trên Cloudflare D1 (`DELETE FROM kv_store WHERE key NOT LIKE 'v3_clean_%'`).

---

## [2026-11-14] - Chuẩn Hóa Bảng Thời Khóa Biểu PC & Giao Diện Mobile Chuẩn Google Calendar (`SessionMatrixView.tsx`, `AgendaCalendarView.tsx`, `TimeGridCalendar.tsx`, `SchedulePage.tsx`)

### 🎨 Đã cải tiến & Sửa lỗi (Enhanced & Fixed)
- **Chuẩn hóa Bảng Thời Khóa Biểu (`SessionMatrixView.tsx`) trên PC / Tablet ([`frontend/src/components/schedule/SessionMatrixView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SessionMatrixView.tsx))**:
  * Chuyển sang cấu trúc bảng cố định 7 cột đều nhau (`table-fixed w-full border-collapse`) kèm thanh tiêu đề thống kê nhanh (`🏫 Dạy trường: X buổi` · `📚 Dạy thêm: Y ca`).
  * Các ô `🏫 Dạy Trường` được căn giữa gọn gàng với tông Xám-Xanh dịu mắt; các thẻ ca dạy thêm có bố cục đồng nhất (`Ca 1..4` + khung giờ `tabular-nums` + tên lớp đậm + sĩ số), tự động ẩn các chuỗi địa điểm trùng lặp với tên lớp (`Phòng học...`, `Kèm...`, `Ca ghép...`).
  * Chuyển nút `+ Thêm ca` thành nút nổi góc phải trên khi di chuột vào ô (`group-hover/cell`), giúp bảng gọn đẹp và hiển thị trọn vẹn cả 3 buổi Sáng / Chiều / Tối trên một màn hình PC.
- **Thiết kế Giao diện Mobile chuẩn Google Calendar & Tự động chuyển đổi khi đổi kích thước màn hình ([`frontend/src/components/schedule/AgendaCalendarView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/AgendaCalendarView.tsx), [`frontend/src/components/schedule/TimeGridCalendar.tsx`](file:///d:/app_gv/frontend/src/components/schedule/TimeGridCalendar.tsx), [`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx))**:
  * **Tự động nhận diện Mobile (`matchMedia('(max-width: 767px)')`)**: Khi mở trên điện thoại hoặc thu nhỏ màn hình sang bản Mobile, ứng dụng tự động chuyển sang chế độ **Lịch biểu Google Calendar (`agenda`)** thay vì giữ bảng ngang PC; khi mở rộng lại màn hình PC tự động trở về chế độ **Bảng ca (`session_matrix`)**.
  * **Thanh chọn ngày 7 cột cố định kiểu Google Calendar (`T2` – `CN`)**: Hiển thị chữ viết tắt Thứ, số ngày trong vòng tròn (nền xanh `#1A73E8` cho Hôm nay, nền xanh nhạt `#E8F0FE` cho ngày đang chọn) và các chấm màu tròn bên dưới đại diện cho màu sắc thực tế của các lớp học trong ngày.
  * **Luồng Lịch biểu 2 cột chuẩn Google Calendar (`AgendaCalendarView.tsx`)**: Cột trái cố định hiển thị Thứ + Số ngày tròn (`sticky top-2`), cột phải hiển thị danh sách các khối sự kiện màu sắc theo thứ tự thời gian kèm vạch đỏ giờ hiện tại (`nowTimeStr`) và thanh ngăn kéo lịch tháng mở rộng ngay dưới tiêu đề tháng.
  * **Lưới giờ Mobile (`TimeGridCalendar.tsx`)**: Thu gọn cột trục giờ (`w-11`) và bỏ ép chiều rộng ngang `min-w-[660px]` để các chế độ `Ngày`, `3 ngày`, `Tuần` hiển thị vừa khít màn hình điện thoại giống ứng dụng Google Calendar.

---

## [2026-11-14] - Thiết kế Lại Hệ Màu Sắc Tương Phản Cao & Bố Cục Trang Lịch Dạy Trên Cả Mobile và PC (`sessionStyles.ts`, `SessionMatrixView.tsx`, `AgendaCalendarView.tsx`, `TimeGridCalendar.tsx`, `MonthCalendarView.tsx`, `SchoolPeriodGridView.tsx`, `SchedulePage.tsx`)

### 🎨 Đã cải tiến & Sửa lỗi (Enhanced & Fixed)
- **Hệ màu sắc theo từng lớp rõ nét, tương phản cao ([`frontend/src/lib/sessionStyles.ts`](file:///d:/app_gv/frontend/src/lib/sessionStyles.ts), [`TimeGridCalendar.tsx`](file:///d:/app_gv/frontend/src/components/schedule/TimeGridCalendar.tsx), [`AgendaCalendarView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/AgendaCalendarView.tsx), [`MonthCalendarView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/MonthCalendarView.tsx), [`SchoolPeriodGridView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SchoolPeriodGridView.tsx))**:
  * Khắc phục việc toàn bộ 14 lớp dạy thêm trước đây đều bị gộp chung vào một màu cam nhạt (`--color-tutoring-bg`) kèm lớp phủ vàng/cam đục trên nền lưới giờ khiến mắt khó phân biệt các ca liên tiếp.
  * Áp dụng bảng màu riêng biệt, độ tương phản cao theo đúng mã màu `session.color` của từng lớp (`Xanh dương`, `Hồng`, `Tím`, `Vàng hổ phách`, `Xanh ngọc lục bảo`, `Đỏ hồng`, `Cam`, `Xanh lơ`, `Chàm`, `Xanh da trời`...) trên cả chế độ Sáng và Tối, trong khi các buổi `🏫 Dạy Trường` dùng tông Xám-Xanh dịu mắt để làm nổi bật các ca dạy thêm.
  * Loại bỏ lớp phủ màu nền đục (`--tint-morning`, `--tint-afternoon`, `--tint-evening`) trên `TimeGridCalendar`, giúp lưới giờ sáng sủa, sạch sẽ.
- **Bổ sung Chế độ Xem `"Bảng ca (Sáng / Chiều / Tối)"` (`session_matrix`) & Tối ưu Bố cục PC / Mobile ([`frontend/src/components/schedule/SessionMatrixView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SessionMatrixView.tsx), [`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx))**:
  * **Chế độ `"Bảng ca"` (`SessionMatrixView.tsx`)**: Hiển thị toàn bộ 7 ngày (`Thứ 2` – `Chủ nhật`) chia theo 3 hàng **Buổi Sáng (`07:00–11:45`)**, **Buổi Chiều (`13:00–18:00`)**, **Buổi Tối (`18:30–21:30`)** khớp trực quan với bảng thời khóa biểu của giáo viên, tự động đánh số `Ca 1`, `Ca 2`, `Ca 3`, `Ca 4` trong ngày, nhìn trọn tuần trên 1 màn hình PC không cần cuộn dọc.
  * **Bố cục Mobile (`AgendaCalendarView.tsx` & `SchedulePage.tsx`)**:
    - Hiển thị nút `<` / `>` chuyển tuần ngay trên thanh đầu trang điện thoại và thanh chuyển nhanh 5 chế độ xem dạng nút bấm (`Bảng ca` · `Danh sách` · `Lưới giờ` · `Tháng` · `Tiết trường`) thay cho ô dropdown hẹp bị cắt chữ.
    - Bổ sung **Thanh chọn nhanh 7 ngày trong tuần (`T2`..`CN`)** cố định ở đầu chế độ `Danh sách` kèm số lượng ca dạy mỗi ngày, bấm vào ngày nào tự động cuộn mượt tới ngày đó.
    - Tách cột giờ (`19:00 đến 20:30`) rõ ràng bên trái từng thẻ buổi học kèm nhãn `Ca 1`, `Ca 2`.
  * **Bố cục PC (`SchedulePage.tsx`)**: Thu gọn thanh thông báo phụ TKB trường (chỉ hiện khi đang ở tab `Tiết trường` hoặc khi tuần chưa có TKB trường) và tự động thu gọn cột lịch phụ bên trái trên màn hình `< 1440px` để nhường tối đa diện tích ngang cho bảng lịch 7 ngày.

---

## [2026-11-14] - Cập nhật Toàn bộ Dữ liệu Thời khóa biểu Dạy thêm & Giờ dạy trên Trường theo Ảnh thực tế + Thiết lập Phương án Deploy 100% Miễn phí (`initialData.ts`, `schoolPeriods.ts`, `useAppStore.ts`, `backendSync.ts`, `TimeGridCalendar.tsx`, `db.ts`, `render.yaml`, `_redirects`, `vercel.json`, `cron-keepalive.yml`)

### 🔄 Đã thay đổi & Thêm mới (Changed & Added)
- **Xóa toàn bộ dữ liệu mẫu cũ (Toán 9, Toán 10, Toán 12, 10A1, 11B2...) và nạp mới 100% Thời khóa biểu Dạy thêm & Dạy Trường theo ảnh của giáo viên ([`frontend/src/store/initialData.ts`](file:///d:/app_gv/frontend/src/store/initialData.ts), [`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts), [`frontend/src/lib/backendSync.ts`](file:///d:/app_gv/frontend/src/lib/backendSync.ts))**:
  * **Giờ trên trường (`Dạy Trường`)** ([`frontend/src/lib/schoolPeriods.ts`](file:///d:/app_gv/frontend/src/lib/schoolPeriods.ts), [`frontend/src/components/schedule/TimeGridCalendar.tsx`](file:///d:/app_gv/frontend/src/components/schedule/TimeGridCalendar.tsx)):
    - **Sáng (`07:00 – 11:45`)**: 5 tiết (`S1: 07:00–07:45`, `S2: 07:55–08:40`, `S3: 09:10–09:55`, `S4: 10:05–10:50`, `S5: 11:00–11:45`) từ **Thứ 2 đến Thứ 6** (`Dạy Trường`), tự động gộp thành khối liên tục `07:00 – 11:45` trên lịch.
    - **Chiều (`14:00 – 16:30`)**: 3 tiết (`C1: 14:00–14:45`, `C2: 14:50–15:35`, `C3: 15:45–16:30`) vào **Thứ 2, Thứ 4, Thứ 6** (`Dạy Trường`), gộp thành khối `14:00 – 16:30`.
  * **14 Lớp dạy thêm & 16 Ca dạy cố định trong tuần**:
    - **Thứ 2**: Tối (`19:00–20:30`) **Văn 12 onl (Thùy)**.
    - **Thứ 3**: Chiều Ca 1 (`16:00–18:00`) **Văn 9 off 2hs** · Tối Ca 2 (`19:00–20:30`) **Văn 7V1**.
    - **Thứ 4**: Tối (`19:00–20:30`) **Văn 9 onl**.
    - **Thứ 5**: Chiều Ca 1 (`13:30–15:30`) **Văn 7 Bảo** · Chiều Ca 2 (`16:00–18:00`) **Văn 9V1** · Tối Ca 3 (`18:30–20:00`) **Văn 8, V6** · Tối Ca 4 (`20:00–21:30`) **Văn 12V1 Trang**.
    - **Thứ 6**: Tối (`18:30–20:00`) **TV 5 Bảo Anh**.
    - **Thứ 7**: Sáng Ca 1 (`09:00–10:30`) **Văn 6V1; V7; TV2** · Chiều Ca 2 (`13:30–15:00`) **Văn 9 onl** · Chiều Ca 3 (`15:30–17:00`) **Văn 12 onl (Thùy)** · Tối Ca 4 (`19:00–21:00`) **Văn 12; V9**.
    - **Chủ nhật**: Sáng Ca 1 (`08:00–10:00`) **TV5 Hiển** · Chiều Ca 2 (`13:00–14:30`) **Văn 7V2** · Chiều Ca 3 (`15:00–16:30`) **Văn 8**.
  * Tự động sao lưu và làm mới `localStorage` (`DATA_SEED_VERSION = '2026-van-schedule-v1'`) cũng như tự động ghi đè dữ liệu mẫu cũ trên Backend PostgreSQL qua `bootstrapCloudSync()`.
- **Thiết lập Bộ cấu hình Deploy Online 100% Miễn phí (0đ/tháng)**:
  * Thêm [`frontend/public/_redirects`](file:///d:/app_gv/frontend/public/_redirects) cho **Cloudflare Pages** và [`frontend/vercel.json`](file:///d:/app_gv/frontend/vercel.json) cho **Vercel Free**.
  * Thêm [`render.yaml`](file:///d:/app_gv/render.yaml) và cập nhật [`backend/src/db.ts`](file:///d:/app_gv/backend/src/db.ts) hỗ trợ `DATABASE_URL` có SSL để kết nối **Render Free Web Service** với **Supabase Free PostgreSQL**.
  * Thêm [`.github/workflows/cron-keepalive.yml`](file:///d:/app_gv/.github/workflows/cron-keepalive.yml) dùng **GitHub Actions Free Cron** để giữ ấm Backend và kích hoạt gửi email lịch dạy lúc 06:00 sáng mỗi ngày hoàn toàn miễn phí.

---

## [2026-11-14] - Khắc phục Triệt để Lỗi Màn hình Trắng khi Đăng nhập Tài khoản Giáo viên có Dữ liệu Cũ trong `localStorage` (`useAppStore.ts`, `schoolPeriods.ts`, `SchedulePage.tsx`, `App.tsx`, `serialize.ts`)

### 🛠️ Đã sửa (Fixed)
- **Sửa lỗi Hydration đồng bộ của Zustand `persist` gây `ReferenceError` (TDZ) và làm `settings`/`schoolSchedule` không được chuẩn hóa ([`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts))**:
  * **Nguyên nhân gốc**: Khi trình duyệt đã lưu `gv-app-store` trong `localStorage`, middleware `persist` của Zustand chạy `onRehydrateStorage` đồng bộ ngay bên trong `create()` trước khi biến `useAppStore` kịp khởi tạo (Temporal Dead Zone). Lệnh `useAppStore.setState(...)` trong `onRehydrateStorage` ném lỗi `ReferenceError` (bị `toThenable` của Zustand nuốt lỗi), khiến `settings: null`, `schoolWeekConfigs: undefined`, và dữ liệu cũ không được chuẩn hóa. Khi đăng nhập vào tài khoản Giáo viên (mở `SchedulePage`), ứng dụng bị lỗi `TypeError: Cannot read properties of null (reading 'default_desktop_view')` dẫn tới **màn hình trắng**.
  * **Khắc phục**: Chuyển toàn bộ logic chuẩn hóa và chuyển đổi dữ liệu cũ vào hàm `merge(persistedState, currentState)` của Zustand `persist` có bọc `try/catch` an toàn, đảm bảo mọi trường (`settings`, `calendarLayers`, `schoolWeekConfigs`, `schoolPeriods`, `schoolSchedule`, v.v.) luôn hợp lệ ngay trước lần render đầu tiên.
- **Sửa lỗi `TypeError: (rawPeriodCode || "").trim is not a function` với dữ liệu tiết trường kiểu số cũ (`period: 1`) ([`frontend/src/lib/schoolPeriods.ts`](file:///d:/app_gv/frontend/src/lib/schoolPeriods.ts))**:
  * Ép kiểu chuỗi an toàn `String(rawPeriodCode ?? '')` trong `normalizePeriodCode`, `findSchoolPeriod`, `getPeriodIndex`, `getMondayOfDateStr` và `migrateLegacySchoolSchedule` để tương thích 100% với dữ liệu lịch trường cũ dùng `period` dạng số (`1..5`) hoặc `id` dạng số.
- **Bảo vệ truy cập thuộc tính trong `SchedulePage.tsx` & Bổ sung `AppErrorBoundary` ([`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx), [`frontend/src/App.tsx`](file:///d:/app_gv/frontend/src/App.tsx), [`frontend/src/store/useAuthStore.ts`](file:///d:/app_gv/frontend/src/store/useAuthStore.ts), [`backend/src/serialize.ts`](file:///d:/app_gv/backend/src/serialize.ts))**:
  * Sử dụng optional chaining an toàn trong `SchedulePage.tsx` (`settings?.default_desktop_view`, `schoolWeekConfigs?.[currentWeekMonday]`, `(sessionExceptions || [])`).
  * Bổ sung `AppErrorBoundary` tại `App.tsx` và tự động đồng bộ `bootstrapCloudSync()` khi giáo viên đăng nhập.
  * Bổ sung các cột kiểu `DATE` (`week_start`, `start_date`, `left_date`, `from_date`, `to_date`, `effective_from`, `paid_at`) vào `isDateOnlyColumn` trong `backend/src/serialize.ts`.

---

## [2026-11-05] - Sửa toàn bộ lỗi hiển thị, cắt khối (Flexbox Clipping), tràn thanh công cụ Mobile và chuyển đổi tuần hiện tại trên Trang Lịch dạy Giáo viên (`SchedulePage.tsx`, `AgendaCalendarView.tsx`, `SchoolPeriodGridView.tsx`, `TimeGridCalendar.tsx`)

### 🛠️ Đã sửa (Fixed)
- **Khắc phục lỗi bị ép chiều cao và cắt mất buổi học Chiều/Tối ở chế độ "Lịch biểu" (`AgendaCalendarView.tsx` - [`frontend/src/components/schedule/AgendaCalendarView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/AgendaCalendarView.tsx))**:
  * Bổ sung `shrink-0` cho từng thẻ ngày (`.card`) bên trong khung cuộn dọc `flex-col` để các thẻ ngày giữ nguyên chiều cao đầy đủ của cả 3 buổi Sáng / Chiều / Tối và cuộn mượt mà, không bị Flexbox thu hẹp và `overflow-hidden` cắt nửa dưới.
- **Khắc phục lỗi bị cắt mất các tiết Buổi Chiều (`C2–C4/C5`) và dải lịch dạy thêm ở chế độ "Bảng tiết của trường" (`SchoolPeriodGridView.tsx` - [`frontend/src/components/schedule/SchoolPeriodGridView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SchoolPeriodGridView.tsx))**:
  * Bổ sung `shrink-0` cho cả 2 thẻ `.card` (*Bảng tiết của trường* và *Dải lịch dạy thêm & phát sinh trong tuần*) để hiển thị trọn vẹn toàn bộ tiết Sáng, tiết Chiều và dải dạy thêm.
- **Khắc phục lỗi thanh công cụ trên điện thoại bị tràn đè nút "Hôm nay" và ẩn mất tiêu đề Tháng/Năm (`SchedulePage.tsx`, `index.css` - [`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx), [`frontend/src/index.css`](file:///d:/app_gv/frontend/src/index.css))**:
  * Tách lớp `.toolbar-select` khỏi quy tắc `font-size: 16px !important` trên màn hình `< 768px` và giới hạn chiều rộng hợp lý cho ô chọn chế độ xem trên điện thoại, hiển thị đầy đủ nút `< >` chuyển kỳ và tiêu đề tháng/tuần.
  * Chuyển lịch nhỏ khi bấm vào tiêu đề tháng (`mobileMonthDropdownOpen`) sang dạng **Popover nổi (`absolute z-50`)** có lớp nền đóng khi bấm ra ngoài thay vì đẩy toàn bộ chiều cao thanh đầu trang xuống.
  * Hiển thị chính xác tiêu đề tháng khi ở chế độ `Tháng` và chấm báo hiệu có buổi dạy (`datesWithSessions`) cho toàn bộ các ngày trong tháng trên `MiniCalendar`.
  * Kết nối callback `onRequestApplyMoreWeeks` giữa `SchoolImageModal` và `ApplySchoolWeeksModal`.
- **Cải thiện lưới giờ 7 cột trên điện thoại & dải "Ra chơi dài" (`TimeGridCalendar.tsx` - [`frontend/src/components/schedule/TimeGridCalendar.tsx`](file:///d:/app_gv/frontend/src/components/schedule/TimeGridCalendar.tsx))**:
  * Hỗ trợ cuộn ngang mượt mà với cột giờ cố định (`sticky left-0`) và tiêu đề thứ cố định (`sticky top-0`) khi xem chế độ 4 ngày hoặc 7 ngày (`Tuần`) trên màn hình điện thoại hẹp, tránh làm các cột bị bóp nhỏ 45px.
  * Sửa lỗi hiển thị nhãn `"Ra chơi dài (08:35–08:55)"` bị cắt chữ hai đầu khi cột hẹp.
- **Sửa lỗi chuyển đổi dữ liệu Thời khóa biểu trường tuần hiện tại (`schoolPeriods.ts`, `useAppStore.ts` - [`frontend/src/lib/schoolPeriods.ts`](file:///d:/app_gv/frontend/src/lib/schoolPeriods.ts), [`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts))**:
  * Đảm bảo dữ liệu lịch trường mặc định hoặc dữ liệu cũ chưa có `week_start` luôn được gán về thứ Hai của tuần hiện tại (`currentMonday`) thay vì bị rơi về tuần `2026-08-31`.

---

## [2026-11-05] - Xây dựng Cổng Quản trị Hệ thống (`AdminDashboardPage.tsx`) Dành Riêng cho Tài khoản Admin & Trang Hồ sơ Cá nhân (`ProfilePage.tsx`) cho Cả Admin và Giáo viên

### ➕ Đã thêm (Added)
- **Không gian Làm việc & Nghiệp vụ Dành Riêng cho Tài khoản Admin ([`frontend/src/pages/admin/AdminDashboardPage.tsx`](file:///d:/app_gv/frontend/src/pages/admin/AdminDashboardPage.tsx), [`frontend/src/App.tsx`](file:///d:/app_gv/frontend/src/App.tsx), [`frontend/src/components/layout/AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx), [`frontend/src/components/ui/BottomNav.tsx`](file:///d:/app_gv/frontend/src/components/ui/BottomNav.tsx))**:
  * Khi đăng nhập vào tài khoản Admin (`profile.role === 'admin'`, xác thực bởi `ADMIN_EMAIL` trên server), ứng dụng **mở trực tiếp Cổng Quản trị Hệ thống (`/admin`)** với thanh điều hướng riêng biệt cho Admin thay vì mở màn hình lịch dạy giống tài khoản giáo viên thường.
  * **Tab 1 — Duyệt & Quản lý Tài khoản Giáo viên (`/admin?tab=accounts`)**:
    - 5 thẻ thống kê KPI: *Chờ phê duyệt* (nổi bật màu vàng cam kèm huy hiệu số lượng trên thanh bên), *GV Đang hoạt động*, *Tài khoản bị khóa*, *Tổng số Giáo viên*, *Đăng nhập 7 ngày qua*.
    - Khung **"Danh sách Giáo viên đang chờ phê duyệt"** nổi bật ở đầu trang với nút **Phê duyệt ngay**, **Duyệt tất cả (Hàng loạt)** và **Từ chối / Xóa**.
    - Bảng quản lý toàn bộ tài khoản giáo viên kèm tìm kiếm và lọc trạng thái, hỗ trợ các thao tác quản trị có hộp thoại xác nhận và ghi `audit_log`: **Duyệt**, **Khóa tài khoản (nhập lý do & thu hồi phiên ngay lập tức)**, **Mở khóa**, **Hỗ trợ mật khẩu (cấp mật khẩu tạm thời để gửi Zalo hoặc gửi link đặt lại mật khẩu 1 giờ)**, **Tạo tài khoản giáo viên mới trực tiếp**, **Xóa tài khoản**.
    - Hiển thị rõ cam kết **Bảo vệ dữ liệu trẻ em**: Admin chỉ quản lý định danh tài khoản, tuyệt đối không xem dữ liệu lớp học, học sinh, điểm danh hay học phí của giáo viên khác.
  * **Tab 2 — Mã mời Giáo viên (`/admin?tab=invites`)**: Tạo mã mời mới (dùng chung N lượt hoặc gắn riêng cho 1 email, chọn hạn dùng), sao chép nhanh mã mời hoặc đường dẫn đăng ký kèm mã (`/auth/register?invite=CODE`) để gửi qua Zalo, thu hồi hoặc xóa mã mời.
  * **Tab 3 — Chế độ Đăng ký & Bảo mật (`/admin?tab=settings`)**: Cấu hình `registration_mode` (*Cần Admin phê duyệt*, *Mở tự do*, *Chỉ theo lời mời*), bật/tắt đăng nhập Email & Mật khẩu, bật/tắt Google OAuth Redirect, thông báo email cho Admin và giới hạn số lượng tài khoản tối đa.
  * **Tab 4 — Nhật ký Kiểm toán (`/admin?tab=audit`)**: Tra cứu toàn bộ lịch sử sự kiện hệ thống (`register`, `login_success`, `admin_approve_account`, `admin_lock_account`, `password_changed`, v.v.) kèm bộ lọc và địa chỉ IP ẩn danh.
- **Trang Hồ sơ Cá nhân & Bảo mật (`ProfilePage.tsx` - `/profile`) cho Cả Admin và Giáo viên ([`frontend/src/pages/ProfilePage.tsx`](file:///d:/app_gv/frontend/src/pages/ProfilePage.tsx))**:
  * Thẻ định danh tài khoản hiển thị Avatar/Chữ cái đầu, Họ tên, Email đã xác minh, Vai trò (*Quản trị viên Hệ thống* hoặc *Giáo viên*), Phương thức xác thực, Ngày tham gia và Lần đăng nhập gần nhất.
  * Biểu mẫu chỉnh sửa Họ tên, Số điện thoại, Trường/Đơn vị công tác, Ảnh đại diện URL (`PUT /api/profile/me`).
  * Khung **Đổi mật khẩu / Thiết lập mật khẩu** (`POST /api/profile/change-password`) có thanh đo độ mạnh mật khẩu và tự động thu hồi phiên trên các thiết bị khác.
  * Khung **Quản lý Phiên đăng nhập & Thiết bị**: Bật/tắt duy trì đăng nhập, nút **"Đăng xuất khỏi tất cả các thiết bị khác"** (`POST /api/profile/revoke-other-sessions`) và **"Đăng xuất khỏi thiết bị này"**.
  * Khu vực riêng theo vai trò:
    - Với **Admin**: Hiển thị cấu hình bảo mật `ADMIN_EMAIL` phía server và lối tắt tới 4 phân hệ quản trị.
    - Với **Giáo viên**: Thống kê nhanh số lớp/học sinh/ca dạy, nút **Tải bản sao lưu dữ liệu cá nhân (`.json`)** và chức năng **Tự xóa tài khoản cá nhân** có xác nhận mật khẩu.
- **API Backend cho Hồ sơ, Khôi phục Mật khẩu & Quản trị Hệ thống ([`backend/src/auth.ts`](file:///d:/app_gv/backend/src/auth.ts), [`backend/src/server.ts`](file:///d:/app_gv/backend/src/server.ts), [`frontend/src/lib/supabase.ts`](file:///d:/app_gv/frontend/src/lib/supabase.ts), [`frontend/src/pages/auth/ForgotPasswordPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/ForgotPasswordPage.tsx))**:
  * Bổ sung đầy đủ các endpoint `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/profile/me`, `/api/profile/change-password`, `/api/profile/revoke-other-sessions`, `/api/profile/delete-account` và toàn bộ nhóm `/api/admin/*`.

---

## [2026-11-05] - Cập nhật Phí Học thử Mặc định Bằng Phí Đi học & Cho phép Thay đổi, Sửa Giao diện Hộp thoại Học ghép (`SessionGuestModal`), Tự động Xóa & Xóa Tay Lịch Cần Dạy Bù

### 🔄 Đã sửa & Bổ sung (Changed & Added)
- **Phí học thử mặc định bằng phí đi học chính thức & Cho phép thay đổi linh hoạt ([`frontend/src/types/index.ts`](file:///d:/app_gv/frontend/src/types/index.ts), [`frontend/src/lib/debtEngine.ts`](file:///d:/app_gv/frontend/src/lib/debtEngine.ts), [`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts), [`frontend/src/components/students/StudentLifecycleModals.tsx`](file:///d:/app_gv/frontend/src/components/students/StudentLifecycleModals.tsx), [`frontend/src/pages/ClassDetailPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassDetailPage.tsx), [`frontend/src/pages/FeesPage.tsx`](file:///d:/app_gv/frontend/src/pages/FeesPage.tsx), [`frontend/src/components/fees/StudentFeeDetailDrawer.tsx`](file:///d:/app_gv/frontend/src/components/fees/StudentFeeDetailDrawer.tsx), [`backend/sql/init.sql`](file:///d:/app_gv/backend/sql/init.sql), [`backend/src/schema.ts`](file:///d:/app_gv/backend/src/schema.ts), [`backend/src/sync.ts`](file:///d:/app_gv/backend/src/sync.ts))**:
  * Bổ sung trường `trial_price` (`INTEGER NULL`) vào bảng `students` và giao diện hồ sơ học sinh.
  * Khi `trial_price` để trống (`null`), **mức phí học thử ban đầu mặc định bằng đúng phí đi học chính thức** (`student.custom_price ?? class.price`) và được cộng vào tổng phải thu khi học sinh có mặt (`present`).
  * Giáo viên có thể **thay đổi trạng thái học thử ↔ đang học ↔ đã nghỉ** và **thay đổi mức phí học thử** bất kỳ lúc nào (chọn nhanh *"Bằng phí đi học"*, *"Miễn phí (0đ)"*, hoặc nhập số tiền riêng) ngay trong `StudentForm`, `StudentStatusChangeModal`, bảng Điểm danh và bảng Học phí.
  * Đồng bộ tự động `studentStatusHistory` khi sửa trạng thái trực tiếp trong form sửa học sinh (`updateStudent`).
- **Sửa lỗi Giao diện Hộp thoại Xếp Học ghép / Học thêm Ngắn hạn (`SessionGuestModal` - [`frontend/src/index.css`](file:///d:/app_gv/frontend/src/index.css), [`frontend/src/components/students/StudentLifecycleModals.tsx`](file:///d:/app_gv/frontend/src/components/students/StudentLifecycleModals.tsx))**:
  * Định nghĩa đầy đủ lớp CSS `.input-field` đồng bộ với `.input` (`w-full min-w-0 max-w-full truncate`, viền, nền sáng/tối, khoảng cách chuẩn) khắc phục triệt để lỗi chữ ở cột *"Lớp nhận học ghép"* tràn đè lên cột *"Buổi học tại lớp nhận"*.
  * Tự động ưu tiên chọn học sinh từ các lớp khác (`s.class_id !== hostClassId`) và gom nhóm `<optgroup>` rõ ràng khi mở hộp thoại xếp học ghép vào một lớp nhận.
- **Tự động Xóa Lịch Cần Dạy Bù của Tháng Trước khi Sang Tháng Mới & Cho phép Xóa Tay ([`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts), [`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx))**:
  * Tự động dọn sạch (`needs_makeup: false`) toàn bộ các buổi nghỉ chờ dạy bù của các tháng trước (`original_date < tháng hiện tại`) nếu người dùng chưa xếp lịch bù khi bước sang tháng mới.
  * Bổ sung nút **Xóa lịch bù** (`Trash2`) trên từng mục và nút **"Xóa hết"** tại khung *"Buổi cần dạy bù"* (trên cả thanh bên máy tính và ngăn kéo điện thoại) kèm hộp thoại xác nhận `ConfirmDialog`.

---

## [2026-11-05] - Bước 1 Hệ thống Tài khoản: Supabase Auth, SMTP, Bảng `profiles`, `ADMIN_EMAIL` Server-side, Đăng nhập / Đăng ký / Xác minh Email / Đăng nhập Google Redirect & Giữ phiên iPhone PWA

### ➕ Đã thêm (Added)
- **Cơ sở dữ liệu & Trigger bảo vệ `ADMIN_EMAIL` phía Server ([`backend/sql/002_supabase_auth_profiles.sql`](file:///d:/app_gv/backend/sql/002_supabase_auth_profiles.sql), [`backend/src/schema.ts`](file:///d:/app_gv/backend/src/schema.ts))**:
  * Bổ sung bảng `profiles` (`id`, `full_name`, `email`, `phone`, `school`, `avatar_url`, `role = 'admin' | 'teacher'`, `status = 'pending' | 'active' | 'locked'`, `email_verified`, `auth_provider`, `created_at`, `approved_by`, `approved_at`, `last_login_at`, `locked_reason`), bảng `app_settings`, `invites`, `audit_log` và `auth_users_local`.
  * Trigger PostgreSQL `enforce_profile_admin_role()` và hàm kiểm tra `ADMIN_EMAIL` ở phía server: chỉ tài khoản có email **đã xác minh** trùng `ADMIN_EMAIL` mới nhận `role = 'admin'`, `status = 'active'`; mọi tài khoản khác luôn là `teacher`. Chặn tuyệt đối thao tác xóa, khóa, đổi email hoặc hạ quyền admin ngay ở tầng cơ sở dữ liệu.
- **Dịch vụ Email Xác thực Tiếng Việt qua Resend / SMTP riêng ([`backend/src/authMailer.ts`](file:///d:/app_gv/backend/src/authMailer.ts), [`backend/sql/supabase_email_templates.md`](file:///d:/app_gv/backend/sql/supabase_email_templates.md))**:
  * Hỗ trợ gửi thư qua Resend API / SMTP riêng (khóa gửi thư chỉ nằm ở phía server, không dùng email mặc định giới hạn thấp của Supabase).
  * Bộ mẫu thư tiếng Việt có logo và nút bấm lớn cho: Xác minh địa chỉ email, Đặt lại mật khẩu, Tài khoản được duyệt / từ chối, Tài khoản bị khóa / mở khóa, Cảnh báo đổi mật khẩu, Lời mời tham gia và Thông báo cho Admin khi có giáo viên mới chờ duyệt.
- **API Xác thực & Quản lý Phiên phía Server ([`backend/src/auth.ts`](file:///d:/app_gv/backend/src/auth.ts), [`backend/src/server.ts`](file:///d:/app_gv/backend/src/server.ts))**:
  * Cung cấp các endpoint `/api/auth/public-config`, `/api/auth/register`, `/api/auth/verify-email`, `/api/auth/resend-verification`, `/api/auth/login`, `/api/auth/sync-supabase`, `/api/auth/me`, `/api/auth/refresh`, `/api/auth/notify-admin`, `/api/auth/logout`, `/api/auth/google/url`, `/api/auth/google/callback`, `/api/auth/google/redirect-complete`.
  * Liên kết tự động tài khoản Google vào cùng một tài khoản mật khẩu hiện có nếu trùng email (sau khi xác minh), không tạo tài khoản trùng.
  * Kiểm tra lại trạng thái tài khoản (`pending` / `active` / `locked`) ở mỗi lần gọi API và giới hạn tần suất đăng nhập sai / gửi lại thư xác minh.
- **Giao diện Đăng nhập, Đăng ký, Xác minh Email, Chờ duyệt, Bị khóa & Giữ phiên iPhone PWA**:
  * [`frontend/src/lib/supabase.ts`](file:///d:/app_gv/frontend/src/lib/supabase.ts) & [`frontend/src/store/useAuthStore.ts`](file:///d:/app_gv/frontend/src/store/useAuthStore.ts): Tích hợp `@supabase/supabase-js` (PKCE redirect flow, chỉ dùng `anon` key ở trình duyệt) và lưu trữ bền vững kép (`localStorage` + `CacheStorage`) để giữ phiên khi đóng/mở lại từ Màn hình chính iPhone (`manifest.json`), tự làm mới token êm khi mở lại ứng dụng (`visibilitychange`).
  * [`frontend/src/components/auth/SessionExpiredBanner.tsx`](file:///d:/app_gv/frontend/src/components/auth/SessionExpiredBanner.tsx): Thanh cảnh báo vàng `"Phiên đã hết hạn, hãy đăng nhập lại"` khi hết phiên giữa chừng, giữ nguyên toàn bộ thay đổi chưa lưu (điểm danh, lịch dạy) và tự đẩy lên server ngay sau khi xác thực lại.
  * [`frontend/src/pages/auth/LoginPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/LoginPage.tsx), [`frontend/src/pages/auth/RegisterPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/RegisterPage.tsx), [`frontend/src/pages/auth/VerifyEmailPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/VerifyEmailPage.tsx), [`frontend/src/pages/auth/AuthCallbackPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/AuthCallbackPage.tsx), [`frontend/src/pages/auth/PendingApprovalPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/PendingApprovalPage.tsx), [`frontend/src/pages/auth/LockedAccountPage.tsx`](file:///d:/app_gv/frontend/src/pages/auth/LockedAccountPage.tsx), [`frontend/src/components/auth/PasswordStrengthMeter.tsx`](file:///d:/app_gv/frontend/src/components/auth/PasswordStrengthMeter.tsx), [`frontend/src/components/auth/TermsPrivacyModal.tsx`](file:///d:/app_gv/frontend/src/components/auth/TermsPrivacyModal.tsx), [`frontend/src/components/auth/TurnstileWidget.tsx`](file:///d:/app_gv/frontend/src/components/auth/TurnstileWidget.tsx), [`frontend/src/components/auth/AuthGuard.tsx`](file:///d:/app_gv/frontend/src/components/auth/AuthGuard.tsx).

### 🔄 Đã sửa (Changed)
- [`frontend/src/App.tsx`](file:///d:/app_gv/frontend/src/App.tsx), [`frontend/src/components/layout/AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx), [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx): Bọc các tuyến đường chính bằng `AuthGuard`, hiển thị thông tin tài khoản đang đăng nhập kèm huy hiệu vai trò (`Quản trị viên` / `Giáo viên`) và nút **Đăng xuất** có hộp thoại xác nhận ở cả thanh bên máy tính và trang Cài đặt trên điện thoại.

---

## [2026-11-04] - Nâng cấp Học sinh Học thử chuyển sang Đang học (Nhóm A), Thời khóa biểu Trường theo Tiết & Theo Từng Tuần (Nhóm B), Học ghép / Học thêm Lớp khác (Nhóm D) và Chuyển lớp giữa tháng & Chi tiết Học phí Từng Buổi (Nhóm E)

### ➕ Đã thêm (Added)
- **Nhóm A — Trạng thái Học sinh theo Thời gian & Chuyển Học thử sang Đang học ([`frontend/src/lib/debtEngine.ts`](file:///d:/app_gv/frontend/src/lib/debtEngine.ts), [`frontend/src/components/students/StudentLifecycleModals.tsx`](file:///d:/app_gv/frontend/src/components/students/StudentLifecycleModals.tsx))**:
  * Bổ sung bảng `student_status_history` (`id`, `student_id`, `enrollment_id`, `status = 'trial' | 'active' | 'left'`, `effective_from`, `note`, `created_at`). Trạng thái hiện tại của học sinh được xác định từ dòng có `effective_from <= hôm nay` mới nhất; `students.status` là bản sao đồng bộ để hiển thị nhanh.
  * **Quy tắc tính tiền theo ngày của từng buổi (A2)**: Mỗi buổi thực tế được đánh giá trạng thái của học sinh **tại đúng ngày của buổi đó** (`trial` = miễn phí `0đ`, vẫn lưu điểm danh và hiện trong bảng; `active` = tính tiền nếu `present`, `0đ` nếu `absent`/`excused`/hủy; `left` = ẩn khỏi các buổi sau ngày nghỉ).
  * Thêm cột **"Học thử"** (số buổi miễn phí) và dòng ghi chú trạng thái dưới tên học sinh trong bảng học phí (ví dụ: `"Học thử 04/11–06/11 (2 buổi miễn phí), chính thức từ 11/11"`).
  * **Hộp thoại `"Chuyển sang đang học"` (`StudentStatusChangeModal` - A3)**: Mở từ hồ sơ học sinh, dòng điểm danh hoặc bảng học phí; có trường `"Tính phí từ ngày"` (mặc định hôm nay, nút chọn nhanh `"Từ buổi kế tiếp"`, `"Chọn ngày khác"`), khung xem trước học phí tháng, cảnh báo vàng khi chọn ngày hiệu lực trong quá khứ làm các buổi học thử đổi sang tính phí, kiểm tra tháng đã chốt (`month_locks`), và hỗ trợ chuyển ngược (`active → trial`, `active → left`) có ghi `change_log`.
  * **Nhắc học thử (A4)**: Cài đặt `"Số buổi học thử mặc định"` (`default_trial_sessions = 2`) và thẻ nhắc nổi bật ở đầu màn Chi tiết lớp khi học sinh `trial` đã có mặt đủ số buổi: `"Em [Tên] đã học thử đủ 2 buổi, chuyển sang đang học?"`.
- **Nhóm B — Thời khóa biểu Trường theo Tiết, Lưu theo Từng Tuần & Ô "Trực" cả buổi chiều ([`frontend/src/lib/schoolPeriods.ts`](file:///d:/app_gv/frontend/src/lib/schoolPeriods.ts), [`frontend/src/components/schedule/SchoolImageModal.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SchoolImageModal.tsx), [`frontend/src/components/schedule/ScheduleExtraModals.tsx`](file:///d:/app_gv/frontend/src/components/schedule/ScheduleExtraModals.tsx))**:
  * **Khung giờ tiết chuẩn & Ra chơi dài 20 phút sau Tiết 2 (B1)**: Mỗi tiết 45 phút, nghỉ chuyển tiết 5 phút. Buổi sáng bắt đầu `07:00` (`S1 07:00–07:45`, `S2 07:50–08:35`, ra chơi dài 20 phút `08:35–08:55`, `S3 08:55–09:40`, `S4 09:45–10:30`, `S5 10:35–11:20`). Buổi chiều bắt đầu `13:30` mặc định 4 tiết (`C1–C4`) **không có ra chơi dài** (`C1 13:30–14:15`, `C2 14:20–15:05`, `C3 15:10–15:55`, `C4 16:00–16:45`); khi bật công tắc `"Chiều có ra chơi dài (20p sau C2)"` cho tuần đang xem (`school_week_configs`), `C3` tự lùi sang `15:25–16:10` và `C4` sang `16:15–17:00`.
  * **Ô `"Trực"` chiếm trọn buổi chiều (B2)**: Mọi ô `"Trực"` buổi chiều được gộp thành **một khối duy nhất `13:30–16:30`** (giờ kết thúc cấu hình qua `settings.duty_end_time`, mặc định `16:30`), tính là bận khi kiểm tra trùng lịch nhưng **không cộng vào `"Số tiết dạy"`**.
  * **Lưu Thời khóa biểu Trường theo Từng Tuần (`week_start` - B3)**: Bảng `school_schedule` lưu theo `week_start` (Thứ 2 `YYYY-MM-DD`) và không tự lặp vô hạn. Tuần chưa có TKB trường chỉ hiện lịch dạy thêm cùng thanh thông báo vàng `"Chưa có thời khóa biểu trường cho tuần này"` kèm 2 nút: **`"Nhập từ ảnh"`** và **`"Sao chép từ tuần trước"`**. Tuần đã có TKB trường có nút **`"Áp dụng thêm tuần"`** (`ApplySchoolWeeksModal`) liệt kê rõ các tuần đích và hỏi `"Ghi đè"` hay `"Bỏ qua"` nếu tuần đích đã có dữ liệu.
  * **Đọc ảnh Thời khóa biểu Trường nâng cao (B4)**: Trích xuất `{ teacher_name, week_start, declared_period_count, cells }`, tự đối chiếu tổng số tiết dạy (`cell_type === 'class'`) với `"Số tiết"` ghi trên tiêu đề ảnh (tô vàng nếu lệch), hỏi `"Tuần này chiều có ra chơi dài không?"`, lưu cho tuần `week_start` và hỏi tiếp `"Áp dụng thêm cho các tuần sau không?"`.
- **Nhóm D — Học sinh Học ghép & Học thêm Lớp khác Ngắn hạn / Dài hạn ([`frontend/src/components/students/StudentLifecycleModals.tsx`](file:///d:/app_gv/frontend/src/components/students/StudentLifecycleModals.tsx))**:
  * Bổ sung bảng `student_enrollments` (`primary` | `extra` dài hạn kèm chọn thứ học cố định `schedule_rule_ids` và đơn giá riêng `price_override`) và bảng `session_guests` (`swap` học bù/đổi buổi sang lớp khác hoặc `extra` học tăng cường 1–2 buổi kèm 4 chế độ tính phí: `free` 0đ, `home_price` giá lớp chính, `host_price` giá lớp ghép, `custom` số tiền tự nhập).
  * Tự động đánh dấu buổi gốc ở lớp chính là `"Đã sang [Lớp B] (dd/mm)"` (không tính vắng) khi học bù (`swap`), và tự khôi phục nếu học sinh vắng ở buổi ghép hoặc buổi ghép bị hủy.
- **Nhóm E — Chuyển lớp giữa tháng, Ngày bắt đầu học & Drawer Chi tiết Học phí Từng Học sinh ([`frontend/src/components/fees/StudentFeeDetailDrawer.tsx`](file:///d:/app_gv/frontend/src/components/fees/StudentFeeDetailDrawer.tsx))**:
  * Hỗ trợ khoảng hiệu lực ghi danh `[from_date, to_date]` kèm **ngoại lệ an toàn** (không bao giờ ẩn bản ghi điểm danh đã tồn tại ngoài khoảng ghi danh, gắn nhãn `"Ngoài thời gian đăng ký"`), cảnh báo liệt kê các buổi quá khứ chưa điểm danh khi chọn `start_date` lùi về trước, và hộp thoại **`"Chuyển lớp"`** (`ClassTransferModal`) tự chốt lớp cũ ở `transferDate - 1` và mở lớp mới từ `transferDate`.
  * Tạo **`StudentFeeDetailDrawer`**: Panel trượt từ phải (680px–720px trên máy tính, toàn màn hình trên điện thoại) hiển thị bộ chọn tháng, bộ lọc lớp, 6 thẻ chỉ số, lịch tháng thu nhỏ chấm màu theo trạng thái từng buổi, bảng chi tiết từng buổi (sửa điểm danh trực tiếp tại dòng, vạch ngăn cách chuyển lớp giữa tháng), và 3 nút hành động cuối trang: **`"Gửi phụ huynh"`** (kèm chi tiết từng ngày), **`"Xuất ảnh"`** (tải PNG phiếu báo học phí), **`"Xuất PDF"`** (in phiếu A4).

### 🔄 Đã sửa (Changed)
- [`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx), [`frontend/src/pages/ClassDetailPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassDetailPage.tsx), [`frontend/src/pages/FeesPage.tsx`](file:///d:/app_gv/frontend/src/pages/FeesPage.tsx), [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx): Tích hợp đầy đủ các luồng Nhóm A, B, D, E và nâng cấp xuất Excel học phí lên **5 sheet** (`Học phí YYYY-MM`, `Chi tiết từng buổi`, `Học ghép và học thêm`, `Công nợ`, `Các khoản thu`).
- [`backend/sql/init.sql`](file:///d:/app_gv/backend/sql/init.sql), [`backend/src/schema.ts`](file:///d:/app_gv/backend/src/schema.ts), [`backend/src/sync.ts`](file:///d:/app_gv/backend/src/sync.ts), [`backend/src/gcal.ts`](file:///d:/app_gv/backend/src/gcal.ts), [`backend/src/cron.ts`](file:///d:/app_gv/backend/src/cron.ts), [`backend/src/gemini.ts`](file:///d:/app_gv/backend/src/gemini.ts), [`backend/src/server.ts`](file:///d:/app_gv/backend/src/server.ts): Bổ sung 4 bảng mới (`student_enrollments`, `student_status_history`, `session_guests`, `school_week_configs`) kèm chính sách RLS, lọc lịch trường theo `week_start`, gộp tiết `"Trực"` buổi chiều `13:30–16:30`, và nâng cấp endpoint `/api/ai/parse-image`.

---

## [2026-11-04] - Quản lý Công nợ Học phí theo Giao dịch FIFO (Mục 2.9) & Đồng bộ Lịch sang Google Calendar Một chiều (Mục 2.10)

### ➕ Đã thêm (Added)
- **Bộ máy Tính Công nợ Học phí Tích lũy & Phân bổ FIFO ([`frontend/src/lib/debtEngine.ts`](file:///d:/app_gv/frontend/src/lib/debtEngine.ts))**:
  * Thay thế hoàn toàn cơ chế lưu cứng trạng thái `"đã đóng"` bằng bảng giao dịch thu [`payment_transactions`](file:///d:/app_gv/frontend/src/types/index.ts#L155-L165). Công nợ luôn được tính động từ `(tổng phải thu) − (tổng đã thu)` bằng số nguyên (VNĐ), tự động tính lại khi sửa điểm danh.
  * Phân bổ tiền thu vào khoản nợ cũ nhất trước (**FIFO**) và tính số dư tích lũy cuối mỗi tháng (`âm = đang nợ`, `dương = đóng dư`, tự động trừ vào các tháng kế tiếp). Mỗi tháng của học sinh có trạng thái: `"Đủ"`, `"Còn thiếu"`, `"Chưa đóng"`, `"Đóng dư"`.
  * Hỗ trợ **Chốt tháng (`month_locks`)**: Khi chốt một tháng cho một lớp, số phải thu của tháng đó được khóa lại trong `snapshot`; các thay đổi điểm danh hoặc giá về sau không làm đổi số đã chốt trừ khi mở chốt có xác nhận.
  * Soạn tin nhắn nhắc học phí Zalo dùng số liệu công nợ thực tế nhiều tháng với 2 mẫu: **Nhắc nhẹ** và **Nhắc lần 2**.
  * Tự động chuyển đổi (`migrateLegacyPaymentsToTransactions`) các bản ghi `payments` cũ sang `payment_transactions` để bảo toàn dữ liệu hiện có.
- **Giao diện Ghi nhận Khoản thu & Sổ Học phí Học sinh ([`frontend/src/components/fees/PaymentModals.tsx`](file:///d:/app_gv/frontend/src/components/fees/PaymentModals.tsx))**:
  * `RecordPaymentModal`: Ghi nhận khoản thu với số tiền mặc định bằng số đang nợ, nút gợi ý nhanh `"Đóng đủ số còn thiếu"`, chọn ngày thu, hình thức (`Tiền mặt` / `Chuyển khoản` / `Khác`), ghi chú. Hỗ trợ **một khoản thu gộp cho nhiều học sinh cùng phụ huynh (anh chị em)** chia tự động theo nợ của từng em và cho phép sửa tay, liên kết qua `group_id`.
  * `StudentFeeLedgerModal` (**"Sổ học phí"**): Bảng theo thứ tự thời gian gồm từng tháng (phải thu), từng khoản thu và số dư sau mỗi dòng, kèm tab phân bổ FIFO theo tháng và tab lịch sử sửa/xóa (`change_log`).
- **Dịch vụ Đồng bộ Lịch sang Google Calendar Một chiều ([`backend/src/gcal.ts`](file:///d:/app_gv/backend/src/gcal.ts))**:
  * Tự động tạo lịch phụ riêng tên `"Lịch dạy"` trên Google Calendar (ưu tiên phạm vi quyền tối thiểu `calendar.app.created`).
  * Mã kết nối OAuth (`refresh_token` / `access_token`) được mã hóa **AES-256-GCM** lưu trong bảng `gcal_tokens` phía server, không bao giờ gửi xuống trình duyệt.
  * Giải quyết lịch thực tế cho `N` tuần phía trước (mặc định 8 tuần): bỏ qua ngày nghỉ lễ và buổi đã hủy, cập nhật vị trí mới cho buổi dời, thêm buổi phát sinh/dạy bù, phân biệt tiêu đề (`[Trường]`, `[Trực]`, `[Dạy thêm]`, `[Phát sinh]`), màu sắc theo loại buổi, đính kèm câu `"Tạo từ app - sửa trong app, không sửa ở đây"`, và tự động thêm nhắc `"Đi sớm để kịp di chuyển"` khi hai buổi liên tiếp khác địa điểm cách nhau dưới 20 phút.
  * Đồng bộ **idempotent** qua bảng `calendar_event_map` (`session_key`, `google_event_id`, `content_hash`), thử lại theo cấp số nhân (`retryWithBackoff`) khi Google giới hạn tần suất, cô lập lỗi từng sự kiện, chạy ngầm sau khi người dùng sửa lịch (debounce 3.5 giây) và có tác vụ nền hằng ngày (`01:00` sáng) đẩy thêm các tuần mới.
  * Cung cấp thêm đường link đăng ký lịch chỉ đọc `.ics` (`GET /api/gcal/feed.ics`) kèm ghi chú cảnh báo chu kỳ cập nhật chậm của Google.
- **Cơ sở dữ liệu & Bảo mật Row Level Security (RLS) ([`backend/sql/init.sql`](file:///d:/app_gv/backend/sql/init.sql), [`backend/src/schema.ts`](file:///d:/app_gv/backend/src/schema.ts))**:
  * Bổ sung các bảng: `payment_transactions`, `month_locks`, `change_log`, `calendar_event_map`, `calendar_sync_log`, `gcal_tokens` và mở rộng bảng `settings`.
  * Bật **Row Level Security (RLS)** trên tất cả các bảng mới để mỗi tài khoản chỉ đọc/ghi được dữ liệu của chính mình.

### 🔄 Đã sửa (Changed)
- [`frontend/src/pages/FeesPage.tsx`](file:///d:/app_gv/frontend/src/pages/FeesPage.tsx): Bổ sung 2 chế độ chuyển nhanh **"Theo tháng"** (thêm cột `Đã thu`, `Còn thiếu/Dư`, trạng thái FIFO, nút `Thu tiền`, `Sổ học phí`, `Chốt tháng`) và **"Công nợ"** (3 thẻ tổng `Tổng đang nợ`, `Tổng đang dư`, `Số phụ huynh đang nợ`; danh sách học sinh đang nợ kể cả học sinh đã nghỉ mà còn nợ; sắp xếp theo nợ lâu nhất hoặc số tiền nợ; nút bấm nhanh Gọi phụ huynh, Soạn tin nhắc, Ghi nhận khoản thu). Xuất Excel (`.xlsx`) nâng cấp lên 3 sheet: `Học phí YYYY-MM`, `Công nợ` và `Các khoản thu`.
- [`frontend/src/pages/ClassDetailPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassDetailPage.tsx): Gắn huy hiệu công nợ/đóng dư và nút **"Sổ học phí"**, **"Ghi nhận khoản thu"** vào từng học sinh (cả đang học và đã nghỉ); hiện cảnh báo khi điểm danh vào tháng đã chốt học phí.
- [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx): Bổ sung bảng điều khiển kết nối Google Calendar một chiều (nút Kết nối, Đồng bộ ngay, Xóa toàn bộ sự kiện đã đồng bộ, Ngắt kết nối, chọn phạm vi đồng bộ, chọn nhiều mốc phút nhắc riêng cho lịch trường và dạy thêm, chọn số tuần đồng bộ, bật nhắc di chuyển, cảnh báo vàng `"Cần kết nối lại"` khi hết hạn quyền, và bảng lịch sử đồng bộ `calendar_sync_log`).
- [`frontend/src/store/useAppStore.ts`](file:///d:/app_gv/frontend/src/store/useAppStore.ts), [`frontend/src/lib/backendSync.ts`](file:///d:/app_gv/frontend/src/lib/backendSync.ts), [`backend/src/sync.ts`](file:///d:/app_gv/backend/src/sync.ts), [`backend/src/server.ts`](file:///d:/app_gv/backend/src/server.ts), [`backend/src/cron.ts`](file:///d:/app_gv/backend/src/cron.ts): Đồng bộ đầy đủ các bảng mới và cung cấp các endpoint `/api/gcal/*`.

---

## [2026-11-04] - Tái thiết kế Giao diện Đa nền tảng (Máy tính / Máy tính bảng / Điện thoại) & Thời khóa biểu Trường theo Tiết kiểu Google Calendar

### ➕ Đã thêm (Added)
- **Hệ thống Thiết kế (Design Tokens & Khung bố cục 3 kích thước màn hình)**:
  * Tạo [`frontend/src/components/layout/AppShell.tsx`](file:///d:/app_gv/frontend/src/components/layout/AppShell.tsx): Tách riêng bố cục theo 3 mốc màn hình: `<768px` (Điện thoại với thanh điều hướng dưới có hiệu ứng mờ và safe-area), `768px–1199px` (Máy tính bảng với thanh bên thu gọn icon `68px`), và `>=1200px` (Máy tính với thanh điều hướng trái cố định `240px`, màn Lịch dùng toàn bộ chiều rộng cùng cột điều khiển trái `256px`).
- **Mô hình Thời khóa biểu Trường theo Tiết (`school_periods`) & Ô "Trực"**:
  * Tạo [`frontend/src/lib/schoolPeriods.ts`](file:///d:/app_gv/frontend/src/lib/schoolPeriods.ts): Định nghĩa bảng giờ tiết chuẩn (`S1–S5`, `C1–C5`), các bộ giờ theo mùa (`Giờ chuẩn`, `Giờ Mùa Hè`, `Giờ Mùa Đông`), hàm tự động quy đổi từ mã tiết sang giờ thật (`resolveSchoolScheduleTime`), hàm gộp các tiết liền kề cùng lớp (`S1–S2 · 10A1`), hàm phân loại nhóm buổi **Sáng / Chiều / Tối** (`classifySessionTimeGroup`), và hàm chuyển đổi an toàn dữ liệu cũ kèm tự động sao lưu vào `localStorage['gv-app-backup-before-v2-migration']` (`migrateLegacySchoolSchedule`).
  * Bổ sung bảng `school_periods` vào cơ sở dữ liệu PostgreSQL ([`backend/sql/init.sql`](file:///d:/app_gv/backend/sql/init.sql), [`backend/src/schema.ts`](file:///d:/app_gv/backend/src/schema.ts), [`backend/src/sync.ts`](file:///d:/app_gv/backend/src/sync.ts)) và mở rộng bảng `school_schedule` (`period_code`, `session`, `cell_type`, `note`) cùng `settings` (`afternoon_start`, `evening_start`, `show_duty_in_email`, `show_duty_in_gcal`, `morning_periods_count`, `afternoon_periods_count`).
- **Tổ hợp Component Lịch kiểu Google Calendar (`frontend/src/components/schedule/`)**:
  * Tạo [`frontend/src/components/schedule/MiniCalendar.tsx`](file:///d:/app_gv/frontend/src/components/schedule/MiniCalendar.tsx): Lịch tháng thu nhỏ ở cột trái để nhảy nhanh tới ngày bất kỳ.
  * Tạo [`frontend/src/components/schedule/TimeGridCalendar.tsx`](file:///d:/app_gv/frontend/src/components/schedule/TimeGridCalendar.tsx): Lưới trục giờ liên tục (`06:00–22:00`, tự mở rộng và tự cuộn tới giờ hiện tại), vạch đỏ có chấm tròn chỉ giờ hiện tại cập nhật mỗi phút, dải nền phân biệt **🌅 Sáng / ☀️ Chiều / 🌙 Tối**, xếp cạnh nhau các sự kiện trùng giờ kèm viền đỏ cảnh báo, kéo chọn khoảng trống để tạo buổi phát sinh, kéo thả khối dạy thêm sang ô khác để dời ("Chỉ tuần này"), kéo cạnh dưới để đổi giờ kết thúc, và khóa kéo trực tiếp đối với tiết trường.
  * Tạo [`frontend/src/components/schedule/MonthCalendarView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/MonthCalendarView.tsx): Chế độ xem Tháng với các thẻ sự kiện thu gọn và nút `+N buổi khác`.
  * Tạo [`frontend/src/components/schedule/AgendaCalendarView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/AgendaCalendarView.tsx): Chế độ Lịch biểu gom theo 3 nhóm **🌅 Buổi sáng**, **☀️ Buổi chiều**, **🌙 Buổi tối**, gắn nhãn `"↪ Kéo dài sang Chiều/Tối"` khi buổi học vắt qua ranh giới và nhãn nhắc thời gian di chuyển `"Di chuyển ~20 phút"`.
  * Tạo [`frontend/src/components/schedule/SchoolPeriodGridView.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SchoolPeriodGridView.tsx): Chế độ xem **"Bảng tiết của trường"** (dạng bảng giấy cột `T2–T7`, hàng `S1–S5`, `C1–C5`, cho phép sửa nhanh từng ô thành Lớp dạy / Trực / Khác / Trống) kèm dải lịch dạy thêm bên dưới.
  * Tạo [`frontend/src/components/schedule/ScheduleExtraModals.tsx`](file:///d:/app_gv/frontend/src/components/schedule/ScheduleExtraModals.tsx): Hộp "Thêm nhanh" (Quick Add), Popover & Panel trượt xem chi tiết buổi học, hộp thoại Xuất ảnh PNG Thời khóa biểu tuần / Xuất file `.ics` Google Calendar, và bảng tra cứu phím tắt (`?`).

### 🔄 Đã sửa (Changed)
- [`frontend/index.html`](file:///d:/app_gv/frontend/index.html), [`frontend/tailwind.config.js`](file:///d:/app_gv/frontend/tailwind.config.js), [`frontend/src/index.css`](file:///d:/app_gv/frontend/src/index.css): Tích hợp bộ font tiếng Việt `Be Vietnam Pro` & `Inter`, thang khoảng cách 4px/8px, cỡ chữ tối thiểu `15px` trên điện thoại (`16px` cho ô nhập tránh iOS tự phóng to) và `14px` trên máy tính, tôn trọng `prefers-reduced-motion`.
- [`frontend/src/App.tsx`](file:///d:/app_gv/frontend/src/App.tsx), [`frontend/src/components/ui/TopBar.tsx`](file:///d:/app_gv/frontend/src/components/ui/TopBar.tsx), [`frontend/src/components/ui/BottomNav.tsx`](file:///d:/app_gv/frontend/src/components/ui/BottomNav.tsx), [`frontend/src/components/ui/Modal.tsx`](file:///d:/app_gv/frontend/src/components/ui/Modal.tsx): Loại bỏ khung giới hạn `max-w-lg` cũ gây co hẹp trên máy tính; bổ sung ô tìm kiếm toàn cục trên thanh tiêu đề; hộp thoại tự động hiển thị dạng cửa sổ giữa màn hình / panel trượt phải trên máy tính và dạng Bottom Sheet vuốt xuống trên điện thoại.
- [`frontend/src/pages/SchedulePage.tsx`](file:///d:/app_gv/frontend/src/pages/SchedulePage.tsx): Hỗ trợ đầy đủ các chế độ xem (`Ngày`, `Tuần`, `Tháng`, `4 ngày`, `3 ngày`, `Lịch biểu`, `Bảng tiết của trường`), bộ lọc nhanh `Tất cả | Sáng | Chiều | Tối`, bộ lọc lớp lịch bên trái (`Lịch trường`, `Dạy thêm`, `Phát sinh`, `Trực`, `Ngày nghỉ`), vuốt ngang chuyển ngày trên điện thoại và hệ thống phím tắt (`D`, `W`, `M`, `A`, `X`, `P`, `T`, `J/K`, `←/→`, `C`, `/`, `Esc`, `?`).
- [`frontend/src/pages/ClassesPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassesPage.tsx) & [`frontend/src/pages/ClassDetailPage.tsx`](file:///d:/app_gv/frontend/src/pages/ClassDetailPage.tsx):
  * Màn Lớp trên máy tính hiển thị lưới thẻ 3–4 cột.
  * Chi tiết lớp trên máy tính chia 2 cột: Cột trái (8/12) là bảng điểm danh gọn từng dòng với 3 nút trạng thái ngang kèm phím tắt `P` (Có mặt) / `V` (Vắng) / `K` (Có phép) và `↑/↓`; Cột phải (4/12) là thống kê nhanh chuyên cần tháng, ghi chú buổi học và lịch cố định.
  * Màn Điểm danh trên điện thoại hiển thị bộ đếm `"Đã điểm danh X/Y"` ở đầu màn, 3 nút lớn dạng viên thuốc (`Có mặt` xanh lá / `Vắng` đỏ / `Có phép` vàng) và nút `"Tất cả có mặt"` cố định ở đáy.
- [`frontend/src/pages/FeesPage.tsx`](file:///d:/app_gv/frontend/src/pages/FeesPage.tsx): Bổ sung 4 thẻ số liệu lớn (`Tổng phải thu`, `Đã thu`, `Còn lại`, `Số phụ huynh đang nợ`), bảng dữ liệu máy tính đầy đủ (cột tên cố định `sticky`, sắp xếp theo từng cột, lọc trực tiếp trên tiêu đề, hàng tổng ở cuối), và đặt biểu đồ cột thu nhập 6 tháng cạnh biểu đồ so sánh giữa các lớp. Giữ nguyên 100% công thức tính học phí.
- [`frontend/src/pages/SettingsPage.tsx`](file:///d:/app_gv/frontend/src/pages/SettingsPage.tsx): Chia 2 cột trên máy tính (Nhóm cài đặt bên trái, nội dung bên phải); thêm trình quản lý giờ tiết trường (`S1–S5`, `C1–C5`), đổi số tiết mỗi buổi (4/5/6), áp dụng giờ mùa hè/mùa đông, tùy chọn hiển thị tiết `"Trực"` trong email và Google Calendar, chỉnh mốc giờ chia buổi Chiều/Tối (`12:00` / `17:00`).
- [`frontend/src/components/schedule/SchoolImageModal.tsx`](file:///d:/app_gv/frontend/src/components/schedule/SchoolImageModal.tsx) & [`frontend/src/components/schedule/ZaloMessageModal.tsx`](file:///d:/app_gv/frontend/src/components/schedule/ZaloMessageModal.tsx): Giao diện chia đôi màn hình (trái là ảnh/tin nhắn gốc, phải là bảng tiết hoặc danh sách kết quả sửa được, tô vàng ô cần kiểm tra và tô đỏ cảnh báo trùng lịch).
- [`backend/src/mailer.ts`](file:///d:/app_gv/backend/src/mailer.ts) & [`backend/src/cron.ts`](file:///d:/app_gv/backend/src/cron.ts): Email thông báo hằng ngày tự động chia theo 3 mục **🌅 Buổi sáng**, **☀️ Buổi chiều**, **🌙 Buổi tối** và hiển thị mã tiết trường kèm giờ quy đổi (`S1–S2 · 07:00–08:35 · 10A1`).

---

## [2026-11-03] - Khởi chạy thử nghiệm Local và nâng cấp độ bền Backend

### 🔄 Đã sửa (Changed)
- `backend/src/server.ts`: Chuyển khởi tạo kết nối cơ sở dữ liệu sang dạng bất đồng bộ có xử lý ngoại lệ (non-blocking). Máy chủ API Express khởi động tức thì tại cổng 4000, không bị ngắt tiến trình nếu cơ sở dữ liệu chưa sẵn sàng hoặc đang chờ cấu hình `.env`.
- Khởi chạy thành công cả hai dịch vụ trên máy cục bộ:
  * **Frontend (Vite)**: Đang chạy tại `http://localhost:5173/`.
  * **Backend (Node.js API)**: Đang chạy tại `http://localhost:4000/`.

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

