'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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

const DURATIONS = [15, 30, 60, 90]
const ASPECTS   = [
  { value: '16:9', label: '16:9', sub: 'Horizontal — LinkedIn, YouTube' },
  { value: '9:16', label: '9:16', sub: 'Vertical — TikTok, Reels' },
  { value: '1:1',  label: '1:1',  sub: 'Square — Instagram' },
]

function fmtSec(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

// ── video card ─────────────────────────────────────────────────────────────────

function VideoCard({
  video,
  selected,
  onSelect,
  onDelete,
}: {
  video: Video
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`group relative border rounded-xl p-4 cursor-pointer transition-all ${
        selected
          ? 'border-[#7C3AED] bg-[#F5F3FF]'
          : 'border-[#E5E7EB] bg-white hover:border-[#C4B5FD]'
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
  const [videos, setVideos]               = useState<Video[]>([])
  const [loading, setLoading]             = useState(true)
  const [uploading, setUploading]         = useState(false)
  const [uploadErr, setUploadErr]         = useState('')
  const [selected, setSelected]           = useState<Video | null>(null)

  // step 1 — analyze settings
  const [targetDuration, setTargetDuration] = useState(30)
  const [customDuration, setCustomDuration] = useState('')
  const [analyzing, setAnalyzing]           = useState(false)
  const [analyzeErr, setAnalyzeErr]         = useState('')
  const [analysis, setAnalysis]             = useState<AnalysisResult | null>(null)

  // step 2 — pick segment
  const [pickedSegment, setPickedSegment]   = useState<Segment | null>(null)
  const [manualStart, setManualStart]       = useState('')
  const [manualEnd, setManualEnd]           = useState('')

  // step 3 — generate settings
  const [aspectRatio, setAspectRatio]       = useState('16:9')
  const [captions, setCaptions]             = useState(false)
  const [generating, setGenerating]         = useState(false)
  const [generateErr, setGenerateErr]       = useState('')
  const [clipUrl, setClipUrl]               = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res  = await fetch('/api/videos')
    const data = await res.json()
    if (!res.ok) {
      setUploadErr(data.error ?? 'Failed to load videos')
      setVideos([])
    } else {
      setVideos(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resetEditor = () => {
    setAnalysis(null)
    setPickedSegment(null)
    setManualStart('')
    setManualEnd('')
    setClipUrl(null)
    setAnalyzeErr('')
    setGenerateErr('')
  }

  const handleSelect = (v: Video) => {
    setSelected(v)
    resetEditor()
  }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadErr('')
    try {
      for (const file of Array.from(files)) {
        const fileSizeMB = file.size / 1024 / 1024
        if (fileSizeMB > 500) {
          setUploadErr(`File "${file.name}" is ${fileSizeMB.toFixed(0)}MB. Please compress or trim the video first — Supabase free tier supports up to ~500MB.`)
          continue
        }
        const storagePath = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`
        const { error } = await supabase.storage
          .from('video-library')
          .upload(storagePath, file, { contentType: file.type })
        if (error) {
          if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
            setUploadErr('Storage bucket "video-library" not found. Go to Supabase → Storage → New bucket → name it "video-library" → set Public.')
          } else {
            setUploadErr(`Upload failed: ${error.message}`)
          }
          continue
        }
        const { data: urlData } = supabase.storage.from('video-library').getPublicUrl(storagePath)
        const res = await fetch('/api/videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, storage_path: storagePath, public_url: urlData.publicUrl }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setUploadErr(j.error?.includes('does not exist')
            ? 'Table "video_library" not found. Run setup_video_library.sql in your Supabase SQL editor first.'
            : (j.error ?? 'Failed to save video metadata'))
        }
      }
    } catch (err: any) {
      setUploadErr(err?.message ?? 'Unexpected error during upload')
    } finally {
      setUploading(false)
      load()
    }
  }

  const handleDelete = async (video: Video) => {
    await fetch('/api/videos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: video.id, storage_path: video.storage_path }),
    })
    if (selected?.id === video.id) { setSelected(null); resetEditor() }
    setVideos(vs => vs.filter(v => v.id !== video.id))
  }

  const handleAnalyze = async () => {
    if (!selected) return
    const dur = customDuration ? parseInt(customDuration) : targetDuration
    setAnalyzing(true)
    setAnalyzeErr('')
    setAnalysis(null)
    setPickedSegment(null)
    setClipUrl(null)

    const res = await fetch('/api/videos/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: selected.public_url, target_duration: dur }),
    })
    const data = await res.json()
    setAnalyzing(false)

    if (!res.ok) { setAnalyzeErr(data.error ?? 'Analysis failed'); return }
    setAnalysis(data)
  }

  const handleGenerate = async () => {
    if (!selected || !analysis) return
    const start = pickedSegment ? pickedSegment.start : parseFloat(manualStart || '0')
    const end   = pickedSegment ? pickedSegment.end   : parseFloat(manualEnd   || '0')
    if (end <= start) { setGenerateErr('End time must be after start time'); return }

    setGenerating(true)
    setGenerateErr('')
    setClipUrl(null)

    const res = await fetch('/api/videos/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: selected.public_url,
        start,
        end,
        aspect_ratio: aspectRatio,
        captions,
        transcript_segments: analysis.transcript_segments,
      }),
    })
    const data = await res.json()
    setGenerating(false)

    if (!res.ok) { setGenerateErr(data.error ?? 'Clip generation failed'); return }
    setClipUrl(data.clip_url)
  }

  const effectiveDuration = customDuration ? parseInt(customDuration) : targetDuration

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-5xl w-full">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 pb-6 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Video Editor</h1>
          <p className="text-base text-[#888880] mt-1.5">Upload a video — AI finds the best moments and generates clips</p>
        </div>
        <label className={`px-4 py-2 text-sm font-semibold bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg transition-colors cursor-pointer ${uploading ? 'opacity-40 pointer-events-none' : ''}`}>
          {uploading ? 'Uploading…' : '+ Upload video'}
          <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => { handleUpload(e.target.files); e.target.value = '' }} disabled={uploading} />
        </label>
      </div>

      {uploadErr && <p className="font-mono text-xs text-[#DC2626] mb-4">{uploadErr}</p>}

      <div className="flex gap-6">

        {/* left: video library */}
        <div className="w-64 shrink-0">
          <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-3">Library</p>
          {loading ? (
            <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
          ) : videos.length === 0 ? (
            <label className="block border-2 border-dashed border-[#E5E7EB] rounded-xl p-6 text-center cursor-pointer hover:border-[#7C3AED] transition-colors">
              <p className="text-sm text-[#888880]">Drop a video or click to upload</p>
              <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => { handleUpload(e.target.files); e.target.value = '' }} />
            </label>
          ) : (
            <div className="space-y-2">
              {videos.map(v => (
                <VideoCard
                  key={v.id}
                  video={v}
                  selected={selected?.id === v.id}
                  onSelect={() => handleSelect(v)}
                  onDelete={() => handleDelete(v)}
                />
              ))}
            </div>
          )}
        </div>

        {/* right: editor panel */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="border border-dashed border-[#E5E7EB] rounded-xl flex items-center justify-center h-64">
              <p className="text-sm text-[#BBBBBB]">Select a video from the library to start editing</p>
            </div>
          ) : (
            <div className="space-y-6">

              {/* step 1: analyze settings */}
              <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
                <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-4">Step 1 — Find best moments</p>

                <p className="text-sm font-semibold text-[#111111] mb-3">Target clip length</p>
                <div className="flex gap-2 flex-wrap mb-3">
                  {DURATIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => { setTargetDuration(d); setCustomDuration('') }}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        !customDuration && targetDuration === d
                          ? 'border-[#7C3AED] bg-[#F5F3FF] text-[#7C3AED] font-semibold'
                          : 'border-[#E5E7EB] text-[#555555] hover:border-[#7C3AED]'
                      }`}>
                      {d}s
                    </button>
                  ))}
                  <input
                    type="number"
                    placeholder="Custom"
                    value={customDuration}
                    onChange={e => setCustomDuration(e.target.value)}
                    className={`w-20 px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-[#7C3AED] ${
                      customDuration ? 'border-[#7C3AED]' : 'border-[#E5E7EB]'
                    }`}
                  />
                  {(customDuration || targetDuration) && (
                    <span className="flex items-center font-mono text-xs text-[#888880]">seconds</span>
                  )}
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full py-2.5 text-sm font-semibold bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg disabled:opacity-40 transition-colors">
                  {analyzing ? 'Analyzing… (this takes a minute)' : '✦ Find Best Moments'}
                </button>
                {analyzeErr && <p className="font-mono text-xs text-[#DC2626] mt-2">{analyzeErr}</p>}
              </div>

              {/* step 2: segment results */}
              {analysis && (
                <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
                  <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-1">Step 2 — Pick a moment</p>
                  <p className="font-mono text-xs text-[#BBBBBB] mb-4">Video duration: {fmtSec(analysis.duration)}</p>

                  <div className="space-y-3 mb-4">
                    {analysis.segments.map((seg, i) => (
                      <div
                        key={i}
                        onClick={() => { setPickedSegment(seg); setManualStart(''); setManualEnd('') }}
                        className={`border rounded-xl p-4 cursor-pointer transition-all ${
                          pickedSegment === seg
                            ? 'border-[#7C3AED] bg-[#F5F3FF]'
                            : 'border-[#E5E7EB] hover:border-[#C4B5FD]'
                        }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-semibold text-[#7C3AED]">
                            {fmtSec(seg.start)} → {fmtSec(seg.end)} · {fmtSec(seg.end - seg.start)}
                          </span>
                          {pickedSegment === seg && (
                            <span className="font-mono text-xs text-[#7C3AED]">✓ Selected</span>
                          )}
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
                      <input
                        type="number"
                        placeholder="Start (s)"
                        value={manualStart}
                        onChange={e => { setManualStart(e.target.value); setPickedSegment(null) }}
                        className="w-28 px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#7C3AED]"
                      />
                      <span className="text-[#BBBBBB]">→</span>
                      <input
                        type="number"
                        placeholder="End (s)"
                        value={manualEnd}
                        onChange={e => { setManualEnd(e.target.value); setPickedSegment(null) }}
                        className="w-28 px-3 py-1.5 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#7C3AED]"
                      />
                      {manualStart && manualEnd && (
                        <span className="font-mono text-xs text-[#888880]">
                          {fmtSec(parseFloat(manualEnd) - parseFloat(manualStart))} clip
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* step 3: generate */}
              {analysis && (pickedSegment || (manualStart && manualEnd)) && (
                <div className="bg-white border border-[#E5E7EB] rounded-xl p-5">
                  <p className="font-mono text-xs text-[#888880] uppercase tracking-widest mb-4">Step 3 — Generate clip</p>

                  <p className="text-sm font-semibold text-[#111111] mb-3">Aspect ratio</p>
                  <div className="flex gap-2 flex-wrap mb-5">
                    {ASPECTS.map(a => (
                      <button
                        key={a.value}
                        onClick={() => setAspectRatio(a.value)}
                        className={`px-4 py-2 text-sm rounded-lg border transition-all text-left ${
                          aspectRatio === a.value
                            ? 'border-[#7C3AED] bg-[#F5F3FF] text-[#7C3AED]'
                            : 'border-[#E5E7EB] text-[#555555] hover:border-[#7C3AED]'
                        }`}>
                        <span className="font-semibold">{a.label}</span>
                        <span className="block font-mono text-[10px] text-[#888880] mt-0.5">{a.sub}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 mb-5">
                    <button
                      onClick={() => setCaptions(c => !c)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors ${captions ? 'bg-[#7C3AED]' : 'bg-[#E5E7EB]'}`}
                      style={{ height: '22px' }}>
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${captions ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                    <div>
                      <p className="text-sm font-semibold text-[#111111]">Burn-in captions</p>
                      <p className="font-mono text-xs text-[#888880]">Auto-generated from transcript</p>
                    </div>
                  </div>

                  {clipUrl ? (
                    <div className="space-y-3">
                      <div className="border border-[#10B981] bg-[#ECFDF5] rounded-lg px-4 py-3">
                        <p className="text-sm font-semibold text-[#065F46]">Clip ready!</p>
                      </div>
                      <a
                        href={clipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="block w-full py-2.5 text-sm font-semibold text-center bg-[#7C3AED] text-white hover:bg-[#6D28D9] rounded-lg transition-colors">
                        Download clip
                      </a>
                      <button
                        onClick={() => { setClipUrl(null); setGenerateErr('') }}
                        className="w-full py-2 text-sm text-[#888880] hover:text-[#111111] transition-colors">
                        Generate another
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="w-full py-2.5 text-sm font-semibold bg-[#111111] text-white hover:bg-[#333333] rounded-lg disabled:opacity-40 transition-colors">
                      {generating ? 'Generating clip… (may take a minute)' : 'Generate clip'}
                    </button>
                  )}

                  {generateErr && <p className="font-mono text-xs text-[#DC2626] mt-2">{generateErr}</p>}
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
