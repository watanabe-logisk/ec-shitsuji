import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * 受注の操作履歴。
 * middleware でログイン必須なので、管理アプリに入れる人だけが見られる。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')          // update | delete
  const q = (searchParams.get('q') ?? '').trim()     // 注文番号・会社名での絞り込み
  const limit = Math.min(Number(searchParams.get('limit') ?? 100) || 100, 300)

  let query = supabase
    .from('order_audit_log')
    .select('*')
    .order('acted_at', { ascending: false })
    .limit(limit)

  if (action === 'update' || action === 'delete') query = query.eq('action', action)
  // カンマや括弧を渡されると or 句の構文が壊れるので、検索語からは取り除く
  if (q) {
    const safe = q.replace(/[,()"']/g, '')
    if (safe) query = query.or(`order_number.ilike.%${safe}%,customer_name.ilike.%${safe}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
