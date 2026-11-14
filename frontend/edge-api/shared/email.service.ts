import type { Env } from '../types/index'

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendEmailViaResend(
  env: Env,
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'Server chưa cấu hình RESEND_API_KEY' }
  }

  const from = env.RESEND_FROM_EMAIL || 'Lịch Dạy Giáo Viên <onboarding@resend.dev>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `Resend HTTP ${res.status}: ${text || res.statusText}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Lỗi kết nối tới Resend API' }
  }
}

