// Composant invisible qui enregistre le Service Worker
'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW non disponible (SSR, build static, etc.) — silencieux
      })
    }
  }, [])

  return null
}
