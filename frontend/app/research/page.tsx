'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase, type ResearchCandidate } from '@/lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100)
  const color =
    score >= 7.5 ? 'bg-green-500' :
    score >= 5   ? 'bg-amber-400' :
                   'bg-gray-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-6 text-right">{score.toFixed(1)}</span>
    </div>
  )
}

// ── candidate card ────────────────────────────────────────────────────────────

function CandidateCard({ candidate, rank }: { candidate: ResearchCandidate; rank: number }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
      candidate.selected ? 'border-green-200' : 'border-gray-200'
    }`}>
      <div className="flex items-start gap-4">

        {/* rank */}
        <span className="text-sm font-bold text-gray-300 w-6 shrink-0 mt-0.5">
          #{rank}
        </span>

        {/* main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-gray-900 leading-snug">{candidate.title}</p>
            {candidate.selected && (
              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                ✓ selected
              </span>
            )}
          </div>

          {/* score bar */}
          <div className="mb-3">
            <ScoreBar score={candidate.score} />
          </div>

          {/* score reason */}
          {candidate.score_reason && (
            <p className="text-xs text-gray-500 italic mb-3 leading-relaxed">
              {candidate.score_reason}
            </p>
          )}

          {/* summary */}
          {candidate.summary && (
            <div className="mb-3">
              <p className={`text-xs text-gray-600 leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
                {candidate.summary}
              </p>
              {candidate.summary.length > 160 && (
                <button
                  onClick={() => setExpanded(e => !e)}
                  className="text-xs text-blue-500 hover:underline mt-0.5">
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}

          {/* footer */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                {candidate.source}
              </span>
              <span className="text-xs text-gray-400">{fmtDate(candidate.created_at)}</span>
            </div>
            {candidate.source_url && (
              <a
                href={candidate.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline shrink-0">
                Read ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-4xl mb-4">🔬</p>
      <p className="text-sm font-semibold text-gray-700 mb-1">No research candidates yet</p>
      <p className="text-xs text-gray-400 mb-6 max-w-xs">
        Run the AI pipeline to fetch and score the latest content from RSS feeds and tech publications.
      </p>
      <Link
        href="/generate"
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
        ⚡ Go to Generate
      </Link>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'selected' | 'not_selected'

export default function ResearchPage() {
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<Filter>('all')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('research_candidates')
      .select('*')
      .order('score', { ascending: false })
    setCandidates(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const selectedCount    = candidates.filter(c => c.selected).length
  const notSelectedCount = candidates.length - selectedCount

  const visible =
    filter === 'selected'     ? candidates.filter(c => c.selected) :
    filter === 'not_selected' ? candidates.filter(c => !c.selected) :
    candidates

  const avgScore = candidates.length
    ? (candidates.reduce((s, c) => s + c.score, 0) / candidates.length).toFixed(1)
    : '—'

  const topSource = (() => {
    if (!candidates.length) return '—'
    const counts: Record<string, number> = {}
    candidates.forEach(c => { counts[c.source] = (counts[c.source] ?? 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  })()

  return (
    <div className="px-8 py-8 max-w-3xl">

      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Research</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Candidates from the last AI research run, scored by brand relevance + engagement potential
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); load() }}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors">
          ↻ Refresh
        </button>
      </div>

      {!loading && candidates.length > 0 && (
        <>
          {/* stats row */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
              <p className="text-2xl font-bold text-gray-900">{candidates.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Candidates</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
              <p className="text-2xl font-bold text-gray-900">{avgScore}</p>
              <p className="text-xs text-gray-500 mt-0.5">Avg score</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4">
              <p className="text-2xl font-bold text-gray-900 truncate">{topSource}</p>
              <p className="text-xs text-gray-500 mt-0.5">Top source</p>
            </div>
          </div>

          {/* filter tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
            {([
              { key: 'all',          label: 'All',          count: candidates.length },
              { key: 'selected',     label: 'Selected',     count: selectedCount     },
              { key: 'not_selected', label: 'Not selected', count: notSelectedCount  },
            ] as { key: Filter; label: string; count: number }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {f.label}
                {f.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    filter === f.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-500'
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {/* content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {visible.map((c, i) => (
            <CandidateCard key={c.id} candidate={c} rank={i + 1} />
          ))}
        </div>
      )}

    </div>
  )
}
