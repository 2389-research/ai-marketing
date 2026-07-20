import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion'

export const FONT = 'Inter, sans-serif'
export const FADE = 15

// Every scene primitive gets these — layout code should never need to know
// which composition it's mounted in.
export type SceneProps = {
  brandColor: string
}

// Wraps a scene so it fades in/out inside its own Sequence duration, keeping
// individual scene components free of transition logic.
export function FadeScene({ duration, children }: { duration: number; children: React.ReactNode }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(
    frame,
    [0, FADE, Math.max(FADE + 1, duration - FADE), duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
}

// Slow-drifting brand-tinted glows + a faint deterministic particle field —
// the backdrop every scene in a dynamic video shares so scene changes don't
// read as jump cuts between unrelated designs.
export function Backdrop({ brandColor }: { brandColor: string }) {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()

  const drift = frame * 0.6
  const particles = Array.from({ length: 28 }, (_, i) => {
    const x = random(`px-${i}`) * width
    const baseY = random(`py-${i}`) * height
    const size = 2 + random(`ps-${i}`) * 4
    const speed = 0.2 + random(`pv-${i}`) * 0.5
    const y = ((baseY - frame * speed) % (height + 40) + height + 40) % (height + 40) - 20
    const twinkle = 0.15 + 0.35 * Math.abs(Math.sin((frame + i * 37) / 40))
    return { x, y, size, twinkle, key: i }
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#10151c' }}>
      <div
        style={{
          position: 'absolute',
          width: 1400,
          height: 1400,
          borderRadius: '50%',
          left: -500 + Math.sin(drift / 60) * 80,
          top: -600 + Math.cos(drift / 80) * 60,
          background: `radial-gradient(circle, ${brandColor}55 0%, transparent 65%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1200,
          height: 1200,
          borderRadius: '50%',
          right: -450 - Math.sin(drift / 70) * 70,
          bottom: -500 + Math.sin(drift / 55) * 90,
          background: `radial-gradient(circle, ${brandColor}33 0%, transparent 60%)`,
        }}
      />
      {particles.map((p) => (
        <div
          key={p.key}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            opacity: p.twinkle,
          }}
        />
      ))}
    </AbsoluteFill>
  )
}

export function PostiqueMark({ brandColor, size = 44 }: { brandColor: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="6" fill="#ffffff" />
      <line x1="12" y1="8" x2="12" y2="24" stroke={brandColor} strokeWidth="3.2" strokeLinecap="round" />
      <path
        d="M11 8H16.5A5.5 5.5 0 0 1 16.5 19H12"
        stroke={brandColor}
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
