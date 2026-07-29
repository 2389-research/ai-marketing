'use client'

import { useState } from 'react'
import { type Draft } from '@/lib/supabase'
import { CH_COLOR, CHANNELS } from '@/lib/channels'
import { fmtScheduleTime } from '@/lib/timezone'
import ChannelIcon from '@/components/ChannelIcon'

const STATUS_LABEL: Record<string, { label: string; bg: string; text: string }> = {
  pending:    { label: 'In review', bg: '#FFFBEB', text: '#92400E' },
  approved:   { label: 'Approved',  bg: '#ECFDF5', text: '#065F46' },
  needs_edit: { label: 'Revise',    bg: '#FFF7ED', text: '#9A3412' },
  rejected:   { label: 'Rejected',  bg: '#FEF2F2', text: '#991B1B' },
}

const CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map(c => [c.id, c.label]))

const isVideo = (url: string) => /\.(mp4|mov|webm|avi)$/i.test(url)

// Full-content day panel: opened by clicking a calendar date — shows every
// post that day WITH its text and media visible, so you can see exactly what
// went (or is going) out without opening each draft one by one.
function DayPost({ draft, onOpen }: { draft: Draft; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const posted = !!draft.posted_at
  const color = CH_COLOR[draft.channel]
  const status = STATUS_LABEL[draft.status]
  const text = draft.draft_text ?? ''
  const long = text.length > 420
  const media = (draft.media ?? []) as string[]

  return (
    <div className="px-5 py-4">
      {/* header row */}
      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: color?.bg ?? '#f7f7f7', color: color?.text ?? '#3c3c3c' }}>
          <ChannelIcon channel={draft.channel} className="w-3 h-3" />
          {CHANNEL_LABEL[draft.channel] ?? draft.channel}
        </span>
        {posted ? (
          <span className="text-xs font-semibold text-[#16803d] bg-[#f0fdf4] px-2 py-0.5 rounded-full">✓ Posted</span>
        ) : (
          status && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: status.bg, color: status.text }}>
              {status.label}
            </span>
          )
        )}
        <span className="text-xs text-[#9a9a9a]">{fmtScheduleTime(draft.scheduled_for)}</span>
        <button
          onClick={onOpen}
          className="ml-auto text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] transition-colors shrink-0">
          Open →
        </button>
      </div>

      {/* topic + full text */}
      <p className="text-sm font-semibold text-[#262626] leading-snug mb-1.5">{draft.topic}</p>
      <p className="text-[13px] text-[#3c3c3c] leading-relaxed whitespace-pre-wrap">
        {expanded || !long ? text : text.slice(0, 420) + '…'}
      </p>
      {long && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-xs text-[#1800ad] hover:text-[#2f1ac9] font-medium mt-1 transition-colors">
          {expanded ? '↑ less' : '↓ show full post'}
        </button>
      )}

      {/* media */}
      {media.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-2.5">
          {media.map((url, i) =>
            isVideo(url) ? (
              <button
                key={i}
                onClick={() => window.open(url, '_blank', 'noopener')}
                className="w-14 h-14 bg-black/85 hover:bg-black rounded flex flex-col items-center justify-center gap-0.5 transition-colors"
                title="Open video">
                <span className="text-white text-sm leading-none">▶</span>
                <span className="text-[8px] text-white/80 uppercase tracking-wider">Video</span>
              </button>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt="" className="w-14 h-14 object-cover rounded border border-[#e6e6e6]" />
            ),
          )}
        </div>
      )}
    </div>
  )
}

export default function DayDetailModal({
  dateLabel, posts, onClose, onOpenDraft, onCreate,
}: {
  dateLabel: string
  posts: Draft[]
  onClose: () => void
  onOpenDraft: (d: Draft) => void
  onCreate?: () => void
}) {
  const sorted = [...posts].sort((a, b) =>
    new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime()
  )
  const postedCount = posts.filter(p => p.posted_at).length

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded border border-[#e6e6e6] w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#f7f7f7] shrink-0">
          <div>
            <p className="text-base font-bold text-[#262626]">{dateLabel}</p>
            <p className="text-xs text-[#9a9a9a]">
              {posts.length} post{posts.length !== 1 ? 's' : ''}
              {postedCount > 0 ? ` · ${postedCount} posted` : ''}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {onCreate && (
              <button
                onClick={onCreate}
                className="text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] transition-colors">
                + New post
              </button>
            )}
            <button onClick={onClose} className="text-[#9a9a9a] hover:text-[#262626] text-lg leading-none transition-colors">×</button>
          </div>
        </div>

        <div className="divide-y divide-[#f7f7f7] overflow-y-auto">
          {sorted.map(d => (
            <DayPost key={d.id} draft={d} onOpen={() => { onOpenDraft(d); onClose() }} />
          ))}
        </div>
      </div>
    </div>
  )
}
