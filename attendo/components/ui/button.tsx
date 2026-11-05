import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Every variant defines all four interaction states explicitly:
 *   Default  -> base classes
 *   Hover    -> hover:*
 *   Active   -> active:*  (pressed: darker fill + slight scale)
 *   Disabled -> disabled:* (dimmed, no pointer events, no shadow)
 * All sizes keep a 44px minimum touch target.
 */
const buttonVariants = cva(
  [
    'inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold',
    'transition-all duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    'active:scale-[0.98]',
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
  ],
  {
    variants: {
      variant: {
        default: 'bg-navy text-white shadow-sm hover:bg-navy-hover hover:shadow-md active:bg-navy-active',
        brand: 'bg-brand text-white shadow-sm hover:bg-brand-hover hover:shadow-md active:bg-brand-active',
        success:
          'bg-success-strong text-white shadow-sm hover:bg-success-hover hover:shadow-md active:bg-success-active',
        destructive:
          'bg-danger-strong text-white shadow-sm hover:bg-danger-hover hover:shadow-md active:bg-danger-active',
        outline:
          'border border-slate-300 bg-white text-navy hover:border-navy hover:bg-slate-50 active:bg-slate-100',
        ghost: 'text-navy hover:bg-navy-soft active:bg-slate-200',
      },
      size: {
        default: 'px-5 py-2.5',
        sm: 'px-4 py-2',
        lg: 'min-h-[52px] px-7 text-base',
        icon: 'w-11 px-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
        {...(asChild ? {} : { disabled: disabled || loading, 'aria-busy': loading || undefined })}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
