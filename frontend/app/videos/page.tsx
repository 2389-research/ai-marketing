'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveActiveProjectClient } from '@/lib/project'

interface Video {
  id: string
  filename: string
  storage_path: string
  public_url: string
  created_at: string
}

interface Segment {
  start: number
  end: number
  reason: string
  preview: string
}

interface AnalysisResult {
  duration: number
  transcript_segments: { start: number; end: number; text: string }[]
  segments: Segment[]
}

interface GeneratedClip {
  index: number
  clip_url?: string
  storage_path?: string
  error?: string
  segment: Segment
}

interface EditOptions {
  fade: boolean
  enhance: boolean
  clean_speech: boolean
  text_overlay: string
  music: 'none' | 'upbeat' | 'calm' | 'cinematic'
}

const DURATIONS = [15, 30, 60, 90]
const ASPECTS   = [
  { value: '16:9', label: '16:9', sub: 'Horizontal — LinkedIn, YouTube' },
  { value: '9:16', label: '9:16', sub: 'Vertical — TikTok, Reels' },
  { value: '1:1',  label: '1:1',  sub: 'Square — Instagram' },
]
const MUSIC_OPTS = [
  { value: 'none',       label: 'No music',    sub: 'Speech only' },
  { value: 'upbeat',     label: 'Upbeat',       sub: 'Energetic / product demo' },
  { value: 'calm',       label: 'Calm',         sub: 'Ambient / thought-leadership' },
  { value: 'cinematic',  label: 'Cinematic',    sub: 'Dramatic / brand story' },
]

