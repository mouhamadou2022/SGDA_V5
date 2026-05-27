'use client'

import React, { useEffect, useRef, useState, memo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const SIZE_MAP: Record<string, string> = {
  sm:  'max-w-sm', md:  'max-w-md', lg:  'max-w-lg',
  xl:  'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl', '5xl': 'max-w-5xl',
}

export interface FormTab {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  badge?: string | number
}

export const FormProgressContext = React.createContext<(n: number) => void>(() => {})

export interface FormShellProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  size?: keyof typeof SIZE_MAP
  tabs?: FormTab[]
  activeTab?: string
  onTabChange?: (id: string) => void
  footer?: React.ReactNode
  children: React.ReactNode
  dataRole?: string
}

export const FormShell = memo(function FormShell({
  open, onClose, title, subtitle, icon: Icon, size = '3xl',
  tabs, activeTab, onTabChange, footer, children, dataRole,
}: FormShellProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [internalProgress, setInternalProgress] = useState(0)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => { if (open) setInternalProgress(0) }, [open])

  if (!open) return null

  const maxW = SIZE_MAP[size] ?? SIZE_MAP['3xl']
  const hasTabs = tabs && tabs.length > 0

  const modal = (
    <div ref={overlayRef} className="modal-overlay" data-role={dataRole}>
      <div className={`form-shell-content ${maxW}`}>
        <div className="form-shell-inner">
          <div className="form-shell-header">
            <div className="form-shell-title">
              <span className="form-shell-icon-wrap"><Icon className="w-5 h-5 text-white" /></span>
              <div>
                <span className="form-shell-title-text">{title}</span>
                {subtitle && <span className="form-shell-subtitle">{subtitle}</span>}
              </div>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Fermer"><X className="w-4 h-4" /></button>
          </div>

          <div className="form-shell-progress-track">
            <div className="form-shell-progress-fill" style={{ width: `${Math.min(100, Math.max(0, internalProgress))}%` }} />
            <span className="form-shell-progress-label">
              {internalProgress < 100 ? `Complétion ${internalProgress}%` : '✓ Formulaire complet'}
            </span>
          </div>

          {hasTabs && (
            <div className="tabs form-shell-tabs">
              {tabs!.map(tab => {
                const TabIcon = tab.icon
                return (
                  <button key={tab.id} type="button" className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => onTabChange?.(tab.id)}>
                    {TabIcon && <TabIcon className="tab-icon" />}{tab.label}
                    {tab.badge !== undefined && <span className="badge neutral ml-1 text-xs">{tab.badge}</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div className="form-shell-body">
            <FormProgressContext.Provider value={setInternalProgress}>
              {children}
            </FormProgressContext.Provider>
          </div>

          {footer && <div className="form-shell-footer">{footer}</div>}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
})
