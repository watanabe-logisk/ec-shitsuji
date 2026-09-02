import { NextRequest, NextResponse } from 'next/server'
import { buildReceivedMail, buildShippedMail, sendEmail, isEmailConfigured } from '@/lib/email'
import { trackingInfo } from '@/lib/wms'

/**
 * テスト送信。実際に顧客へ届くのと同じ文面を、指定したアドレスへ送る。
 *
 * 顧客に届く最初の1通が崩れていると印象が悪いので、必ず先に自分で受け取って
 * 確認できるようにしている。email_log には残さない。テストで履歴が
 * 埋まると、本物の送信失敗を見落とすため。
 */

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const SAMPLE = {
  customerName: '南総カントリークラブ',
  recipientLabel: '宮崎様',
  orderNumber: 'TEST0001',
  productName: 'アクアジャケット 500ml',
  quantity: 10,
  addressLabel: 'ハウス売店',
  contactName: 'ハウス売店ご担当者様',
  deliveryDateLabel: '2026年9月17日(木)',
  timeSlot: '指定無し',
}

export async function POST(request: NextRequest) {
  if (!isEmailConfigured()) {
    return NextResponse.json({
      error: 'RESEND_API_KEY と MAIL_FROM が未設定です。Vercel の環境変数を設定して再デプロイしてください。',
    }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const to = String(body.to ?? '').trim()
  const kind = body.kind === 'shipped' ? 'shipped' : 'received'

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: '送り先のメールアドレスが正しくありません。' }, { status: 400 })
  }

  const track = trackingInfo('佐川急便', '123456789012')
  const mail = kind === 'shipped'
    ? buildShippedMail({
        ...SAMPLE,
        carrierName: '佐川急便',
        trackingNumber: '123456789012',
        trackingUrl: track.url,
        needsManualInput: track.needsManualInput,
      })
    : buildReceivedMail(SAMPLE)

  const result = await sendEmail(to, mail.subject, mail.body)

  if (!result.ok) {
    return NextResponse.json({ error: `送信できませんでした: ${result.error}` }, { status: 502 })
  }
  return NextResponse.json({
    ok: true,
    to,
    subject: mail.subject,
    body: mail.body,
    providerId: 'providerId' in result ? result.providerId : null,
  })
}

/** 設定が済んでいるかだけを返す。キーそのものは返さない */
export async function GET() {
  return NextResponse.json({
    configured: isEmailConfigured(),
    from: process.env.MAIL_FROM ?? '',
    replyTo: process.env.MAIL_REPLY_TO ?? '',
  })
}
