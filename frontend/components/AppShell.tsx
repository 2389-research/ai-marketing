'use client'

import { usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

// The login page renders outside the app chrome entirely — no Sidebar, no
// nav, no ml-56 gutter. Sidebar fires Supabase reads (company name, pending
// draft count) on mount, so it must never mount for an unauthenticated
// visitor; middleware already blocks navigation to real pages, but it can't
// stop a component that's part of the login page's own render tree.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()

  if (path === '/login') {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-h-screen overflow-auto ml-56">
        {children}
      </main>
    </div>
  )
}