function fmtSec(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function Toggle({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 cursor-pointer" onClick={onClick}>
      <div className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-[#7C3AED]' : 'bg-[#E4E4E7]'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#111111]">{label}</p>
        {sub && <p className="font-mono text-xs text-[#888880]">{sub}</p>}
      </div>
    </div>
  )
}

// ── video card ─────────────────────────────────────────────────────────────────

function VideoCard({ video, selected, onSelect, onDelete }: {
  video: Video; selected: boolean; onSelect: () => void; onDelete: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`group relative border rounded-xl p-4 cursor-pointer transition-all ${
        selected ? 'border-[#7C3AED] bg-[#F5F3FF]' : 'border-[#EBEBEB] bg-white hover:border-[#C4B5FD]'
      }`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#EDE9FE] flex items-center justify-center shrink-0">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#7C3AED" strokeWidth="1.5">
            <path d="M15 10l4.553-2.277A1 1 0 0121 8.72v6.56a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#111111] truncate">{video.filename}</p>
          <p className="font-mono text-xs text-[#BBBBBB]">
            {new Date(video.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="absolute top-2 right-2 w-5 h-5 hidden group-hover:flex items-center justify-center text-[#BBBBBB] hover:text-[#DC2626] transition-colors text-xs">
        ×
      </button>
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────────

export default function VideosPage() {
  const [videos, setVideos]     = useState<Video[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [selected, setSelected] = useState<Video | null>(null)

  // step 1 — analyze
  const [targetDuration, setTargetDuration] = useState(30)
  const [customDuration, setCustomDuration] = useState('')
  const [analyzing, setAnalyzing]   = useState(false)
  const [analyzeErr, setAnalyzeErr] = useState('')
  const [analysis, setAnalysis]     = useState<AnalysisResult | null>(null)

  // step 2 — segment selection
  const [pickedSegment, setPickedSegment] = useState<Segment | null>(null)
  const [manualStart, setManualStart]     = useState('')
  const [manualEnd, setManualEnd]         = useState('')

  // step 3 — editing options
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [captions, setCaptions]       = useState(true)
  const [editOpts, setEditOpts]       = useState<EditOptions>({
    fade: true, enhance: false, clean_speech: true, text_overlay: '', music: 'none',
  })

  // generation
  const [generating, setGenerating]         = useState(false)
  const [batchGenerating, setBatchGenerating] = useState(false)
  const [generateErr, setGenerateErr]       = useState('')
  const [generatedClips, setGeneratedClips] = useState<GeneratedClip[]>([])

  const load = async () => {
    setLoading(true)
    const res  = await fetch('/api/videos')
    const data = await res.json()
    setVideos(res.ok && Array.isArray(data) ? data : [])
    if (!res.ok) setUploadErr(data.error ?? 'Failed to load videos')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resetEditor = () => {
    setAnalysis(null); setPickedSegment(null)
    setManualStart(''); setManualEnd('')
    setGeneratedClips([]); setAnalyzeErr(''); setGenerateErr('')
  }

  const handleSelect = (v: Video) => { setSelected(v); resetEditor() }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true); setUploadErr('')
    try {
      const pid = await resolveActiveProjectClient()
      for (const file of Array.from(files)) {
        if (file.size / 1024 / 1024 > 500) {
          setUploadErr(`"${file.name}" is too large (500MB max).`); continue
        }
        const storagePath = `${pid ? `${pid}/` : ''}${Date.now()}-${file.name.replace(/\s+/g, '-')}`
        const { error } = await supabase.storage.from('video-library').upload(storagePath, file, { contentType: file.type })
        if (error) { setUploadErr(`Upload failed: ${error.message}`); continue }
        const { data: urlData } = supabase.storage.from('video-library').getPublicUrl(storagePath)
        const res = await fetch('/api/videos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, storage_path: storagePath, public_url: urlData.publicUrl }),
        })
        if (!res.ok) { const j = await res.json().catch(() => ({})); setUploadErr(j.error ?? 'Failed to save metadata') }
      }
    } catch (err: any) {
      setUploadErr(err?.message ?? 'Unexpected error')
    } finally {
      setUploading(false); load()
    }
  }

  const handleDelete = async (video: Video) => {
    await fetch('/api/videos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: video.id, storage_path: video.storage_path }) })
    if (selected?.id === video.id) { setSelected(null); resetEditor() }
    setVideos(vs => vs.filter(v => v.id !== video.id))
  }

  const handleAnalyze = async () => {
    if (!selected) return
    const dur = customDuration ? parseInt(customDuration) : targetDuration
    setAnalyzing(true); setAnalyzeErr(''); setAnalysis(null); setPickedSegment(null); setGeneratedClips([])
    const res = await fetch('/api/videos/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: selected.public_url, target_duration: dur }),
    })
    const data = await res.json()
    setAnalyzing(false)
    if (!res.ok) { setAnalyzeErr(data.error ?? 'Analysis failed'); return }
    setAnalysis(data)
  }

  const buildPayload = (segs: Segment[]) => ({
    video_url: selected!.public_url,
    segments: segs,
    aspect_ratio: aspectRatio,
    captions,
    transcript_segments: analysis!.transcript_segments,
    options: { ...editOpts },
  })

  const handleGenerateAll = async () => {
    if (!selected || !analysis) return
    setBatchGenerating(true); setGenerateErr(''); setGeneratedClips([])
    const res = await fetch('/api/videos/batch-clip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload(analysis.segments)),
    })
    const data = await res.json()
    setBatchGenerating(false)
    if (!res.ok) { setGenerateErr(data.error ?? 'Batch generation failed'); return }
    setGeneratedClips(data.clips ?? [])
  }

  const handleGenerateOne = async () => {
    if (!selected || !analysis) return
    const start = pickedSegment ? pickedSegment.start : parseFloat(manualStart || '0')
    const end   = pickedSegment ? pickedSegment.end   : parseFloat(manualEnd   || '0')
    if (end <= start) { setGenerateErr('End time must be after start time'); return }
    const seg: Segment = pickedSegment ?? { start, end, reason: 'Manual', preview: '' }

    setGenerating(true); setGenerateErr('')
    const res = await fetch('/api/videos/batch-clip', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload([seg])),
    })
    const data = await res.json()
    setGenerating(false)
    if (!res.ok) { setGenerateErr(data.error ?? 'Generation failed'); return }
    setGeneratedClips(prev => [...prev, ...(data.clips ?? [])])
  }

  const hasSelection = pickedSegment || (manualStart && manualEnd)

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-5xl w-full">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 pb-6 border-b border-[#EBEBEB]">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#09090B] tracking-tight">Video Editor</h1>
          <p className="text-[13.5px] text-[#71717A] mt-1.5">AI finds the best moments, cuts, edits, and adds subtitles</p>
        </div>
        <label className={`px-4 py-2 text-sm font-semibold bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg transition-colors cursor-pointer ${uploading ? 'opacity-40 pointer-events-none' : ''}`}>
          {uploading ? 'Uploading…' : '+ Upload video'}
          <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => { handleUpload(e.target.files); e.target.value = '' }} disabled={uploading} />
        </label>
      </div>

      {uploadErr && <p className="font-mono text-xs text-[#DC2626] mb-4">{uploadErr}</p>}

      <div className="flex gap-6">

        {/* library */}
        <div className="w-64 shrink-0">
          <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-3">Library</p>
          {loading ? (
            <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
          ) : videos.length === 0 ? (
            <label className="block border-2 border-dashed border-[#EBEBEB] rounded-xl p-6 text-center cursor-pointer hover:border-[#7C3AED] transition-colors">
              <p className="text-sm text-[#888880]">Drop a video or click to upload</p>
              <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => { handleUpload(e.target.files); e.target.value = '' }} />
            </label>
          ) : (
            <div className="space-y-2">
              {videos.map(v => (
                <VideoCard key={v.id} video={v} selected={selected?.id === v.id} onSelect={() => handleSelect(v)} onDelete={() => handleDelete(v)} />
              ))}
            </div>
          )}
        </div>

        {/* editor panel */}
        <div className="flex-1 min-w-0 space-y-5">
          {!selected ? (
            <div className="border border-dashed border-[#EBEBEB] rounded-xl flex items-center justify-center h-64">
              <p className="text-sm text-[#BBBBBB]">Select a video from the library to start editing</p>
            </div>
          ) : (
            <>
              {/* step 1 — analyze */}
              <div className="bg-white border border-[#EBEBEB] rounded-xl p-5">
                <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-4">Step 1 — Find best moments</p>
                <p className="text-sm font-semibold text-[#111111] mb-3">Target clip length</p>
                <div className="flex gap-2 flex-wrap mb-4">
                  {DURATIONS.map(d => (
                    <button key={d} onClick={() => { setTargetDuration(d); setCustomDuration('') }}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        !customDuration && targetDuration === d
                          ? 'border-[#7C3AED] bg-[#F5F3FF] text-[#7C3AED] font-semibold'
                          : 'border-[#EBEBEB] text-[#555555] hover:border-[#7C3AED]'
                      }`}>{d}s</button>
                  ))}
                  <input type="number" placeholder="Custom" value={customDuration}
                    onChange={e => setCustomDuration(e.target.value)}
                    className={`w-20 px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-[#7C3AED] ${customDuration ? 'border-[#7C3AED]' : 'border-[#EBEBEB]'}`} />
                  {(customDuration || targetDuration) && <span className="flex items-center font-mono text-xs text-[#888880]">seconds</span>}
                </div>
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="w-full py-2.5 text-sm font-semibold bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg disabled:opacity-40 transition-colors">
                  {analyzing ? 'Analyzing… (transcribing + finding moments)' : '✦ Find Best Moments'}
                </button>
                {analyzeErr && <p className="font-mono text-xs text-[#DC2626] mt-2">{analyzeErr}</p>}
              </div>

              {analysis && (
                <>
                  {/* step 2 — segments */}
                  <div className="bg-white border border-[#EBEBEB] rounded-xl p-5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-mono text-xs text-[#888880] uppercase tracking-widest">Step 2 — Pick moments</p>
                      <span className="font-mono text-xs text-[#BBBBBB]">{fmtSec(analysis.duration)} total</span>
                    </div>
                    <p className="font-mono text-xs text-[#BBBBBB] mb-4">Click one to select, or generate all at once</p>

                    <div className="space-y-3 mb-4">
                      {analysis.segments.map((seg, i) => (
                        <div key={i} onClick={() => { setPickedSegment(pickedSegment === seg ? null : seg); setManualStart(''); setManualEnd('') }}
                          className={`border rounded-xl p-4 cursor-pointer transition-all ${
                            pickedSegment === seg ? 'border-[#7C3AED] bg-[#F5F3FF]' : 'border-[#EBEBEB] hover:border-[#C4B5FD]'
                          }`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-semibold text-[#7C3AED]">
                              {fmtSec(seg.start)} → {fmtSec(seg.end)} · {fmtSec(seg.end - seg.start)}
                            </span>
                            <span className="font-mono text-[10px] text-[#BBBBBB]">#{i + 1}</span>
                          </div>
                          <p className="text-sm font-semibold text-[#111111] mb-1">{seg.reason}</p>
                          <p className="text-xs text-[#888880] italic line-clamp-2">"{seg.preview}"</p>
                        </div>
                      ))}
                    </div>

                    {/* manual override */}
                    <div className="border-t border-[#F3F4F6] pt-4">
                      <p className="font-mono text-xs text-[#888880] mb-2">Or enter timestamps manually</p>
                      <div className="flex gap-2 items-center">
                        <input type="number" placeholder="Start (s)" value={manualStart}
                          onChange={e => { setManualStart(e.target.value); setPickedSegment(null) }}
                          className="w-28 px-3 py-1.5 text-sm border border-[#EBEBEB] rounded-lg focus:outline-none focus:border-[#7C3AED]" />
                        <span className="text-[#BBBBBB]">→</span>
                        <input type="number" placeholder="End (s)" value={manualEnd}
                          onChange={e => { setManualEnd(e.target.value); setPickedSegment(null) }}
                          className="w-28 px-3 py-1.5 text-sm border border-[#EBEBEB] rounded-lg focus:outline-none focus:border-[#7C3AED]" />
                        {manualStart && manualEnd && (
                          <span className="font-mono text-xs text-[#888880]">{fmtSec(parseFloat(manualEnd) - parseFloat(manualStart))} clip</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* step 3 — editing options */}
                  <div className="bg-white border border-[#EBEBEB] rounded-xl p-5">
                    <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-5">Step 3 — Edit options</p>

                    {/* aspect ratio */}
                    <p className="text-sm font-semibold text-[#111111] mb-3">Aspect ratio</p>
                    <div className="flex gap-2 flex-wrap mb-5">
                      {ASPECTS.map(a => (
                        <button key={a.value} onClick={() => setAspectRatio(a.value)}
                          className={`px-4 py-2 text-sm rounded-lg border transition-all text-left ${
                            aspectRatio === a.value ? 'border-[#7C3AED] bg-[#F5F3FF] text-[#7C3AED]' : 'border-[#EBEBEB] text-[#555555] hover:border-[#7C3AED]'
                          }`}>
                          <span className="font-semibold">{a.label}</span>
                          <span className="block font-mono text-[10px] text-[#888880] mt-0.5">{a.sub}</span>
                        </button>
                      ))}
                    </div>

                    {/* toggles */}
                    <div className="space-y-4 mb-5">
                      <Toggle on={captions} onClick={() => setCaptions(c => !c)}
                        label="Subtitles" sub="Auto-generated from transcript, burned into video" />
                      <Toggle on={editOpts.clean_speech} onClick={() => setEditOpts(o => ({ ...o, clean_speech: !o.clean_speech }))}
                        label="Clean up speech" sub="Jump cuts — remove ums and long pauses automatically" />
                      <Toggle on={editOpts.fade} onClick={() => setEditOpts(o => ({ ...o, fade: !o.fade }))}
                        label="Fade in / out" sub="Smooth 0.4s fade at start and end" />
                      <Toggle on={editOpts.enhance} onClick={() => setEditOpts(o => ({ ...o, enhance: !o.enhance }))}
                        label="Enhance colors" sub="Slight contrast + saturation boost" />
                    </div>

                    {/* text overlay */}
                    <div className="mb-5">
                      <label className="block text-sm font-semibold text-[#111111] mb-1.5">Title overlay</label>
                      <input
                        value={editOpts.text_overlay}
                        onChange={e => setEditOpts(o => ({ ...o, text_overlay: e.target.value }))}
                        placeholder="Hook or title text shown for first 3 seconds (optional)"
                        className="w-full text-sm border border-[#EBEBEB] px-3 py-2 rounded-lg focus:outline-none focus:border-[#7C3AED] bg-white"
                      />
                    </div>

                    {/* music */}
                    <div className="mb-6">
                      <label className="block text-sm font-semibold text-[#111111] mb-1.5">Background music</label>
                      <p className="font-mono text-xs text-[#BBBBBB] mb-2">
                        Drop royalty-free MP3s into the <code>music/</code> folder to enable
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {MUSIC_OPTS.map(m => (
                          <button key={m.value} onClick={() => setEditOpts(o => ({ ...o, music: m.value as EditOptions['music'] }))}
                            className={`px-3 py-2 text-sm rounded-lg border transition-all text-left ${
                              editOpts.music === m.value ? 'border-[#7C3AED] bg-[#F5F3FF] text-[#7C3AED]' : 'border-[#EBEBEB] text-[#555555] hover:border-[#7C3AED]'
                            }`}>
                            <span className="font-semibold">{m.label}</span>
                            <span className="block font-mono text-[10px] text-[#888880] mt-0.5">{m.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* generate buttons */}
                    <div className="flex gap-3 flex-wrap">
                      <button onClick={handleGenerateAll} disabled={batchGenerating || generating}
                        className="flex-1 py-3 text-sm font-semibold bg-[#111111] text-white hover:bg-[#333333] rounded-lg disabled:opacity-40 transition-colors">
                        {batchGenerating
                          ? `Generating all clips… (${analysis.segments.length} clips, may take a few minutes)`
                          : `Generate all ${analysis.segments.length} clips`}
                      </button>
                      {hasSelection && (
                        <button onClick={handleGenerateOne} disabled={batchGenerating || generating}
                          className="px-5 py-3 text-sm font-semibold border border-[#7C3AED] text-[#7C3AED] hover:bg-[#F5F3FF] rounded-lg disabled:opacity-40 transition-colors">
                          {generating ? 'Generating…' : 'Generate selected'}
                        </button>
                      )}
                    </div>

                    {generateErr && <p className="font-mono text-xs text-[#DC2626] mt-3">{generateErr}</p>}
                  </div>

                  {/* clips gallery */}
                  {generatedClips.length > 0 && (
                    <div className="bg-white border border-[#EBEBEB] rounded-xl p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="font-mono text-xs text-[#888880] uppercase tracking-widest">
                          Generated clips — {generatedClips.filter(c => c.clip_url).length}/{generatedClips.length} ready
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {generatedClips.map((clip, i) => (
                          <div key={i} className="border border-[#EBEBEB] rounded-xl overflow-hidden">
                            {clip.clip_url ? (
                              <>
                                <video
                                  src={clip.clip_url}
                                  controls
                                  playsInline
                                  className="w-full bg-[#111111]"
                                  style={{ maxHeight: '280px' }}
                                />
                                <div className="p-3">
                                  <p className="text-xs font-semibold text-[#111111] mb-0.5">
                                    Clip #{clip.index + 1} · {fmtSec(clip.segment.start)} → {fmtSec(clip.segment.end)}
                                  </p>
                                  <p className="font-mono text-xs text-[#888880] mb-3 line-clamp-2">{clip.segment.reason}</p>
                                  <a href={clip.clip_url} download target="_blank" rel="noopener noreferrer"
                                    className="block w-full py-2 text-center text-xs font-semibold bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg transition-colors">
                                    Download
                                  </a>
                                </div>
                              </>
                            ) : (
                              <div className="p-4">
                                <p className="text-xs font-semibold text-[#DC2626] mb-1">Clip #{clip.index + 1} failed</p>
                                <p className="font-mono text-xs text-[#888880] line-clamp-3">{clip.error}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
