'use client'

import { useEffect, useState } from 'react'

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
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-5xl w-full">

      {/* header */}
      <div className="flex items-baseline justify-between mb-8 pb-6 border-b border-[#E5E7EB]">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold text-[#111111]">Photo Library</h1>
          <p className="text-base text-[#888880] mt-1.5">Upload photos — AI will describe and match them to your drafts</p>
        </div>
        <label className={`px-4 py-2 text-sm font-semibold bg-[#7C3AED] text-white rounded-lg transition-colors cursor-pointer ${uploading ? 'opacity-40 pointer-events-none' : 'hover:bg-[#6D28D9]'}`}>
          {uploading ? 'Uploading…' : '+ Upload photos'}
          <input type="file" accept="image/*" multiple onChange={e => { handleUpload(e.target.files); (e.target as HTMLInputElement).value = '' }} disabled={uploading} style={{ display: 'none' }} />
        </label>
      </div>

      {uploadErr && (
        <p className="font-mono text-xs text-[#DC2626] mb-4">{uploadErr}</p>
      )}

      {/* drop zone (shown when empty) */}
      {!loading && photos.length === 0 && (
        <label
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-[#E5E7EB] rounded-xl flex flex-col items-center justify-center py-24 cursor-pointer hover:border-[#7C3AED] hover:bg-[#F5F3FF] transition-colors">
          <p className="text-sm font-semibold text-[#111111] mb-1">Drop photos here or click to upload</p>
          <p className="text-sm text-[#888880]">AI will automatically describe each photo for smart matching</p>
          <input type="file" accept="image/*" multiple onChange={e => { handleUpload(e.target.files); (e.target as HTMLInputElement).value = '' }} style={{ display: 'none' }} />
        </label>
      )}

      {/* drag overlay hint when photos exist */}
      {!loading && photos.length > 0 && (
        <label
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="mb-6 block border border-dashed border-[#E5E7EB] rounded-lg px-4 py-3 text-center text-sm text-[#BBBBBB] hover:border-[#7C3AED] hover:text-[#7C3AED] transition-colors cursor-pointer">
          Drop more photos here or click to add
          <input type="file" accept="image/*" multiple onChange={e => { handleUpload(e.target.files); (e.target as HTMLInputElement).value = '' }} style={{ display: 'none' }} />
        </label>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="font-mono text-xs text-[#BBBBBB]">Loading…</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map(photo => (
            <div key={photo.id} className="group relative bg-white border border-[#E5E7EB] rounded-xl overflow-hidden shadow-sm">
              <div className="aspect-square bg-[#F9FAFB] overflow-hidden">
                <img
                  src={photo.public_url}
                  alt={photo.filename}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-3">
                <p className="font-mono text-xs text-[#111111] truncate mb-1">{photo.filename}</p>
                <p className="text-xs text-[#888880] leading-relaxed line-clamp-3">
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
    </div>
  )
}
