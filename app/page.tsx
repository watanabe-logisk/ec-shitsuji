'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/dashboard')
    } else {
      setError('パスワードが違います')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#FAFAF6' }}>
      {/* ヒーロー画像 */}
      <div className="flex justify-center pt-10 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/butler.png"
          alt="EC執事"
          style={{ maxWidth: '260px', width: '55%', display: 'block' }}
        />
      </div>

      {/* ログインフォーム */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="bg-warm-50 border border-warm-300 shadow-sm p-8">
            <div className="text-center mb-6">
              <div className="border-t border-champagne w-8 mx-auto mb-4" />
              <p className="text-xs tracking-[0.25em] text-stone uppercase">ログイン</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs tracking-widest text-stone uppercase mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-warm-300 bg-warm-100 px-4 py-3 text-ink text-sm focus:outline-none focus:border-champagne-dark transition-colors"
                  required
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs text-center tracking-wide">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-navy text-warm-50 py-3 text-xs tracking-widest uppercase font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loading ? '...' : 'ログイン'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
