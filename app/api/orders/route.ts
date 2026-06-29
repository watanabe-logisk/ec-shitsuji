import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'

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

  let query = supabase.from('orders').select('*').order('shipping_date', { ascending: true })

  if (date) query = query.eq('shipping_date', date)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
