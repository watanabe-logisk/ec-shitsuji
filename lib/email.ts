/**
 * 顧客への通知メール。
 *
 * ★ 発注アプリ aquajacket-order/lib/email.ts と同じ内容にすること。
 *   2つは別リポジトリで共有できないため、同じものを2箇所に持っている。
 *   文面を直したら両方直す。`npm run check:email` で一致を確認できる。
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

export function buildReceivedMail(o: OrderMail): { subject: string; body: string } {
  return {
    subject: `【AQUA JACKET】ご注文を承りました（${o.orderNumber}）`,
    body: [
      `${o.customerName} 御中`,
      '',
      'いつもご利用いただきありがとうございます。',
      '下記の内容でご注文を承りました。',
      '',
      '───────────────────────',
      `注文番号　　: ${o.orderNumber}`,
      `商品　　　　: ${o.productName}`,
      `数量　　　　: ${o.quantity} ケース`,
      `お届け先　　: ${o.addressLabel}${o.contactName ? `（${o.contactName}）` : ''}`,
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
      `${o.customerName} 御中`,
      '',
      'ご注文いただいた商品を発送いたしました。',
      '',
      '───────────────────────',
      `注文番号　　: ${o.orderNumber}`,
      `商品　　　　: ${o.productName}`,
      `数量　　　　: ${o.quantity} ケース`,
      `お届け先　　: ${o.addressLabel}${o.contactName ? `（${o.contactName}）` : ''}`,
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
      SIGNATURE,
    ].join('\n'),
  }
}
