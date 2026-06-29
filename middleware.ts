import { NextRequest, NextResponse } from 'next/server'

const SESSION_COOKIE = 'ec_shitsuji_session'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)$/i.test(pathname)
  if (isPublicAsset || pathname.startsWith('/api/auth') || pathname === '/') {
    return NextResponse.next()
  }

  const session = request.cookies.get(SESSION_COOKIE)
  const expectedToken = Buffer.from(
    process.env.AUTH_PASSWORD ?? 'shitsuji2024'
  ).toString('base64')

  if (!session || session.value !== expectedToken) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
