import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * 通知メールの送信履歴。
 *
 * 「送れなかったことに気付けない」のが最も危険なので、失敗を目立たせる。
 * 本文は一覧では返さない（宛先の数だけ重くなるため）。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const { data, error } = await supabase
    .from('email_log')
    .select('id, created_at, order_number, customer_name, kind, to_email, subject, status, error')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count: failed } = await supabase
    .from('email_log')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed')

  return NextResponse.json({ rows: data ?? [], failedTotal: failed ?? 0 })
}
