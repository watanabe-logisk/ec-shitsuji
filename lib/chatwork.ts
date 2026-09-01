/**
 * Chatwork への通知。
 *
 * Chatwork API はフリープランでも利用でき、追加費用はかからない。
 * トークンは ユーザー設定 > サービス連携 > APIトークン から取得する。
 *
 * 環境変数が未設定なら何もしない（ローカルでトークン無しでも動くように）。
 */

const API_BASE = 'https://api.chatwork.com/v2'

export type ChatworkResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string }

function config() {
  const token = process.env.CHATWORK_API_TOKEN
  const roomId = process.env.CHATWORK_ROOM_ID
  return token && roomId ? { token, roomId } : null
}

export function isChatworkConfigured(): boolean {
  return config() !== null
}

/**
 * 通知を確実に届けたい相手の account_id。
 *
 * Chatwork は自分自身の投稿について自分に通知しないため、
 * このトークンは必ず Bot 専用アカウントのものを使うこと。
 * 個人のトークンを使うと、その本人にだけ通知が届かない状態になる。
 */
function mentionPrefix(): string {
  const ids = (process.env.CHATWORK_NOTIFY_TO ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^\d+$/.test(s))
  return ids.length ? ids.map(id => `[To:${id}]`).join('') + '\n' : ''
}

/** 例外を投げず必ず結果を返す。通知が飛ばなかったことに気付けないのが最も危険なため */
export async function postToChatwork(body: string): Promise<ChatworkResult> {
  const conf = config()
  if (!conf) {
    console.warn('[chatwork] CHATWORK_API_TOKEN / CHATWORK_ROOM_ID が未設定のため通知をスキップしました')
    return { ok: true, skipped: true }
  }

  try {
    const res = await fetch(`${API_BASE}/rooms/${conf.roomId}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': conf.token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ body }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, error: `HTTP ${res.status} ${text.slice(0, 200)}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Chatwork の装飾タグを壊さないよう、本文中の [ ] を全角に置き換える */
function escapeTag(s: string): string {
  return (s ?? '').replace(/\[/g, '［').replace(/\]/g, '］')
}

export type ShippingAlertItem = {
  orderNumber: string
  customerName: string
  productName: string
  quantity: number
  shippingDate: string       // 配送指定日 'YYYY-MM-DD'
  statusLabel: string
  /** 出荷期限を過ぎている（本来もっと前に出しているべき）注文か */
  overdue: boolean
}

export function buildShippingAlertMessage(
  todayLabel: string,
  items: ShippingAlertItem[],
): string {
  if (items.length === 0) {
    return [
      mentionPrefix().trimEnd(),
      `[info][title]本日出荷が必要な案件はありません[/title]`,
      `${escapeTag(todayLabel)} 時点で、本日出荷しないと間に合わない注文はありません。`,
      '[/info]',
    ].filter(Boolean).join('\n')
  }

  const overdue = items.filter(i => i.overdue).length
  const title = overdue > 0
    ? `【要確認】本日出荷 ${items.length}件（うち期限超過 ${overdue}件）`
    : `【本日出荷】${items.length}件`

  // 期限超過を先頭へ。配送指定日順に任せると、延長日数の大きい注文が
  // 期限超過なのに一覧の下へ沈んでしまう
  const sorted = [...items].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    return a.shippingDate.localeCompare(b.shippingDate)
  })

  // 状態は全角括弧で囲む。半角の [ ] は Chatwork がタグとして解釈しうるため
  const lines = sorted.map(i =>
    `${i.overdue ? '⚠ ' : '・'}${escapeTag(i.customerName)}\n`
    + `　${escapeTag(i.productName)} × ${i.quantity}　配送 ${escapeTag(i.shippingDate)}`
    + `　（${escapeTag(i.statusLabel)}）　${escapeTag(i.orderNumber)}`
  )

  const appUrl = process.env.APP_URL
  return [
    mentionPrefix().trimEnd(),
    `[info][title]${escapeTag(title)}[/title]`,
    `${escapeTag(todayLabel)}｜本日出荷しないと配送指定日に間に合いません。`,
    '',
    ...lines,
    overdue > 0 ? '\n⚠ は出荷期限を過ぎています。配送指定日に間に合うか確認してください。' : '',
    appUrl ? `[hr]${escapeTag(appUrl)}/dashboard` : '',
    '[/info]',
  ].filter(Boolean).join('\n')
}
