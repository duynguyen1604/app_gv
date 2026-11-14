import nodemailer from 'nodemailer'

function createSmtpTransporter() {
  const resendApiKey = process.env.RESEND_API_KEY
  if (resendApiKey && !process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: resendApiKey,
      },
    })
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  })
}

function wrapVietnameseEmailTemplate(params: {
  badgeText: string
  badgeColor?: string
  heading: string
  greetingName?: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  ctaColor?: string
  footerNote?: string
}): string {
  const {
    badgeText,
    badgeColor = '#1A73E8',
    heading,
    greetingName,
    bodyHtml,
    ctaLabel,
    ctaUrl,
    ctaColor = '#1A73E8',
    footerNote = 'Nếu thầy/cô không thực hiện yêu cầu này, vui lòng bỏ qua thư này hoặc liên hệ Quản trị viên.',
  } = params

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin: 0; padding: 24px 12px; background-color: #F1F5F9; font-family: 'Be Vietnam Pro', 'Segoe UI', Roboto, Arial, sans-serif; color: #0F172A;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #FFFFFF; border-radius: 18px; border: 1px solid #E2E8F0; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.06);">
    <!-- Brand Header with Logo -->
    <div style="background: linear-gradient(135deg, #1A73E8 0%, #1557B0 100%); padding: 24px; text-align: center; color: #FFFFFF;">
      <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; border-radius: 14px; background-color: rgba(255,255,255,0.18); font-size: 24px; margin-bottom: 10px;">
        🎓
      </div>
      <div style="font-size: 18px; font-weight: 700; letter-spacing: 0.01em;">LỊCH DẠY GIÁO VIÊN</div>
      <div style="font-size: 12px; opacity: 0.88; margin-top: 2px;">Hệ thống Quản lý Lịch dạy, Điểm danh &amp; Học phí</div>
    </div>

    <!-- Content Body -->
    <div style="padding: 28px 24px;">
      <div style="margin-bottom: 14px;">
        <span style="display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; background-color: ${badgeColor}15; color: ${badgeColor};">
          ${badgeText}
        </span>
      </div>

      <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0F172A; line-height: 1.35;">
        ${heading}
      </h1>

      <p style="margin: 0 0 14px 0; font-size: 15px; color: #334155; line-height: 1.6;">
        Xin chào <strong>${greetingName || 'Thầy/Cô'}</strong>,
      </p>

      <div style="font-size: 14px; color: #475569; line-height: 1.65;">
        ${bodyHtml}
      </div>

      ${
        ctaLabel && ctaUrl
          ? `
      <div style="margin: 28px 0 24px 0; text-align: center;">
        <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer"
           style="display: inline-block; min-width: 220px; padding: 14px 28px; background-color: ${ctaColor}; color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 700; border-radius: 12px; box-shadow: 0 4px 12px ${ctaColor}40;">
          ${ctaLabel}
        </a>
      </div>
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748B; text-align: center;">
        Nếu nút bấm không hoạt động, thầy/cô có thể sao chép đường dẫn sau vào trình duyệt:<br/>
        <a href="${ctaUrl}" style="color: #1A73E8; word-break: break-all;">${ctaUrl}</a>
      </p>
      `
          : ''
      }

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #F1F5F9; font-size: 12px; color: #64748B; line-height: 1.5;">
        ${footerNote}
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #F8FAFC; padding: 16px 24px; text-align: center; font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0;">
      © ${new Date().getFullYear()} Lịch Dạy Giáo Viên · Múi giờ Asia/Ho_Chi_Minh · Bảo mật dữ liệu riêng tư theo từng tài khoản
    </div>
  </div>
</body>
</html>
  `.trim()
}

export async function sendAuthEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<{ success: boolean; simulated?: boolean; messageId?: string }> {
  const resendApiKey = process.env.RESEND_API_KEY
  const fromAddress =
    process.env.SMTP_FROM || '"Lịch Dạy Giáo Viên" <onboarding@resend.dev>'

  // 1. Prefer Resend HTTP API if RESEND_API_KEY is configured
  if (resendApiKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.to],
          subject: params.subject,
          html: params.html,
        }),
      })
      if (resp.ok) {
        const data = (await resp.json()) as { id?: string }
        return { success: true, messageId: data.id }
      }
    } catch (err) {
      console.warn('[AUTH_MAILER] Resend HTTP API fallback to SMTP:', err)
    }
  }

  // 2. Use SMTP if configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = createSmtpTransporter()
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || `"Lịch Dạy Giáo Viên" <${process.env.SMTP_USER}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      })
      return { success: true, messageId: info.messageId }
    } catch (err) {
      console.error('[AUTH_MAILER] SMTP error:', err)
    }
  }

  // 3. Simulated log for local development when SMTP/Resend isn't set yet
  console.log(`[AUTH_MAILER] (Simulated Email) To: ${params.to} | Subject: ${params.subject}`)
  return { success: true, simulated: true }
}

