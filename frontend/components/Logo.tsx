// Postique's mark — a geometric "P" built from strokes, matching the same
// minimal outlined-icon style used throughout Sidebar.tsx (stroke, not fill)
// rather than a bolted-on brand asset. #3B5BFF is the app's official accent
// (see globals.css :focus-visible / input[type=range]).

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#3B5BFF" />
      <line x1="12" y1="8" x2="12" y2="24" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
      <path
        d="M11 8H16.5A5.5 5.5 0 0 1 16.5 19H12"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export default function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold text-white tracking-[-0.02em]">Postique</span>
    </div>
  )
}
