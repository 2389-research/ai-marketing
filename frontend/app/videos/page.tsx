'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveActiveProjectClient } from '@/lib/project'
import { FONT_OPTIONS, DEFAULT_FONT_KEY } from '@/lib/fonts'
import VideoTimeline, { type Thumbnail } from '@/components/VideoTimeline'
import SubtitleOverlay from '@/components/SubtitleOverlay'
import PostVideoStudio from '@/components/PostVideoStudio'

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

interface VideoTopic {
  title: string
  summary: string
  quote: string
  strength: number
  start: number
  end: number
  all_ranges?: { start: number; end: number }[]
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
  dynamic_editing: boolean
  pacing: 'chill' | 'normal' | 'fast'
  text_overlay: string
  music: 'none' | 'upbeat' | 'calm' | 'cinematic'
  font: string
  subtitle_position: number   // 0.0 (top) – 1.0 (bottom, legacy default placement)
}

const POSITION_PRESETS = [
  { label: 'Top',    value: 0.05 },
  { label: 'Middle', value: 0.5 },
  { label: 'Bottom', value: 1.0 },
]

const ASPECTS   = [
  { value: '16:9', label: '16:9', sub: 'Horizontal — LinkedIn, YouTube' },
  { value: '9:16', label: '9:16', sub: 'Vertical — TikTok, Reels' },
  { value: '1:1',  label: '1:1',  sub: 'Square — Instagram' },
]
const PACING_OPTS = [
  { value: 'chill',  label: 'Chill',  sub: 'Relaxed cuts, fewer reframes' },
  { value: 'normal', label: 'Normal', sub: 'Balanced rhythm' },
  { value: 'fast',   label: 'Fast',   sub: 'Tight cuts + 8% speed-up' },
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
      <div className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-[#1800ad]' : 'bg-[#e6e6e6]'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <div>
        <p className="text-sm font-semibold text-[#262626]">{label}</p>
        {sub && <p className="text-xs text-[#6b6b6b]">{sub}</p>}
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
      className={`group relative border rounded p-4 cursor-pointer transition-all ${
        selected ? 'border-[#1800ad] bg-[#f7f7f7]' : 'border-[#e6e6e6] bg-white hover:border-[#1800ad]'
      }`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded bg-[#f7f7f7] flex items-center justify-center shrink-0">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#1800ad" strokeWidth="1.5">
            <path d="M15 10l4.553-2.277A1 1 0 0121 8.72v6.56a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#262626] truncate">{video.filename}</p>
          <p className="text-xs text-[#9a9a9a]">
            {new Date(video.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </p>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="absolute top-2 right-2 w-5 h-5 hidden group-hover:flex items-center justify-center text-[#9a9a9a] hover:text-[#DC2626] transition-colors text-xs">
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

  // "Generate video for a post" studio mode — opened via /videos?forDraft=<id>
  // from a draft/calendar "Generate video" button. Read from the URL client-side
  // to avoid the useSearchParams Suspense requirement.
  const [forDraft, setForDraft] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('forDraft')
    if (id) setForDraft(id)
    const prompt = params.get('prompt')
    if (prompt) setVideoPrompt(prompt)
  }, [])
  const closeStudio = () => {
    setForDraft(null)
    window.history.replaceState({}, '', '/videos')
  }

  // step 1 — analyze (transcribe + map topics)
  const [analyzing, setAnalyzing]   = useState(false)
  const [analyzeErr, setAnalyzeErr] = useState('')
  const [analysis, setAnalysis]     = useState<AnalysisResult | null>(null)

  // step 2 — segment selection
  const [pickedSegment, setPickedSegment] = useState<Segment | null>(null)
  // topic-first clipping — "the AI watches it so you don't have to"
  const [topics, setTopics]               = useState<VideoTopic[]>([])
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [planningTopic, setPlanningTopic] = useState<string | null>(null)
  const [topicErr, setTopicErr]           = useState('')
  const [manualStart, setManualStart]     = useState('')
  const [manualEnd, setManualEnd]         = useState('')

  // step 3 — editing options
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [captions, setCaptions]       = useState(true)
  const [editOpts, setEditOpts]       = useState<EditOptions>({
    fade: true, enhance: false, clean_speech: true, dynamic_editing: true, pacing: 'normal', text_overlay: '', music: 'none',
    font: DEFAULT_FONT_KEY, subtitle_position: 1.0,
  })

  // video preview + interactive timeline
  const videoRef             = useRef<HTMLVideoElement>(null)
  const previewContainerRef  = useRef<HTMLDivElement>(null)
  const [videoDuration, setVideoDuration]     = useState(0)
  const [currentTime, setCurrentTime]         = useState(0)
  const [thumbnails, setThumbnails]           = useState<Thumbnail[]>([])
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false)

  // generation
  const [generating, setGenerating]         = useState(false)
  const [generateErr, setGenerateErr]       = useState('')
  const [generatedClips, setGeneratedClips] = useState<GeneratedClip[]>([])

  // free-prompt video generation — describe any video; an LLM writes a real
  // Remotion composition from scratch and it gets rendered. No fixed
  // templates or scene library — genuinely custom code per request. A
  // failed render is retried once automatically with the error fed back to
  // the model (see /api/videos/generate-render).
  const [videoPrompt, setVideoPrompt]         = useState('')
  const [videoGenerating, setVideoGenerating] = useState(false)
  const [videoErr, setVideoErr]               = useState('')
  const [videoStatus, setVideoStatus]         = useState('')

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return
    setVideoGenerating(true); setVideoErr('')
    setVideoStatus('Writing your video — this can take a couple of minutes…')
    try {
      const res = await fetch('/api/videos/generate-render', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: videoPrompt.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setVideoErr(data.error ?? 'Generation failed'); return }
      setVideoPrompt('')
      load()
    } catch (err: any) {
      setVideoErr(err?.message ?? 'Unexpected error')
    } finally {
      setVideoGenerating(false)
      setVideoStatus('')
    }
  }

  // AI edit of the selected uploaded video — composite Remotion motion
  // graphics over the existing footage (see /api/videos/edit-video).
  const [editPrompt, setEditPrompt]       = useState('')
  const [editGenerating, setEditGenerating] = useState(false)
  const [editErr, setEditErr]             = useState('')

  const handleAiEdit = async () => {
    if (!selected || !editPrompt.trim()) return
    setEditGenerating(true); setEditErr('')
    try {
      const res = await fetch('/api/videos/edit-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceVideoUrl: selected.public_url, description: editPrompt.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setEditErr(data.error ?? 'Edit failed'); return }
      setEditPrompt('')
      load()
    } catch (err: any) {
      setEditErr(err?.message ?? 'Unexpected error')
    } finally {
      setEditGenerating(false)
    }
  }

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
    setTopics([]); setTopicErr(''); setTopicsLoading(false)
    setManualStart(''); setManualEnd('')
    setGeneratedClips([]); setAnalyzeErr(''); setGenerateErr('')
    setThumbnails([]); setVideoDuration(0); setCurrentTime(0)
  }

  const fetchThumbnails = async (videoUrl: string) => {
    setThumbnailsLoading(true)
    try {
      const res = await fetch('/api/videos/thumbnails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl, count: 14 }),
      })
      const data = await res.json()
      if (res.ok) {
        setThumbnails(data.thumbnails ?? [])
        if (data.duration) setVideoDuration(data.duration)
      }
    } catch {
      // thumbnails are a nice-to-have for the scrubber — a failure here
      // shouldn't block the rest of the editor from working
    } finally {
      setThumbnailsLoading(false)
    }
  }

  const handleSelect = (v: Video) => { setSelected(v); resetEditor(); fetchThumbnails(v.public_url) }

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    // Snapshot the FileList synchronously — the onChange handler clears the
    // input (e.target.value = '') right after calling this, which empties the
    // live FileList before the awaits below would otherwise read it.
    const fileArr = Array.from(files)
    setUploading(true); setUploadErr('')
    try {
      const pid = await resolveActiveProjectClient()
      for (const file of fileArr) {
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
    setAnalyzing(true); setAnalyzeErr(''); setAnalysis(null); setPickedSegment(null); setGeneratedClips([])
    // target_duration only shapes the backend's fallback "moments" — the real
    // cutting is topic-driven now, so any sane value works here.
    const res = await fetch('/api/videos/analyze', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_url: selected.public_url, target_duration: 45 }),
    })
    const data = await res.json()
    setAnalyzing(false)
    if (!res.ok) { setAnalyzeErr(data.error ?? 'Analysis failed'); return }
    setAnalysis(data)
    if ((data.transcript_segments ?? []).length > 0) fetchTopics(data.transcript_segments)
  }

  const fetchTopics = async (transcript: AnalysisResult['transcript_segments']) => {
    setTopics([]); setTopicErr(''); setTopicsLoading(true)
    try {
      const res = await fetch('/api/videos/topics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript_segments: transcript }),
      })
      const data = await res.json()
      if (!res.ok) { setTopicErr(data.error ?? 'Topic mapping failed'); return }
      setTopics(data.topics ?? [])
    } catch (err: any) {
      setTopicErr(err?.message ?? 'Topic mapping failed')
    } finally {
      setTopicsLoading(false)
    }
  }

  // Pick a topic -> AI plans the cut at the topic's NATURAL length (where the
  // thought starts and ends — no forced time frame) -> it lands in the normal
  // selected-segment flow (aspect/captions/generate).
  const useTopic = async (t: VideoTopic) => {
    if (!analysis) return
    setPlanningTopic(t.title); setTopicErr('')
    try {
      const res = await fetch('/api/videos/plan-cut', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript_segments: analysis.transcript_segments,
          topic_title: t.title, range_start: t.start, range_end: t.end,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setTopicErr(data.error ?? 'Cut planning failed'); return }
      setPickedSegment({
        start: data.start, end: data.end,
        reason: `Topic: ${t.title}${data.hook ? ` — “${data.hook}”` : ''}`,
        preview: t.quote || t.summary,
      })
      setManualStart(''); setManualEnd('')
    } catch (err: any) {
      setTopicErr(err?.message ?? 'Cut planning failed')
    } finally {
      setPlanningTopic(null)
    }
  }

  const buildPayload = (segs: Segment[]) => ({
    video_url: selected!.public_url,
    segments: segs,
    aspect_ratio: aspectRatio,
    captions,
    transcript_segments: analysis!.transcript_segments,
    options: { ...editOpts },
  })

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
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-6xl w-full mx-auto">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 pb-6 border-b border-[#e6e6e6]">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Video Editor</h1>
          <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">AI maps what your video talks about — pick a topic and it cuts, edits, and subtitles it</p>
        </div>
        <label className={`px-4 py-2 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded transition-colors cursor-pointer ${uploading ? 'opacity-40 pointer-events-none' : ''}`}>
          {uploading ? 'Uploading…' : '+ Upload video'}
          <input type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={e => { handleUpload(e.target.files); e.target.value = '' }} disabled={uploading} />
        </label>
      </div>

      {uploadErr && <p className="text-xs text-[#DC2626] mb-4">{uploadErr}</p>}

      {/* studio: make a video for a specific post (opened from a draft/calendar) */}
      {forDraft && (
        <PostVideoStudio
          draftId={forDraft}
          videos={videos}
          onClose={closeStudio}
          onLibraryChanged={load}
        />
      )}

      {/* generated video — describe anything, an LLM writes and renders real Remotion code */}
      <div className="mb-8 p-4 border border-[#e6e6e6] rounded bg-[#fafafa]">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Generate a video</p>
        <p className="text-[13px] text-[#6b6b6b] mb-3">No footage needed — describe any video and an AI writes the motion graphics from scratch, no fixed layout.</p>
        <div className="flex gap-2">
          <textarea
            value={videoPrompt}
            onChange={e => setVideoPrompt(e.target.value)}
            placeholder="e.g. A hype video for our new AI drafting feature, use our recent product photos, end with a stat about how many posts we've scheduled"
            rows={2}
            disabled={videoGenerating}
            className="flex-1 px-3 py-2 text-sm border border-[#cccccc] rounded outline-none focus:border-[#1800ad] disabled:opacity-50 resize-y"
          />
          <button
            onClick={handleGenerateVideo}
            disabled={videoGenerating || !videoPrompt.trim()}
            className="px-4 py-2 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap self-start"
          >
            {videoGenerating ? 'Generating…' : '✦ Generate'}
          </button>
        </div>
        {videoStatus && <p className="text-xs text-[#6b6b6b] mt-2">{videoStatus}</p>}
        {videoErr && <p className="text-xs text-[#DC2626] mt-2">{videoErr}</p>}
      </div>

      <div className="flex flex-col md:flex-row gap-6">

        {/* library */}
        <div className="w-full md:w-64 shrink-0">
          <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-3">Library</p>
          {loading ? (
            <p className="text-xs text-[#9a9a9a]">Loading…</p>
          ) : videos.length === 0 ? (
            <label className="block border-2 border-dashed border-[#e6e6e6] rounded p-6 text-center cursor-pointer hover:border-[#1800ad] transition-colors">
              <p className="text-sm text-[#6b6b6b]">Drop a video or click to upload</p>
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
            <div className="border border-dashed border-[#e6e6e6] rounded flex items-center justify-center h-64">
              <p className="text-sm text-[#9a9a9a]">Select a video from the library to start editing</p>
            </div>
          ) : (
            <>
              {/* live preview — real video, draggable subtitle position, timeline scrubber */}
              <div className="bg-white border border-[#e6e6e6] rounded p-5">
                <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-4">Preview</p>
                <div ref={previewContainerRef} className="relative rounded overflow-hidden bg-black mb-3">
                  <video
                    ref={videoRef}
                    src={selected.public_url}
                    controls
                    playsInline
                    className="w-full max-h-[420px] mx-auto block"
                    onLoadedMetadata={e => {
                      // Read from the DOM node synchronously — capturing e.currentTarget
                      // inside the setVideoDuration updater closure would read it after
                      // React has already nulled the synthetic event's fields.
                      const dur = e.currentTarget.duration
                      setVideoDuration(d => d || dur)
                    }}
                    onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
                  />
                  <SubtitleOverlay
                    containerRef={previewContainerRef}
                    position={editOpts.subtitle_position}
                    onChange={p => setEditOpts(o => ({ ...o, subtitle_position: p }))}
                    fontKey={editOpts.font}
                  />
                </div>
                {videoDuration > 0 && (
                  <VideoTimeline
                    duration={videoDuration}
                    thumbnails={thumbnails}
                    thumbnailsLoading={thumbnailsLoading}
                    start={manualStart ? parseFloat(manualStart) : (pickedSegment?.start ?? 0)}
                    end={manualEnd ? parseFloat(manualEnd) : (pickedSegment?.end ?? Math.min(30, videoDuration))}
                    onChange={(s, e) => { setManualStart(s.toFixed(1)); setManualEnd(e.toFixed(1)); setPickedSegment(null) }}
                    currentTime={currentTime}
                    onSeek={t => { if (videoRef.current) videoRef.current.currentTime = t }}
                  />
                )}
                <p className="text-[10px] text-[#9a9a9a] mt-2">
                  Drag the caption box above to set its position, drag the purple handles below to trim
                </p>
              </div>

              {/* AI edit — composite motion graphics over this video */}
              <div className="bg-white border border-[#e6e6e6] rounded p-5">
                <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">✦ AI edit — add motion &amp; effects</p>
                <p className="text-[13px] text-[#6b6b6b] mb-3">
                  Describe what to add to this video — animated titles, captions, intro/outro, callouts, color treatment — and an AI edits it over your footage. Keeps the original audio.
                </p>
                <div className="flex gap-2">
                  <textarea
                    value={editPrompt}
                    onChange={e => setEditPrompt(e.target.value)}
                    placeholder="e.g. Add a bold animated title 'Meet Jeff' for the first 3 seconds, captions at the bottom, and a Postique outro card at the end"
                    rows={2}
                    disabled={editGenerating}
                    className="flex-1 px-3 py-2 text-sm border border-[#cccccc] rounded outline-none focus:border-[#1800ad] disabled:opacity-50 resize-y"
                  />
                  <button
                    onClick={handleAiEdit}
                    disabled={editGenerating || !editPrompt.trim()}
                    className="px-4 py-2 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap self-start">
                    {editGenerating ? 'Editing…' : '✦ Edit'}
                  </button>
                </div>
                {editGenerating && (
                  <p className="text-xs text-[#1800ad] mt-2">Compositing motion graphics over your video — this takes a couple of minutes…</p>
                )}
                {editErr && <p className="text-xs text-[#DC2626] mt-2">{editErr}</p>}
              </div>

              {/* step 1 — analyze: transcribe + map what the video talks about */}
              <div className="bg-white border border-[#e6e6e6] rounded p-5">
                <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Step 1 — What does this video talk about?</p>
                <p className="text-[13px] text-[#6b6b6b] mb-4">
                  The AI watches it for you: it transcribes the video and maps every topic discussed.
                  You pick a topic, it cuts that thought at its natural length — no time frames to guess.
                </p>
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="w-full py-2.5 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded disabled:opacity-40 transition-colors">
                  {analyzing ? 'Watching your video… (transcribing + mapping topics)' : '✦ Find topics'}
                </button>
                {analyzeErr && <p className="text-xs text-[#DC2626] mt-2">{analyzeErr}</p>}
              </div>

              {analysis && (
                <>
                  {/* topics — the way you clip: pick a thought, not a time frame */}
                  <div className="bg-white border border-[#e6e6e6] rounded p-5">
                    <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-1">Step 2 — Pick a topic to clip</p>
                    <p className="text-xs text-[#9a9a9a] mb-4">
                      Each topic shows where it's discussed. Clip it and the AI cuts the full thought — starting and ending on natural sentence boundaries.
                    </p>
                    {topicsLoading && <p className="text-xs text-[#1800ad]">Mapping topics…</p>}
                    {topicErr && <p className="text-xs text-[#DC2626] mb-2">{topicErr}</p>}
                    {!topicsLoading && topics.length === 0 && !topicErr && (
                      <p className="text-xs text-[#9a9a9a]">
                        No speech detected in this video, so there are no topics to map — trim manually with the purple handles in the preview above, then generate below.
                      </p>
                    )}
                    <div className="space-y-2.5">
                      {topics.map(t => (
                        <div key={t.title} className="border border-[#e6e6e6] rounded p-3.5">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-semibold text-[#262626]">{t.title}</p>
                            <span className="text-[10px] text-[#9a9a9a]">
                              {fmtSec(t.start)}–{fmtSec(t.end)}
                              {(t.all_ranges?.length ?? 0) > 1 ? ` · +${t.all_ranges!.length - 1} more mention${t.all_ranges!.length > 2 ? 's' : ''}` : ''}
                            </span>
                            <span className="ml-auto text-[10px] font-semibold text-[#1800ad]">{t.strength}/10</span>
                          </div>
                          <p className="text-xs text-[#6b6b6b] leading-relaxed mb-1.5">{t.summary}</p>
                          {t.quote && <p className="text-xs text-[#3c3c3c] italic mb-2">“{t.quote}”</p>}
                          <button
                            onClick={() => useTopic(t)}
                            disabled={planningTopic !== null}
                            className="text-xs font-semibold text-[#1800ad] hover:text-[#2f1ac9] disabled:opacity-40 transition-colors">
                            {planningTopic === t.title ? 'Finding the natural cut…' : '✦ Clip this topic'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* step 3 — editing options */}
                  <div className="bg-white border border-[#e6e6e6] rounded p-5">
                    <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-5">Step 3 — Edit options &amp; generate</p>

                    {/* aspect ratio */}
                    <p className="text-sm font-semibold text-[#262626] mb-3">Aspect ratio</p>
                    <div className="flex gap-2 flex-wrap mb-5">
                      {ASPECTS.map(a => (
                        <button key={a.value} onClick={() => setAspectRatio(a.value)}
                          className={`px-4 py-2 text-sm rounded border transition-all text-left ${
                            aspectRatio === a.value ? 'border-[#1800ad] bg-[#f7f7f7] text-[#1800ad]' : 'border-[#e6e6e6] text-[#3c3c3c] hover:border-[#1800ad]'
                          }`}>
                          <span className="font-semibold">{a.label}</span>
                          <span className="block text-[10px] text-[#6b6b6b] mt-0.5">{a.sub}</span>
                        </button>
                      ))}
                    </div>

                    {/* toggles */}
                    <div className="space-y-4 mb-5">
                      <Toggle on={captions} onClick={() => setCaptions(c => !c)}
                        label="Subtitles" sub="Auto-generated from transcript, burned into video" />
                      <Toggle on={editOpts.clean_speech} onClick={() => setEditOpts(o => ({ ...o, clean_speech: !o.clean_speech }))}
                        label="Clean up speech" sub="Jump cuts — remove ums and long pauses automatically" />
                      <Toggle on={editOpts.dynamic_editing} onClick={() => setEditOpts(o => ({ ...o, dynamic_editing: !o.dynamic_editing }))}
                        label="Dynamic editing" sub="AI directs the edit — punch-in zooms, transitions, emphasized words" />
                      <Toggle on={editOpts.fade} onClick={() => setEditOpts(o => ({ ...o, fade: !o.fade }))}
                        label="Fade in / out" sub="Smooth 0.4s fade at start and end" />
                      <Toggle on={editOpts.enhance} onClick={() => setEditOpts(o => ({ ...o, enhance: !o.enhance }))}
                        label="Enhance colors" sub="Slight contrast + saturation boost" />
                    </div>

                    {/* pacing */}
                    <div className="mb-5">
                      <label className="block text-sm font-semibold text-[#262626] mb-1.5">Pacing</label>
                      <div className="flex gap-2 flex-wrap">
                        {PACING_OPTS.map(p => (
                          <button key={p.value} onClick={() => setEditOpts(o => ({ ...o, pacing: p.value as EditOptions['pacing'] }))}
                            className={`px-3 py-2 text-sm rounded border transition-all text-left ${
                              editOpts.pacing === p.value ? 'border-[#1800ad] bg-[#f7f7f7] text-[#1800ad]' : 'border-[#e6e6e6] text-[#3c3c3c] hover:border-[#1800ad]'
                            }`}>
                            <span className="font-semibold">{p.label}</span>
                            <span className="block text-[10px] text-[#6b6b6b] mt-0.5">{p.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* caption style — font + position (drag the box in the preview above for a custom spot) */}
                    <div className="mb-5">
                      <label className="block text-sm font-semibold text-[#262626] mb-1.5">Caption font</label>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {FONT_OPTIONS.map(f => (
                          <button key={f.key} onClick={() => setEditOpts(o => ({ ...o, font: f.key }))}
                            style={{ fontFamily: f.cssFamily }}
                            className={`px-3 py-2 text-sm rounded border transition-all ${
                              editOpts.font === f.key ? 'border-[#1800ad] bg-[#f7f7f7] text-[#1800ad]' : 'border-[#e6e6e6] text-[#3c3c3c] hover:border-[#1800ad]'
                            }`}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <label className="block text-sm font-semibold text-[#262626] mb-1.5">Caption position</label>
                      <div className="flex gap-2 flex-wrap">
                        {POSITION_PRESETS.map(p => (
                          <button key={p.label} onClick={() => setEditOpts(o => ({ ...o, subtitle_position: p.value }))}
                            className={`px-3 py-2 text-sm rounded border transition-all ${
                              Math.abs(editOpts.subtitle_position - p.value) < 0.01 ? 'border-[#1800ad] bg-[#f7f7f7] text-[#1800ad]' : 'border-[#e6e6e6] text-[#3c3c3c] hover:border-[#1800ad]'
                            }`}>
                            {p.label}
                          </button>
                        ))}
                        <span className="flex items-center text-[10px] text-[#9a9a9a]">or drag the caption box in the preview above</span>
                      </div>
                    </div>

                    {/* text overlay */}
                    <div className="mb-5">
                      <label className="block text-sm font-semibold text-[#262626] mb-1.5">Title overlay</label>
                      <input
                        value={editOpts.text_overlay}
                        onChange={e => setEditOpts(o => ({ ...o, text_overlay: e.target.value }))}
                        placeholder="Hook or title text shown for first 3 seconds (optional)"
                        className="w-full text-sm border border-[#e6e6e6] px-3 py-2 rounded focus:outline-none focus:border-[#1800ad] bg-white"
                      />
                    </div>

                    {/* music */}
                    <div className="mb-6">
                      <label className="block text-sm font-semibold text-[#262626] mb-1.5">Background music</label>
                      <p className="text-xs text-[#9a9a9a] mb-2">
                        Drop royalty-free MP3s into the <code>music/</code> folder to enable
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {MUSIC_OPTS.map(m => (
                          <button key={m.value} onClick={() => setEditOpts(o => ({ ...o, music: m.value as EditOptions['music'] }))}
                            className={`px-3 py-2 text-sm rounded border transition-all text-left ${
                              editOpts.music === m.value ? 'border-[#1800ad] bg-[#f7f7f7] text-[#1800ad]' : 'border-[#e6e6e6] text-[#3c3c3c] hover:border-[#1800ad]'
                            }`}>
                            <span className="font-semibold">{m.label}</span>
                            <span className="block text-[10px] text-[#6b6b6b] mt-0.5">{m.sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* selected cut + generate */}
                    {hasSelection ? (
                      <>
                        <div className="border border-[#1800ad] bg-[#f7f7f7] rounded p-3.5 mb-3">
                          <p className="text-xs font-semibold text-[#1800ad] mb-0.5">
                            {pickedSegment
                              ? `${fmtSec(pickedSegment.start)} → ${fmtSec(pickedSegment.end)} · ${fmtSec(pickedSegment.end - pickedSegment.start)}`
                              : `${fmtSec(parseFloat(manualStart))} → ${fmtSec(parseFloat(manualEnd))} · ${fmtSec(parseFloat(manualEnd) - parseFloat(manualStart))} (manual trim)`}
                          </p>
                          {pickedSegment && <p className="text-sm font-semibold text-[#262626]">{pickedSegment.reason}</p>}
                          {pickedSegment?.preview && <p className="text-xs text-[#6b6b6b] italic line-clamp-2 mt-0.5">"{pickedSegment.preview}"</p>}
                        </div>
                        <button onClick={handleGenerateOne} disabled={generating}
                          className="w-full py-3 text-sm font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded disabled:opacity-40 transition-colors">
                          {generating ? 'Generating clip…' : '✦ Generate clip'}
                        </button>
                      </>
                    ) : (
                      <p className="text-xs text-[#9a9a9a] py-2">
                        Pick a topic above (or trim with the handles in the preview) to generate a clip.
                      </p>
                    )}

                    {generateErr && <p className="text-xs text-[#DC2626] mt-3">{generateErr}</p>}
                  </div>

                  {/* clips gallery */}
                  {generatedClips.length > 0 && (
                    <div className="bg-white border border-[#e6e6e6] rounded p-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest">
                          Generated clips — {generatedClips.filter(c => c.clip_url).length}/{generatedClips.length} ready
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {generatedClips.map((clip, i) => (
                          <div key={i} className="border border-[#e6e6e6] rounded overflow-hidden">
                            {clip.clip_url ? (
                              <>
                                <video
                                  src={clip.clip_url}
                                  controls
                                  playsInline
                                  className="w-full bg-[#262626]"
                                  style={{ maxHeight: '280px' }}
                                />
                                <div className="p-3">
                                  <p className="text-xs font-semibold text-[#262626] mb-0.5">
                                    Clip #{clip.index + 1} · {fmtSec(clip.segment.start)} → {fmtSec(clip.segment.end)}
                                  </p>
                                  <p className="text-xs text-[#6b6b6b] mb-3 line-clamp-2">{clip.segment.reason}</p>
                                  <a href={clip.clip_url} download target="_blank" rel="noopener noreferrer"
                                    className="block w-full py-2 text-center text-xs font-semibold bg-[#1800ad] text-white hover:bg-[#2f1ac9] rounded transition-colors">
                                    Download
                                  </a>
                                </div>
                              </>
                            ) : (
                              <div className="p-4">
                                <p className="text-xs font-semibold text-[#DC2626] mb-1">Clip #{clip.index + 1} failed</p>
                                <p className="text-xs text-[#6b6b6b] line-clamp-3">{clip.error}</p>
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
