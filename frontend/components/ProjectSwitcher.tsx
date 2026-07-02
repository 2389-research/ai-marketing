'use client'

import { useEffect, useRef, useState } from 'react'
import { getActiveProjectClient, setActiveProject, type Project } from '@/lib/project'

export default function ProjectSwitcher({ fallbackName = 'My Company' }: { fallbackName?: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [open, setOpen]         = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName]   = useState('')
  const [saving, setSaving]     = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // Pre-migration (no projects table yet): static header, no dropdown
  if (projects.length === 0) {
    return (
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <span className="w-7 h-7 rounded-lg bg-[#3F3F46] text-[#D4D4D8] text-[11px] font-bold flex items-center justify-center shrink-0 leading-none select-none">
          {fallbackName[0]?.toUpperCase() ?? 'M'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white truncate leading-tight" title={fallbackName}>
            {fallbackName}
          </p>
          <p className="text-[11px] text-[#52525B] mt-0.5 leading-tight">Marketing Agent</p>
        </div>
      </div>
    )
  }

  const activeId = getActiveProjectClient() ?? projects[0].id
  const active   = projects.find(p => p.id === activeId) ?? projects[0]

  const create = async () => {
    if (!newName.trim() || saving) return
    setSaving(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    setSaving(false)
    if (res.ok) {
      const project = await res.json()
      setActiveProject(project.id)   // sets cookie + reloads
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-[#27272A] transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-[#7C3AED] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
            {active.name[0]?.toUpperCase()}
          </span>
          <span className="text-[13px] font-semibold text-white truncate">{active.name}</span>
        </div>
        <span className="text-[#52525B] text-[10px] shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-[#27272A] border border-[#3F3F46] rounded-lg shadow-xl z-50 py-1">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { if (p.id !== activeId) setActiveProject(p.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                p.id === activeId ? 'text-[#C4B5FD] font-semibold bg-[#3F3F46]' : 'text-[#D4D4D8] hover:bg-[#3F3F46]'
              }`}>
              <span className="w-5 h-5 rounded bg-[#52525B] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {p.name[0]?.toUpperCase()}
              </span>
              <span className="truncate">{p.name}</span>
              {p.id === activeId && <span className="ml-auto text-xs">✓</span>}
            </button>
          ))}

          <div className="border-t border-[#3F3F46] mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-2 flex items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false) }}
                  placeholder="Project name"
                  className="flex-1 min-w-0 text-sm bg-[#18181B] text-white border border-[#3F3F46] rounded px-2 py-1 focus:outline-none focus:border-[#7C3AED]"
                />
                <button
                  onClick={create}
                  disabled={saving || !newName.trim()}
                  className="text-xs font-semibold text-[#C4B5FD] hover:text-white disabled:opacity-40 shrink-0">
                  {saving ? '…' : 'Add'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full px-3 py-2 text-sm text-left text-[#71717A] hover:text-white hover:bg-[#3F3F46] transition-colors">
                + New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
