'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Clock, MapPin, Play, Power, TriangleAlert } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AttendanceTable, type AttendanceRow } from '@/components/attendance-table'
import { LoadingScreen } from '@/components/loading-screen'
import { QrGenerator } from '@/components/qr-generator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRequireRole } from '@/hooks/use-auth'
import { TOKEN_TTL_SECONDS } from '@/lib/constants'
import { friendlyError } from '@/lib/errors'
import { supabase } from '@/lib/supabaseClient'
import type { AttendanceLog, ClassSession, RowStatus, Student, TokenResult } from '@/lib/types'
import { cn, formatDate, formatTime, manilaNow, toLocalExpiry } from '@/lib/utils'

interface LiveToken {
  sessionId: number
  token: string
  expiresAtMs: number
}

const SUBJECT_SUGGESTIONS = ['CPE 301 - Differential Equation', 'CPE 304L - Software Design']

/** HH:MM for "now + minutes" in Asia/Manila, clamped to the same day. */
function manilaHHMM(plusMinutes = 0): string {
  const base = manilaNow()
  const shifted = manilaNow(new Date(Date.now() + plusMinutes * 60_000))
  return (shifted.date === base.date ? shifted.time : '23:59:00').slice(0, 5)
}

export default function InstructorDashboardPage() {
  const { loading, profile, signOut } = useRequireRole('instructor')

  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [roster, setRoster] = useState<Student[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [logs, setLogs] = useState<Record<string, AttendanceLog>>({})
  const [logsLoading, setLogsLoading] = useState(false)
  const [live, setLive] = useState(false)
  const [highlight, setHighlight] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)

  const [token, setToken] = useState<LiveToken | null>(null)
  const [rotateError, setRotateError] = useState<string | null>(null)
  const rotatingRef = useRef(false)
  const lastAttemptRef = useRef(0)

  const selected = useMemo(() => sessions.find((s) => s.session_id === selectedId) ?? null, [sessions, selectedId])

  /* ---------- Initial data ---------- */
  const loadSessions = useCallback(async (selectId?: number) => {
    const { data, error } = await supabase
      .from('class_sessions')
      .select('*')
      .order('session_date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(30)
    if (error) {
      setLoadError('Could not load your sessions.')
      return
    }
    const list = (data ?? []) as ClassSession[]
    setSessions(list)
    setSelectedId((current) => selectId ?? current ?? list.find((s) => s.is_active)?.session_id ?? list[0]?.session_id ?? null)
  }, [])

  useEffect(() => {
    if (loading) return
    void loadSessions()
    void supabase
      .from('students')
      .select('student_num, name, email')
      .order('name')
      .then(({ data, error }) => {
        if (error) setLoadError('Could not load the class list.')
        else setRoster((data ?? []) as Student[])
      })
  }, [loading, loadSessions])

  /* ---------- Rotating token ---------- */
  const rotate = useCallback(async (sessionId: number) => {
    if (rotatingRef.current) return
    rotatingRef.current = true
    lastAttemptRef.current = Date.now()
    try {
      const { data, error } = await supabase.rpc('rotate_session_token', {
        p_session_id: sessionId,
        p_ttl_seconds: TOKEN_TTL_SECONDS,
      })
      if (error || !data) throw error ?? new Error('empty')
      const r = data as TokenResult
      setToken({ sessionId, token: r.token, expiresAtMs: toLocalExpiry(r.expires_at, r.server_now) })
      setRotateError(null)
    } catch {
      setRotateError('Could not refresh the code. Retrying…')
    } finally {
      rotatingRef.current = false
    }
  }, [])

  // Issue a fresh, server-timed code whenever an active session is opened.
  useEffect(() => {
    setToken(null)
    setRotateError(null)
    if (selected?.is_active) void rotate(selected.session_id)
  }, [selected?.session_id, selected?.is_active, rotate])

  // Rotate just before the current code expires (retry at most every 3 s on failure).
  useEffect(() => {
    if (!token) return
    const id = setInterval(() => {
      if (Date.now() >= token.expiresAtMs - 500 && Date.now() - lastAttemptRef.current > 3000) {
        void rotate(token.sessionId)
      }
    }, 500)
    return () => clearInterval(id)
  }, [token, rotate])

  /* ---------- Logs + Realtime ---------- */
  const pushHighlight = useCallback((studentNum: string) => {
    setHighlight((prev) => new Set(prev).add(studentNum))
    setTimeout(() => {
      setHighlight((prev) => {
        const next = new Set(prev)
        next.delete(studentNum)
        return next
      })
    }, 6000)
  }, [])

  useEffect(() => {
    if (selectedId == null) {
      setLogs({})
      return
    }
    let cancelled = false
    setLogsLoading(true)
    setLogs({})

    void supabase
      .from('attendance_logs')
      .select('*')
      .eq('session_id', selectedId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setLoadError('Could not load attendance.')
        const map: Record<string, AttendanceLog> = {}
        ;((data ?? []) as AttendanceLog[]).forEach((l) => (map[l.student_num] = l))
        setLogs(map)
        setLogsLoading(false)
      })

    // DELETE events can't be filtered server-side, so listen unfiltered and match locally.
    // Row Level Security already limits events to this instructor's own sessions.
    const channel = supabase
      .channel(`attendance-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as Partial<AttendanceLog>).log_id
          setLogs((prev) => {
            const next = { ...prev }
            for (const key of Object.keys(next)) if (next[key].log_id === oldId) delete next[key]
            return next
          })
          return
        }
        const row = payload.new as AttendanceLog
        if (row.session_id !== selectedId) return
        setLogs((prev) => ({ ...prev, [row.student_num]: row }))
        if (payload.eventType === 'INSERT') pushHighlight(row.student_num)
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'))

    return () => {
      cancelled = true
      setLive(false)
      void supabase.removeChannel(channel)
    }
  }, [selectedId, pushHighlight])

  /* ---------- Grid rows + overrides ---------- */
  const rows: AttendanceRow[] = useMemo(
    () =>
      roster.map((s) => {
        const log = logs[s.student_num]
        return {
          student_num: s.student_num,
          name: s.name,
          status: (log?.status ?? 'Absent') as RowStatus,
          time_scanned: log?.time_scanned ?? null,
          log_id: log?.log_id ?? null,
        }
      }),
    [roster, logs]
  )

  async function changeStatus(row: AttendanceRow, next: RowStatus) {
    if (!selected) return
    if (next === 'Absent') {
      if (row.log_id == null) return
      const { error } = await supabase.from('attendance_logs').delete().eq('log_id', row.log_id)
      if (error) throw new Error(`Could not mark ${row.name} absent.`)
      setLogs((prev) => {
        const copy = { ...prev }
        delete copy[row.student_num]
        return copy
      })
      return
    }
    if (row.log_id != null) {
      const { data, error } = await supabase
        .from('attendance_logs')
        .update({ status: next })
        .eq('log_id', row.log_id)
        .select()
        .single()
      if (error) throw new Error(`Could not update ${row.name}.`)
      setLogs((prev) => ({ ...prev, [row.student_num]: data as AttendanceLog }))
      return
    }
    const now = manilaNow()
    const { data, error } = await supabase
      .from('attendance_logs')
      .insert({
        session_id: selected.session_id,
        student_num: row.student_num,
        status: next,
        date_scanned: now.date,
        time_scanned: now.time,
      })
      .select()
      .single()
    if (error) throw new Error(`Could not update ${row.name}.`)
    setLogs((prev) => ({ ...prev, [row.student_num]: data as AttendanceLog }))
  }

  async function endSession() {
    if (!selected) return
    const { error } = await supabase.from('class_sessions').update({ is_active: false }).eq('session_id', selected.session_id)
    if (error) {
      setRotateError('Could not end the session. Please try again.')
      return
    }
    setToken(null)
    await loadSessions()
  }

  if (loading) return <LoadingScreen label="Loading your dashboard…" />

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader name={profile?.name} roleLabel="Instructor" onSignOut={signOut} />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <div>
          <h1 className="text-2xl font-bold text-navy sm:text-3xl">Instructor dashboard</h1>
          <p className="mt-1 text-slate-600">Launch a session, show the rotating QR code and watch students check in live.</p>
        </div>

        {loadError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-4 text-sm font-medium text-danger-strong">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {loadError}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[24rem_1fr] lg:items-start">
          {/* Left: launcher + QR */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <SessionPicker sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />

            {selected?.is_active ? (
              <section className="card space-y-5 p-5" aria-label="Active session">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-success-strong">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
                      Session active
                    </span>
                    <h2 className="text-lg font-bold text-navy">{selected.subject}</h2>
                    <SessionMeta session={selected} />
                  </div>
                </div>

                {token ? (
                  <QrGenerator
                    sessionId={token.sessionId}
                    token={token.token}
                    expiresAtMs={token.expiresAtMs}
                    ttlSeconds={TOKEN_TTL_SECONDS}
                    subject={selected.subject}
                    room={selected.room}
                  />
                ) : (
                  <div className="aspect-square animate-pulse rounded-xl bg-slate-200" role="status" aria-label="Generating code" />
                )}

                {rotateError && (
                  <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-800">
                    {rotateError}
                  </p>
                )}

                <Button variant="destructive" className="w-full" onClick={() => void endSession()}>
                  <Power className="h-4 w-4" aria-hidden />
                  End session
                </Button>
              </section>
            ) : selected ? (
              <section className="card space-y-2 p-5" aria-label="Past session">
                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                  Session ended
                </span>
                <h2 className="text-lg font-bold text-navy">{selected.subject}</h2>
                <SessionMeta session={selected} />
                <p className="pt-1 text-sm text-slate-600">You can still review and correct attendance for this session.</p>
              </section>
            ) : null}

            <SessionLauncher
              defaultSubject={SUBJECT_SUGGESTIONS[0]}
              onStarted={async (r) => {
                await loadSessions(r.session_id)
              }}
            />
          </div>

          {/* Right: live grid */}
          <div>
            {selected ? (
              <AttendanceTable
                rows={rows}
                session={{ subject: selected.subject, room: selected.room, session_date: selected.session_date }}
                highlightIds={highlight}
                live={selected.is_active ? live : undefined}
                loading={logsLoading}
                onStatusChange={changeStatus}
              />
            ) : (
              <section className="card p-10 text-center">
                <p className="font-semibold text-navy">No session selected</p>
                <p className="mt-1 text-sm text-slate-600">Start a session to see the live attendance grid.</p>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function SessionMeta({ session }: { session: ClassSession }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
      <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden />{session.room}</span>
      <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden />{formatDate(session.session_date)}</span>
      <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden />{formatTime(session.start_time)} – {formatTime(session.end_time)}</span>
    </p>
  )
}

function SessionPicker({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: ClassSession[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  if (sessions.length === 0) return null
  return (
    <div className="card p-4">
      <label htmlFor="session-picker" className="mb-2 block text-sm font-semibold text-navy">
        Session
      </label>
      <select
        id="session-picker"
        value={selectedId ?? ''}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition-colors hover:border-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        {sessions.map((s) => (
          <option key={s.session_id} value={s.session_id}>
            {s.is_active ? '● ' : ''}
            {s.subject} · {formatDate(s.session_date)}
          </option>
        ))}
      </select>
    </div>
  )
}

function SessionLauncher({
  defaultSubject,
  onStarted,
}: {
  defaultSubject: string
  onStarted: (result: TokenResult) => Promise<void>
}) {
  const [subject, setSubject] = useState(defaultSubject)
  const [room, setRoom] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Defaults depend on the current time, so set them after mount to avoid a hydration mismatch.
  useEffect(() => {
    setStart(manilaHHMM(0))
    setEnd(manilaHHMM(90))
  }, [])

  async function launch(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (end <= start) return setError('End time must be later than start time.')
    setBusy(true)
    const { data, error: rpcError } = await supabase.rpc('start_session', {
      p_subject: subject,
      p_room: room,
      p_start: `${start}:00`,
      p_end: `${end}:00`,
      p_ttl_seconds: TOKEN_TTL_SECONDS,
    })
    if (rpcError || !data) {
      setError(friendlyError(rpcError))
      setBusy(false)
      return
    }
    await onStarted(data as TokenResult)
    setBusy(false)
  }

  return (
    <form onSubmit={launch} className="card space-y-4 p-5" aria-label="Start a new session">
      <h2 className="text-lg font-bold text-navy">Start a new session</h2>

      <div>
        <label htmlFor="subject" className="mb-2 block text-sm font-semibold text-navy">Subject</label>
        <Input id="subject" list="subject-suggestions" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={100} required />
        <datalist id="subject-suggestions">
          {SUBJECT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
        </datalist>
      </div>

      <div>
        <label htmlFor="room" className="mb-2 block text-sm font-semibold text-navy">Room</label>
        <Input id="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. ENG-204" maxLength={50} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="start" className="mb-2 block text-sm font-semibold text-navy">Starts</label>
          <Input id="start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="end" className="mb-2 block text-sm font-semibold text-navy">Ends</label>
          <Input id="end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>
      </div>

      <p className="text-xs text-slate-600">Students who scan more than 15 minutes after the start time are marked Late.</p>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button type="submit" variant="brand" size="lg" className={cn('w-full')} loading={busy} disabled={!subject.trim() || !room.trim() || !start || !end}>
        <Play className="h-4 w-4" aria-hidden />
        Launch session
      </Button>
    </form>
  )
}
