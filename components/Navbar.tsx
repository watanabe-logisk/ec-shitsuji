'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
  }

  const navLink = (href: string, label: string) => {
    const active = pathname.startsWith(href)
    return (
      <Link
        href={href}
        className={`text-xs tracking-widest uppercase transition-colors ${
          active ? 'text-champagne' : 'text-warm-400 hover:text-warm-50'
        }`}
      >
        {label}
      </Link>
    )
  }

  return (
    <nav className="bg-navy px-8 py-4 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <span className="text-xl leading-none">🐑</span>
        <span
          className="font-display text-warm-50 font-light tracking-[0.2em] text-lg"
        >
          EC執事
        </span>
      </Link>

      <div className="flex items-center gap-8">
        <Link
          href="/orders/new"
          className="border border-champagne text-champagne text-xs tracking-widest uppercase px-4 py-2 hover:bg-champagne hover:text-navy transition-colors"
        >
          + 受注登録
        </Link>
        {navLink('/orders', '受注一覧')}
        {navLink('/customers', '得意先')}
        <button
          onClick={handleLogout}
          className="text-xs tracking-widest text-warm-400 hover:text-warm-50 transition-colors uppercase"
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
