import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      colors: {
        // Cool, tightly-controlled palette — see frontend design brief.
        // No warm hues (no orange/coral/amber/yellow) anywhere in the system.
        paper: '#F2F5FA',
        ink: '#1A2130',
        indigo: {
          DEFAULT: '#3B5BFF',
          soft: '#EEF1FF',
        },
        cyan: {
          DEFAULT: '#06AED5',
          soft: '#E5F8FC',
        },
        teal: {
          DEFAULT: '#0EA5A0',
          soft: '#E4F7F5',
        },
        slate: {
          DEFAULT: '#64748B',
          soft: '#EEF1F4',
        },
        crimson: {
          DEFAULT: '#D6336C',
          soft: '#FCE9F0',
        },
      },
    },
  },
  plugins: [],
}
export default config
