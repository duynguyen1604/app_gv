import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
})

export interface SessionEmailItem {
  type: string
  title: string
  time: string
  location?: string
}

export function buildScheduleEmailHtml({
  dateStr,
  sessions,
}: {
  dateStr: string
  sessions: SessionEmailItem[]
}): string {
  const sessionRows = sessions.length === 0
    ? '<p style="color: #64748b; font-style: italic;">Hôm nay thầy/cô không có lịch dạy nào.</p>'
    : sessions.map(s => `
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 12px; margin-bottom: 8px; border-radius: 6px;">
          <div style="font-weight: 700; color: #1e293b; font-size: 14px;">[${s.type}] ${s.title}</div>
          <div style="color: #475569; font-size: 13px; margin-top: 4px;">
            ⏰ Giờ: <strong>${s.time}</strong> ${s.location ? `· 📍 ${s.location}` : ''}
          </div>
        </div>
      `).join('')

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="background-color: #3b82f6; color: #ffffff; padding: 16px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 18px;">LỊCH DẠY HÔM NAY</h2>
        <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">${dateStr}</p>
      </div>

      <p style="color: #334155; font-size: 14px;">Kính gửi Thầy/Cô,</p>
      <p style="color: #475569; font-size: 13px;">Dưới đây là thời gian biểu thực tế của ngày hôm nay (đã tự động cập nhật các buổi dời, hủy và phát sinh mới nhất):</p>

      <div style="margin: 16px 0;">
        ${sessionRows}
      </div>

      <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #94a3b8; text-align: center;">
        Email được gửi tự động 24/7 từ Hệ thống Quản lý Lịch dạy Giáo viên (Docker Cron Service).
      </div>
    </div>
  `
}

export async function sendScheduleEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(`[MAILER] SMTP credentials not set. Simulated email to: ${to} - Subject: ${subject}`)
    return { success: true, simulated: true }
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Lịch Dạy Giáo Viên" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  })

  return { success: true, messageId: info.messageId }
}

