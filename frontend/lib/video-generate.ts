// Server-only. Shared Remotion-video generation pipeline used by both the
// free-prompt route (/api/videos/generate-render) and the from-a-draft route
// (/api/videos/generate-from-draft): turn a free-text description into an
// LLM-authored Remotion composition, render it on the render-server, retry on
// failure with the error fed back, and return the uploaded video row.

import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
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
const BASE_MAX_TOKENS = 8000

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

// Build a composition that composites motion graphics OVER an existing
// uploaded video (the "edit my video" mode) rather than building from
// scratch. OffthreadVideo (built into remotion core) is the base layer.
export function buildEditSystemPrompt(sourceUrl: string, meta: { width: number; height: number; duration: number }): string {
  const aspect = meta.width >= meta.height ? 'landscape/wide' : 'vertical/portrait'
  return `You EDIT an existing video by compositing motion graphics, text, and effects on top of it — you are not building a video from scratch, you are enhancing real footage the user uploaded.

THE SOURCE VIDEO (use it as the base layer of every scene it appears in):
- URL (use this EXACT string, never invent or alter it): ${sourceUrl}
- Native size: ${meta.width}x${meta.height} (${aspect}). Duration: ${meta.duration.toFixed(1)}s.
- Embed it with <OffthreadVideo> imported from 'remotion':
  \`<OffthreadVideo src="${sourceUrl}" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />\`
- Audio: the source audio plays by default — keep it unless the brief asks to mute (then add the \`muted\` prop).
- Trim: to use only part of the footage, add \`trimBefore={framesToSkip}\` / \`trimAfter={frameToEndAt}\` (both in frames at 30fps).

FITTING THE FRAME (canvas is fixed 1080x1920 vertical):
- If the source is roughly vertical, \`objectFit: 'cover'\` (crop to fill) usually looks best.
- If the source is landscape/wide, don't just letterbox onto black — put a scaled-up, blurred copy of the same video behind it as an ambient fill, or place it in a framed band with a designed background. Choose what fits the brief. You decide per this specific video.

DURATION:
- Set DURATION_IN_FRAMES to the length you actually use. This is short-form (Stories/Reels/Shorts) — if the source is longer than ~40s, trim to a focused ~15-30s clip unless the brief clearly wants the whole thing.
- If you add an intro or outro card before/after the footage, account for those frames too, and use <Sequence>/<TransitionSeries> so the footage and cards don't overlap incorrectly.

WHAT TO ADD (per the user's description): animated titles/captions/lower-thirds, hooks, callouts, highlight boxes, progress bars, shape accents, color tints/vignettes/grain, zoom/pan on the footage, intro/outro bumpers, transitions between the footage and generated cards. Make it feel intentionally designed, matched to the brief's mood.

REMOTION MECHANICS: useCurrentFrame(), useVideoConfig() ({fps,durationInFrames,width,height}), interpolate(frame,[in],[out],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}), spring({frame,fps,config:{damping,mass,stiffness}}), random('seed') (NEVER Math.random — it flickers), <AbsoluteFill>, <Sequence from durationInFrames>, <OffthreadVideo>, <Easing>. Scene transitions via @remotion/transitions (fade, wipe, slide, dissolve, cross-zoom, film-burn, clock-wipe, etc.): import { TransitionSeries, springTiming } from '@remotion/transitions'; import { fade } from '@remotion/transitions/fade'.

HARD CONSTRAINTS (breaking any fails the render):
- Output ONLY the file contents inside one \`\`\`tsx code fence. No prose.
- Imports allowed: 'remotion', '@remotion/transitions' (+ presentation submodules), 'react'. Nothing else.
- \`export default function\` a ZERO-prop React component (all content hardcoded).
- \`export const DURATION_IN_FRAMES = <number>\`. 30fps.
- Fill AbsoluteFill; do not set width/height on the composition. Use \`fontFamily: 'Inter, sans-serif'\` for text.
- No \`Math.random()\` — use \`random(seed)\`.`
}

async function generateCode(
  system: string,
  description: string,
  context: string,
  priorAttempt?: { code: string; error: string },
  maxTokens = BASE_MAX_TOKENS,
): Promise<string> {
  const base = context ? `${description}\n\n${context}` : description
  const userMessage = priorAttempt
    ? `${base}\n\nYour previous attempt failed with this error:\n${priorAttempt.error}\n\nHere was that code:\n\`\`\`tsx\n${priorAttempt.code}\n\`\`\`\n\nFix the issue and output the complete corrected file.`
    : base

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userMessage }],
  })

  // Sonnet 5 defaults to adaptive thinking, which shares the max_tokens
  // budget — a longer reasoning pass on a complex brief can exhaust it
  // before the code block closes. Retry once with double the budget rather
  // than surfacing a truncated file.
  if (msg.stop_reason === 'max_tokens' && maxTokens < BASE_MAX_TOKENS * 4) {
    return generateCode(system, description, context, priorAttempt, maxTokens * 2)
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

export type GeneratedVideo = {
  id: string
  filename: string
  storage_path: string
  public_url: string
  project_id: string | null
}

export type GenerateResult =
  | { ok: true; video: GeneratedVideo; attempts: number }
  | { ok: false; error: string }

// Shared generate→render→retry loop. Both modes (from-scratch and
// edit-existing-video) differ only in their system prompt and context.
async function runPipeline(
  system: string,
  description: string,
  context: string,
  projectId: string | null,
): Promise<GenerateResult> {
  let priorAttempt: { code: string; error: string } | undefined
  let lastError = ''

  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    let code: string
    try {
      code = await generateCode(system, description.trim(), context, priorAttempt)
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
      return { ok: true, video, attempts: attempt }
    } catch (err: any) {
      lastError = err?.message ?? 'Render failed'
      priorAttempt = { code, error: `[${err?.stage ?? 'render'}] ${lastError}` }
    }
  }

  return { ok: false, error: `Render failed after ${MAX_RENDER_ATTEMPTS} attempts: ${lastError}` }
}

/** From-scratch: description → Remotion motion-graphics video. */
export async function generateAndRenderVideo(
  description: string,
  projectId: string | null,
): Promise<GenerateResult> {
  const photoContext = await fetchPhotoContext(projectId)
  return runPipeline(SYSTEM_PROMPT, description, photoContext, projectId)
}

/** Edit-existing: composite motion graphics over an uploaded source video. */
export async function editAndRenderVideo(
  description: string,
  sourceUrl: string,
  sourceMeta: { width: number; height: number; duration: number },
  projectId: string | null,
): Promise<GenerateResult> {
  const system = buildEditSystemPrompt(sourceUrl, sourceMeta)
  return runPipeline(system, description, '', projectId)
}
