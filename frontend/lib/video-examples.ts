// A growing library of REAL, diverse, self-contained Remotion compositions used
// as few-shot inspiration for the video generator. This is the fix for
// "every generated video looks like the same text animation": an unconstrained
// text model, given only a mood and no reference, collapses to its single
// safest output (a headline animating on a gradient). Showing it a few WILDLY
// different real compositions per generation expands its range and breaks the
// loop. These are inspiration, not templates — the model is told to match their
// ambition and diversity, remix freely, or ignore them and go further.
//
// Each example obeys the same hard constraints the generator must obey:
//  - default-export a ZERO-prop component, export const DURATION_IN_FRAMES
//  - canvas 1080x1920, fontFamily 'Inter, sans-serif'
//  - imports only from 'remotion' / '@remotion/transitions' / 'react'
//  - random(seed), never Math.random
// They are prompt text (strings), not compiled by our build — but they are kept
// correct so the model learns correct patterns. Add more freely; the sampler
// picks a varied handful each run.

export type VideoExample = {
  /** Short human label for the aesthetic — also shown to the model as a hint of the RANGE. */
  style: string
  /** Whether this example leans on a user asset, so the sampler can bias toward/away when assets exist. */
  uses: 'none' | 'photo' | 'footage'
  code: string
}

export const VIDEO_EXAMPLES: VideoExample[] = [
  {
    style: 'Bold kinetic typography — high energy, word swaps, color-block punches',
    uses: 'none',
    code: `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, random } from 'remotion'

const WORDS = ['SHIP', 'FASTER', 'STRESS', 'FREE']
const COLORS = ['#0A0A0A', '#FF3D00', '#0A0A0A', '#1552F0']

export const DURATION_IN_FRAMES = 150

export default function KineticType() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const per = 34
  const i = Math.min(WORDS.length - 1, Math.floor(frame / per))
  const local = frame - i * per
  const s = spring({ frame: local, fps, config: { damping: 12, mass: 0.6, stiffness: 200 } })
  const scale = interpolate(s, [0, 1], [0.4, 1])
  const rot = interpolate(s, [0, 1], [random(WORDS[i]) * 16 - 8, 0])
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS[i], justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        fontFamily: 'Inter, sans-serif', fontWeight: 900, fontSize: 260, color: 'white',
        letterSpacing: -6, transform: \`scale(\${scale}) rotate(\${rot}deg)\`, lineHeight: 0.9,
      }}>{WORDS[i]}</div>
    </AbsoluteFill>
  )
}`,
  },
  {
    style: 'Editorial minimal — slow, elegant, huge negative space, thin type, one hairline accent',
    uses: 'none',
    code: `import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion'

export const DURATION_IN_FRAMES = 210

export default function Editorial() {
  const frame = useCurrentFrame()
  const rise = interpolate(frame, [10, 45], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) })
  const fade = interpolate(frame, [10, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const line = interpolate(frame, [50, 110], [0, 520], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) })
  const sub = interpolate(frame, [70, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ backgroundColor: '#F4F1EA', padding: 120, justifyContent: 'center' }}>
      <div style={{ opacity: fade, transform: \`translateY(\${rise}px)\`, fontFamily: 'Inter, sans-serif', fontWeight: 300, fontSize: 96, color: '#141414', lineHeight: 1.05, letterSpacing: -2 }}>
        The quiet<br />advantage.
      </div>
      <div style={{ height: 2, width: line, backgroundColor: '#B08D57', marginTop: 48 }} />
      <div style={{ opacity: sub, fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: 34, color: '#6b6b6b', marginTop: 40, letterSpacing: 1 }}>
        Fewer tools. More done.
      </div>
    </AbsoluteFill>
  )
}`,
  },
  {
    style: 'Data / stat motion — animated counter, growing bar, punchy label (great for metrics posts)',
    uses: 'none',
    code: `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

export const DURATION_IN_FRAMES = 150

export default function StatReveal() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - 15, fps, config: { damping: 20, stiffness: 90 } })
  const value = Math.round(interpolate(s, [0, 1], [0, 87]))
  const bar = interpolate(s, [0, 1], [0, 760])
  const labelIn = interpolate(frame, [70, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ backgroundColor: '#0E1116', justifyContent: 'center', alignItems: 'center', gap: 40 }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 400, color: '#3BE8B0', lineHeight: 1 }}>
        {value}<span style={{ fontSize: 180 }}>%</span>
      </div>
      <div style={{ width: 760, height: 14, backgroundColor: '#1E2530', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ width: bar, height: '100%', backgroundColor: '#3BE8B0', borderRadius: 8 }} />
      </div>
      <div style={{ opacity: labelIn, fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 44, color: 'white', textAlign: 'center', maxWidth: 780 }}>
        faster inbox triage in week one
      </div>
    </AbsoluteFill>
  )
}`,
  },
  {
    style: 'Photo montage — Ken Burns drift across real photos with a fading caption band',
    uses: 'photo',
    code: `import { AbsoluteFill, Img, Sequence, useCurrentFrame, useVideoConfig, interpolate } from 'remotion'

// The photo URLs come from the assets listed in your context — never invent one.
const PHOTOS = ['PHOTO_URL_1', 'PHOTO_URL_2']
const CAPTIONS = ['Built in the open', 'Shipped to real users']

export const DURATION_IN_FRAMES = 180

function Slide({ url, caption }: { url: string; caption: string }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  const t = frame / durationInFrames
  const scale = 1 + t * 0.18
  const drift = interpolate(t, [0, 1], [-30, 30])
  const capIn = interpolate(frame, [12, 34], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill>
      <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: \`scale(\${scale}) translateX(\${drift}px)\` }} />
      <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent 45%)' }} />
      <div style={{ position: 'absolute', bottom: 160, left: 80, right: 80, opacity: capIn, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 72, color: 'white', lineHeight: 1.05 }}>{caption}</div>
    </AbsoluteFill>
  )
}

export default function PhotoMontage() {
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {PHOTOS.map((url, i) => (
        <Sequence key={i} from={i * 90} durationInFrames={90}>
          <Slide url={url} caption={CAPTIONS[i]} />
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}`,
  },
  {
    style: 'Footage highlight — OffthreadVideo base with animated lower-third, progress bar, punch-in zoom',
    uses: 'footage',
    code: `import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion'

// The source URL comes from the uploaded video listed in your context.
const SRC = 'SOURCE_VIDEO_URL'

export const DURATION_IN_FRAMES = 300

export default function FootageHighlight() {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()
  const zoom = interpolate(frame, [0, durationInFrames], [1.06, 1.14])
  const s = spring({ frame: frame - 20, fps, config: { damping: 18 } })
  const slide = interpolate(s, [0, 1], [-420, 0])
  const progress = interpolate(frame, [0, durationInFrames], [0, 1080])
  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <OffthreadVideo src={SRC} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: \`scale(\${zoom})\` }} />
      <div style={{ position: 'absolute', left: 0, bottom: 220, transform: \`translateX(\${slide}px)\`, backgroundColor: '#FF3D00', padding: '20px 44px' }}>
        <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: 56, color: 'white' }}>one command. done.</span>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: progress, height: 10, backgroundColor: '#FF3D00' }} />
    </AbsoluteFill>
  )
}`,
  },
  {
    style: 'Abstract motion design — orbiting shapes, drifting grid, gradient shift, little or no headline',
    uses: 'none',
    code: `import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, random } from 'remotion'

export const DURATION_IN_FRAMES = 180

export default function AbstractMotion() {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const hue = interpolate(frame, [0, DURATION_IN_FRAMES], [220, 285])
  const dots = new Array(7).fill(0)
  return (
    <AbsoluteFill style={{ background: \`radial-gradient(circle at 50% 40%, hsl(\${hue}, 60%, 22%), #05060A 70%)\` }}>
      {dots.map((_, i) => {
        const seed = 'orb' + i
        const r = 220 + random(seed) * 300
        const speed = 0.4 + random(seed + 's') * 0.8
        const a = frame * 0.02 * speed + random(seed + 'a') * Math.PI * 2
        const x = width / 2 + Math.cos(a) * r
        const y = height / 2 + Math.sin(a) * r * 1.4
        const size = 40 + random(seed + 'z') * 120
        return (
          <div key={i} style={{
            position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size,
            borderRadius: '50%', border: '2px solid hsla(' + hue + ',80%,70%,0.5)',
            backgroundColor: i % 2 ? 'hsla(' + hue + ',80%,65%,0.10)' : 'transparent',
          }} />
        )
      })}
      <AbsoluteFill style={{ justifyContent: 'flex-end', padding: 100 }}>
        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 40, color: 'rgba(255,255,255,0.85)', letterSpacing: 2 }}>
          POSTIQUE
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}`,
  },
]

