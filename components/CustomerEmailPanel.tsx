'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { maskEmail } from '@/lib/maskEmail'

/**
 * 得意先の通知メール宛先。
 *
 * 1得意先に複数登録できる（発注担当と経理で分けたい場合など）。
 * 担当者名はメール冒頭の宛名になる。空なら「会社名 御中」。
 * 宛先が1件も無いと通知は送られないので、その状態が分かるようにしている。
 *
 * 登録済みのアドレスは既定で伏せ字にする。画面を人に見せるときに
 * 顧客のアドレスがそのまま読まれないようにするため。
 * 打ち間違いの確認はできないと困るので「表示」で元に戻せる。
 */

type Recipient = {
  id: string
  email: string
  label: string
  is_active: boolean
  sort_order: number
}

export default function CustomerEmailPanel({
  customerId,
  onChanged,
}: {
  customerId: string
  /** 一覧のバッジを更新してもらうための通知。省略可 */
  onChanged?: (activeCount: number) => void
}) {
  const [list, setList] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  // 伏せ字を解除しているか。画面を開き直すと必ず伏せ字に戻る
  const [revealed, setRevealed] = useState(false)

  // onChanged は呼び出し側でインライン関数として渡されることが多く、
  // 毎回別物になる。これを load の依存に入れると読み込みが無限に走るため、
  // ref に逃がして依存から外す。
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/customers/${customerId}/emails`)
    const json = await res.json()
    if (Array.isArray(json)) {
      setList(json)
      onChangedRef.current?.(json.filter((r: Recipient) => r.is_active).length)
    } else {
      setError(json.error ?? '取得に失敗しました')
    }
    setLoading(false)
  }, [customerId])

  useEffect(() => { load() }, [load])

  async function add() {
    setBusy(true)
    setError('')
    const res = await fetch(`/api/customers/${customerId}/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, label }),
    })
    const json = await res.json()
    if (res.ok) {
      setEmail('')
      setLabel('')
      // 登録した直後だけは、打ち間違いに気付けるよう伏せ字を解除しておく
      setRevealed(true)
      await load()
    } else {
      setError(json.error ?? '登録に失敗しました')
    }
    setBusy(false)
  }

  async function toggle(r: Recipient) {
    setBusy(true)
    await fetch(`/api/customers/${customerId}/emails`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: r.id, isActive: !r.is_active }),
    })
    await load()
    setBusy(false)
  }

  async function remove(r: Recipient) {
    // 消すものを取り違えないよう、確認のときだけは全体を見せる
    if (!confirm(`${r.email} を削除しますか？\n\n以後この宛先には通知が届かなくなります。`)) return
    setBusy(true)
    await fetch(`/api/customers/${customerId}/emails?recipientId=${r.id}`, { method: 'DELETE' })
    await load()
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="border-t border-warm-300 pt-4 mt-4">
        <p className="text-xs text-stone">通知先を読み込んでいます...</p>
      </div>
    )
  }

  const activeCount = list.filter(r => r.is_active).length

  return (
    <div className="border-t border-warm-300 pt-4 mt-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs tracking-widest text-stone uppercase">通知メールの宛先</p>
        {list.length > 0 && (
          <button
            type="button"
            onClick={() => setRevealed(v => !v)}
            className="text-xs text-stone hover:text-champagne-dark transition-colors tracking-wide"
          >
            {revealed ? '伏せる' : '全体を表示'}
          </button>
        )}
      </div>

      {activeCount === 0 && (
        <p className="bg-champagne-light text-champagne-dark px-3 py-2 text-xs leading-relaxed mb-2">
          有効な宛先がありません。このお客様には注文受付・発送完了のメールが届きません。
        </p>
      )}

      {list.length > 0 && (
        <div className="space-y-1 mb-3">
          {list.map(r => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span
                title={revealed ? undefined : '「全体を表示」で確認できます'}
                className={`break-all ${revealed ? '' : 'tracking-wide'} ${r.is_active ? 'text-ink' : 'text-stone line-through'}`}
              >
                {revealed ? r.email : maskEmail(r.email)}
              </span>
              {r.label && <span className="text-xs text-stone shrink-0">{r.label}</span>}
              {!r.is_active && <span className="text-xs text-stone shrink-0">停止中</span>}
              <button
                onClick={() => toggle(r)}
                disabled={busy}
                className="text-xs text-stone hover:text-champagne-dark shrink-0 ml-auto disabled:opacity-40"
              >
                {r.is_active ? '停止' : '再開'}
              </button>
              <button
                onClick={() => remove(r)}
                disabled={busy}
                className="text-xs text-stone hover:text-red-500 shrink-0 disabled:opacity-40"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="メールアドレス"
          className="border border-warm-300 bg-warm-100 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark w-64"
        />
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="担当者名（任意）"
          className="border border-warm-300 bg-warm-100 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark w-40"
        />
        <button
          onClick={add}
          disabled={busy || !email.trim()}
          className="bg-navy text-warm-50 px-4 py-2 text-xs tracking-widest uppercase hover:opacity-90 disabled:opacity-40"
        >
          登録
        </button>
      </div>
      <div className="text-xs text-stone mt-1 leading-relaxed space-y-0.5">
        <p>
          担当者名はメールの宛名になります。「宮崎」でも「宮崎様」でも
          <span className="text-ink">宮崎様</span> と表示されます（様が重なることはありません）。
        </p>
        <p>
          空欄にすると <span className="text-ink">{'{会社名}'} 御中</span> になります。
          個人のお客様は、会社名と同じ名前を入れると1行になります。
        </p>
        <p>宛先は複数登録できます。登録済みのアドレスは伏せ字で表示されます。</p>
      </div>

      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  )
}
