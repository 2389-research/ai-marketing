'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type BrandProfile } from '@/lib/supabase'
import PerformanceSection from '@/components/PerformanceSection'

// ── social channel definitions ────────────────────────────────────────────────

const SOCIAL_CHANNELS: { key: string; label: string; urlField: keyof BrandProfile | null }[] = [
  { key: 'linkedin',  label: 'LinkedIn',  urlField: 'linkedin_url'  },
  { key: 'instagram', label: 'Instagram', urlField: 'instagram_url' },
  { key: 'x',        label: 'X',         urlField: 'x_url'         },
  { key: 'tiktok',   label: 'TikTok',    urlField: 'tiktok_url'    },
  { key: 'youtube',  label: 'YouTube',   urlField: 'youtube_url'   },
  { key: 'pinterest', label: 'Pinterest', urlField: 'pinterest_url' },
  { key: 'reddit',    label: 'Reddit',    urlField: 'reddit_url'    },
  { key: 'threads',   label: 'Threads',   urlField: 'threads_url'   },
]

// Content channels include email (no social URL) plus the video/image
// sub-formats that reuse their parent platform's profile (instagram_stories,
// youtube_shorts — no separate urlField above, same profile as the parent).
const CONTENT_CHANNELS = [
  'linkedin', 'instagram', 'x', 'tiktok', 'youtube', 'email',
  'instagram_stories', 'youtube_shorts', 'pinterest', 'reddit', 'threads',
]

// ── types ─────────────────────────────────────────────────────────────────────

interface DraftRow {
  channel: string
  status: string
  scheduled_for: string | null
  posted_at: string | null
}

