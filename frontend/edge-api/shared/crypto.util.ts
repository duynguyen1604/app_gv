// ============================================================================
// CRYPTO HELPERS (Web Crypto API chuẩn cho Cloudflare Edge V8 Runtime)
// ============================================================================

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function randomHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomHex(5)}`
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

export async function hashPassword(password: string, existingSalt?: string): Promise<string> {
  const salt = existingSalt || randomHex(16)
  const hash = await sha256Hex(`gv_edge_pw_v1:${salt}:${password}`)
  return `edge_sha256$${salt}$${hash}`
}

export async function verifyPassword(password: string, storedHash?: string): Promise<boolean> {
  if (!storedHash) return false
  if (storedHash.startsWith('edge_sha256$')) {
    const parts = storedHash.split('$')
    if (parts.length !== 3) return false
    const salt = parts[1]
    const expected = await hashPassword(password, salt)
    return expected === storedHash
  }
  return false
}

