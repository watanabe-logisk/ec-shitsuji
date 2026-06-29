import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  const correct = process.env.AUTH_PASSWORD ?? 'shitsuji2024'

  if (password !== correct) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = Buffer.from(correct).toString('base64')
  const response = NextResponse.json({ ok: true })
  response.cookies.set('ec_shitsuji_session', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24,
  })
  return response
}
