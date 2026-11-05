'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Eye, EyeOff, GraduationCap, Presentation, QrCode, ShieldCheck, TriangleAlert, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { REMEMBER_KEY, supabase } from '@/lib/supabaseClient'
import type { Profile, Role } from '@/lib/types'
import { cn } from '@/lib/utils'

const ROLE_COPY: Record<Role, { label: string; field: string; placeholder: string; type: string; autoComplete: string }> = {
  student: {
    label: 'Student',
    field: 'Student number',
    placeholder: 'e.g. 2023101001',
    type: 'text',
    autoComplete: 'username',
  },
  instructor: {
    label: 'Instructor',
    field: 'Institutional email',
    placeholder: 'name@bulsu.edu.ph',
    type: 'email',
    autoComplete: 'email',
  },
}

const GENERIC_AUTH_ERROR = 'Those credentials did not match. Check them and try again.'

/** Turns the typed identifier into a sign-in e-mail (students log in with a student number). */
async function resolveEmail(role: Role, identifier: string): Promise<string | null> {
  const value = identifier.trim()
  if (!value) return null
  if (role === 'instructor') return value
  const { data, error } = await supabase.rpc('student_login_email', { p_student_num: value })
  return error || !data ? null : (data as string)
}

export default function LoginPage() {
  const router = useRouter()
  const [role, setRole] = useState<Role>('student')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recoveryOpen, setRecoveryOpen] = useState(false)

  const copy = ROLE_COPY[role]

  function switchRole(next: Role) {
    setRole(next)
    setIdentifier('')
    setError(null)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Must be set BEFORE signing in so the session lands in the right storage.
      window.localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')

      const email = await resolveEmail(role, identifier)
      if (!email) throw new Error(GENERIC_AUTH_ERROR)

      const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError) throw new Error(GENERIC_AUTH_ERROR)

      const { data } = await supabase.rpc('my_profiles')
      if (!(data as Profile[] | null)?.some((p) => p.role === role)) {
        await supabase.auth.signOut()
        throw new Error(`This account is not registered as ${role === 'student' ? 'a student' : 'an instructor'}.`)
      }
      router.replace(`/${role}/dashboard`)
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_AUTH_ERROR)
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/40 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <QrCode className="h-7 w-7" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-2xl font-bold tracking-tight">Attendo</p>
            <p className="text-sm text-blue-100">Smart Attendance Monitoring System</p>
          </div>
        </div>

        <div className="relative max-w-md space-y-8">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Attendance, verified in seconds.</h1>
          <ul className="space-y-5 text-blue-50">
            {[
              { Icon: QrCode, title: 'Rotating QR codes', body: 'A fresh code every minute, so a shared screenshot is useless.' },
              { Icon: Zap, title: 'Live roll call', body: 'Instructors watch students check in as it happens.' },
              { Icon: ShieldCheck, title: 'Server-verified', body: 'Every scan is validated against the active session.' },
            ].map(({ Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-blue-100">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-blue-100">Bulacan State University · College of Engineering · Computer Engineering Department</p>
      </aside>

      {/* Form panel */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white">
              <QrCode className="h-6 w-6" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-xl font-bold text-navy">Attendo</p>
              <p className="text-xs text-slate-600">BulSU Computer Engineering</p>
            </div>
          </div>

          <div className="card p-6 sm:p-8">
            <h2 className="text-2xl font-bold text-navy">Sign in</h2>
            <p className="mt-1 text-sm text-slate-600">Choose how you use Attendo.</p>

            <div role="tablist" aria-label="Account type" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1.5">
              {(['student', 'instructor'] as const).map((r) => {
                const Icon = r === 'student' ? GraduationCap : Presentation
                return (
                  <button
                    key={r}
                    type="button"
                    role="tab"
                    aria-selected={role === r}
                    onClick={() => switchRole(r)}
                    className={cn(
                      'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                      role === r ? 'bg-white text-navy shadow-sm' : 'text-slate-600 hover:bg-white/60 hover:text-navy'
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {ROLE_COPY[r].label}
                  </button>
                )
              })}
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
              <div>
                <label htmlFor="identifier" className="mb-2 block text-sm font-semibold text-navy">
                  {copy.field}
                </label>
                <Input
                  id="identifier"
                  name="identifier"
                  type={copy.type}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={copy.placeholder}
                  autoComplete={copy.autoComplete}
                  required
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold text-navy">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-14"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-5 w-5 rounded border-slate-400 accent-navy"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  onClick={() => setRecoveryOpen(true)}
                  className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-semibold text-brand underline-offset-4 transition-colors hover:text-brand-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!identifier.trim() || !password}>
                Sign in as {copy.label.toLowerCase()}
              </Button>
            </form>
          </div>
        </div>
      </section>

      <RecoveryDialog open={recoveryOpen} onOpenChange={setRecoveryOpen} role={role} />
    </main>
  )
}

function RecoveryDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: Role
}) {
  const copy = ROLE_COPY[role]
  const [identifier, setIdentifier] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setIdentifier('')
      setSent(false)
      setError(null)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const email = await resolveEmail(role, identifier)
      if (email) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (resetError) throw resetError
      }
      // Same message whether or not the account exists, so this can't be used to probe accounts.
      setSent(true)
    } catch {
      setError('We could not send the reset link right now. Please try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {sent ? (
          <div className="py-2 text-center">
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
              <CheckCircle2 className="h-8 w-8 text-success-strong" aria-hidden />
            </span>
            <DialogTitle className="text-center">Check your email</DialogTitle>
            <DialogDescription className="mt-2 text-center">
              If that {role === 'student' ? 'student number' : 'email'} is registered, a password reset link is on its way.
            </DialogDescription>
            <Button className="mt-6 w-full" onClick={() => handleOpenChange(false)}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Reset your password</DialogTitle>
              <DialogDescription>
                Enter your {copy.field.toLowerCase()} and we&apos;ll email you a link to choose a new password.
              </DialogDescription>
            </DialogHeader>
            <label htmlFor="recovery-identifier" className="mb-2 block text-sm font-semibold text-navy">
              {copy.field}
            </label>
            <Input
              id="recovery-identifier"
              type={copy.type}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={copy.placeholder}
              autoComplete={copy.autoComplete}
              required
            />
            {error && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={!identifier.trim()}>
                Send reset link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
