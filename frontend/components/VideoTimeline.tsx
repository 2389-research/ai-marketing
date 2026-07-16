'use client'

import { useRef, useState, useCallback } from 'react'

export interface Thumbnail {
  time: number
  url: string
}

interface VideoTimelineProps {
  duration: number
  thumbnails: Thumbnail[]
  thumbnailsLoading?: boolean
  start: number
  end: number
  onChange: (start: number, end: number) => void
  currentTime?: number
  onSeek?: (time: number) => void
}

type DragHandle = 'start' | 'end' | 'playhead' | null

export default function VideoTimeline({
  duration, thumbnails, thumbnailsLoading, start, end, onChange, currentTime, onSeek,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<DragHandle>(null)

  const timeAtClientX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return frac * duration
  }, [duration])

  const beginDrag = (handle: DragHandle) => (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(handle)

    const onMove = (ev: PointerEvent) => {
      const t = timeAtClientX(ev.clientX)
      if (handle === 'start') onChange(Math.min(t, end - 0.2), end)
      else if (handle === 'end') onChange(start, Math.max(t, start + 0.2))
      else if (handle === 'playhead') onSeek?.(t)
    }
    const onUp = () => {
      setDragging(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleTrackClick = (e: React.MouseEvent) => {
    if (dragging) return
    onSeek?.(timeAtClientX(e.clientX))
  }

  const pct = (t: number) => duration > 0 ? Math.max(0, Math.min(100, (t / duration) * 100)) : 0

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        className="relative h-14 rounded overflow-hidden bg-[#262626] cursor-pointer"
      >
        {/* thumbnail strip */}
        {thumbnailsLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[10px] text-[#6b6b6b]">Loading thumbnails…</p>
          </div>
        ) : (
          <div className="absolute inset-0 flex">
            {thumbnails.map((t, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={t.url} alt="" draggable={false} className="h-full flex-1 object-cover" />
            ))}
          </div>
        )}

        {/* dimmed regions outside the selected trim range */}
        <div className="absolute inset-y-0 left-0 bg-black/60 pointer-events-none" style={{ width: `${pct(start)}%` }} />
        <div className="absolute inset-y-0 right-0 bg-black/60 pointer-events-none" style={{ width: `${100 - pct(end)}%` }} />

        {/* trim handles */}
        <div
          onPointerDown={beginDrag('start')}
          className="absolute inset-y-0 w-2.5 bg-[#1c69d4] cursor-ew-resize hover:bg-[#0653b6] transition-colors"
          style={{ left: `calc(${pct(start)}% - 5px)` }}
        />
        <div
          onPointerDown={beginDrag('end')}
          className="absolute inset-y-0 w-2.5 bg-[#1c69d4] cursor-ew-resize hover:bg-[#0653b6] transition-colors"
          style={{ left: `calc(${pct(end)}% - 5px)` }}
        />

        {/* playhead */}
        {typeof currentTime === 'number' && (
          <div
            onPointerDown={beginDrag('playhead')}
            className="absolute inset-y-0 w-0.5 bg-white cursor-ew-resize"
            style={{ left: `${pct(currentTime)}%` }}
          />
        )}
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-[#6b6b6b]">{start.toFixed(1)}s</span>
        <span className="text-[10px] text-[#9a9a9a]">{(end - start).toFixed(1)}s selected</span>
        <span className="text-[10px] text-[#6b6b6b]">{end.toFixed(1)}s</span>
      </div>
    </div>
  )
}
