import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, getSessionToken } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)$/i.test(pathname)
  if (isPublicAsset || pathname.startsWith('/api/auth') || pathname === '/') {
    return NextResponse.next()
  }

  const session = request.cookies.get(SESSION_COOKIE)
  const expectedToken = await getSessionToken()

  if (!session || session.value !== expectedToken) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
