import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, SceneProps } from './shared'

export type FeaturesSceneProps = SceneProps & {
  features: string[]
}

// Feature rows slide in staggered, each with a springing check disc.
export function FeaturesScene({ features, brandColor }: FeaturesSceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 90px' }}>
      {features.map((text, i) => {
        const delay = 12 + i * 18
        const s = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.6 } })
        const check = spring({ frame: frame - delay - 8, fps, config: { damping: 10, mass: 0.4 } })
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 32,
              marginBottom: 64,
              opacity: s,
              transform: `translateX(${interpolate(s, [0, 1], [80, 0])}px)`,
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                backgroundColor: brandColor,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexShrink: 0,
                transform: `scale(${check})`,
              }}
            >
              <svg width={34} height={34} viewBox="0 0 24 24" fill="none">
                <path d="M4 12.5L9.5 18L20 6.5" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 52, lineHeight: 1.3, color: '#ffffff' }}>
              {text}
            </div>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}
