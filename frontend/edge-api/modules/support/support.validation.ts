import type { SupportTicketRecord } from '../../types/index'

export function parseSupportCategory(raw: unknown): SupportTicketRecord['category'] {
  const value = String(raw || 'support')
  if (value === 'complaint' || value === 'bug' || value === 'account') {
    return value
  }
  return 'support'
}

