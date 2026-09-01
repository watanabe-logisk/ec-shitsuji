import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * 得意先ごとの「有効な通知先の件数」だけを返す。
 *
 * 一覧にバッジを出して、宛先が未登録の得意先をひと目で見つけるためのもの。
 * 一覧を開くたびに呼ばれるので、アドレスそのものは返さない。
 * 個別のアドレスは [id]/emails から取り、画面側で伏せ字にする。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const { data, error } = await supabase
    .from('customer_email_recipients')
    .select('customer_id')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map: Record<string, number> = {}
  for (const r of data ?? []) {
    map[r.customer_id] = (map[r.customer_id] ?? 0) + 1
  }
  return NextResponse.json(map)
}
