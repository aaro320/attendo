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

const SUBJECT_SUGGESTIONS = [
  'CPE 301 - Differential Equation',
  'CPE 304L - Software Design',
  'CPE 302h - Operating System',
  'CPE 309a - Calculus 3',
]

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

  // Creation form state
  const [subject, setSubject] = useState(SUBJECT_SUGGESTIONS[0])
  const [date, setDate] = useState(() => manilaNow().date)
  const [startTime, setStartTime] = useState(() => manilaHHMM(0))
  const [endTime, setEndTime] = useState(() => manilaHHMM(90))
  const [room, setRoom] = useState('COE Lab 3')
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Automatically treats a session as active if its date matches today in Asia/Manila
  const selected = useMemo(() => {
    const base = sessions.find((s) => s.session_id === selectedId) ?? null
    if (!base) return null
    const today = manilaNow().date
    const isToday = base.session_date === today
    return {
      ...base,
      is_active: Boolean(base.is_active || isToday),
    }
  }, [sessions, selectedId])

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

  // Background sync: updates the database row to active if today's date matches
  useEffect(() => {
    if (!selected) return
    const today = manilaNow().date
    const isTargetDate = selected.session_date === today
    const rawMatch = sessions.find((s) => s.session_id === selected.session_id)

    if (isTargetDate && rawMatch && !rawMatch.is_active) {
      void supabase
        .from('class_sessions')
        .update({ is_active: true })
        .eq('session_id', selected.session_id)
        .then(() => {
          setSessions((prev) =>
            prev.map((s) => (s.session_id === selected.session_id ? { ...s, is_active: true } : s))
          )
        })
    }
  }, [selected, sessions])

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
      setRotateError('Could not issue a QR code token. Check your network or permissions.')
    } finally {
      rotatingRef.current = false
    }
  }, [])

  // Auto-rotate when selecting an active session
  useEffect(() => {
    if (!selected || !selected.is_active) {
      setToken(null)
      return
    }
    void rotate(selected.session_id)
  }, [selected?.session_id, selected?.is_active, rotate])

  /* ---------- Attendance logs ---------- */
  const loadLogs = useCallback(async (sessionId: number) => {
    setLogsLoading(true)
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('*')
      .eq('session_id', sessionId)
    setLogsLoading(false)
    if (error) {
      setLoadError('Failed to load attendance logs.')
      return
    }
    const map: Record<string, AttendanceLog> = {}
    for (const row of (data ?? []) as AttendanceLog[]) {
      map[row.student_num] = row
    }
    setLogs(map)
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setLogs({})
      return
    }
    void loadLogs(selectedId)
  }, [selectedId, loadLogs])

  // Realtime subscription for attendance logs
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase
      .channel(`session-logs-${selectedId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_logs',
          filter: `session_id=eq.${selectedId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<AttendanceLog>
            if (oldRow.student_num) {
              setLogs((prev) => {
                const next = { ...prev }
                delete next[oldRow.student_num as string]
                return next
              })
            }
          } else {
            const newRow = payload.new as AttendanceLog
            setLogs((prev) => ({ ...prev, [newRow.student_num]: newRow }))
            setHighlight((prev) => new Set(prev).add(newRow.student_num))
            setTimeout(() => {
              setHighlight((prev) => {
                const copy = new Set(prev)
                copy.delete(newRow.student_num)
                return copy
              })
            }, 3000)
          }
        }
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED')
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [selectedId])

  /* ---------- Session actions ---------- */
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionError(null)
    setCreating(true)
    const { data, error } = await supabase
      .from('class_sessions')
      .insert({
        subject,
        session_date: date,
        start_time: startTime,
        end_time: endTime,
        room,
        is_active: true,
      })
      .select('*')
      .single()

    setCreating(false)
    if (error || !data) {
      setActionError(friendlyError(error))
      return
    }
    const created = data as ClassSession
    await loadSessions(created.session_id)
  }

  const handleToggleSession = async () => {
    if (!selected) return
    const nextActive = !selected.is_active
    const { error } = await supabase
      .from('class_sessions')
      .update({ is_active: nextActive })
      .eq('session_id', selected.session_id)
    if (error) {
      setActionError(friendlyError(error))
      return
    }
    setSessions((prev) =>
      prev.map((s) => (s.session_id === selected.session_id ? { ...s, is_active: nextActive } : s))
    )
  }

