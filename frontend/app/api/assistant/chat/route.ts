export const runtime = 'nodejs'
export const maxDuration = 300 // watch_video downloads + transcribes real footage

import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { spawn } from 'child_process'
import path from 'path'
import { getActiveProject, stampRow } from '@/lib/project-server'
import { scoped } from '@/lib/project'
import { CHANNELS } from '@/lib/channels'
import { fetchPage } from '@/lib/fetch-page'

const db        = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ROOT   = process.env.BACKEND_PATH ?? path.resolve(process.cwd(), '..')
const PYTHON = process.env.BACKEND_PYTHON ?? 'python3'

const CHANNEL_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn', instagram: 'Instagram', email: 'Email',
  tiktok: 'TikTok', youtube: 'YouTube', x: 'X (Twitter)',
  instagram_stories: 'Instagram Stories', youtube_shorts: 'YouTube Shorts',
  pinterest: 'Pinterest', reddit: 'Reddit', threads: 'Threads',
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

const TOOLS: Anthropic.Tool[] = [
  {
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
  },
  {
    name: 'fetch_url',
    description: "Fetch a public web page (article, blog post, competitor site, docs) and get its title, description, and main text. Use whenever the user shares a link or asks about something on the web. NOT for video links — for YouTube/TikTok/video URLs use watch_video, which actually watches them. For X/Twitter, Instagram, LinkedIn, Facebook and Threads text posts (which block fetching), ask the user to paste the post's text instead.",
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Full http(s) URL to fetch' } },
      required: ['url'],
    },
  },
  {
    name: 'list_media',
    description: "List this brand's uploaded media: photos (with their AI descriptions) and videos from the libraries. Use this to find something before viewing or watching it, or to answer questions like 'what photos do we have of the office?'.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'view_photo',
    description: 'Actually look at a photo (from the media library or any public image URL). You will see the image itself and can describe it, judge whether it fits a post, compare options, or critique it.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Public image URL (use list_media to find library photo URLs)' } },
      required: ['url'],
    },
  },
  {
    name: 'watch_video',
    description: "Actually watch a video: you get evenly spaced frames from it plus the full speech transcript. Works on library videos, direct video URLs, AND platform links (YouTube, YouTube Shorts, TikTok, Vimeo, Instagram Reels). Slow (1-3 minutes) — tell the user you're watching it first. Use for 'what's in this video', 'break down this YouTube video', 'which part should we clip', or judging footage. If it returns captions-only (bot-blocked download), say so honestly and work from the transcript.",
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Video URL — a platform link (youtube.com/…, tiktok.com/…) or a direct file URL (use list_media for library videos)' } },
      required: ['url'],
    },
  },
]

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// One accumulating content block from the streaming response — either
// growing text or a tool call whose JSON arguments arrive in fragments.
type BuildingBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; jsonBuf: string }

// Spawn video_process.py <cmd> <args> and parse its JSON stdout.
function runPy(args: string[], timeoutMs = 240_000): Promise<any> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const proc = spawn(PYTHON, [path.join(ROOT, 'video_process.py'), ...args], { cwd: ROOT })
    const timer = setTimeout(() => { proc.kill(); reject(new Error('video processing timed out')) }, timeoutMs)
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', (code: number) => {
      clearTimeout(timer)
      if (code !== 0) { reject(new Error(stderr.slice(-800) || `exit ${code}`)); return }
      try { resolve(JSON.parse(stdout.trim())) } catch { reject(new Error('unparseable video tool output')) }
    })
    proc.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

const isHttpUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u)

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

