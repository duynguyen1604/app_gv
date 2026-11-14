import type { Env } from '../../types/index'
import { getSyncState, saveSyncState } from './sync.controller'

export async function handleSyncRoutes(
  req: Request,
  method: string,
  path: string,
  url: URL,
  env: Env
): Promise<Response | null> {
  if (path !== '/api/sync') return null
  if (method === 'GET') {
    return getSyncState(url, env)
  }
  if (method === 'PUT' || method === 'POST') {
    return saveSyncState(req, env)
  }
  return null
}

