import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence } from 'remotion'
import { z } from 'zod'

export const quoteCardSchema = z.object({
  headline: z.string(),
  brandColor: z.string().default('#1c69d4'),
})

type Props = z.infer<typeof quoteCardSchema>

export function QuoteCard({ headline, brandColor }: Props) {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()

  const entrance = spring({ frame, fps, config: { damping: 200, mass: 0.6 } })
  const translateY = interpolate(entrance, [0, 1], [40, 0])
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' })

  const markScale = spring({ frame: frame - 8, fps, config: { damping: 12, mass: 0.4 } })

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a2129' }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(160deg, ${brandColor} 0%, #1a2129 65%)`,
          opacity: 0.9,
        }}
      />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 96 }}>
        <div
          style={{
            transform: `translateY(${translateY}px)`,
            opacity,
            fontFamily: 'Inter, sans-serif',
            fontSize: width * 0.09,
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.25,
            letterSpacing: 0,
            maxWidth: '90%',
          }}
        >
          {headline}
        </div>
      </AbsoluteFill>

      <Sequence from={8}>
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 96 }}>
          <div
            style={{
              transform: `scale(${markScale})`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <svg width={36} height={36} viewBox="0 0 32 32" fill="none">
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
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 28, color: '#ffffff' }}>
              Postique
            </span>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  )
}
