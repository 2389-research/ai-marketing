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
      'Add your company name, website, and social links. Upload brand documents (tone of voice, product decks, past content). Then click Generate Strategy — the AI reads everything and creates your content playbook.',
    actions: ['Add company info', 'Upload brand files', 'Generate content strategy'],
    tip: 'The more context you give, the better every piece of content will be. Upload decks, briefs, or even old blog posts.',
  },
  {
    number: '02',
    title: 'Research content ideas',
    href: '/research',
    color: '#0EA5E9',
    bg: '#F0F9FF',
    description:
      'The agent scans YouTube, trending topics, and news for ideas relevant to your industry. Each result is scored for relevance. Select the ones you want to turn into posts.',
    actions: ['Run a research scan', 'Review scored ideas', 'Select the best ones'],
    tip: 'Run research weekly to keep your content pipeline fresh. The agent learns what performs in your niche.',
  },
  {
    number: '03',
    title: 'Generate content',
    href: '/generate',
    color: '#10B981',
    bg: '#ECFDF5',
    description:
      'Based on your selected research and brand strategy, the AI writes posts for LinkedIn, Instagram, X, TikTok, YouTube, and email — all at once. Each post is QA-checked for tone and length.',
    actions: ['Select channels', 'Click Generate', 'Wait ~60 seconds'],
    tip: 'You can also write a custom brief in the Write tab if you have a specific topic in mind.',
  },
  {
    number: '04',
    title: 'Review and approve drafts',
    href: '/drafts',
    color: '#F59E0B',
    bg: '#FFFBEB',
    description:
      'Every generated post lands in Drafts for your review. Approve ones you like, request edits with feedback (AI rewrites immediately), or reject. You can also reschedule the posting date by clicking the timestamp.',
    actions: ['Approve good posts', 'Request edits with feedback', 'Set or adjust scheduled dates'],
    tip: 'Click "Request edit" and be specific — "make it shorter and more casual" gets much better results than "improve it".',
  },
  {
    number: '05',
    title: 'Add media',
    href: '/photos',
    color: '#EC4899',
    bg: '#FDF2F8',
    description:
      'Upload your brand photos to the Photo Library. When reviewing a draft, click "✦ Match photo" — the AI picks the most relevant image from your library and suggests attaching it. For video content, use the Video Editor to cut clips from interviews or recordings.',
    actions: ['Upload photos to library', 'Click "Match photo" on any draft', 'Attach or swap the suggestion'],
    tip: 'The more photos you upload, the better the matching gets. Aim for variety: product shots, team photos, behind-the-scenes.',
  },
  {
    number: '06',
    title: 'Post it yourself',
    href: '/drafts',
    color: '#6366F1',
    bg: '#EEF2FF',
    description:
      'Auto-posting is off — approved drafts stay in Drafts as your copy-paste-ready source. Open the post there, copy the text (and any attached photo), and publish it on the real platform yourself.',
    actions: ['Open an approved draft', 'Copy the text and media', 'Post it on the real platform'],
    tip: 'The scheduled date on each draft is still a useful reminder of when you meant to post it — it just won’t fire on its own.',
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
          Your AI marketing agent runs a full content pipeline — from research to publishing — in six steps. Here's the complete workflow.
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
        <p className="text-sm font-semibold text-[#262626] mb-1">Need to reset everything?</p>
        <p className="text-sm text-[#6b6b6b]">
          Use the <strong>Start over</strong> button on the Dashboard to clear all drafts and research — useful when starting a new content cycle.
        </p>
      </div>
    </div>
  )
}
