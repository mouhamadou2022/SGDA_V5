// lib/ia/prechargeur.ts
// Pré-génère les langages clairs et explications IA avec Ollama au chargement
// Groq reste réservé aux questions utilisateurs en temps réel
'use client'

import { useAppStore } from '@/lib/store'
import { aiClient } from '@/lib/ia/aiClient'
import { expliquerCeQuiNeVaPas } from '@/lib/ia/ceQuiNeVaPasIA'
import { expliquerCriteresEnClair } from '@/lib/ia/critereExplicationIA'
import { expliquerPredictionsEnClair } from '@/lib/ia/anticipationIA'
import { expliquerCygneNoirEnClair } from '@/lib/ia/cygneNoirIA'
import { expliquerScoreEnClair } from '@/lib/ia/explicabiliteIA'
import { expliquerSituationExploitant } from '@/lib/ia/exploitantIA'
import { expliquerTriggersEnClair } from '@/lib/ia/facteursExplicationIA'

let enCours = false

export function prechargerLangagesClairs(): void {
  if (enCours) return
  enCours = true

  const store = useAppStore.getState()
  const aerodromes = store.aerodromes || []
  const cibles = aerodromes.filter(a => a.statut_sgs !== 'non_applicable').slice(0, 3)

  for (const aero of cibles) {
    const profil = store.profilsRisque?.[aero.id]
    if (!profil) continue

    const ecarts = (store.ecarts || []).filter(e => e.aerodrome_id === aero.id && e.statut !== 'cloture')
    const evenements = (store.evenements || []).filter(e => e.aerodrome_id === aero.id)
    const surveillances = (store.surveillances || []).filter(s => s.aerodrome_id === aero.id)

    const base = {
      profil,
      ecarts,
      evenements,
      surveillancesCount: surveillances.length,
      statut_sgs: aero.statut_sgs,
    }

    const appels = [
      () => expliquerCeQuiNeVaPas(base).catch(() => {}),
      () => expliquerCriteresEnClair({ profil, ecarts, evenementsCount: evenements.length, statut_sgs: aero.statut_sgs }).catch(() => {}),
      () => expliquerPredictionsEnClair(profil).catch(() => {}),
      () => expliquerScoreEnClair({ profil, ecarts, evenements }).catch(() => {}),
      () => expliquerSituationExploitant({ profil, ecarts, evenements, statut_sgs: aero.statut_sgs }).catch(() => {}),
      () => expliquerTriggersEnClair({ profil, month: new Date().getMonth() }).catch(() => {}),
    ]

    if (profil.bayesian_black_swan) {
      appels.push(() => expliquerCygneNoirEnClair({ profil, ecarts, evenementsCount: evenements.length, statut_sgs: aero.statut_sgs }).catch(() => {}))
    }

    for (const appel of appels) {
      setTimeout(() => appel(), Math.random() * 3000)
    }
  }
}
