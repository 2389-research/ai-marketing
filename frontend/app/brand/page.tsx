'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import type { BrandProfile, BrandFile } from '@/lib/supabase'

// ── constants ─────────────────────────────────────────────────────────────────

const FILE_ICONS: Record<string, string> = {
  pdf:   '📄',
  docx:  '📝',
  text:  '📃',
  image: '🖼',
  link:  '🔗',
}

const SOCIAL_FIELDS = [
  { key: 'linkedin_url',  label: 'LinkedIn',  color: 'text-blue-600',  ph: 'https://linkedin.com/company/...' },
  { key: 'instagram_url', label: 'Instagram', color: 'text-pink-600',  ph: 'https://instagram.com/...' },
  { key: 'tiktok_url',    label: 'TikTok',    color: 'text-gray-800',  ph: 'https://tiktok.com/@...' },
  { key: 'youtube_url',   label: 'YouTube',   color: 'text-red-600',   ph: 'https://youtube.com/@...' },
  { key: 'x_url',         label: 'X',         color: 'text-gray-900',  ph: 'https://x.com/...' },
] as const

const ALL_CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn',  cls: 'bg-blue-100 border-blue-400 text-blue-800'    },
  { id: 'instagram', label: 'Instagram', cls: 'bg-pink-100 border-pink-400 text-pink-800'    },
  { id: 'email',     label: 'Email',     cls: 'bg-amber-100 border-amber-400 text-amber-800' },
  { id: 'tiktok',    label: 'TikTok',    cls: 'bg-cyan-100 border-cyan-400 text-cyan-800'    },
  { id: 'youtube',   label: 'YouTube',   cls: 'bg-red-100 border-red-400 text-red-800'       },
  { id: 'x',         label: 'X',         cls: 'bg-gray-900 border-gray-900 text-white'        },
]

type FormState = {
  company_name: string
  website_url: string
  linkedin_url: string
  instagram_url: string
  tiktok_url: string
  youtube_url: string
  x_url: string
  manual_notes: string
  preferred_channels: string[]
}