You can also DO things, not just talk (use the tools):
- fetch_url: read any public web page the user mentions or shares. Don't guess what an article says — fetch it.
- list_media / view_photo / watch_video: the brand's photo and video libraries. When asked about media ("which photo fits this post?", "what's in that video?"), actually look — never describe media you haven't seen. watch_video is slow, so say you're watching it first.
- Chain tools when it helps (list_media to find the URL, then view_photo).

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

      // Execute one tool call; returns the tool_result content (string or
      // blocks — image blocks are how view_photo/watch_video let the model
      // actually SEE the media).
      const execTool = async (name: string, args: any): Promise<string | Anthropic.ContentBlockParam[]> => {
        if (name === 'schedule_post') {
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
          if (error) return `Failed to create the post: ${error.message}`
          send({ type: 'action', draft: { id: draft.id, topic: draft.topic, channel: draft.channel, scheduled_for: draft.scheduled_for } })
          return `Created draft ${draft.id}: "${draft.topic}" on ${draft.channel}, scheduled for ${draft.scheduled_for}. Status: pending review (not yet approved or posted).`
        }

        if (name === 'fetch_url') {
          if (!isHttpUrl(args.url)) return 'fetch_url needs a full http(s) URL.'
          send({ type: 'status', text: `Reading ${args.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}…` })
          const page = await fetchPage(args.url)
          return 'blocked' in page ? `Could not fetch: ${page.blocked}` : page.text.slice(0, 6000)
        }

        if (name === 'list_media') {
          const [{ data: photos }, { data: videos }] = await Promise.all([
            scoped(db.from('photo_library').select('filename, public_url, description, created_at'), pid)
              .order('created_at', { ascending: false }).limit(30),
            scoped(db.from('video_library').select('filename, public_url, created_at'), pid)
              .order('created_at', { ascending: false }).limit(30),
          ])
          const p = (photos ?? []).map((x: any) => `- PHOTO ${x.filename} | ${x.public_url} | ${(x.description ?? 'no description').slice(0, 160)}`)
          const v = (videos ?? []).map((x: any) => `- VIDEO ${x.filename} (${x.created_at?.slice(0, 10)}) | ${x.public_url}`)
          if (!p.length && !v.length) return 'The media libraries are empty — no photos or videos uploaded yet.'
          return [`PHOTOS (${p.length}):`, ...p, '', `VIDEOS (${v.length}):`, ...v].join('\n')
        }

        if (name === 'view_photo') {
          if (!isHttpUrl(args.url)) return 'view_photo needs a public http(s) image URL.'
          send({ type: 'status', text: 'Looking at the photo…' })
          return [
            { type: 'image', source: { type: 'url', url: args.url } },
            { type: 'text', text: 'This is the photo. Describe/judge what you actually see.' },
          ]
        }

        if (name === 'watch_video') {
          if (!isHttpUrl(args.url)) return 'watch_video needs a public http(s) video URL.'
          send({ type: 'status', text: 'Watching the video (frames + transcript) — this can take a couple of minutes…' })
          let watched: any
          try {
            watched = await runPy(['watch', args.url, '6'], 280_000)
          } catch (err: any) {
            return `Could not watch the video: ${err?.message ?? 'unknown error'}. If it's from a social platform, the platform may be blocking downloads — ask the user for a direct file or a different link.`
          }
          const blocks: Anthropic.ContentBlockParam[] = []
          for (const t of (watched.thumbnails ?? []).slice(0, 8)) {
            if (isHttpUrl(t.url)) blocks.push({ type: 'image', source: { type: 'url', url: t.url } })
          }
          const segs = watched.transcript_segments ?? []
          const parts = [
            `Duration: ${Math.round(watched.duration ?? 0)}s.`,
            (watched.thumbnails ?? []).length ? 'The images above are evenly spaced frames, in order.' : '',
            watched.note ?? '',
            segs.length
              ? `TRANSCRIPT (timestamped):\n${segs.map((s: any) => `[${Math.round(s.start)}s] ${s.text}`).join('\n').slice(0, 5000)}`
              : 'No speech detected (silent video) — judge it from the frames alone.',
          ].filter(Boolean)
          blocks.push({ type: 'text', text: parts.join('\n') })
          return blocks
        }

        return `Unknown tool: ${name}`
      }

      try {
        let convo: Anthropic.MessageParam[] = messages.map(m => ({ role: m.role, content: m.content }))

        // Agent loop: stream a response; if it calls tools, run them, append
        // the results, and let the model continue — up to 6 rounds.
        for (let round = 0; round < 6; round++) {
          const respStream = await anthropic.messages.create({
            model: 'claude-sonnet-5',
            max_tokens: 1500,
            system,
            messages: convo,
            tools: TOOLS,
            thinking: { type: 'disabled' }, // fast conversational assistant; keeps the loop to text/tool_use blocks
            stream: true,
          })

          const blocks: BuildingBlock[] = []
          let stopReason: string | null = null

          for await (const event of respStream) {
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

          if (stopReason !== 'tool_use') break

          // .filter(Boolean) — untracked block types (e.g. thinking) leave
          // holes in the sparse array; find/map would trip on them.
          const solid = blocks.filter(Boolean)
          const toolCalls = solid.filter(b => b.type === 'tool_use') as Extract<BuildingBlock, { type: 'tool_use' }>[]
          if (toolCalls.length === 0) break

          const assistantContent: Anthropic.ContentBlockParam[] = solid.map(b =>
            b.type === 'text'
              ? { type: 'text', text: b.text }
              : { type: 'tool_use', id: b.id, name: b.name, input: JSON.parse(b.jsonBuf || '{}') }
          )

          const resultBlocks: Anthropic.ToolResultBlockParam[] = []
          for (const call of toolCalls) {
            let content: string | Anthropic.ContentBlockParam[]
            try {
              content = await execTool(call.name, JSON.parse(call.jsonBuf || '{}'))
            } catch (err: any) {
              content = `Tool failed: ${err?.message ?? 'unknown error'}`
            }
            resultBlocks.push({
              type: 'tool_result',
              tool_use_id: call.id,
              content: typeof content === 'string' ? content : (content as any),
            })
          }

          convo = [
            ...convo,
            { role: 'assistant', content: assistantContent },
            { role: 'user', content: resultBlocks },
          ]
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
