import { jsonResponse } from '../../middleware/cors.middleware'

export function getGcalStatus(): Response {
  return jsonResponse({
    configured: false,
    connected: false,
    calendar_id: 'primary',
  })
}

export function getGcalLogs(): Response {
  return jsonResponse({ logs: [] })
}

