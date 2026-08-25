'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

// Top-right account + team menu. Only meaningful for real (Supabase) accounts;
// for legacy password-gate users there's no session, so it renders nothing.
export default function AccountMenu() {
  const supabase = createSupabaseBrowser()
  const [me, setMe] = useState<{ name: string; email: string } | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setMe({ name: (u.user_metadata?.full_name as string) || (u.email ?? '').split('@')[0], email: u.email ?? '' })
    })
  }, [supabase])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  if (!me) return null

  const initials = me.name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/signin'
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-[var(--bmw-surface-soft)] transition-colors">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--bmw-primary)] text-[11px] font-bold text-white" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>{initials}</span>
        <span className="hidden sm:block max-w-[140px] truncate text-[13px] font-semibold text-[var(--bmw-ink)]">{me.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-[var(--bmw-body)]"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl border border-[var(--bmw-hairline)] bg-[var(--bmw-canvas)] shadow-[0_12px_40px_-12px_rgba(20,18,40,.25)] py-2 z-50">
          <div className="px-4 py-2 border-b border-[var(--bmw-hairline)]">
            <p className="text-[13px] font-semibold text-[var(--bmw-ink)] truncate">{me.name}</p>
            <p className="text-[12px] text-[var(--bmw-body)] truncate">{me.email}</p>
          </div>
          <Link href="/team" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[var(--bmw-ink)] hover:bg-[var(--bmw-surface-soft)]">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="5" r="2.5"/><path d="M1.5 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M10 3.2a2.3 2.3 0 010 4.4"/><path d="M11 9.2c1.5.3 2.5 1.6 2.5 3.3"/></svg>
            Team
          </Link>
          <button onClick={signOut} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-[var(--bmw-ink)] hover:bg-[var(--bmw-surface-soft)]">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13H3a1 1 0 01-1-1V3a1 1 0 011-1h3"/><path d="M10 10l3-2.5L10 5"/><path d="M13 7.5H6"/></svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
