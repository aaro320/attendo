'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, GraduationCap, Mail, Presentation, QrCode, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { registrationMessage } from '@/lib/errors'
import { REMEMBER_KEY, supabase } from '@/lib/supabaseClient'
import type { Profile, Role } from '@/lib/types'
import { cn } from '@/lib/utils'

const MIN_PASSWORD = 8
/** Must match Supabase > Authentication > Sign In / Providers > Email > "Email OTP Length" (default 6). */
const OTP_LENGTH = 6
const RESEND_SECONDS = 60

const ROLE_COPY: Record<Role, { label: string; emailLabel: string; emailPlaceholder: string }> = {
  student: { label: 'Student', emailLabel: 'Gmail / email address', emailPlaceholder: 'name@gmail.com' },
  instructor: { label: 'Instructor', emailLabel: 'Institutional email', emailPlaceholder: 'name@bulsu.edu.ph' },
}

const ALREADY_EXISTS = 'An account with this email already exists. Sign in instead.'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<'form' | 'code'>('form')
  const [role, setRole] = useState<Role>('student')
  const [studentNum, setStudentNum] = useState('')
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 2: e-mailed code
  const [pendingEmail, setPendingEmail] = useState('')
  const [code, setCode] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [resent, setResent] = useState(false)

  const copy = ROLE_COPY[role]

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  function switchRole(next: Role) {
    setRole(next)
    setError(null)
  }

  /** Signed in with a verified e-mail: make sure the profile exists, then open the dashboard. */
  async function finish() {
    const { data: profiles } = await supabase.rpc('my_profiles')
    if (!(profiles as Profile[] | null)?.some((p) => p.role === role)) {
      await supabase.auth.signOut()
      throw new Error(
        'Your email was verified, but we could not finish creating your profile. The student number may already be taken. Please contact your instructor.'
      )
    }
    router.replace(`/${role}/dashboard`)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`)
    if (password !== confirm) return setError('The two passwords do not match.')

    const cleanEmail = email.trim().toLowerCase()
    // Names are stored "Surname, Given Names", matching the class list.
    const fullName = `${lastName.trim()}, ${firstName.trim()}`

    setBusy(true)
    try {
      // 1. Friendly pre-check (the database re-checks everything when the e-mail is verified).
      const { data: verdict, error: checkError } = await supabase.rpc('validate_registration', {
        p_role: role,
        p_email: cleanEmail,
        p_student_num: role === 'student' ? studentNum.trim() : null,
        p_name: fullName,
        p_access_code: role === 'instructor' ? accessCode.trim() : null,
      })
      if (checkError) throw new Error(registrationMessage(null))
      if (verdict !== 'OK') throw new Error(registrationMessage(verdict as string))

      // 2. Create the account. Supabase e-mails a verification code to this address.
      window.localStorage.setItem(REMEMBER_KEY, '1')
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            role,
            name: fullName,
            student_num: role === 'student' ? studentNum.trim() : undefined,
            access_code: role === 'instructor' ? accessCode.trim() : undefined,
          },
        },
      })
      if (signUpError) {
        throw new Error(/already|registered|exists/i.test(signUpError.message) ? ALREADY_EXISTS : registrationMessage(null))
      }
      // With e-mail confirmation on, an existing address comes back as a user with no identities.
      if (data.user && data.user.identities?.length === 0) throw new Error(ALREADY_EXISTS)

      // 3a. E-mail confirmation is switched off in Supabase: already signed in.
      if (data.session) {
        await finish()
        return
      }

      // 3b. Ask for the code that was just e-mailed.
      setPendingEmail(cleanEmail)
      setCode('')
      setResent(false)
      setCooldown(RESEND_SECONDS)
      setStep('code')
      setBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : registrationMessage(null))
      setBusy(false)
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (code.length !== OTP_LENGTH) return setError(`Enter the ${OTP_LENGTH}-digit code from your email.`)

    setBusy(true)
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: code,
        type: 'signup',
      })
      if (verifyError || !data.session) {
        throw new Error('That code is incorrect or has expired. Check it, or send yourself a new code.')
      }
      await finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify the code. Please try again.')
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    setResent(false)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    if (resendError) {
      setError('We could not send a new code yet. Wait a minute and try again.')
      return
    }
    setResent(true)
    setCode('')
    setCooldown(RESEND_SECONDS)
  }

  const ready =
    lastName.trim() &&
    firstName.trim() &&
    email.trim() &&
    password &&
    confirm &&
    (role === 'student' ? studentNum.trim() : accessCode.trim())

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg animate-fade-up">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white">
            <QrCode className="h-6 w-6" aria-hidden />
          </span>
          <div className="leading-tight">
            <p className="text-xl font-bold text-navy">Attendo</p>
            <p className="text-xs text-slate-600">BulSU Computer Engineering</p>
          </div>
        </div>

        <div className="card p-6 sm:p-8">
          {step === 'code' ? (
            <form onSubmit={onVerify} noValidate>
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Mail className="h-7 w-7" aria-hidden />
              </span>
              <h1 className="text-2xl font-bold text-navy">Enter your verification code</h1>
              <p className="mt-2 text-sm text-slate-600">
                We emailed a {OTP_LENGTH}-digit code to <span className="font-semibold text-slate-900">{pendingEmail}</span>.
                It can take a minute. Check your spam folder too.
              </p>

              <label htmlFor="otp" className="mb-2 mt-6 block text-sm font-semibold text-navy">
                {OTP_LENGTH}-digit code
              </label>
              <Input
                id="otp"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={OTP_LENGTH}
                placeholder="123456"
                className="h-14 text-center font-mono text-2xl font-bold tracking-[0.5em]"
              />

              {resent && !error && (
                <p role="status" className="mt-3 rounded-xl bg-success-soft p-3 text-sm text-success-strong">
                  A new code was sent. Use the newest one.
                </p>
              )}
              {error && (
                <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="mt-6 w-full" loading={busy} disabled={code.length !== OTP_LENGTH}>
                Verify and create account
              </Button>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="flex-1" onClick={() => void resend()} disabled={cooldown > 0 || busy}>
                  {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setError(null)
                    setStep('form')
                  }}
                  disabled={busy}
                >
                  Use a different email
                </Button>
              </div>
            </form>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-navy">Create your account</h1>
              <p className="mt-1 text-sm text-slate-600">We will email you a code to verify your address.</p>

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
                {role === 'student' && (
                  <div>
                    <label htmlFor="student-num" className="mb-2 block text-sm font-semibold text-navy">
                      Student number
                    </label>
                    <Input
                      id="student-num"
                      value={studentNum}
                      onChange={(e) => setStudentNum(e.target.value)}
                      placeholder="e.g. 2023101001"
                      autoComplete="off"
                      maxLength={20}
                      required
                    />
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="last-name" className="mb-2 block text-sm font-semibold text-navy">
                      Last name
                    </label>
                    <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" maxLength={50} required />
                  </div>
                  <div>
                    <label htmlFor="first-name" className="mb-2 block text-sm font-semibold text-navy">
                      First name(s)
                    </label>
                    <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" maxLength={50} required />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-semibold text-navy">
                    {copy.emailLabel}
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={copy.emailPlaceholder}
                    autoComplete="email"
                    aria-describedby="email-help"
                    maxLength={100}
                    required
                  />
                  <p id="email-help" className="mt-2 text-xs text-slate-600">
                    The verification code is sent here, so use an address you can open right now.
                  </p>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-navy">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      aria-describedby="password-help"
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
                  <p id="password-help" className="mt-2 text-xs text-slate-600">
                    At least {MIN_PASSWORD} characters.
                  </p>
                </div>

                <div>
                  <label htmlFor="confirm" className="mb-2 block text-sm font-semibold text-navy">
                    Confirm password
                  </label>
                  <Input
                    id="confirm"
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>

                {role === 'instructor' && (
                  <div>
                    <label htmlFor="access-code" className="mb-2 block text-sm font-semibold text-navy">
                      Instructor access code
                    </label>
                    <Input
                      id="access-code"
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      aria-describedby="access-code-help"
                      required
                    />
                    <p id="access-code-help" className="mt-2 text-xs text-slate-600">
                      Given by the Computer Engineering Department. Students do not need one.
                    </p>
                  </div>
                )}

                {error && (
                  <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}

                <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!ready}>
                  Register and send code
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">
                Already have an account?{' '}
                <Link
                  href="/login"
                  className="inline-flex min-h-[44px] items-center rounded-lg px-1 font-semibold text-brand underline-offset-4 hover:text-brand-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
