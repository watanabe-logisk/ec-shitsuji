'use client'

import { useState } from 'react'
import { ParsedEmail } from '@/types'

type Props = {
  onParsed: (data: ParsedEmail) => void
}

export default function EmailParser({ onParsed }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleParse() {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    const res = await fetch('/api/parse-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError('解析に失敗しました。')
    } else {
      onParsed(data)
      setText('')
    }
    setLoading(false)
  }

  return (
    <div className="border border-warm-300 bg-warm-50 p-5 mb-6">
      <p className="text-xs tracking-[0.2em] text-stone uppercase mb-3">
        メール・注文書から自動入力
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="住所・担当者名の部分をここにペーストしてください"
        className="w-full border border-warm-300 bg-warm-100 px-4 py-3 text-sm text-ink h-24 resize-none focus:outline-none focus:border-champagne transition-colors"
      />
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      <button
        onClick={handleParse}
        disabled={!text.trim() || loading}
        className="mt-3 border border-navy text-navy text-xs tracking-widest uppercase px-5 py-2 hover:bg-navy hover:text-warm-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {loading ? '解析中...' : '自動解析'}
      </button>
    </div>
  )
}
