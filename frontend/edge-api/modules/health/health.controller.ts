import type { Env } from '../../types/index'
import { ensureD1Table } from '../../shared/kv.service'
import { jsonResponse } from '../../middleware/cors.middleware'

export async function getHealthStatus(env: Env): Promise<Response> {
  await ensureD1Table(env.DB)
  return jsonResponse({
    status: 'ok',
    runtime: 'cloudflare-edge',
    database: env.DB ? 'cloudflare-d1-connected' : 'edge-memory-fallback',
    cold_start: '0ms (always-on)',
    timestamp: new Date().toISOString(),
  })
}

