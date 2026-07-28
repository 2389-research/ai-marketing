'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import type { BrandProfile, BrandFile, ContentPillar } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'
import SectionNav from '@/components/SectionNav'

// ── constants ─────────────────────────────────────────────────────────────────

const SOCIAL_FIELDS = [
  { key: 'linkedin_url',  label: 'LinkedIn',  ph: 'https://linkedin.com/company/...' },
  { key: 'instagram_url', label: 'Instagram', ph: 'https://instagram.com/...' },
  { key: 'tiktok_url',    label: 'TikTok',    ph: 'https://tiktok.com/@...' },
  { key: 'youtube_url',   label: 'YouTube',   ph: 'https://youtube.com/@...' },
  { key: 'x_url',         label: 'X',         ph: 'https://x.com/...' },
  { key: 'pinterest_url', label: 'Pinterest', ph: 'https://pinterest.com/...' },
  { key: 'reddit_url',    label: 'Reddit',    ph: 'https://reddit.com/user/... or /r/...' },
  { key: 'threads_url',   label: 'Threads',   ph: 'https://threads.net/@...' },
] as const

const ALL_CHANNELS = [
  { id: 'linkedin',          label: 'LinkedIn'          },
  { id: 'instagram',         label: 'Instagram'         },
  { id: 'email',             label: 'Email'             },
  { id: 'tiktok',            label: 'TikTok'            },
  { id: 'youtube',           label: 'YouTube'           },
  { id: 'x',                 label: 'X'                 },
  { id: 'instagram_stories', label: 'Instagram Stories' },
  { id: 'youtube_shorts',    label: 'YouTube Shorts'    },
  { id: 'pinterest',         label: 'Pinterest'         },
  { id: 'reddit',            label: 'Reddit'            },
  { id: 'threads',           label: 'Threads'           },
]

type FormState = {
  company_name: string
  website_url: string
  linkedin_url: string
  instagram_url: string
  tiktok_url: string
  youtube_url: string
  x_url: string
  pinterest_url: string
  reddit_url: string
  threads_url: string
  manual_notes: string
  voice_examples: string
  preferred_channels: string[]
}

const EMPTY_FORM: FormState = {
  company_name: '', website_url: '', linkedin_url: '',
  instagram_url: '', tiktok_url: '', youtube_url: '', x_url: '',
  pinterest_url: '', reddit_url: '', threads_url: '', manual_notes: '', voice_examples: '',
  preferred_channels: ['linkedin', 'instagram', 'email', 'tiktok', 'youtube', 'x'],
}

// ── shared input classes ──────────────────────────────────────────────────────

const INPUT = 'w-full text-sm border border-[#e6e6e6] px-3 py-2.5 rounded focus:outline-none focus:border-[#1c69d4] bg-white'

let nextBriefLogId = 0

// how many times cron_generate.py runs per week for each frequency choice —
// mirrors agents-side FREQUENCY_DAYS in cron_generate.py; used here only to
// compute the live "≈ N posts/week" estimate, display-only
const RUNS_PER_WEEK: Record<string, number> = { daily: 7, every_3_days: 7 / 3, weekly: 1 }
// average channels a single generated topic spans (strategy_agent assigns 1-2)
const AVG_CHANNELS_PER_TOPIC = 1.4

// ── page ──────────────────────────────────────────────────────────────────────

