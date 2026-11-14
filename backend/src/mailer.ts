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
  type: string // 'Trường' | 'Trực' | 'Dạy thêm' | 'Phát sinh' | 'Dời đến'
  title: string
  time: string
  location?: string
  session_group?: string // 'morning' | 'afternoon' | 'evening'
  period_code?: string   // e.g. 'S1-S2'
}

function getColorByType(type: string) {
  if (type.includes('Trường')) return { border: '#2563EB', bg: '#EFF6FF', badge: '#1D4ED8' }
  if (type.includes('Trực')) return { border: '#64748B', bg: '#F8FAFC', badge: '#475569' }
  if (type.includes('Phát sinh') || type.includes('Dời')) return { border: '#7C3AED', bg: '#F5F3FF', badge: '#6D28D9' }
  return { border: '#EA580C', bg: '#FFF7ED', badge: '#C2410C' }
}

export function buildScheduleEmailHtml({
  dateStr,
  sessions,
}: {
  dateStr: string
  sessions: SessionEmailItem[]
}): string {
  const groups: { key: string; label: string; icon: string; items: SessionEmailItem[] }[] = [
    { key: 'morning', label: 'Buổi Sáng', icon: '🌅', items: [] },
    { key: 'afternoon', label: 'Buổi Chiều', icon: '☀️', items: [] },
    { key: 'evening', label: 'Buổi Tối', icon: '🌙', items: [] },
  ]

  for (const s of sessions) {
    let grp = s.session_group
    if (!grp) {
      if (s.period_code?.toUpperCase().startsWith('S')) grp = 'morning'
      else if (s.period_code?.toUpperCase().startsWith('C')) grp = 'afternoon'
      else {
        const startHour = parseInt((s.time || '07:00').slice(0, 2), 10)
        grp = startHour < 12 ? 'morning' : startHour < 17 ? 'afternoon' : 'evening'
      }
    }
    const target = groups.find(g => g.key === grp) || groups[0]
    target.items.push(s)
  }

  const groupBlocks = sessions.length === 0
    ? '<p style="color: #64748b; font-style: italic; text-align: center; padding: 16px 0;">Hôm nay thầy/cô không có lịch dạy nào.</p>'
    : groups
        .filter(g => g.items.length > 0)
        .map(g => {
          const rows = g.items
            .map(s => {
              const c = getColorByType(s.type)
              const headerLine = s.period_code
                ? `<span style="background: ${c.badge}; color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-right: 6px;">${s.period_code}</span><strong>${s.time}</strong> · ${s.title}`
                : `<span style="background: ${c.badge}; color: #fff; font-size: 11px; padding: 2px 6px; border-radius: 4px; margin-right: 6px;">${s.type}</span><strong>${s.time}</strong> · ${s.title}`
              return `
                <div style="background-color: ${c.bg}; border-left: 4px solid ${c.border}; padding: 10px 12px; margin-bottom: 8px; border-radius: 8px;">
                  <div style="color: #1e293b; font-size: 14px;">${headerLine}</div>
                  ${s.location ? `<div style="color: #475569; font-size: 12px; margin-top: 4px;">📍 ${s.location}</div>` : ''}
                </div>
              `
            })
            .join('')

          return `
            <div style="margin-bottom: 16px;">
              <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                ${g.icon} ${g.label} (${g.items.length} buổi)
              </div>
              ${rows}
            </div>
          `
        })
        .join('')

  return `
    <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff;">
      <div style="background-color: #1A73E8; color: #ffffff; padding: 16px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 18px; letter-spacing: 0.02em;">LỊCH DẠY HÔM NAY</h2>
        <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.92;">${dateStr}</p>
      </div>

      <p style="color: #334155; font-size: 14px;">Kính gửi Thầy/Cô,</p>
      <p style="color: #475569; font-size: 13px;">Dưới đây là thời gian biểu thực tế hôm nay chia theo <strong>Sáng / Chiều / Tối</strong> (đã quy đổi giờ tiết trường và cập nhật dời/hủy/phát sinh):</p>

      <div style="margin: 16px 0;">
        ${groupBlocks}
      </div>

      <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 12px; font-size: 12px; color: #94a3b8; text-align: center;">
        Email được gửi tự động từ Hệ thống Quản lý Lịch dạy Giáo viên.
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
