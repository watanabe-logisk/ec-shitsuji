import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { statusRank } from '@/lib/status'

async function generateOrderNumber(): Promise<string> {
  const today = format(new Date(), 'yyMMdd')
  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .like('order_number', `${today}%`)
    .order('order_number', { ascending: false })
    .limit(1)

  let seq = 1
  if (data && data.length > 0) {
    const last = data[0].order_number as string
    seq = parseInt(last.slice(6)) + 1
  }
  return `${today}${String(seq).padStart(3, '0')}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const status = searchParams.get('status')

  // DB 側の並び順は従来のまま変更しない。
  // status の辞書順に依存しているが、ここを変えると同着行（状態も配送指定日も
  // 同じ行）の順序が入れ替わり、運用中の画面の見え方が変わってしまうため。
  let query = supabase
    .from('orders')
    .select('*')
    .order('status', { ascending: true })
    .order('shipping_date', { ascending: true })

  if (date) query = query.eq('shipping_date', date)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // その上で lib/status.ts の rank による安定ソートを掛ける。
  // pending(0) < shipped(3) は辞書順 'pending' < 'shipped' と同じ並びなので、
  // 既存データに対してはこのソートは何も動かさない（＝従来と完全に同じ並び）。
  // cancelled のように辞書順では先頭に来てしまう状態だけが正しい位置へ移動する。
  const sorted = [...(data ?? [])].sort((a, b) => statusRank(a.status) - statusRank(b.status))
  return NextResponse.json(sorted)
}

async function findOrCreateCustomer(body: Record<string, string>): Promise<string | null> {
  if (body.customer_id) return body.customer_id

  if (!body.shipping_name) return null

  // 同名の得意先が既にあれば連携
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('name', body.shipping_name)
    .maybeSingle()

  if (existing) return existing.id

  // なければ新規作成
  const { data: created } = await supabase
    .from('customers')
    .insert([{
      name: body.shipping_name,
      contact_name: body.shipping_contact ?? '',
      postal_code: body.shipping_postal_code ?? '',
      address: body.shipping_address ?? '',
      phone: body.shipping_phone ?? '',
    }])
    .select()
    .single()

  return created?.id ?? null
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const orderNumber = await generateOrderNumber()

  const customerId = await findOrCreateCustomer(body)

  const { data, error } = await supabase
    .from('orders')
    .insert([{
      ...body,
      customer_id: customerId,
      order_number: orderNumber,
      order_date: format(new Date(), 'yyyy-MM-dd'),
    }])
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
