import type { Env } from '../../types/index'
import { jsonResponse, readJsonBody } from '../../middleware/cors.middleware'
import {
  emptyServerState,
  getSyncStateForUser,
  normalizeSyncPayload,
  saveSyncStateForUser,
} from './sync.service'

export async function getSyncState(url: URL, env: Env): Promise<Response> {
  const userId = (url.searchParams.get('user_id') || '').trim()
  if (!userId || userId === 'local') {
    return jsonResponse(emptyServerState())
  }
  const state = await getSyncStateForUser(env, userId)
  return jsonResponse(state)
}

export async function saveSyncState(req: Request, env: Env): Promise<Response> {
  const body = await readJsonBody(req)
  const userId = String(body.user_id || '').trim()
  if (!userId || userId === 'local') {
    return jsonResponse({ ok: false, error: 'Thiếu user_id hợp lệ' }, 400)
  }
  const stateToSave = normalizeSyncPayload(body)
  await saveSyncStateForUser(env, userId, stateToSave)
  return jsonResponse({
    ok: true,
    synced_at: new Date().toISOString(),
    classes_count: stateToSave.classes.length,
  })
}

