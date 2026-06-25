'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/',         label: 'Dashboard' },
  { href: '/brand',    label: 'Brand'     },
  { href: '/generate', label: 'Generate'  },
  { href: '/drafts',   label: 'Drafts'    },
  { href: '/write',    label: 'Write'     },
  { href: '/research', label: 'Research'  },
  { href: '/audit',    label: 'Audit'     },
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

  return (
    <aside className="fixed left-0 top-0 h-screen bg-[#F5F4F1] border-r border-[#E2E1DE] flex flex-col z-20 w-48">

      {/* header */}
      <div className="px-5 pt-6 pb-5 border-b border-[#E2E1DE] overflow-hidden">
        <p className="text-[15px] font-semibold text-[#111111] truncate leading-tight" title={displayName}>
          {displayName}
        </p>
        <p className="font-mono text-xs text-[#BBBBBB] mt-1 tracking-widest uppercase">
          Marketing
        </p>
      </div>

      {/* nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          const showPending = label === 'Drafts' && pending > 0
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-2.5 py-2.5 text-[15px] transition-colors rounded-sm ${
                active
                  ? 'text-[#111111] font-semibold bg-[#ECEAE6]'
                  : 'text-[#888880] hover:text-[#111111] hover:bg-[#ECEAE6]'
              }`}
            >
              <span>{label}</span>
              {showPending && (
                <span className="font-mono text-xs text-[#888880]">{pending}</span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
