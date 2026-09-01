import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateCSV } from '@/lib/csv'
import { Order } from '@/types'

/**
 * CSV出力は「出荷指示を配送業者へ渡した」という業務上の区切りなので、
 * 出力と同時に受注を「準備中」へ進める。顧客側のアプリにもそのまま反映される。
 *
 * 進めるのは pending / confirmed のみ。理由:
 *   - cancelled を巻き戻すと、キャンセル済みが準備中として復活してしまう
 *   - shipped / completed を再出力（出し直し）したときに状態が逆戻りしてしまう
 */
const ADVANCEABLE = ['pending', 'confirmed']

export async function POST(request: NextRequest) {
  const { ids } = await request.json()

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const buffer = generateCSV(data as Order[])

  // ステータス更新に失敗してもCSVは返す。
  // CSVが出ないほうが業務影響が大きく、状態は管理画面から手で直せるため。
  const { error: updateError } = await supabase
    .from('orders')
    .update({ status: 'preparing' })
    .in('id', ids)
    .in('status', ADVANCEABLE)

  if (updateError) {
    console.error('[csv] 準備中への更新に失敗しました', updateError)
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'text/csv; charset=Shift_JIS',
      'Content-Disposition': `attachment; filename="orders_${today}.csv"`,
    },
  })
}
