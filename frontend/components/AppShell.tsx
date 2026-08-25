'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Logo from '@/components/Logo'
import CompanyBar from '@/components/CompanyBar'
import AccountMenu from '@/components/AccountMenu'

// Auth / onboarding pages render outside the app chrome entirely — no Sidebar,
// no nav, no gutter. Sidebar fires Supabase reads (company name, pending draft
// count) on mount, so it must never mount for someone who isn't in the app yet;
// middleware blocks navigation to real pages, but it can't stop a component
// that's part of an auth page's own render tree.
const STANDALONE_PREFIXES = ['/login', '/signin', '/signup', '/welcome', '/setup', '/join']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  // Close the mobile drawer whenever the route changes (tapping a nav link).
  useEffect(() => { setMenuOpen(false) }, [path])

  const standalone = STANDALONE_PREFIXES.some(p => path === p || path.startsWith(p + '/'))
  if (standalone) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen">
      {/* mobile top bar — only shown below md; gives phones a way to open the nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#1a2129] border-b border-[#262e38] flex items-center gap-3 px-4 z-20">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="text-white/80 hover:text-white p-1 -ml-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Logo />
      </div>

      {/* backdrop behind the drawer on mobile */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* desktop top bar: companies (left) + account/team (right). Spans the
          content area to the right of the 68px rail. */}
      <div className="hidden md:flex fixed top-0 left-[72px] right-0 h-12 z-20 items-center justify-between gap-4 px-4 bg-[var(--bmw-canvas)] border-b border-[var(--bmw-hairline)]">
        <CompanyBar />
        <AccountMenu />
      </div>

      {/* content: full width on mobile (with room for the mobile top bar);
          gutter + top bar on desktop. The hover-expanded sidebar overlays it. */}
      <main className="min-h-screen overflow-auto pt-14 md:pt-12 md:ml-[72px]">
        {children}
      </main>
    </div>
  )
}
