import type { Env, ServerState } from '../../types/index'
import { kvGet, kvListByPrefix, kvSet } from '../../shared/kv.service'
import { loadAuthStore } from '../../shared/auth-store.service'
import { escapeHtml, sendEmailViaResend } from '../../shared/email.service'

export interface DailyEmailItem {
  type: string
  title: string
  time: string
  location?: string
  period_code?: string
  session_group?: string
  spans_to_group?: string
}

export function getVietnamDateInfo(): {
  dateStr: string
  displayDate: string
  hour: number
  minute: number
  weekday: number
} {
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000)
  const y = vnNow.getUTCFullYear()
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, '0')
  const d = String(vnNow.getUTCDate()).padStart(2, '0')
  const jsDay = vnNow.getUTCDay()
  const weekday = jsDay === 0 ? 7 : jsDay
  return {
    dateStr: `${y}-${m}-${d}`,
    displayDate: `${d}/${m}/${y}`,
    hour: vnNow.getUTCHours(),
    minute: vnNow.getUTCMinutes(),
    weekday,
  }
}

export const FALLBACK_SCHOOL_PERIODS: Array<{
  code: string
  start_time: string
  end_time: string
}> = [
  { code: 'S1', start_time: '07:00', end_time: '07:45' },
  { code: 'S2', start_time: '07:55', end_time: '08:40' },
  { code: 'S3', start_time: '09:05', end_time: '09:50' },
  { code: 'S4', start_time: '10:00', end_time: '10:45' },
  { code: 'S5', start_time: '10:55', end_time: '11:40' },
  { code: 'C1', start_time: '14:00', end_time: '14:45' },
  { code: 'C2', start_time: '14:55', end_time: '15:40' },
  { code: 'C3', start_time: '16:00', end_time: '16:45' },
  { code: 'C4', start_time: '16:55', end_time: '17:40' },
  { code: 'C5', start_time: '17:50', end_time: '18:35' },
]

export function getMondayOfDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((n) => Number(n))
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
  const jsDay = dt.getUTCDay()
  const diff = jsDay === 0 ? -6 : 1 - jsDay
  dt.setUTCDate(dt.getUTCDate() + diff)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function isWithinDateRange(
  dateStr: string,
  validFrom?: string | null,
  validTo?: string | null
): boolean {
  if (validFrom && dateStr < validFrom) return false
  if (validTo && dateStr > validTo) return false
  return true
}

