'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * 得意先ごとのWeb発注の状態。
 *
 * 運用の流れ:
 *   1回目は AQUA JACKET が受注を登録して出荷する
 *   → このパネルから「開通」して URL・ID・パスワードを顧客へ渡す
 *   → 2回目以降は顧客が自分で発注する
 *
 * ログインを発行しただけでは顧客は発注できない（発注可能商品と納品先が要る）。
 * 開通ボタンはその3点をまとめて作る。
 *
 * パスワードは初期状態で伏せ字。画面共有中に一覧を開いただけで
 * 全社ぶんが見えてしまうのを避けるため。
 */

type Login = {
  userId: string
  email: string
  isActive: boolean
  password: string | null
  issuedAt: string | null
}

type Plan = {
  products: { id: string; name: string; csvCode: string; alreadySet: boolean }[]
  addresses: {
    label: string; shipToName: string; contactName: string
    postalCode: string; address: string; phone: string; timeSlot: string; alreadySet: boolean
  }[]
  timeSlot: string
  settingsAlreadySet: boolean
  orderCount: number
  canProvision: boolean
  reason?: string
}

type LoginData = { url: string; login: Login | null; guide?: string }

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 会社名からログインIDの候補を作る。英数字が無ければ空になるので手入力させる */
function suggestLoginId(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

export default function CustomerLoginPanel({
  customerId,
  customerName,
}: {
  customerId: string
  customerName: string
}) {
  const [data, setData] = useState<LoginData | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState('')
  const [showPlan, setShowPlan] = useState(false)
  const [newId, setNewId] = useState(suggestLoginId(customerName))

  const load = useCallback(async () => {
    setLoading(true)
    const [a, b] = await Promise.all([
      fetch(`/api/customers/${customerId}/login`).then(r => r.json()),
      fetch(`/api/customers/${customerId}/provision`).then(r => r.json()),
    ])
    if (a.error) setError(a.error)
    else setData(a)
    if (!b.error) setPlan(b.plan)
    setLoading(false)
  }, [customerId])

  useEffect(() => { load() }, [load])

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      setTimeout(() => setCopied(''), 2000)
    } catch {
      setError('コピーできませんでした。手で選択してください')
    }
  }

  /** 開通：発注可能商品・納品先・発注設定を作り、必要ならログインも発行する */
  async function provision() {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/customers/${customerId}/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: newId }),
    })
    const json = await res.json()
    if (res.ok) {
      setShowPlan(false)
      await load()
      setData({ url: json.url, login: json.login, guide: json.guide })
      setRevealed(true)
    } else {
      setError(json.error ?? '開通に失敗しました')
    }
    setBusy(false)
  }

  async function reissue() {
    if (!confirm(
      `${customerName} のパスワードを作り直します。\n\n`
      + `今のパスワードは使えなくなります。\n`
      + `新しいパスワードを必ずお客様へお伝えください。\n\nよろしいですか？`
    )) return
    setBusy(true)
    setError('')
    const res = await fetch(`/api/customers/${customerId}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const json = await res.json()
    if (res.ok) { setData(json); setRevealed(true) }
    else setError(json.error ?? '再発行に失敗しました')
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="border-t border-warm-300 pt-4 mt-4">
        <p className="text-xs text-stone">Web発注の状態を読み込んでいます...</p>
      </div>
    )
  }

  const login = data?.login
  const hasProducts = plan?.products.some(p => p.alreadySet) ?? false
  const hasAddresses = plan?.addresses.some(a => a.alreadySet) ?? false
  const ready = hasProducts && hasAddresses

  return (
    <div className="border-t border-warm-300 pt-4 mt-4">
      <p className="text-xs tracking-widest text-stone uppercase mb-2">Web発注</p>

      {!login ? (
        <div className="space-y-3">
          {!plan?.canProvision ? (
            <p className="text-xs text-stone leading-relaxed">
              {plan?.reason ?? 'まだ開通できません。'}
              <br />
              1回目のご注文をこちらで登録すると、その内容から開通できるようになります。
            </p>
          ) : (
            <>
              <p className="text-xs text-stone leading-relaxed">
                過去{plan.orderCount}件のご注文から、発注できる商品・お届け先・時間帯を作って開通します。
              </p>

              <button
                onClick={() => setShowPlan(v => !v)}
                className="text-xs text-stone hover:text-champagne-dark"
              >
                {showPlan ? '内容を隠す' : '開通される内容を確認する'}
              </button>

              {showPlan && (
                <div className="bg-warm-100 p-3 space-y-2 text-xs">
                  <div>
                    <p className="text-stone mb-1">発注できる商品</p>
                    {plan.products.map(p => (
                      <p key={p.id} className="text-ink">
                        ・{p.name}
                        {p.alreadySet && <span className="text-stone">（設定済み）</span>}
                      </p>
                    ))}
                  </div>
                  <div>
                    <p className="text-stone mb-1">お届け先</p>
                    {plan.addresses.map((a, i) => (
                      <div key={i} className="text-ink mb-1">
                        ・{a.label}：{a.shipToName}
                        {a.contactName && ` / ${a.contactName}`}
                        {a.alreadySet && <span className="text-stone">（設定済み）</span>}
                        <br />
                        <span className="text-stone ml-3">
                          〒{a.postalCode} {a.address} {a.phone}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-stone">時間帯の既定値：{plan.timeSlot}</p>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  value={newId}
                  onChange={e => setNewId(e.target.value)}
                  placeholder="ログインID"
                  className="border border-warm-300 bg-warm-100 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark w-56"
                />
                <span className="text-xs text-stone">@aqua-jacket.order</span>
                <button
                  onClick={provision}
                  disabled={busy || !newId.trim()}
                  className="bg-navy text-warm-50 px-5 py-2 text-xs tracking-widest uppercase hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? '開通中...' : 'Web発注を開通する'}
                </button>
              </div>
              <p className="text-xs text-stone">
                英小文字・数字・ハイフンが使えます。お客様が手で入力するので短いほうが親切です。
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {!ready && (
            <p className="bg-champagne-light text-champagne-dark px-3 py-2 text-xs leading-relaxed">
              このお客様はまだ発注できません。
              {!hasProducts && '発注できる商品'}
              {!hasProducts && !hasAddresses && 'と'}
              {!hasAddresses && 'お届け先'}
              が未設定です。
              {plan?.canProvision
                ? '「不足分を設定する」を押してください。'
                : '1回目のご注文を登録すると設定できるようになります。'}
            </p>
          )}

          <Row label="URL" value={data!.url} onCopy={() => copy(data!.url, 'URL')} />
          <Row label="ID" value={login.email} onCopy={() => copy(login.email, 'ID')} />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-stone w-20 shrink-0">パスワード</span>
            <span className="font-mono text-ink tabular-nums">
              {login.password === null
                ? <span className="text-stone text-xs">控えがありません（再発行すると記録されます）</span>
                : revealed ? login.password : '••••••••••••'}
            </span>
            {login.password !== null && (
              <>
                <button onClick={() => setRevealed(v => !v)} className="text-xs text-stone hover:text-champagne-dark">
                  {revealed ? '隠す' : '表示'}
                </button>
                <button onClick={() => copy(login.password!, 'パスワード')} className="text-xs text-stone hover:text-champagne-dark">
                  コピー
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            {data!.guide && (
              <button
                onClick={() => copy(data!.guide!, '案内文')}
                className="border border-champagne-dark text-champagne-dark px-4 py-2 text-xs tracking-widest uppercase hover:bg-champagne-light"
              >
                案内文をコピー
              </button>
            )}
            {!ready && plan?.canProvision && (
              <button
                onClick={provision}
                disabled={busy}
                className="border border-navy text-navy px-4 py-2 text-xs tracking-widest uppercase hover:bg-navy hover:text-warm-50 disabled:opacity-40"
              >
                {busy ? '設定中...' : '不足分を設定する'}
              </button>
            )}
            <button onClick={reissue} disabled={busy} className="text-xs text-stone hover:text-red-500 disabled:opacity-40">
              {busy ? '処理中...' : 'パスワードを再発行'}
            </button>
            {login.issuedAt && (
              <span className="text-xs text-stone ml-auto">{formatDate(login.issuedAt)} 発行</span>
            )}
          </div>
        </div>
      )}

      {copied && <p className="text-xs text-sage mt-2">{copied}をコピーしました</p>}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-xs text-stone w-20 shrink-0">{label}</span>
      <span className="text-ink break-all">{value}</span>
      <button onClick={onCopy} className="text-xs text-stone hover:text-champagne-dark shrink-0">
        コピー
      </button>
    </div>
  )
}
