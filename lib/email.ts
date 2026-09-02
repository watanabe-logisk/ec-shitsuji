/**
 * 顧客への通知メール。
 *
 * ★ 管理アプリ EC-app/lib/email.ts と同じ内容にすること。
 *   2つは別リポジトリで共有できないため、同じものを2箇所に持っている。
 *   文面を直したら両方直す。EC-app の `npm run check:email` で一致を確認できる。
 *
 * 送信は Resend（無料枠 月3,000通）を使う。
 * 環境変数が未設定なら何もしない（ローカルで誤送信しないように）。
 *
 * Chatwork 通知と同じく、ここでは例外を投げない。
 * メールが送れなかったせいで発注が失敗するのは本末転倒なので、
 * 呼び出し側が結果を見て email_log に記録する。
 */

const API_URL = 'https://api.resend.com/emails'

export type EmailResult =
  | { ok: true; skipped?: false; providerId: string | null }
  | { ok: true; skipped: true }
  | { ok: false; error: string }

function config() {
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  return key && from ? { key, from } : null
}

export function isEmailConfigured(): boolean {
  return config() !== null
}

/** 顧客が返信してくる前提。人が読むアドレスを設定すること */
function replyTo(): string | undefined {
  return process.env.MAIL_REPLY_TO || undefined
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
): Promise<EmailResult> {
  const conf = config()
  if (!conf) {
    console.warn('[email] RESEND_API_KEY / MAIL_FROM が未設定のため送信をスキップしました')
    return { ok: true, skipped: true }
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${conf.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: conf.from,
        to: [to],
        subject,
        text: body,
        ...(replyTo() ? { reply_to: replyTo() } : {}),
      }),
      // 応答が返らないまま顧客を待たせ続けないよう上限を設ける
      signal: AbortSignal.timeout(10000),
    })

    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = json?.message ?? json?.error ?? `HTTP ${res.status}`
      return { ok: false, error: String(msg).slice(0, 300) }
    }
    return { ok: true, providerId: json?.id ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------------------------------------------------------------------------
// 文面
// ---------------------------------------------------------------------------

export type OrderMail = {
  customerName: string
  /** 通知先に登録された担当者名。空なら会社名＋御中になる */
  recipientLabel: string
  orderNumber: string
  productName: string
  quantity: number
  addressLabel: string
  contactName: string
  deliveryDateLabel: string   // '2026年9月17日(木)'
  timeSlot: string
}

const SIGNATURE = [
  '━━━━━━━━━━━━━━━━━━━━━━━━',
  'AQUA JACKET株式会社',
  'このメールは送信専用ではありません。',
  'ご不明な点はそのままご返信ください。',
  '━━━━━━━━━━━━━━━━━━━━━━━━',
].join('\n')

/**
 * メールの冒頭の宛名を作る。
 *
 *   宛先の担当者名あり  ->  南総カントリークラブ / 宮崎様（2行）
 *   担当者名なし        ->  ネストホテル半蔵門 御中
 *   会社名＝担当者名    ->  吉田美恵子様（個人のお客様。1行）
 *
 * 「宮崎様」と入力されても「宮崎様様」にはしない。
 * 逆に「経理ご担当者様」のように敬称込みで入れられた場合は
 * そのまま尊重する。どちらで入力されても正しくなるようにしている。
 *
 * 個人のお客様に「御中」を付けるのは誤りなので、
 * 会社名と担当者名が同じ場合は1行にまとめる。
 */
/** 末尾の敬称。付いていれば尊重し、無ければ「様」を補う */
const HONORIFIC_TAIL = /[\s　]*(様|さま|サマ|殿|どの|さん|御中|各位)$/

function flatten(s: string): string {
  return s.replace(/[\s　]/g, '')
}

export function greetingFor(customerName: string, recipientLabel: string): string {
  const name = customerName.trim()
  const label = recipientLabel.trim()
  if (!label) return `${name} 御中`

  const named = HONORIFIC_TAIL.test(label) ? label : `${label}様`

  // 個人のお客様。会社名の行と担当者名の行が同じものになってしまうので1行にする。
  // 「吉田美恵子」と「吉田美恵子様」のように敬称の有無だけが違う場合も同じ人とみなす
  const bare = label.replace(HONORIFIC_TAIL, '')
  if (flatten(name) === flatten(bare)) return named

  return `${name}\n${named}`
}

/**
 * お届け先の表示。
 *
 *   通常のお届け先（大貫）
 *   ハウス売店                 ← 担当者名が「ハウス売店ご担当者様」の場合
 *
 * 納品先の名前と担当者名が重なっている登録が実際にあり、
 * そのまま並べると「ハウス売店（ハウス売店ご担当者様）」と読みにくくなる。
 * 誰宛かは冒頭の宛名で分かるので、重なっている場合は納品先だけにする。
 */
export function shipToLine(addressLabel: string, contactName: string): string {
  const label = addressLabel.trim()
  const contact = contactName.trim()
  if (!contact) return label
  if (flatten(contact).indexOf(flatten(label)) >= 0) return label
  return `${label}（${contact}）`
}

export function buildReceivedMail(o: OrderMail): { subject: string; body: string } {
  return {
    subject: `【AQUA JACKET】ご注文を承りました（${o.orderNumber}）`,
    body: [
      greetingFor(o.customerName, o.recipientLabel),
      '',
      'いつもご利用いただきありがとうございます。',
      '下記の内容でご注文を承りました。',
      '',
      '───────────────────────',
      `注文番号　　: ${o.orderNumber}`,
      `商品　　　　: ${o.productName}`,
      `数量　　　　: ${o.quantity} ケース`,
      `お届け先　　: ${shipToLine(o.addressLabel, o.contactName)}`,
      `希望納品日　: ${o.deliveryDateLabel}`,
      `配送時間帯　: ${o.timeSlot}`,
      '───────────────────────',
      '',
      '発送が完了しましたら、お問合せ番号とあわせて',
      '改めてご連絡いたします。',
      '',
      '※ ご注文内容の変更・キャンセルをご希望の場合は、',
      '　 このメールにご返信いただくか、発注画面よりご依頼ください。',
      '',
      SIGNATURE,
    ].join('\n'),
  }
}

export type ShippedMail = OrderMail & {
  carrierName: string
  trackingNumber: string
  trackingUrl: string
  /** 追跡ページが番号を自動入力できない業者では、番号を手で入れてもらう */
  needsManualInput: boolean
}

export function buildShippedMail(o: ShippedMail): { subject: string; body: string } {
  return {
    subject: `【AQUA JACKET】商品を発送しました（${o.orderNumber}）`,
    body: [
      greetingFor(o.customerName, o.recipientLabel),
      '',
      'ご注文の商品を発送いたしましたので、お知らせいたします。',
      '',
      '───────────────────────',
      `注文番号　　: ${o.orderNumber}`,
      `商品　　　　: ${o.productName}`,
      `数量　　　　: ${o.quantity} ケース`,
      `お届け先　　: ${shipToLine(o.addressLabel, o.contactName)}`,
      `お届け予定日: ${o.deliveryDateLabel}`,
      '',
      `配送業者　　: ${o.carrierName}`,
      `お問合せ番号: ${o.trackingNumber}`,
      '───────────────────────',
      '',
      o.needsManualInput
        ? `配送状況は下記より、お問合せ番号を入力してご確認いただけます。\n${o.trackingUrl}`
        : `配送状況は下記よりご確認いただけます。\n${o.trackingUrl}`,
      '',
      '※ 配送状況が反映されるまで、発送から数時間かかる場合がございます。',
      '',
      'この度はご注文いただきありがとうございました。',
      '到着まで今しばらくお待ちいただきますようお願い申し上げます。',
      '',
      SIGNATURE,
    ].join('\n'),
  }
}
