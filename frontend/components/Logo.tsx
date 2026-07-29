// Postique's mark — interlocked "PQ" ligature: one shared bowl serves as both
// P's bowl and Q's circle (stem on the left = P; tail kicking out bottom-right
// = Q). Brand ultramarine #1800ad badge, letterforms in #d5d5d5 per the
// 2026-07-29 rebrand. Wordmark: POSTIQUE, Poppins ExtraBold, tight tracking.

const BRAND = '#1800ad'
const FG = '#d5d5d5'

export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill={BRAND} />
      {/* P stem */}
      <line x1="11" y1="8" x2="11" y2="24" stroke={FG} strokeWidth="3" strokeLinecap="round" />
      {/* shared bowl — P's bowl and Q's circle are the same shape */}
      <circle cx="17.5" cy="13.5" r="5.5" stroke={FG} strokeWidth="3" fill="none" />
      {/* Q tail */}
      <line x1="21.4" y1="17.4" x2="24.8" y2="20.8" stroke={FG} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function Logo({ size = 34, className = '', hideWord = false }: {
  size?: number; className?: string; hideWord?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span
        className={`text-[20px] font-extrabold text-[#d5d5d5] tracking-[-0.03em] ${hideWord ? 'md:hidden' : ''}`}
        style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}
      >
        POSTIQUE
      </span>
    </div>
  )
}
