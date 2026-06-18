'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Draft } from '@/lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── constants ─────────────────────────────────────────────────────────────────

const CH_BADGE: Record<string, string> = {
  linkedin:  'bg-blue-100 text-blue-800',
  instagram: 'bg-pink-100 text-pink-800',
  email:     'bg-amber-100 text-amber-800',
  tiktok:    'bg-cyan-100 text-cyan-800',
}

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-orange-100 text-orange-700',
  approved:   'bg-green-100 text-green-700',
  rejected:   'bg-red-100 text-red-700',
  needs_edit: 'bg-purple-100 text-purple-700',
}

const FILTERS = [
  { key: 'pending',    label: 'Pending'      },
  { key: 'needs_edit', label: 'Needs edit'   },
  { key: 'approved',   label: 'Approved'     },
  { key: 'rejected',   label: 'Rejected'     },
  { key: 'all',        label: 'All'          },
] as const

// ── draft card ────────────────────────────────────────────────────────────────

function DraftCard({ draft, onAction }: { draft: Draft; onAction: () => void }) {
  const [loading, setLoading]         = useState(false)
  const [expanded, setExpanded]       = useState(false)
  const [showEdit, setShowEdit]       = useState(false)
  const [feedback, setFeedback]       = useState('')
  const [actionDone, setActionDone]   = useState('')

  const act = async (endpoint: string, body?: object) => {
    setLoading(true)
    const res = await fetch(`/api/drafts/${draft.id}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    setLoading(false)
    if (res.ok) {
      if (endpoint === 'approve')     setActionDone('approved')
      if (endpoint === 'reject')      setActionDone('rejected')
      if (endpoint === 'needs-edit')  setActionDone('sent for edit')
      setTimeout(onAction, 600)
    }
  }

  const isActionable = draft.status === 'pending' || draft.status === 'needs_edit'
  const preview = draft.draft_text.slice(0, 220)
  const truncated = draft.draft_text.length > 220

  return (
    <div className={`bg-white rounded-2xl border shadow-sm transition-all ${
      actionDone ? 'opacity-40 scale-[0.99]' : 'border-gray-200'
    }`}>
      {/* card header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${CH_BADGE[draft.channel] ?? 'bg-gray-100 text-gray-700'}`}>
            {draft.channel.toUpperCase()}
          </span>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_BADGE[draft.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {draft.status.replace('_', ' ')}
          </span>
          {draft.qa_passed === true  && <span className="text-xs text-green-600 font-semibold">✓ QA</span>}
          {draft.qa_passed === false && <span className="text-xs text-red-500 font-semibold">✗ QA</span>}
          {draft.qa_passed === null  && <span className="text-xs text-gray-400">— QA</span>}
        </div>
        <span className="text-xs text-gray-400 shrink-0 mt-0.5">{fmtTime(draft.created_at)}</span>
      </div>

      {/* topic */}
      <div className="px-5 pb-3">
        <p className="text-sm font-semibold text-gray-900">{draft.topic}</p>
      </div>

      {/* content */}
      <div className="px-5 pb-3">
        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
          {expanded ? draft.draft_text : preview}
          {truncated && !expanded && '…'}
        </p>
        {truncated && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-blue-500 hover:underline mt-1">
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* QA issues */}
      {draft.qa_issues && draft.qa_issues.length > 0 && (
        <div className="mx-5 mb-3 bg-red-50 rounded-xl px-4 py-2.5">
          <p className="text-xs font-semibold text-red-600 mb-1">QA issues</p>
          {draft.qa_issues.map((issue, i) => (
            <p key={i} className="text-xs text-red-500">• {issue}</p>
          ))}
        </div>
      )}

      {/* footer row */}
      <div className="px-5 pb-4 flex flex-wrap items-center gap-4">
        {draft.scheduled_for && (
          <p className="text-xs text-gray-500">
            📅 {fmtTime(draft.scheduled_for)}
          </p>
        )}
        {draft.notes && (
          <p className="text-xs text-gray-400 italic flex-1 truncate">{draft.notes}</p>
        )}
      </div>

      {/* actions */}
      {isActionable && !actionDone && (
        <div className="border-t border-gray-100 px-5 py-3 flex flex-wrap gap-2">
          <button
            onClick={() => act('approve')}
            disabled={loading}
            className="px-4 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors">
            ✅ Approve
          </button>
          <button
            onClick={() => setShowEdit(e => !e)}
            disabled={loading}
            className="px-4 py-1.5 text-sm font-semibold bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-40 transition-colors">
            ✏️ Request edit
          </button>
          <button
            onClick={() => act('reject')}
            disabled={loading}
            className="px-4 py-1.5 text-sm font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 disabled:opacity-40 transition-colors">
            ❌ Reject
          </button>
        </div>
      )}

      {/* action done overlay */}
      {actionDone && (
        <div className="border-t border-gray-100 px-5 py-3">
          <p className="text-xs text-gray-500 font-medium">Marked as {actionDone} ✓</p>
        </div>
      )}

      {/* edit feedback box */}
      {showEdit && !actionDone && (
        <div className="border-t border-gray-100 px-5 py-4 bg-purple-50/40">
          <p className="text-xs font-semibold text-gray-600 mb-2">What needs to change?</p>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Be specific — the AI will use this to rewrite the post…"
            rows={3}
            className="w-full text-sm border border-purple-200 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => { act('needs-edit', { feedback }); setShowEdit(false) }}
              disabled={!feedback.trim() || loading}
              className="px-4 py-1.5 text-sm font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 transition-colors">
              Send feedback
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-800">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-3xl mb-3">📭</p>
      <p className="text-sm font-semibold text-gray-700">No {filter === 'all' ? '' : filter.replace('_', ' ')} drafts</p>
      <p className="text-xs text-gray-400 mt-1">
        {filter === 'pending'
          ? 'Run the Generate pipeline or write a post manually to create new drafts.'
          : 'Nothing here yet.'}
      </p>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function DraftsPage() {
  const [drafts, setDrafts]   = useState<Draft[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<string>('pending')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('generated_drafts')
      .select('*')
      .order('created_at', { ascending: false })
    setDrafts(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = f.key === 'all'
      ? drafts.length
      : drafts.filter(d => d.status === f.key).length
    return acc
  }, {})

  const visible = filter === 'all' ? drafts : drafts.filter(d => d.status === filter)

  return (
    <div className="px-8 py-8 max-w-3xl">

      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Drafts</h1>
          <p className="text-sm text-gray-400 mt-0.5">Review and approve generated content</p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors">
          ↻ Refresh
        </button>
      </div>

      {/* filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {f.label}
            {counts[f.key] > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                filter === f.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      ) : visible.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-4">
          {visible.map(d => (
            <DraftCard key={d.id} draft={d} onAction={load} />
          ))}
        </div>
      )}

    </div>
  )
}
