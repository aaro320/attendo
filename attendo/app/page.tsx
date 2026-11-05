'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingScreen } from '@/components/loading-screen'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from '@/lib/types'

/** Entry point: send the visitor to their dashboard, or to /login. */
export default function Home() {
  const router = useRouter()

  useEffect(() => {
    async function route() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        router.replace('/login')
        return
      }
      const { data } = await supabase.rpc('my_profiles')
      const role = (data as Profile[] | null)?.[0]?.role
      router.replace(role === 'instructor' ? '/instructor/dashboard' : role === 'student' ? '/student/dashboard' : '/login')
    }
    void route()
  }, [router])

  return <LoadingScreen />
}
