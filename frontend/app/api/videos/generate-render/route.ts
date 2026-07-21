export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getActiveProject } from '@/lib/project-server'
import { scoped } from '@/lib/project'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RENDERER_URL = process.env.RENDERER_URL ?? 'http://localhost:3002'
const PHOTO_BUCKET = 'photo-library'
const MAX_PHOTOS_OFFERED = 12
const MAX_RENDER_ATTEMPTS = 2

const SYSTEM_PROMPT = `You write a single self-contained Remotion (React video) composition in TypeScript, matching a free-text description exactly — you are not filling in a template, you are designing and building the video from scratch.

HARD CONSTRAINTS (breaking any of these will fail to render):
- Output ONLY the file contents inside one \`\`\`tsx code fence. No prose before or after.
- Imports allowed: from 'remotion' (AbsoluteFill, Sequence, Img, interpolate, spring, useCurrentFrame, useVideoConfig, Easing, random) and 'react'. No other packages exist in this environment — do not import anything else, and no audio.
- Must \`export default function\` a React component that takes ZERO props — all content (headlines, colors, timing) is hardcoded into the component itself based on the description, not passed in.
- Must \`export const DURATION_IN_FRAMES = <number>\` — the total length of the video in frames. Video is 30fps, so a 10-second video is 300.
- Canvas is fixed at 1080x1920 (vertical — Stories/Reels/Shorts format). Do not set width/height yourself; just fill AbsoluteFill.
- Use \`fontFamily: 'Inter, sans-serif'\` for all text (the only font guaranteed available).
- Multi-scene videos: use <Sequence from={N} durationInFrames={M}> for each scene, with scenes' \`from\` values summing sequentially (no gaps, no overlaps unless intentionally crossfading).
- Animate with spring() and interpolate() from 'remotion', driven by useCurrentFrame() — never CSS transitions/keyframes, they don't render.

BRAND CONTEXT — apply unless the description clearly asks for something else:
- Brand: "Postique". Default accent color #1c69d4 (a clean blue). Dark backgrounds generally read better for this brand than light ones, but use your judgment for the brief.
- The description is the creative brief — vary composition, layout, pacing, and mood video to video. Do not default to the same background treatment every time.

REFERENCE PATTERNS — proven Remotion techniques you may reuse, adapt, or ignore entirely if the brief calls for something different:

Spring-driven entrance:
\`\`\`tsx
const frame = useCurrentFrame()
const { fps } = useVideoConfig()
const enter = spring({ frame, fps, config: { damping: 14, mass: 0.5 } })
// use enter (0→1) to drive opacity, translateY, or scale
\`\`\`

Animated ambient background (drifting glow blobs + soft particles) — a good default for tech/product brand videos, but design something else if the brief wants a different feel:
\`\`\`tsx
function Backdrop({ color }: { color: string }) {
  const frame = useCurrentFrame()
  const drift = frame * 0.6
  return (
    <AbsoluteFill style={{ backgroundColor: '#10151c' }}>
      <div style={{
        position: 'absolute', width: 1400, height: 1400, borderRadius: '50%',
        left: -500 + Math.sin(drift / 60) * 80, top: -600 + Math.cos(drift / 80) * 60,
        background: \`radial-gradient(circle, \${color}55 0%, transparent 65%)\`,
      }} />
    </AbsoluteFill>
  )
}
\`\`\`

Photo with Ken Burns motion (only if a photo URL was provided below):
\`\`\`tsx
const t = frame / durationInFrames
const scale = 1 + t * 0.15
<Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: \`scale(\${scale})\` }} />
\`\`\`

Write real, considered motion graphics code — multiple beats, deliberate pacing, not a static slide with one fade-in. Match the ambition of the description.`

type PhotoRow = { id: string; storage_path: string; description: string | null; filename: string }

async function fetchPhotoContext(projectId: string | null): Promise<string> {
  const { data } = await scoped(
    supabase.from('photo_library').select('id, storage_path, description, filename'), projectId,
  ).order('created_at', { ascending: false }).limit(MAX_PHOTOS_OFFERED)

  const photos = (data ?? []) as PhotoRow[]
  if (photos.length === 0) return 'No photos available — do not use <Img>, build entirely with shapes/gradients/typography.'

  const resolved = await Promise.all(photos.map(async (p) => {
    const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(p.storage_path, 3600)
    return signed ? `- ${signed.signedUrl}${p.description ? ` — ${p.description}` : ''}` : null
  }))

  const lines = resolved.filter((l): l is string => !!l)
  if (lines.length === 0) return 'No photos available — do not use <Img>, build entirely with shapes/gradients/typography.'
  return `Available photos (use the exact URL via <Img src="...">  if relevant to the brief — never invent a URL):\n${lines.join('\n')}`
}

function extractCode(text: string): string | null {
  const match = text.match(/```(?:tsx|ts|jsx|js)?\s*\n([\s\S]*?)```/)
  return match ? match[1].trim() : null
}

const BASE_MAX_TOKENS = 8000

async function generateCode(
  description: string,
  photoContext: string,
  priorAttempt?: { code: string; error: string },
  maxTokens = BASE_MAX_TOKENS,
): Promise<string> {
  const userMessage = priorAttempt
    ? `${description}\n\n${photoContext}\n\nYour previous attempt failed with this error:\n${priorAttempt.error}\n\nHere was that code:\n\`\`\`tsx\n${priorAttempt.code}\n\`\`\`\n\nFix the issue and output the complete corrected file.`
    : `${description}\n\n${photoContext}`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  // Sonnet 5 defaults to adaptive thinking, which shares the max_tokens
  // budget — a longer reasoning pass on a complex brief can exhaust it
  // before the code block closes. Retry once with double the budget rather
  // than surfacing a truncated file.
  if (msg.stop_reason === 'max_tokens' && maxTokens < BASE_MAX_TOKENS * 4) {
    return generateCode(description, photoContext, priorAttempt, maxTokens * 2)
  }

  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
  const code = extractCode(text)
  if (!code) throw new Error('Model did not return a complete code block')
  return code
}

async function renderCode(code: string, projectId: string | null) {
  const res = await fetch(`${RENDERER_URL}/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.AUTH_TOKEN ? { 'x-render-token': process.env.AUTH_TOKEN } : {}),
    },
    body: JSON.stringify({ code, projectId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || 'Render failed') as Error & { stage?: string }
    err.stage = data.stage
    throw err
  }
  return data
}

export async function POST(req: NextRequest) {
  const { description } = (await req.json().catch(() => ({}))) as { description?: string }
  if (!description || !description.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const projectId = await getActiveProject()
  const photoContext = await fetchPhotoContext(projectId)

  let priorAttempt: { code: string; error: string } | undefined
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    let code: string
    try {
      code = await generateCode(description.trim(), photoContext, priorAttempt)
    } catch (err: any) {
      // Rare — generateCode already retries internally on truncation. Just
      // try once more from scratch rather than engineering feedback for a
      // formatting miss we have no code sample to show.
      lastError = err?.message ?? 'Code generation failed'
      if (attempt === MAX_RENDER_ATTEMPTS) break
      continue
    }

    try {
      const video = await renderCode(code, projectId)
      return NextResponse.json({ video, attempts: attempt })
    } catch (err: any) {
      lastError = err?.message ?? 'Render failed'
      priorAttempt = { code, error: `[${err?.stage ?? 'render'}] ${lastError}` }
    }
  }

  return NextResponse.json(
    { error: `Render failed after ${MAX_RENDER_ATTEMPTS} attempts: ${lastError}` },
    { status: 502 }
  )
}