export default function BrandPage() {
  const [profile, setProfile]           = useState<BrandProfile | null>(null)
  const [files, setFiles]               = useState<BrandFile[]>([])
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM)
  const [linkInput, setLinkInput]       = useState('')
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [generating, setGenerating]     = useState(false)
  const [editStrategy, setEditStrategy] = useState(false)
  const [strategyDraft, setStrategyDraft] = useState('')
  const [savingStrategy, setSavingStrategy] = useState(false)
  const [cadence, setCadence]             = useState<Record<string, number>>({})
  const [savingCadence, setSavingCadence] = useState(false)
  const [cadenceMsg, setCadenceMsg]       = useState('')
  const [genFrequency, setGenFrequency]         = useState('every_3_days')
  const [topicsPerRun, setTopicsPerRun]         = useState(3)
  const [savingGenFrequency, setSavingGenFrequency] = useState(false)
  const [genFrequencyMsg, setGenFrequencyMsg]   = useState('')
  const [error, setError]               = useState('')
  const [saveMsg, setSaveMsg]           = useState('')

  const [pillars, setPillars]           = useState<ContentPillar[]>([])
  const [pillarsLoading, setPillarsLoading] = useState(true)
  const [briefRunning, setBriefRunning] = useState(false)
  const [briefLog, setBriefLog]         = useState<{ id: number; text: string; isError: boolean }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // ── shared channels (linked project) ─────────────────────────────────────
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [otherProjects, setOtherProjects]     = useState<{ id: string; name: string }[]>([])
  const [linkedProjectId, setLinkedProjectId] = useState<string>('')
  const [capRatioPct, setCapRatioPct]         = useState(25)
  const [savingLink, setSavingLink]           = useState(false)
  const [linkMsg, setLinkMsg]                 = useState('')

  // ── reset state ───────────────────────────────────────────────────────────
  const [resetStep, setResetStep]   = useState<0 | 1 | 2>(0)
  const [resetting, setResetting]   = useState(false)
  const [resetDone, setResetDone]   = useState('')
  const [resetErr, setResetErr]     = useState('')

  // ── load ──────────────────────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    const res = await fetch('/api/brand/profile')
    const { profile: p } = await res.json()
    if (p) {
      setProfile(p)
      setForm({
        company_name:       p.company_name       ?? '',
        website_url:        p.website_url        ?? '',
        linkedin_url:       p.linkedin_url       ?? '',
        instagram_url:      p.instagram_url      ?? '',
        tiktok_url:         p.tiktok_url         ?? '',
        youtube_url:        p.youtube_url        ?? '',
        x_url:              p.x_url              ?? '',
        pinterest_url:      p.pinterest_url      ?? '',
        reddit_url:         p.reddit_url         ?? '',
        threads_url:        p.threads_url        ?? '',
        manual_notes:       p.manual_notes       ?? '',
        voice_examples:     p.voice_examples     ?? '',
        preferred_channels: p.preferred_channels ?? ['linkedin', 'instagram', 'email', 'tiktok', 'youtube', 'x'],
      })
      setCadence((p as any).posting_cadence ?? {})
      setGenFrequency((p as any).generation_frequency ?? 'every_3_days')
      setTopicsPerRun((p as any).topics_per_run ?? 3)
      setCapRatioPct(Math.round(((p as any).linked_topic_cap_ratio ?? 0.25) * 100))
    }
  }, [])

  const loadFiles = useCallback(async () => {
    const res = await fetch('/api/brand/files')
    const { files: f } = await res.json()
    setFiles(f ?? [])
  }, [])

  // Fails open to "no other projects / no link" — pre-migration (before
  // sql/setup_linked_projects.sql is applied) this column doesn't exist yet.
  const loadProjects = useCallback(async () => {
    try {
      const pid = await resolveActiveProjectClient()
      setActiveProjectId(pid)
      const { data } = await supabase.from('projects').select('id, name, linked_project_id')
      const rows = data ?? []
      setOtherProjects(rows.filter(r => r.id !== pid).map(r => ({ id: r.id, name: r.name })))
      const mine = rows.find(r => r.id === pid)
      setLinkedProjectId(mine?.linked_project_id ?? '')
    } catch {
      // pre-migration or query error — leave defaults (no linking available yet)
    }
  }, [])

  useEffect(() => {
    Promise.all([loadProfile(), loadFiles(), loadProjects()]).finally(() => setLoading(false))
  }, [loadProfile, loadFiles, loadProjects])

  const loadPillars = useCallback(async () => {
    const pid = await resolveActiveProjectClient()
    const { data } = await scoped(
      supabase.from('content_pillars').select('*').eq('status', 'approved'),
      pid
    ).order('approved_at', { ascending: false })
    setPillars(data ?? [])
    setPillarsLoading(false)
  }, [])

  useEffect(() => { loadPillars() }, [loadPillars])

  const runNarrativeBrief = async () => {
    setBriefLog([])
    setBriefRunning(true)
    const addLine = (text: string, isError = false) =>
      setBriefLog(prev => [...prev, { id: nextBriefLogId++, text, isError }])
    addLine('Generating narrative brief…')

    try {
      const res = await fetch('/api/brand/narrative-brief/run', { method: 'POST' })
      if (!res.body) { addLine('No response stream', true); setBriefRunning(false); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'log') addLine(data.line, data.isError ?? false)
          } catch { /* skip malformed */ }
        }
      }
      addLine('Check Slack for the Approve / Reject buttons — pillars only take effect once approved.')
    } catch (err) {
      setBriefLog(prev => [...prev, { id: nextBriefLogId++, text: `Stream error: ${err}`, isError: true }])
    }

    setBriefRunning(false)
  }

  const saveLink = async () => {
    if (!activeProjectId) return
    setSavingLink(true)
    await fetch(`/api/projects/${activeProjectId}/link`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ linked_project_id: linkedProjectId || null }),
    })
    await fetch('/api/brand/profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ linked_topic_cap_ratio: capRatioPct / 100 }),
    })
    setSavingLink(false)
    setLinkMsg('Saved')
    setTimeout(() => setLinkMsg(''), 2000)
  }

  // ── save profile ──────────────────────────────────────────────────────────

  const saveProfile = async () => {
    setSaving(true)
    setError('')
    const res = await fetch('/api/brand/profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    const { profile: p, error: err } = await res.json()
    setSaving(false)
    if (err) { setError(err); return }
    setProfile(p)
    setSaveMsg('Saved')
    setTimeout(() => setSaveMsg(''), 2000)
  }

  // ── file upload ───────────────────────────────────────────────────────────

  const uploadFile = async (file: File) => {
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/brand/upload', { method: 'POST', body: fd })
    const { file: f, error: err } = await res.json()
    setUploading(false)
    if (err) { setError(`Upload failed: ${err}`); return }
    setFiles(prev => [...prev, f])
  }

  const addLink = async () => {
    const url = linkInput.trim()
    if (!url) return
    setUploading(true)
    setError('')
    const fd = new FormData()
    fd.append('type', 'link')
    fd.append('url', url)
    const res = await fetch('/api/brand/upload', { method: 'POST', body: fd })
    const { file: f, error: err } = await res.json()
    setUploading(false)
    if (err) { setError(`Link failed: ${err}`); return }
    setFiles(prev => [...prev, f])
    setLinkInput('')
  }

  const removeFile = async (id: string) => {
    await fetch(`/api/brand/files/${id}`, { method: 'DELETE' })
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  // ── generate strategy ─────────────────────────────────────────────────────

  const generateStrategy = async () => {
    if (!profile) { setError('Save your profile first.'); return }
    setGenerating(true)
    setError('')
    const res = await fetch('/api/brand/generate-strategy', { method: 'POST' })
    const { strategy, posting_cadence, profile: updated, error: err } = await res.json()
    setGenerating(false)
    if (err) { setError(err); return }
    setProfile(updated ?? (profile ? { ...profile, strategy, strategy_updated_at: new Date().toISOString() } : null))
    if (posting_cadence && Object.keys(posting_cadence).length > 0) setCadence(posting_cadence)
  }

  const saveCadence = async () => {
    setSavingCadence(true)
    const res = await fetch('/api/brand/profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ posting_cadence: cadence }),
    })
    setSavingCadence(false)
    if (res.ok) {
      setCadenceMsg('Saved')
      setTimeout(() => setCadenceMsg(''), 2000)
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Save failed' }))
      setCadenceMsg(`Error: ${error ?? 'Save failed'}`)
    }
  }

  const saveGenFrequency = async () => {
    setSavingGenFrequency(true)
    const res = await fetch('/api/brand/profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ generation_frequency: genFrequency, topics_per_run: topicsPerRun }),
    })
    setSavingGenFrequency(false)
    if (res.ok) {
      setGenFrequencyMsg('Saved')
      setTimeout(() => setGenFrequencyMsg(''), 2000)
    } else {
      const { error } = await res.json().catch(() => ({ error: 'Save failed' }))
      setGenFrequencyMsg(`Error: ${error ?? 'Save failed'}`)
    }
  }

  const saveStrategy = async () => {
    setSavingStrategy(true)
    const res = await fetch('/api/brand/profile', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ strategy: strategyDraft }),
    })
    const { profile: p } = await res.json()
    setSavingStrategy(false)
    setProfile(p)
    setEditStrategy(false)
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-xs text-[#9a9a9a]">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-4xl w-full mx-auto">

      {/* header */}
      <div className="mb-4 pb-6 border-b border-[#e6e6e6]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Brand</h1>
        <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
          Company profile, knowledge base, and AI marketing strategy
        </p>
      </div>

      <SectionNav
        sections={[
          { id: 'profile',   label: 'Profile' },
          ...(otherProjects.length > 0 ? [{ id: 'shared', label: 'Shared channels' }] : []),
          { id: 'knowledge', label: 'Knowledge' },
          { id: 'strategy',  label: 'Strategy' },
          { id: 'frequency', label: 'Generation' },
          { id: 'pillars',   label: 'Pillars' },
          { id: 'cadence',   label: 'Cadence' },
          { id: 'danger',    label: 'Reset' },
        ]}
      />

      {/* ── Company Profile ── */}
      <section id="profile" className="mb-10 scroll-mt-20">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-6">Company profile</p>

        <div className="mb-4">
          <label className="block text-sm text-[#6b6b6b] mb-1.5">Company name</label>
          <input
            value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
            placeholder="Acme Corp"
            className={INPUT}
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-[#6b6b6b] mb-1.5">Website</label>
          <input
            value={form.website_url}
            onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
            placeholder="https://..."
            className={INPUT}
          />
        </div>

        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-4">Social profiles</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {SOCIAL_FIELDS.map(({ key, label, ph }) => (
            <div key={key}>
              <label className="block text-sm text-[#6b6b6b] mb-1.5">{label}</label>
              <input
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={ph}
                className={INPUT}
              />
            </div>
          ))}
        </div>

        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1.5">Active channels</p>
        <p className="text-sm text-[#6b6b6b] mb-3">
          The AI generates content only for selected channels.
        </p>
        <div className="flex flex-wrap gap-2 mb-6">
          {ALL_CHANNELS.map(ch => {
            const active = form.preferred_channels.includes(ch.id)
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => setForm(f => ({
                  ...f,
                  preferred_channels: active
                    ? f.preferred_channels.filter(c => c !== ch.id)
                    : [...f.preferred_channels, ch.id],
                }))}
                className={`px-3 py-1.5 text-xs border transition-colors ${
                  active
                    ? 'border-[#1c69d4] bg-[#1c69d4] text-white rounded'
                    : 'border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#262626]'
                }`}>
                {ch.label.toUpperCase()}
              </button>
            )
          })}
        </div>

        <div className="mb-6">
          <label className="block text-sm text-[#6b6b6b] mb-1.5">
            Notes — mission, audience, competitors
          </label>
          <textarea
            value={form.manual_notes}
            onChange={e => setForm(f => ({ ...f, manual_notes: e.target.value }))}
            placeholder="Anything the AI should know that isn't on the website…"
            rows={4}
            className="w-full text-sm border border-[#e6e6e6] px-3 py-2.5 resize-none focus:outline-none focus:border-[#1c69d4] bg-white leading-relaxed"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-[#6b6b6b] mb-1.5">
            Voice examples — paste 3–10 REAL posts (your best X/LinkedIn posts, in your actual voice)
          </label>
          <textarea
            value={form.voice_examples}
            onChange={e => setForm(f => ({ ...f, voice_examples: e.target.value }))}
            placeholder={'One post per block, separated by a blank line, e.g.\n\nAnd if reading\u2019s more your jam:\n\nGreat post about some of the work that @dylanr and @harper are doing\n\nThis was a fun conversation. Tim is so fun to talk to.'}
            rows={7}
            className="w-full text-sm border border-[#e6e6e6] px-3 py-2.5 resize-y focus:outline-none focus:border-[#1c69d4] bg-white leading-relaxed"
          />
          <p className="text-xs text-[#9a9a9a] mt-1.5">
            Every AI writer is told to match these exactly — voice, rhythm, length, casualness. Real examples beat any tone description.
          </p>
        </div>

        <button
          onClick={saveProfile}
          disabled={saving}
          className="px-5 py-2 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : saveMsg ? `✓ ${saveMsg}` : 'Save profile'}
        </button>
      </section>

      <div className="border-t border-[#e6e6e6] mb-10" />

      {/* ── Shared Channels ── */}
      {otherProjects.length > 0 && (
        <section id="shared" className="mb-10 scroll-mt-20">
          <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Shared channels</p>
          <p className="text-sm text-[#6b6b6b] mb-5">
            If this project posts through the same real social accounts as another project,
            link them so scheduling doesn't collide and content generation stays aware of
            what the other project is already posting.
          </p>

          <div className="mb-4">
            <label className="block text-sm text-[#6b6b6b] mb-1.5">Shares channels with</label>
            <select
              value={linkedProjectId}
              onChange={e => setLinkedProjectId(e.target.value)}
              className={INPUT}
            >
              <option value="">— None —</option>
              {otherProjects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {linkedProjectId && (
            <div className="mb-6">
              <label className="block text-sm text-[#6b6b6b] mb-1.5">
                Cap how much of this project's content is about the linked project (%)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={capRatioPct}
                  onChange={e => setCapRatioPct(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                  className="w-20 text-center text-sm border border-[#e6e6e6] py-1.5 focus:outline-none focus:border-[#1c69d4] bg-white rounded"
                />
                <span className="text-xs text-[#9a9a9a]">
                  % of recent posts — content generation steers away from the linked topic above this
                </span>
              </div>
            </div>
          )}

          <button
            onClick={saveLink}
            disabled={savingLink}
            className="px-5 py-2 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded disabled:opacity-50 transition-colors">
            {savingLink ? 'Saving…' : linkMsg ? `✓ ${linkMsg}` : 'Save'}
          </button>
        </section>
      )}

      {otherProjects.length > 0 && <div className="border-t border-[#e6e6e6] mb-10" />}

      {/* ── Knowledge Base ── */}
      <section id="knowledge" className="mb-10 scroll-mt-20">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Knowledge base</p>
        <p className="text-sm text-[#6b6b6b] mb-5">
          Upload files or add links — the AI reads all of this when building your strategy.
        </p>

        {/* drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            Array.from(e.dataTransfer.files).forEach(uploadFile)
          }}
          className="border border-dashed border-[#e6e6e6] p-8 text-center cursor-pointer hover:border-[#1c69d4] transition-colors mb-4">
          {uploading ? (
            <p className="text-xs text-[#6b6b6b]">Processing…</p>
          ) : (
            <>
              <p className="text-sm text-[#6b6b6b] font-medium">Click or drag files here</p>
              <p className="text-xs text-[#9a9a9a] mt-1">PDF · DOCX · TXT · images</p>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp"
            onChange={e => Array.from(e.target.files ?? []).forEach(uploadFile)}
          />
        </div>

        {/* link input */}
        <div className="flex gap-2 mb-4">
          <input
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addLink()}
            placeholder="https://... paste a URL to scrape"
            className="flex-1 text-sm border border-[#e6e6e6] px-3 py-2 focus:outline-none focus:border-[#1c69d4] bg-white"
          />
          <button
            onClick={addLink}
            disabled={!linkInput.trim() || uploading}
            className="px-4 py-2 text-sm border border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#262626] disabled:opacity-40 transition-colors">
            Add link
          </button>
        </div>

        {/* file list */}
        {files.length > 0 && (
          <div className="space-y-px border-t border-[#e6e6e6]">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 py-2.5 border-b border-[#e6e6e6]">
                <span className="text-xs text-[#9a9a9a] uppercase shrink-0 w-8">{f.file_type}</span>
                <p className="text-sm text-[#262626] flex-1 truncate">{f.file_name}</p>
                <button
                  onClick={() => removeFile(f.id)}
                  className="text-[#9a9a9a] hover:text-[#262626] transition-colors shrink-0 text-sm leading-none">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length === 0 && !uploading && (
          <p className="text-xs text-[#9a9a9a]">No files added yet</p>
        )}
      </section>

      {/* error */}
      {error && (
        <div className="mb-6 border border-[#e6e6e6] px-4 py-3">
          <p className="text-sm text-[#6b6b6b]">{error}</p>
        </div>
      )}

      <div className="border-t border-[#e6e6e6] mb-10" />

      {/* ── Generate Strategy ── */}
      <section id="strategy" className="mb-10 scroll-mt-20">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Marketing strategy</p>
        <p className="text-sm text-[#6b6b6b] mb-5">
          {profile
            ? 'Reads your profile, files, and website — takes 30–60 seconds.'
            : 'Save your profile first to enable strategy generation.'}
        </p>

        <button
          onClick={generateStrategy}
          disabled={generating || !profile}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded disabled:opacity-40 transition-colors mb-8">
          {generating
            ? <><span className="animate-spin inline-block">⟳</span> Analyzing and writing strategy…</>
            : 'Analyze & generate strategy'}
        </button>

        {/* ── Strategy body ── */}
        {profile?.strategy && (
          <div>
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                {profile.strategy_updated_at && (
                  <p className="text-xs text-[#9a9a9a]">
                    Generated {new Date(profile.strategy_updated_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
              <div className="flex gap-3 shrink-0">
                {editStrategy ? (
                  <>
                    <button
                      onClick={saveStrategy}
                      disabled={savingStrategy}
                      className="text-xs font-semibold text-[#262626] hover:text-[#6b6b6b] transition-colors disabled:opacity-50">
                      {savingStrategy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditStrategy(false)}
                      className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setStrategyDraft(profile.strategy ?? ''); setEditStrategy(true) }}
                      className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
                      Edit
                    </button>
                    <button
                      onClick={generateStrategy}
                      disabled={generating}
                      className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors disabled:opacity-40">
                      Regenerate
                    </button>
                  </>
                )}
              </div>
            </div>

            {editStrategy ? (
              <textarea
                value={strategyDraft}
                onChange={e => setStrategyDraft(e.target.value)}
                rows={35}
                className="w-full text-sm border border-[#e6e6e6] px-4 py-3 resize-none focus:outline-none focus:border-[#1c69d4] bg-white leading-relaxed"
              />
            ) : (
              <div className="text-sm text-[#262626] leading-relaxed">
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => (
                      <h2 className="text-sm font-semibold text-[#262626] mt-7 mb-2 pb-1 border-b border-[#e6e6e6] first:mt-0">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-[#3A3A3A] mt-4 mb-1">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-3 text-[#262626] leading-relaxed">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-3 space-y-1.5 pl-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-3 space-y-1.5 pl-4 list-decimal">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed text-[#262626]">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-[#262626]">{children}</strong>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full text-sm border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="border-b border-[#e6e6e6]">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[#6b6b6b] border border-[#e6e6e6]">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-[#262626] border border-[#e6e6e6]">{children}</td>
                    ),
                    hr: () => <hr className="my-5 border-[#e6e6e6]" />,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-[#9a9a9a] pl-4 my-3 text-[#6b6b6b]">{children}</blockquote>
                    ),
                  }}
                >
                  {profile.strategy}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="border-t border-[#e6e6e6] mb-10" />

      {/* ── Content Generation Frequency ── */}
      <section id="frequency" className="mb-10 scroll-mt-20">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Content generation</p>
        <p className="text-sm text-[#6b6b6b] mb-5">
          How often new drafts are written automatically and sent to Drafts for your approval.
        </p>

        <div className="flex gap-2 flex-wrap mb-5">
          {[
            { value: 'daily',        label: 'Daily',        sub: 'A new batch every day' },
            { value: 'every_3_days', label: 'Every 3 days', sub: 'A few times a week' },
            { value: 'weekly',       label: 'Weekly',        sub: 'Once a week' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGenFrequency(opt.value)}
              className={`px-4 py-2.5 text-sm rounded border transition-all text-left ${
                genFrequency === opt.value ? 'border-[#1c69d4] bg-[#f7f7f7] text-[#1c69d4]' : 'border-[#e6e6e6] text-[#3c3c3c] hover:border-[#1c69d4]'
              }`}>
              <span className="font-semibold block">{opt.label}</span>
              <span className="block text-[10px] text-[#6b6b6b] mt-0.5">{opt.sub}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 mb-2">
          <span className="text-xs text-[#6b6b6b] shrink-0">Topics per run</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTopicsPerRun(n => Math.max(1, n - 1))}
              className="w-7 h-7 border border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#262626] flex items-center justify-center transition-colors text-sm">
              −
            </button>
            <input
              type="number"
              min={1}
              max={15}
              value={topicsPerRun}
              onChange={e => setTopicsPerRun(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
              className="w-12 text-center text-sm border border-[#e6e6e6] py-1 focus:outline-none focus:border-[#1c69d4] bg-white"
            />
            <button
              type="button"
              onClick={() => setTopicsPerRun(n => Math.min(15, n + 1))}
              className="w-7 h-7 border border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#262626] flex items-center justify-center transition-colors text-sm">
              +
            </button>
          </div>
        </div>
        <p className="text-xs text-[#9a9a9a] mb-5">
          ≈ {Math.round(topicsPerRun * AVG_CHANNELS_PER_TOPIC * (RUNS_PER_WEEK[genFrequency] ?? 1))} posts/week across your channels — tune this until the estimate matches what you actually want to post
        </p>

        <button
          onClick={saveGenFrequency}
          disabled={savingGenFrequency}
          className={`px-5 py-2 text-white text-sm font-semibold rounded disabled:opacity-50 transition-colors ${
            genFrequencyMsg.startsWith('Error') ? 'bg-[#dc2626] hover:bg-[#b91c1c]' : 'bg-[#1c69d4] hover:bg-[#0653b6]'
          }`}>
          {savingGenFrequency ? 'Saving…' : genFrequencyMsg ? (genFrequencyMsg.startsWith('Error') ? genFrequencyMsg : `✓ ${genFrequencyMsg}`) : 'Save frequency'}
        </button>
      </section>

      <div className="border-t border-[#e6e6e6] mb-10" />

      {/* ── Content Pillars ── */}
      <section id="pillars" className="mb-10 scroll-mt-20">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Content pillars</p>
        <p className="text-sm text-[#6b6b6b] mb-5">
          Durable themes that bias topic selection this cycle — one can be a specific product to focus on,
          without re-running research. Approved via Slack, not here.
        </p>

        {!pillarsLoading && pillars.length === 0 && (
          <p className="text-xs text-[#9a9a9a] mb-5">
            No pillars active yet — generate a narrative brief and approve it in Slack.
          </p>
        )}

        {pillars.length > 0 && (
          <div className="border border-[#e6e6e6] rounded mb-5">
            {pillars.map((p, i) => (
              <div key={p.id} className={`px-5 py-3.5 ${i < pillars.length - 1 ? 'border-b border-[#f7f7f7]' : ''}`}>
                <div className="flex items-center gap-2.5 mb-1">
                  <span className="text-sm font-semibold text-[#262626]">{p.name}</span>
                  <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border ${
                    p.pillar_type === 'product' ? 'border-[#1c69d4] text-[#1c69d4]' : 'border-[#e6e6e6] text-[#6b6b6b]'
                  }`}>
                    {p.pillar_type}
                  </span>
                  <span className="text-[10px] text-[#9a9a9a]">target {Math.round(p.target_ratio * 100)}%</span>
                </div>
                {p.description && <p className="text-xs text-[#6b6b6b]">{p.description}</p>}
              </div>
            ))}
          </div>
        )}

        {briefLog.length > 0 && (
          <div className="mb-5 border border-[#e6e6e6] overflow-hidden rounded">
            <div className="bg-[#1a2129] text-[#cccccc] text-xs leading-6 px-5 py-4 h-32 overflow-y-auto">
              {briefLog.map(l => (
                <div key={l.id} className={l.isError ? 'text-[#9a9a9a]' : ''}>{l.text}</div>
              ))}
              {briefRunning && <span className="text-[#3c3c3c] animate-pulse">▌</span>}
            </div>
          </div>
        )}

        <button
          onClick={runNarrativeBrief}
          disabled={briefRunning}
          className="px-5 py-2 bg-[#1c69d4] text-white text-sm font-semibold hover:bg-[#0653b6] rounded disabled:opacity-50 transition-colors">
          {briefRunning ? 'Generating…' : 'Generate narrative brief now'}
        </button>
      </section>

      <div className="border-t border-[#e6e6e6] mb-10" />

      {/* ── Posting Cadence ── */}
      <section id="cadence" className="mb-10 scroll-mt-20">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Posting cadence</p>
        <p className="text-sm text-[#6b6b6b] mb-5">
          How many times per week to post on each channel. Generated automatically with your strategy — edit freely.
        </p>

        <div className="space-y-3 mb-5">
          {form.preferred_channels.map(ch => {
            const label = ALL_CHANNELS.find(c => c.id === ch)?.label ?? ch
            const val   = cadence[ch] ?? 0
            return (
              <div key={ch} className="flex items-center gap-4">
                <span className="text-xs text-[#6b6b6b] w-20 shrink-0">{label}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCadence(c => ({ ...c, [ch]: Math.max(0, (c[ch] ?? 0) - 1) }))}
                    className="w-7 h-7 border border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#262626] flex items-center justify-center transition-colors text-sm">
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={14}
                    value={val}
                    onChange={e => setCadence(c => ({ ...c, [ch]: Math.max(0, Math.min(14, parseInt(e.target.value) || 0)) }))}
                    className="w-12 text-center text-sm border border-[#e6e6e6] py-1 focus:outline-none focus:border-[#1c69d4] bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setCadence(c => ({ ...c, [ch]: Math.min(14, (c[ch] ?? 0) + 1) }))}
                    className="w-7 h-7 border border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#262626] flex items-center justify-center transition-colors text-sm">
                    +
                  </button>
                  <span className="text-xs text-[#9a9a9a]">posts/week</span>
                </div>
              </div>
            )
          })}
        </div>

        {form.preferred_channels.length === 0 && (
          <p className="text-xs text-[#9a9a9a] mb-5">Select active channels above to set cadence.</p>
        )}

        <button
          onClick={saveCadence}
          disabled={savingCadence || form.preferred_channels.length === 0}
          className={`px-5 py-2 text-white text-sm font-semibold rounded disabled:opacity-50 transition-colors ${
            cadenceMsg.startsWith('Error') ? 'bg-[#dc2626] hover:bg-[#b91c1c]' : 'bg-[#1c69d4] hover:bg-[#0653b6]'
          }`}>
          {savingCadence ? 'Saving…' : cadenceMsg ? (cadenceMsg.startsWith('Error') ? cadenceMsg : `✓ ${cadenceMsg}`) : 'Save cadence'}
        </button>
      </section>

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      <section id="danger" className="mt-16 pt-8 border-t border-[#e6e6e6] scroll-mt-20">
        <h2 className="text-sm font-semibold text-[#262626] uppercase tracking-widest mb-1">
          Danger Zone
        </h2>
        <p className="text-sm text-[#6b6b6b] mb-6">
          Wipe all pipeline data to start fresh. Your brand profile, strategy, and voice settings are kept.
          Everything else — drafts, research pool, published history — is permanently deleted.
        </p>

        <div className="border border-[#e6e6e6] px-5 py-5">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-[#262626] mb-1">Reset all pipeline data</p>
              <p className="text-xs text-[#6b6b6b] leading-relaxed">
                Deletes: all drafts · all research candidates · all published post history<br />
                Resets: website scrape timestamp · strategy generation timestamp<br />
                Keeps: brand profile · social URLs · content strategy · brand voice
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {resetStep === 0 && !resetDone && (
                <button
                  onClick={() => { setResetStep(1); setResetErr('') }}
                  className="text-xs px-4 py-2 border border-[#e6e6e6] text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#262626] transition-colors">
                  Reset everything
                </button>
              )}

              {resetStep === 1 && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-[#262626]">This cannot be undone.</p>
                  <button
                    onClick={() => setResetStep(2)}
                    className="text-xs px-4 py-2 border border-[#e6e6e6] text-[#262626] hover:bg-[#f7f7f7] hover:text-[#1c69d4] hover:border-[#1c69d4] rounded transition-colors">
                    Yes, I'm sure
                  </button>
                  <button
                    onClick={() => setResetStep(0)}
                    className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
                    Cancel
                  </button>
                </div>
              )}

              {resetStep === 2 && (
                <div className="flex items-center gap-3">
                  <p className="text-xs font-semibold text-[#262626]">Last chance — delete everything?</p>
                  <button
                    disabled={resetting}
                    onClick={async () => {
                      setResetting(true)
                      setResetErr('')
                      const res = await fetch('/api/reset', { method: 'DELETE' })
                      const json = await res.json().catch(() => ({}))
                      setResetting(false)
                      setResetStep(0)
                      if (res.ok) {
                        setResetDone(
                          `Cleared — ${json.deleted?.drafts ?? 0} drafts, ` +
                          `${json.deleted?.research ?? 0} research items, ` +
                          `${json.deleted?.published ?? 0} published posts`
                        )
                      } else {
                        setResetErr(json.errors?.join(', ') ?? 'Reset failed')
                      }
                    }}
                    className="text-xs px-4 py-2 bg-[#DC2626] text-white hover:bg-[#B91C1C] rounded disabled:opacity-40 transition-colors">
                    {resetting ? 'Deleting…' : 'Delete everything'}
                  </button>
                  <button
                    onClick={() => setResetStep(0)}
                    className="text-xs text-[#6b6b6b] hover:text-[#262626] transition-colors">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {resetDone && (
            <p className="text-xs text-[#6b6b6b] mt-4 pt-4 border-t border-[#f7f7f7]">
              ✓ {resetDone}
            </p>
          )}
          {resetErr && (
            <p className="text-xs text-[#6b6b6b] mt-4 pt-4 border-t border-[#f7f7f7]">
              Error: {resetErr}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