// Sample a varied handful. Server-side only, so Math.random is fine here (the
// "no Math.random" rule is about the RENDERED Remotion code, not this picker).
// Bias: if the post has real assets, make it likely at least one asset-using
// example is shown so the model sees how to build over footage/photos; but keep
// a from-scratch example in the mix too so using assets always stays optional.
export function sampleExamples(opts: { hasPhotos: boolean; hasVideos: boolean; n?: number }): VideoExample[] {
  const n = opts.n ?? 3
  const pool = [...VIDEO_EXAMPLES]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked: VideoExample[] = []
  // Ensure an asset-based example appears when the matching asset exists.
  if (opts.hasVideos) {
    const f = pool.find(e => e.uses === 'footage')
    if (f) picked.push(f)
  }
  if (opts.hasPhotos && picked.length < n) {
    const p = pool.find(e => e.uses === 'photo' && !picked.includes(e))
    if (p) picked.push(p)
  }
  for (const e of pool) {
    if (picked.length >= n) break
    if (!picked.includes(e)) picked.push(e)
  }
  // Shuffle final order so the asset example isn't always first.
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[picked[i], picked[j]] = [picked[j], picked[i]]
  }
  return picked.slice(0, n)
}

export function renderExamplesBlock(examples: VideoExample[]): string {
  const blocks = examples.map((e, i) => `EXAMPLE ${i + 1} — ${e.style}:\n\`\`\`tsx\n${e.code}\n\`\`\``).join('\n\n')
  return `REFERENCE COMPOSITIONS (these show the RANGE of what's possible — completely different aesthetics, structures, and motion languages. Match this level of ambition and this much variety. Do NOT copy any of them; treat them as proof that "a video" here is not always animated text. Pick whatever direction genuinely fits the brief, including something none of these show):\n\n${blocks}`
}
