export const SESSION_COOKIE = 'ec_shitsuji_session'

export async function getSessionToken(): Promise<string> {
  const password = process.env.AUTH_PASSWORD ?? ''
  const secret = process.env.SESSION_SECRET ?? 'fallback'
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(password))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}
