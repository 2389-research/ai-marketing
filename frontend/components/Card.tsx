'use client'

// Titled section card — the standard container for settings-style pages
// (Brand, QA Rules). A bold title + one-line explanation means every block
// announces what it is instead of blending into a wall of text.
export default function Card({ title, sub, children, danger = false, accent = false }: {
  title: string
  sub?: string
  children: React.ReactNode
  danger?: boolean
  accent?: boolean
}) {
  return (
    <section className={`bg-white border rounded p-5 ${
      danger ? 'border-[#F3B4C7]' : accent ? 'border-[#1c69d4]/40' : 'border-[#e6e6e6]'
    }`}>
      <h2 className={`text-[15px] font-bold ${danger ? 'text-[#B91C1C]' : 'text-[#262626]'}`}>{title}</h2>
      {sub ? <p className="text-xs text-[#6b6b6b] mt-0.5 mb-4">{sub}</p> : <div className="mb-4" />}
      {children}
    </section>
  )
}
