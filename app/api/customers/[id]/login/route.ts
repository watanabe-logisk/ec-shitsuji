import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  ORDER_APP_URL,
  buildGuideText,
  createCustomerLogin,
  getCustomerLogin,
  reissuePassword,
} from '@/lib/customerAuth'

/**
 * 得意先のWeb発注ログイン情報。
 *
 * middleware でログイン必須になっているので、管理アプリに入れる人だけが叩ける。
 * パスワードの控えを返すため、顧客側からは絶対に到達できない場所に置くこと。
 */

export const dynamic = 'force-dynamic'
// supabase-js は内部で fetch を使う。Next.js のキャッシュに載ると
// 再発行したのに古いパスワードを返し続けることになる
export const fetchCache = 'force-no-store'

async function customerName(id: string): Promise<string | null> {
  const { data } = await supabase.from('customers').select('name').eq('id', id).maybeSingle()
  return data?.name?.trim() ?? null
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const name = await customerName(params.id)
    if (!name) return NextResponse.json({ error: '得意先が見つかりません' }, { status: 404 })

    const login = await getCustomerLogin(params.id)
    if (!login) return NextResponse.json({ url: ORDER_APP_URL, login: null })

    return NextResponse.json({
      url: ORDER_APP_URL,
      login,
      guide: buildGuideText(login, name),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

/**
 * ログインIDが未発行なら新規発行、発行済みならパスワードだけ作り直す。
 * body: { loginId?: string }  新規発行のときだけ必要
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const name = await customerName(params.id)
    if (!name) return NextResponse.json({ error: '得意先が見つかりません' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const existing = await getCustomerLogin(params.id)

    let login
    if (existing) {
      const password = await reissuePassword(existing.userId)
      login = { ...existing, password, issuedAt: new Date().toISOString() }
    } else {
      const loginId = typeof body.loginId === 'string' ? body.loginId : ''
      if (!loginId.trim()) {
        return NextResponse.json({ error: 'ログインIDを入力してください' }, { status: 400 })
      }
      login = await createCustomerLogin(params.id, name, loginId)
    }

    return NextResponse.json({
      url: ORDER_APP_URL,
      login,
      guide: buildGuideText(login, name),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}
