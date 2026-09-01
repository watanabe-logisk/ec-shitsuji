import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { alertDateISO } from '@/lib/shipping'
import { isOpenStatus, statusLabel } from '@/lib/status'
import { buildShippingAlertMessage, postToChatwork, ShippingAlertItem } from '@/lib/chatwork'
import { Order } from '@/types'

/**
 * 「本日出荷しなければ間に合わない受注」を Chatwork へ通知する。
 * 毎朝スケジューラから GET で叩かれる想定。
 *
 * 抽出条件はダッシュボードの ButlerGreeting と同一にしてある。
 * lib/shipping.ts の alertDateISO と lib/status.ts の isOpenStatus を
 * そのまま使うので、通知の件数と画面の件数がズレることはない。
 */

export const dynamic = 'force-dynamic'
// Next.js は fetch を差し替えて GET の結果をキャッシュする。supabase-js も内部で
// fetch を使うため、これが無いと最初の集計結果が固定され、受注が増えても
// 「0件」を返し続ける。実際にそうなることを確認したので必ず残すこと。
export const fetchCache = 'force-no-store'
export const revalidate = 0

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

/**
 * Vercel の実行環境は UTC なので、JST の「今日」を明示的に求める。
 * 朝8:45 JST は前日23:45 UTC にあたり、素朴に new Date() を使うと
 * 1日ずれた日付で判定してしまう。
 */
function jstNow(): Date {
  return new Date(Date.now() + JST_OFFSET_MS)
}
function jstToday(): string {
  return jstNow().toISOString().slice(0, 10)
}
function jstTodayLabel(): string {
  const d = jstNow()
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAY_LABELS[d.getUTCDay()]})`
}
/** 土日か。lib/shipping.ts の営業日計算と揃えて祝日は見ない */
function isWeekend(): boolean {
  const day = jstNow().getUTCDay()
  return day === 0 || day === 6
}

/**
 * CRON_SECRET を知っている呼び出しだけ通す。
 * Vercel Cron は CRON_SECRET が設定されていれば
 * Authorization: Bearer <secret> を自動で付けてくる。
 * 外部のスケジューラから叩く場合も同じヘッダーを付ければよい。
 *
 * 未設定なら常に拒否する。誰でも叩ける状態で公開するより、
 * 通知が飛ばないほうが安全なため。
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = jstToday()
  // ?dry=1 は集計だけして Chatwork へは投稿しない。
  // 動作確認のたびに実際の通知が飛ぶのを防ぐため、テストは必ずこちらを使う。
  const dryRun = request.nextUrl.searchParams.get('dry') === '1'

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('shipping_date', { ascending: true })

  if (error) {
    console.error('[cron] 受注の取得に失敗しました', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items: ShippingAlertItem[] = (data as Order[])
    .filter(o => {
      if (!isOpenStatus(o.status)) return false
      const triggerDate = alertDateISO(o.shipping_date, o.alert_extra_days || 0)
      if (!triggerDate) return false
      return triggerDate <= today && o.shipping_date >= today
    })
    .map(o => ({
      orderNumber: o.order_number,
      customerName: o.customer_name,
      productName: o.product_name,
      quantity: o.quantity,
      shippingDate: o.shipping_date,
      statusLabel: statusLabel(o.status),
      // 出荷期限を過ぎている＝本来もっと前に出しているべきだった受注
      overdue: alertDateISO(o.shipping_date, o.alert_extra_days || 0) < today,
    }))

  const message = buildShippingAlertMessage(jstTodayLabel(), items)
  const overdue = items.filter(i => i.overdue).length

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, date: today, count: items.length, overdue, message })
  }

  // 0件の休業日（土日）は送らない。平日の0件は「通知経路が生きている」証拠として送る。
  // 沈黙が「0件」なのか「壊れている」のか区別できないのが、この仕組みで最も危険なため。
  if (items.length === 0 && isWeekend()) {
    return NextResponse.json({ ok: true, skipped: '休業日で対象0件', date: today, count: 0 })
  }

  const result = await postToChatwork(message)

  if (!result.ok) {
    console.error('[cron] Chatwork への通知に失敗しました', result.error)
    return NextResponse.json(
      { ok: false, date: today, count: items.length, error: result.error },
      { status: 502 },
    )
  }

  return NextResponse.json({
    ok: true,
    date: today,
    count: items.length,
    overdue,
    skipped: 'skipped' in result ? result.skipped : false,
  })
}
