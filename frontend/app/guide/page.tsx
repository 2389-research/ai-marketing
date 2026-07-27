'use client'

import Link from 'next/link'

const STEPS = [
  {
    number: '01',
    title: 'Set up your brand',
    href: '/brand',
    color: '#1c69d4',
    bg: '#f7f7f7',
    description:
      'Add your company info, website, and social links, then Generate Strategy — the AI reads everything and builds your content playbook. Two settings matter more than they look: your ACTIVE CHANNELS (each batch’s strongest topic gets a post on every one of them) and VOICE EXAMPLES — paste 3–10 real posts you’ve written, and every AI writer matches that voice exactly instead of sounding like marketing.',
    actions: ['Add company info + channels', 'Paste real posts as voice examples', 'Set generation frequency (daily / every 3 days / weekly)'],
    tip: 'Only keep channels active that you actually post to — every active channel gets content in each batch, so dead channels just add noise and cost.',
  },
  {
    number: '02',
    title: 'Research runs itself',
    href: '/research',
    color: '#0EA5E9',
    bg: '#F0F9FF',
    description:
      'Every morning (6–7 AM Central) the agents scan competitors, news, trends, YouTube, and your own website for relevant ideas, score them, and keep a fresh research pool. You don’t have to do anything — but you can browse the pool and see what the strategist will pick from.',
    actions: ['Nothing required — runs daily', 'Browse the scored pool anytime', 'Reject ideas you never want covered'],
    tip: 'Research feeds generation. If drafts feel off-topic, fix the brand notes and strategy on the Brand page — that’s what the scoring reads.',
  },
  {
    number: '03',
    title: 'Content generates on schedule',
    href: '/generate',
    color: '#10B981',
    bg: '#ECFDF5',
    description:
      'At 8 AM Central, on your chosen cadence, the strategist picks topics and assigns them in tiers: the strongest becomes the PILLAR and gets a native post on every active channel; the others go to 1–2 best-fit channels. Brand-new brands automatically lead with an introduction post; established ones go deeper. Want a batch now? Use Full Run here, or write a specific post yourself on the Write page.',
    actions: ['Auto-runs on your cadence', 'Full Run for a batch right now', 'Write page for one specific post'],
    tip: 'Topics ≠ posts: 2 topics ≈ (your active channels) + 1–2 extra posts. The slider shows the math before you run.',
  },
  {
    number: '04',
    title: 'Review, fix, approve',
    href: '/drafts',
    color: '#F59E0B',
    bg: '#FFFBEB',
    description:
      'Every draft is QA-checked: hard anti-AI-style rules (em-dash overuse, clichés, “it’s not just X” constructions), character limits, repetition, plus your own per-channel QA Rules. Failing drafts show exactly why — click ✦ Fix issues and the AI rewrites against those findings. Approve / reject here or straight from the Slack message. Hate the whole batch? ⟲ Start over wipes unposted drafts and regenerates fresh under your current rules; or Select a few and Delete & replace just those.',
    actions: ['Fix issues → auto-rewrite', 'Approve here or in Slack', 'Start over / Delete & replace when needed'],
    tip: 'Add your own rules on the QA Rules page (per channel, with AI-drafted suggestions) — they’re enforced on every future draft.',
  },
  {
    number: '05',
    title: 'Add photos and AI videos',
    href: '/videos',
    color: '#EC4899',
    bg: '#FDF2F8',
    description:
      'Photos: upload to the library, then ✦ Match photo on any draft picks the most relevant one. Videos: ✦ Generate video on a post opens the video studio — the AI drafts an editable visual prompt from the post, can build on footage you’ve uploaded, renders a real motion-graphics video (unique code every time, no templates), and you preview, regenerate, or attach it. The Videos page also generates from any free description and AI-edits your own footage with motion, captions, and effects.',
    actions: ['Upload photos + videos once', '✦ Generate video from any post', 'Preview → regenerate → attach'],
    tip: 'Renders take ~4–5 minutes — that’s a real video being coded and rendered, not a template being filled.',
  },
  {
    number: '06',
    title: 'Post it, then log it',
    href: '/drafts',
    color: '#6366F1',
    bg: '#EEF2FF',
    description:
      'Auto-posting is off by design — you stay in control. Copy an approved draft (text + media) and publish it on the platform yourself, then hit “Mark as posted” and optionally log likes/comments. That feeds the Audit page’s posting activity, highlights the post ✓ on the calendar, and permanently teaches the AI never to re-pitch that topic.',
    actions: ['Copy text + media, post it', 'Mark as posted (+ likes/comments)', 'Watch Audit + calendar update'],
    tip: 'Logging posts matters beyond bookkeeping: posted topics are the AI’s permanent memory of what your audience has already seen.',
  },
]

