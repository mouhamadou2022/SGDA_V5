// components/layout/OfflineBifiener.tsx
// ✅ Bandeau hors-ligne premium avec animations et design système
'use client'

import { useEffect, useState } from 'react'
import { WifiOff, RefreshCw, Wifi, CloudOff, AlertCircle, X } from 'lucide-react'
import { onNetworkChange, getPendingSyncCount } from '@/lib/offline'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const user = useAppStore(s => s.user)

  useEffect(() => {
    setIsOnline(navigator.onLine)

    const unsubscribe = onNetworkChange((online) => {
      if (!online) {
        // Passage en hors-ligne → afficher avec animation
        setIsVisible(true)
        setIsOnline(false)
      } else {
        // Reconnexion → attendre 2s puis masquer
        setTimeout(() => {
          setIsVisible(false)
          setTimeout(() => setIsOnline(true), 300)
        }, 2000)
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    if (!isOnline) {
      getPendingSyncCount().then(setPendingCount).catch(() => setPendingCount(0))
    }
  }, [isOnline])

  const handleRetrySync = async () => {
    setIsRetrying(true)
    try {
      // Simuler une tentative de synchronisation
      await new Promise(resolve => setTimeout(resolve, 1500))
      const count = await getPendingSyncCount()
      setPendingCount(count)
      if (count === 0 && navigator.onLine) {
        setIsVisible(false)
        setTimeout(() => setIsOnline(true), 300)
      }
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error)
    } finally {
      setIsRetrying(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
  }

  if (!isVisible && isOnline) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-0 inset-x-0 z-[9999] transition-all duration-500 ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'
      }`}
      data-role={user?.role}
    >
      <div className="relative overflow-hidden">
        {/* Fond avec dégradé et effet glassmorphism */}
        <div className="absolute inset-0 bg-gradient-to-r from-amber-600/95 to-orange-600/95 backdrop-blur-sm" />
        
        {/* Effet radar en arrière-plan */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-1/4 w-32 h-32 rounded-full border-2 border-white/30 animate-ping" style={{ animationDuration: '3s' }} />
          <div className="absolute bottom-0 right-1/4 w-24 h-24 rounded-full border-2 border-white/30 animate-ping delay-1000" style={{ animationDuration: '4s' }} />
        </div>

        {/* Contenu principal */}
        <div className="relative container py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
            {/* Icône avec animation */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-white/20 animate-ping" style={{ animationDuration: '1.5s' }} />
              <div className="relative w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                <WifiOff className="w-4 h-4 text-white animate-pulse" />
              </div>
            </div>

            {/* Texte d'alerte */}
            <div>
              <p className="text-white font-semibold text-sm flex items-center gap-2">
                Mode hors-ligne
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/20 rounded-full text-[10px] font-mono">
                  <CloudOff className="w-2.5 h-2.5" />
                  offline
                </span>
              </p>
              <p className="text-white text-xs">
                Certaines fonctionnalités sont limitées. Les modifications seront synchronisées automatiquement.
              </p>
            </div>
          </div>

          {/* Zone d'actions */}
          <div className="flex items-center gap-2">
            {/* Compteur de synchronisation */}
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 px-2 py-1 bg-white/20 rounded-full">
                <RefreshCw className={`w-3.5 h-3.5 text-white ${isRetrying ? 'animate-spin' : ''}`} />
                <span className="text-white text-xs font-mono font-semibold">
                  {pendingCount} modification{pendingCount > 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Bouton synchronisation manuelle */}
            <Button
              onClick={handleRetrySync}
              disabled={isRetrying}
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-none text-xs gap-1.5 transition-all hover:scale-105"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Synchro...' : pendingCount > 0 ? 'Synchroniser' : 'Vérifier'}
            </Button>

            {/* Bouton fermeture */}
            <Button
              onClick={handleDismiss}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 rounded-full w-7 h-7 p-0"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Barre de progression animée */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/30">
          <div className="h-full bg-white animate-pulse" style={{ width: `${Math.min(100, pendingCount * 5)}%` }} />
        </div>
      </div>

      {/* Toast de reconnexion */}
      {!isVisible && !isOnline && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-slide-right">
          <div className="bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl shadow-role-glow px-4 py-3 flex items-center gap-3 border border-white/20">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <Wifi className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <p className="font-semibold text-sm">Connexion rétablie</p>
              <p className="text-white text-xs">Synchronisation en cours...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}