const EMPTY_FORM: FormState = {
  company_name: '', website_url: '', linkedin_url: '',
  instagram_url: '', tiktok_url: '', youtube_url: '', x_url: '', manual_notes: '',
  preferred_channels: ['linkedin', 'instagram', 'email', 'tiktok', 'youtube', 'x'],
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BrandPage() {
  const [profile, setProfile]       = useState<BrandProfile | null>(null)
  const [files, setFiles]           = useState<BrandFile[]>([])
  const [form, setForm]             = useState<FormState>(EMPTY_FORM)
  const [linkInput, setLinkInput]   = useState('')
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [uploading, setUploading]   = useState(false)
  const [generating, setGenerating] = useState(false)
  const [editStrategy, setEditStrategy] = useState(false)
  const [strategyDraft, setStrategyDraft] = useState('')
  const [savingStrategy, setSavingStrategy] = useState(false)
  const [error, setError]           = useState('')
  const [saveMsg, setSaveMsg]       = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
        manual_notes:       p.manual_notes       ?? '',
        preferred_channels: p.preferred_channels ?? ['linkedin', 'instagram', 'email', 'tiktok', 'youtube', 'x'],
      })
    }
  }, [])

  const loadFiles = useCallback(async () => {
    const res = await fetch('/api/brand/files')
    const { files: f } = await res.json()
    setFiles(f ?? [])
  }, [])

  useEffect(() => {
    Promise.all([loadProfile(), loadFiles()]).finally(() => setLoading(false))
  }, [loadProfile, loadFiles])

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
    if (!profile) {
      setError('Save your profile first.')
      return
    }
    setGenerating(true)
    setError('')
    const res = await fetch('/api/brand/generate-strategy', { method: 'POST' })
    const { strategy, profile: updated, error: err } = await res.json()
    setGenerating(false)
    if (err) { setError(err); return }
    setProfile(updated ?? (profile ? { ...profile, strategy, strategy_updated_at: new Date().toISOString() } : null))
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
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-3xl">

      {/* header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Brand</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Company profile, knowledge base and AI marketing strategy
        </p>
      </div>

      {/* ── Company Profile ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-5">Company Profile</p>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Company name</label>
          <input
            value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
            placeholder="2389 Research"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Website</label>
          <input
            value={form.website_url}
            onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
            placeholder="https://..."
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Social profiles</p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {SOCIAL_FIELDS.map(({ key, label, color, ph }) => (
            <div key={key}>
              <label className={`block text-xs font-semibold mb-1.5 ${color}`}>{label}</label>
              <input
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={ph}
                className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          ))}
        </div>

        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Active channels</p>
        <p className="text-xs text-gray-400 mb-3">
          Toggle which channels you actually use. The AI will only generate content and suggest posts for selected channels.
        </p>
        <div className="flex flex-wrap gap-2 mb-5">
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
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-colors ${
                  active ? ch.cls : 'border-gray-200 text-gray-400 hover:border-gray-300'
                }`}>
                {ch.label}
              </button>
            )
          })}
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Notes — mission, values, audience, products, competitors, events
          </label>
          <textarea
            value={form.manual_notes}
            onChange={e => setForm(f => ({ ...f, manual_notes: e.target.value }))}
            placeholder="Anything the AI should know about your company that isn't on the website..."
            rows={4}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <button
          onClick={saveProfile}
          disabled={saving}
          className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : saveMsg ? `✓ ${saveMsg}` : 'Save profile'}
        </button>
      </div>

      {/* ── Knowledge Base ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Knowledge Base</p>
        <p className="text-xs text-gray-400 mb-5">
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
          className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors mb-4">
          {uploading ? (
            <p className="text-sm text-blue-600 font-medium">Processing…</p>
          ) : (
            <>
              <p className="text-2xl mb-2">📁</p>
              <p className="text-sm text-gray-600 font-medium">Click or drag files here</p>
              <p className="text-xs text-gray-400 mt-1">PDF, Word (.docx), plain text, images</p>
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
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={addLink}
            disabled={!linkInput.trim() || uploading}
            className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-40 transition-colors">
            Add link
          </button>
        </div>

        {/* file list */}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                <span className="shrink-0">{FILE_ICONS[f.file_type] ?? '📎'}</span>
                <p className="text-sm text-gray-700 flex-1 truncate">{f.file_name}</p>
                <span className="text-xs text-gray-400 shrink-0 uppercase">{f.file_type}</span>
                <button
                  onClick={() => removeFile(f.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors shrink-0 text-sm">
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length === 0 && !uploading && (
          <p className="text-xs text-gray-400 text-center py-2">No files added yet</p>
        )}
      </div>

      {/* error */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ── Generate button ── */}
      <button
        onClick={generateStrategy}
        disabled={generating || !profile}
        className="w-full flex items-center justify-center gap-2.5 px-6 py-4 bg-blue-600 text-white text-sm font-semibold rounded-2xl hover:bg-blue-700 disabled:opacity-50 transition-colors mb-2">
        {generating
          ? <><span className="animate-spin inline-block">⟳</span> Analyzing everything and writing strategy…</>
          : <>🧠 Analyze & Generate Marketing Strategy</>}
      </button>
      <p className="text-xs text-gray-400 text-center mb-6">
        {profile
          ? 'Reads your profile, files, and website — takes 30–60 seconds'
          : 'Save your profile first to enable strategy generation'}
      </p>

      {/* ── Strategy ── */}
      {profile?.strategy && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Marketing Strategy</p>
              {profile.strategy_updated_at && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Generated {new Date(profile.strategy_updated_at).toLocaleString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {editStrategy ? (
                <>
                  <button
                    onClick={saveStrategy}
                    disabled={savingStrategy}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {savingStrategy ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    onClick={() => setEditStrategy(false)}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setStrategyDraft(profile.strategy ?? ''); setEditStrategy(true) }}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50">
                    Edit
                  </button>
                  <button
                    onClick={generateStrategy}
                    disabled={generating}
                    className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
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
              className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono leading-relaxed"
            />
          ) : (
            <div className="strategy-body text-sm text-gray-700 leading-relaxed">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => (
                    <h2 className="text-base font-bold text-gray-900 mt-7 mb-2 pb-1 border-b border-gray-100 first:mt-0">{children}</h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-1">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="mb-3 leading-relaxed">{children}</p>
                  ),
                  ul: ({ children }) => (
                    <ul className="mb-3 space-y-1.5 pl-1">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-3 space-y-1.5 pl-4 list-decimal">{children}</ol>
                  ),
                  li: ({ children }) => (
                    <li className="leading-relaxed text-gray-700">{children}</li>
                  ),
                  strong: ({ children }) => (
                    <strong className="font-semibold text-gray-900">{children}</strong>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto mb-4">
                      <table className="w-full text-sm border-collapse">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-gray-50">{children}</thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border border-gray-200">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-3 py-2 text-gray-700 border border-gray-200">{children}</td>
                  ),
                  hr: () => <hr className="my-5 border-gray-100" />,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-blue-200 pl-4 my-3 text-gray-600 italic">{children}</blockquote>
                  ),
                }}
              >
                {profile.strategy}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
