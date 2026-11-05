'use client'

import { LogOut, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  name?: string
  roleLabel: string
  onSignOut: () => void
}

export function AppHeader({ name, roleLabel, onSignOut }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy text-white shadow-md print:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <QrCode className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-lg font-bold tracking-tight">Attendo</p>
            <p className="truncate text-xs text-blue-100">BulSU Computer Engineering · {roleLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {name && <p className="hidden max-w-[16rem] truncate text-sm font-medium sm:block">{name}</p>}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSignOut}
            className="text-white hover:bg-white/10 active:bg-white/20"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
