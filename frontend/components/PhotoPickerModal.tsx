'use client'

import { useEffect, useState } from 'react'

interface LibraryPhoto {
  id: string
  filename: string
  description: string | null
  display_url: string
  public_url: string
}

export default function PhotoPickerModal({
  onPick, onClose, attached,
}: {
  onPick: (publicUrl: string) => void
  onClose: () => void
  attached: string[]
}) {
  const [photos, setPhotos] = useState<LibraryPhoto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/photos')
      .then(r => r.json())
      .then(data => setPhotos(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EBEBEB]">
          <p className="text-sm font-semibold text-[#111111]">Choose from library</p>
          <button onClick={onClose} className="text-[#BBBBBB] hover:text-[#111111] text-lg leading-none">×</button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading ? (
            <p className="font-mono text-xs text-[#BBBBBB] text-center py-12">Loading…</p>
          ) : photos.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-semibold text-[#111111] mb-1">No photos in this project yet</p>
              <p className="font-mono text-xs text-[#888880]">Upload some on the Photos page first.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {photos.map(p => {
                const isAttached = attached.includes(p.public_url)
                return (
                  <button
                    key={p.id}
                    onClick={() => onPick(p.public_url)}
                    disabled={isAttached}
                    title={p.description ?? p.filename}
                    className={`group relative aspect-square rounded-lg overflow-hidden border transition-all ${
                      isAttached ? 'border-[#10B981] opacity-60 cursor-default' : 'border-[#EBEBEB] hover:border-[#7C3AED]'
                    }`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.display_url} alt={p.filename} className="w-full h-full object-cover" />
                    {isAttached && (
                      <span className="absolute top-1 right-1 bg-[#10B981] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">✓</span>
                    )}
                    {!isAttached && (
                      <span className="absolute inset-0 bg-[#7C3AED]/0 group-hover:bg-[#7C3AED]/10 flex items-center justify-center transition-colors">
                        <span className="opacity-0 group-hover:opacity-100 bg-white text-[#7C3AED] text-[10px] font-semibold px-2 py-0.5 rounded-full transition-opacity">Attach</span>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
