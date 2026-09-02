'use client'

import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import { maskEmail } from '@/lib/maskEmail'

/**
 * 通知メールの状態を見る画面。
 *
 * ここが無いと「送ったつもりで届いていない」に気付けない。
 * 送信設定が済んでいるか、テスト送信、直近の送信履歴の3つを置く。
 */

type Log = {
  id: number
  created_at: string
  order_number: string | null
  customer_name: string | null
  kind: 'received' | 'shipped'
  to_email: string
  subject: string
  status: 'sent' | 'failed' | 'skipped'
  error: string | null
}

const KIND_LABEL: Record<string, string> = { received: '注文受付', shipped: '発送完了' }
const STATUS_LABEL: Record<string, string> = { sent: '送信済み', failed: '失敗', skipped: '見送り' }

export default function MailPage() {
  const [config, setConfig] = useState<{ configured: boolean; from: string; replyTo: string } | null>(null)
  const [logs, setLogs] = useState<Log[]>([])
  const [failedTotal, setFailedTotal] = useState(0)
  const [to, setTo] = useState('')
  const [kind, setKind] = useState<'received' | 'shipped'>('received')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState('')
  const [revealed, setRevealed] = useState(false)

  const load = useCallback(async () => {
    const [c, l] = await Promise.all([
      fetch('/api/mail/test').then(r => r.json()).catch(() => null),
      fetch('/api/mail/log').then(r => r.json()).catch(() => null),
    ])
    if (c) setConfig(c)
    if (l?.rows) { setLogs(l.rows); setFailedTotal(l.failedTotal ?? 0) }
  }, [])

  useEffect(() => { load() }, [load])

  async function send() {
    setBusy(true); setError(''); setMessage(''); setPreview('')
    const res = await fetch('/api/mail/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, kind }),
    })
    const json = await res.json()
    if (!res.ok) setError(json.error ?? '送信できませんでした')
    else {
      setMessage(`${json.to} へ送信しました。届かない場合は迷惑メールもご確認ください。`)
      setPreview(json.body)
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <p className="text-xs tracking-[0.25em] text-stone uppercase mb-1">通知メール</p>
          <p className="text-xs text-stone">お客様への注文受付・発送完了メールの状態を確認します。</p>
        </div>

        {/* 設定の状態 */}
        <section className="bg-warm-50 border border-warm-300 p-5">
          <p className="text-xs tracking-widest text-stone uppercase mb-3">送信設定</p>
          {config === null ? (
            <p className="text-xs text-stone">確認しています...</p>
          ) : config.configured ? (
            <div className="space-y-1 text-sm">
              <p className="text-ink">設定済みです。メールが送信されます。</p>
              <p className="text-xs text-stone">差出人　: {config.from}</p>
              <p className="text-xs text-stone">返信先　: {config.replyTo || '（未設定。差出人に返信されます）'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="bg-champagne-light text-champagne-dark px-3 py-2 text-xs leading-relaxed">
                未設定です。メールは送信されず、送ろうとした記録だけが残ります。
              </p>
              <p className="text-xs text-stone leading-relaxed">
                Vercel の環境変数に RESEND_API_KEY と MAIL_FROM を設定し、再デプロイしてください。
              </p>
            </div>
          )}
        </section>

        {/* テスト送信 */}
        <section className="bg-warm-50 border border-warm-300 p-5">
          <p className="text-xs tracking-widest text-stone uppercase mb-1">テスト送信</p>
          <p className="text-xs text-stone mb-3 leading-relaxed">
            お客様に届くのと同じ文面を、指定したアドレスへ送ります。
            お客様には送られません。送信履歴にも残しません。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder="自分のメールアドレス"
              className="border border-warm-300 bg-warm-100 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark w-72"
            />
            <select
              value={kind}
              onChange={e => setKind(e.target.value === 'shipped' ? 'shipped' : 'received')}
              className="border border-warm-300 bg-warm-100 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark"
            >
              <option value="received">注文受付メール</option>
              <option value="shipped">発送完了メール</option>
            </select>
            <button
              onClick={send}
              disabled={busy || !to.trim() || !config?.configured}
              className="bg-navy text-warm-50 px-5 py-2 text-xs tracking-widest uppercase hover:opacity-90 disabled:opacity-40"
            >
              {busy ? '送信中...' : '送信'}
            </button>
          </div>
          {message && <p className="text-sm text-ink mt-3">{message}</p>}
          {error && <p className="bg-red-50 text-red-600 px-4 py-3 text-sm mt-3">{error}</p>}
          {preview && (
            <pre className="mt-3 bg-warm-100 border border-warm-300 p-4 text-xs text-ink overflow-x-auto whitespace-pre-wrap">
              {preview}
            </pre>
          )}
        </section>

        {/* 送信履歴 */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs tracking-widest text-stone uppercase">送信履歴</p>
            <div className="flex items-center gap-3">
              {logs.length > 0 && (
                <button
                  onClick={() => setRevealed(v => !v)}
                  className="text-xs text-stone hover:text-champagne-dark tracking-wide"
                >
                  {revealed ? '伏せる' : 'アドレスを表示'}
                </button>
              )}
              <button onClick={load} className="text-xs text-stone hover:text-champagne-dark tracking-wide">
                更新
              </button>
            </div>
          </div>

          {failedTotal > 0 && (
            <p className="bg-red-50 text-red-600 px-4 py-3 text-sm mb-2">
              送信に失敗したものが {failedTotal} 件あります。
            </p>
          )}

          {logs.length === 0 ? (
            <div className="bg-warm-50 border border-warm-300 p-10 text-center">
              <p className="text-xs text-stone">まだ送信履歴はありません</p>
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map(l => (
                <div key={l.id} className="bg-warm-50 border border-warm-300 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span
                      className={
                        l.status === 'failed' ? 'text-red-500'
                        : l.status === 'skipped' ? 'text-stone'
                        : 'text-ink'
                      }
                    >
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                    <span className="text-xs text-stone">{KIND_LABEL[l.kind] ?? l.kind}</span>
                    <span className="text-xs text-stone tabular-nums">{l.order_number ?? ''}</span>
                    <span className="text-xs text-stone">{l.customer_name ?? ''}</span>
                    <span className="text-xs text-stone break-all">
                      {revealed ? l.to_email : maskEmail(l.to_email)}
                    </span>
                    <span className="text-xs text-stone ml-auto tabular-nums">
                      {new Date(l.created_at).toLocaleString('ja-JP')}
                    </span>
                  </div>
                  {l.error && <p className="text-xs text-red-500 mt-1 break-all">{l.error}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
