import cron from 'node-cron'
import pool from './db.js'
import { buildScheduleEmailHtml, sendScheduleEmail, type SessionEmailItem } from './mailer.js'

export function startCronJobs() {
  console.log('[CRON] Initializing automated daily notification cron job (Asia/Ho_Chi_Minh)...')

  // Run every minute to check if any user has scheduled an email for this minute
  cron.schedule('* * * * *', async () => {
    try {
      // Get current time in HH:mm format for Asia/Ho_Chi_Minh timezone
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const currentTimeHHmm = formatter.format(now)

      // Get current date string YYYY-MM-DD
      const datePartFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      const currentDateStr = datePartFormatter.format(now)

      // Get weekday in Vietnam (1=Mon ... 7=Sun)
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

      // Query settings where notification is enabled and matches current time
      const res = await pool.query(
        `SELECT * FROM settings WHERE notify_enabled = true AND notify_time = $1`,
        [currentTimeHHmm]
      )

      if (res.rows.length === 0) return

      for (const userSettings of res.rows) {
        if (!userSettings.notify_email) continue

        const userId = userSettings.user_id

        // Check if today is a holiday
        const holidayCheck = await pool.query(
          `SELECT * FROM holidays WHERE date = $1 AND user_id = $2`,
          [currentDateStr, userId]
        )
        if (holidayCheck.rows.length > 0) {
          console.log(`[CRON] Today ${currentDateStr} is a holiday for user ${userId}. Skipping email.`)
          continue
        }

        const sessions: SessionEmailItem[] = []

        // 1. School schedule
        if (userSettings.notify_content === 'both' || userSettings.notify_content === 'school') {
          const schoolRes = await pool.query(
            `SELECT * FROM school_schedule 
             WHERE weekday = $1 AND valid_from <= $2 AND (valid_to IS NULL OR valid_to >= $2) AND user_id = $3
             ORDER BY start_time ASC`,
            [currentWeekday, currentDateStr, userId]
          )
          for (const s of schoolRes.rows) {
            sessions.push({
              type: 'Trường',
              title: `${s.class_name} - Môn ${s.subject}`,
              time: `${s.start_time} – ${s.end_time}`,
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
            // Check if cancelled or moved
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
              title: r.class_name,
              time: `${r.start_time} – ${r.end_time}`,
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
              title: `${e.class_name} (Buổi phát sinh)`,
              time: `${e.start_time} – ${e.end_time}`,
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
              title: `${m.class_name} (Buổi dời)`,
              time: `${m.new_start} – ${m.new_end}`,
              location: m.location || undefined,
            })
          }
        }

        sessions.sort((a, b) => a.time.localeCompare(b.time))

        // Build HTML & send email
        const subject = `[Lịch Dạy Hôm Nay] ${currentDateStr} (${sessions.length} buổi)`
        const html = buildScheduleEmailHtml({ dateStr: currentDateStr, sessions })

        try {
          await sendScheduleEmail({
            to: userSettings.notify_email,
            subject,
            html,
          })

          // Log success to notification_log
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
}

