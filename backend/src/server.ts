import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { startCronJobs } from './cron.js'
import { sendScheduleEmail, buildScheduleEmailHtml } from './mailer.js'
import { ensureSchema, waitForDatabase } from './schema.js'
import { pullUserState, pushUserState, type SyncPayload } from './sync.js'
import { buildSchoolImagePrompt, buildZaloPrompt, callGeminiJson } from './gemini.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 4000)

app.use(cors())
app.use(express.json({ limit: '15mb' }))

function userIdFrom(req: express.Request): string {
  const fromQuery = req.query.user_id
  const fromBody = req.body?.user_id
  const fromHeader = req.header('x-user-id')
  return String(fromBody || fromQuery || fromHeader || 'local')
}

app.get('/api/health', async (_req, res) => {
  try {
    const { default: pool } = await import('./db.js')
    const dbRes = await pool.query('SELECT NOW() as now')
    res.json({
      status: 'ok',
      service: 'Teacher Schedule Manager Backend',
      timestamp: dbRes.rows[0].now,
      timezone: 'Asia/Ho_Chi_Minh',
      database: 'connected',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ status: 'error', database: message })
  }
})

app.get('/api/sync', async (req, res) => {
  const userId = userIdFrom(req)
  try {
    const state = await pullUserState(userId)
    res.json(state)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.put('/api/sync', async (req, res) => {
  const userId = userIdFrom(req)
  const payload = req.body as SyncPayload
  try {
    await pushUserState(userId, payload)
    const state = await pullUserState(userId)
    res.json({ success: true, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/sync', async (req, res) => {
  const userId = userIdFrom(req)
  const payload = req.body as SyncPayload
  try {
    await pushUserState(userId, payload)
    const state = await pullUserState(userId)
    res.json({ success: true, state })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/email/test', async (req, res) => {
  const { to, sessions = [] } = req.body
  if (!to) {
    return res.status(400).json({ error: 'Missing recipient email' })
  }

  const dateStr = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const subject = `[Kiểm thử Thông báo Lịch dạy] ${dateStr}`
  const html = buildScheduleEmailHtml({ dateStr, sessions })

  try {
    const result = await sendScheduleEmail({ to, subject, html })
    res.json({ success: true, result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ success: false, error: message })
  }
})

app.post('/api/ai/parse-zalo', async (req, res) => {
  const { text, today, weekStart, classes } = req.body
  const apiKey = process.env.GEMINI_API_KEY || req.body.apiKey

  if (!apiKey) {
    return res.status(400).json({ error: 'GEMINI_API_KEY not configured on server' })
  }
  if (!text) {
    return res.status(400).json({ error: 'Missing text' })
  }

  try {
    const parsed = await callGeminiJson({
      apiKey,
      prompt: buildZaloPrompt({ text, today, weekStart, classes }),
    })
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

app.post('/api/ai/parse-school-image', async (req, res) => {
  const { imageDataBase64, apiKey: bodyKey } = req.body
  const apiKey = process.env.GEMINI_API_KEY || bodyKey

  if (!apiKey) {
    return res.status(400).json({ error: 'GEMINI_API_KEY not configured on server' })
  }
  if (!imageDataBase64) {
    return res.status(400).json({ error: 'Missing imageDataBase64' })
  }

  const mimeType = String(imageDataBase64).includes('data:image/png') ? 'image/png' : 'image/jpeg'
  const base64Data = String(imageDataBase64).replace(/^data:image\/\w+;base64,/, '')

  try {
    const parsed = await callGeminiJson({
      apiKey,
      prompt: buildSchoolImagePrompt(),
      image: { mimeType, data: base64Data },
    })
    res.json(parsed)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: message })
  }
})

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SERVER] Teacher Schedule Manager Backend running on port ${PORT}`)
  })

  try {
    await waitForDatabase(5, 1000)
    await ensureSchema()
    startCronJobs()
    console.log('[SERVER] Database connected & Cron service active')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[SERVER] Database connection deferred (${message}). API is running; configure PostgreSQL in .env to enable Sync & Cron.`)
  }
}

start().catch((err) => {
  console.error('[SERVER] Failed to start:', err)
  process.exit(1)
})
