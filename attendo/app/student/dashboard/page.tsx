'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  DoorOpen,
  MapPin,
  Printer,
  ShieldCheck,
  TimerReset,
  TriangleAlert,
  User,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { LoadingScreen } from '@/components/loading-screen'
import { QrScanner } from '@/components/qr-scanner'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCountdown } from '@/hooks/use-countdown'
import { useRequireRole } from '@/hooks/use-auth'
import { friendlyError } from '@/lib/errors'
import { supabase } from '@/lib/supabaseClient'
import type { OpenSession, SubmitResult, VerifyResult } from '@/lib/types'
import { cn, formatDate, formatTime, toLocalExpiry } from '@/lib/utils'

interface Pending {
  token: string
  info: VerifyResult
  expiresAtMs: number
}

export default function StudentDashboardPage() {
  const { loading, profile, signOut } = useRequireRole('student')

  const [openSessions, setOpenSessions] = useState<OpenSession[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [slip, setSlip] = useState<SubmitResult | null>(null)

  const loadSessions = useCallback(async () => {
    const { data } = await supabase.rpc('list_open_sessions')
    setOpenSessions((data as OpenSession[] | null) ?? [])
    setSessionsLoaded(true)
  }, [])

  // Poll for classes that open or close (students can't subscribe to class_sessions by design).
  useEffect(() => {
    if (loading) return
    void loadSessions()
    const id = setInterval(() => void loadSessions(), 15000)
    return () => clearInterval(id)
  }, [loading, loadSessions])

  async function handleToken(token: string) {
    setScanError(null)
    setVerifying(true)
    const { data, error } = await supabase.rpc('verify_token', { p_token: token })
    setVerifying(false)
    if (error || !data) {
      setScanError(friendlyError(error))
      return
    }
    const info = data as VerifyResult
    setSubmitError(null)
    setPending({ token, info, expiresAtMs: toLocalExpiry(info.expires_at, info.server_now) })
  }

  async function confirmAttendance() {
    if (!pending) return
    setSubmitting(true)
    setSubmitError(null)
    const { data, error } = await supabase.rpc('submit_attendance', { p_token: pending.token })
    setSubmitting(false)
    if (error || !data) {
      setSubmitError(friendlyError(error))
      return
    }
    setSlip(data as SubmitResult)
    setPending(null)
    void loadSessions()
  }

  function closeVerify() {
    if (submitting) return
    setPending(null)
    setSubmitError(null)
  }

  if (loading) return <LoadingScreen label="Loading your dashboard…" />

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader name={profile?.name} roleLabel="Student" onSignOut={signOut} />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {slip ? (
          <GateSlip slip={slip} onDone={() => setSlip(null)} />
        ) : (
          <>
            <div className="print:hidden">
              <h1 className="text-2xl font-bold text-navy sm:text-3xl">Hi, {firstName(profile?.name)}</h1>
              <p className="mt-1 text-slate-600">Scan the QR code on your instructor&apos;s screen to log your attendance.</p>
            </div>

            <OpenBanner sessions={openSessions} loaded={sessionsLoaded} />

            <div className="mx-auto max-w-xl">
              <QrScanner onToken={(t) => void handleToken(t)} disabled={Boolean(pending) || verifying} busy={verifying} />
              {scanError && (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft p-4 text-sm font-medium text-danger-strong">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {scanError}
                </p>
              )}
            </div>
          </>
        )}
      </main>

      <VerifyDialog
        pending={pending}
        submitting={submitting}
        error={submitError}
        onConfirm={() => void confirmAttendance()}
        onClose={closeVerify}
      />
    </div>
  )
}

function firstName(full?: string): string {
  if (!full) return 'there'
  // Names are stored "Surname, Given Names".
  const given = full.includes(',') ? full.split(',')[1] : full
  return given.trim().split(/\s+/)[0] || 'there'
}

/* ---------- Active classes banner ---------- */

