'use client'

import { useMemo, useState } from 'react'
import { ArrowDownUp, Download, Radio, Search, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/status-badge'
import { downloadCsv } from '@/lib/csv'
import type { RowStatus } from '@/lib/types'
import { cn, formatDate, formatTime } from '@/lib/utils'

export interface AttendanceRow {
  student_num: string
  name: string
  status: RowStatus
  time_scanned: string | null
  log_id: number | null
}

interface SessionMeta {
  subject: string
  room: string
  session_date: string
}

interface AttendanceTableProps {
  rows: AttendanceRow[]
  session: SessionMeta
  /** student_nums that just checked in; their rows animate in. */
  highlightIds?: Set<string>
  /** True while the Supabase Realtime channel is subscribed. */
  live?: boolean
  loading?: boolean
  /** Apply a manual status override. Throw to surface an error under the toolbar. */
  onStatusChange: (row: AttendanceRow, next: RowStatus) => Promise<void>
}

const STATUSES: RowStatus[] = ['Present', 'Late', 'Excused', 'Absent']
type Filter = 'All' | RowStatus
type SortMode = 'recent' | 'name'

/** Pressed-state colours for the override toggle (all AA on their backgrounds). */
const PRESSED: Record<RowStatus, string> = {
  Present: 'bg-success-strong text-white',
  Late: 'bg-amber-700 text-white',
  Excused: 'bg-brand text-white',
  Absent: 'bg-danger-strong text-white',
}

function StatusToggle({
  row,
  disabled,
  onChange,
}: {
  row: AttendanceRow
  disabled: boolean
  onChange: (next: RowStatus) => void
}) {
  return (
    <div
      role="group"
      aria-label={`Set status for ${row.name}`}
      className="inline-flex overflow-hidden rounded-xl border border-slate-300 bg-white"
    >
      {STATUSES.map((s) => {
        const pressed = row.status === s
        return (
          <button
            key={s}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => !pressed && onChange(s)}
            className={cn(
              'min-h-[44px] min-w-[44px] border-r border-slate-200 px-3 text-xs font-semibold transition-colors duration-150 last:border-r-0',
              'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
              'disabled:cursor-not-allowed disabled:opacity-50',
              pressed ? PRESSED[s] : 'text-slate-700 hover:bg-slate-100 active:bg-slate-200'
            )}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}

export function AttendanceTable({ rows, session, highlightIds, live, loading, onStatusChange }: AttendanceTableProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('All')
  const [sort, setSort] = useState<SortMode>('recent')
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { Present: 0, Late: 0, Excused: 0, Absent: 0 }
    rows.forEach((r) => (c[r.status] += 1))
    return c
  }, [rows])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = rows.filter(
      (r) =>
        (filter === 'All' || r.status === filter) &&
        (!q || r.name.toLowerCase().includes(q) || r.student_num.toLowerCase().includes(q))
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'recent') {
        // Latest scans first, then people with no scan time, alphabetically.
        if (a.time_scanned && b.time_scanned) return b.time_scanned.localeCompare(a.time_scanned)
        if (a.time_scanned) return -1
        if (b.time_scanned) return 1
      }
      return a.name.localeCompare(b.name)
    })
  }, [rows, query, filter, sort])

  async function change(row: AttendanceRow, next: RowStatus) {
    setError(null)
    setBusyIds((prev) => new Set(prev).add(row.student_num))
    try {
      await onStatusChange(row, next)
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not update ${row.name}.`)
    } finally {
      setBusyIds((prev) => {
        const nextSet = new Set(prev)
        nextSet.delete(row.student_num)
        return nextSet
      })
    }
  }

  function exportCsv() {
    const header = ['Student Number', 'Name', 'Status', 'Time Scanned', 'Session Date', 'Subject', 'Room']
    const body = [...rows]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => [r.student_num, r.name, r.status, r.time_scanned ?? '', session.session_date, session.subject, session.room])
    const slug = session.subject.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
    downloadCsv(`attendance_${slug}_${session.session_date}.csv`, [header, ...body])
  }

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: 'All', label: 'All', count: rows.length },
    ...STATUSES.map((s) => ({ id: s as Filter, label: s, count: counts[s] })),
  ]

  return (
    <section className="card" aria-label="Live attendance grid">
      {/* Toolbar */}
      <div className="space-y-4 border-b border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-navy">
              Live attendance
              {live !== undefined && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                    live ? 'bg-success-soft text-success-strong' : 'bg-slate-100 text-slate-600'
                  )}
                >
                  <Radio className={cn('h-3.5 w-3.5', live && 'animate-pulse')} aria-hidden />
                  {live ? 'Live' : 'Connecting…'}
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-600">
              {counts.Present + counts.Late + counts.Excused} of {rows.length} accounted for · {formatDate(session.session_date)}
            </p>
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0} title="Exports the full class list for this session">
            <Download className="h-4 w-4" aria-hidden />
            Export to CSV
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or student number"
              aria-label="Search students"
              className="pl-10"
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => setSort((s) => (s === 'recent' ? 'name' : 'recent'))}
            aria-label={`Sorted by ${sort === 'recent' ? 'latest scan' : 'name'}. Click to change.`}
          >
            <ArrowDownUp className="h-4 w-4" aria-hidden />
            {sort === 'recent' ? 'Latest first' : 'A–Z'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={filter === chip.id}
              onClick={() => setFilter(chip.id)}
              className={cn(
                'inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                filter === chip.id
                  ? 'border-navy bg-navy text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-navy hover:bg-slate-50 active:bg-slate-100'
              )}
            >
              {chip.label}
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs tabular-nums',
                  filter === chip.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                )}
              >
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}
      </div>

      {loading ? (
        <p className="p-8 text-center text-sm text-slate-600" role="status">
          Loading attendance…
        </p>
      ) : visible.length === 0 ? (
        <p className="p-8 text-center text-sm text-slate-600">
          {rows.length === 0 ? 'No students on the class list yet.' : 'No students match your search or filter.'}
        </p>
      ) : (
        <>
          {/* Desktop / tablet: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Student no.</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Name</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Time</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((row) => (
                  <tr
                    key={row.student_num}
                    className={cn('transition-colors hover:bg-slate-50', highlightIds?.has(row.student_num) && 'animate-pop-in')}
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 font-mono text-slate-700">{row.student_num}</td>
                    <td className="px-5 py-2.5 font-medium text-slate-900">{row.name}</td>
                    <td className="px-5 py-2.5"><StatusBadge status={row.status} /></td>
                    <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-slate-700">{formatTime(row.time_scanned, true)}</td>
                    <td className="px-5 py-2.5">
                      <StatusToggle row={row} disabled={busyIds.has(row.student_num)} onChange={(next) => void change(row, next)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <ul className="divide-y divide-slate-100 md:hidden">
            {visible.map((row) => (
              <li
                key={row.student_num}
                className={cn('space-y-3 p-4', highlightIds?.has(row.student_num) && 'animate-pop-in')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{row.name}</p>
                    <p className="font-mono text-xs text-slate-600">
                      {row.student_num} · {formatTime(row.time_scanned, true)}
                    </p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <StatusToggle row={row} disabled={busyIds.has(row.student_num)} onChange={(next) => void change(row, next)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
