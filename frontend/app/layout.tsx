import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Postique',
  description: 'AI-run content pipeline — research, strategy, drafts, and scheduling in one place.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="bg-[#f7f7f7] text-[#262626] antialiased font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 min-h-screen overflow-auto ml-56">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
