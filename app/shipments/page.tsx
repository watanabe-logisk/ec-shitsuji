'use client'

import { useState } from 'react'
import Navbar from '@/components/Navbar'
import { CARRIERS } from '@/lib/wms'

/**
 * WMS の出荷実績CSVを取り込み、発送完了メールを送る画面。
 *
 * 取り込みは2段階にしている。読み込んだだけでは何も起きず、
 * 内容を確認して「確定」を押したときに初めて記録とメール送信をする。
 * 番号を取り違えると他社の追跡番号を送ってしまうため。
 */

type OrderRef = {
  id: string
  orderNumber: string
  customerName: string
  shippingName: string
  shippingDate: string
  quantity: number
  status?: string
}

type Row = {
  lineNo: number
  orderNumber: string
  trackingNumber: string
  shippedOn: string | null
  shipToName: string
  kind: 'exact' | 'contained' | 'none'
  carrier: string | null
  blocked: string | null
  alreadyImported: boolean
  order: OrderRef | null
  candidates: OrderRef[]
  raw: Record<string, string>
}

type Result = { orderNumber: string; ok: boolean; message: string; mailMessage: string }

const box = 'border border-warm-300 bg-warm-100 px-2 py-1 text-sm text-ink focus:outline-none focus:border-champagne-dark'

