'use client'

import localforage from 'localforage'
import type { PersistStorage, StorageValue } from 'zustand/middleware'

const forage = localforage.createInstance({
  name: 'sgda-store',
  storeName: 'app_state',
  description: 'Zustand persist backend — IndexedDB (asynchrone, sans limite de taille)',
})

// Verrouillage d'écriture séquentiel — évite les conflits de concurrence d'écriture
let pendingWrite: Promise<void> = Promise.resolve()
const pendingValue = new Map<string, StorageValue<unknown>>()

function flushWrite(name: string): void {
  const value = pendingValue.get(name)
  if (value === undefined) return
  pendingValue.delete(name)
  // Chaîne les écritures pour éviter les conflits IndexedDB
  pendingWrite = pendingWrite.then(() =>
    forage.setItem(name, JSON.stringify(value)).then(() => {})
  )
}

// Sauvegarde synchrone dans localStorage pour les cas de fermeture inopinée
// Désactivé par défaut pour améliorer les performances - activer seulement si nécessaire
function syncToLocalStorage(name: string, value: StorageValue<unknown>): void {
  // Commenté pour améliorer les performances - localStorage sync cause des ralentissements significatifs
  /*
  try {
    const serialized = JSON.stringify(value)
    // localStorage limit ~5MB — tronque si trop gros, suffit pour le fallback
    if (serialized.length < 4_000_000) {
      localStorage.setItem(`backup_${name}`, serialized)
    }
  } catch {
    // ignore si localStorage plein
  }
  */
}

export const zustandIDBStorage: PersistStorage<unknown> = {
  getItem: async (name: string) => {
    const value = await forage.getItem<string>(name)
    if (value !== null) return JSON.parse(value) as StorageValue<unknown>
    // Fallback localStorage si IndexedDB était vide (ex: fermeture avant flush)
    const backup = localStorage.getItem(`backup_${name}`)
    if (backup) {
      try { return JSON.parse(backup) as StorageValue<unknown> } catch { /* ignore */ }
      localStorage.removeItem(`backup_${name}`)
    }
    return null
  },
  setItem: async (name: string, value: StorageValue<unknown>) => {
    pendingValue.set(name, value)
    // Backup synchrone pour survie à la fermeture
    syncToLocalStorage(name, value)
    flushWrite(name)
  },
  removeItem: async (name: string) => {
    pendingValue.delete(name)
    localStorage.removeItem(`backup_${name}`)
    await forage.removeItem(name)
  },
}

// Flush sur beforeunload et visibilité cachée
if (typeof window !== 'undefined') {
  const beforeUnloadHandler = () => {
    const promises: Promise<void>[] = []
    for (const [name] of pendingValue) {
      const value = pendingValue.get(name)
      if (value) {
        syncToLocalStorage(name, value)
      }
    }
  }
  window.addEventListener('beforeunload', beforeUnloadHandler)
}
