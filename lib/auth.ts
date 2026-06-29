import { cookies } from 'next/headers'

const SESSION_COOKIE = 'ec_shitsuji_session'
const SESSION_VALUE = 'authenticated'

export function getSessionToken(): string {
  const password = process.env.AUTH_PASSWORD ?? 'shitsuji2024'
  return Buffer.from(password).toString('base64')
}

export function isAuthenticated(): boolean {
  const cookieStore = cookies()
  const session = cookieStore.get(SESSION_COOKIE)
  return session?.value === getSessionToken()
}

export function setSessionCookie(response: Response): Response {
  response.headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=${getSessionToken()}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`
  )
  return response
}

export { SESSION_COOKIE, SESSION_VALUE }
