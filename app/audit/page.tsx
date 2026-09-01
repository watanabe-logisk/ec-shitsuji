'use client'

import { useCallback, useEffect, useState } from 'react'
import Navbar from '@/components/Navbar'
import { statusLabel } from '@/lib/status'

/**
 * 受注の操作履歴。
 * 「誰が」は記録できない（管理アプリが全員共通のパスワードのため）。
 */

type Log = {
  id: number
  order_id: string | null
  order_number: string | null
  customer_name: string | null
  action: 'update' | 'delete'
  changed: Record<string, { before: unknown; after: unknown }> | null
  snapshot: Record<string, unknown> | null
  acted_at: string
}

/** 列名を日本語にする。ここに無い列はそのまま出す */
const FIELD_LABELS: Record<string, string> = {
  quantity: '個数',
  shipping_date: '配送指定日',
  status: '状態',
  product_name: '商品',
  product_code: '商品コード',
  customer_name: '得意先',
  shipping_name: '送付先',
  shipping_contact: '送付先氏名',
  shipping_address: '住所',
  shipping_postal_code: '郵便番号',
  shipping_phone: '電話番号',
  time_slot: '時間帯',
  notes: '備考',
  alert_extra_days: 'アラート延長日数',
  order_date: '受注日',
  order_number: '注文番号',
  customer_id: '得意先ID',
}

function label(field: string): string {
  return FIELD_LABELS[field] ?? field
}

/** 状態は内部値ではなく画面と同じ日本語で見せる */
function display(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '（空）'
  if (field === 'status') return statusLabel(String(value))
  return String(value)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function AuditPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'' | 'update' | 'delete'>('')
  const [q, setQ] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter) params.set('action', filter)
    if (q.trim()) params.set('q', q.trim())
    const res = await fetch(`/api/audit?${params}`)
    const data = await res.json()
    setLogs(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [filter, q])

  useEffect(() => {
    // 入力のたびに叩かないよう少し待つ
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const filterLabels: Record<string, string> = { '': 'すべて', update: '修正', delete: '削除' }

  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-6">
          <p className="text-xs tracking-[0.25em] text-stone uppercase mb-1">操作履歴</p>
          <p className="text-xs text-stone leading-relaxed">
            受注の修正と削除の記録です。登録は受注データ自体が残るため記録していません。
            <br />
            共通パスワードで運用しているため「誰が」は記録できません。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          {(['', 'update', 'delete'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 text-xs tracking-widest uppercase transition-colors ${
                filter === f
                  ? 'bg-navy text-warm-50'
                  : 'bg-warm-50 text-stone border border-warm-300 hover:border-champagne-dark hover:text-champagne-dark'
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="注文番号・得意先で絞り込む"
            className="ml-auto border border-warm-300 bg-warm-50 px-3 py-2 text-sm text-ink focus:outline-none focus:border-champagne-dark w-64"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-warm-300 border-t-champagne rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-warm-50 border border-warm-300 p-16 text-center">
            <p className="text-stone text-sm tracking-wide">記録がありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="bg-warm-50 border border-warm-300 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-block whitespace-nowrap px-2.5 py-1 text-xs tracking-wide shrink-0 ${
                      log.action === 'delete' ? 'bg-red-50 text-red-700' : 'bg-warm-200 text-stone'
                    }`}
                  >
                    {log.action === 'delete' ? '削除' : '修正'}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      <span className="tabular-nums">{log.order_number ?? '（番号なし）'}</span>
                      <span className="ml-3 text-stone">{log.customer_name}</span>
                    </p>

                    {log.action === 'update' && log.changed && (
                      <ul className="mt-2 space-y-1">
                        {Object.entries(log.changed).map(([field, v]) => (
                          <li key={field} className="text-xs text-stone">
                            <span className="text-ink">{label(field)}</span>
                            <span className="mx-2">{display(field, v.before)}</span>
                            <span className="text-champagne-dark">→</span>
                            <span className="ml-2 text-ink">{display(field, v.after)}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {log.action === 'delete' && log.snapshot && (
                      <div className="mt-2">
                        <p className="text-xs text-stone">
                          {String(log.snapshot.product_name ?? '')} × {String(log.snapshot.quantity ?? '')}
                          　配送 {String(log.snapshot.shipping_date ?? '')}
                        </p>
                        <button
                          onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                          className="text-xs text-stone hover:text-champagne-dark mt-1"
                        >
                          {expanded === log.id ? '内容を隠す' : '削除時の内容をすべて見る'}
                        </button>
                        {expanded === log.id && (
                          <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-xs bg-warm-100 p-3">
                            {Object.entries(log.snapshot)
                              .filter(([, v]) => v !== null && v !== '')
                              .map(([k, v]) => (
                                <div key={k} className="contents">
                                  <dt className="text-stone">{label(k)}</dt>
                                  <dd className="text-ink break-all">{display(k, v)}</dd>
                                </div>
                              ))}
                          </dl>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="text-xs text-stone whitespace-nowrap shrink-0 tabular-nums">
                    {formatDateTime(log.acted_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
