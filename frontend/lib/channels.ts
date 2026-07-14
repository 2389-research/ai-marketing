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

// Cool-toned palette only — every channel's icon glyph is monochrome,
// tinted into this system rather than using each platform's own brand
// colors (which skew warm: Instagram's gradient, YouTube red, etc).
export const CH_COLOR: Record<string, { dot: string; bg: string; text: string }> = {
  linkedin:  { dot: '#3B5BFF', bg: '#EEF1FF', text: '#2F44D9' },
  instagram: { dot: '#06AED5', bg: '#E5F8FC', text: '#0A7C96' },
  email:     { dot: '#64748B', bg: '#EEF1F4', text: '#4B5768' },
  tiktok:    { dot: '#3B5BFF', bg: '#EEF1FF', text: '#2F44D9' },
  youtube:   { dot: '#D6336C', bg: '#FCE9F0', text: '#B0285A' },
  x:         { dot: '#1A2130', bg: '#EEF1F4', text: '#1A2130' },
}
