import type { Env } from '../../types/index'
import { helpChat, parseSchoolImage, parseZalo } from './ai.controller'

export async function handleAiRoutes(
  req: Request,
  method: string,
  path: string,
  env: Env
): Promise<Response | null> {
  if (method === 'POST' && path === '/api/ai/parse-zalo') {
    return parseZalo(req)
  }

  if (
    method === 'POST' &&
    (path === '/api/ai/parse-school-image' || path === '/api/ai/parse-image')
  ) {
    return parseSchoolImage(env)
  }

  if (method === 'POST' && path === '/api/ai/help-chat') {
    return helpChat(req, env)
  }

  return null
}

