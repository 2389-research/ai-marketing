'use client'

import Link from 'next/link'
import ChannelIcon from '@/components/ChannelIcon'

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
    <div className="bg-white rounded border border-[#e6e6e6] p-4">
      <div className="flex items-center gap-2 mb-3">
        <ChannelIcon channel={id} className="w-4 h-4 shrink-0" />
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: color.bg, color: color.text }}>
          {label.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Link href={`/drafts?channel=${id}&filter=pending`} className="group">
          <p className="font-bold text-xl text-[#262626] group-hover:text-[#1c69d4] transition-colors tracking-tight">{pending}</p>
          <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wide">Pending</p>
        </Link>
        <Link href={`/drafts?channel=${id}&filter=approved`} className="group">
          <p className="font-bold text-xl text-[#262626] group-hover:text-[#1c69d4] transition-colors tracking-tight">{approved}</p>
          <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wide">Approved</p>
        </Link>
      </div>

      {hasCadence ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#3c3c3c] uppercase tracking-wide">This week</span>
            <span className={`text-xs ${scheduledThisWeek >= cadenceTarget! ? 'text-[#22c55e]' : 'text-[#3c3c3c]'}`}>
              {scheduledThisWeek}/{cadenceTarget}
            </span>
          </div>
          <div className="h-1 bg-[#f7f7f7] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#22c55e' : color.dot }}
            />
          </div>
        </div>
      ) : (
        <p className="text-[10px] text-[#9a9a9a] uppercase tracking-wide">
          {scheduledThisWeek} scheduled this week
        </p>
      )}
    </div>
  )
}
