import { Loader2 } from 'lucide-react'

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface" role="status" aria-live="polite">
      <div className="flex items-center gap-3 text-navy">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  )
}
