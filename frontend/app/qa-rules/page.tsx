'use client'

import { useEffect, useState } from 'react'
import { supabase, type QARule } from '@/lib/supabase'
import { resolveActiveProjectClient, scoped } from '@/lib/project'

const PRESETS = [
  {
    label: 'Anti-slop phrasing',
    rule_text: "Avoid AI-generated-sounding phrases and clichés: \"it's not just X, it's Y\", \"in today's fast-paced world\", \"dive into\", \"unlock the power of\", \"game changer\", \"let's explore\", \"delve into\". Write like a person, not a template.",
  },
  {
    label: 'No hype punctuation',
    rule_text: 'No exclamation points used as hype. At most one per post, and only if genuinely warranted.',
  },
  {
    label: 'No unverified superlatives',
    rule_text: 'Avoid absolute superlatives without a source: "the best", "the only", "#1", "revolutionary" — qualify or cut them.',
  },
  {
    label: 'No emoji',
    rule_text: 'Do not use emoji in this content.',
  },
]

export default function QARulesPage() {
  const [rules, setRules]         = useState<QARule[]>([])
  const [loading, setLoading]     = useState(true)
  const [label, setLabel]         = useState('')
  const [ruleText, setRuleText]   = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [busyId, setBusyId]       = useState<string | null>(null)

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

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setLabel(p.label)
    setRuleText(p.rule_text)
  }

  const addRule = async () => {
    if (!label.trim() || !ruleText.trim()) return
    setSaving(true)
    setError('')
    const pid = await resolveActiveProjectClient()
    const { error: err } = await supabase.from('qa_rules').insert({
      label: label.trim(),
      rule_text: ruleText.trim(),
      active: true,
      ...(pid ? { project_id: pid } : {}),
    })
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setLabel(''); setRuleText('')
    load()
  }

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
          Custom house rules checked on every draft alongside tone, credibility, and clarity — e.g. anti-slop phrasing, style bans.
        </p>
      </div>

      {error && <p className="text-xs text-[#DC2626] mb-4">{error}</p>}

      {/* add rule */}
      <div className="mb-8 p-4 border border-[#e6e6e6] rounded bg-[#fafafa]">
        <p className="text-xs text-[#6b6b6b] uppercase tracking-widest mb-3">Add a rule</p>

        <div className="flex gap-2 flex-wrap mb-3">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className="px-3 py-1.5 text-xs border border-[#cccccc] rounded text-[#6b6b6b] hover:border-[#1c69d4] hover:text-[#1c69d4] transition-colors"
            >
              + {p.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="Short name, e.g. Anti-slop phrasing"
          disabled={saving}
          className="w-full mb-2 px-3 py-2 text-sm border border-[#cccccc] rounded outline-none focus:border-[#1c69d4] disabled:opacity-50"
        />
        <textarea
          value={ruleText}
          onChange={e => setRuleText(e.target.value)}
          placeholder="The actual instruction the QA reviewer should check for — be specific."
          rows={3}
          disabled={saving}
          className="w-full mb-3 px-3 py-2 text-sm border border-[#cccccc] rounded outline-none focus:border-[#1c69d4] disabled:opacity-50 resize-y"
        />
        <button
          onClick={addRule}
          disabled={saving || !label.trim() || !ruleText.trim()}
          className="px-4 py-2 text-sm font-semibold bg-[#1c69d4] text-white hover:bg-[#0653b6] rounded transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {saving ? 'Adding…' : 'Add rule'}
        </button>
      </div>

      {/* rule list */}
      {loading ? (
        <p className="text-xs text-[#9a9a9a] text-center py-12">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-[#9a9a9a] text-center py-12">
          No custom rules yet — add one above, or pick a preset to get started.
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
                <p className="text-sm font-semibold text-[#262626]">{rule.label}</p>
                <p className="text-xs text-[#6b6b6b] mt-1 leading-relaxed">{rule.rule_text}</p>
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
