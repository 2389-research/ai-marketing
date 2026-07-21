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

// A large, varied menu of visual directions — one is picked at random per
// generation and handed to the model as a concrete starting point. This
// exists because Sonnet 5 has no temperature/sampling control (Anthropic
// removed it), so near-identical prompts otherwise converge on the same
// "best" completion every time — there is no random-sampling diversity to
// lean on. A single go-to reference example in the prompt made this worse
// (it became the default), so there is no single privileged pattern here —
// only a rotating, concrete one, described in prose rather than code so it
// can't become a copy-paste template either.
const STYLE_DIRECTIONS = [
  'Flat bold color blocks — 2-3 saturated solid colors filling the frame in geometric sections, no gradients or glow, big confident sans-serif type stacked directly on the color.',
  'Handwritten/marker sketch — off-white paper texture, text that looks hand-drawn or marker-style, small imperfect underlines and circles as accents, playful and human.',
  'Film grain and vignette — muted desaturated tones, a subtle grain/noise overlay, soft vignette at the edges, cinematic and moody.',
  'Geometric shape collage — overlapping triangles/circles/lines in a tight palette, Bauhaus-influenced, type integrated into the shape composition rather than floating on top.',
  'Editorial print — cream or off-white background, serif typography, thin rule lines, generous whitespace, numbered like a magazine page.',
  'Terminal/monospace hacker aesthetic — near-black background, monospace font, green or amber text, blinking cursor, looks like a real terminal session.',
  'Layered cards with soft shadows — light neutral background, 1-3 white/light cards with soft drop shadows stacked or sliding in, clean SaaS-dashboard feel.',
  'Gradient mesh, dreamy — a soft multi-hue blended mesh background (3+ colors, not a single blob), airy pastel type.',
  'Black and white, typography only — pure black or white background, no color at all, huge bold type is the entire visual, motion comes from scale/position only.',
  'Isometric/3D illustration — simple isometric shapes (boxes, platforms) suggesting a 3D scene, flat-shaded, playful product-illustration feel.',
  'Neon outline on dark — pure black background, thin glowing outline strokes forming simple line-art shapes (not filled blurred blobs) — restrained, not overdone.',
  'Newspaper/collage cutout — textured paper background, overlapping torn-paper-style text blocks and rectangles at slight rotations, DIY zine energy.',
  'Screen/UI mockup — a stylized fake app or browser window frame center-canvas showing a mocked interaction; everything outside the mockup is one flat color.',
  'Retro VHS/glitch — scanlines, slight chromatic aberration, warm retro color grading (orange/teal or magenta/cyan), analog nostalgia.',
]

function SYSTEM_PROMPT(styleDirection: string) {
  return `You write a single self-contained Remotion (React video) composition in TypeScript, matching a free-text description exactly — you are not filling in a template, you are designing and building the video from scratch.

HARD CONSTRAINTS (breaking any of these will fail to render):
- Output ONLY the file contents inside one \`\`\`tsx code fence. No prose before or after.
- Imports allowed: from 'remotion' (AbsoluteFill, Sequence, Img, interpolate, spring, useCurrentFrame, useVideoConfig, Easing, random) and 'react'. No other packages exist in this environment — do not import anything else, and no audio.
- Must \`export default function\` a React component that takes ZERO props — all content (headlines, colors, timing) is hardcoded into the component itself based on the description, not passed in.
- Must \`export const DURATION_IN_FRAMES = <number>\` — the total length of the video in frames. Video is 30fps, so a 10-second video is 300.
- Canvas is fixed at 1080x1920 (vertical — Stories/Reels/Shorts format). Do not set width/height yourself; just fill AbsoluteFill.
- Use \`fontFamily: 'Inter, sans-serif'\` for all text (the only font guaranteed available).
- Multi-scene videos: use <Sequence from={N} durationInFrames={M}> for each scene, with scenes' \`from\` values summing sequentially (no gaps, no overlaps unless intentionally crossfading).
- Animate with spring() and interpolate() from 'remotion', driven by useCurrentFrame() — never CSS transitions/keyframes, they don't render.

VISUAL DIRECTION FOR THIS VIDEO:
${styleDirection}
If the brief below clearly implies its own concrete visual style (specific colors, mood, references), follow the brief instead — the brief always wins. Use the direction above only when the brief doesn't already specify a look.

NEVER default to "dark background + one glowing radial-gradient blob + floating dot particles + spring-in bold sans text" — that specific combination is banned unless the brief explicitly asks for a glowing dark-tech look. Every video must look and move differently from the last one: vary background treatment, color palette, layout, and pacing every time, not just the words on screen.

Brand name if needed: "Postique". No fixed brand color is imposed — choose a palette that fits the direction above and the brief.

Write real, considered motion graphics code — multiple beats, deliberate pacing, not a static slide with one fade-in. Match the ambition of the description.

TECHNIQUE REFERENCE (a mechanical animation helper, not a visual style — reuse only the math, design the actual look yourself):
\`\`\`tsx
const frame = useCurrentFrame()
const { fps } = useVideoConfig()
const enter = spring({ frame, fps, config: { damping: 14, mass: 0.5 } })
// use enter (0→1) to drive opacity, translateY, or scale
\`\`\`

Photo with Ken Burns motion (only if a photo URL was provided below):
\`\`\`tsx
const t = frame / durationInFrames
const scale = 1 + t * 0.15
<Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: \`scale(\${scale})\` }} />
\`\`\``
}

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
  styleDirection: string,
  priorAttempt?: { code: string; error: string },
  maxTokens = BASE_MAX_TOKENS,
): Promise<string> {
  const userMessage = priorAttempt
    ? `${description}\n\n${photoContext}\n\nYour previous attempt failed with this error:\n${priorAttempt.error}\n\nHere was that code:\n\`\`\`tsx\n${priorAttempt.code}\n\`\`\`\n\nFix the issue and output the complete corrected file.`
    : `${description}\n\n${photoContext}`

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT(styleDirection),
    messages: [{ role: 'user', content: userMessage }],
  })

  // Sonnet 5 defaults to adaptive thinking, which shares the max_tokens
  // budget — a longer reasoning pass on a complex brief can exhaust it
  // before the code block closes. Retry once with double the budget rather
  // than surfacing a truncated file.
  if (msg.stop_reason === 'max_tokens' && maxTokens < BASE_MAX_TOKENS * 4) {
    return generateCode(description, photoContext, styleDirection, priorAttempt, maxTokens * 2)
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
  // Picked once per request (not re-rolled on retry) so a fix-attempt stays
  // faithful to the same design instead of redesigning from scratch.
  const styleDirection = STYLE_DIRECTIONS[Math.floor(Math.random() * STYLE_DIRECTIONS.length)]

  let priorAttempt: { code: string; error: string } | undefined
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    let code: string
    try {
      code = await generateCode(description.trim(), photoContext, styleDirection, priorAttempt)
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
