// lib/ia/prechargeur.ts
// Pré-génère les langages clairs et explications IA avec Ollama au chargement
// Groq reste réservé aux questions utilisateurs en temps réel
'use client'

import { useAppStore } from '@/lib/store'
import { expliquerCeQuiNeVaPas } from '@/lib/ia/ceQuiNeVaPasIA'
import { expliquerCriteresEnClair } from '@/lib/ia/critereExplicationIA'
import { expliquerPredictionsEnClair } from '@/lib/ia/anticipationIA'
import { expliquerCygneNoirEnClair } from '@/lib/ia/cygneNoirIA'
import { expliquerScoreEnClair } from '@/lib/ia/explicabiliteIA'
import { expliquerSituationExploitant } from '@/lib/ia/exploitantIA'
import { expliquerTriggersEnClair } from '@/lib/ia/facteursExplicationIA'
import { detectAllTriggers } from '@/lib/risque/triggers'

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

    const nbEcartsCritiques = ecarts.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture').length
    const nbDelaisDepasses = ecarts.filter(e => {
      const d = e.delai_pac
      return !!d && new Date(d) < new Date() && e.statut !== 'cloture'
    }).length

    const correlation = store.getMLRiskCorrelation()
    const triggers = detectAllTriggers({
      nbEcartsCritiques,
      nbDelaisDepasses,
      nbIncidentsRecents: 0,
      moisDepuisChangement: null,
      joursDepuisDerniereInspection: null,
    })

    const appels: Array<() => void> = [
      () => { expliquerCeQuiNeVaPas(base).catch(() => {}) },
      () => { expliquerCriteresEnClair({ profil, ecarts, evenementsCount: evenements.length, statut_sgs: aero.statut_sgs }).catch(() => {}) },
      () => { expliquerPredictionsEnClair(profil).catch(() => {}) },
      () => { expliquerScoreEnClair({ profil, ecarts, evenements, correlation }).catch(() => {}) },
      () => { expliquerSituationExploitant({ profil, aerodromeCode: aero.code_oaci, aerodromeName: aero.nom, ecartsActifs: ecarts, evenements, statut_sgs: aero.statut_sgs }).catch(() => {}) },
      () => { expliquerTriggersEnClair(triggers, profil).catch(() => {}) },
    ]

    if (profil.bayesian_black_swan) {
      appels.push(() => { expliquerCygneNoirEnClair({ profil, ecarts, evenementsCount: evenements.length, statut_sgs: aero.statut_sgs }).catch(() => {}) })
    }

    for (const appel of appels) {
      setTimeout(() => appel(), Math.random() * 3000)
    }
  }
}
