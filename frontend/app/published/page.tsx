'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'
import { CHANNELS, CH_COLOR } from '@/lib/channels'

// ── types ─────────────────────────────────────────────────────────────────────

interface PublishedPost {
  id: string
  draft_id: string | null
  channel: string
  topic: string
  content: string
  published_at: string
  platform_post_id: string | null
}

// read ?channel= from URL on first render
function getInitialChannel(): string {
  if (typeof window === 'undefined') return 'all'
  const c = new URLSearchParams(window.location.search).get('channel') ?? 'all'
  return c === 'all' || CHANNELS.some(ch => ch.id === c) ? c : 'all'
}

const CHANNEL_FILTERS = [{ id: 'all', label: 'All' }, ...CHANNELS]

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPublishedAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(',', ' ·').replace(' at', ' ·')
}

function getMonthKey(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function groupByMonth(posts: PublishedPost[]): { month: string; posts: PublishedPost[] }[] {
  const map = new Map<string, PublishedPost[]>()
  for (const post of posts) {
    const key = getMonthKey(post.published_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(post)
  }
  return Array.from(map.entries()).map(([month, posts]) => ({ month, posts }))
}

// ── post card ─────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: PublishedPost }) {
  const colors = CH_COLOR[post.channel] ?? { dot: '#9CA3AF', bg: '#F3F4F6', text: '#374151' }

  return (
    <div className="bg-white border border-[#EBEBEB] rounded-xl  px-5 pt-4 pb-4">
      {/* top bar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="font-mono text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {post.channel}
          </span>
          {post.platform_post_id && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#ECFDF5] text-[#065F46]">
              Posted ✓
            </span>
          )}
        </div>
        <span className="font-mono text-xs text-[#BBBBBB]">
          {fmtPublishedAt(post.published_at)}
        </span>
      </div>

      {/* topic */}
      <p className="text-base font-semibold text-[#111111] leading-snug mb-1.5">
        {post.topic}
      </p>

      {/* content preview */}
      <p className="text-sm text-[#555555] leading-relaxed line-clamp-2">
        {post.content}
      </p>
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-semibold text-[#111111] mb-1">No published posts yet</p>
      <p className="text-sm text-[#888880] mb-4">
        Approve and schedule drafts to see them here.
      </p>
      <Link
        href="/drafts"
        className="text-sm font-semibold text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
      >
        Go to Drafts →
      </Link>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function PublishedPage() {
  const [posts, setPosts]     = useState<PublishedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [channel, setChannel] = useState<string>(getInitialChannel)

  useEffect(() => {
    resolveActiveProjectClient().then(pid =>
      scoped(supabase.from('published_posts').select('*'), pid)
        .order('published_at', { ascending: false })
        .then(({ data }) => {
          setPosts(data ?? [])
          setLoading(false)
        })
    )
  }, [])

  const channelCounts = CHANNEL_FILTERS.reduce<Record<string, number>>((acc, c) => {
    acc[c.id] = c.id === 'all' ? posts.length : posts.filter(p => p.channel === c.id).length
    return acc
  }, {})

  const visible = channel === 'all' ? posts : posts.filter(p => p.channel === channel)
  const groups  = groupByMonth(visible)

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-4xl w-full">

      {/* header */}
      <div className="mb-8 pb-6 border-b border-[#EBEBEB]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#09090B] tracking-tight">Published</h1>
        <p className="text-[13.5px] text-[#71717A] mt-1.5">Content that&apos;s gone live</p>
      </div>

      {/* channel filter tabs */}
      {posts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-8">
          {CHANNEL_FILTERS.map(c => {
            const active = channel === c.id
            const color  = c.id === 'all' ? null : CH_COLOR[c.id]
            return (
              <button
                key={c.id}
                onClick={() => setChannel(c.id)}
                style={active && color ? { backgroundColor: color.bg, color: color.text } : {}}
                className={`px-2.5 py-1 font-mono text-xs rounded-full border transition-colors ${
                  active
                    ? color ? 'border-transparent font-semibold' : 'border-[#111111] bg-[#111111] text-white font-semibold'
                    : 'border-[#EBEBEB] text-[#888880] hover:border-[#BBBBBB] hover:text-[#111111]'
                }`}>
                {c.label}{channelCounts[c.id] > 0 ? ` · ${channelCounts[c.id]}` : ''}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-sm font-semibold text-[#111111] mb-1">No published posts for this channel</p>
          <p className="text-sm text-[#888880]">Try a different channel tab.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {groups.map(({ month, posts: monthPosts }) => (
            <section key={month}>
              <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-widest mb-4">
                {month}
              </h2>
              <div className="space-y-3">
                {monthPosts.map(post => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

    </div>
  )
}
