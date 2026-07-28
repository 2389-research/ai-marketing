import { redirect } from 'next/navigation'

// Performance merged into the Audit page (2026-07-28) — one page now answers
// both "what's the current state" and "how is it performing". Keep the old
// URL working for bookmarks/history.
export default function PerformanceRedirect() {
  redirect('/audit')
}
