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
      setRotate