export default function ShipmentsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<Result[] | null>(null)

  // 行ごとの選択状態。既定は「取り込む」だが、確定できない行は外しておく
  const [chosen, setChosen] = useState<Record<number, boolean>>({})
  const [orderFor, setOrderFor] = useState<Record<number, string>>({})
  const [carrierFor, setCarrierFor] = useState<Record<number, string>>({})

  async function upload(file: File) {
    setBusy(true)
    setError('')
    setResults(null)
    setRows(null)

    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/shipments/preview', { method: 'POST', body: fd })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? '読み取れませんでした')
      setBusy(false)
      return
    }

    const list: Row[] = json.rows
    const c: Record<number, boolean> = {}
    const o: Record<number, string> = {}
    const car: Record<number, string> = {}
    for (const r of list) {
      c[r.lineNo] = !!r.order && !r.blocked && !r.alreadyImported
      o[r.lineNo] = r.order?.id ?? ''
      car[r.lineNo] = r.carrier ?? ''
    }
    setRows(list)
    setFileName(json.fileName)
    setChosen(c)
    setOrderFor(o)
    setCarrierFor(car)
    setBusy(false)
  }

  const readyRows = () =>
    (rows ?? []).filter(r => chosen[r.lineNo] && orderFor[r.lineNo] && carrierFor[r.lineNo])

  async function submit() {
    const items = readyRows().map(r => ({
      orderId: orderFor[r.lineNo],
      trackingNumber: r.trackingNumber,
      carrier: carrierFor[r.lineNo],
      shippedOn: r.shippedOn,
      raw: r.raw,
    }))
    if (items.length === 0) return

    // 送ったメールは取り消せない。押し間違いで顧客に届くのを防ぐ
    const yes = window.confirm(
      `${items.length}件を出荷済みにして、お客様へ発送完了メールを送ります。\n\n` +
      `送信したメールは取り消せません。内容を確認しましたか？`,
    )
    if (!yes) return

    setBusy(true)
    setError('')
    const res = await fetch('/api/shipments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    const json = await res.json()
    if (!res.ok) setError(json.error ?? '取り込みに失敗しました')
    else {
      setResults(json.results)
      setRows(null)
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-warm-100">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-6">
          <p className="text-xs tracking-[0.25em] text-stone uppercase mb-1">出荷実績の取り込み</p>
          <p className="text-xs text-stone leading-relaxed">
            WMSの「出荷実績（注文単位）」CSVを読み込み、お問合せ番号を受注に結び付けて
            お客様へ発送完了メールを送ります。
          </p>
        </div>

        {/* 読み込み */}
        {!rows && !results && (
          <label className="block bg-warm-50 border border-dashed border-warm-300 p-16 text-center cursor-pointer hover:border-champagne-dark transition-colors">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) upload(f)
              }}
            />
            <p className="text-sm text-ink mb-1">CSVファイルを選ぶ</p>
            <p className="text-xs text-stone">
              この時点では何も保存されません。内容を確認してから確定します。
            </p>
          </label>
        )}

        {busy && <p className="text-xs text-stone mt-4">処理中です...</p>}
        {error && <p className="bg-red-50 text-red-600 px-4 py-3 text-sm mt-4">{error}</p>}

        {/* 確認 */}
        {rows && (
          <div className="space-y-3">
            <p className="text-xs text-stone">
              {fileName} — {rows.length}行
            </p>

            {rows.map(r => {
              const options = r.order ? [r.order, ...r.candidates] : r.candidates
              const picked = orderFor[r.lineNo] ?? ''
              const ready = !!picked && !!carrierFor[r.lineNo]
              return (
                <div
                  key={r.lineNo}
                  className={`bg-warm-50 border p-4 ${
                    r.alreadyImported
                      ? 'border-warm-300 opacity-60'
                      : ready
                        ? 'border-warm-300'
                        : 'border-champagne'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={!!chosen[r.lineNo]}
                      disabled={!ready || r.alreadyImported || !!r.blocked}
                      onChange={e => setChosen(s => ({ ...s, [r.lineNo]: e.target.checked }))}
                      className="mt-1 shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-ink tabular-nums">
                          {r.trackingNumber || '（番号なし）'}
                        </span>
                        <span className="text-xs text-stone">
                          CSVの注文番号 {r.orderNumber || '（空）'}
                        </span>
                        <span className="text-xs text-stone">{r.shippedOn ?? '出荷日不明'}</span>
                        <span className="text-xs text-stone truncate">{r.shipToName}</span>
                      </div>

                      {r.alreadyImported && (
                        <p className="text-xs text-stone">
                          この番号は取り込み済みです。メールも送信済みのため対象から外しています。
                        </p>
                      )}
                      {r.blocked && <p className="text-xs text-red-500">{r.blocked}</p>}
                      {!r.order && !r.blocked && (
                        <p className="text-xs text-champagne-dark">
                          注文番号が一致しませんでした。どの受注か選んでください。
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={picked}
                          onChange={e => setOrderFor(s => ({ ...s, [r.lineNo]: e.target.value }))}
                          disabled={r.alreadyImported}
                          className={`${box} max-w-full`}
                        >
                          <option value="">受注を選ぶ</option>
                          {options.map(o => (
                            <option key={o.id} value={o.id}>
                              {o.orderNumber}｜{o.customerName}｜{o.shippingDate}｜{o.quantity}ケース
                            </option>
                          ))}
                        </select>

                        <select
                          value={carrierFor[r.lineNo] ?? ''}
                          onChange={e => setCarrierFor(s => ({ ...s, [r.lineNo]: e.target.value }))}
                          disabled={r.alreadyImported}
                          className={box}
                        >
                          <option value="">配送業者を選ぶ</option>
                          {CARRIERS.map(c => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>

                        {r.carrier && (
                          <span className="text-xs text-stone">
                            {r.trackingNumber.length}桁のため {r.carrier} と判定
                          </span>
                        )}
                        {!r.carrier && r.trackingNumber && (
                          <span className="text-xs text-champagne-dark">
                            {r.trackingNumber.length}桁は判定できません。選んでください
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={submit}
                disabled={busy || readyRows().length === 0}
                className="bg-navy text-warm-50 px-6 py-3 text-xs tracking-widest uppercase hover:opacity-90 disabled:opacity-40"
              >
                {readyRows().length}件を取り込んでメールを送る
              </button>
              <button
                onClick={() => {
                  setRows(null)
                  setError('')
                }}
                className="text-xs text-stone hover:text-champagne-dark tracking-wide"
              >
                やめる
              </button>
            </div>
          </div>
        )}

        {/* 結果 */}
        {results && (
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="bg-warm-50 border border-warm-300 px-4 py-3 text-sm">
                <span className={r.ok ? 'text-ink' : 'text-red-500'}>
                  {r.orderNumber || '（受注不明）'}　{r.message}
                </span>
                {r.mailMessage && (
                  <span className="text-xs text-stone ml-3">{r.mailMessage}</span>
                )}
              </div>
            ))}
            <button
              onClick={() => {
                setResults(null)
                setError('')
              }}
              className="text-xs text-stone hover:text-champagne-dark tracking-wide pt-2"
            >
              続けて別のCSVを取り込む
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
