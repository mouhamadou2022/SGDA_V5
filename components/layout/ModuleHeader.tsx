// components/layout/ModuleHeader.tsx
'use client'

import { ReactNode } from 'react'
import { Brain } from 'lucide-react'
import { useAppStore } from '@/lib/store'

const AI_ROLES = ['admin', 'inspector', 'dg_anacim']

interface ModuleHeaderProps {
  icon: ReactNode
  title: string
  description?: string
  actions?: ReactNode
}

export function ModuleHeader({ icon, title, description, actions }: ModuleHeaderProps) {
  const user = useAppStore(s => s.user)
  const canUseAI = AI_ROLES.includes(user?.role || '')

  const handleOpenAI = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    window.dispatchEvent(new CustomEvent('open-ia', {
      detail: { anchorRight: rect.right, anchorBottom: rect.bottom }
    }))
  }

  return (
    <div className="module-header !items-start">
      <div className="module-title">
        <div className="module-title-icon">{icon}</div>
        <div>
          <h1 className="heading-1 text-role-primary">{title}</h1>
          {description && <p className="text-body">{description}</p>}
        </div>
      </div>

      <div className="flex flex-col items-end gap-2">
        {actions}
        {canUseAI && (
          <button
            onClick={handleOpenAI}
            className="btn btn-secondary h-7 px-2.5 text-xs gap-1.5"
            title="Assistant IA (Ctrl+K)"
          >
            <Brain className="w-3.5 h-3.5 text-role-primary" />
            Assistant IA
          </button>
        )}
      </div>
    </div>
  )
}
