'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, ChevronDown } from 'lucide-react'

export interface HelpSection {
  id: string
  title: string
  icon?: React.ElementType
  content: React.ReactNode
}

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  sections: HelpSection[]
}

export function HelpModal({ isOpen, onClose, title, subtitle, sections }: HelpModalProps) {
  const [openId, setOpenId] = useState<string>(sections[0]?.id ?? '')

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const modal = (
    <div className="modal-overlay">
      <div className="form-shell-content max-w-xl">
        <div className="form-shell-inner">
          <div className="form-shell-header">
            <div className="form-shell-title">
              <span className="form-shell-icon-wrap">
                <BookOpen className="w-5 h-5 text-white" />
              </span>
              <div>
                <span className="form-shell-title-text">{title}</span>
                {subtitle && (
                  <span className="form-shell-subtitle">{subtitle}</span>
                )}
              </div>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="form-shell-body space-y-2">
            {sections.map((section) => {
              const isExpanded = openId === section.id
              const Icon = section.icon
              return (
                <div
                  key={section.id}
                  className={`rounded-xl border transition-colors duration-150 ${
                    isExpanded ? 'border-role-primary/30 bg-role-primary-soft/15' : 'border-border bg-background'
                  }`}
                >
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setOpenId(isExpanded ? '' : section.id)}
                  >
                    <div className="flex items-center gap-2.5">
                      {Icon && (
                        <Icon className={`w-4 h-4 shrink-0 ${isExpanded ? 'text-role-primary' : 'text-muted-foreground'}`} />
                      )}
                      <span className={`text-sm font-semibold ${isExpanded ? 'text-role-primary' : 'text-foreground'}`}>
                        {section.title}
                      </span>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 text-xs text-foreground/90 leading-relaxed space-y-2">
                      {section.content}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="form-shell-footer">
            <button onClick={onClose} className="btn btn-secondary">Fermer</button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
