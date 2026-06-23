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
    <aside className="fixed left-0 top-0 h-screen w-48 bg-white border-r border-stone-100 flex flex-col z-20">
      <div className="px-5 pt-6 pb-5">
        <p className="text-sm font-semibold text-gray-900 truncate leading-tight" title={displayName}>
          {displayName}
        </p>
        <p className="text-[11px] text-gray-400 mt-0.5 tracking-widest uppercase">Marketing</p>
      </div>

      <nav className="flex-1 px-2.5 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href)
          const showBadge = label === 'Drafts' && pending > 0
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'text-gray-900 font-semibold bg-stone-100'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-stone-50'
              }`}
            >
              <span>{label}</span>
              {showBadge && (
                <span className="text-[10px] font-bold bg-orange-100 text-orange-600 rounded-full px-1.5 py-0.5 leading-none">
                  {pending}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
