import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, PostiqueMark, SceneProps } from './shared'

export type OutroSceneProps = SceneProps & {
  cta: string
}

// Logo lands with a spring, an expanding ring pulses behind it, wordmark
// and CTA follow.
export function OutroScene({ cta, brandColor }: OutroSceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const mark = spring({ frame: frame - 8, fps, config: { damping: 11, mass: 0.5 } })
  const name = spring({ frame: frame - 20, fps, config: { damping: 16, mass: 0.6 } })
  const ctaIn = interpolate(frame, [38, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const ringT = interpolate(frame % 70, [0, 70], [0, 1], { easing: Easing.out(Easing.quad) })
  const ringVisible = frame > 15

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {ringVisible && (
          <div
            style={{
              position: 'absolute',
              width: 160 + ringT * 340,
              height: 160 + ringT * 340,
              borderRadius: '50%',
              border: `3px solid ${brandColor}`,
              opacity: (1 - ringT) * 0.6,
            }}
          />
        )}
        <div style={{ transform: `scale(${mark})` }}>
          <PostiqueMark brandColor={brandColor} size={150} />
        </div>
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 84,
          color: '#ffffff',
          marginTop: 56,
          opacity: name,
          transform: `translateY(${interpolate(name, [0, 1], [30, 0])}px)`,
        }}
      >
        Postique
      </div>
      <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 42, color: brandColor, marginTop: 28, opacity: ctaIn }}>
        {cta}
      </div>
    </AbsoluteFill>
  )
}
