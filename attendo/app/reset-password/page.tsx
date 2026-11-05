'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, QrCode, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabaseClient'

/** Landing page for the password-recovery e-mail link. */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError('The two passwords do not match.')
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError('Could not update your password. The link may have expired — request a new one.')
      setBusy(false)
      return
    }
    setDone(true)
    await supabase.auth.signOut()
    setTimeout(() => router.replace('/login'), 2000)
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md animate-fade-up p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy text-white">
            <QrCode className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="text-xl font-bold text-navy">Choose a new password</h1>
        </div>

        {done ? (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-success-soft p-4 text-sm font-medium text-success-strong">
            <CheckCircle2 className="h-5 w-5" aria-hidden />
            Password updated. Redirecting to sign in…
          </p>
        ) : !ready ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This page opens from the link in your password-reset email. If you got here another way, request a new link.
            </p>
            <Button className="w-full" onClick={() => router.replace('/login')}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-navy">New password</label>
              <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-navy">Confirm password</label>
              <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-3 text-sm text-danger-strong">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!password || !confirm}>
              Update password
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}
