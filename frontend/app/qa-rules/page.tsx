'use client'

import { useEffect, useState } from 'react'
import { supabase, type QARule } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'
import { CHANNELS, CH_COLOR } from '@/lib/channels'

type Suggestion = { category: string; label: string; rule_text: string; channels: string[] }

// Format/anti-slop suggestions apply everywhere. Channel-voice suggestions
// are drawn straight from config/brand_voice.py's per-channel notes, turned
// into concrete, checkable rules instead of general tone guidance.
const SUGGESTIONS: Suggestion[] = [
  {
    category: 'Anti-slop & format',
    label: 'Anti-slop phrasing',
    rule_text: "Avoid AI-generated-sounding phrases and clichés: \"it's not just X, it's Y\", \"in today's fast-paced world\", \"dive into\", \"unlock the power of\", \"game changer\", \"let's explore\", \"delve into\". Write like a person, not a template.",
    channels: [],
  },
  {
    category: 'Anti-slop & format',
    label: 'No hype punctuation',
    rule_text: 'No exclamation points used as hype. At most one per post, and only if genuinely warranted.',
    channels: [],
  },
  {
    category: 'Anti-slop & format',
    label: 'No unverified superlatives',
    rule_text: 'Avoid absolute superlatives without a source: "the best", "the only", "#1", "revolutionary" — qualify or cut them.',
    channels: [],
  },
  {
    category: 'Anti-slop & format',
    label: 'No emoji',
    rule_text: 'Do not use emoji in this content.',
    channels: [],
  },
  {
    category: 'Channel voice',
    label: 'LinkedIn: no motivational-poster language',
    rule_text: "Avoid motivational-poster clichés and LinkedIn-guru phrasing (e.g. \"grateful for this journey\", \"humbled to announce\", numbered-listicle hooks). Lead with a real insight or observation instead.",
    channels: ['linkedin'],
  },
  {
    category: 'Channel voice',
    label: 'Instagram: cap hashtags at 5',
    rule_text: 'Use at most 3-5 relevant hashtags. Caption should complement the image, not just repeat what\'s visible in it.',
    channels: ['instagram'],
  },
  {
    category: 'Channel voice',
    label: 'Email: no filler intros',
    rule_text: 'Subject line under 50 characters. No filler opening sentences ("Hope this finds you well", "I wanted to reach out"). One clear CTA per email.',
    channels: ['email'],
  },
  {
    category: 'Channel voice',
    label: 'TikTok: hook in 3 words',
    rule_text: 'The first 3 words must hook attention immediately. Written to be spoken aloud, not read silently. Keep under 150 words.',
    channels: ['tiktok'],
  },
  {
    category: 'Channel voice',
    label: 'YouTube: justify the length',
    rule_text: 'Longer-form copy must earn its length with real depth or evidence — not padding. Confident, explanatory tone, like a knowledgeable colleague.',
    channels: ['youtube'],
  },
  {
    category: 'Channel voice',
    label: 'X: no hashtags, no hedging',
    rule_text: 'No hashtags. No hedging language ("I think", "maybe", "just my opinion"). State the point directly enough to be quoted or replied to.',
    channels: ['x'],
  },
  {
    category: 'Channel voice',
    label: 'IG Stories: talk to followers, not strangers',
    rule_text: 'Written for people who already follow us — intimate and in-the-moment, not a pitch to new audiences. Raw is fine here.',
    channels: ['instagram_stories'],
  },
  {
    category: 'Channel voice',
    label: 'YT Shorts: fast and informative',
    rule_text: 'Get to the point immediately — people here are often searching, not idly scrolling. No fluff intro.',
    channels: ['youtube_shorts'],
  },
  {
    category: 'Channel voice',
    label: 'Pinterest: keyword-forward, not personality-driven',
    rule_text: 'Written to be found via search — clear, specific, keyword-forward copy. Not a personality-driven caption.',
    channels: ['pinterest'],
  },
  {
    category: 'Channel voice',
    label: 'Reddit: zero marketing polish',
    rule_text: 'Plain, first-person, zero marketing polish. Must read like a practitioner posting in the thread, not a brand account. If it sounds like copy, it fails.',
    channels: ['reddit'],
  },
  {
    category: 'Channel voice',
    label: 'Threads: casual, unfinished is OK',
    rule_text: 'Casual and a little playful — more relaxed than X, less formal than LinkedIn. Comfortable sounding unfinished or conversational.',
    channels: ['threads'],
  },
]

