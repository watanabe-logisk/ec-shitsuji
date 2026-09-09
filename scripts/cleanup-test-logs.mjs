/**
 * テストが作った受注の「痕跡」を消す。
 *
 * 受注そのものを消しても、order_audit_log と email_log は残る。
 * 履歴を残すことが目的のテーブルなので、外部キーを張らずわざと残している。
 * だがテストの分まで残ると、操作履歴や通知メールの画面がテスト行で埋まり、
 * 本物の変更や送信失敗を見落とすようになる。だからテスト側で消す。
 *
 * 現存する受注のログには絶対に触らない。
 * 発注アプリ側の同名ファイルと同じ考え方。
 */
export async function cleanupTestLogs(db, markOrNumbers) {
  const isPrefix = typeof markOrNumbers === 'string'
  let target = []

  if (isPrefix) {
    // 目印で始まる番号のうち、受注がもう存在しないものだけ
    for (const t of ['order_audit_log', 'email_log']) {
      const { data } = await db.from(t).select('order_number').like('order_number', `${markOrNumbers}%`)
      for (const r of data ?? []) if (r.order_number) target.push(r.order_number)
    }
  } else {
    target = [...(markOrNumbers ?? [])].filter(Boolean)
  }

  target = [...new Set(target)]
  if (target.length === 0) return 0

  const { data: live } = await db.from('orders').select('order_number').in('order_number', target)
  const alive = new Set((live ?? []).map((o) => o.order_number))
  const doomed = target.filter((n) => !alive.has(n))
  if (doomed.length === 0) return 0

  let removed = 0
  for (const table of ['order_audit_log', 'email_log']) {
    const { data } = await db.from(table).select('id').in('order_number', doomed)
    for (const r of data ?? []) {
      await db.from(table).delete().eq('id', r.id)
      removed++
    }
  }
  return removed
}
