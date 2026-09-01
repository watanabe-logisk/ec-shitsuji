import { supabase } from '@/lib/supabase'

/**
 * 得意先の「Web発注の開通」。
 *
 * 運用の流れ:
 *   1回目は AQUA JACKET が受注を登録して出荷する
 *   → そのあと顧客へ URL・ID・パスワードを渡す
 *   → 2回目以降は顧客が自分で発注する
 *
 * 1回目の注文を登録した時点で、Web発注に必要な情報はすべてその注文の中にある。
 * 商品も、納品先も、時間帯も。だからそこから作れる。
 *
 * ログイン発行だけあっても、発注可能商品と納品先が無ければ顧客の画面には
 * 「ご注文いただける商品が設定されていません」としか出ない。
 * 開通は必ずこの3点セットで行う。
 */

/** 全角スペースは正当なデータなので保持する。半角へ潰すと配送伝票の宛名が変わる */
const clean = (s: string | null | undefined): string =>
  (s ?? '').replace(/[\t\r\n]/g, '').trim()

/**
 * 住所の表記ゆれを吸収する。
 * 「住所： 東京都…」のように項目名が値へ混入した行があり、
 * そのままだと同じ場所が別の納品先として分裂する。
 */
const cleanAddress = (s: string | null | undefined): string =>
  clean(s).replace(/^住所\s*[:：]\s*/, '').trim()

/** 同じ場所かどうかの判定用。空白の有無だけの差を無視する */
const addressKey = (s: string | null | undefined): string =>
  cleanAddress(s).replace(/[\s　]/g, '')

/** 「ハウス売店ご担当者様」→「ハウス売店」。敬称を落として画面表示用の短い名前にする */
function toLabel(contact: string | null | undefined, fallback: string): string {
  const base = clean(contact)
    .replace(/(ご担当者様|ご担当者|担当者様|担当者|ご担当|御中|様)\s*$/, '')
    .trim()
  return base || fallback
}

export type ProvisionPlan = {
  products: { id: string; name: string; csvCode: string; alreadySet: boolean }[]
  addresses: {
    label: string
    shipToName: string
    contactName: string
    postalCode: string
    address: string
    phone: string
    timeSlot: string
    alreadySet: boolean
  }[]
  timeSlot: string
  settingsAlreadySet: boolean
  orderCount: number
  /** 注文が1件も無いと開通できない */
  canProvision: boolean
  reason?: string
}

type OrderRow = {
  product_code: string
  shipping_name: string
  shipping_contact: string
  shipping_postal_code: string
  shipping_address: string
  shipping_phone: string
  time_slot: string
  created_at: string
}

/**
 * この得意先の注文履歴から、開通に必要な設定を組み立てる。
 * 実際には書き込まない。画面で内容を確認してもらうために使う。
 */
