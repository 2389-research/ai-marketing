'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/Card'
import { CHANNELS } from '@/lib/channels'

interface Idea {
  id: string
  text: string
  enrichment: { angles?: string[]; channels?: string[]; hook?: string } | null
  status: 'new' | 'queued' | 'drafted' | 'archived'
  created_at: string
}

const CH_LABEL: Record<string, string> = Object.fromEntries(CHANNELS.map(c => [c.id, c.label]))

const STATUS_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  new:     { label: '💡 New',       bg: '#F5F3FF', text: '#5B21B6' },
  queued:  { label: '→ In pipeline', bg: '#EFF6FF', text: '#1D4ED8' },
  drafted: { label: '✦ Drafted',    bg: '#ECFDF5', text: '#065F46' },
}

export default function IdeasPage() {
  const router = useRouter()
  const [ideas, setIdeas]     = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [text, setText]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [busyId, setBusyId]   = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/ideas')
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to load'); setLoading(false); return }
    setIdeas(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const enrich = async (id: string) => {
    await fetch('/api/ideas/enrich', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    load()
  }

  const addIdea = async () => {
    if (!text.trim() || saving) return
    setSaving(true); setError('')
    const res = await fetch('/api/ideas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Save failed'); return }
    setText('')
    setIdeas(prev => [data, ...prev])
    enrich(data.id) // background — card updates when the AI's take lands
  }

  const setStatus = async (id: string, status: string) => {
    setBusyId(id)
    await fetch('/api/ideas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setBusyId(null)
    load()
  }

  const remove = async (id: string) => {
    setBusyId(id)
    await fetch('/api/ideas', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusyId(null)
    setIdeas(prev => prev.filter(i => i.id !== id))
  }

  const toPipeline = async (id: string) => {
    setBusyId(id)
    await fetch('/api/ideas/to-pipeline', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBusyId(null)
    load()
  }

  const draftIt = async (idea: Idea) => {
    await fetch('/api/ideas', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idea.id, status: 'drafted' }),
    })
    router.push(`/write?ideaId=${idea.id}`)
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-4xl w-full mx-auto">
      <div className="mb-6 pb-5 border-b border-[#e6e6e6]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Ideas</h1>
        <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
          Dump any thought — the AI develops it, and every idea can become a post, a pipeline topic, or a video.
        </p>
      </div>

      {error && <p className="text-xs text-[#DC2626] mb-4">{error}</p>}

      {/* capture */}
      <Card title="What's on your mind?" sub="A half-sentence is enough — the AI takes it from there.">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addIdea() }}
          placeholder="e.g. something about how founders are scared of alpha software touching their inbox…"
          rows={3}
          className="w-full text-sm border border-[#cccccc] rounded px-3 py-2 outline-none focus:border-[#1800ad] resize-y leading-relaxed"
        />
        <button
          onClick={addIdea}
          disabled={saving || !text.trim()}
          className="mt-2 px-4 py-2 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded disabled:opacity-40 transition-colors">
          {saving ? 'Saving…' : '💡 Save idea'}
        </button>
      </Card>

      {/* list */}
      <div className="mt-6 space-y-4">
        {loading && <p className="text-xs text-[#9a9a9a] text-center py-8">Loading…</p>}
        {!loading && ideas.length === 0 && (
          <p className="text-sm text-[#9a9a9a] text-center py-8">No ideas yet — write the first one above.</p>
        )}
        {ideas.map(idea => {
          const badge = STATUS_BADGE[idea.status] ?? STATUS_BADGE.new
          const e = idea.enrichment
          return (
            <div key={idea.id} className="bg-white border border-[#e6e6e6] rounded p-5">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: badge.bg, color: badge.text }}>
                  {badge.label}
                </span>
                <span className="text-xs text-[#9a9a9a]">
                  {new Date(idea.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
                <button
                  onClick={() => remove(idea.id)}
                  disabled={busyId === idea.id}
                  className="ml-auto text-xs text-[#9a9a9a] hover:text-[#DC2626] transition-colors">
                  Delete
                </button>
              </div>

              <p className="text-sm text-[#262626] leading-relaxed whitespace-pre-wrap mb-3">{idea.text}</p>

              {e ? (
                <div className="border-t border-[#f7f7f7] pt-3 mb-3">
                  {e.hook && <p className="text-[13px] text-[#3c3c3c] italic mb-2">“{e.hook}”</p>}
                  {(e.angles ?? []).length > 0 && (
                    <ul className="space-y-1 mb-2">
                      {e.angles!.map((a, i) => (
                        <li key={i} className="text-xs text-[#6b6b6b] flex gap-2">
                          <span className="text-[#1800ad] shrink-0">→</span>{a}
                        </li>
                      ))}
                    </ul>
                  )}
                  {(e.channels ?? []).length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {e.channels!.map(c => (
                        <span key={c} className="text-[10px] px-2 py-0.5 border border-[#e6e6e6] rounded-full text-[#6b6b6b]">
                          {CH_LABEL[c] ?? c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[#1800ad] mb-3">✦ AI is developing this idea…</p>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => draftIt(idea)}
                  className="text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] transition-colors">
                  ✦ Draft it
                </button>
                {idea.status !== 'queued' && (
                  <button
                    onClick={() => toPipeline(idea.id)}
                    disabled={busyId === idea.id}
                    title="Becomes a high-priority topic candidate — the strategist weighs it against trends in the next batch"
                    className="text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] disabled:opacity-40 transition-colors">
                    → Into the pipeline
                  </button>
                )}
                <button
                  onClick={() => router.push(`/videos?prompt=${encodeURIComponent(idea.enrichment?.hook ? `${idea.text} — hook: ${idea.enrichment.hook}` : idea.text)}`)}
                  className="text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] transition-colors">
                  🎬 Make it a video
                </button>
                <button
                  onClick={() => setStatus(idea.id, 'archived')}
                  disabled={busyId === idea.id}
                  className="text-xs text-[#9a9a9a] hover:text-[#262626] transition-colors">
                  Archive
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
