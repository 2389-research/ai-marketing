export const runtime = 'nodejs'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { CHANNELS } from '@/lib/channels'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHANNEL_IDS = CHANNELS.map(c => c.id)

const GENERATE_RULES_TOOL: Anthropic.Tool = {
  name: 'generate_qa_rules',
  description: 'Propose a set of QA rules derived from a brand profile.',
  input_schema: {
    type: 'object',
    properties: {
      rules: {
        type: 'array',
        minItems: 5,
        maxItems: 10,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short name, under 40 characters.' },
            rule_text: {
              type: 'string',
              description: 'A precise, checkable instruction a QA reviewer LLM can verify against a draft — not a vague restatement of brand values.',
            },
            channels: {
              type: 'array',
              items: { type: 'string', enum: CHANNEL_IDS },
              description: `Channel ids this rule applies to (${CHANNEL_IDS.join(', ')}). Empty array = applies to every channel.`,
            },
          },
          required: ['label', 'rule_text', 'channels'],
        },
      },
    },
    required: ['rules'],
  },
}

export async function POST() {
  const projectId = await getActiveProject()

  const [profileRes, filesRes, pillarsRes] = await Promise.all([
    scoped(supabase.from('brand_profile').select('company_name,manual_notes,strategy,preferred_channels'), projectId).limit(1).maybeSingle(),
    scoped(supabase.from('brand_files').select('file_name,extracted_text'), projectId),
    scoped(supabase.from('content_pillars').select('name,description'), projectId).eq('status', 'approved'),
  ])

  const profile = profileRes.data
  const files = filesRes.data ?? []
  const pillars = pillarsRes.data ?? []

  const hasSignal =
    (profile?.manual_notes && profile.manual_notes.trim()) ||
    (profile?.strategy && profile.strategy.trim()) ||
    files.some(f => f.extracted_text?.trim()) ||
    pillars.length > 0

  if (!hasSignal) {
    return NextResponse.json(
      { error: "Your brand page doesn't have enough to analyze yet — add manual notes, upload a brand file, or approve some content pillars first." },
      { status: 400 }
    )
  }

  const parts: string[] = []
  if (profile?.company_name) parts.push(`Company: ${profile.company_name}`)
  if (profile?.preferred_channels?.length) parts.push(`Channels used: ${profile.preferred_channels.join(', ')}`)
  if (profile?.manual_notes?.trim()) parts.push(`Manual brand notes:\n${profile.manual_notes.trim()}`)
  if (profile?.strategy?.trim()) parts.push(`Brand strategy:\n${profile.strategy.trim().slice(0, 4000)}`)
  for (const f of files) {
    if (f.extracted_text?.trim()) {
      parts.push(`Brand file "${f.file_name}":\n${f.extracted_text.trim().slice(0, 4000)}`)
    }
  }
  if (pillars.length) {
    parts.push(`Content pillars:\n${pillars.map(p => `- ${p.name}: ${p.description ?? ''}`).join('\n')}`)
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      system: `You are helping a marketing team turn their brand profile into concrete QA rules — precise, checkable instructions that get run against every draft before it's approved. Ground every rule in something specific from the material given (a stated value, a stylistic pattern in their own files, a stated audience) — do not invent generic best-practice rules that could apply to any company. Only scope a rule to specific channels when the material clearly implies that platform; otherwise leave channels empty (applies everywhere). Call generate_qa_rules exactly once with 5-10 rules.`,
      tools: [GENERATE_RULES_TOOL],
      tool_choice: { type: 'tool', name: 'generate_qa_rules' },
      messages: [{ role: 'user', content: parts.join('\n\n') }],
    })

    const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUse) {
      return NextResponse.json({ error: 'Could not generate rules — try again' }, { status: 502 })
    }

    // A tool with a single top-level array property sometimes comes back
    // with that property double-encoded as a JSON string instead of a
    // native array — observed with claude-sonnet-5 on this exact schema
    // shape. Unwrap defensively rather than trusting the type.
    let rules = (toolUse.input as { rules: unknown }).rules
    if (typeof rules === 'string') {
      try {
        const parsed = JSON.parse(rules)
        rules = Array.isArray(parsed) ? parsed : parsed.rules
      } catch {
        rules = []
      }
    }

    return NextResponse.json({ rules })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Generation failed' }, { status: 500 })
  }
}
