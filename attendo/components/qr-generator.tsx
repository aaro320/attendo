'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Maximize2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCountdown } from '@/hooks/use-countdown'
import { buildQrPayload } from '@/lib/qr-payload'
import { cn } from '@/lib/utils'

interface QrGeneratorProps {
  sessionId: number
  token: string
  /** Local epoch-ms deadline (use toLocalExpiry() so device clock skew doesn't matter). */
  expiresAtMs: number
  ttlSeconds: number
  subject?: string
  room?: string
}

/**
 * High-resolution, vector (SVG) QR code with a live rotating-token countdown.
 * Rotation itself is driven by the parent; this component only renders the current token.
 */
export function QrGenerator({ sessionId, token, expiresAtMs, ttlSeconds, subject, room }: QrGeneratorProps) {
  const { secondsLeft, msLeft } = useCountdown(expiresAtMs)
  const [expanded, setExpanded] = useState(false)

  const payload = buildQrPayload(sessionId, token)
  const percent = Math.min(100, (msLeft / (ttlSeconds * 1000)) * 100)
  const urgent = secondsLeft <= 10
  const spacedToken = `${token.slice(0, 3)} ${token.slice(3)}`

  // Projector mode: close on Escape and lock page scroll.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [expanded])

  const countdown = (
    <div className="w-full" role="timer" aria-label={`Code refreshes in ${secondsLeft} seconds`}>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <RefreshCw className={cn('h-4 w-4', urgent && 'text-danger-strong')} aria-hidden />
          Code refreshes in
        </span>
        <span className={cn('font-mono text-base font-bold tabular-nums', urgent ? 'text-danger-strong' : 'text-navy')}>
          {secondsLeft}s
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-linear', urgent ? 'bg-danger' : 'bg-success')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )

  return (
    <>
      <div className="flex flex-col items-center gap-5">
        <div className="w-full max-w-[22rem] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <QRCodeSVG
            value={payload}
            size={512}
            level="Q"
            marginSize={2}
            bgColor="#FFFFFF"
            fgColor="#0B3B60"
            style={{ width: '100%', height: 'auto' }}
            role="img"
            aria-label={`Attendance QR code${subject ? ` for ${subject}` : ''}`}
          />
        </div>

        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Or type this code</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.25em] text-navy" aria-label={`Code ${token.split('').join(' ')}`}>
            {spacedToken}
          </p>
          {(subject || room) && (
            <p className="mt-2 text-sm text-slate-600">{[subject, room].filter(Boolean).join(' · ')}</p>
          )}
        </div>

        {countdown}

        <Button variant="outline" className="w-full" onClick={() => setExpanded(true)}>
          <Maximize2 className="h-4 w-4" aria-hidden />
          Projector mode
        </Button>
      </div>

      {expanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen attendance QR code"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6"
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Exit projector mode"
            className="absolute right-4 top-4 inline-flex h-12 w-12 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
          <QRCodeSVG
            value={payload}
            size={1024}
            level="Q"
            marginSize={2}
            bgColor="#FFFFFF"
            fgColor="#0B3B60"
            style={{ width: 'min(68vh, 88vw)', height: 'min(68vh, 88vw)' }}
            role="img"
            aria-label="Attendance QR code"
          />
          <p className="font-mono text-5xl font-bold tracking-[0.3em] text-navy">{spacedToken}</p>
          <div className="w-full max-w-xl">{countdown}</div>
        </div>
      )}
    </>
  )
}