function StepCard({ step, index }: { step: typeof STEPS[0]; index: number }) {
  return (
    <div className="bg-white border border-[#e6e6e6] rounded p-6 ">
      <div className="flex items-start gap-5">
        {/* number */}
        <div
          className="w-12 h-12 rounded flex items-center justify-center shrink-0 text-sm font-bold"
          style={{ backgroundColor: step.bg, color: step.color }}>
          {step.number}
        </div>

        <div className="flex-1 min-w-0">
          {/* title */}
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-semibold text-[#262626]">{step.title}</h2>
            <Link
              href={step.href}
              className="text-xs px-2.5 py-1 rounded-full border transition-colors hover:text-white"
              style={{ borderColor: step.color, color: step.color }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.backgroundColor = step.color
                el.style.color = 'white'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.backgroundColor = 'transparent'
                el.style.color = step.color
              }}>
              Open →
            </Link>
          </div>

          {/* description */}
          <p className="text-sm text-[#3c3c3c] leading-relaxed mb-4">{step.description}</p>

          {/* actions */}
          <div className="flex flex-wrap gap-2 mb-4">
            {step.actions.map((a, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
                style={{ backgroundColor: step.bg, color: step.color }}>
                <span className="opacity-60">{i + 1}.</span> {a}
              </span>
            ))}
          </div>

          {/* tip */}
          <div className="flex gap-2 text-xs text-[#6b6b6b] border-t border-[#f7f7f7] pt-3">
            <span className="shrink-0 font-semibold">Tip:</span>
            <span>{step.tip}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GuidePage() {
  return (
    <div className="px-4 sm:px-5 lg:px-6 py-5 lg:py-6 max-w-3xl w-full mx-auto">

      {/* header */}
      <div className="mb-10 pb-6 border-b border-[#e6e6e6]">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/" className="text-xs text-[#9a9a9a] hover:text-[#262626] transition-colors">
            ← Dashboard
          </Link>
        </div>
        <h1 className="text-2xl lg:text-[28px] font-bold text-[#262626] tracking-tight mb-2">How it works</h1>
        <p className="text-[13.5px] text-[#6b6b6b] max-w-xl">
          Research, strategy, and drafts run themselves on a schedule — your job is the judgment calls: review, fix, approve, post.
          Drafts land here and in Slack automatically. Here's the complete loop.
        </p>

        {/* flow diagram */}
        <div className="flex items-center gap-1 mt-6 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <Link
                href={s.href}
                className="text-xs px-2.5 py-1 rounded-full font-semibold transition-colors hover:opacity-80"
                style={{ backgroundColor: s.bg, color: s.color }}>
                {s.number} {s.title}
              </Link>
              {i < STEPS.length - 1 && (
                <span className="text-[#CCCCCC] text-xs">→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* steps */}
      <div className="space-y-5">
        {STEPS.map((step, i) => (
          <StepCard key={i} step={step} index={i} />
        ))}
      </div>

      {/* footer note */}
      <div className="mt-10 p-5 bg-[#f7f7f7] border border-[#e6e6e6] rounded">
        <p className="text-sm font-semibold text-[#262626] mb-1">Need a clean slate?</p>
        <p className="text-sm text-[#6b6b6b]">
          <strong>⟲ Start over</strong> on the Drafts page deletes every unposted draft and regenerates a fresh batch under your
          current rules — posted content survives and stays remembered. Tick <strong>“Also forget posting history”</strong> for a
          full brand reset: the AI treats the brand as new again and leads the next batch with an introduction post.
        </p>
      </div>
    </div>
  )
}
