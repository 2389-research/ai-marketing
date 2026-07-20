'use client'

import { useEffect, useState } from 'react'
import { supabase, type QARule } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'
import { CHANNELS, CH_COLOR } from '@/lib/channels'

type Suggestion = { category: string; label: string; rule_text: string; channels: string[] }

// Sections are channel-first: "All channels" (format/anti-slop, applies
// everywhere) followed by one section per platform, each with several
// concrete, checkable suggestions — not just a single restated voice note.
// Channel sections draw on config/brand_voice.py's per-channel notes plus
// common platform-specific failure modes.
const ALL_CHANNELS_LABEL = 'All channels'

const SUGGESTIONS: Suggestion[] = [
  // ── All channels ──────────────────────────────────────────────────────
  {
    category: ALL_CHANNELS_LABEL,
    label: 'Anti-slop phrasing',
    rule_text: "Avoid AI-generated-sounding phrases and clichés: \"it's not just X, it's Y\", \"in today's fast-paced world\", \"dive into\", \"unlock the power of\", \"game changer\", \"let's explore\", \"delve into\". Write like a person, not a template.",
    channels: [],
  },
  {
    category: ALL_CHANNELS_LABEL,
    label: 'No hype punctuation',
    rule_text: 'No exclamation points used as hype. At most one per post, and only if genuinely warranted.',
    channels: [],
  },
  {
    category: ALL_CHANNELS_LABEL,
    label: 'No unverified superlatives',
    rule_text: 'Avoid absolute superlatives without a source: "the best", "the only", "#1", "revolutionary" — qualify or cut them.',
    channels: [],
  },
  {
    category: ALL_CHANNELS_LABEL,
    label: 'No emoji',
    rule_text: 'Do not use emoji in this content.',
    channels: [],
  },
  {
    category: ALL_CHANNELS_LABEL,
    label: 'No vague CTAs',
    rule_text: 'Every call to action must be concrete (what to click, what happens next). Flag vague closers like "check it out" or "learn more" with nothing to actually click or reference.',
    channels: [],
  },
  {
    category: ALL_CHANNELS_LABEL,
    label: 'No unexplained jargon',
    rule_text: 'Any acronym or technical term not obvious to a reasonably informed outsider must be spelled out or briefly explained on first use.',
    channels: [],
  },

  // ── LinkedIn ──────────────────────────────────────────────────────────
  {
    category: 'LinkedIn',
    label: 'No motivational-poster language',
    rule_text: 'Avoid motivational-poster clichés and LinkedIn-guru phrasing (e.g. "grateful for this journey", "humbled to announce", numbered-listicle hooks).',
    channels: ['linkedin'],
  },
  {
    category: 'LinkedIn',
    label: 'Lead with insight, not an announcement',
    rule_text: 'The opening line should be a real observation or insight, not a generic "Excited to share..." or "I\'m thrilled to announce..." lead-in.',
    channels: ['linkedin'],
  },
  {
    category: 'LinkedIn',
    label: 'No engagement-bait endings',
    rule_text: 'Do not close with cheap engagement bait like "Agree?", "Thoughts below 👇", or "Like if you\'ve been there".',
    channels: ['linkedin'],
  },
  {
    category: 'LinkedIn',
    label: 'Write for a technical audience',
    rule_text: 'Our LinkedIn audience is engineers, researchers, and technical decision-makers — no jargon for jargon\'s sake, but also don\'t dumb the idea down.',
    channels: ['linkedin'],
  },

  // ── Instagram ─────────────────────────────────────────────────────────
  {
    category: 'Instagram',
    label: 'Cap hashtags at 5',
    rule_text: 'Use at most 3-5 hashtags, and only ones directly relevant to the post.',
    channels: ['instagram'],
  },
  {
    category: 'Instagram',
    label: 'Caption complements, doesn\'t repeat',
    rule_text: 'The caption should add context or personality, not just describe what\'s already visible in the image.',
    channels: ['instagram'],
  },
  {
    category: 'Instagram',
    label: 'Keep it short and punchy',
    rule_text: 'No long unbroken paragraphs — short lines, visual-first thinking even in the copy.',
    channels: ['instagram'],
  },
  {
    category: 'Instagram',
    label: 'No press-release tone',
    rule_text: 'Should read with a little personality, not like a corporate press release.',
    channels: ['instagram'],
  },

  // ── Email ─────────────────────────────────────────────────────────────
  {
    category: 'Email',
    label: 'Subject line under 50 characters',
    rule_text: 'The subject line must be under 50 characters.',
    channels: ['email'],
  },
  {
    category: 'Email',
    label: 'No filler opening sentences',
    rule_text: 'No filler intro lines like "Hope this finds you well" or "I wanted to reach out". Get to the point in the first sentence.',
    channels: ['email'],
  },
  {
    category: 'Email',
    label: 'One clear CTA',
    rule_text: 'Exactly one clear call to action per email — flag emails asking the reader to do more than one thing.',
    channels: ['email'],
  },

  // ── TikTok ────────────────────────────────────────────────────────────
  {
    category: 'TikTok',
    label: 'Hook in the first 3 words',
    rule_text: 'The first 3 words must hook attention immediately — no slow windup.',
    channels: ['tiktok'],
  },
  {
    category: 'TikTok',
    label: 'Under 150 words',
    rule_text: 'Keep the script/caption under 150 words total.',
    channels: ['tiktok'],
  },
  {
    category: 'TikTok',
    label: 'Written to be spoken',
    rule_text: 'Should read like natural speech, not written prose — flag anything that sounds like it was written to be read silently rather than said aloud.',
    channels: ['tiktok'],
  },
  {
    category: 'TikTok',
    label: 'Casual, self-aware tone',
    rule_text: 'Casual and a little self-aware — no corporate or overly polished tone.',
    channels: ['tiktok'],
  },

  // ── YouTube ───────────────────────────────────────────────────────────
  {
    category: 'YouTube',
    label: 'Justify the length',
    rule_text: 'Longer-form copy must earn its length with real depth or evidence, not padding.',
    channels: ['youtube'],
  },
  {
    category: 'YouTube',
    label: 'No unfulfilled clickbait',
    rule_text: 'The title/hook must accurately represent what the content actually delivers — no clickbait framing that oversells the payoff.',
    channels: ['youtube'],
  },
  {
    category: 'YouTube',
    label: 'Knowledgeable-colleague tone',
    rule_text: 'Confident and explanatory, like a knowledgeable colleague walking through something — not a lecture.',
    channels: ['youtube'],
  },

  // ── X ──────────────────────────────────────────────────────────────────
  {
    category: 'X',
    label: 'No hashtags',
    rule_text: 'No hashtags anywhere in the post.',
    channels: ['x'],
  },
  {
    category: 'X',
    label: 'No hedging language',
    rule_text: 'No hedging language like "I think", "maybe", or "just my opinion" — state the point directly.',
    channels: ['x'],
  },
  {
    category: 'X',
    label: 'No thread-bait openers',
    rule_text: 'No "a thread 🧵" or "1/" style openers unless it\'s genuinely a multi-post thread.',
    channels: ['x'],
  },
  {
    category: 'X',
    label: 'Quotable and direct',
    rule_text: 'The point should be stated directly enough to be quoted or replied to — flag vague or wishy-washy statements.',
    channels: ['x'],
  },

  // ── Instagram Stories ─────────────────────────────────────────────────
  {
    category: 'IG Stories',
    label: 'Talk to followers, not strangers',
    rule_text: 'Written for people who already follow us — intimate and in-the-moment, not a pitch aimed at new audiences.',
    channels: ['instagram_stories'],
  },
  {
    category: 'IG Stories',
    label: 'Raw is fine',
    rule_text: 'Don\'t over-produce or over-polish — a rougher, more spontaneous feel is appropriate here.',
    channels: ['instagram_stories'],
  },

  // ── YouTube Shorts ────────────────────────────────────────────────────
  {
    category: 'YT Shorts',
    label: 'No fluff intro',
    rule_text: 'Get to the point immediately — people here are often searching, not idly scrolling.',
    channels: ['youtube_shorts'],
  },
  {
    category: 'YT Shorts',
    label: 'Slightly more informative than TikTok',
    rule_text: 'Same fast energy as TikTok but should land as more informative — assume some search intent behind the view.',
    channels: ['youtube_shorts'],
  },

  // ── Pinterest ─────────────────────────────────────────────────────────
  {
    category: 'Pinterest',
    label: 'Keyword-forward',
    rule_text: 'Written to be found via search — clear, specific, keyword-forward copy rather than a clever caption.',
    channels: ['pinterest'],
  },
  {
    category: 'Pinterest',
    label: 'Not personality-driven',
    rule_text: 'Informational, not personality-driven — this is discovered via search, not browsed for entertainment.',
    channels: ['pinterest'],
  },

  // ── Reddit ────────────────────────────────────────────────────────────
  {
    category: 'Reddit',
    label: 'Zero marketing polish',
    rule_text: 'Plain, first-person, zero marketing polish. Must read like a practitioner posting in the thread, not a brand account — if it sounds like copy, it fails.',
    channels: ['reddit'],
  },
  {
    category: 'Reddit',
    label: 'No ad-style CTAs',
    rule_text: 'No CTAs that read like an advertisement (e.g. "Check out our website!"). Any link or mention should feel incidental to the discussion, not the point of the post.',
    channels: ['reddit'],
  },

  // ── Threads ───────────────────────────────────────────────────────────
  {
    category: 'Threads',
    label: 'Casual, a little playful',
    rule_text: 'More relaxed than X, less formal than LinkedIn — a little playful is fine.',
    channels: ['threads'],
  },
  {
    category: 'Threads',
    label: 'Unfinished is OK',
    rule_text: 'Comfortable sounding unfinished or conversational — don\'t over-polish it into a formal statement.',
    channels: ['threads'],
  },
]