interface ResearchStats {
  total: number
  company: number
  external: number
  lastRun: string | null
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function statsFor(rows: DraftRow[]) {
  return {
    total:     rows.length,
    pending:   rows.filter(r => r.status === 'pending').length,
    approved:  rows.filter(r => r.status === 'approved').length,
    rejected:  rows.filter(r => r.status === 'rejected').length,
    needsEdit: rows.filter(r => r.status === 'needs_edit').length,
    scheduled: rows.filter(r => r.scheduled_for !== null).length,
    posted:    rows.filter(r => r.posted_at !== null).length,
  }
}

function fmtRelDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function profileUrl(profile: BrandProfile, field: keyof BrandProfile | null): string {
  if (!field) return ''
  return (profile[field] as string | null) ?? ''
}

// ── recommendations engine ────────────────────────────────────────────────────

function buildRecommendations(
  profile: BrandProfile,
  byChannel: Record<string, DraftRow[]>,
  publishedCounts: Record<string, number>,
  research: ResearchStats,
): { label: string; href?: string }[] {
  const recs: { label: string; href?: string }[] = []

  // Missing social URLs
  for (const ch of SOCIAL_CHANNELS) {
    const url = ch.urlField ? profileUrl(profile, ch.urlField) : ''
    if (!url) {
      recs.push({ label: `${ch.label} profile URL not set — add it in Brand Settings`, href: '/brand' })
    }
  }

  // Content generated for a channel with no URL
  for (const ch of SOCIAL_CHANNELS) {
    const url = ch.urlField ? profileUrl(profile, ch.urlField) : ''
    const rows = byChannel[ch.key] ?? []
    if (rows.length > 0 && !url) {
      recs.push({ label: `${ch.label} has ${rows.length} draft${rows.length !== 1 ? 's' : ''} but no profile URL — add it in Brand Settings`, href: '/brand' })
    }
  }

  // Approved drafts with no scheduled date
  for (const ch of CONTENT_CHANNELS) {
    const rows = byChannel[ch] ?? []
    const s = statsFor(rows)
    if (s.approved > 0 && s.scheduled === 0) {
      recs.push({ label: `${cap(ch)}: ${s.approved} approved draft${s.approved !== 1 ? 's' : ''} with no scheduled date`, href: '/drafts' })
    }
  }

  // Preferred channels with no content
  for (const ch of profile.preferred_channels ?? []) {
    const rows = byChannel[ch] ?? []
    if (rows.length === 0) {
      recs.push({ label: `${cap(ch)} is a preferred channel but has no content yet`, href: '/generate' })
    }
  }

  // Research pool health
  if (research.total === 0) {
    recs.push({ label: 'Research pool is empty — run Research to populate content ideas', href: '/research' })
  } else if (research.company === 0) {
    recs.push({ label: 'No company website content in research pool — trigger a website scrape in Research', href: '/research' })
  }

  return recs
}

// ── stat pill ─────────────────────────────────────────────────────────────────

function Stat({ label, value, dim }: { label: string; value: number; dim?: boolean }) {
  if (value === 0 && dim) return null
  return (
    <span className={`text-xs ${dim ? 'text-[#9a9a9a]' : 'text-[#262626]'}`}>
      {value} {label}
    </span>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [profile,        setProfile]        = useState<BrandProfile | null>(null)
  const [byChannel,      setByChannel]      = useState<Record<string, DraftRow[]>>({})
  const [publishedCounts, setPublishedCounts] = useState<Record<string, number>>({})
  const [research,       setResearch]       = useState<ResearchStats>({ total: 0, company: 0, external: 0, lastRun: null })
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    async function load() {
      const [profileRes, draftsRes, publishedRes, researchRes] = await Promise.all([
        supabase.from('brand_profile').select('*').limit(1).maybeSingle(),
        supabase.from('generated_drafts').select('channel, status, scheduled_for, posted_at'),
        supabase.from('published_posts').select('channel'),
        supabase.from('research_candidates').select('source_category, created_at').order('created_at', { ascending: false }),
      ])

      setProfile(profileRes.data ?? null)

      const map: Record<string, DraftRow[]> = {}
      for (const d of draftsRes.data ?? []) {
        if (!map[d.channel]) map[d.channel] = []
        map[d.channel].push(d)
      }
      setByChannel(map)

      const pub: Record<string, number> = {}
      for (const p of publishedRes.data ?? []) {
        pub[p.channel] = (pub[p.channel] ?? 0) + 1
      }
      setPublishedCounts(pub)

      const candidates = researchRes.data ?? []
      setResearch({
        total:    candidates.length,
        company:  candidates.filter(c => c.source_category === 'company').length,
        external: candidates.filter(c => c.source_category !== 'company').length,
        lastRun:  candidates[0]?.created_at ?? null,
      })

      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-6xl w-full mx-auto">
        <p className="text-xs text-[#9a9a9a]">Loading…</p>
      </div>
    )
  }

  const recs = profile ? buildRecommendations(profile, byChannel, publishedCounts, research) : []

  // Posting activity — keyed off posted_at (the authoritative "I posted this
  // manually" log), not published_posts (which only exists when engagement
  // was also recorded).
  const allRows = Object.values(byChannel).flat()
  const postedRows = allRows.filter(r => r.posted_at)
  const totalPosted = postedRows.length
  const posted30 = postedRows.filter(r => Date.now() - new Date(r.posted_at!).getTime() < 30 * 86_400_000).length
  const lastPostedAt = postedRows.reduce<string | null>((m, r) => (!m || r.posted_at! > m ? r.posted_at! : m), null)
  const postedByChannel = CONTENT_CHANNELS
    .map(ch => {
      const rows = (byChannel[ch] ?? []).filter(r => r.posted_at)
      if (rows.length === 0) return null
      const last = rows.reduce((m, r) => (r.posted_at! > m ? r.posted_at! : m), rows[0].posted_at!)
      return { channel: ch, count: rows.length, last }
    })
    .filter((x): x is { channel: string; count: number; last: string } => x !== null)
    .sort((a, b) => (b.last > a.last ? 1 : -1))

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-6xl w-full mx-auto">

      {/* header */}
      <div className="mb-8 pb-6 border-b border-[#b3b3b3]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Presence Audit</h1>
        <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
          {profile?.company_name ?? 'Your brand'} · snapshot of configured channels, posting + performance, and content activity
        </p>
      </div>

      {/* ── Social Profiles ── */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest">Social Profiles</h2>
          <Link href="/brand" className="text-xs text-[#1800ad] hover:text-[#2f1ac9] transition-colors">
            Edit in Brand →
          </Link>
        </div>

        <div className="border border-[#b3b3b3] rounded">
          {/* Website row */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#c9c9c9]">
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#262626] w-24">
                Website
              </span>
              {profile?.website_url ? (
                <span className="text-xs text-[#6b6b6b]">✓ Configured</span>
              ) : (
                <span className="text-xs text-[#9a9a9a]">— Not set</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-right">
              {profile?.website_url && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors truncate max-w-[200px]">
                  {profile.website_url.replace(/^https?:\/\//, '')}
                </a>
              )}
              {profile?.last_website_scraped && (
                <span className="text-xs text-[#9a9a9a] shrink-0">
                  Scraped {fmtDate(profile.last_website_scraped)}
                </span>
              )}
            </div>
          </div>

          {/* Social channel rows */}
          {SOCIAL_CHANNELS.map((ch, i) => {
            const url = ch.urlField ? profileUrl(profile!, ch.urlField) : ''
            const isLast = i === SOCIAL_CHANNELS.length - 1
            const rows = byChannel[ch.key] ?? []
            const s = statsFor(rows)
            return (
              <div
                key={ch.key}
                className={`flex items-center justify-between px-5 py-3.5 ${!isLast ? 'border-b border-[#c9c9c9]' : ''}`}>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-semibold uppercase tracking-widest text-[#262626] w-24">
                    {ch.label}
                  </span>
                  {url ? (
                    <span className="text-xs text-[#6b6b6b]">✓ Configured</span>
                  ) : (
                    <span className="text-xs text-[#9a9a9a]">— Not set</span>
                  )}
                </div>
                <div className="flex items-center gap-5 text-right">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors truncate max-w-[200px]">
                      {url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : null}
                  {s.total > 0 && (
                    <span className="text-xs text-[#9a9a9a]">
                      {s.total} draft{s.total !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Posting Activity ── */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest">Posting Activity</h2>
          <span className="text-xs text-[#9a9a9a]">Since posting is manual, this reflects what you&apos;ve logged as posted</span>
        </div>

        {/* summary tiles */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="border border-[#b3b3b3] rounded px-4 py-3">
            <p className="text-2xl font-bold text-[#262626]">{totalPosted}</p>
            <p className="text-[11px] text-[#6b6b6b] uppercase tracking-widest mt-0.5">Posted total</p>
          </div>
          <div className="border border-[#b3b3b3] rounded px-4 py-3">
            <p className="text-2xl font-bold text-[#262626]">{posted30}</p>
            <p className="text-[11px] text-[#6b6b6b] uppercase tracking-widest mt-0.5">Last 30 days</p>
          </div>
          <div className="border border-[#b3b3b3] rounded px-4 py-3">
            <p className="text-2xl font-bold text-[#262626]">{lastPostedAt ? fmtRelDate(lastPostedAt) : '—'}</p>
            <p className="text-[11px] text-[#6b6b6b] uppercase tracking-widest mt-0.5">Last posted</p>
          </div>
        </div>

        {postedByChannel.length > 0 ? (
          <div className="border border-[#b3b3b3] rounded">
            {postedByChannel.map((p, i) => (
              <div
                key={p.channel}
                className={`flex items-center justify-between px-5 py-3 ${i < postedByChannel.length - 1 ? 'border-b border-[#c9c9c9]' : ''}`}>
                <span className="text-xs font-semibold uppercase tracking-widest text-[#262626]">{p.channel}</span>
                <div className="flex items-center gap-5 text-right">
                  <span className="text-xs text-[#6b6b6b]">{p.count} posted</span>
                  <span className="text-xs text-[#9a9a9a] w-20">last {fmtRelDate(p.last)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-[#b3b3b3] rounded px-5 py-6 text-center">
            <p className="text-sm text-[#6b6b6b]">Nothing logged as posted yet.</p>
            <p className="text-xs text-[#9a9a9a] mt-1">
              After you post an approved draft, open it and hit &ldquo;Mark as posted&rdquo; — it&apos;ll show up here and on the calendar.
            </p>
          </div>
        )}
      </section>

      {/* ── Performance (formerly its own page — merged 2026-07-28) ── */}
      <PerformanceSection />

      {/* ── Content Activity ── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest mb-4">Content Activity</h2>

        <div className="border border-[#b3b3b3] rounded">
          {/* Column headers */}
          <div className="grid grid-cols-6 px-5 py-2.5 border-b border-[#b3b3b3] bg-[#c9c9c9] rounded-t-xl">
            <span className="text-[10px] uppercase tracking-widest text-[#6b6b6b] col-span-2">Channel</span>
            <span className="text-[10px] uppercase tracking-widest text-[#6b6b6b] text-right">Generated</span>
            <span className="text-[10px] uppercase tracking-widest text-[#6b6b6b] text-right">Approved</span>
            <span className="text-[10px] uppercase tracking-widest text-[#6b6b6b] text-right">Posted</span>
            <span className="text-[10px] uppercase tracking-widest text-[#6b6b6b] text-right">Scheduled</span>
          </div>

          {CONTENT_CHANNELS.map((ch, i) => {
            const rows = byChannel[ch] ?? []
            const s = statsFor(rows)
            const isLast = i === CONTENT_CHANNELS.length - 1
            const hasAny = s.total > 0 || s.posted > 0
            return (
              <div
                key={ch}
                className={`grid grid-cols-6 px-5 py-3 items-center ${!isLast ? 'border-b border-[#c9c9c9]' : ''}`}>
                <span className={`text-xs font-semibold uppercase tracking-widest col-span-2 ${hasAny ? 'text-[#262626]' : 'text-[#9a9a9a]'}`}>
                  {ch}
                </span>
                <span className={`text-xs text-right ${s.total > 0 ? 'text-[#262626]' : 'text-[#9a9a9a]'}`}>
                  {s.total > 0 ? s.total : '—'}
                </span>
                <span className={`text-xs text-right ${s.approved > 0 ? 'text-[#262626]' : 'text-[#9a9a9a]'}`}>
                  {s.approved > 0 ? s.approved : '—'}
                </span>
                <span className={`text-xs text-right ${s.posted > 0 ? 'text-[#16803d] font-semibold' : 'text-[#9a9a9a]'}`}>
                  {s.posted > 0 ? s.posted : '—'}
                </span>
                <span className={`text-xs text-right ${s.scheduled > 0 ? 'text-[#262626]' : 'text-[#9a9a9a]'}`}>
                  {s.scheduled > 0 ? s.scheduled : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Research Pool ── */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest">Research Pool</h2>
          <Link href="/research" className="text-xs text-[#1800ad] hover:text-[#2f1ac9] transition-colors">
            View Research →
          </Link>
        </div>

        <div className="border border-[#b3b3b3] rounded px-5 py-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-1">Total candidates</p>
            <p className="text-xl font-semibold text-[#262626]">{research.total}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-1">Company content</p>
            <p className={`text-xl font-semibold ${research.company === 0 ? 'text-[#9a9a9a]' : 'text-[#262626]'}`}>
              {research.company}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-1">External research</p>
            <p className="text-xl font-semibold text-[#262626]">{research.external}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b] mb-1">Last research run</p>
            <p className="text-sm font-semibold text-[#262626]">{fmtDate(research.lastRun)}</p>
          </div>
        </div>
      </section>

      {/* ── Preferred Channels ── */}
      {profile?.preferred_channels && profile.preferred_channels.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest mb-4">Preferred Channels</h2>
          <div className="border border-[#b3b3b3] rounded px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {profile.preferred_channels.map(ch => {
                const rows = byChannel[ch] ?? []
                const s = statsFor(rows)
                const active = s.total > 0
                return (
                  <span
                    key={ch}
                    className={`text-xs px-3 py-1 border ${
                      active
                        ? 'border-[#1800ad] text-[#1800ad]'
                        : 'border-[#b3b3b3] text-[#9a9a9a]'
                    }`}>
                    {ch.toUpperCase()}
                    {active && <span className="ml-2 text-[#6b6b6b]">{s.total}</span>}
                  </span>
                )
              })}
            </div>
            {profile.preferred_channels.some(ch => (byChannel[ch] ?? []).length === 0) && (
              <p className="text-xs text-[#6b6b6b] mt-3">
                Dimmed channels are configured as preferred but have no content generated yet.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Recommendations ── */}
      {recs.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest mb-4">Recommendations</h2>
          <div className="border border-[#b3b3b3] rounded">
            {recs.map((rec, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-3.5 ${i < recs.length - 1 ? 'border-b border-[#c9c9c9]' : ''}`}>
                <p className="text-sm text-[#3c3c3c] leading-snug">
                  <span className="text-[#9a9a9a] mr-3">→</span>
                  {rec.label}
                </p>
                {rec.href && (
                  <Link
                    href={rec.href}
                    className="text-xs text-[#1800ad] hover:text-[#2f1ac9] transition-colors shrink-0 ml-4">
                    Fix →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {recs.length === 0 && !loading && (
        <section>
          <div className="border border-[#b3b3b3] rounded px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[#262626]">Everything looks good</p>
            <p className="text-sm text-[#6b6b6b] mt-1">No gaps or missing configuration detected.</p>
          </div>
        </section>
      )}

    </div>
  )
}
