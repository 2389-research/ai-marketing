'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Logo from '@/components/Logo'

// The login page renders outside the app chrome entirely — no Sidebar, no
// nav, no ml-56 gutter. Sidebar fires Supabase reads (company name, pending
// draft count) on mount, so it must never mount for an unauthenticated
// visitor; middleware already blocks navigation to real pages, but it can't
// stop a component that's part of the login page's own render tree.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  // Desktop sidebar collapse — icon-only rail with just the logo. Persisted so
  // the choice survives reloads. Read in an effect (not lazy init) to avoid a
  // server/client hydration mismatch.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    if (localStorage.getItem('pq-sidebar-collapsed') === '1') setCollapsed(true)
  }, [])
  const toggleCollapsed = () => {
    setCollapsed(c => {
      localStorage.setItem('pq-sidebar-collapsed', c ? '0' : '1')
      return !c
    })
  }

  // Close the mobile drawer whenever the route changes (tapping a nav link).
  useEffect(() => { setMenuOpen(false) }, [path])

  if (path === '/login') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen">
      {/* mobile top bar — only shown below md; gives phones a way to open the nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#1a2129] border-b border-[#262e38] flex items-center gap-3 px-4 z-20">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="text-[#d5d5d5]/80 hover:text-[#d5d5d5] p-1 -ml-1"
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

      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />

      {/* content: full width on mobile (with room for the top bar); gutter on desktop */}
      <main className={`min-h-screen overflow-auto pt-14 md:pt-0 ${collapsed ? 'md:ml-[68px]' : 'md:ml-56'}`}>
        {children}
      </main>
    </div>
  )
}
