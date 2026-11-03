function isDateOnlyColumn(key: string): boolean {
  return (
    key === 'date' ||
    key === 'original_date' ||
    key === 'new_date' ||
    key === 'valid_from' ||
    key === 'valid_to'
  )
}

export function toDateString(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    return value.slice(0, 10)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  return String(value).slice(0, 10)
}

export function serializeRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row }
  for (const [key, value] of Object.entries(out)) {
    if (isDateOnlyColumn(key)) {
      out[key] = toDateString(value)
    } else if (value instanceof Date) {
      out[key] = value.toISOString()
    }
  }
  return out as T
}

export function serializeRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => serializeRow(row))
}
