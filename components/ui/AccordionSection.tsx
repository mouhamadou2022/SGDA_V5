// components/ui/AccordionSection.tsx
'use client'

import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface AccordionSectionProps {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  badges?: ReactNode
  /** Extra buttons / controls in the header (right side). Uses stopPropagation. */
  actions?: ReactNode
  defaultOpen?: boolean
  onToggle?: (open: boolean) => void
  children: ReactNode
  className?: string
  headerClassName?: string
  contentClassName?: string
}

export function AccordionSection({
  icon,
  title,
  subtitle,
  badges,
  actions,
  defaultOpen = false,
  onToggle,
  children,
  className = '',
  headerClassName = '',
  contentClassName = '',
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const toggle = () => {
    const next = !isOpen
    setIsOpen(next)
    onToggle?.(next)
  }

  return (
    <div className={`card overflow-hidden shadow-sm ${className}`}>
      <div className={`flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-role-primary/5 to-transparent ${headerClassName}`}>
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={toggle}
          type="button"
        >
          {icon && (
            <div className="w-9 h-9 rounded-xl bg-role-gradient flex items-center justify-center shrink-0">
              {icon}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground">{title}</span>
              {subtitle && (
                <span className="text-xs text-muted-foreground">{subtitle}</span>
              )}
              {badges}
            </div>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ml-2 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {actions && (
          <div
            className="flex items-center gap-1.5 shrink-0 pl-3 border-l border-border"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>

      {isOpen && (
        <div className={`border-t border-border p-4 space-y-4 bg-background/40 ${contentClassName}`}>
          {children}
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────
// AccordionGroup — espacement automatique entre accordéons

interface AccordionGroupProps {
  spacing?: 'sm' | 'md' | 'lg' | 'none'
  children: ReactNode
  className?: string
}

export function AccordionGroup({
  spacing = 'md',
  children,
  className = '',
}: AccordionGroupProps) {
  const spacingClass =
    spacing === 'none' ? '' :
    spacing === 'sm' ? 'space-y-2' :
    spacing === 'lg' ? 'space-y-4' :
    'space-y-3'

  return (
    <div className={spacingClass + ' ' + className}>
      {children}
    </div>
  )
}

// ──────────────────────────────────────────
// AccordionSubGroup + AccordionSubItem
// Sous-groupes hiérarchiques (single-open) avec bordure gauche role

interface AccordionSubItemProps {
  title: string
  subtitle?: string
  badges?: ReactNode
  itemKey: string
  /** Controlled by AccordionSubGroup when nested inside it; optional for standalone use. */
  isOpen?: boolean
  onToggle?: () => void
  children: ReactNode
  className?: string
}

function AccordionSubItemRaw({
  title,
  subtitle,
  badges,
  isOpen,
  onToggle,
  children,
  className = '',
}: AccordionSubItemProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = isOpen !== undefined ? isOpen : internalOpen
  const handleToggle = onToggle || (() => setInternalOpen((p) => !p))

  return (
    <div className={`border-l-2 border-l-role-primary pl-3 ${className}`}>
      <button
        className="flex items-center gap-2 w-full text-left group"
        onClick={handleToggle}
        type="button"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform text-role-primary/60 ${open ? 'rotate-180' : ''}`}
        />
        <span className="text-sm font-medium text-foreground group-hover:text-role-primary transition-colors">
          {title}
        </span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {badges}
      </button>
      {open && <div className="mt-2 pl-1">{children}</div>}
    </div>
  )
}

/** Container single-open qui synchronise les AccordionSubItem. */
interface AccordionSubGroupProps {
  defaultActiveKey?: string
  children: ReactNode
  className?: string
}

export function AccordionSubGroup({
  defaultActiveKey,
  children,
  className = '',
}: AccordionSubGroupProps) {
  const [activeKey, setActiveKey] = useState<string | null>(defaultActiveKey ?? null)

  return (
    <div className={`space-y-3 ${className}`}>
      {Children.map(children, (child) => {
        if (!isValidElement<AccordionSubItemProps>(child)) return child
        const key = child.props.itemKey
        return cloneElement(child, {
          isOpen: activeKey === key,
          onToggle: () => setActiveKey(activeKey === key ? null : key),
        } as Partial<AccordionSubItemProps>)
      })}
    </div>
  )
}

/** Sous-groupe individuel avec bordure gauche role. */
export function AccordionSubItem(props: AccordionSubItemProps) {
  return <AccordionSubItemRaw {...props} />
}
