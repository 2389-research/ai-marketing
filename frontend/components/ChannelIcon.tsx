'use client'

import {
  FaLinkedin, FaInstagram, FaXTwitter, FaTiktok, FaYoutube, FaEnvelope,
  FaPinterest, FaReddit, FaThreads,
} from 'react-icons/fa6'
import type { IconType } from 'react-icons'
import { CH_COLOR } from '@/lib/channels'

const ICONS: Record<string, IconType> = {
  linkedin: FaLinkedin,
  instagram: FaInstagram,
  x: FaXTwitter,
  tiktok: FaTiktok,
  youtube: FaYoutube,
  email: FaEnvelope,
  // Sub-formats of an existing platform reuse that platform's glyph — the
  // color mapping (CH_COLOR) is what keeps them visually distinct.
  instagram_stories: FaInstagram,
  youtube_shorts: FaYoutube,
  pinterest: FaPinterest,
  reddit: FaReddit,
  threads: FaThreads,
}

// Monochrome platform glyph, tinted into the app's own cool palette (see
// lib/channels.ts CH_COLOR) rather than each platform's real brand colors —
// keeps every icon reading as one coherent system.
export default function ChannelIcon({ channel, className = 'w-4 h-4' }: { channel: string; className?: string }) {
  const Icon = ICONS[channel]
  if (!Icon) return null
  return <Icon className={className} style={{ color: CH_COLOR[channel]?.dot ?? '#64748B' }} />
}