function OpenBanner({ sessions, loaded }: { sessions: OpenSession[]; loaded: boolean }) {
  if (!loaded) return <div className="h-24 animate-pulse rounded-xl bg-slate-200 print:hidden" aria-hidden />

  if (sessions.length === 0) {
    return (
      <section className="card flex items-center gap-4 p-5 print:hidden" aria-label="Active classes">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <DoorOpen className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <p className="font-semibold text-navy">No class is open for attendance right now</p>
          <p className="text-sm text-slate-600">This updates automatically when your instructor starts a session.</p>
        </div>
      </section>
    )
  }

  return (
    <section
      aria-label="Active classes"
      className="overflow-hidden rounded-xl border border-success/40 bg-success-soft shadow-card print:hidden"
    >
      <div className="flex items-center gap-2 border-b border-success/30 px-5 py-3 text-success-strong">
        <span className="relative flex h-3 w-3" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-success" />
        </span>
        <p className="text-sm font-bold uppercase tracking-wide">Open for attendance</p>
      </div>
      <ul className="divide-y divide-success/20">
        {sessions.map((s) => (
          <li key={s.session_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="font-semibold text-navy">{s.subject}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden />{s.room}</span>
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden />{formatTime(s.start_time)} – {formatTime(s.end_time)}</span>
                <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" aria-hidden />{s.instructor_name}</span>
              </p>
            </div>
            {s.already_logged && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-success-strong ring-1 ring-success-strong/30">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Logged
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ---------- Verification summary modal ---------- */

function VerifyDialog({
  pending,
  submitting,
  error,
  onConfirm,
  onClose,
}: {
  pending: Pending | null
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const { secondsLeft, expired } = useCountdown(pending?.expiresAtMs ?? null)
  const info = pending?.info
  const urgent = secondsLeft <= 10

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => submitting && e.preventDefault()}
      >
        {info && (
          <>
            <DialogHeader>
              <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <ShieldCheck className="h-6 w-6" aria-hidden />
              </span>
              <DialogTitle>Confirm your attendance</DialogTitle>
              <DialogDescription>Review the details below, then confirm to record your attendance.</DialogDescription>
            </DialogHeader>

            <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {[
                { label: 'Student', value: `${info.student_name} (${info.student_num})` },
                { label: 'Subject', value: info.subject },
                { label: 'Room', value: info.room },
                { label: 'Instructor', value: info.instructor_name },
                { label: 'Schedule', value: `${formatTime(info.start_time)} – ${formatTime(info.end_time)}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="text-right font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-slate-600">You will be marked</dt>
                <dd><StatusBadge status={info.predicted_status} /></dd>
              </div>
            </dl>

            <div
              role="timer"
              aria-label={expired ? 'Code expired' : `Code expires in ${secondsLeft} seconds`}
              className={cn(
                'mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium',
                expired ? 'bg-danger-soft text-danger-strong' : urgent ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
              )}
            >
              <span className="inline-flex items-center gap-2">
                <TimerReset className="h-4 w-4" aria-hidden />
                {expired ? 'This code has expired' : 'Code expires in'}
              </span>
              {!expired && <span className="font-mono text-base font-bold tabular-nums">{secondsLeft}s</span>}
            </div>

            {(error || expired) && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error ?? "Close this window and scan the latest code on your instructor's screen."}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                {expired ? 'Close' : 'Cancel'}
              </Button>
              <Button variant="success" onClick={onConfirm} loading={submitting} disabled={expired}>
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Confirm attendance
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Digital gate slip ---------- */

function GateSlip({ slip, onDone }: { slip: SubmitResult; onDone: () => void }) {
  const rows = [
    { icon: User, label: 'Student', value: `${slip.student_name}`, sub: slip.student_num },
    { icon: CalendarDays, label: 'Subject', value: slip.subject, sub: `${slip.room} · ${slip.instructor_name}` },
  ]

  return (
    <section aria-label="Digital gate slip" className="mx-auto w-full max-w-md animate-fade-up">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card print:shadow-none">
        <div className="bg-success-strong px-6 py-6 text-center text-white">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <CheckCircle2 className="h-9 w-9" aria-hidden />
          </span>
          <h1 className="text-xl font-bold">Attendance recorded</h1>
          <p className="mt-1 text-sm text-emerald-50">Show this digital gate slip if asked.</p>
        </div>

        <div className="space-y-4 px-6 py-5">
          {rows.map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-soft text-navy">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</p>
                <p className="font-semibold text-slate-900">{value}</p>
                <p className="text-sm text-slate-600">{sub}</p>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-600">Status</span>
            <StatusBadge status={slip.status} />
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm text-slate-600">Verified at</span>
            <span className="text-right text-sm font-semibold tabular-nums text-slate-900">
              {formatDate(slip.date_scanned)}
              <br />
              {formatTime(slip.time_scanned, true)}
            </span>
          </div>
        </div>

        {/* Perforated tear line */}
        <div className="relative px-0" aria-hidden>
          <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-surface ring-1 ring-slate-200" />
          <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-surface ring-1 ring-slate-200" />
          <div className="mx-6 border-t-2 border-dashed border-slate-300" />
        </div>

        <div className="px-6 pb-6 pt-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Reference number</p>
          <p className="mt-1 break-all font-mono text-xl font-bold tracking-wide text-navy">{slip.reference}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row print:hidden">
        <Button variant="outline" className="flex-1" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden />
          Print / save as PDF
        </Button>
        <Button className="flex-1" onClick={onDone}>
          Done
        </Button>
      </div>
    </section>
  )
}
