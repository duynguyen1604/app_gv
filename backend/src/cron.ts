import cron from 'node-cron'
import pool from './db.js'
import { buildScheduleEmailHtml, sendScheduleEmail, type SessionEmailItem } from './mailer.js'
import { syncUserGoogleCalendar } from './gcal.js'

export function startCronJobs() {
  console.log('[CRON] Initializing automated daily notification cron job (Asia/Ho_Chi_Minh)...')

  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const currentTimeHHmm = formatter.format(now)

      const datePartFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const currentDateStr = datePartFormatter.format(now)

      const weekdayShort = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        weekday: 'short',
      }).format(now)
      const weekdayMap: Record<string, number> = {
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
        Sun: 7,
      }
      const currentWeekday = weekdayMap[weekdayShort] ?? 1
      const [cy, cm, cd] = currentDateStr.split('-').map(Number)
      const currentWeekMonday = new Date(Date.UTC(cy, cm - 1, cd - (currentWeekday - 1)))
        .toISOString()
        .slice(0, 10)

      const res = await pool.query(
        `SELECT * FROM settings WHERE notify_enabled = true AND notify_time = $1`,
        [currentTimeHHmm]
      )

      if (res.rows.length === 0) return

      for (const userSettings of res.rows) {
        if (!userSettings.notify_email) continue

        const userId = userSettings.user_id
        const showDuty = userSettings.show_duty_in_email !== false
        const dutyEndTime = userSettings.duty_end_time || '16:30'
        const afternoonStart = userSettings.afternoon_start || '12:00'
        const eveningStart = userSettings.evening_start || '17:00'

        const classifyTutoring = (startTime: string) => {
          if (startTime >= eveningStart) return 'evening'
          if (startTime >= afternoonStart) return 'afternoon'
          return 'morning'
        }

        const holidayCheck = await pool.query(
          `SELECT * FROM holidays WHERE date = $1 AND user_id = $2`,
          [currentDateStr, userId]
        )
        if (holidayCheck.rows.length > 0) {
          console.log(`[CRON] Today ${currentDateStr} is a holiday for user ${userId}. Skipping email.`)
          continue
        }

        const sessions: SessionEmailItem[] = []

        // 1. School schedule (resolve against school_periods & week_start)
        if (userSettings.notify_content === 'both' || userSettings.notify_content === 'school') {
          const periodsRes = await pool.query(
            `SELECT * FROM school_periods WHERE user_id = $1`,
            [userId]
          )
          const periodMap = new Map<string, { start_time: string; end_time: string; session: string }>()
          for (const p of periodsRes.rows) {
            periodMap.set(String(p.period_code).toUpperCase(), {
              start_time: p.start_time,
              end_time: p.end_time,
              session: p.session,
            })
          }

          const schoolRes = await pool.query(
            `SELECT * FROM school_schedule 
             WHERE weekday = $1 AND week_start = $2 AND user_id = $3
             ORDER BY start_time ASC`,
            [currentWeekday, currentWeekMonday, userId]
          )
          let afternoonDutyAdded = false
          for (const s of schoolRes.rows) {
            if (s.cell_type === 'duty' && !showDuty) continue
            const pCode = String(s.period_code || s.period || 'S1').toUpperCase()
            const isAfternoon = pCode.startsWith('C') || s.session === 'afternoon'
            const isDuty = s.cell_type === 'duty'

            if (isDuty && isAfternoon) {
              if (afternoonDutyAdded) continue
              afternoonDutyAdded = true
              sessions.push({
                type: 'Trực',
                period_code: 'C1-C4',
                session_group: 'afternoon',
                title: `Trực chiều${s.subject ? ' · ' + s.subject : ''}`,
                time: `13:30–${dutyEndTime}`,
                location: s.room ? `Phòng ${s.room}` : 'Trường',
              })
              continue
            }

            const matchedP = periodMap.get(pCode)
            const startTime = matchedP?.start_time || s.start_time
            const endTime = matchedP?.end_time || s.end_time
            const sessionGroup = isAfternoon ? 'afternoon' : 'morning'

            sessions.push({
              type: isDuty ? 'Trực' : 'Trường',
              period_code: pCode,
              session_group: sessionGroup,
              title: isDuty
                ? `Trực trường${s.subject ? ' · ' + s.subject : ''}`
                : `${s.class_name}${s.subject ? ' · ' + s.subject : ''}`,
              time: `${startTime}–${endTime}`,
              location: s.room ? `Phòng ${s.room}` : 'Trường',
            })
          }
        }

        // 2. Tutoring fixed rules
        if (userSettings.notify_content === 'both' || userSettings.notify_content === 'tutoring') {
          const rulesRes = await pool.query(
            `SELECT r.*, c.name as class_name, c.location FROM schedule_rules r
             JOIN classes c ON r.class_id = c.id
             WHERE r.weekday = $1 AND r.valid_from <= $2 AND (r.valid_to IS NULL OR r.valid_to >= $2) AND r.user_id = $3
             ORDER BY r.start_time ASC`,
            [currentWeekday, currentDateStr, userId]
          )

          for (const r of rulesRes.rows) {
            const exRes = await pool.query(
              `SELECT * FROM session_exceptions WHERE rule_id = $1 AND original_date = $2`,
              [r.id, currentDateStr]
            )
            if (exRes.rows.length > 0) {
              const ex = exRes.rows[0]
              if (ex.action === 'cancelled' || ex.action === 'moved') continue
            }

            sessions.push({
              type: 'Dạy thêm',
              session_group: classifyTutoring(r.start_time),
              title: r.class_name,
              time: `${r.start_time}–${r.end_time}`,
              location: r.location || undefined,
            })
          }

          // 3. Extra sessions today
          const extraRes = await pool.query(
            `SELECT e.*, c.name as class_name, c.location FROM extra_sessions e
             JOIN classes c ON e.class_id = c.id
             WHERE e.date = $1 AND e.user_id = $2
             ORDER BY e.start_time ASC`,
            [currentDateStr, userId]
          )
          for (const e of extraRes.rows) {
            sessions.push({
              type: 'Phát sinh',
              session_group: classifyTutoring(e.start_time),
              title: `${e.class_name} (Phát sinh)`,
              time: `${e.start_time}–${e.end_time}`,
              location: e.location || undefined,
            })
          }

          // 4. Moved sessions landing today
          const movedRes = await pool.query(
            `SELECT ex.*, c.name as class_name, c.location FROM session_exceptions ex
             JOIN schedule_rules r ON ex.rule_id = r.id
             JOIN classes c ON r.class_id = c.id
             WHERE ex.action = 'moved' AND ex.new_date = $1 AND ex.user_id = $2
             ORDER BY ex.new_start ASC`,
            [currentDateStr, userId]
          )
          for (const m of movedRes.rows) {
            sessions.push({
              type: 'Dời đến',
              session_group: classifyTutoring(m.new_start),
              title: `${m.class_name} (Buổi dời)`,
              time: `${m.new_start}–${m.new_end}`,
              location: m.location || undefined,
            })
          }
        }

        sessions.sort((a, b) => a.time.localeCompare(b.time))

        const subject = `[Lịch Dạy Hôm Nay] ${currentDateStr} (${sessions.length} buổi)`
        const html = buildScheduleEmailHtml({ dateStr: currentDateStr, sessions })

        try {
          await sendScheduleEmail({
            to: userSettings.notify_email,
            subject,
            html,
          })

          await pool.query(
            `INSERT INTO notification_log (id, sent_at, to_email, status, error, subject, user_id)
             VALUES ($1, NOW(), $2, $3, $4, $5, $6)`,
            [Date.now().toString(), userSettings.notify_email, 'success', null, subject, userId]
          )

          console.log(`[CRON] Successfully dispatched daily schedule email to: ${userSettings.notify_email}`)
        } catch (emailErr: any) {
          console.error(`[CRON] Failed to send email to ${userSettings.notify_email}:`, emailErr)

          await pool.query(
            `INSERT INTO notification_log (id, sent_at, to_email, status, error, subject, user_id)
             VALUES ($1, NOW(), $2, $3, $4, $5, $6)`,
            [Date.now().toString(), userSettings.notify_email, 'error', emailErr.message, subject, userId]
          )
        }
      }
    } catch (err) {
      console.error('[CRON] Error in daily scheduler execution:', err)
    }
  })

  // Daily background job (01:00 Asia/Ho_Chi_Minh) to roll forward Google Calendar N-week sync window (Mục 2.10)
  cron.schedule(
    '0 1 * * *',
    async () => {
      try {
        const res = await pool.query(
          `SELECT user_id FROM settings WHERE gcal_connected = true AND gcal_enabled = true`
        )
        for (const row of res.rows) {
          const userId = String(row.user_id)
          try {
            const syncRes = await syncUserGoogleCalendar(userId)
            console.log(
              `[CRON][GCAL] Daily rolling sync for ${userId}: +${syncRes.created} ~${syncRes.updated} -${syncRes.deleted}`
            )
          } catch (gcalErr) {
            console.error(`[CRON][GCAL] Failed daily sync for ${userId}:`, gcalErr)
          }
        }
      } catch (err) {
        console.error('[CRON][GCAL] Error in daily Google Calendar rolling sync:', err)
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  )
}