export function buildVerifyEmailHtml(params: {
  fullName: string
  verifyUrl: string
}): string {
  return wrapVietnameseEmailTemplate({
    badgeText: 'Xác minh tài khoản',
    badgeColor: '#1A73E8',
    heading: 'Xác minh địa chỉ email của thầy/cô',
    greetingName: params.fullName,
    bodyHtml: `
      <p>Cảm ơn thầy/cô đã đăng ký tài khoản trên ứng dụng <strong>Lịch Dạy Giáo Viên</strong>.</p>
      <p>Vui lòng bấm vào nút bên dưới để xác minh địa chỉ email và hoàn tất kích hoạt tài khoản. Liên kết này có hiệu lực trong vòng <strong>24 giờ</strong>.</p>
    `,
    ctaLabel: 'Xác minh địa chỉ Email',
    ctaUrl: params.verifyUrl,
    ctaColor: '#1A73E8',
  })
}

export function buildResetPasswordEmailHtml(params: {
  fullName: string
  resetUrl: string
}): string {
  return wrapVietnameseEmailTemplate({
    badgeText: 'Khôi phục mật khẩu',
    badgeColor: '#EA580C',
    heading: 'Yêu cầu đặt lại mật khẩu',
    greetingName: params.fullName,
    bodyHtml: `
      <p>Hệ thống vừa nhận được yêu cầu đặt lại mật khẩu cho tài khoản của thầy/cô.</p>
      <p>Bấm vào nút bên dưới để tạo mật khẩu mới. Liên kết này chỉ dùng được <strong>một lần</strong> và có hiệu lực trong vòng <strong>1 giờ</strong>.</p>
    `,
    ctaLabel: 'Đặt lại mật khẩu mới',
    ctaUrl: params.resetUrl,
    ctaColor: '#EA580C',
  })
}

export function buildAccountApprovedEmailHtml(params: {
  fullName: string
  loginUrl: string
}): string {
  return wrapVietnameseEmailTemplate({
    badgeText: 'Đã duyệt tài khoản',
    badgeColor: '#16A34A',
    heading: 'Tài khoản của thầy/cô đã được duyệt!',
    greetingName: params.fullName,
    bodyHtml: `
      <p>Quản trị viên đã phê duyệt tài khoản của thầy/cô trên hệ thống <strong>Lịch Dạy Giáo Viên</strong>.</p>
      <p>Ngay bây giờ thầy/cô có thể đăng nhập trên máy tính hoặc điện thoại để quản lý thời khóa biểu, lớp học, điểm danh và học phí.</p>
    `,
    ctaLabel: 'Đăng nhập vào ứng dụng',
    ctaUrl: params.loginUrl,
    ctaColor: '#16A34A',
  })
}

export function buildAccountRejectedEmailHtml(params: {
  fullName: string
  reason?: string
}): string {
  return wrapVietnameseEmailTemplate({
    badgeText: 'Thông báo xét duyệt',
    badgeColor: '#DC2626',
    heading: 'Yêu cầu đăng ký tài khoản chưa được chấp thuận',
    greetingName: params.fullName,
    bodyHtml: `
      <p>Rất tiếc, yêu cầu đăng ký tài khoản của thầy/cô hiện chưa được Quản trị viên phê duyệt.</p>
      ${
        params.reason
          ? `<div style="padding: 12px 14px; background-color: #FEF2F2; border-left: 4px solid #DC2626; border-radius: 8px; margin: 12px 0; color: #991B1B;"><strong>Lý do:</strong> ${params.reason}</div>`
          : ''
      }
      <p>Nếu có nhầm lẫn, thầy/cô vui lòng liên hệ trực tiếp với Quản trị viên để được hỗ trợ.</p>
    `,
  })
}

