export const runtime = 'nodejs'

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject, stampRow } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { CHANNELS } from '@/lib/channels'

const db        = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CHANNEL_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn', instagram: 'Instagram', email: 'Email',
  tiktok: 'TikTok', youtube: 'YouTube', x: 'X (Twitter)',
}

// Real per-platform limits the assistant should respect when drafting text,
// not just describe in the abstract.
const PLATFORM_LIMITS = `
Real platform constraints to respect when drafting actual copy:
- Instagram bio: 150 characters max
- X (Twitter) bio: 160 characters max
- LinkedIn headline: 220 characters max
- LinkedIn "About" section: 2,600 characters max
- TikTok bio: 80 characters max
- YouTube channel description: 1,000 characters max (first ~150 shown before "more")`.trim()

// Same anti-AI-writing rules the main content pipeline enforces
// (agents/content_agent.py's _get_brand_system_prompt) — kept in sync so
// copy sounds the same whether it comes from here or the normal generation
// pipeline. The em-dash rule is tightened to zero (the pipeline allows one)
// per explicit feedback that even one reads as too many.
const WRITING_STYLE = `
Writing style — sound like a real person on the team, not a marketing bot or an AI:
- Never use em dashes (—). Use a period, comma, or "and"/"but" instead. This is the single most important rule — check your draft before calling schedule_post and rewrite any sentence that has one.
- Never use: game-changer, cutting-edge, revolutionary, we're excited to announce, leverage, synergy, unlock potential, delve, crucial, enhance, showcase, testament, underscore, boasts, stands as, serves as.
- Avoid puffed-up openers like "In today's world" or "It's important to note," and vague-authority phrases like "experts say."
- Avoid the rule-of-three habit (forcing everything into neat lists of exactly three). Vary sentence length and structure like a person actually talking, not a template.
- Have an opinion. Be specific over vague. Plain words beat impressive-sounding ones.`.trim()

const SCHEDULE_POST_TOOL: Anthropic.Tool = {
  name: 'schedule_post',
  description: 'Create and schedule a new post on the content calendar. The post is created as pending review — a human still approves it before anything is actually published.',
  input_schema: {
    type: 'object',
    properties: {
      topic:         { type: 'string', description: 'Short title/topic for the post' },
      channel:       { type: 'string', enum: CHANNELS.map(c => c.id), description: 'Which channel to post to' },
      draft_text:    { type: 'string', description: 'The full post copy, ready to publish' },
      scheduled_for: { type: 'string', description: 'ISO 8601 datetime with no timezone suffix, e.g. 2026-07-14T17:00:00 — resolve relative times ("today", "in a few hours") against the current date/time given in the system prompt' },
    },
    required: ['topic', 'channel', 'draft_text', 'scheduled_for'],
  },
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// One accumulating content block from the streaming response — either
// growing text or a tool call whose JSON arguments arrive in fragments.
type BuildingBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; jsonBuf: string }

