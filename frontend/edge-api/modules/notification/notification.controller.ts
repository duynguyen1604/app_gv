import type { Env } from '../../types/index'
import { extractBearerToken } from '../../shared/auth-store.service'
import { sendEmailViaResend } from '../../shared/email.service'
import { jsonResponse, readJsonBody } from '../../middleware/cors.middleware'
import {
  buildDailyScheduleEmailHtml,
  type DailyEmailItem,
  getVietnamDateInfo,
  runDailyEmailCronJob,
} from './notification.service'

export async function sendTestEmail(req: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const to = String(body.to || '').trim()
  if (!to) return jsonResponse({ error: 'Thiếu địa chỉ email người nhận.' }, 400)

  const nowVn = getVietnamDateInfo()
  const items = Array.isArray(body.items) ? (body.items as DailyEmailItem[]) : []
  const subject = `[Lịch dạy] Thông báo lịch dạy hôm nay (${nowVn.displayDate})`
  const html = buildDailyScheduleEmailHtml('Thầy/Cô', nowVn.displayDate, items)

  if (env.RESEND_API_KEY) {
    const res = await sendEmailViaResend(env, to, subject, html)
    if (!res.ok) {
      return jsonResponse({ error: `Resend API lỗi: ${res.error}` }, 500)
    }
    return jsonResponse({ ok: true, provider: 'resend' })
  }

  return jsonResponse({
    ok: true,
    provider: 'edge-simulated',
    result: { simulated: true },
    message:
      'Đã kiểm tra luồng thông báo trên Cloudflare Edge (Thêm RESEND_API_KEY trong Settings -> Variables của Cloudflare để gửi email thật).',
  })
}

export async function triggerDailyEmailCron(
  req: Request,
  url: URL,
  env: Env
): Promise<Response> {
  const expectedSecret = (env.CRON_SECRET || '').trim()
  if (expectedSecret) {
    const bearer = extractBearerToken(req) || ''
    const querySecret = url.searchParams.get('secret') || ''
    const headerSecret = req.headers.get('x-cron-secret') || ''
    if (
      bearer !== expectedSecret &&
      querySecret !== expectedSecret &&
      headerSecret !== expectedSecret
    ) {
      return jsonResponse({ ok: false, error: 'Unauthorized cron trigger.' }, 401)
    }
  }

  if (!env.RESEND_API_KEY) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Chưa cấu hình RESEND_API_KEY trong Cloudflare Pages -> Settings -> Variables and secrets.',
      },
      400
    )
  }

  const force = url.searchParams.get('force') === '1'
  const summary = await runDailyEmailCronJob(env, force)
  return jsonResponse(summary)
}

