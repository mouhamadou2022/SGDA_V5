// components/ui/EmptyState.tsx
import { type LucideIcon } from 'lucide-react'
import { Button } from './button'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center ${className ?? ''}`}>
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-role-primary-soft flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-role-primary" />
        </div>
      )}
      <p className="font-semibold text-foreground text-base">{title}</p>
      {description && <p className="text-sm text-muted mt-1 max-w-xs">{description}</p>}
      {action && (
        <Button size="sm" className="mt-4 btn-primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}