export function computeDailyEmailItemsForState(
  state: ServerState,
  dateStr: string,
  weekday: number
): DailyEmailItem[] {
  const settings = (state.settings || {}) as Record<string, any>
  const notifyContent = settings.notify_content || 'both'
  const showDuty = settings.show_duty_in_email !== false
  const weekMonday = getMondayOfDateStr(dateStr)

  const holidays: any[] = Array.isArray(state.holidays) ? state.holidays : []
  const isHoliday = holidays.some((h) => h.date === dateStr)

  const items: DailyEmailItem[] = []

  // 1. Lịch trường học (schoolSchedule)
  if (!isHoliday && (notifyContent === 'both' || notifyContent === 'school')) {
    const rawPeriods: any[] =
      Array.isArray(state.schoolPeriods) && state.schoolPeriods.length > 0
        ? state.schoolPeriods
        : FALLBACK_SCHOOL_PERIODS
    const periodById = new Map<string, any>(
      rawPeriods.filter((p) => p.id).map((p) => [p.id, p])
    )
    const periodByCode = new Map<string, any>(
      rawPeriods.filter((p) => p.code).map((p) => [String(p.code).toUpperCase(), p])
    )
    const schoolSlots: any[] = Array.isArray(state.schoolSchedule) ? state.schoolSchedule : []

    for (const slot of schoolSlots) {
      if (Number(slot.weekday) !== weekday) continue
      const matchesWeek = slot.week_start
        ? slot.week_start === weekMonday
        : isWithinDateRange(dateStr, slot.valid_from, slot.valid_to)
      if (!matchesWeek) continue

      const isDuty = slot.cell_type === 'duty' || Boolean(slot.is_duty)
      if (isDuty && !showDuty) continue

      const code = String(slot.period_code || slot.period || '').toUpperCase()
      const p =
        (code ? periodByCode.get(code) : undefined) ||
        (slot.period_id ? periodById.get(slot.period_id) : undefined)

      const startTime = slot.start_time || p?.start_time || '07:00'
      const endTime = slot.end_time || p?.end_time || ''
      const timeLabel = endTime ? `${startTime} – ${endTime}` : startTime

      const mainText =
        [slot.class_name, slot.subject].filter(Boolean).join(' · ') ||
        slot.subject_name ||
        slot.title ||
        slot.note ||
        p?.name ||
        (isDuty ? 'Trực ban / Họp' : 'Tiết học ở trường')

      items.push({
        type: isDuty ? 'Trực' : 'Trường',
        title: code ? `${code} · ${mainText}` : mainText,
        time: timeLabel,
        location: slot.room || '',
        period_code: code || undefined,
        session_group: slot.session_group,
        spans_to_group: slot.spans_to_group,
      })
    }
  }

  // 2. Lịch dạy thêm (scheduleRules + sessionExceptions + extraSessions)
  if (notifyContent === 'both' || notifyContent === 'tutoring') {
    const classes: any[] = Array.isArray(state.classes) ? state.classes : []
    const classMap = new Map<string, any>(classes.map((c) => [c.id, c]))
    const exceptions: any[] = Array.isArray(state.sessionExceptions) ? state.sessionExceptions : []
    const rules: any[] = Array.isArray(state.scheduleRules) ? state.scheduleRules : []

    if (!isHoliday) {
      for (const rule of rules) {
        if (Number(rule.weekday) !== weekday) continue
        if (!isWithinDateRange(dateStr, rule.valid_from, rule.valid_to)) continue

        const ex = exceptions.find(
          (e) => e.rule_id === rule.id && e.original_date === dateStr
        )
        const exAction = ex?.action || ex?.type
        if (ex && (exAction === 'cancelled' || exAction === 'moved')) continue

        const cls = classMap.get(rule.class_id)
        const startTime = rule.start_time || '18:00'
        const endTime = rule.end_time || ''
        items.push({
          type: 'Dạy thêm',
          title: cls?.name || 'Lớp dạy thêm',
          time: endTime ? `${startTime} – ${endTime}` : startTime,
          location: cls?.location || rule.location || '',
        })
      }
    }

    // Các buổi được dời đến ngày hôm nay
    for (const ex of exceptions) {
      const exAction = ex.action || ex.type
      if (exAction === 'moved' && ex.new_date === dateStr) {
        const rule = rules.find((r) => r.id === ex.rule_id)
        const cls = classMap.get(ex.class_id || rule?.class_id)
        const startTime = ex.new_start || ex.new_start_time || rule?.start_time || '18:00'
        const endTime = ex.new_end || ex.new_end_time || rule?.end_time || ''
        items.push({
          type: 'Dạy bù / Dời lịch',
          title: cls?.name || 'Lớp dạy thêm',
          time: endTime ? `${startTime} – ${endTime}` : startTime,
          location: cls?.location || '',
        })
      }
    }

    // Các buổi học phát sinh (extraSessions)
    const extraSessions: any[] = Array.isArray(state.extraSessions) ? state.extraSessions : []
    for (const extra of extraSessions) {
      if (extra.date !== dateStr) continue
      const cls = classMap.get(extra.class_id)
      const startTime = extra.start_time || '18:00'
      const endTime = extra.end_time || ''
      items.push({
        type: 'Phát sinh',
        title: cls?.name
          ? `${cls.name}${extra.note ? ` (${extra.note})` : ''}`
          : extra.note || 'Buổi phát sinh',
        time: endTime ? `${startTime} – ${endTime}` : startTime,
        location: cls?.location || '',
      })
    }
  }

  items.sort((a, b) => a.time.localeCompare(b.time))
  return items
}

