'use client'

import { useState } from 'react'
import { fontFamilyFor } from '@/lib/fonts'

interface SubtitleOverlayProps {
  containerRef: React.RefObject<HTMLDivElement>
  position: number   // 0.0 (top) – 1.0 (bottom), mirrors options.subtitle_position
  onChange: (position: number) => void
  fontKey: string
  text?: string
}

// Draggable sample-subtitle box layered over the video preview. This is an
// approximation for feel/direction, not a pixel-exact match to the backend's
// text-bbox math (see video_process.py's _make_text_png) — good enough to
// drag "roughly here" before generating, not meant to replace the real render.
export default function SubtitleOverlay({ containerRef, position, onChange, fontKey, text = 'Sample subtitle text' }: SubtitleOverlayProps) {
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    setDragging(true)

    const onMove = (ev: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect || rect.height === 0) return
      const frac = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height))
      onChange(frac)
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute left-1/2 px-3 py-1 rounded cursor-grab select-none transition-shadow ${
        dragging ? 'ring-2 ring-white cursor-grabbing' : 'hover:ring-1 hover:ring-white/60'
      }`}
      style={{
        top: `${position * 100}%`,
        transform: 'translate(-50%, -50%)',
        fontFamily: fontFamilyFor(fontKey),
        color: 'white',
        textShadow: '0 0 4px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.8)',
        fontSize: '1.35rem',
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        touchAction: 'none',
      }}
    >
      {text}
    </div>
  )
}
