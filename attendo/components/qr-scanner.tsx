'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff, Keyboard, Loader2, ScanLine, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TOKEN_LENGTH } from '@/lib/constants'
import { isValidToken, normalizeManualToken, parseQrPayload } from '@/lib/qr-payload'
import { cn } from '@/lib/utils'

interface QrScannerProps {
  /** Called once with the 6-char token, from either a QR scan or manual entry. */
  onToken: (token: string) => void
  /** Stops the camera and locks the inputs (e.g. while the confirmation modal is open). */
  disabled?: boolean
  /** Shows a spinner on the manual "Verify" button while the parent validates the token. */
  busy?: boolean
}

type Mode = 'scan' | 'manual'
type CameraState = 'idle' | 'starting' | 'running' | 'error'

function describeCameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : String(err)
  if (name === 'NotAllowedError' || /permission|denied/i.test(message)) {
    return 'Camera access was blocked. Allow camera permission in your browser, or enter the code manually.'
  }
  if (name === 'NotFoundError' || /no camera|requested device not found/i.test(message)) {
    return 'No camera was found on this device. Enter the code manually instead.'
  }
  if (name === 'NotReadableError') {
    return 'The camera is in use by another app. Close it and try again, or enter the code manually.'
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Camera access needs a secure (HTTPS) connection. Enter the code manually instead.'
  }
  return 'The camera could not be started. You can enter the code manually instead.'
}

export function QrScanner({ onToken, disabled = false, busy = false }: QrScannerProps) {
  const [mode, setMode] = useState<Mode>('scan')
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanHint, setScanHint] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  const regionId = `qr-region-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (!scanner) return
    try {
      if (scanner.isScanning) await scanner.stop()
    } catch {
      /* already stopped */
    }
    try {
      scanner.clear()
    } catch {
      /* element already removed */
    }
  }, [])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    setScanHint(null)
    setCameraState('starting')
    handledRef.current = false
    // Let React render the (visible) scan region before html5-qrcode measures it.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')
      const scanner = new Html5Qrcode(regionId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      })
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          aspectRatio: 1,
          qrbox: (w, h) => {
            const side = Math.floor(Math.min(w, h) * 0.7)
            return { width: side, height: side }
          },
        },
        (decodedText) => {
          if (handledRef.current) return
          const token = parseQrPayload(decodedText)
          if (!token) {
            setScanHint('That QR code is not an Attendo attendance code.')
            return
          }
          handledRef.current = true
          void stopCamera().then(() => {
            setCameraState('idle')
            onTokenRef.current(token)
          })
        },
        () => {
          /* per-frame "no QR found" notices are expected; ignore */
        }
      )
      setCameraState('running')
    } catch (err) {
      await stopCamera()
      setCameraError(describeCameraError(err))
      setCameraState('error')
    }
  }, [regionId, stopCamera])

  // Stop the camera whenever the scanner is locked or the user leaves the scan tab.
  useEffect(() => {
    if (disabled || mode !== 'scan') {
      void stopCamera().then(() => setCameraState((s) => (s === 'error' ? s : 'idle')))
    }
  }, [disabled, mode, stopCamera])

  // Always release the camera on unmount.
  useEffect(() => {
    return () => {
      void stopCamera()
    }
  }, [stopCamera])

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled || busy || !isValidToken(manual)) return
    onToken(manual)
  }

  const cameraVisible = cameraState === 'starting' || cameraState === 'running'

  return (
    <div className="card overflow-hidden">
      {/* Mode switch */}
      <div role="tablist" aria-label="Attendance method" className="grid grid-cols-2 gap-1 bg-slate-100 p-1.5">
        {(
          [
            { id: 'scan', label: 'Scan QR', Icon: ScanLine },
            { id: 'manual', label: 'Enter code', Icon: Keyboard },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={cn(
              'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              mode === id ? 'bg-white text-navy shadow-sm' : 'text-slate-600 hover:bg-white/60 hover:text-navy'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-6">
        {mode === 'scan' ? (
          <div className="space-y-4" role="tabpanel" aria-label="Scan QR code">
            <div
              className={cn(
                'relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-navy/95',
                !cameraVisible && 'flex items-center justify-center'
              )}
            >
              {/* html5-qrcode renders its <video> into this element */}
              <div id={regionId} className={cn('h-full w-full', !cameraVisible && 'hidden')} />

              {cameraState === 'starting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-navy/80 text-white">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  <span className="text-sm font-medium">Starting camera…</span>
                </div>
              )}

              {!cameraVisible && (
                <div className="px-6 text-center text-blue-100">
                  {cameraState === 'error' ? (
                    <CameraOff className="mx-auto mb-3 h-10 w-10" aria-hidden />
                  ) : (
                    <Camera className="mx-auto mb-3 h-10 w-10" aria-hidden />
                  )}
                  <p className="text-sm">
                    {cameraState === 'error'
                      ? 'Camera unavailable'
                      : "Point your camera at the QR code on your instructor's screen."}
                  </p>
                </div>
              )}
            </div>

            {cameraError && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {cameraError}
              </p>
            )}
            {scanHint && !cameraError && (
              <p role="status" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-800">
                {scanHint}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              {cameraVisible ? (
                <Button variant="outline" className="flex-1" onClick={() => void stopCamera().then(() => setCameraState('idle'))}>
                  <CameraOff className="h-4 w-4" aria-hidden />
                  Stop camera
                </Button>
              ) : (
                <Button variant="brand" className="flex-1" onClick={() => void startCamera()} disabled={disabled}>
                  <Camera className="h-4 w-4" aria-hidden />
                  {cameraState === 'error' ? 'Try camera again' : 'Start camera'}
                </Button>
              )}
              <Button variant="ghost" className="flex-1" onClick={() => setMode('manual')}>
                <Keyboard className="h-4 w-4" aria-hidden />
                Enter code instead
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitManual} className="space-y-4" role="tabpanel" aria-label="Enter session code">
            <div>
              <label htmlFor="session-code" className="mb-2 block text-sm font-semibold text-navy">
                {TOKEN_LENGTH}-character session code
              </label>
              <Input
                id="session-code"
                value={manual}
                onChange={(e) => setManual(normalizeManualToken(e.target.value))}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={TOKEN_LENGTH}
                placeholder="ABC123"
                disabled={disabled}
                aria-describedby="session-code-help"
                className="h-14 text-center font-mono text-2xl font-bold uppercase tracking-[0.4em]"
              />
              <p id="session-code-help" className="mt-2 text-xs text-slate-600">
                The code is shown under the QR code and changes every minute.
              </p>
            </div>
            <Button type="submit" variant="brand" size="lg" className="w-full" disabled={disabled || !isValidToken(manual)} loading={busy}>
              Verify code
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
