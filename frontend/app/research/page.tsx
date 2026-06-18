'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase, type ResearchCandidate } from '@/lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K views`
  return `${n} views`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ScoreBar({ score }: { score: number }) {
  const pct   = Math.round((score / 10) * 100)
  const color = score >= 7.5 ? 'bg-green-500' : score >= 5 ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-6 text-right">{score.toFixed(1)}</span>
    </div>
  )
}

// ── source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ category }: { category: string | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    video:   { label: '▶ Video',   cls: 'bg-red-100 text-red-700' },
    trend:   { label: '↗ Trend',   cls: 'bg-purple-100 text-purple-700' },
    article: { label: '📰 Article', cls: 'bg-blue-100 text-blue-700' },
    reddit:  { label: '◈ Reddit',  cls: 'bg-orange-100 text-orange-700' },
  }
  const c = cfg[category ?? 'article'] ?? cfg.article
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${c.cls}`}>
      {c.label}
    </span>
  )
}

// ── YouTube card ──────────────────────────────────────────────────────────────

function VideoCard({ candidate, rank }: { candidate: ResearchCandidate; rank: number }) {
  const meta = candidate.metadata
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex">
      {/* thumbnail */}
      {meta?.thumbnail ? (
        <img
          src={meta.thumbnail}
          alt={candidate.title}
          className="w-36 h-24 object-cover shrink-0"
        />
      ) : (
        <div className="w-36 h-24 bg-gray-100 shrink-0 flex items-center justify-center text-2xl">▶</div>
      )}

      {/* content */}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-start gap-2 mb-1.5">
          <span className="text-xs font-bold text-gray-300 shrink-0">#{rank}</span>
          <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{candidate.title}</p>
          {candidate.selected && (
            <span className="shrink-0 text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">✓</span>
          )}
        </div>

        <div className="flex items-center gap-3 mb-2">
          {meta?.channel && <span className="text-xs text-gray-500">{meta.channel}</span>}
          {meta?.view_count != null && <span className="text-xs font-medium text-gray-600">{fmtViews(meta.view_count)}</span>}
          {meta?.like_count != null && meta.like_count > 0 && <span className="text-xs text-gray-400">{(meta.like_count / 1000).toFixed(1)}K likes</span>}
        </div>

        <ScoreBar score={candidate.score} />

        {candidate.score_reason && (
          <p className="text-xs text-gray-500 italic mt-1.5 line-clamp-1">{candidate.score_reason}</p>
        )}

        {candidate.source_url && (
          <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline mt-1 inline-block">
            Watch ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ── trend card ────────────────────────────────────────────────────────────────

function TrendCard({ candidate, rank }: { candidate: ResearchCandidate; rank: number }) {
  const meta = candidate.metadata
  const isRising = meta?.type === 'rising_query'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
      <span className="text-xs font-bold text-gray-300 shrink-0 w-5">#{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-gray-900 truncate">{meta?.term ?? candidate.title}</p>
          {isRising && meta?.value && (
            <span className="text-xs font-bold text-purple-600 shrink-0">+{meta.value}%</span>
          )}
          {candidate.selected && (
            <span className="text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full shrink-0">✓</span>
          )}
        </div>
        {isRising && meta?.related_to && (
          <p className="text-xs text-gray-400 mb-1">Related to: {meta.related_to}</p>
        )}
        <ScoreBar score={candidate.score} />
        {candidate.score_reason && (
          <p className="text-xs text-gray-500 italic mt-1 line-clamp-1">{candidate.score_reason}</p>
        )}
      </div>
      {candidate.source_url && (
        <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline shrink-0">
          Explore ↗
        </a>
      )}
    </div>
  )
}

// ── article card ──────────────────────────────────────────────────────────────

function ArticleCard({ candidate, rank }: { candidate: ResearchCandidate; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-start gap-4">
        <span className="text-sm font-bold text-gray-300 w-6 shrink-0 mt-0.5">#{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-gray-900 leading-snug">{candidate.title}</p>
            {candidate.selected && (
              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">✓ selected</span>
            )}
          </div>
          <ScoreBar score={candidate.score} />
          {candidate.score_reason && (
            <p className="text-xs text-gray-500 italic my-2 leading-relaxed">{candidate.score_reason}</p>
          )}
          {candidate.summary && (
            <div className="mb-2">
              <p className={`text-xs text-gray-600 leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
                {candidate.summary}
              </p>
              {candidate.summary.length > 160 && (
                <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-500 hover:underline mt-0.5">
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SourceBadge category={candidate.source_category} />
              <span className="text-xs text-gray-400">{candidate.source}</span>
              <span className="text-xs text-gray-400">{fmtDate(candidate.created_at)}</span>
            </div>
            {candidate.source_url && (
              <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
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
      <p className="text-sm font-semibold text-gray-700 mb-1">No research data yet</p>
      <p className="text-xs text-gray-400 mb-6 max-w-xs">
        Run the AI pipeline to pull trending YouTube videos, Google Trends, RSS articles, and Reddit posts.
      </p>
      <Link href="/generate"
        className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
        ⚡ Go to Generate
      </Link>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'video' | 'trend' | 'article' | 'reddit' | 'selected'

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

  const count = (f: Filter) => {
    if (f === 'all')      return candidates.length
    if (f === 'selected') return candidates.filter(c => c.selected).length
    return candidates.filter(c => c.source_category === f).length
  }

  const visible: ResearchCandidate[] = filter === 'all' ? candidates
    : filter === 'selected' ? candidates.filter(c => c.selected)
    : candidates.filter(c => c.source_category === filter)

  const avgScore = candidates.length
    ? (candidates.reduce((s, c) => s + c.score, 0) / candidates.length).toFixed(1)
    : '—'

  const videoCount   = count('video')
  const trendCount   = count('trend')
  const articleCount = count('article') + count('reddit')

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',      label: 'All'      },
    { key: 'video',    label: '▶ Videos'  },
    { key: 'trend',    label: '↗ Trends'  },
    { key: 'article',  label: '📰 Articles' },
    { key: 'selected', label: '✓ Selected' },
  ]

  return (
    <div className="px-8 py-8 max-w-3xl">

      {/* header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Research</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            YouTube videos, Google Trends, RSS articles and Reddit — scored by brand relevance
          </p>
        </div>
        <button onClick={() => { setLoading(true); load() }}
          className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-white transition-colors">
          ↻ Refresh
        </button>
      </div>

      {!loading && candidates.length > 0 && (
        <>
          {/* stats row */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { value: candidates.length, label: 'Total' },
              { value: videoCount,        label: 'Videos' },
              { value: trendCount,        label: 'Trends' },
              { value: avgScore,          label: 'Avg score' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit flex-wrap">
            {FILTERS.map(f => {
              const n = count(f.key)
              return (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filter === f.key
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {f.label}
                  {n > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      filter === f.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-500'
                    }`}>{n}</span>
                  )}
                </button>
              )
            })}
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
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Nothing in this category yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((c, i) => {
            const cat = c.source_category
            if (cat === 'video')
              return <VideoCard   key={c.id} candidate={c} rank={i + 1} />
            if (cat === 'trend')
              return <TrendCard   key={c.id} candidate={c} rank={i + 1} />
            return   <ArticleCard key={c.id} candidate={c} rank={i + 1} />
          })}
        </div>
      )}

    </div>
  )
}
