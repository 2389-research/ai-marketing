// Shared channel list + color coding — single source of truth so every page
// (dashboard, drafts, published, write, generate) renders channels identically.

export const CHANNELS = [
  { id: 'linkedin',  label: 'LinkedIn'  },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email',     label: 'Email'     },
  { id: 'tiktok',    label: 'TikTok'    },
  { id: 'youtube',   label: 'YouTube'   },
  { id: 'x',         label: 'X'         },
] as const

export const CH_COLOR: Record<string, { dot: string; bg: string; text: string }> = {
  linkedin:  { dot: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  instagram: { dot: '#EC4899', bg: '#FDF2F8', text: '#BE185D' },
  email:     { dot: '#F59E0B', bg: '#FFFBEB', text: '#B45309' },
  tiktok:    { dot: '#14B8A6', bg: '#F0FDFA', text: '#0F766E' },
  youtube:   { dot: '#EF4444', bg: '#FEF2F2', text: '#B91C1C' },
  x:         { dot: '#8B5CF6', bg: '#F5F3FF', text: '#6D28D9' },
}
