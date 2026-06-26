'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase, type ResearchCandidate } from '@/lib/supabase'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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

// ── score bar — monochrome ────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round((score / 10) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-0.5 bg-[#E5E7EB] overflow-hidden">
        <div className="h-full bg-[#7C3AED]" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-[#888880] w-6 text-right">{score.toFixed(1)}</span>
    </div>
  )
}

// ── source label — text only ──────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  company: 'COMPANY',
  video:   'VIDEO',
  trend:   'TREND',
  article: 'ARTICLE',
  reddit:  'REDDIT',
}

function SourceTag({ category }: { category: string | null }) {
  const label = SOURCE_LABEL[category ?? 'article'] ?? 'ARTICLE'
  return (
    <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest">{label}</span>
  )
}

// ── dismiss button ────────────────────────────────────────────────────────────

function DismissBtn({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onDismiss() }}
      title="Dismiss from research pool"
      className="shrink-0 font-mono text-xs text-[#CCCCCC] hover:text-[#111111] transition-colors leading-none px-1">
      ×
    </button>
  )
}

// ── video card ────────────────────────────────────────────────────────────────

function VideoCard({ candidate, rank, onDismiss }: { candidate: ResearchCandidate; rank: number; onDismiss: () => void }) {
  const meta = candidate.metadata
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm flex overflow-hidden">
      {meta?.thumbnail ? (
        <img src={meta.thumbnail} alt={candidate.title} className="w-32 h-20 object-cover shrink-0" />
      ) : (
        <div className="w-32 h-20 bg-[#F3F4F6] shrink-0 flex items-center justify-center">
          <span className="font-mono text-xs text-[#BBBBBB]">VIDEO</span>
        </div>
      )}
      <div className="flex-1 min-w-0 px-4 py-3">
        <div className="flex items-start gap-2 mb-1.5">
          <span className="font-mono text-xs text-[#BBBBBB] shrink-0">#{rank}</span>
          <p className="text-sm font-semibold text-[#111111] leading-snug line-clamp-2">{candidate.title}</p>
          {candidate.selected && <span className="shrink-0 font-mono text-xs text-[#888880]">✓ used</span>}
          <DismissBtn onDismiss={onDismiss} />
        </div>
        <div className="flex items-center gap-3 mb-2">
          {meta?.channel && <span className="text-xs text-[#888880]">{meta.channel}</span>}
          {meta?.view_count != null && (
            <span className="font-mono text-xs text-[#888880]">{fmtViews(meta.view_count)} views</span>
          )}
        </div>
        <ScoreBar score={candidate.score} />
        {candidate.score_reason && (
          <p className="text-xs text-[#888880] italic mt-1.5 line-clamp-1">{candidate.score_reason}</p>
        )}
        {candidate.source_url && (
          <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#888880] hover:text-[#111111] mt-1 inline-block transition-colors">
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
    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm px-5 py-4 flex items-center gap-4">
      <span className="font-mono text-xs text-[#BBBBBB] shrink-0 w-5">#{rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-[#111111] truncate">{meta?.term ?? candidate.title}</p>
          {isRising && meta?.value && (
            <span className="font-mono text-xs text-[#888880] shrink-0">+{meta.value}%</span>
          )}
          {candidate.selected && <span className="font-mono text-xs text-[#888880] shrink-0">✓ used</span>}
        </div>
        {isRising && meta?.related_to && (
          <p className="text-xs text-[#888880] mb-1">Related to: {meta.related_to}</p>
        )}
        <ScoreBar score={candidate.score} />
        {candidate.score_reason && (
          <p className="text-xs text-[#888880] italic mt-1 line-clamp-1">{candidate.score_reason}</p>
        )}
      </div>
      {candidate.source_url && (
        <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-[#888880] hover:text-[#111111] shrink-0 transition-colors">
          Explore ↗
        </a>
      )}
      <DismissBtn onDismiss={onDismiss} />
    </div>
  )
}

// ── article card ──────────────────────────────────────────────────────────────

function ArticleCard({ candidate, rank, onDismiss }: { candidate: ResearchCandidate; rank: number; onDismiss: () => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl shadow-sm px-5 py-4">
      <div className="flex items-start gap-4">
        <span className="font-mono text-xs text-[#BBBBBB] shrink-0 w-5 mt-0.5">#{rank}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-[#111111] leading-snug">{candidate.title}</p>
            <div className="flex items-center gap-2 shrink-0">
              {candidate.selected && (
                <span className="font-mono text-xs text-[#888880]">✓ used in draft</span>
              )}
              <DismissBtn onDismiss={onDismiss} />
            </div>
          </div>
          <ScoreBar score={candidate.score} />
          {candidate.score_reason && (
            <p className="text-xs text-[#888880] italic my-2 leading-relaxed">{candidate.score_reason}</p>
          )}
          {candidate.summary && (
            <div className="mb-2">
              <p className={`text-xs text-[#555555] leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
                {candidate.summary}
              </p>
              {candidate.summary.length > 160 && (
                <button onClick={() => setExpanded(e => !e)}
                  className="text-xs text-[#888880] hover:text-[#111111] mt-0.5 transition-colors">
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SourceTag category={candidate.source_category} />
              <span className="text-xs text-[#BBBBBB]">{candidate.source}</span>
              <span className="font-mono text-xs text-[#BBBBBB]">{fmtDate(candidate.created_at)}</span>
            </div>
            {candidate.source_url && (
              <a href={candidate.source_url} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#888880] hover:text-[#111111] shrink-0 transition-colors">
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
      <p className="text-sm font-semibold text-[#111111] mb-1">No research data yet</p>
      <p className="text-sm text-[#888880] mb-6 max-w-xs">
        Run the AI pipeline to pull YouTube videos, Google Trends, RSS articles, and Reddit posts.
      </p>
      <Link href="/generate"
        className="px-5 py-2.5 bg-[#7C3AED] text-white text-sm font-semibold hover:bg-[#6D28D9] rounded-lg transition-colors">
        Go to Generate
      </Link>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'company' | 'video' | 'trend' | 'article' | 'reddit' | 'selected'

export default function ResearchPage() {
  const [candidates, setCandidates] = useState<ResearchCandidate[]>([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState<Filter>('all')
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
    const { data } = await supabase
      .from('research_candidates')
      .select('*')
      .order('score', { ascending: false })
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
    const res = await fetch('/api/research/scrape', { method: 'POST' })
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

  const count = (f: Filter) => {
    if (f === 'all')      return candidates.length
    if (f === 'selected') return candidates.filter(c => c.selected).length
    return candidates.filter(c => c.source_category === f).length
  }

  const visible: ResearchCandidate[] = filter === 'all' ? candidates
    : filter === 'selected' ? candidates.filter(c => c.selected)
    : candidates.filter(c => c.source_category === filter)

  const videoCount   = count('video')
  const trendCount   = count('trend')
  const articleCount = count('article') + count('reddit')
  const companyCount = count('company')
  const selectedCount = count('selected')

  const avgScore = candidates.length
    ? (candidates.reduce((s, c) => s + c.score, 0) / candidates.length).toFixed(1)
    : null

  // Most recent created_at across all candidates = when research last ran
  const lastRun = candidates.length
    ? candidates.reduce((max, c) => c.created_at > max ? c.created_at : max, candidates[0].created_at)
    : null

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all',      label: 'All'      },
    { key: 'company',  label: 'Company'  },
    { key: 'video',    label: 'Videos'   },
    { key: 'trend',    label: 'Trends'   },
    { key: 'article',  label: 'Articles' },
    { key: 'selected', label: 'Used in drafts' },
  ]

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-8 lg:py-10 max-w-4xl w-full">

      {/* header */}
      <div className="flex items-baseline justify-between mb-2 pb-6 border-b border-[#E5E7EB]">
        <div className="flex-1">
          <div className="flex items-baseline justify-between mb-1">
            <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Research</h1>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button onClick={() => { setLoading(true); load() }}
                className="font-mono text-xs text-[#BBBBBB] hover:text-[#111111] transition-colors">
                ↻
              </button>
              <button
                onClick={handleScrape}
                disabled={scraping}
                className="font-mono text-xs text-[#888880] border border-[#E5E7EB] hover:border-[#7C3AED] hover:text-[#111111] px-3 py-1.5 transition-colors disabled:opacity-40 rounded-lg flex items-center gap-1.5">
                {scraping ? (
                  <>
                    <span className="animate-spin inline-block w-3 h-3 border-2 border-[#D1D5DB] border-t-[#7C3AED] rounded-full shrink-0" />
                    {scrapeElapsed < 8  ? 'Fetching pages…' :
                     scrapeElapsed < 20 ? 'Reading content…' :
                     scrapeElapsed < 35 ? 'Scoring relevance…' : 'Almost done…'}
                    <span className="text-[#BBBBBB]">{scrapeElapsed}s</span>
                  </>
                ) : 'Scrape website'}
              </button>
              {candidates.length > 0 && (
                <button
                  onClick={handleClearClick}
                  disabled={clearing}
                  className={`font-mono text-xs px-3 py-1.5 border transition-colors disabled:opacity-40 ${
                    confirmClear
                      ? 'bg-[#7C3AED] text-white border-[#7C3AED]'
                      : 'text-[#888880] border-[#E5E7EB] hover:border-[#7C3AED] hover:text-[#111111]'
                  }`}>
                  {clearing ? 'Clearing…' : confirmClear ? 'Confirm clear all?' : 'Clear all'}
                </button>
              )}
            </div>
          </div>
          <p className="text-base text-[#888880] mt-1">
            YouTube, Google Trends, RSS, Reddit — scored by brand relevance
          </p>
          {candidates.length > 0 && (
            <p className="font-mono text-sm text-[#888880] mt-1">
              {candidates.length} items
              {companyCount > 0 && ` · ${companyCount} company`}
              {videoCount > 0 && ` · ${videoCount} video`}
              {trendCount > 0 && ` · ${trendCount} trend`}
              {articleCount > 0 && ` · ${articleCount} article`}
              {selectedCount > 0 && ` · ${selectedCount} used in drafts`}
              {avgScore && ` · avg score ${avgScore}`}
            </p>
          )}
          {lastRun && (
            <p className="font-mono text-xs text-[#BBBBBB] mt-1">
              Last updated {timeAgo(lastRun)} · runs automatically every day
            </p>
          )}
          {scrapeMsg && (
            <p className="font-mono text-xs text-[#888880] mt-1">{scrapeMsg}</p>
          )}
        </div>
      </div>

      {!loading && candidates.length > 0 && (
        <div className="flex gap-0 border-b border-[#E5E7EB] mb-8 mt-0">
          {FILTERS.map(f => {
            const n = count(f.key)
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                  filter === f.key
                    ? 'border-[#7C3AED] text-[#7C3AED] font-semibold'
                    : 'border-transparent text-[#888880] hover:text-[#111111]'
                }`}>
                {f.label}
                {n > 0 && (
                  <span className={`font-mono text-xs ${
                    filter === f.key ? 'text-[#7C3AED]' : 'text-[#BBBBBB]'
                  }`}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <p className="text-sm text-[#888880] py-8 text-center">Nothing in this category yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((c, i) => {
            const cat = c.source_category
            const dismiss = () => handleDismiss(c.id)
            if (cat === 'video')
              return <VideoCard   key={c.id} candidate={c} rank={i + 1} onDismiss={dismiss} />
            if (cat === 'trend')
              return <TrendCard   key={c.id} candidate={c} rank={i + 1} onDismiss={dismiss} />
            return   <ArticleCard key={c.id} candidate={c} rank={i + 1} onDismiss={dismiss} />
          })}
        </div>
      )}

    </div>
  )
}
