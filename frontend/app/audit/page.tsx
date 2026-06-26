'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, type BrandProfile } from '@/lib/supabase'

// ── social channel definitions ────────────────────────────────────────────────

const SOCIAL_CHANNELS: { key: string; label: string; urlField: keyof BrandProfile | null }[] = [
  { key: 'linkedin',  label: 'LinkedIn',  urlField: 'linkedin_url'  },
  { key: 'instagram', label: 'Instagram', urlField: 'instagram_url' },
  { key: 'x',        label: 'X',         urlField: 'x_url'         },
  { key: 'tiktok',   label: 'TikTok',    urlField: 'tiktok_url'    },
  { key: 'youtube',  label: 'YouTube',   urlField: 'youtube_url'   },
]

// Content channels include email (no social URL)
const CONTENT_CHANNELS = ['linkedin', 'instagram', 'x', 'tiktok', 'youtube', 'email']

// ── types ─────────────────────────────────────────────────────────────────────

interface DraftRow {
  channel: string
  status: string
  scheduled_for: string | null
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
  }
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
    <span className={`font-mono text-xs ${dim ? 'text-[#BBBBBB]' : 'text-[#111111]'}`}>
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
        supabase.from('generated_drafts').select('channel, status, scheduled_for'),
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
      <div className="px-5 sm:px-8 lg:px-10 py-8 lg:py-10 max-w-3xl w-full">
        <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
      </div>
    )
  }

  const recs = profile ? buildRecommendations(profile, byChannel, publishedCounts, research) : []

  return (
    <div className="px-5 sm:px-8 lg:px-10 py-8 lg:py-10 max-w-3xl w-full">

      {/* header */}
      <div className="mb-8 pb-6 border-b border-[#E5E7EB]">
        <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Presence Audit</h1>
        <p className="text-base text-[#888880] mt-1.5">
          {profile?.company_name ?? 'Your brand'} · snapshot of configured channels and content activity
        </p>
      </div>

      {/* ── Social Profiles ── */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest">Social Profiles</h2>
          <Link href="/brand" className="font-mono text-xs text-[#7C3AED] hover:text-[#6D28D9] transition-colors">
            Edit in Brand →
          </Link>
        </div>

        <div className="border border-[#E5E7EB] rounded-xl">
          {/* Website row */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F3F4F6]">
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[#111111] w-24">
                Website
              </span>
              {profile?.website_url ? (
                <span className="font-mono text-xs text-[#888880]">✓ Configured</span>
              ) : (
                <span className="font-mono text-xs text-[#BBBBBB]">— Not set</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-right">
              {profile?.website_url && (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-[#888880] hover:text-[#111111] transition-colors truncate max-w-[200px]">
                  {profile.website_url.replace(/^https?:\/\//, '')}
                </a>
              )}
              {profile?.last_website_scraped && (
                <span className="font-mono text-xs text-[#BBBBBB] shrink-0">
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
                className={`flex items-center justify-between px-5 py-3.5 ${!isLast ? 'border-b border-[#F3F4F6]' : ''}`}>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[#111111] w-24">
                    {ch.label}
                  </span>
                  {url ? (
                    <span className="font-mono text-xs text-[#888880]">✓ Configured</span>
                  ) : (
                    <span className="font-mono text-xs text-[#BBBBBB]">— Not set</span>
                  )}
                </div>
                <div className="flex items-center gap-5 text-right">
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-[#888880] hover:text-[#111111] transition-colors truncate max-w-[200px]">
                      {url.replace(/^https?:\/\//, '')}
                    </a>
                  ) : null}
                  {s.total > 0 && (
                    <span className="font-mono text-xs text-[#BBBBBB]">
                      {s.total} draft{s.total !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Content Activity ── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest mb-4">Content Activity</h2>

        <div className="border border-[#E5E7EB] rounded-xl">
          {/* Column headers */}
          <div className="grid grid-cols-6 px-5 py-2.5 border-b border-[#E5E7EB] bg-[#F9FAFB] rounded-t-xl">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#888880] col-span-2">Channel</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#888880] text-right">Generated</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#888880] text-right">Approved</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#888880] text-right">Published</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-[#888880] text-right">Scheduled</span>
          </div>

          {CONTENT_CHANNELS.map((ch, i) => {
            const rows = byChannel[ch] ?? []
            const s = statsFor(rows)
            const published = publishedCounts[ch] ?? 0
            const isLast = i === CONTENT_CHANNELS.length - 1
            const hasAny = s.total > 0 || published > 0
            return (
              <div
                key={ch}
                className={`grid grid-cols-6 px-5 py-3 items-center ${!isLast ? 'border-b border-[#F3F4F6]' : ''}`}>
                <span className={`font-mono text-xs font-semibold uppercase tracking-widest col-span-2 ${hasAny ? 'text-[#111111]' : 'text-[#BBBBBB]'}`}>
                  {ch}
                </span>
                <span className={`font-mono text-xs text-right ${s.total > 0 ? 'text-[#111111]' : 'text-[#E5E7EB]'}`}>
                  {s.total > 0 ? s.total : '—'}
                </span>
                <span className={`font-mono text-xs text-right ${s.approved > 0 ? 'text-[#111111]' : 'text-[#E5E7EB]'}`}>
                  {s.approved > 0 ? s.approved : '—'}
                </span>
                <span className={`font-mono text-xs text-right ${published > 0 ? 'text-[#111111]' : 'text-[#E5E7EB]'}`}>
                  {published > 0 ? published : '—'}
                </span>
                <span className={`font-mono text-xs text-right ${s.scheduled > 0 ? 'text-[#111111]' : 'text-[#E5E7EB]'}`}>
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
          <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest">Research Pool</h2>
          <Link href="/research" className="font-mono text-xs text-[#7C3AED] hover:text-[#6D28D9] transition-colors">
            View Research →
          </Link>
        </div>

        <div className="border border-[#E5E7EB] rounded-xl px-5 py-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#888880] mb-1">Total candidates</p>
            <p className="font-mono text-xl font-semibold text-[#111111]">{research.total}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#888880] mb-1">Company content</p>
            <p className={`font-mono text-xl font-semibold ${research.company === 0 ? 'text-[#BBBBBB]' : 'text-[#111111]'}`}>
              {research.company}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#888880] mb-1">External research</p>
            <p className="font-mono text-xl font-semibold text-[#111111]">{research.external}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#888880] mb-1">Last research run</p>
            <p className="font-mono text-sm font-semibold text-[#111111]">{fmtDate(research.lastRun)}</p>
          </div>
        </div>
      </section>

      {/* ── Preferred Channels ── */}
      {profile?.preferred_channels && profile.preferred_channels.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest mb-4">Preferred Channels</h2>
          <div className="border border-[#E5E7EB] rounded-xl px-5 py-4">
            <div className="flex flex-wrap gap-2">
              {profile.preferred_channels.map(ch => {
                const rows = byChannel[ch] ?? []
                const s = statsFor(rows)
                const active = s.total > 0
                return (
                  <span
                    key={ch}
                    className={`font-mono text-xs px-3 py-1 border ${
                      active
                        ? 'border-[#7C3AED] text-[#7C3AED]'
                        : 'border-[#E5E7EB] text-[#BBBBBB]'
                    }`}>
                    {ch.toUpperCase()}
                    {active && <span className="ml-2 text-[#888880]">{s.total}</span>}
                  </span>
                )
              })}
            </div>
            {profile.preferred_channels.some(ch => (byChannel[ch] ?? []).length === 0) && (
              <p className="font-mono text-xs text-[#888880] mt-3">
                Dimmed channels are configured as preferred but have no content generated yet.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Recommendations ── */}
      {recs.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest mb-4">Recommendations</h2>
          <div className="border border-[#E5E7EB] rounded-xl">
            {recs.map((rec, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-3.5 ${i < recs.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}>
                <p className="text-sm text-[#555555] leading-snug">
                  <span className="font-mono text-[#BBBBBB] mr-3">→</span>
                  {rec.label}
                </p>
                {rec.href && (
                  <Link
                    href={rec.href}
                    className="font-mono text-xs text-[#7C3AED] hover:text-[#6D28D9] transition-colors shrink-0 ml-4">
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
          <div className="border border-[#E5E7EB] rounded-xl px-5 py-8 text-center">
            <p className="text-sm font-semibold text-[#111111]">Everything looks good</p>
            <p className="text-sm text-[#888880] mt-1">No gaps or missing configuration detected.</p>
          </div>
        </section>
      )}

    </div>
  )
}
