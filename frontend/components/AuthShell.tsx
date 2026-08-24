'use client'

import { LogoMark } from '@/components/Logo'

// Shared centered card + brand header for the sign-in / sign-up / welcome pages.
export function AuthShell({ children, maxWidth = 380 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bmw-surface-soft)] px-4 py-10">
      <div className="w-full rounded-2xl border border-[var(--bmw-hairline)] bg-[var(--bmw-canvas)] p-8 shadow-[0_12px_40px_-16px_rgba(24,0,173,.25)]" style={{ maxWidth }}>
        <div className="mb-6 flex items-center justify-center gap-2">
          <LogoMark size={30} />
          <span className="text-[20px] font-extrabold uppercase tracking-[-0.03em] text-[var(--bmw-ink)]" style={{ fontFamily: 'var(--font-poppins), Poppins, sans-serif' }}>Postique</span>
        </div>
        {children}
      </div>
    </div>
  )
}

export function GoogleButton({ onClick, label = 'Continue with Google', disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2.5 rounded-[10px] border border-[var(--bmw-hairline-strong)] bg-[var(--bmw-canvas)] px-4 py-2.5 text-[14px] font-semibold text-[var(--bmw-ink)] transition-colors hover:border-[var(--bmw-primary)] disabled:opacity-50"
    >
      <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#4285F4" d="M45 24c0-1.6-.1-2.8-.4-4H24v7.5h12c-.2 2-1.6 5-4.5 7l7 5.4C42.7 42 45 33.9 45 24z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7-5.4c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.1l-7.2 5.6C7.9 41.1 15.3 46 24 46z"/><path fill="#FBBC05" d="M11.6 28.2c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2l-7.2-5.6C2.9 17 2 20.4 2 24s.9 7 2.4 9.8l7.2-5.6z"/><path fill="#EA4335" d="M24 10.7c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C35 4 30 2 24 2 15.3 2 7.9 6.9 4.4 14.2l7.2 5.6C13.3 14.6 18.2 10.7 24 10.7z"/></svg>
      {label}
    </button>
  )
}

export const inputCls = 'w-full rounded-[10px] border border-[var(--bmw-hairline-strong)] bg-[var(--bmw-surface-soft)] px-3 py-2.5 text-[14px] text-[var(--bmw-body-strong)] outline-none focus:border-[var(--bmw-primary)]'
export const primaryBtnCls = 'w-full rounded-[10px] bg-[var(--bmw-primary)] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--bmw-primary-active)] disabled:opacity-50'
export const labelCls = 'mb-1.5 block text-[12px] font-semibold text-[var(--bmw-body)]'
