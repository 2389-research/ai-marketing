'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import type { BrandProfile, BrandFile } from '@/lib/supabase'

// ── constants ─────────────────────────────────────────────────────────────────

const SOCIAL_FIELDS = [
  { key: 'linkedin_url',  label: 'LinkedIn',  ph: 'https://linkedin.com/company/...' },
  { key: 'instagram_url', label: 'Instagram', ph: 'https://instagram.com/...' },
  { key: 'tiktok_url',    label: 'TikTok',    ph: 'https://tiktok.com/@...' },
  { key: 'youtube_url',   label: 'YouTube',   ph: 'https://youtube.com/@...' },
  { key: 'x_url',         label: 'X',         ph: 'https://x.com/...' },
] as const

const ALL_CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn'  },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email',     label: 'Email'     },
  { id: 'tiktok',    label: 'TikTok'    },
  { id: 'youtube',   label: 'YouTube'   },
  { id: 'x',         label: 'X'         },
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

// ── shared input classes ──────────────────────────────────────────────────────

const INPUT = 'w-full text-sm border border-[#E2E1DE] px-3 py-2.5 focus:outline-none focus:border-[#3A3A3A] bg-white'

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
  const [error, setError]               = useState('')
  const [saveMsg, setSaveMsg]           = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
    if (!profile) { setError('Save your profile first.'); return }
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
        <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-5 sm:px-8 lg:px-10 py-8 lg:py-10 max-w-2xl w-full">

      {/* header */}
      <div className="mb-10 pb-6 border-b border-[#E2E1DE]">
        <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Brand</h1>
        <p className="text-base text-[#888880] mt-1.5">
          Company profile, knowledge base, and AI marketing strategy
        </p>
      </div>

      {/* ── Company Profile ── */}
      <section className="mb-10">
        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-6">Company profile</p>

        <div className="mb-4">
          <label className="block text-sm text-[#888880] mb-1.5">Company name</label>
          <input
            value={form.company_name}
            onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
            placeholder="Acme Corp"
            className={INPUT}
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm text-[#888880] mb-1.5">Website</label>
          <input
            value={form.website_url}
            onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
            placeholder="https://..."
            className={INPUT}
          />
        </div>

        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-4">Social profiles</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {SOCIAL_FIELDS.map(({ key, label, ph }) => (
            <div key={key}>
              <label className="block text-sm text-[#888880] mb-1.5">{label}</label>
              <input
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={ph}
                className={INPUT}
              />
            </div>
          ))}
        </div>

        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-1.5">Active channels</p>
        <p className="text-sm text-[#888880] mb-3">
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
                className={`px-3 py-1.5 font-mono text-xs border transition-colors ${
                  active
                    ? 'border-[#111111] bg-[#111111] text-white'
                    : 'border-[#E2E1DE] text-[#888880] hover:border-[#3A3A3A] hover:text-[#111111]'
                }`}>
                {ch.label.toUpperCase()}
              </button>
            )
          })}
        </div>

        <div className="mb-6">
          <label className="block text-sm text-[#888880] mb-1.5">
            Notes — mission, audience, competitors
          </label>
          <textarea
            value={form.manual_notes}
            onChange={e => setForm(f => ({ ...f, manual_notes: e.target.value }))}
            placeholder="Anything the AI should know that isn't on the website…"
            rows={4}
            className="w-full text-sm border border-[#E2E1DE] px-3 py-2.5 resize-none focus:outline-none focus:border-[#3A3A3A] bg-white leading-relaxed"
          />
        </div>

        <button
          onClick={saveProfile}
          disabled={saving}
          className="px-5 py-2 bg-[#111111] text-white text-sm font-semibold hover:bg-[#3A3A3A] disabled:opacity-50 transition-colors">
          {saving ? 'Saving…' : saveMsg ? `✓ ${saveMsg}` : 'Save profile'}
        </button>
      </section>

      <div className="border-t border-[#E2E1DE] mb-10" />

      {/* ── Knowledge Base ── */}
      <section className="mb-10">
        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-1">Knowledge base</p>
        <p className="text-sm text-[#888880] mb-5">
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
          className="border border-dashed border-[#E2E1DE] p-8 text-center cursor-pointer hover:border-[#3A3A3A] transition-colors mb-4">
          {uploading ? (
            <p className="font-mono text-xs text-[#888880]">Processing…</p>
          ) : (
            <>
              <p className="text-sm text-[#888880] font-medium">Click or drag files here</p>
              <p className="font-mono text-xs text-[#BBBBBB] mt-1">PDF · DOCX · TXT · images</p>
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
            className="flex-1 text-sm border border-[#E2E1DE] px-3 py-2 focus:outline-none focus:border-[#3A3A3A] bg-white"
          />
          <button
            onClick={addLink}
            disabled={!linkInput.trim() || uploading}
            className="px-4 py-2 text-sm border border-[#E2E1DE] text-[#888880] hover:border-[#3A3A3A] hover:text-[#111111] disabled:opacity-40 transition-colors">
            Add link
          </button>
        </div>

        {/* file list */}
        {files.length > 0 && (
          <div className="space-y-px border-t border-[#E2E1DE]">
            {files.map(f => (
              <div key={f.id} className="flex items-center gap-3 py-2.5 border-b border-[#E2E1DE]">
                <span className="font-mono text-xs text-[#BBBBBB] uppercase shrink-0 w-8">{f.file_type}</span>
                <p className="text-sm text-[#111111] flex-1 truncate">{f.file_name}</p>
                <button
                  onClick={() => removeFile(f.id)}
                  className="text-[#BBBBBB] hover:text-[#111111] transition-colors shrink-0 text-sm leading-none">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length === 0 && !uploading && (
          <p className="font-mono text-xs text-[#BBBBBB]">No files added yet</p>
        )}
      </section>

      {/* error */}
      {error && (
        <div className="mb-6 border border-[#E2E1DE] px-4 py-3">
          <p className="text-sm text-[#888880]">{error}</p>
        </div>
      )}

      <div className="border-t border-[#E2E1DE] mb-10" />

      {/* ── Generate Strategy ── */}
      <section className="mb-10">
        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-1">Marketing strategy</p>
        <p className="text-sm text-[#888880] mb-5">
          {profile
            ? 'Reads your profile, files, and website — takes 30–60 seconds.'
            : 'Save your profile first to enable strategy generation.'}
        </p>

        <button
          onClick={generateStrategy}
          disabled={generating || !profile}
          className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-[#111111] text-white text-sm font-semibold hover:bg-[#3A3A3A] disabled:opacity-40 transition-colors mb-8">
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
                  <p className="font-mono text-xs text-[#BBBBBB]">
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
                      className="text-xs font-semibold text-[#111111] hover:text-[#888880] transition-colors disabled:opacity-50">
                      {savingStrategy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditStrategy(false)}
                      className="text-xs text-[#888880] hover:text-[#111111] transition-colors">
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setStrategyDraft(profile.strategy ?? ''); setEditStrategy(true) }}
                      className="text-xs text-[#888880] hover:text-[#111111] transition-colors">
                      Edit
                    </button>
                    <button
                      onClick={generateStrategy}
                      disabled={generating}
                      className="text-xs text-[#888880] hover:text-[#111111] transition-colors disabled:opacity-40">
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
                className="w-full font-mono text-sm border border-[#E2E1DE] px-4 py-3 resize-none focus:outline-none focus:border-[#3A3A3A] bg-white leading-relaxed"
              />
            ) : (
              <div className="text-sm text-[#111111] leading-relaxed">
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => (
                      <h2 className="text-sm font-semibold text-[#111111] mt-7 mb-2 pb-1 border-b border-[#E2E1DE] first:mt-0">{children}</h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-[#3A3A3A] mt-4 mb-1">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="mb-3 text-[#111111] leading-relaxed">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="mb-3 space-y-1.5 pl-1">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="mb-3 space-y-1.5 pl-4 list-decimal">{children}</ol>
                    ),
                    li: ({ children }) => (
                      <li className="leading-relaxed text-[#111111]">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-[#111111]">{children}</strong>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full text-sm border-collapse">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="border-b border-[#E2E1DE]">{children}</thead>
                    ),
                    th: ({ children }) => (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-[#888880] border border-[#E2E1DE]">{children}</th>
                    ),
                    td: ({ children }) => (
                      <td className="px-3 py-2 text-[#111111] border border-[#E2E1DE]">{children}</td>
                    ),
                    hr: () => <hr className="my-5 border-[#E2E1DE]" />,
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-2 border-[#BBBBBB] pl-4 my-3 text-[#888880]">{children}</blockquote>
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

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      <section className="mt-16 pt-8 border-t border-[#E2E1DE]">
        <h2 className="text-sm font-semibold text-[#111111] uppercase tracking-widest mb-1">
          Danger Zone
        </h2>
        <p className="text-sm text-[#888880] mb-6">
          Wipe all pipeline data to start fresh. Your brand profile, strategy, and voice settings are kept.
          Everything else — drafts, research pool, published history — is permanently deleted.
        </p>

        <div className="border border-[#E2E1DE] px-5 py-5">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-[#111111] mb-1">Reset all pipeline data</p>
              <p className="text-xs text-[#888880] leading-relaxed">
                Deletes: all drafts · all research candidates · all published post history<br />
                Resets: website scrape timestamp · strategy generation timestamp<br />
                Keeps: brand profile · social URLs · content strategy · brand voice
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {resetStep === 0 && !resetDone && (
                <button
                  onClick={() => { setResetStep(1); setResetErr('') }}
                  className="font-mono text-xs px-4 py-2 border border-[#E2E1DE] text-[#888880] hover:border-[#3A3A3A] hover:text-[#111111] transition-colors">
                  Reset everything
                </button>
              )}

              {resetStep === 1 && (
                <div className="flex items-center gap-3">
                  <p className="font-mono text-xs text-[#111111]">This cannot be undone.</p>
                  <button
                    onClick={() => setResetStep(2)}
                    className="font-mono text-xs px-4 py-2 border border-[#888880] text-[#111111] hover:bg-[#111111] hover:text-white transition-colors">
                    Yes, I'm sure
                  </button>
                  <button
                    onClick={() => setResetStep(0)}
                    className="font-mono text-xs text-[#888880] hover:text-[#111111] transition-colors">
                    Cancel
                  </button>
                </div>
              )}

              {resetStep === 2 && (
                <div className="flex items-center gap-3">
                  <p className="font-mono text-xs font-semibold text-[#111111]">Last chance — delete everything?</p>
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
                    className="font-mono text-xs px-4 py-2 bg-[#111111] text-white hover:bg-[#3A3A3A] disabled:opacity-40 transition-colors">
                    {resetting ? 'Deleting…' : 'Delete everything'}
                  </button>
                  <button
                    onClick={() => setResetStep(0)}
                    className="font-mono text-xs text-[#888880] hover:text-[#111111] transition-colors">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {resetDone && (
            <p className="font-mono text-xs text-[#888880] mt-4 pt-4 border-t border-[#F0EFEC]">
              ✓ {resetDone}
            </p>
          )}
          {resetErr && (
            <p className="font-mono text-xs text-[#888880] mt-4 pt-4 border-t border-[#F0EFEC]">
              Error: {resetErr}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