/* ---------- Row formatting for table ---------- */
  const rows: AttendanceRow[] = useMemo(() => {
    return roster.map((student) => {
      const entry = logs[student.student_num]
      let status: RowStatus = 'absent'
      if (entry) {
        status = entry.status === 'late' ? 'late' : 'present'
      }
      return {
        student_num: student.student_num,
        name: student.name,
        email: student.email,
        status,
        logged_at: entry?.logged_at ?? null,
        device_fingerprint: entry?.device_fingerprint ?? null,
        is_flagged: entry?.is_flagged ?? false,
        log_id: (entry as any)?.log_id ?? null,
        time_scanned: (entry as any)?.time_scanned ?? entry?.logged_at ?? null,
      } as AttendanceRow
    })
  }, [roster, logs])

  if (loading) return <LoadingScreen message="Loading dashboard..." />

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader profile={profile} onSignOut={signOut} live={live} />

      <main className="mx-auto max-w-7xl px-4 py-8">
        {loadError && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {actionError && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <TriangleAlert className="h-5 w-5 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Left panel: QR broadcast & controls */}
          <div className="space-y-6 lg:col-span-5">
            {/* Session details and QR display */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="font-bold text-primary">
                    {selected ? selected.subject : 'No Session Selected'}
                  </h2>
                  {selected && (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(selected.session_date)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTime(selected.start_time)} – {formatTime(selected.end_time)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {selected.room}
                      </span>
                    </div>
                  )}
                </div>

                {selected && (
                  <Button
                    variant={selected.is_active ? 'danger' : 'outline'}
                    size="sm"
                    onClick={handleToggleSession}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {selected.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                )}
              </div>

              <div className="mt-6 flex flex-col items-center">
                {selected && selected.is_active ? (
                  token ? (
                    <QrGenerator
                      token={token.token}
                      expiresAtMs={token.expiresAtMs}
                      intervalSec={TOKEN_TTL_SECONDS}
                      onExpire={() => rotate(selected.session_id)}
                    />
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-400">
                      Generating rotating QR...
                    </div>
                  )
                ) : (
                  <div className="flex h-64 w-64 flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-400">
                    <Power className="mb-2 h-8 w-8 text-slate-300" />
                    <span>Select or activate an ongoing session to broadcast dynamic QR codes.</span>
                  </div>
                )}

                {rotateError && (
                  <p className="mt-3 text-center text-xs text-rose-600">{rotateError}</p>
                )}
              </div>
            </div>

            {/* Quick Session Creator */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-bold text-slate-900">Create New Session</h3>
              <form onSubmit={handleCreateSession} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600">Subject</label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  >
                    {SUBJECT_SUGGESTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Date</label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">Room</label>
                    <Input
                      type="text"
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">Start Time</label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">End Time</label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <Button type="submit" disabled={creating} className="w-full">
                  <Play className="mr-1.5 h-4 w-4" />
                  {creating ? 'Starting Class...' : 'Start New Session'}
                </Button>
              </form>
            </div>
          </div>

          {/* Right panel: Attendance table & student roster */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900">Class Attendance</h3>
                  <p className="text-xs text-slate-500">
                    {roster.length} registered students • {Object.keys(logs).length} marked present
                  </p>
                </div>

                {sessions.length > 0 && (
                  <select
                    value={selectedId ?? ''}
                    onChange={(e) => setSelectedId(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:border-primary focus:outline-none"
                  >
                    {sessions.map((s) => (
                      <option key={s.session_id} value={s.session_id}>
                        {s.subject} ({formatDate(s.session_date)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="mt-4">
                <AttendanceTable
                  rows={rows}
                  loading={logsLoading}
                  highlighted={highlight}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
