import 'server-only'

// Transactional email via Resend (https://resend.com). Optional: if
// RESEND_API_KEY isn't set, every send is a graceful no-op and callers fall
// back to the shareable link. No SDK — just the REST endpoint.
//
// Setup to actually deliver mail:
//   1. RESEND_API_KEY   — from resend.com/api-keys
//   2. RESEND_FROM       — a verified sender, e.g. "Postique <team@yourdomain>".
//      Until a domain is verified, Resend's sandbox only delivers to your own
//      account email; the default below works for that testing case.

const FROM = process.env.RESEND_FROM || 'Postique <onboarding@resend.dev>'

type SendResult = { sent: boolean; reason?: string }

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { sent: false, reason: 'no-provider' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject, html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return { sent: false, reason: `resend ${res.status}` }
    return { sent: true }
  } catch (e: any) {
    return { sent: false, reason: e?.message ?? 'send failed' }
  }
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

const ROLE_LINE: Record<string, string> = {
  admin: 'as an Admin — you can manage the team and all content',
  member: 'as a Member — you can create and edit content',
  owner: 'as an Owner',
}

export function inviteEmail(opts: { orgName: string; inviter: string | null; role: string; joinUrl: string }): { subject: string; html: string } {
  const { orgName, inviter, role, joinUrl } = opts
  const who = inviter ? `${esc(inviter)} invited you` : 'You’ve been invited'
  const subject = `${inviter ? `${inviter} invited you` : 'You’re invited'} to ${orgName} on Postique`
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:460px;margin:0 auto;padding:8px">
    <div style="text-align:center;padding:28px 0 8px">
      <div style="display:inline-block;background:#1800ad;color:#fff;font-weight:800;font-size:20px;border-radius:12px;width:52px;height:52px;line-height:52px">PQ</div>
    </div>
    <p style="color:#6b6b76;font-size:13px;text-align:center;margin:6px 0 2px">${who}</p>
    <h1 style="font-size:20px;color:#1b1b22;text-align:center;margin:4px 0 6px">Join ${esc(orgName)} on Postique</h1>
    <p style="color:#6b6b76;font-size:14px;text-align:center;margin:0 0 22px">You’re joining ${esc(ROLE_LINE[role] ?? ROLE_LINE.member)}.</p>
    <div style="text-align:center;margin:0 0 22px">
      <a href="${joinUrl}" style="background:#1800ad;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px;display:inline-block">Accept invite</a>
    </div>
    <p style="color:#9a9aa4;font-size:12px;text-align:center;margin:0">Or paste this link into your browser:<br><a href="${joinUrl}" style="color:#1800ad">${joinUrl}</a></p>
    <p style="color:#c4c4cc;font-size:11px;text-align:center;margin:24px 0 0">Postique — your AI marketing employee. If you weren’t expecting this, you can ignore it.</p>
  </div>`
  return { subject, html }
}

export async function sendInviteEmail(to: string, opts: { orgName: string; inviter: string | null; role: string; joinUrl: string }): Promise<SendResult> {
  const { subject, html } = inviteEmail(opts)
  return send(to, subject, html)
}
