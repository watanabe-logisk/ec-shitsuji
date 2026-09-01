'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * 得意先ごとのWeb発注ログイン情報。
 *
 * パスワードは初期状態では伏せ字にしている。画面共有や後ろから覗かれる場面で
 * 一覧を開いただけで全社ぶんが見えてしまうのを避けるため。
 */

type Login = {
  userId: string
  email: string
  isActive: boolean
  password: string | null
  issuedAt: string | null
}

type Data = { url: string; login: Login | null; guide?: string }

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

/** 会社名からログインIDの候補を作る。英数字が無ければ空を返して手入力させる */
function suggestLoginId(name: string): string {
  const ascii = (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii.slice(0, 24)
}

export default function CustomerLoginPanel({
  customerId,
  customerName,
}: {
  customerId: string
  customerName: string
}) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState('')
  const [newId, setNewId] = useState(suggestLoginId(customerName))

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/login`)
    const json = await res.json()
    if (res.ok) setData(json)
    else setError(json.error ?? '取得に失敗しました')
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

  async function issue() {
    const isReissue = !!data?.login
    if (isReissue && !confirm(
      `${customerName} のパスワードを作り直します。\n\n`
      + `今のパスワードは使えなくなります。\n`
      + `新しいパスワードを必ずお客様へお伝えください。\n\nよろしいですか？`
    )) return

    setBusy(true)
    setError('')
    const res = await fetch(`/api/customers/${customerId}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isReissue ? {} : { loginId: newId }),
    })
    const json = await res.json()
    if (res.ok) { setData(json); setRevealed(true) }
    else setError(json.error ?? '発行に失敗しました')
    setBusy(false)
  }

  if (loading) {
    return <p className="text-xs text-stone">ログイン情報を読み込んでいます...</p>
  }

  const login = data?.login

  return (
    <div className="border-t border-warm-300 pt-4 mt-4">
      <p className="text-xs tracking-widest text-stone uppercase mb-2">Web発注ログイン</p>

      {!login ? (
        <div className="space-y-2">
          <p className="text-xs text-stone">まだ発行されていません。</p>
          <div className="flex items-center gap-2">
            <input
              value={newId}
              onChange={e => setNewId(e.target.value)}
              placeholder="ログインID"
              className="border border-warm-300 bg-warm-100 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark w-56"
            />
            <span className="text-xs text-stone">@aqua-jacket.order</span>
            <button
              onClick={issue}
              disabled={busy || !newId.trim()}
              className="bg-navy text-warm-50 px-4 py-2 text-xs tracking-widest uppercase hover:opacity-90 disabled:opacity-40"
            >
              {busy ? '発行中...' : '発行'}
            </button>
          </div>
          <p className="text-xs text-stone">
            英小文字・数字・ハイフンが使えます。お客様が手で入力するので短いほうが親切です。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
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
                <button
                  onClick={() => setRevealed(v => !v)}
                  className="text-xs text-stone hover:text-champagne-dark"
                >
                  {revealed ? '隠す' : '表示'}
                </button>
                <button
                  onClick={() => copy(login.password!, 'パスワード')}
                  className="text-xs text-stone hover:text-champagne-dark"
                >
                  コピー
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            {data!.guide && (
              <button
                onClick={() => copy(data!.guide!, '案内文')}
                className="border border-champagne-dark text-champagne-dark px-4 py-2 text-xs tracking-widest uppercase hover:bg-champagne-light"
              >
                案内文をコピー
              </button>
            )}
            <button
              onClick={issue}
              disabled={busy}
              className="text-xs text-stone hover:text-red-500 disabled:opacity-40"
            >
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