export async function buildProvisionPlan(customerId: string): Promise<ProvisionPlan> {
  const { data: orders } = await supabase
    .from('orders')
    .select('product_code, shipping_name, shipping_contact, shipping_postal_code, shipping_address, shipping_phone, time_slot, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  const rows = (orders ?? []) as OrderRow[]

  const [{ data: master }, { data: linked }, { data: existingAddrs }, { data: settings }] =
    await Promise.all([
      supabase.from('products').select('id, name, csv_code, is_active'),
      supabase.from('customer_products').select('product_id').eq('customer_id', customerId),
      supabase.from('customer_addresses').select('address, label').eq('customer_id', customerId),
      supabase.from('customer_order_settings').select('customer_id').eq('customer_id', customerId).maybeSingle(),
    ])

  if (rows.length === 0) {
    return {
      products: [], addresses: [], timeSlot: '指定無し',
      settingsAlreadySet: !!settings, orderCount: 0,
      canProvision: false,
      reason: 'この得意先にはまだ受注がありません。1件登録してから開通してください。',
    }
  }

  // --- 商品：注文に出てきた商品コードを商品マスタと突き合わせる ---
  const linkedIds = (linked ?? []).map(l => l.product_id)
  const codes = rows.map(o => clean(o.product_code)).filter(Boolean)
    .filter((c, i, arr) => arr.indexOf(c) === i)
  const products = codes
    .map(code => {
      const m = (master ?? []).find(p => p.csv_code === code && p.is_active)
      return m ? { id: m.id, name: m.name, csvCode: code, alreadySet: linkedIds.indexOf(m.id) >= 0 } : null
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  // --- 納品先：住所と宛名の組み合わせで一意にする ---
  const existingKeys = (existingAddrs ?? []).map(a => addressKey(a.address))
  // 住所が同じでも宛名が違えば別の納品先（南総のハウス売店とコース売店など）
  const seenKeys: string[] = []
  const list: OrderRow[] = []
  for (const o of rows) {
    const key = `${addressKey(o.shipping_address)}|${clean(o.shipping_contact)}`
    if (seenKeys.indexOf(key) < 0) { seenKeys.push(key); list.push(o) }
  }

  const usedLabels = (existingAddrs ?? []).map(a => a.label)
  const addresses = list.map(o => {
    let label = list.length === 1 ? '通常のお届け先' : toLabel(o.shipping_contact, '通常のお届け先')
    // label は (customer_id, label) で一意。衝突したら連番で逃がす
    if (usedLabels.indexOf(label) >= 0) {
      let n = 2
      while (usedLabels.indexOf(`${label} (${n})`) >= 0) n++
      label = `${label} (${n})`
    }
    usedLabels.push(label)
    return {
      label,
      shipToName: clean(o.shipping_name),
      contactName: clean(o.shipping_contact),
      postalCode: clean(o.shipping_postal_code),
      address: cleanAddress(o.shipping_address),
      phone: clean(o.shipping_phone),
      timeSlot: clean(o.time_slot) || '指定無し',
      alreadySet: existingKeys.indexOf(addressKey(o.shipping_address)) >= 0,
    }
  })

  // --- 時間帯：直近の注文に合わせる ---
  const timeSlot = clean(rows[0].time_slot) || '指定無し'

  return {
    products,
    addresses,
    timeSlot,
    settingsAlreadySet: !!settings,
    orderCount: rows.length,
    canProvision: products.length > 0 && addresses.length > 0,
    reason:
      products.length === 0
        ? '注文の商品コードが商品マスタと一致しません。商品マスタを確認してください。'
        : addresses.length === 0
          ? '注文に納品先の情報がありません。'
          : undefined,
  }
}

export type ProvisionResult = {
  productsAdded: number
  addressesAdded: number
  settingsCreated: boolean
}

/** 計画どおりに設定を作る。既にあるものは触らない */
export async function applyProvisionPlan(
  customerId: string,
  plan: ProvisionPlan,
): Promise<ProvisionResult> {
  if (!plan.canProvision) throw new Error(plan.reason ?? '開通できません')

  const newProducts = plan.products.filter(p => !p.alreadySet)
  if (newProducts.length) {
    const { error } = await supabase.from('customer_products').upsert(
      newProducts.map(p => ({ customer_id: customerId, product_id: p.id })),
      { onConflict: 'customer_id,product_id' },
    )
    if (error) throw new Error(`発注可能商品の設定に失敗しました: ${error.message}`)
  }

  const newAddresses = plan.addresses.filter(a => !a.alreadySet)
  if (newAddresses.length) {
    const { error } = await supabase.from('customer_addresses').insert(
      newAddresses.map((a, i) => ({
        customer_id: customerId,
        label: a.label,
        ship_to_name: a.shipToName,
        contact_name: a.contactName,
        postal_code: a.postalCode,
        address: a.address,
        phone: a.phone,
        time_slot: a.timeSlot,
        sort_order: i,
        is_active: true,
      })),
    )
    if (error) throw new Error(`納品先の設定に失敗しました: ${error.message}`)
  }

  let settingsCreated = false
  if (!plan.settingsAlreadySet) {
    const { error } = await supabase.from('customer_order_settings').upsert(
      { customer_id: customerId, default_time_slot: plan.timeSlot },
      { onConflict: 'customer_id' },
    )
    // 設定が無くてもアプリ側の既定値で動くので、ここは致命傷にしない
    if (!error) settingsCreated = true
    else console.error('[provision] 発注設定の作成に失敗しました', error)
  }

  return {
    productsAdded: newProducts.length,
    addressesAdded: newAddresses.length,
    settingsCreated,
  }
}
