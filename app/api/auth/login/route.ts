import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, getSessionToken } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  const correct = process.env.AUTH_PASSWORD ?? ''

  if (!correct || password !== correct) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = await getSessionToken()
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24,
    secure: true,
  })
  return response
}
