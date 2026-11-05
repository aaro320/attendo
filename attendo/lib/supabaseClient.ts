import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** localStorage flag written by the login form's "Remember me" checkbox. */
export const REMEMBER_KEY = 'attendo.remember'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Keep the module importable during `next build` / prerender without env vars.
  console.warn(
    '[Attendo] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Copy .env.example to .env.local.'
  )
}

const isBrowser = typeof window !== 'undefined'

/**
 * Session storage that honours "Remember me":
 *  - checked   -> persisted in localStorage (survives closing the browser)
 *  - unchecked -> kept in sessionStorage (cleared when the tab/browser closes)
 */
const rememberAwareStorage = {
  getItem(key: string): string | null {
    if (!isBrowser) return null
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
  },
  setItem(key: string, value: string): void {
    if (!isBrowser) return
    const remember = window.localStorage.getItem(REMEMBER_KEY) !== '0'
    const target = remember ? window.localStorage : window.sessionStorage
    const other = remember ? window.sessionStorage : window.localStorage
    target.setItem(key, value)
    other.removeItem(key)
  },
  removeItem(key: string): void {
    if (!isBrowser) return
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  },
}

export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // needed for the password-recovery link
      storage: rememberAwareStorage,
      storageKey: 'attendo-auth',
    },
    realtime: { params: { eventsPerSecond: 10 } },
  }
)
