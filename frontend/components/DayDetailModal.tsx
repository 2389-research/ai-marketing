'use client'

import { type Draft } from '@/lib/supabase'
import { CH_COLOR } from '@/lib/channels'
import ChannelIcon from '@/components/ChannelIcon'

const STATUS_DOT: Record<string, string> = {
  pending:     '#3c3c3c',
  needs_edit:  '#dc2626',
  approved:    '#22c55e',
  published:   '#22c55e',
  rejected:    '#9a9a9a',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function DayDetailModal({
  dateLabel, posts, onClose, onOpenDraft,
}: {
  dateLabel: string
  posts: Draft[]
  onClose: () => void
  onOpenDraft: (d: Draft) => void
}) {
  const sorted = [...posts].sort((a, b) =>
    new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime()
  )

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded border border-[#e6e6e6] w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f7f7f7]">
          <div>
            <p className="text-base font-semibold text-[#262626]">{dateLabel}</p>
            <p className="text-xs text-[#9a9a9a]">{posts.length} scheduled</p>
          </div>
          <button onClick={onClose} className="text-[#9a9a9a] hover:text-[#262626] text-lg leading-none transition-colors">×</button>
        </div>

        <div className="divide-y divide-[#f7f7f7]">
          {sorted.map(d => (
            <button
              key={d.id}
              onClick={() => { onOpenDraft(d); onClose() }}
              className="w-full text-left flex items-center gap-3 px-5 py-3 hover:bg-[#fafafa] transition-colors"
            >
              <span className="text-xs text-[#9a9a9a] shrink-0 w-11">{fmtTime(d.scheduled_for!)}</span>
              <span
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ backgroundColor: CH_COLOR[d.channel]?.bg ?? '#f7f7f7' }}
              >
                <ChannelIcon channel={d.channel} className="w-3 h-3" />
              </span>
              <p className="text-sm text-[#262626] flex-1 truncate">{d.topic}</p>
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: STATUS_DOT[d.status] ?? '#9a9a9a' }}
                title={d.status}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