const CATEGORIES = Array.from(new Set(SUGGESTIONS.map(s => s.category)))

function ChannelBadges({ channels }: { channels: string[] | null }) {
  if (!channels || channels.length === 0) {
    return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#f7f7f7] text-[#6b6b6b]">All channels</span>
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {channels.map(id => {
        const ch = CHANNELS.find(c => c.id === id)
        const color = CH_COLOR[id]
        return (
          <span
            key={id}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: color?.bg ?? '#f7f7f7', color: color?.text ?? '#6b6b6b' }}
          >
            {ch?.label ?? id}
          </span>
        )
      })}
    </div>
  )
}

export default function QARulesPage() {
  const [rules, setRules]         = useState<QARule[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // AI-assisted drafting
  const [description, setDescription] = useState('')
  const [drafting, setDrafting]       = useState(false)
  const [draftErr, setDraftErr]       = useState('')

  // review/save form — populated by AI draft or a clicked suggestion
  const [label, setLabel]         = useState('')
  const [ruleText, setRuleText]   = useState('')
  const [channels, setChannels]   = useState<string[]>([])   // empty = all
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)

  const [openCategory, setOpenCategory] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const pid = await resolveActiveProjectClient()
    const { data, error: err } = await scoped(
      supabase.from('qa_rules').select('*'), pid,
    ).order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
    } else {
      setRules(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openReview = (l: string, rt: string, ch: string[]) => {
    setLabel(l); setRuleText(rt); setChannels(ch); setShowForm(true)
  }

  const draftWithAI = async () => {
    if (!description.trim()) return
    setDrafting(true); setDraftErr('')
    try {
      const res = await fetch('/api/qa-rules/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setDraftErr(data.error ?? 'Could not draft a rule'); return }
      openReview(data.draft.label, data.draft.rule_text, data.draft.channels ?? [])
      setDescription('')
    } catch (err: any) {
      setDraftErr(err?.message ?? 'Unexpected error')
    } finally {
      setDrafting(false)
    }
  }

  const toggleChannel = (id: string) => {
    setChannels(cs => cs.includes(id) ? cs.filter(c => c !== id) : [...cs, id])
  }

  const saveRule = async () => {
    if (!label.trim() || !ruleText.trim()) return
    setSaving(true)
    setError('')
    const pid = await resolveActiveProjectClient()
    const { error: err } = await supabase.from('qa_rules').insert({
      label: label.trim(),
      rule_text: ruleText.trim(),
      channels: channels.length > 0 ? channels : null,
      active: true,
      ...(pid ? { project_id: pid } : {}),
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setLabel(''); setRuleText(''); setChannels([]); setShowForm(false)
    load()
  }

  const [busyId, setBusyId] = useState<string | null>(null)

  const toggleActive = async (rule: QARule) => {
    setBusyId(rule.id)
    await supabase.from('qa_rules').update({ active: !rule.active }).eq('id', rule.id)
    setBusyId(null)
    load()
  }

  const deleteRule = async (rule: QARule) => {
    setBusyId(rule.id)
    await supabase.from('qa_rules').delete().eq('id', rule.id)
    setBusyId(null)
    load()
  }

  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-3xl w-full mx-auto">

      {/* header */}
      <div className="mb-8 pb-6 border-b border-[#e6e6e6]">
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight">QA Rules</h1>
        <p className="text-[13.5px] text-[#6b6b6b] mt-1.5">
          House rules checked on every draft alongside tone, credibility, and clarity — scoped to all channels or specific ones.
        </p>
      </div>

      {error && <p className="text-xs text-[#DC2626] mb-4">{error}</p>}

      {/* AI-assisted drafting — the primary way to add a rule */}
      <div className="mb-4 p-4 border border-[#e6e6e6] rounded bg-[#fafafa]">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-2">Describe a rule, in your own words</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. no corporate jargon on LinkedIn, or never use the word 'synergy' anywhere"
            disabled={drafting}
            onKeyDown={e => { if (e.key === 'Enter') draftWithAI() }}
            className="flex-1 px-3 py-2 text-sm border border-[#cccccc] rounded outline-none focus:border-[#1c69d4] disabled:opacity-50"
          />
          <button
            onClick={draftWithAI}
            disabled={drafting || !description.trim()}
            className="px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white hover:bg-[#0653b6] rounded transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
          >
            {drafting ? 'Drafting…' : '✦ Draft it'}
          </button>
        </div>
        {draftErr && <p className="text-xs text-[#DC2626] mt-2">{draftErr}</p>}
      </div>

      {/* curated suggestions, browsable by category */}
      <div className="mb-8">
        {CATEGORIES.map(cat => (
          <div key={cat} className="border border-[#e6e6e6] rounded mb-2 overflow-hidden">
            <button
              onClick={() => setOpenCategory(c => c === cat ? null : cat)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white hover:bg-[#fafafa] transition-colors"
            >
              <span className="text-sm font-semibold text-[#262626]">{cat}</span>
              <span className="text-xs text-[#9a9a9a]">{openCategory === cat ? '↑ hide' : `↓ ${SUGGESTIONS.filter(s => s.category === cat).length} suggestions`}</span>
            </button>
            {openCategory === cat && (
              <div className="px-4 pb-3 flex gap-2 flex-wrap bg-white">
                {SUGGESTIONS.filter(s => s.category === cat).map(s => (
                  <button
                    key={s.label}
                    onClick={() => openReview(s.label, s.rule_text, s.channels)}
                    className="px-3 py-1.5 text-xs border border-[#cccccc] rounded text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#1c69d4] transition-colors"
                  >
                    + {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {!showForm && (
          <button
            onClick={() => openReview('', '', [])}
            className="text-xs text-[#9a9a9a] hover:text-[#1c69d4] transition-colors mt-1"
          >
            or write one completely from scratch
          </button>
        )}
      </div>

      {/* review & save — populated by AI draft or a suggestion, always editable before saving */}
      {showForm && (
        <div className="mb-8 p-4 border border-[#1c69d4] rounded bg-[#F5F8FF]">
          <p className="text-xs text-[#1c69d4] font-semibold uppercase tracking-widest mb-3">Review & save</p>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Short name"
            disabled={saving}
            className="w-full mb-2 px-3 py-2 text-sm border border-[#cccccc] rounded outline-none focus:border-[#1c69d4] disabled:opacity-50 bg-white"
          />
          <textarea
            value={ruleText}
            onChange={e => setRuleText(e.target.value)}
            placeholder="The instruction the QA reviewer should check for."
            rows={3}
            disabled={saving}
            className="w-full mb-3 px-3 py-2 text-sm border border-[#cccccc] rounded outline-none focus:border-[#1c69d4] disabled:opacity-50 resize-y bg-white"
          />
          <p className="text-xs text-[#6b6b6b] mb-1.5">Applies to</p>
          <div className="flex gap-1.5 flex-wrap mb-3">
            <button
              onClick={() => setChannels([])}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                channels.length === 0
                  ? 'border-[#1c69d4] bg-[#1c69d4] text-white font-semibold'
                  : 'border-[#cccccc] text-[#6b6b6b] hover:border-[#1c69d4]'
              }`}
            >
              All channels
            </button>
            {CHANNELS.map(c => (
              <button
                key={c.id}
                onClick={() => toggleChannel(c.id)}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  channels.includes(c.id)
                    ? 'border-[#1c69d4] bg-[#1c69d4] text-white font-semibold'
                    : 'border-[#cccccc] text-[#6b6b6b] hover:border-[#1c69d4]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveRule}
              disabled={saving || !label.trim() || !ruleText.trim()}
              className="px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white hover:bg-[#0653b6] rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              {saving ? 'Saving…' : 'Add rule'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              disabled={saving}
              className="px-4 py-2 text-sm text-[#6b6b6b] hover:text-[#262626] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* rule list */}
      {loading ? (
        <p className="text-xs text-[#9a9a9a] text-center py-12">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-[#9a9a9a] text-center py-12">
          No custom rules yet — describe one above, or browse suggestions.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`flex items-start gap-3 p-4 bg-white border rounded transition-opacity ${
                rule.active ? 'border-[#e6e6e6]' : 'border-[#e6e6e6] opacity-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="text-sm font-semibold text-[#262626]">{rule.label}</p>
                  <ChannelBadges channels={rule.channels} />
                </div>
                <p className="text-xs text-[#6b6b6b] leading-relaxed">{rule.rule_text}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => toggleActive(rule)}
                  disabled={busyId === rule.id}
                  className="text-xs font-semibold text-[#1c69d4] hover:text-[#0653b6] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  {rule.active ? 'Disable' : 'Enable'}
                </button>
                <button
                  onClick={() => deleteRule(rule)}
                  disabled={busyId === rule.id}
                  className="text-xs text-[#DC2626] hover:text-[#b91c1c] disabled:opacity-40 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