const CATEGORIES = [ALL_CHANNELS_LABEL, ...CHANNELS.map(c => c.label)]
  .filter(cat => SUGGESTIONS.some(s => s.category === cat))

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

  // generate + auto-apply from the brand profile
  const [generating, setGenerating]   = useState(false)
  const [generateErr, setGenerateErr] = useState('')
  const [generatedMsg, setGeneratedMsg] = useState('')

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

  type GeneratedRule = { label: string; rule_text: string; channels: string[] }

  const generateFromBrand = async () => {
    setGenerating(true); setGenerateErr(''); setGeneratedMsg('')
    try {
      const res = await fetch('/api/qa-rules/generate-from-brand', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setGenerateErr(data.error ?? 'Could not generate rules'); return }

      const proposed: GeneratedRule[] = data.rules ?? []
      if (proposed.length === 0) { setGenerateErr('No rules came back — try adding more to the Brand page'); return }

      const pid = await resolveActiveProjectClient()
      const { error: err } = await supabase.from('qa_rules').insert(
        proposed.map(r => ({
          label: r.label,
          rule_text: r.rule_text,
          channels: r.channels && r.channels.length > 0 ? r.channels : null,
          active: true,
          ...(pid ? { project_id: pid } : {}),
        }))
      )
      if (err) { setGenerateErr(err.message); return }

      setGeneratedMsg(`Added ${proposed.length} rule${proposed.length === 1 ? '' : 's'} from your brand profile — review below, disable or delete anything that doesn't fit.`)
      load()
    } catch (err: any) {
      setGenerateErr(err?.message ?? 'Unexpected error')
    } finally {
      setGenerating(false)
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

      {/* generate + auto-apply from the brand profile */}
      <div className="mb-4 p-4 border border-[#1c69d4]/30 rounded bg-[#F5F8FF]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-[#262626]">Generate from your brand profile</p>
            <p className="text-xs text-[#6b6b6b] mt-0.5">
              Analyzes your Brand page — manual notes, strategy, uploaded files, content pillars — and adds rules grounded in it automatically.
            </p>
          </div>
          <button
            onClick={generateFromBrand}
            disabled={generating}
            className="px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white hover:bg-[#0653b6] rounded transition-colors disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
          >
            {generating ? 'Analyzing…' : '✦ Analyze & apply'}
          </button>
        </div>
        {generateErr && <p className="text-xs text-[#DC2626] mt-2">{generateErr}</p>}
        {generatedMsg && <p className="text-xs text-[#16803D] mt-2">{generatedMsg}</p>}
      </div>

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
