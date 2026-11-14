# CẤU HÌNH SUPABASE AUTH, SMTP (RESEND) & MẪU THƯ TIẾNG VIỆT (MỤC 3.4)

Tài liệu này chứa cấu hình chuẩn cho **Supabase Auth (Gói miễn phí)** kết hợp với dịch vụ gửi thư **Resend** (3.000 thư/tháng miễn phí) và các mẫu thư HTML tiếng Việt có logo + nút bấm lớn để dán vào **Supabase Dashboard > Authentication > Email Templates**.

---

## 1. Cấu hình SMTP riêng trên Supabase (Không dùng email mặc định của Supabase)
Vào **Supabase Dashboard $\rightarrow$ Project Settings $\rightarrow$ Authentication $\rightarrow$ SMTP Settings**:
- **Enable Custom SMTP**: `ON`
- **Sender email**: `noreply@ten-mien-cua-ban.vn` (hoặc địa chỉ đã xác minh trên Resend)
- **Sender name**: `Lịch Dạy Giáo Viên`
- **Host**: `smtp.resend.com`
- **Port number**: `465` (SSL) hoặc `587` (TLS)
- **Username**: `resend`
- **Password**: `re_xxxxxxxxxxxxxxxxxxxxxxxx` (API Key của Resend — chỉ đặt ở phía server/Supabase, không đặt ở trình duyệt)
- **Minimum interval between emails**: `60` seconds

---

## 2. Cấu hình Redirect URL cho iPhone PWA & Cloudflare Pages
Vào **Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ URL Configuration**:
- **Site URL**: `https://lichday.pages.dev` (hoặc `http://localhost:5173` khi chạy local)
- **Redirect URLs**:
  - `http://localhost:5173/auth/callback`
  - `http://localhost:5173/auth/verify-email`
  - `http://localhost:5173/auth/reset-password`
  - `https://*.pages.dev/auth/callback`
  - `https://*.pages.dev/auth/verify-email`
  - `https://*.pages.dev/auth/reset-password`

---

## 3. Mẫu thư 1: Xác minh địa chỉ Email (Confirm signup)
- **Subject**: `[Lịch Dạy Giáo Viên] Xác minh địa chỉ email đăng ký tài khoản`
- **Body (HTML)**:
```html
<div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border-radius: 18px; border: 1px solid #E2E8F0; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #1A73E8 0%, #1557B0 100%); padding: 24px; text-align: center; color: #FFFFFF;">
    <div style="font-size: 24px; margin-bottom: 8px;">🎓</div>
    <div style="font-size: 18px; font-weight: 700;">LỊCH DẠY GIÁO VIÊN</div>
    <div style="font-size: 12px; opacity: 0.9;">Hệ thống Quản lý Lịch dạy, Điểm danh &amp; Học phí</div>
  </div>
  <div style="padding: 28px 24px; color: #334155; font-size: 14px; line-height: 1.6;">
    <h2 style="margin: 0 0 12px 0; color: #0F172A; font-size: 20px;">Xác minh địa chỉ email của thầy/cô</h2>
    <p>Cảm ơn thầy/cô đã đăng ký tài khoản trên ứng dụng <strong>Lịch Dạy Giáo Viên</strong>.</p>
    <p>Vui lòng bấm vào nút bên dưới để xác minh địa chỉ email ({{ .Email }}) và hoàn tất kích hoạt tài khoản:</p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; min-width: 220px; padding: 14px 28px; background-color: #1A73E8; color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 700; border-radius: 12px;">
        Xác minh địa chỉ Email
      </a>
    </div>
    <p style="font-size: 12px; color: #64748B;">Nếu thầy/cô không thực hiện đăng ký này, vui lòng bỏ qua thư này.</p>
  </div>
</div>
```

---

## 4. Mẫu thư 2: Đặt lại mật khẩu (Reset Password)
- **Subject**: `[Lịch Dạy Giáo Viên] Yêu cầu đặt lại mật khẩu`
- **Body (HTML)**:
```html
<div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border-radius: 18px; border: 1px solid #E2E8F0; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #1A73E8 0%, #1557B0 100%); padding: 24px; text-align: center; color: #FFFFFF;">
    <div style="font-size: 24px; margin-bottom: 8px;">🎓</div>
    <div style="font-size: 18px; font-weight: 700;">LỊCH DẠY GIÁO VIÊN</div>
  </div>
  <div style="padding: 28px 24px; color: #334155; font-size: 14px; line-height: 1.6;">
    <h2 style="margin: 0 0 12px 0; color: #0F172A; font-size: 20px;">Yêu cầu đặt lại mật khẩu</h2>
    <p>Hệ thống vừa nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>{{ .Email }}</strong>.</p>
    <p>Bấm vào nút bên dưới để tạo mật khẩu mới (liên kết có hiệu lực trong vòng <strong>1 giờ</strong> và chỉ dùng 1 lần):</p>
    <div style="margin: 28px 0; text-align: center;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; min-width: 220px; padding: 14px 28px; background-color: #EA580C; color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 700; border-radius: 12px;">
        Đặt lại mật khẩu mới
      </a>
    </div>
    <p style="font-size: 12px; color: #64748B;">Nếu thầy/cô không yêu cầu đặt lại mật khẩu, tài khoản của thầy/cô vẫn an toàn và có thể bỏ qua thư này.</p>
  </div>
</div>
```

