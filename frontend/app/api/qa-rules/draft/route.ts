export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { CHANNELS } from '@/lib/channels'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHANNEL_IDS = CHANNELS.map(c => c.id)

const DRAFT_RULE_TOOL: Anthropic.Tool = {
  name: 'draft_qa_rule',
  description: 'Turn a rough, plain-language description into a precise, checkable QA rule.',
  input_schema: {
    type: 'object',
    properties: {
      label: { type: 'string', description: 'Short name for the rule, under 40 characters, e.g. "No corporate jargon".' },
      rule_text: {
        type: 'string',
        description: 'The precise instruction a QA reviewer LLM should check the draft against. Specific and actionable — describe what to look for and why it fails, not a vague restatement of the request.',
      },
      channels: {
        type: 'array',
        items: { type: 'string', enum: CHANNEL_IDS },
        description: `Which channels this rule applies to, using these ids: ${CHANNEL_IDS.join(', ')}. Return an EMPTY array if the rule should apply to every channel — only include specific channels if the description clearly implies a platform-specific scope (e.g. mentions hashtags, a platform by name, or a format unique to one channel).`,
      },
    },
    required: ['label', 'rule_text', 'channels'],
  },
}

export async function POST(req: NextRequest) {
  const { description } = (await req.json().catch(() => ({}))) as { description?: string }
  if (!description || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 500,
      system: 'You help a marketing team turn rough ideas into precise QA rules that get checked against every draft before it goes live. Call draft_qa_rule exactly once with your best interpretation.',
      tools: [DRAFT_RULE_TOOL],
      tool_choice: { type: 'tool', name: 'draft_qa_rule' },
      messages: [{ role: 'user', content: description.trim() }],
    })

    const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUse) {
      return NextResponse.json({ error: 'Could not draft a rule — try rephrasing' }, { status: 502 })
    }

    return NextResponse.json({ draft: toolUse.input })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Draft failed' }, { status: 500 })
  }
}
