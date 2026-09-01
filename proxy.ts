import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE, getSessionToken } from '@/lib/auth'

/**
 * 管理アプリ全体のログイン保護。
 *
 * Next.js 16 で middleware.ts は proxy.ts に、名前付き export は
 * default export になった。ファイル名か export 形式を間違えると
 * 「呼ばれないので全ページが素通しになる」という危険な壊れ方をする。
 * 変更したら必ず、未ログインで各画面が弾かれることを確認すること。
 */
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublicAsset = /\.(png|jpg|jpeg|gif|svg|ico|webp|woff|woff2)$/i.test(pathname)
  // /api/cron はログインCookieを持たないスケジューラから叩かれるので、
  // ここで弾くと通知が黙って飛ばなくなる。代わりに CRON_SECRET で守る
  //（ルート側で Authorization ヘッダーを検証している）。
  if (
    isPublicAsset ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/cron') ||
    pathname === '/'
  ) {
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
