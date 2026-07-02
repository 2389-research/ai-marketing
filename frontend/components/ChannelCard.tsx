'use client'

import Link from 'next/link'

interface ChannelCardProps {
  id: string
  label: string
  color: { dot: string; bg: string; text: string }
  pending: number
  approved: number
  scheduledThisWeek: number
  cadenceTarget?: number
}

export default function ChannelCard({
  id, label, color, pending, approved, scheduledThisWeek, cadenceTarget,
}: ChannelCardProps) {
  const hasCadence = !!cadenceTarget && cadenceTarget > 0
  const pct        = hasCadence ? Math.min(100, Math.round((scheduledThisWeek / cadenceTarget!) * 100)) : 0

  return (
    <div className="bg-white rounded-xl border border-[#EBEBEB] p-4">
      <div className="flex items-center justify-between mb-3">
        <span
          className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: color.bg, color: color.text }}>
          {label.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Link href={`/drafts?channel=${id}&filter=pending`} className="group">
          <p className="text-xl font-bold text-[#09090B] group-hover:text-[#7C3AED] transition-colors tracking-tight">{pending}</p>
          <p className="font-mono text-[10px] text-[#A1A1AA] uppercase tracking-wide">Pending</p>
        </Link>
        <Link href={`/drafts?channel=${id}&filter=approved`} className="group">
          <p className="text-xl font-bold text-[#09090B] group-hover:text-[#7C3AED] transition-colors tracking-tight">{approved}</p>
          <p className="font-mono text-[10px] text-[#A1A1AA] uppercase tracking-wide">Approved</p>
        </Link>
      </div>

      {hasCadence ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-[#888880] uppercase tracking-wide">This week</span>
            <span className={`font-mono text-xs ${scheduledThisWeek >= cadenceTarget! ? 'text-[#10B981]' : 'text-[#888880]'}`}>
              {scheduledThisWeek}/{cadenceTarget}
            </span>
          </div>
          <div className="h-1 bg-[#F5F5F5] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#10B981' : color.dot }}
            />
          </div>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[#BBBBBB] uppercase tracking-wide">
          {scheduledThisWeek} scheduled this week
        </p>
      )}
    </div>
  )
}
