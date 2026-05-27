// components/layout/NotificationCenter.tsx
'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Bell, X, CheckCheck, ExternalLink } from 'lucide-react'
import { useAppStore, type Notification } from '@/lib/store'
import { Badge } from '@/components/ui/badge'

const TYPE_STYLES: Record<Notification['type'], string> = {
  info: 'border-l-4 border-l-primary bg-primary/5',
  success: 'border-l-4 border-l-success bg-success/5',
  warning: 'border-l-4 border-l-warning bg-warning/5',
  danger: 'border-l-4 border-l-danger bg-danger/5',
}

const TYPE_ICONS: Record<Notification['type'], string> = {
  info: '🛈',
  success: '✓',
  warning: '⚠',
  danger: '✕',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'À l\'instant'
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Il y a ${days}j`
  return new Date(dateStr).toLocaleDateString('fr-FR')
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const notifications = useAppStore(s => s.notifications)
  const markAsRead = useAppStore(s => s.markAsRead)
  const markAllAsRead = useAppStore(s => s.markAllAsRead)
  const nonLues = notifications.filter(n => !n.read_at).length

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotifClick = (n: Notification) => {
    if (!n.read_at) markAsRead(n.id)
    if (n.link) window.open(n.link, '_blank')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="action-button relative"
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {nonLues > 0 && (
          <Badge
            variant="danger"
            className="badge danger pulse absolute -top-1 -right-1 h-4 min-w-[1rem] px-1 text-[8px] flex items-center justify-center"
          >
            {nonLues > 99 ? '99+' : nonLues}
          </Badge>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-scale origin-top-right">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-role-primary">
              Notifications {nonLues > 0 && <span className="text-muted-foreground font-normal">({nonLues} non lue{nonLues > 1 ? 's' : ''})</span>}
            </h3>
            {nonLues > 0 && (
              <button
                className="text-xs text-role-primary hover:text-role-primary-hover flex items-center gap-1 transition-colors"
                onClick={() => { markAllAsRead(); setOpen(false) }}
              >
                <CheckCheck className="w-3 h-3" />
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Aucune notification
              </div>
            ) : (
              notifications.slice(0, 50).map((n) => (
                <button
                  key={n.id}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-role-primary/5 border-b border-border/50 last:border-b-0 ${n.read_at ? 'opacity-70' : ''} ${TYPE_STYLES[n.type]}`}
                  onClick={() => handleNotifClick(n)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs mt-0.5">{TYPE_ICONS[n.type]}</span>
                    <div className="flex-1 min-w-0">
                      {n.title && <p className="font-medium text-foreground truncate">{n.title}</p>}
                      <p className="text-muted-foreground text-xs line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">{timeAgo(n.sent_at)}</span>
                        {n.link && <ExternalLink className="w-2.5 h-2.5 text-role-primary" />}
                      </div>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 rounded-full bg-role-primary shrink-0 mt-1.5" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
