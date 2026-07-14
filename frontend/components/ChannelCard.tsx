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
    <div className="bg-white rounded-2xl border border-[#E4E9F2] shadow-[0_1px_2px_rgba(26,33,48,0.04),0_8px_20px_-14px_rgba(26,33,48,0.1)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <ChannelIcon channel={id} className="w-4 h-4 shrink-0" />
        <span
          className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: color.bg, color: color.text }}>
          {label.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Link href={`/drafts?channel=${id}&filter=pending`} className="group">
          <p className="font-bold text-xl text-[#1A2130] group-hover:text-[#3B5BFF] transition-colors tracking-tight">{pending}</p>
          <p className="font-mono text-[10px] text-[#94A3B8] uppercase tracking-wide">Pending</p>
        </Link>
        <Link href={`/drafts?channel=${id}&filter=approved`} className="group">
          <p className="font-bold text-xl text-[#1A2130] group-hover:text-[#3B5BFF] transition-colors tracking-tight">{approved}</p>
          <p className="font-mono text-[10px] text-[#94A3B8] uppercase tracking-wide">Approved</p>
        </Link>
      </div>

      {hasCadence ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-[#64748B] uppercase tracking-wide">This week</span>
            <span className={`font-mono text-xs ${scheduledThisWeek >= cadenceTarget! ? 'text-[#0EA5A0]' : 'text-[#64748B]'}`}>
              {scheduledThisWeek}/{cadenceTarget}
            </span>
          </div>
          <div className="h-1 bg-[#EEF1F4] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#0EA5A0' : color.dot }}
            />
          </div>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[#B4BECC] uppercase tracking-wide">
          {scheduledThisWeek} scheduled this week
        </p>
      )}
    </div>
  )
}
