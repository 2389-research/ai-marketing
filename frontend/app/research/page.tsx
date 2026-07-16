'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase, type ResearchCandidate } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 2)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// Time-decay rank: score drops as content ages. Company content is evergreen (no decay).
function rankScore(c: ResearchCandidate, applyDecay: boolean): number {
  if (!applyDecay || c.source_category === 'company') return c.score
  const ageHours = (Date.now() - new Date(c.created_at).getTime()) / 3_600_000
  return c.score / Math.pow(ageHours + 2, 1.5)
}

// ── score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-0.5 bg-[#e6e6e6] overflow-hidden">
        <div className="h-full bg-[#1c69d4]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-[#6b6b6b] w-6 text-right">{score.toFixed(1)}</span>
    </div>
  )
}

// ── source label ──────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  company:   'BRAND',
  video:     'VIDEO',
  trend:     'TREND',
  article:   'ARTICLE',
  reddit:    'REDDIT',
  trendjack: 'TREND HOOK',
}

function SourceTag({ category }: { category: string | null }) {
  const label = SOURCE_LABEL[category ?? 'article'] ?? 'ARTICLE'
  return (
    <span className="text-xs text-[#6b6b6b] uppercase tracking-widest">{label}</span>
  )
}

// ── dismiss button ────────────────────────────────────────────────────────────

function DismissBtn({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onDismiss() }}
      title="Dismiss"
      className="shrink-0 text-xs text-[#CCCCCC] hover:text-[#262626] transition-colors leading-none px-1">
      ×
    </button>
  )
}

// ── video card ────────────────────────────────────────────────────────────────

