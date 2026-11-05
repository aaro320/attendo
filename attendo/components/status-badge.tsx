import { cn } from '@/lib/utils'
import type { RowStatus } from '@/lib/types'

/** All pairings are WCAG AA (>= 4.5:1). */
const STYLES: Record<RowStatus, string> = {
  Present: 'bg-success-soft text-success-strong ring-success-strong/20',
  Late: 'bg-amber-100 text-amber-800 ring-amber-800/20',
  Excused: 'bg-brand-soft text-brand ring-brand/20',
  Absent: 'bg-danger-soft text-danger-strong ring-danger-strong/20',
}

const DOTS: Record<RowStatus, string> = {
  Present: 'bg-success',
  Late: 'bg-amber-500',
  Excused: 'bg-brand',
  Absent: 'bg-danger',
}

export function StatusBadge({ status, className }: { status: RowStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        STYLES[status],
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[status])} aria-hidden />
      {status}
    </span>
  )
}
