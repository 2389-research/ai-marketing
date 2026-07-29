'use client'

import { useEffect } from 'react'

const isVideo = (url: string) => /\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(url)

export default function Lightbox({ src, alt, caption, onClose }: {
  src: string; alt?: string; caption?: string | null; onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-5 right-5 text-white/70 hover:text-white text-3xl leading-none transition-colors z-10"
      >
        ×
      </button>
      {isVideo(src) ? (
        <video
          src={src}
          controls
          autoPlay
          loop
          playsInline
          className={`max-w-[90vw] rounded shadow-2xl ${caption ? 'max-h-[74vh]' : 'max-h-[90vh]'}`}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? ''}
          className={`max-w-[90vw] object-contain rounded shadow-2xl ${caption ? 'max-h-[74vh]' : 'max-h-[90vh]'}`}
          onClick={e => e.stopPropagation()}
        />
      )}
      {caption && (
        <div
          className="mt-4 max-w-[80vw] md:max-w-[640px] max-h-[16vh] overflow-y-auto bg-black/60 rounded px-4 py-3"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-[13px] text-white/90 leading-relaxed whitespace-pre-wrap">{caption}</p>
        </div>
      )}
    </div>
  )
}
