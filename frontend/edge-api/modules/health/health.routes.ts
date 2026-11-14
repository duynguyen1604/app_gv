import type { Env } from '../../types/index'
import { getHealthStatus } from './health.controller'

export async function handleHealthRoutes(
  method: string,
  path: string,
  env: Env
): Promise<Response | null> {
  if (method === 'GET' && path === '/api/health') {
    return getHealthStatus(env)
  }
  return null
}

