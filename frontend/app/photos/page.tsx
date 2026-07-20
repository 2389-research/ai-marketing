'use client'

import { useEffect, useState } from 'react'
import Lightbox from '@/components/Lightbox'

interface Photo {
  id: string
  filename: string
  public_url: string
  description: string | null
  storage_path: string
  created_at: string
}

export default function PhotosPage() {
  const [photos, setPhotos]       = useState<Photo[]>([])
  const [loading, setLoading]     = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/photos')
    const data = await res.json()
    setPhotos(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadErr('')
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/photos/upload', { method: 'POST', body: form })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setUploadErr(j.error ?? 'Upload failed')
      }
    }
    setUploading(false)
    load()
  }

  const handleDelete = async (photo: Photo) => {
    setDeleting(photo.id)
    await fetch('/api/photos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: photo.id, storage_path: photo.storage_path }),
    })
    setDeleting(null)
    setPhotos(ps => ps.filter(p => p.id !== photo.id))
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    handleUpload(e.dataTransfer.files)
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-5xl w-full mx-auto">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 pb-6 border-b border-[#e6e6e6]">
        <div>
          <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">Photo Library</h1>
          <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">Upload photos — AI will describe and match them to your drafts</p>
        </div>
        <label className={`px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white rounded transition-colors cursor-pointer ${uploading ? 'opacity-40 pointer-events-none' : 'hover:bg-[#0653b6]'}`}>
          {uploading ? 'Uploading…' : '+ Upload photos'}
          <input type="file" accept="image/*" multiple onChange={e => { handleUpload(e.target.files); (e.target as HTMLInputElement).value = '' }} disabled={uploading} style={{ display: 'none' }} />
        </label>
      </div>

      {uploadErr && (
        <p className="text-xs text-[#DC2626] mb-4">{uploadErr}</p>
      )}

      {/* drop zone (shown when empty) */}
      {!loading && photos.length === 0 && (
        <label
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-[#e6e6e6] rounded flex flex-col items-center justify-center py-24 cursor-pointer hover:border-[#1c69d4] hover:bg-[#f7f7f7] transition-colors">
          <p className="text-sm font-semibold text-[#262626] mb-1">Drop photos here or click to upload</p>
          <p className="text-sm text-[#6b6b6b]">AI will automatically describe each photo for smart matching</p>
          <input type="file" accept="image/*" multiple onChange={e => { handleUpload(e.target.files); (e.target as HTMLInputElement).value = '' }} style={{ display: 'none' }} />
        </label>
      )}

      {/* drag overlay hint when photos exist */}
      {!loading && photos.length > 0 && (
        <label
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="mb-6 block border border-dashed border-[#e6e6e6] rounded px-4 py-3 text-center text-sm text-[#9a9a9a] hover:border-[#1c69d4] hover:text-[#1c69d4] transition-colors cursor-pointer">
          Drop more photos here or click to add
          <input type="file" accept="image/*" multiple onChange={e => { handleUpload(e.target.files); (e.target as HTMLInputElement).value = '' }} style={{ display: 'none' }} />
        </label>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-xs text-[#9a9a9a]">Loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map(photo => (
            <div key={photo.id} className="group relative bg-white border border-[#e6e6e6] rounded overflow-hidden ">
              <div className="aspect-square bg-[#f7f7f7] overflow-hidden">
                <img
                  src={photo.public_url}
                  alt={photo.filename}
                  onClick={() => setLightboxUrl(photo.public_url)}
                  className="w-full h-full object-cover cursor-zoom-in hover:opacity-80 transition-opacity"
                />
              </div>
              <div className="p-3">
                <p className="text-xs text-[#262626] truncate mb-1">{photo.filename}</p>
                <p className="text-xs text-[#6b6b6b] leading-relaxed line-clamp-3">
                  {photo.description ?? 'No description yet'}
                </p>
              </div>
              <button
                onClick={() => handleDelete(photo)}
                disabled={deleting === photo.id}
                className="absolute top-2 right-2 w-6 h-6 bg-black/60 hover:bg-black/80 text-white text-xs rounded-full hidden group-hover:flex items-center justify-center transition-colors disabled:opacity-40">
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {lightboxUrl && <Lightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  )
}
