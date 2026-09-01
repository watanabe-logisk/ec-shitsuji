import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * 得意先の通知メール宛先。1得意先に複数登録できる。
 * middleware でログイン必須なので、管理アプリに入れる人だけが操作できる。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabase
    .from('customer_email_recipients')
    .select('id, email, label, is_active, sort_order')
    .eq('customer_id', id)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const label = String(body.label ?? '').trim()

  // 厳しくしすぎると正当なアドレスを登録できなくなるので、最低限だけ見る
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'メールアドレスの形式が正しくありません' }, { status: 400 })
  }

  const { count } = await supabase
    .from('customer_email_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', id)

  const { data, error } = await supabase
    .from('customer_email_recipients')
    .insert({ customer_id: id, email, label, sort_order: count ?? 0 })
    .select()
    .single()

  if (error) {
    const msg = error.code === '23505'
      ? 'このアドレスは既に登録されています'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json(data)
}

/** 有効・無効の切り替えと削除。body.recipientId で対象を指定する */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const recipientId = String(body.recipientId ?? '')
  if (!recipientId) return NextResponse.json({ error: '対象が指定されていません' }, { status: 400 })

  const { data, error } = await supabase
    .from('customer_email_recipients')
    .update({ is_active: body.isActive === true })
    .eq('id', recipientId)
    .eq('customer_id', id)      // 他の得意先の宛先を書き換えられないようにする
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const recipientId = searchParams.get('recipientId') ?? ''
  if (!recipientId) return NextResponse.json({ error: '対象が指定されていません' }, { status: 400 })

  const { error } = await supabase
    .from('customer_email_recipients')
    .delete()
    .eq('id', recipientId)
    .eq('customer_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
