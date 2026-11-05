import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { TIME_ZONE } from './constants'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 'HH:MM:SS' -> '8:03 AM' (or '8:03:41 AM' with seconds). */
export function formatTime(t: string | null | undefined, withSeconds = false): string {
  if (!t) return '—'
  const [hStr, m, s] = t.split(':')
  const h24 = Number(hStr)
  const suffix = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${h12}:${m}${withSeconds && s ? `:${s.slice(0, 2)}` : ''} ${suffix}`
}

/** 'YYYY-MM-DD' -> 'November 5, 2026' (no time zone drift). */
export function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/** Current date/time in Asia/Manila as 'YYYY-MM-DD' and 'HH:MM:SS'. */
export function manilaNow(date: Date = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  }
}

/**
 * Converts a server expiry into a local epoch-ms value using the server's own clock
 * as the reference, so a wrong device clock cannot skew the countdown.
 */
export function toLocalExpiry(expiresAtIso: string, serverNowIso: string): number {
  return Date.now() + (Date.parse(expiresAtIso) - Date.parse(serverNowIso))
}
