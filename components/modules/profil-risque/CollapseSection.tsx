// components/modules/profil-risque/CollapseSection.tsx
// Bloc d'analyse replié par défaut pour l'inspecteur et le DG (UI allégée),
// déplié par défaut pour l'admin (vue élargie). Rien n'est supprimé : tout reste dépliable.

'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { isVueElargie } from '@/lib/config'

interface CollapseSectionProps {
  userRole?: string | null
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}

export function CollapseSection({ userRole, title, icon, children }: CollapseSectionProps) {
  const [open, setOpen] = useState(() => isVueElargie(userRole))

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ChevronDown className={`w-4 h-4 text-role-primary transition-transform ${open ? 'rotate-180' : ''}`} />
          {icon}
          {title}
        </span>
        <span className="text-[11px] font-medium text-foreground">{open ? 'Masquer' : 'Afficher'}</span>
      </button>
      {open && <div className="px-4 pb-4 pt-1 space-y-6">{children}</div>}
    </div>
  )
}