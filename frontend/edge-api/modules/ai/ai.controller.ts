import type { Env } from '../../types/index'
import { requireAuth } from '../../middleware/auth.middleware'
import { jsonResponse, readJsonBody } from '../../middleware/cors.middleware'
import {
  buildRuleBasedHelpReply,
  callGeminiHelpChat,
  checkHelpChatGuardrail,
  parseZaloRuleBased,
} from './ai.service'

export async function parseZalo(req: Request): Promise<Response> {
  const body = await readJsonBody(req)
  const text = String(body.text || '')
  return jsonResponse(parseZaloRuleBased(text))
}

export function parseSchoolImage(env: Env): Response {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse(
      {
        error:
          'Chưa cấu hình GEMINI_API_KEY trong Cloudflare Pages -> Settings -> Variables.',
      },
      400
    )
  }
  return jsonResponse({ items: [], rawText: 'Đã kết nối Gemini Edge.' })
}

export async function helpChat(req: Request, env: Env): Promise<Response> {
  const authResult = await requireAuth(req, env, 'Vui lòng đăng nhập để sử dụng trợ lý.')
  if (!authResult.ok) return authResult.response

  const body = await readJsonBody(req)
  const message = String(body.message || '').trim()
  const currentPath = String(body.currentPath || '/').trim()
  const history = Array.isArray(body.history) ? body.history.slice(-6) : []

  if (!message) {
    return jsonResponse({ success: false, error: 'Vui lòng nhập câu hỏi.' }, 400)
  }

  const guard = checkHelpChatGuardrail(message)
  if (guard.blocked && guard.reply) {
    return jsonResponse({
      success: true,
      reply: guard.reply,
      mode: guard.reason || 'guardrail',
    })
  }

  const role = authResult.ctx.user.role === 'admin' ? 'admin' : 'teacher'
  const apiKey = String(env.GEMINI_API_KEY || '').trim()
  if (apiKey) {
    const geminiReply = await callGeminiHelpChat(apiKey, message, role, currentPath, history)
    if (geminiReply) {
      return jsonResponse({
        success: true,
        reply: geminiReply,
        mode: 'gemini',
      })
    }
  }

  return jsonResponse({
    success: true,
    reply: buildRuleBasedHelpReply(message, role, currentPath),
    mode: 'knowledge_base',
  })
}

