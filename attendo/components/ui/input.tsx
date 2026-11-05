import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      'flex min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-base text-slate-900 shadow-sm',
      'placeholder:text-slate-500 transition-colors duration-150',
      'hover:border-slate-400 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
      'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }
