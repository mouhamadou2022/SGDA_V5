// Composant invisible qui enregistre le Service Worker
'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    if (process.env.NODE_ENV === 'development') {
      // En dev, les chunks Turbopack changent à chaque rebuild : un SW
      // cache-first servirait des chunks périmés ("module factory is
      // not available"). On désactive et purges tout SW résiduel.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      })
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
      }
      return
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW non disponible (SSR, build static, etc.) — silencieux
    })
  }, [])

  return null
}