export function buildAccountLockedUnlockedEmailHtml(params: {
  fullName: string
  locked: boolean
  reason?: string
  loginUrl?: string
}): string {
  if (params.locked) {
    return wrapVietnameseEmailTemplate({
      badgeText: 'Tài khoản tạm khóa',
      badgeColor: '#DC2626',
      heading: 'Tài khoản của thầy/cô đã bị tạm khóa',
      greetingName: params.fullName,
      bodyHtml: `
        <p>Tài khoản của thầy/cô trên hệ thống <strong>Lịch Dạy Giáo Viên</strong> đã bị khóa bởi Quản trị viên. Các lịch gửi email hằng ngày và đồng bộ Google Calendar đã được tạm dừng.</p>
        ${
          params.reason
            ? `<div style="padding: 12px 14px; background-color: #FEF2F2; border-left: 4px solid #DC2626; border-radius: 8px; margin: 12px 0; color: #991B1B;"><strong>Lý do:</strong> ${params.reason}</div>`
            : ''
        }
        <p>Vui lòng liên hệ Quản trị viên để được giải đáp và mở khóa lại tài khoản.</p>
      `,
    })
  }

  return wrapVietnameseEmailTemplate({
    badgeText: 'Đã mở khóa',
    badgeColor: '#16A34A',
    heading: 'Tài khoản của thầy/cô đã được mở khóa',
    greetingName: params.fullName,
    bodyHtml: `
      <p>Tài khoản của thầy/cô đã được Quản trị viên kích hoạt trở lại. Mọi dữ liệu lớp học, điểm danh và học phí của thầy/cô vẫn được giữ nguyên vẹn.</p>
    `,
    ctaLabel: 'Đăng nhập lại ngay',
    ctaUrl: params.loginUrl || 'http://localhost:5173/auth/login',
    ctaColor: '#16A34A',
  })
}

export function buildPasswordChangedAlertEmailHtml(params: {
  fullName: string
  changedAtStr: string
}): string {
  return wrapVietnameseEmailTemplate({
    badgeText: 'Cảnh báo bảo mật',
    badgeColor: '#D97706',
    heading: 'Mật khẩu tài khoản vừa được thay đổi',
    greetingName: params.fullName,
    bodyHtml: `
      <p>Mật khẩu đăng nhập tài khoản của thầy/cô vừa được thay đổi thành công vào lúc <strong>${params.changedAtStr}</strong> (múi giờ Việt Nam).</p>
      <p>Nếu chính thầy/cô vừa thực hiện thao tác này thì không cần làm gì thêm. Nếu không phải thầy/cô, hãy sử dụng tính năng <strong>Quên mật khẩu</strong> hoặc báo ngay cho Quản trị viên.</p>
    `,
  })
}

export function buildInviteTeacherEmailHtml(params: {
  inviteUrl: string
  inviteCode: string
  expiresAtStr?: string
}): string {
  return wrapVietnameseEmailTemplate({
    badgeText: 'Lời mời tham gia',
    badgeColor: '#7C3AED',
    heading: 'Lời mời sử dụng ứng dụng Lịch Dạy Giáo Viên',
    greetingName: 'Thầy/Cô',
    bodyHtml: `
      <p>Quản trị viên đã gửi cho thầy/cô lời mời tạo tài khoản giáo viên trên ứng dụng <strong>Lịch Dạy Giáo Viên</strong>.</p>
      <div style="padding: 12px 16px; background-color: #F5F3FF; border: 1px dashed #8B5CF6; border-radius: 10px; text-align: center; margin: 14px 0;">
        <div style="font-size: 12px; color: #6D28D9;">Mã mời của thầy/cô</div>
        <div style="font-size: 20px; font-weight: 800; color: #4C1D95; letter-spacing: 0.08em; margin-top: 4px;">${params.inviteCode}</div>
        ${params.expiresAtStr ? `<div style="font-size: 11px; color: #64748B; margin-top: 4px;">Hạn sử dụng: ${params.expiresAtStr}</div>` : ''}
      </div>
    `,
    ctaLabel: 'Chấp nhận lời mời & Đăng ký',
    ctaUrl: params.inviteUrl,
    ctaColor: '#7C3AED',
  })
}

export function buildAdminNewPendingTeacherEmailHtml(params: {
  teacherName: string
  teacherEmail: string
  teacherSchool?: string | null
  teacherPhone?: string | null
  adminUrl: string
}): string {
  return wrapVietnameseEmailTemplate({
    badgeText: 'Cần phê duyệt',
    badgeColor: '#1A73E8',
    heading: `Giáo viên mới đang chờ duyệt: ${params.teacherName}`,
    greetingName: 'Quản trị viên',
    bodyHtml: `
      <p>Có một tài khoản giáo viên đã xác minh email và đang chờ phê duyệt để sử dụng hệ thống:</p>
      <ul style="padding-left: 18px; margin: 12px 0;">
        <li><strong>Họ và tên:</strong> ${params.teacherName}</li>
        <li><strong>Email:</strong> ${params.teacherEmail}</li>
        <li><strong>Trường / Đơn vị:</strong> ${params.teacherSchool || 'Chưa cập nhật'}</li>
        <li><strong>Số điện thoại:</strong> ${params.teacherPhone || 'Chưa cập nhật'}</li>
      </ul>
    `,
    ctaLabel: 'Mở Trang Quản Trị để Duyệt',
    ctaUrl: params.adminUrl,
    ctaColor: '#1A73E8',
  })
}