export function buildDailyScheduleEmailHtml(
  teacherName: string,
  displayDate: string,
  items: DailyEmailItem[]
): string {
  const safeTeacher = escapeHtml(teacherName || 'Thầy/Cô')
  const safeDate = escapeHtml(displayDate)

  const rowsHtml =
    items.length === 0
      ? `<p style="margin:16px 0;padding:16px;background:#f8fafc;border-radius:10px;color:#475569;font-size:15px;">Hôm nay (${safeDate}) Thầy/Cô không có lịch dạy nào được ghi nhận. Chúc Thầy/Cô một ngày nghỉ ngơi thật tốt!</p>`
      : `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;color:#334155;font-size:13px;">
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Giờ</th>
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Loại</th>
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Nội dung / Lớp</th>
              <th style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">Địa điểm</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (item) => `
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#0f172a;white-space:nowrap;">${escapeHtml(item.time)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#2563eb;font-size:13px;">${escapeHtml(item.type)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;">${escapeHtml(item.title)}</td>
                <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">${escapeHtml(item.location || '—')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
    <h2 style="margin:0 0 8px;color:#0f172a;font-size:20px;">Lịch dạy hôm nay — ${safeDate}</h2>
    <p style="margin:0 0 12px;color:#475569;font-size:14px;">Xin chào <strong>${safeTeacher}</strong>, đây là tổng hợp lịch dạy của bạn trong ngày:</p>
    ${rowsHtml}
    <p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">Email được gửi tự động từ Trợ Lý Giáo Viên (app-gv.pages.dev). Bạn có thể thay đổi giờ nhận hoặc tắt thông báo trong mục Cài đặt.</p>
  </div>`
}

export async function runDailyEmailCronJob(env: Env, force: boolean) {
  const nowVn = getVietnamDateInfo()
  const currentMinutes = nowVn.hour * 60 + nowVn.minute
  const allStates = await kvListByPrefix<ServerState>(env.DB, 'v3_clean_sync_state:')
  const authStore = await loadAuthStore(env)

  let checkedUsers = 0
  let sentCount = 0
  let skippedCount = 0
  const errors: Array<{ userId: string; error: string }> = []

  for (const entry of allStates) {
    const userId = entry.key.replace('v3_clean_sync_state:', '').trim()
    if (!userId || userId === 'local') continue
    checkedUsers++

    const state = entry.value
    const settings = (state.settings || {}) as Record<string, unknown>
    const notifyEnabled = Boolean(settings.notify_enabled)
    const notifyEmail = String(settings.notify_email || '').trim()

    if (!notifyEnabled || !notifyEmail) {
      skippedCount++
      continue
    }

    const holidays = Array.isArray(state.holidays)
      ? (state.holidays as Array<{ date?: string }>)
      : []
    if (holidays.some((h) => h.date === nowVn.dateStr)) {
      skippedCount++
      continue
    }

    const notifyTime = String(settings.notify_time || '06:00')
    const [hhStr, mmStr] = notifyTime.split(':')
    const notifyMinutes = (Number(hhStr) || 6) * 60 + (Number(mmStr) || 0)

    const sentKey = `v3_clean_email_sent:${userId}`
    const sentRecord = await kvGet<{ date: string }>(env.DB, sentKey)
    if (!force && (sentRecord?.date === nowVn.dateStr || currentMinutes < notifyMinutes)) {
      skippedCount++
      continue
    }

    const profile = authStore.users.find((u) => u.id === userId)
    const teacherName = profile?.full_name || 'Thầy/Cô'
    const items = computeDailyEmailItemsForState(state, nowVn.dateStr, nowVn.weekday)
    const subject = `[Lịch dạy] Lịch hôm nay (${nowVn.displayDate}) - ${items.length} buổi`
    const html = buildDailyScheduleEmailHtml(teacherName, nowVn.displayDate, items)

    const sendRes = await sendEmailViaResend(env, notifyEmail, subject, html)
    if (sendRes.ok) {
      sentCount++
      await kvSet(env.DB, sentKey, {
        date: nowVn.dateStr,
        sent_at: new Date().toISOString(),
        to: notifyEmail,
      })
    } else {
      errors.push({ userId, error: sendRes.error || 'Unknown error' })
    }
  }

  return {
    ok: true,
    date: nowVn.dateStr,
    timeVn: `${String(nowVn.hour).padStart(2, '0')}:${String(nowVn.minute).padStart(2, '0')}`,
    checkedUsers,
    sentCount,
    skippedCount,
    errors,
  }
}

