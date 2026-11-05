'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import type { Profile, Role } from '@/lib/types'

/**
 * Client-side route guard. Sessions live in browser storage, so this runs in the
 * browser: it redirects to /login when there is no session, or when the signed-in
 * account is not registered for `role`. (Data access is enforced by RLS regardless.)
 */
export function useRequireRole(role: Role) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    let active = true

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }
      const { data, error } = await supabase.rpc('my_profiles')
      if (!active) return
      const match = (data as Profile[] | null)?.find((p) => p.role === role)
      if (error || !match) {
        await supabase.auth.signOut()
        router.replace('/login')
        return
      }
      setProfile(match)
      setLoading(false)
    }

    void check()
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/login')
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [role, router])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }, [router])

  return { loading, profile, signOut }
}
