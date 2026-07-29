// Postique's mark — "PQ" monogram on the brand ultramarine (#1800ad), with
// the wordmark set in Poppins ExtraBold, all caps, per the 2026-07-29 rebrand.
// Poppins is loaded via next/font in app/layout.tsx and exposed as
// --font-poppins; the SVG <text> inherits it through that variable.

const BRAND = '#1800ad'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="6" fill={BRAND} />
      <text
        x="16"
        y="21.5"
        textAnchor="middle"
        fill="white"
        fontSize="13"
        fontWeight="800"
        letterSpacing="-0.5"
        style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}
      >
        PQ
      </text>
    </svg>
  )
}

export default function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span
        className="text-[15px] font-extrabold text-white tracking-[0.08em]"
        style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}
      >
        POSTIQUE
      </span>
    </div>
  )
}
