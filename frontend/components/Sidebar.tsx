'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const MAIN_NAV = [
  { href: '/',         label: 'Dashboard' },
  { href: '/drafts',   label: 'Drafts'    },
  { href: '/research', label: 'Research'  },
  { href: '/write',    label: 'Write'     },
]

const BOTTOM_NAV = [
  { href: '/brand', label: 'Brand' },
  { href: '/audit', label: 'Audit' },
]

export default function Sidebar() {
  const path = usePathname()
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    supabase
      .from('brand_profile')
      .select('company_name')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.company_name) setCompanyName(data.company_name)
      })

    supabase
      .from('generated_drafts')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'needs_edit'])
      .then(({ count }) => setPending(count ?? 0))
  }, [])

  const displayName = companyName ?? 'My Company'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <aside className="fixed left-0 top-0 h-screen bg-white border-r border-[#E5E7EB] flex flex-col z-20 w-52">

      {/* header */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 overflow-hidden">
        <span className="w-7 h-7 rounded-lg bg-[#7C3AED] flex items-center justify-center text-white text-sm font-bold shrink-0">
          {initial}
        </span>
        <p className="text-[14px] font-semibold text-[#111827] truncate leading-tight" title={displayName}>
          {displayName}
        </p>
      </div>

      {/* generate button */}
      <div className="px-3 pb-4">
        <Link
          href="/generate"
          className="block w-full text-center bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        >
          Generate
        </Link>
      </div>

      {/* main nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {MAIN_NAV.map(({ href, label }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          const showPending = label === 'Drafts' && pending > 0
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-3 py-2 text-sm transition-colors rounded-lg ${
                active
                  ? 'bg-[#EDE9FE] text-[#7C3AED] font-semibold'
                  : 'text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]'
              }`}
            >
              <span>{label}</span>
              {showPending && (
                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  active
                    ? 'bg-[#7C3AED] text-white'
                    : 'bg-[#EDE9FE] text-[#7C3AED]'
                }`}>
                  {pending}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* bottom nav */}
      <div className="px-3 pb-5 pt-3 border-t border-[#E5E7EB] space-y-0.5">
        {BOTTOM_NAV.map(({ href, label }) => {
          const active = path.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center px-3 py-2 text-sm transition-colors rounded-lg ${
                active
                  ? 'bg-[#EDE9FE] text-[#7C3AED] font-semibold'
                  : 'text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#111827]'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
