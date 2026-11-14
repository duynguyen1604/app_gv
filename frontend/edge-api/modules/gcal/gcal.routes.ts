import { getGcalLogs, getGcalStatus } from './gcal.controller'

export function handleGcalRoutes(method: string, path: string): Response | null {
  if (method === 'GET' && path === '/api/gcal/status') {
    return getGcalStatus()
  }
  if (method === 'GET' && path === '/api/gcal/logs') {
    return getGcalLogs()
  }
  return null
}

