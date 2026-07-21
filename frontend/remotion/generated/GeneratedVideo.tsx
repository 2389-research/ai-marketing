import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  random,
} from 'remotion'
import React from 'react'

export const DURATION_IN_FRAMES = 180

const PALETTE = ['#1c69d4', '#ffd166', '#ff6b6b', '#06d6a0', '#ffffff', '#f4a261']

function Backdrop() {
  const frame = useCurrentFrame()
  const drift = frame * 0.5
  return (
    <AbsoluteFill style={{ backgroundColor: '#12131c' }}>
      <div
        style={{
          position: 'absolute',
          width: 1600,
          height: 1600,
          borderRadius: '50%',
          left: -300 + Math.sin(drift / 70) * 60,
          top: -700 + Math.cos(drift / 90) * 50,
          background: 'radial-gradient(circle, #1c69d455 0%, transparent 65%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1300,
          height: 1300,
          borderRadius: '50%',
          right: -400 + Math.cos(drift / 60) * 50,
          bottom: -500 + Math.sin(drift / 100) * 60,
          background: 'radial-gradient(circle, #ffd16633 0%, transparent 65%)',
        }}
      />
    </AbsoluteFill>
  )
}

function ConfettiPiece({ i }: { i: number }) {
  const frame = useCurrentFrame()

  const startX = random(`x-${i}`) * 1080
  const startDelay = Math.floor(random(`d-${i}`) * 55)
  const size = 10 + random(`s-${i}`) * 16
  const isCircle = random(`c-${i}`) > 0.5
  const color = PALETTE[i % PALETTE.length]
  const rotSpeed = (random(`r-${i}`) - 0.5) * 22
  const driftAmp = 30 + random(`a-${i}`) * 50
  const driftFreq = 0.03 + random(`f-${i}`) * 0.04

  const y = interpolate(frame, [startDelay, startDelay + 130], [-120, 2100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  })

  const opacity = interpolate(
    frame,
    [startDelay, startDelay + 8, DURATION_IN_FRAMES - 25, DURATION_IN_FRAMES - 5],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  const x = startX + Math.sin((frame - startDelay) * driftFreq) * driftAmp
  const rotation = (frame - startDelay) * rotSpeed

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size * (isCircle ? 1 : 0.5),
        backgroundColor: color,
        borderRadius: isCircle ? '50%' : 3,
        opacity,
        transform: `rotate(${rotation}deg)`,
      }}
    />
  )
}

function Confetti({ count }: { count: number }) {
  return (
    <AbsoluteFill style={{ zIndex: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <ConfettiPiece key={i} i={i} />
      ))}
    </AbsoluteFill>
  )
}

function CountScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const pop = spring({ frame, fps, config: { damping: 12, mass: 0.6 } })
  const scale = interpolate(pop, [0, 1], [0.6, 1])
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })

  const count = Math.floor(
    interpolate(frame, [4, 55], [0, 10000], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    })
  )

  const exit = interpolate(frame, [58, 75], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const subOpacity = interpolate(frame, [20, 34], [0, 1], { extrapolateRight: 'clamp' })
  const subY = interpolate(frame, [20, 34], [20, 0], { extrapolateRight: 'clamp' })

  const glowPulse = 0.9 + Math.sin(frame * 0.15) * 0.1

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        opacity: opacity * exit,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #1c69d455 0%, transparent 70%)',
          transform: `scale(${glowPulse})`,
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 800,
            fontSize: 180,
            color: '#ffffff',
            letterSpacing: -4,
            textShadow: '0 0 60px rgba(28,105,212,0.6)',
          }}
        >
          {count.toLocaleString('en-US')}
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 600,
            fontSize: 46,
            color: '#ffd166',
            marginTop: 14,
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
            letterSpacing: 1,
          }}
        >
          posts scheduled
        </div>
        <div
          style={{
            fontFamily: 'Inter, sans-serif',
            fontWeight: 500,
            fontSize: 32,
            color: '#c9d4e6',
            marginTop: 10,
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
          }}
        >
          through Postique 🎈
        </div>
      </div>
    </AbsoluteFill>
  )
}

function ThankYouScene() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.5 } })
  const titleY = interpolate(enter, [0, 1], [60, 0])
  const titleOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' })

  const subOpacity = interpolate(frame, [18, 34], [0, 1], { extrapolateRight: 'clamp' })
  const subY = interpolate(frame, [18, 34], [30, 0], { extrapolateRight: 'clamp' })

  const lineWidth = interpolate(frame, [10, 40], [0, 140], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  })

  const logoOpacity = interpolate(frame, [55, 75], [0, 1], { extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: 80,
      }}
    >
      <div
        style={{
          width: lineWidth,
          height: 6,
          borderRadius: 3,
          backgroundColor: '#ffd166',
          marginBottom: 40,
        }}
      />
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 800,
          fontSize: 130,
          color: '#ffffff',
          textAlign: 'center',
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          lineHeight: 1.05,
        }}
      >
        Thank You
      </div>
      <div
        style={{
          fontFamily: 'Inter, sans-serif',
          fontWeight: 500,
          fontSize: 40,
          color: '#c9d4e6',
          textAlign: 'center',
          marginTop: 30,
          maxWidth: 800,
          opacity: subOpacity,
          transform: `translateY(${subY}px)`,
        }}
      >
        To every single one of you who trusts Postique with your voice.
        You made this milestone happen.
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 140,
          fontFamily: 'Inter, sans-serif',
          fontWeight: 700,
          fontSize: 44,
          color: '#1c69d4',
          opacity: logoOpacity,
          letterSpacing: 1,
        }}
      >
        Postique
      </div>
    </AbsoluteFill>
  )
}

export default function Confetti10K() {
  return (
    <AbsoluteFill>
      <Backdrop />
      <Sequence from={0} durationInFrames={75}>
        <CountScene />
      </Sequence>
      <Sequence from={75} durationInFrames={105}>
        <ThankYouScene />
      </Sequence>
      <Confetti count={70} />
    </AbsoluteFill>
  )
}