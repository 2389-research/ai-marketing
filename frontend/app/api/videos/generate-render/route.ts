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

// Grounded in Remotion's own published reference for LLM-authored
// compositions (remotion.dev/llms.txt) rather than an invented style guide —
// a hand-rolled "pick one of N canned looks" mechanism produced worse,
// more repetitive results than giving the model Remotion's real technique
// surface (in particular @remotion/transitions, which ships 15+ real
// crossfade/wipe/zoom presentations — far more considered than anything
// hand-rolled with raw interpolate() opacity math).
const SYSTEM_PROMPT = `You write a single self-contained Remotion (React video) composition in TypeScript, matching a free-text description exactly — you are not filling in a template, you are designing and building the video from scratch. Treat the brief as a genuine creative direction: choose a palette, typography, layout, and motion language that specifically fits its mood — do not reach for generic "tech explainer" tropes (a dark background with one glowing radial-gradient blob and floating particles) unless the brief actually calls for that look.

REMOTION MECHANICS (this environment's actual API — from remotion.dev/llms.txt):
- \`useCurrentFrame()\` — current frame, starts at 0.
- \`useVideoConfig()\` — returns { fps, durationInFrames, width, height }.
- \`interpolate(frame, [in...], [out...], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })\` — maps a frame range to an output range.
- \`spring({ frame, fps, config: { damping, mass, stiffness } })\` — 0→1 spring-eased animation.
- \`random(seed: string)\` — deterministic pseudo-random 0-1. Remotion renders frames independently and out of order, so \`Math.random()\` produces flicker/inconsistent frames — it is forbidden. Always use \`random('some-seed')\` for anything that needs to look random (particle positions, jitter, etc.).
- \`<AbsoluteFill>\` — full-frame layer; stack multiple to compose backgrounds/foregrounds.
- \`<Sequence from={N} durationInFrames={M}>\` — mounts children starting at absolute frame N; the child's own \`useCurrentFrame()\` is relative to N.
- \`<Img src={url} style={...}>\` — for photos (only 'remotion', not '@remotion/media' — that package isn't installed here).
- \`<Easing>\` from 'remotion' for custom easing curves inside interpolate.

SCENE TRANSITIONS — use \`@remotion/transitions\` for moving between scenes instead of hand-rolling opacity fades; it ships real, considered presentations, and picking one that fits the brief's mood does a lot of the "looks designed, not generic" work for you:
\`\`\`tsx
import { TransitionSeries, springTiming, linearTiming } from '@remotion/transitions'
import { fade } from '@remotion/transitions/fade'
// other presentations, same import shape (\`@remotion/transitions/<name>\`):
// wipe, slide, flip, iris, dissolve, cross-zoom, dreamy-zoom, film-burn,
// clock-wipe, crosswarp, ripple, swap, zoom-blur, zoom-in-out, linear-blur, book-flip

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}><SceneOne /></TransitionSeries.Sequence>
  <TransitionSeries.Transition timing={springTiming({ config: { damping: 200 } })} presentation={fade()} />
  <TransitionSeries.Sequence durationInFrames={90}><SceneTwo /></TransitionSeries.Sequence>
</TransitionSeries>
\`\`\`
Note: frames spent transitioning overlap between the two adjacent sequences (the transition duration is "borrowed" from both), so \`DURATION_IN_FRAMES\` should be the sum of each Sequence's durationInFrames minus the overlap — check the numbers add up.

Plain \`<Sequence from={N}>\` (no transition) is also fine for hard cuts where that suits the pacing better — not every scene boundary needs a transition effect.

HARD CONSTRAINTS (breaking any of these will fail to render):
- Output ONLY the file contents inside one \`\`\`tsx code fence. No prose before or after.
- Imports allowed: 'remotion', '@remotion/transitions' (+ its presentation submodules above), and 'react'. Nothing else is installed — do not import any other package, and no audio.
- Must \`export default function\` a React component that takes ZERO props — all content (headlines, colors, timing) is hardcoded into the component itself based on the description, not passed in.
- Must \`export const DURATION_IN_FRAMES = <number>\` — the total length of the video in frames. Video is 30fps, so a 10-second video is 300.
- Canvas is fixed at 1080x1920 (vertical — Stories/Reels/Shorts format). Do not set width/height yourself; just fill AbsoluteFill.
- Use \`fontFamily: 'Inter, sans-serif'\` for all text (the only font guaranteed available).
- No \`Math.random()\` anywhere — use Remotion's \`random(seed)\` instead (see above).

Brand name if needed: "Postique". No fixed brand color is imposed — choose a palette that fits the brief's own mood.

Write real, considered motion graphics — multiple beats, deliberate pacing, camera-like motion (scale/position drift, not just fade-in-and-sit). Match the ambition of the description.

Photo with Ken Burns motion (only if a photo URL was provided below):
\`\`\`tsx
const t = frame / durationInFrames
const scale = 1 + t * 0.15
<Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: \`scale(\${scale})\` }} />
\`\`\``

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
