'use client'

import { useEffect, useState } from 'react'

/** Live countdown to a local epoch-ms deadline. */
export function useCountdown(expiresAtMs: number | null) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (expiresAtMs == null) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [expiresAtMs])

  const msLeft = expiresAtMs == null ? 0 : Math.max(0, expiresAtMs - now)
  return {
    msLeft,
    secondsLeft: Math.ceil(msLeft / 1000),
    expired: expiresAtMs != null && msLeft === 0,
  }
}
