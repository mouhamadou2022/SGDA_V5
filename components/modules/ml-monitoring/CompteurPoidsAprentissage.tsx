// components/modules/ml-monitoring/CompteurPoidsAprentissage.tsx
// Jauge « N/50 échantillons » : l'apprentissage automatique des poids C1-C5
// (levier ML) ne démarre qu'à 50 échantillons terrain équilibrés — en
// attendant, ce sont les règles ±3 bornées qui s'appliquent. Chaque checklist
// signée alimente le dataset : la jauge matérialise le chemin vers le ML.

'use client'

import { useEffect, useState } from 'react'
import { lireCompteursDataset } from '@/lib/ia/apprentissageStatus'

const SEUIL_APPRENTISSAGE_POIDS = 50

export function CompteurPoidsAprentissage() {
  const [nb, setNb] = useState<number | null>(null)
  useEffect(() => {
    let actif = true
    lireCompteursDataset()
      .then(d => { if (actif) setNb(d.mlSamples) })
      .catch(() => { /* compteur indisponible : masqué */ })
    return () => { actif = false }
  }, [])
  if (nb === null) return null
  const pct = Math.min(100, Math.round((nb / SEUIL_APPRENTISSAGE_POIDS) * 100))
  const pret = nb >= SEUIL_APPRENTISSAGE_POIDS
  return (
    <div className="mb-3 rounded-xl border border-border/60 px-3 py-2 text-xs" data-module="compteur-poids">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">
          Apprentissage des poids C1-C5 : {nb}/{SEUIL_APPRENTISSAGE_POIDS} échantillons terrain
        </span>
        <span className={pret ? 'text-success font-semibold' : 'text-muted-foreground'}>
          {pret ? 'Prêt — fit activable' : 'En collecte'}
        </span>
      </div>
      <div className="h-1.5 mt-1.5 rounded bg-muted overflow-hidden">
        <div className="h-full rounded bg-role-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted-foreground mt-1">
        Chaque checklist signée alimente le dataset. Au seuil, les poids appris remplacent les règles ±3 (champion/challenger, audit conservé).
      </p>
    </div>
  )
}
