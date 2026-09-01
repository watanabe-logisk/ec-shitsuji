import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * 得意先ごとに Web発注ログインが発行済みかどうかだけを返す。
 *
 * 一覧にバッジを出すためのもので、パスワードは含めない。
 * 個別の [id]/login と違い一覧画面が開くたびに呼ばれるので、
 * 控えの平文をここから漏らさないようにしている。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  try {
    const { data: links, error } = await supabase
      .from('customer_users')
      .select('user_id, customer_id, is_active')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!links?.length) return NextResponse.json({})

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    const json = await res.json()
    const users: { id: string; email: string }[] = json?.users ?? []

    const map: Record<string, { email: string; isActive: boolean }> = {}
    for (const l of links) {
      map[l.customer_id] = {
        email: users.find(u => u.id === l.user_id)?.email ?? '',
        isActive: l.is_active,
      }
    }
    return NextResponse.json(map)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
