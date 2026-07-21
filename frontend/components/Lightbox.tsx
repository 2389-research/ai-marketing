'use client'

import { useEffect } from 'react'

const isVideo = (url: string) => /\.(mp4|mov|webm|avi|m4v)(\?|$)/i.test(url)

export default function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
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
          className="max-w-[90vw] max-h-[90vh] rounded shadow-2xl"
          onClick={e => e.stopPropagation()}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? ''}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded shadow-2xl"
          onClick={e => e.stopPropagation()}
        />
      )}
    </div>
  )
}
