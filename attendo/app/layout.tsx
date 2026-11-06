import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Attendo — Smart Attendance Monitoring',
  description: 'QR-based attendance monitoring for the BulSU Computer Engineering Department.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Attendo',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B3B60',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(reg) {
                      console.log('SW Registered:', reg.scope);
                    })
                    .catch(function(err) {
                      console.error('SW Error:', err);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-surface font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  )
}
