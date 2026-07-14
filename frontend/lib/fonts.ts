// Caption font choices — keys must match video_process.py's FONT_REGISTRY
// exactly, since this key is sent straight through as options.font. The
// CSS family names are declared as @font-face in app/globals.css, pointing
// at the same .ttf files under public/fonts/ so the browser preview matches
// what actually gets rendered.

export interface FontOption {
  key: string
  label: string
  cssFamily: string
}

export const FONT_OPTIONS: FontOption[] = [
  { key: 'poppins',          label: 'Poppins',          cssFamily: 'CaptionPoppins' },
  { key: 'poppins-semibold', label: 'Poppins SemiBold', cssFamily: 'CaptionPoppinsSemiBold' },
  { key: 'bebas-neue',       label: 'Bebas Neue',       cssFamily: 'CaptionBebasNeue' },
  { key: 'anton',            label: 'Anton',            cssFamily: 'CaptionAnton' },
]

export const DEFAULT_FONT_KEY = 'poppins'

export function fontFamilyFor(key: string): string {
  return FONT_OPTIONS.find(f => f.key === key)?.cssFamily ?? 'CaptionPoppins'
}
