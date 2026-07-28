'use client'

import { useEffect, useState } from 'react'

// Sticky in-page section navigation for long settings pages (Brand). Pills
// anchor-scroll to sections (which carry matching ids + scroll-mt) and the
// active section is tracked with an IntersectionObserver so the nav always
// shows where you are.
export default function SectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        // Pick the top-most visible section — stable while scrolling.
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )
    for (const s of sections) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [sections])

  return (
    <nav className="sticky top-0 z-20 -mx-4 sm:-mx-5 lg:-mx-6 px-4 sm:px-5 lg:px-6 py-2.5 mb-8 bg-white/95 backdrop-blur border-b border-[#e6e6e6] overflow-x-auto">
      <div className="flex gap-1.5 whitespace-nowrap">
        {sections.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={e => {
              e.preventDefault()
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              active === s.id
                ? 'border-[#1c69d4] bg-[#1c69d4] text-white font-semibold'
                : 'border-[#e6e6e6] text-[#6b6b6b] hover:border-[#9a9a9a] hover:text-[#262626]'
            }`}>
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
