// components/layout/SyncStatus.tsx
// ✅ Indicateur de synchronisation premium avec animations et design système
// ✅ Correction : TooltipProvider ajouté

'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle, CloudSync, Clock } from 'lucide-react'
import { onNetworkChange, getPendingSyncCount } from '@/lib/offline'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/lib/store'

type SyncState = 'online' | 'offline' | 'syncing' | 'synced' | 'error'

interface SyncStatusProps {
  showLabel?: boolean
  compact?: boolean
}

export function SyncStatus({ showLabel = true, compact = false }: SyncStatusProps) {
  const [state, setState] = useState<SyncState>('online')
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const [syncProgress, setSyncProgress] = useState(0)
  const user = useAppStore(s => s.user)

  useEffect(() => {
    setState(navigator.onLine ? 'online' : 'offline')
    setLastSyncTime(new Date())

    const unsubscribe = onNetworkChange((online) => {
      if (online) {
        setState('syncing')
        setSyncProgress(0)
        
        // Simulation de progression
        const interval = setInterval(() => {
          setSyncProgress(prev => Math.min(prev + 20, 100))
        }, 300)

        getPendingSyncCount()
          .then((count) => {
            clearInterval(interval)
            setPendingCount(count)
            if (count > 0) {
              setState('syncing')
              // Simuler la fin de synchronisation après un délai
              setTimeout(() => {
                setState('synced')
                setLastSyncTime(new Date())
                setTimeout(() => setState('online'), 2000)
              }, 1500)
            } else {
              setState('synced')
              setLastSyncTime(new Date())
              setTimeout(() => setState('online'), 2000)
            }
            setSyncProgress(100)
          })
          .catch(() => {
            clearInterval(interval)
            setState('error')
            setTimeout(() => setState('online'), 3000)
          })
      } else {
        setState('offline')
        getPendingSyncCount().then(setPendingCount).catch(() => {})
        setSyncProgress(0)
      }
    })

    return unsubscribe
  }, [])

  // Récupérer périodiquement le nombre d'éléments en attente
  useEffect(() => {
    if (state === 'offline' || state === 'syncing') {
      const interval = setInterval(() => {
        getPendingSyncCount().then(setPendingCount).catch(() => {})
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [state])

  const getTimeSinceLastSync = (): string => {
    if (!lastSyncTime) return 'Jamais'
    const diff = Math.floor((Date.now() - lastSyncTime.getTime()) / 1000)
    if (diff < 60) return `à l'instant`
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
    return `il y a ${Math.floor(diff / 3600)} h`
  }

  const config: Record<SyncState, { icon: React.ReactNode; label: string; description: string; className: string; bgClass: string }> = {
    online: {
      icon: <Wifi className="w-4 h-4" />,
      label: 'Connecté',
      description: `Synchronisé ${getTimeSinceLastSync()}`,
      className: 'text-success',
      bgClass: 'bg-success/10',
    },
    offline: {
      icon: <WifiOff className="w-4 h-4" />,
      label: 'Hors-ligne',
      description: `${pendingCount > 0 ? `${pendingCount} modification(s) en attente` : 'Aucune donnée en attente'}`,
      className: 'text-warning',
      bgClass: 'bg-warning/10',
    },
    syncing: {
      icon: <RefreshCw className="w-4 h-4 animate-spin" />,
      label: 'Synchronisation',
      description: `${pendingCount > 0 ? `${pendingCount} élément(s) restant(s)` : 'En cours...'}`,
      className: 'text-primary',
      bgClass: 'bg-primary/10',
    },
    synced: {
      icon: <CheckCircle2 className="w-4 h-4" />,
      label: 'Synchronisé',
      description: getTimeSinceLastSync(),
      className: 'text-success',
      bgClass: 'bg-success/10',
    },
    error: {
      icon: <AlertCircle className="w-4 h-4" />,
      label: 'Erreur',
      description: 'Échec de synchronisation',
      className: 'text-danger',
      bgClass: 'bg-danger/10',
    },
  }

  const current = config[state]

  // Version compacte (juste l'icône) - AVEC TooltipProvider
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`relative flex items-center justify-center w-8 h-8 rounded-full ${current.bgClass} cursor-pointer transition-all hover:scale-105`}>
              {current.icon}
              {pendingCount > 0 && state !== 'online' && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
              {/* Effet radar pour offline */}
              {state === 'offline' && (
                <div className="absolute inset-0 rounded-full border-2 border-warning/30 animate-ping" style={{ animationDuration: '1.5s' }} />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="tooltip-text">
            <p className="font-medium">{current.label}</p>
            <p className="text-xs text-muted">{current.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Version complète - AVEC TooltipProvider
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${current.bgClass} border border-${state === 'syncing' ? 'primary/30' : state === 'offline' ? 'warning/30' : 'success/30'} cursor-pointer transition-all hover:scale-105 group`}
            data-role={user?.role}
          >
            {/* Icône avec animation */}
            <div className="relative">
              {current.icon}
              {state === 'syncing' && (
                <div className="absolute inset-0 rounded-full bg-primary/30 animate-ping" style={{ animationDuration: '1s' }} />
              )}
            </div>

            {/* Label (optionnel) */}
            {showLabel && (
              <div className="flex flex-col items-start">
                <span className={`text-xs font-semibold ${current.className}`}>
                  {current.label}
                </span>
                <span className="text-[10px] text-muted">
                  {current.description}
                </span>
              </div>
            )}

            {/* Badge compteur */}
            {pendingCount > 0 && state !== 'online' && (
              <div className="flex items-center gap-1 ml-1">
                <div className="w-1 h-1 rounded-full bg-warning animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-warning">
                  {pendingCount}
                </span>
              </div>
            )}

            {/* Barre de progression pendant la syncing */}
            {state === 'syncing' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/30 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-role-primary transition-all duration-300"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="tooltip-text">
          <p className="font-medium text-role-primary">{current.label}</p>
          <p className="text-xs text-muted">{current.description}</p>
          {pendingCount > 0 && (
            <div className="mt-1 pt-1 border-t border-border">
              <p className="text-[10px] text-muted flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" />
                Dernière tentative: {new Date().toLocaleTimeString()}
              </p>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ─────────────────────────────────────────────────────────────
// VERSION SIMPLIFIÉE POUR LE HEADER
// ─────────────────────────────────────────────────────────────

export function SyncStatusBadge() {
  return <SyncStatus compact showLabel={false} />
}

// ─────────────────────────────────────────────────────────────
// INDICATEUR DE SYNCHRONISATION AVEC ANIMATION AVION
// ─────────────────────────────────────────────────────────────

export function SyncStatusWithPlane() {
  const [state, setState] = useState<SyncState>('online')
  const [showPlane, setShowPlane] = useState(false)

  useEffect(() => {
    const unsubscribe = onNetworkChange((online) => {
      if (online) {
        setShowPlane(true)
        setTimeout(() => setShowPlane(false), 2000)
      }
    })
    return unsubscribe
  }, [])

  return (
    <div className="relative">
      <SyncStatus compact />
      {showPlane && (
        <div className="absolute -top-6 -right-4 animate-takeoff">
          <div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center shadow-role-glow">
            <RefreshCw className="w-3 h-3 text-role-primary animate-spin" />
          </div>
        </div>
      )}
    </div>
  )
}