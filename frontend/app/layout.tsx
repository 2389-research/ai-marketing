import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Marketing Agent',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="bg-stone-50 text-gray-900 antialiased font-sans">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 ml-48 min-h-screen overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
