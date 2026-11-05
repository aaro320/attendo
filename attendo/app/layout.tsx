import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Attendo — Smart Attendance Monitoring',
  description: 'QR-based attendance monitoring for the BulSU Computer Engineering Department.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B3B60',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface font-sans text-slate-900 antialiased">{children}</body>
    </html>
  )
}
