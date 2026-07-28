// Shared channel list + color coding — single source of truth so every page
// (dashboard, drafts, published, write, generate) renders channels identically.

export const CHANNELS = [
  { id: 'linkedin',          label: 'LinkedIn'    },
  { id: 'instagram',         label: 'Instagram'   },
  { id: 'email',             label: 'Email'       },
  { id: 'tiktok',            label: 'TikTok'      },
  { id: 'youtube',           label: 'YouTube'     },
  { id: 'x',                 label: 'X'           },
  { id: 'instagram_stories', label: 'IG Stories'  },
  { id: 'pinterest',         label: 'Pinterest'   },
  { id: 'reddit',            label: 'Reddit'      },
  { id: 'threads',           label: 'Threads'     },
  { id: 'youtube_shorts',    label: 'YT Shorts'   },
] as const

// Brand-inspired palette — each channel keeps a recognizable version of its
// real platform color, adjusted so no two active channels share a hue
// (the old "cool-toned only" system gave LinkedIn, TikTok, and Threads the
// same blue, which made the calendar unreadable).
export const CH_COLOR: Record<string, { dot: string; bg: string; text: string }> = {
  linkedin:          { dot: '#0A66C2', bg: '#E9F1F9', text: '#0A66C2' }, // LinkedIn blue
  instagram:         { dot: '#E1306C', bg: '#FCE9F1', text: '#C1275B' }, // IG magenta
  email:             { dot: '#64748B', bg: '#EEF1F4', text: '#475569' }, // neutral slate
  tiktok:            { dot: '#00B8C4', bg: '#E0F7F9', text: '#00838F' }, // TikTok aqua
  youtube:           { dot: '#FF0000', bg: '#FDEBEB', text: '#C00000' }, // YouTube red
  x:                 { dot: '#0F1419', bg: '#EEF0F2', text: '#0F1419' }, // X black
  instagram_stories: { dot: '#A855F7', bg: '#F5EEFD', text: '#7E22CE' }, // IG-gradient purple
  pinterest:         { dot: '#8C0615', bg: '#F7E8EA', text: '#8C0615' }, // Pinterest crimson (dark)
  reddit:            { dot: '#FF4500', bg: '#FFEDE5', text: '#CC3700' }, // Reddit orange
  threads:           { dot: '#57534E', bg: '#F0EFEE', text: '#44403C' }, // warm gray
  youtube_shorts:    { dot: '#F43F5E', bg: '#FFE9EE', text: '#BE123C' }, // Shorts rose
}