function VideoCard({ candidate, rank, onDismiss }: { candidate: ResearchCandidate; rank: number; onDismiss: () => void }) {
  const meta = candidate.metadata
  return (
    <div className="bg-white border border-[#e6e6e6] rounded  flex overflow-hidden">
      {meta?.thumbnail ? (
        <img src={meta.thumbnail} alt={candidate.title} className="w-32 h-20 object-cover shrink-0" />
      ) : (
        <div className="w-32 h-20 bg-[#f7f7f7] shrink-0 flex items-center justify-center">
          <span className="text-xs text-[#9a9a9a]">VIDEO</span>
        </div>
      )}
      <div className="flex-1 min-w-0 px-4 py-3">
        <div className="flex items-start gap-2 mb-1.5">
          <span className="text-xs text-[#9a9a9a] shrink-0">#{rank}</span>
          <p className="text-sm font-semibold text-[#262626] leading-snug line-clamp-2">{candidate.title}</p>
          {candidate.selected && <span className="shrink-0 text-xs text-[#6b6b6b]">✓ used</span>}
          <DismissBtn onDismiss={onDismiss} />
        </div>
        <div className="flex items-center gap-3 mb-2">
          {meta?.channel && <span className="text-xs text-[#6b6b6b]">{meta.channel}</span>}
          {meta?.view_count != null && (
            <span className="text-xs text-[#6b6b6b]">{fmtViews(meta.view_count)} views</span>
          )}
          <span className="text-xs text-[#9a9a9a]">{timeAgo(candidate.created_at)}</span>
        </div>
        <ScoreBar score={candidate.score} />
        {candidate.score_reason && (
          <p className="text-xs text-[#6b6b6b] italic mt-1.5 line-clamp-1">{candidate.score_reason}</p>
        )}
        {candidate.source_url && (
          <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#6b6b6b] hover:text-[#262626] mt-1 inline-block transition-colors">
            Watch ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ── trend card ────────────────────────────────────────────────────────────────

function TrendCard({ candidate, rank, onDismiss }: { candidate: ResearchCandidate; rank: number; onDismiss: () => void }) {
  const meta = candidate.metadata
  const isRising = meta?.type === 'rising_query'

  return (
    <div className="bg-white border border-[#e6e6e6] rounded  px-5 py-4 flex items-center gap-4">
      <span className="text-xs text-[#9a9a9a] shrink-0 w-5">#{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-[#262626] truncate">{meta?.term ?? candidate.title}</p>
          {isRising && meta?.value && (
            <span className="text-xs text-[#6b6b6b] shrink-0">+{meta.value}%</span>
          )}
          {candidate.selected && <span className="text-xs text-[#6b6b6b] shrink-0">✓ used</span>}
        </div>
        {isRising && meta?.related_to && (
          <p className="text-xs text-[#6b6b6b] mb-1">Related to: {meta.related_to}</p>
        )}
        <ScoreBar score={candidate.score} />
        {candidate.score_reason && (
          <p className="text-xs text-[#6b6b6b] italic mt-1 line-clamp-1">{candidate.score_reason}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-[#9a9a9a]">{timeAgo(candidate.created_at)}</span>
        {candidate.source_url && (
          <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
            Explore ↗
          </a>
        )}
        <DismissBtn onDismiss={onDismiss} />
      </div>
    </div>
  )
}

// ── article card ──────────────────────────────────────────────────────────────

function ArticleCard({ candidate, rank, onDismiss }: { candidate: ResearchCandidate; rank: number; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white border border-[#e6e6e6] rounded  px-5 py-4">
      <div className="flex items-start gap-4">
        <span className="text-xs text-[#9a9a9a] shrink-0 w-5 mt-0.5">#{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-[#262626] leading-snug">{candidate.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              {candidate.selected && (
                <span className="text-xs text-[#6b6b6b]">✓ used in draft</span>
              )}
              <DismissBtn onDismiss={onDismiss} />
            </div>
          </div>
          <ScoreBar score={candidate.score} />
          {candidate.score_reason && (
            <p className="text-xs text-[#6b6b6b] italic my-2 leading-relaxed">{candidate.score_reason}</p>
          )}
          {candidate.summary && (
            <div className="mb-2">
              <p className={`text-xs text-[#3c3c3c] leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
                {candidate.summary}
              </p>
              {candidate.summary.length > 160 && (
                <button onClick={() => setExpanded(e => !e)}
                  className="text-xs text-[#6b6b6b] hover:text-[#262626] mt-0.5 transition-colors">
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SourceTag category={candidate.source_category} />
              <span className="text-xs text-[#9a9a9a]">{candidate.source}</span>
              <span className="text-xs text-[#9a9a9a]">{timeAgo(candidate.created_at)}</span>
            </div>
            {candidate.source_url && (
              <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#6b6b6b] hover:text-[#262626] shrink-0 transition-colors">
                Read ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── trend hook card ───────────────────────────────────────────────────────────

function TrendJackCard({ candidate, rank, onDismiss }: { candidate: ResearchCandidate; rank: number; onDismiss: () => void }) {
  const meta = candidate.metadata
  return (
    <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded  px-5 py-4">
      <div className="flex items-start gap-4">
        <span className="text-xs text-[#D97706] shrink-0 w-5 mt-0.5">#{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-[#D97706] uppercase tracking-widest">Trend Hook</span>
              {meta?.trend_topic && (
                <span className="text-xs text-[#92400E] bg-[#FEF3C7] px-2 py-0.5 rounded-full">
                  {meta.trend_topic}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {candidate.selected && <span className="text-xs text-[#6b6b6b]">✓ used</span>}
              <DismissBtn onDismiss={onDismiss} />
            </div>
          </div>
          <p className="text-sm font-semibold text-[#262626] leading-snug mb-2">{candidate.title}</p>
          {meta?.hook && (
            <p className="text-xs text-[#92400E] italic mb-2">"{meta.hook}"</p>
          )}
          {candidate.summary && (
            <p className="text-xs text-[#3c3c3c] leading-relaxed mb-2">{candidate.summary}</p>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#D97706]">
                strength {candidate.score.toFixed(0)}/10
              </span>
              <span className="text-xs text-[#9a9a9a]">{timeAgo(candidate.created_at)}</span>
            </div>
            {candidate.source_url && (
              <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#6b6b6b] hover:text-[#262626] shrink-0 transition-colors">
                See trend ↗
              </a>
            )}
          </div>
          {candidate.score_reason && (
            <p className="text-xs text-[#6b6b6b] italic mt-1.5">{candidate.score_reason}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-semibold text-[#262626] mb-1">No research data yet</p>
      <p className="text-sm text-[#6b6b6b] mb-6 max-w-xs">
        Run the AI pipeline to pull YouTube videos, Google Trends, news articles, and Reddit posts.
      </p>
      <Link href="/generate"
        className="px-5 py-2.5 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded transition-colors">
        Go to Generate
      </Link>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

type Pool   = 'trending' | 'pillars'
type Filter = 'all' | 'video' | 'trend' | 'article' | 'trendjack' | 'selected'

export default function ResearchPage() {
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([])
  const [loading, setLoading]       = useState(true)
  const [pool, setPool]             = useState<Pool>('trending')
  const [filter, setFilter]         = useState<Filter>('all')
  const [decay, setDecay]           = useState(true)   // time-decay sort toggle
  const [clearing, setClearing]     = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [scraping, setScraping]     = useState(false)
  const [scrapeMsg, setScrapeMsg]   = useState('')
  const [scrapeElapsed, setScrapeElapsed] = useState(0)

  useEffect(() => {
    if (!scraping) { setScrapeElapsed(0); return }
    const t = setInterval(() => setScrapeElapsed(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [scraping])

  const load = useCallback(async () => {
    setLoading(true)
    const pid = await resolveActiveProjectClient()
    const { data } = await scoped(supabase.from('research_candidates').select('*'), pid)
      .order('created_at', { ascending: false })
    setCandidates(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleClearClick = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => setConfirmClear(false), 4000)
      return
    }
    setClearing(true)
    setConfirmClear(false)
    await fetch('/api/research/clear', { method: 'DELETE' })
    setCandidates([])
    setClearing(false)
  }

  const handleDismiss = async (id: string) => {
    await supabase.from('research_candidates').delete().eq('id', id)
    setCandidates(prev => prev.filter(c => c.id !== id))
  }

  const handleScrape = async () => {
    setScraping(true)
    setScrapeMsg('')
    const res  = await fetch('/api/research/scrape', { method: 'POST' })
    const json = await res.json().catch(() => ({}))
    setScraping(false)
    if (res.ok) {
      setScrapeMsg(`${json.count} item${json.count !== 1 ? 's' : ''} found`)
      load()
    } else {
      setScrapeMsg('Scrape failed — check website URL in Brand settings')
    }
    setTimeout(() => setScrapeMsg(''), 5000)
  }

  // Split into two pools
  const trending = candidates.filter(c => c.source_category !== 'company')
  const pillars  = candidates.filter(c => c.source_category === 'company')

  const poolItems = pool === 'trending' ? trending : pillars

  const filtered = filter === 'selected'
    ? poolItems.filter(c => c.selected)
    : filter === 'all'
    ? poolItems
    : poolItems.filter(c => c.source_category === filter)

  const visible = [...filtered].sort(
    (a, b) => rankScore(b, decay) - rankScore(a, decay)
  )

  const count = (f: Filter) => {
    const base = pool === 'trending' ? trending : pillars
    if (f === 'selected') return base.filter(c => c.selected).length
    if (f === 'all')      return base.length
    return base.filter(c => c.source_category === f).length
  }

  const videoCount      = count('video')
  const trendCount      = count('trend')
  const articleCount    = trending.filter(c => c.source_category === 'article' || c.source_category === 'reddit').length
  const trendjackCount  = count('trendjack')
  const selectedCount   = count('selected')

  const lastRun = candidates.length
    ? candidates.reduce((max, c) => c.created_at > max ? c.created_at : max, candidates[0].created_at)
    : null

  const TRENDING_FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: 'all',       label: 'All',        n: count('all')   },
    { key: 'trendjack', label: 'Trend Hooks', n: trendjackCount },
    { key: 'video',     label: 'Videos',      n: videoCount     },
    { key: 'trend',     label: 'Trends',      n: trendCount     },
    { key: 'article',   label: 'Articles',    n: articleCount   },
    { key: 'selected',  label: 'Used',        n: selectedCount  },
  ]

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-8 lg:py-10 max-w-4xl w-full mx-auto">

      {/* header */}
      <div className="flex items-baseline justify-between mb-6 pb-6 border-b border-[#e6e6e6]">
        <div className="flex-1">
          <div className="flex items-baseline justify-between mb-1">
            <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Research</h1>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={() => { setLoading(true); load() }}
                className="text-xs text-[#9a9a9a] hover:text-[#262626] transition-colors">
                ↻
              </button>
              <button
                onClick={handleScrape}
                disabled={scraping}
                className="text-xs text-[#6b6b6b] border border-[#e6e6e6] hover:border-[#1c69d4] hover:text-[#262626] px-3 py-1.5 transition-colors disabled:opacity-40 rounded flex items-center gap-1.5">
                {scraping ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-[#D1D5DB] border-t-[#1c69d4] rounded-full shrink-0" />
                    {scrapeElapsed < 8  ? 'Fetching pages…' :
                     scrapeElapsed < 20 ? 'Reading content…' :
                     scrapeElapsed < 35 ? 'Scoring relevance…' : 'Almost done…'}
                    <span className="text-[#9a9a9a]">{scrapeElapsed}s</span>
                  </>
                ) : 'Scrape website'}
              </button>
              {candidates.length > 0 && (
                <button
                  onClick={handleClearClick}
                  disabled={clearing}
                  className={`text-xs px-3 py-1.5 border transition-colors disabled:opacity-40 rounded ${
                    confirmClear
                      ? 'bg-[#1c69d4] text-white border-[#1c69d4]'
                      : 'text-[#6b6b6b] border-[#e6e6e6] hover:border-[#1c69d4] hover:text-[#262626]'
                  }`}>
                  {clearing ? 'Clearing…' : confirmClear ? 'Confirm clear all?' : 'Clear all'}
                </button>
              )}
            </div>
          </div>
          <p className="text-[13.5px] text-[#6b6b6b] mt-1">
            News, YouTube, Google Trends, Reddit — deduplicated and scored by brand relevance
          </p>
          {candidates.length > 0 && (
            <p className="text-xs text-[#9a9a9a] mt-1">
              {trending.length} trending · {pillars.length} brand pillars
              {lastRun && ` · updated ${timeAgo(lastRun)}`}
            </p>
          )}
          {scrapeMsg && (
            <p className="text-xs text-[#6b6b6b] mt-1">{scrapeMsg}</p>
          )}
        </div>
      </div>

      {/* pool toggle: Trending Now / Brand Pillars */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 p-1 bg-[#f7f7f7] rounded">
          {([
            { key: 'trending' as Pool, label: 'Trending Now', count: trending.length },
            { key: 'pillars'  as Pool, label: 'Brand Pillars', count: pillars.length  },
          ]).map(p => (
            <button
              key={p.key}
              onClick={() => { setPool(p.key); setFilter('all') }}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                pool === p.key
                  ? 'bg-white text-[#262626] '
                  : 'text-[#6b6b6b] hover:text-[#262626]'
              }`}>
              {p.label}
              {p.count > 0 && (
                <span className={`text-xs ${pool === p.key ? 'text-[#1c69d4]' : 'text-[#9a9a9a]'}`}>
                  {p.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* sort toggle — only relevant for trending */}
        {pool === 'trending' && (
          <button
            onClick={() => setDecay(d => !d)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              decay
                ? 'bg-[#f7f7f7] text-[#1c69d4] border-[#1c69d4]'
                : 'text-[#6b6b6b] border-[#e6e6e6] hover:border-[#1c69d4]'
            }`}>
            {decay ? '⟳ Fresh + Relevant' : '⟳ Relevance only'}
          </button>
        )}
      </div>

      {/* sub-filters (trending pool only) */}
      {pool === 'trending' && !loading && trending.length > 0 && (
        <div className="flex gap-0 border-b border-[#e6e6e6] mb-6">
          {TRENDING_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                filter === f.key
                  ? 'border-[#1c69d4] text-[#1c69d4] font-semibold'
                  : 'border-transparent text-[#6b6b6b] hover:text-[#262626]'
              }`}>
              {f.label}
              {f.n > 0 && (
                <span className={`text-xs ${filter === f.key ? 'text-[#1c69d4]' : 'text-[#9a9a9a]'}`}>
                  {f.n}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* brand pillars header */}
      {pool === 'pillars' && !loading && pillars.length > 0 && (
        <div className="mb-6 p-4 bg-[#f7f7f7] border border-[#f7f7f7] rounded">
          <p className="text-sm text-[#1c69d4] font-semibold mb-0.5">Your evergreen content</p>
          <p className="text-xs text-[#6b6b6b]">
            Scraped from your website every 3 days. These don't expire — they're your brand's core stories.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-xs text-[#9a9a9a]">Loading…</p>
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <p className="text-sm text-[#6b6b6b] py-8 text-center">Nothing here yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((c, i) => {
            const cat     = c.source_category
            const dismiss = () => handleDismiss(c.id)
            if (cat === 'video')
              return <VideoCard     key={c.id} candidate={c} rank={i + 1} onDismiss={dismiss} />
            if (cat === 'trend')
              return <TrendCard     key={c.id} candidate={c} rank={i + 1} onDismiss={dismiss} />
            if (cat === 'trendjack')
              return <TrendJackCard key={c.id} candidate={c} rank={i + 1} onDismiss={dismiss} />
            return   <ArticleCard   key={c.id} candidate={c} rank={i + 1} onDismiss={dismiss} />
          })}
        </div>
      )}

    </div>
  )
}
