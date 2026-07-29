// Postique's mark — "PQ" set in Poppins ExtraBold on the brand ultramarine,
// with Q's tail extended into a long diagonal stroke (the "cursor/pen stroke"
// variant — a nod to writing posts). If the long tail doesn't land, dropping
// the <line> below returns it to the plain PQ badge.

const BRAND = '#1800ad'

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill={BRAND} />
      <text
        x="15.5"
        y="20.5"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="800"
        letterSpacing="-0.5"
        style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}
      >
        PQ
      </text>
      {/* extended Q tail — continues the glyph's own tail direction */}
      <line x1="21.2" y1="19.4" x2="26.4" y2="24.6" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  )
}

export default function Logo({ size = 40, className = '', hideWord = false }: {
  size?: number; className?: string; hideWord?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span
        className={`text-[24px] font-extrabold text-white tracking-[-0.03em] ${hideWord ? 'md:hidden' : ''}`}
        style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}
      >
        POSTIQUE
      </span>
    </div>
  )
}