export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), { status: 400 })
  }

  const pid = await getActiveProject()
  const { data: profile } = await scoped(
    db.from('brand_profile').select('company_name, website_url, manual_notes, strategy, preferred_channels'),
    pid,
  ).limit(1).maybeSingle()

  const activeChannels: string[] = profile?.preferred_channels?.length
    ? profile.preferred_channels
    : ['linkedin', 'instagram', 'email', 'tiktok', 'youtube', 'x']
  const activeChannelNames = activeChannels.map((c: string) => CHANNEL_NAMES[c] ?? c).join(', ')

  const brandContext = profile
    ? [
        `Company: ${profile.company_name ?? 'Unknown'}`,
        profile.website_url && `Website: ${profile.website_url}`,
        `Active channels: ${activeChannelNames}`,
        profile.manual_notes && `\nNotes:\n${profile.manual_notes}`,
        profile.strategy && `\nMarketing strategy:\n${profile.strategy}`,
      ].filter(Boolean).join('\n')
    : 'No brand profile has been set up yet for this project — give general best-practice advice and suggest the user fill out the Brand page for grounded, specific recommendations.'

  const system = `You are a marketing assistant embedded in this brand's own content tool. You help with concrete, specific requests — writing or rewriting bios, captions, headlines, and other on-brand copy, answering questions about this brand's marketing, and creating scheduled posts when asked.

Current date/time: ${new Date().toISOString().slice(0, 19)} — resolve relative times ("today", "in a few hours", "this evening") against this.

Everything you know about this brand:
${brandContext}

${PLATFORM_LIMITS}

${WRITING_STYLE}

Rules:
- Be specific and actionable. If asked for a bio or caption, write the actual text, not a description of what it should contain.
- Ground every recommendation in the real brand info above — never invent facts about the company.
- If a request needs info you don't have, say what's missing and give your best attempt anyway.
- Keep answers tight — no filler, no restating the question.

When the user asks you to create, schedule, or post something (e.g. "make a post about X", "I have an event today, post about it"):
- Before writing real copy, check whether the request has enough concrete substance to produce something specific and non-generic — a name, a real detail, a number, an actual hook; something that couldn't apply to any other company's post. If it's vague ("we have a new person," "we did something cool," "post about our event"), ask 1-3 short, specific follow-up questions instead of inventing details — e.g. for a new-hire post: their name, their role, one thing worth highlighting about them. Do NOT call schedule_post until you have real specifics to work with, either from the original message or the user's answers.
- Once you have enough real detail, call schedule_post directly — don't ask for a separate confirmation on the scheduling mechanics themselves, the post lands as pending review either way, so a human always reviews it before it can go out.
- If the user doesn't give a channel and there's no obvious single choice among the active channels, ask which one.
- If the user doesn't give a time, pick a sensible time later today rather than asking — treat this as "just handle it," not a form to fill out.
- After scheduling, tell the user plainly that it's pending review and where to find it (Drafts page or the calendar) — never imply it has already been posted.`

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        const anthropicMessages: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))

        const firstStream = await anthropic.messages.create({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          system,
          messages: anthropicMessages,
          tools: [SCHEDULE_POST_TOOL],
          thinking: { type: 'disabled' }, // Sonnet 5 defaults to adaptive thinking when omitted — not needed for a fast conversational assistant, and keeps the streaming loop to text/tool_use blocks only
          stream: true,
        })

        const blocks: BuildingBlock[] = []
        let stopReason: string | null = null

        for await (const event of firstStream) {
          if (event.type === 'content_block_start') {
            const cb = event.content_block
            if (cb.type === 'text') blocks[event.index] = { type: 'text', text: '' }
            else if (cb.type === 'tool_use') blocks[event.index] = { type: 'tool_use', id: cb.id, name: cb.name, jsonBuf: '' }
          } else if (event.type === 'content_block_delta') {
            const b = blocks[event.index]
            if (event.delta.type === 'text_delta' && b?.type === 'text') {
              b.text += event.delta.text
              send({ type: 'token', text: event.delta.text })
            } else if (event.delta.type === 'input_json_delta' && b?.type === 'tool_use') {
              b.jsonBuf += event.delta.partial_json
            }
          } else if (event.type === 'message_delta') {
            if (event.delta.stop_reason) stopReason = event.delta.stop_reason
          }
        }

        if (stopReason === 'tool_use') {
          // .filter(Boolean) first — content_block_start emits block types this
          // loop doesn't track (e.g. Sonnet 5's default adaptive `thinking`
          // blocks, since `thinking` is omitted below), which leaves holes in
          // the sparse `blocks` array. Array.prototype.find (unlike map/forEach)
          // visits holes as `undefined` instead of skipping them, so calling
          // .find directly here throws on any response that included one.
          const toolBlock = blocks.filter(Boolean).find(b => b.type === 'tool_use') as Extract<BuildingBlock, { type: 'tool_use' }> | undefined

          if (toolBlock && toolBlock.name === 'schedule_post') {
            let toolResultContent: string
            let actionPayload: object | null = null

            try {
              const args = JSON.parse(toolBlock.jsonBuf || '{}')
              const { data: draft, error } = await db
                .from('generated_drafts')
                .insert(stampRow({
                  topic: args.topic,
                  channel: args.channel,
                  draft_text: args.draft_text,
                  qa_passed: null,
                  status: 'pending',
                  scheduled_for: args.scheduled_for,
                  notes: 'Created via Assistant chat',
                }, pid))
                .select()
                .single()

              if (error) throw new Error(error.message)

              actionPayload = {
                id: draft.id,
                topic: draft.topic,
                channel: draft.channel,
                scheduled_for: draft.scheduled_for,
              }
              send({ type: 'action', draft: actionPayload })
              toolResultContent = `Created draft ${draft.id}: "${draft.topic}" on ${draft.channel}, scheduled for ${draft.scheduled_for}. Status: pending review (not yet approved or posted).`
            } catch (err: any) {
              toolResultContent = `Failed to create the post: ${err?.message ?? 'unknown error'}`
            }

            // Assistant content blocks as sent back to the API, replaying exactly what the model produced.
            // .filter(Boolean) drops holes from any untracked block type (see comment above) — .map alone
            // would preserve them as holes, which serialize to `null` and the API would reject.
            const assistantContent: Anthropic.ContentBlockParam[] = blocks.filter(Boolean).map(b =>
              b.type === 'text'
                ? { type: 'text', text: b.text }
                : { type: 'tool_use', id: b.id, name: b.name, input: JSON.parse(b.jsonBuf || '{}') }
            )

            const followUpStream = await anthropic.messages.create({
              model: 'claude-sonnet-5',
              max_tokens: 512,
              system,
              messages: [
                ...anthropicMessages,
                { role: 'assistant', content: assistantContent },
                {
                  role: 'user',
                  content: [{ type: 'tool_result', tool_use_id: toolBlock.id, content: toolResultContent }],
                },
              ],
              thinking: { type: 'disabled' },
              stream: true,
            })

            for await (const event of followUpStream) {
              if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                send({ type: 'token', text: event.delta.text })
              }
            }
          }
        }

        send({ type: 'done' })
      } catch (err: any) {
        console.error('[assistant/chat] error:', err)
        send({ type: 'error', message: err?.message ?? 'Assistant request failed' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
