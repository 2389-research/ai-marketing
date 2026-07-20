import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { FONT, SceneProps } from './shared'

export type StatSceneProps = SceneProps & {
  value: number
  prefix?: string
  suffix?: string
  label: string
}

// A big number counts up from 0 with an easing curve that settles near the
// final value, then a label fades in underneath.
export function StatScene({ value, prefix = '', suffix = '', label, brandColor }: StatSceneProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const countDuration = 65
  const t = interpolate(frame, [10, 10 + countDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })
  const shown = Math.round(value * t)
  const formatted = shown.toLocaleString('en-US')

  const labelSpring = spring({ frame: frame - (10 + countDuration - 15), fps, config: { damping: 18, mass: 0.6 } })
  const pop = spring({ frame, fps, config: { damping: 9, mass: 0.4 } })

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: 190,
          color: brandColor,
          transform: `scale(${0.85 + pop * 0.15})`,
          textShadow: `0 0 80px ${brandColor}66`,
        }}
      >
        {prefix}
        {formatted}
        {suffix}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: 46,
          color: '#ffffff',
          marginTop: 24,
          opacity: labelSpring,
          transform: `translateY(${interpolate(labelSpring, [0, 1], [20, 0])}px)`,
          textAlign: 'center',
          maxWidth: '80%',
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  )
}
