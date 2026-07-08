'use client'

import { WifiOff, RefreshCw } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <WifiOff className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Vous êtes hors-ligne</h1>
        <p className="text-sm text-foreground mb-6">
          Les données déjà chargées restent accessibles. Les modifications sont sauvegardées localement et synchronisées automatiquement au retour de la connexion.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-role-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          Réessayer
        </button>
      </div>
    </div>
  )
}
