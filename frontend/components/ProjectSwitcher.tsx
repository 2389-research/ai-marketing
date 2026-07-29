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
        <span className="w-7 h-7 bg-[#262e38] text-[#bbbbbb] text-[11px] font-bold flex items-center justify-center shrink-0 leading-none select-none rounded">
          {fallbackName[0]?.toUpperCase() ?? 'M'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-[#d5d5d5] truncate leading-tight" title={fallbackName}>
            {fallbackName}
          </p>
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
        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-[#262e38] transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 bg-[#1800ad] text-[#d5d5d5] text-[11px] font-bold flex items-center justify-center shrink-0 rounded">
            {active.name[0]?.toUpperCase()}
          </span>
          <span className="text-[13px] font-bold text-[#d5d5d5] truncate">{active.name}</span>
        </div>
        <span className="text-[#9a9a9a] text-[10px] shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-[#1a2129] border border-[#262e38] rounded z-50 py-1">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { if (p.id !== activeId) setActiveProject(p.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                p.id === activeId ? 'text-[#d5d5d5] font-bold bg-[#262e38]' : 'text-[#bbbbbb] hover:bg-[#262e38]'
              }`}>
              <span className="w-5 h-5 bg-[#3c3c3c] text-[#d5d5d5] text-[10px] font-bold flex items-center justify-center shrink-0 rounded">
                {p.name[0]?.toUpperCase()}
              </span>
              <span className="truncate">{p.name}</span>
              {p.id === activeId && <span className="ml-auto text-xs text-[#1800ad]">✓</span>}
            </button>
          ))}

          <div className="border-t border-[#262e38] mt-1 pt-1">
            {creating ? (
              <div className="px-3 py-2 flex items-center gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') setCreating(false) }}
                  placeholder="Project name"
                  className="flex-1 min-w-0 text-sm bg-[#1a2129] text-[#d5d5d5] border border-[#262e38] px-2 py-1 focus:outline-none focus:border-[#1800ad] rounded"
                />
                <button
                  onClick={create}
                  disabled={saving || !newName.trim()}
                  className="text-xs font-bold text-[#1800ad] hover:text-[#d5d5d5] disabled:opacity-40 shrink-0">
                  {saving ? '…' : 'Add'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full px-3 py-2 text-sm text-left text-[#9a9a9a] hover:text-[#d5d5d5] hover:bg-[#262e38] transition-colors">
                + New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
