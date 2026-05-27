// lib/anomalies.ts — SGDA V5
// Détection proactive d'anomalies dans les données SGDA.
// ✅ R3 : 0 fetch direct — données passées en paramètre depuis le store.

import type { Aerodrome, Surveillance, Ecart, Utilisateur, Planning, ProfilRisque } from './store'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type AnomalieSeverite = 'critique' | 'haute' | 'normale' | 'info'

export type AnomalieType =
  | 'surcharge_inspecteur'
  | 'ecart_repetitif'
  | 'expiration_document'
  | 'surveillance_en_retard'
  | 'pac_en_retard'
  | 'risque_degradation'
  | 'inactivite_aerodrome'
  | 'conflit_planning'

export interface Anomalie {
  id: string
  type: AnomalieType
  severite: AnomalieSeverite
  titre: string
  description: string
  entiteId?: string
  entiteType?: 'aerodrome' | 'inspecteur' | 'surveillance' | 'ecart' | 'planning'
  detecteeLe: string
  dismissed?: boolean
}

// ─────────────────────────────────────────────────────────────
// DÉTECTION PRINCIPALE
// ─────────────────────────────────────────────────────────────

export function detectAnomalies(params: {
  surveillances: Surveillance[]
  ecarts: Ecart[]
  utilisateurs: Utilisateur[]
  plannings: Planning[]
  profilsRisque: ProfilRisque[]
  aerodromes: Aerodrome[]
}): Anomalie[] {
  const { surveillances, ecarts, utilisateurs, plannings, profilsRisque, aerodromes } = params
  const now = new Date()

  return [
    ...detectSurcharge(utilisateurs, plannings, surveillances),
    ...detectEcartsRepetitifs(ecarts),
    ...detectSurveillancesEnRetard(surveillances, now),
    ...detectPACsEnRetard(ecarts, now),
    ...detectRisqueDegradation(profilsRisque),
    ...detectInactiviteAerodromes(aerodromes, surveillances, now),
    ...detectConflitsPlanning(plannings),
  ]
}

// ─────────────────────────────────────────────────────────────
// SURCHARGE INSPECTEUR
// ─────────────────────────────────────────────────────────────

export function detectSurcharge(
  utilisateurs: Utilisateur[],
  plannings: Planning[],
  surveillances: Surveillance[],
  seuilSurveillancesParMois = 4,
): Anomalie[] {
  const anomalies: Anomalie[] = []
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const inspecteurs = utilisateurs.filter((u) => u.role === 'inspector')

  inspecteurs.forEach((u) => {
    const surveillancesCeMois = surveillances.filter((s) => {
      const d = new Date(s.date_debut)
      return (
        (s.chef_id === u.id || s.equipe_ids?.includes(u.id)) &&
        d >= startOfMonth &&
        d <= endOfMonth
      )
    })

    if (surveillancesCeMois.length >= seuilSurveillancesParMois) {
      anomalies.push({
        id: `surcharge_${u.id}_${now.getMonth()}`,
        type: 'surcharge_inspecteur',
        severite: surveillancesCeMois.length >= seuilSurveillancesParMois + 2 ? 'critique' : 'haute',
        titre: `Surcharge — ${u.prenom} ${u.nom}`,
        description: `${surveillancesCeMois.length} surveillances ce mois (seuil : ${seuilSurveillancesParMois})`,
        entiteId: u.id,
        entiteType: 'inspecteur',
        detecteeLe: now.toISOString(),
      })
    }
  })

  return anomalies
}

// ─────────────────────────────────────────────────────────────
// ÉCARTS RÉPÉTITIFS
// ─────────────────────────────────────────────────────────────

export function detectEcartsRepetitifs(
  ecarts: Ecart[],
  seuilRepetitions = 3,
): Anomalie[] {
  const anomalies: Anomalie[] = []
  const countByRefAndAero: Record<string, { count: number; aerodrome_id: string; ref: string }> = {}

  ecarts.forEach((e) => {
    const key = `${e.aerodrome_id}:${e.ref_reglementaire}`
    if (!countByRefAndAero[key]) {
      countByRefAndAero[key] = { count: 0, aerodrome_id: e.aerodrome_id, ref: e.ref_reglementaire }
    }
    countByRefAndAero[key].count++
  })

  Object.values(countByRefAndAero).forEach(({ count, aerodrome_id, ref }) => {
    if (count >= seuilRepetitions) {
      anomalies.push({
        id: `ecart_rep_${aerodrome_id}_${ref.replace(/\s/g, '_')}`,
        type: 'ecart_repetitif',
        severite: count >= seuilRepetitions + 2 ? 'critique' : 'haute',
        titre: `Écart répétitif — ${ref}`,
        description: `La référence ${ref} a été relevée ${count} fois sur cet aérodrome`,
        entiteId: aerodrome_id,
        entiteType: 'aerodrome',
        detecteeLe: new Date().toISOString(),
      })
    }
  })

  return anomalies
}

// ─────────────────────────────────────────────────────────────
// SURVEILLANCES EN RETARD
// ─────────────────────────────────────────────────────────────

export function detectSurveillancesEnRetard(
  surveillances: Surveillance[],
  now: Date,
): Anomalie[] {
  return surveillances
    .filter((s) => {
      const fin = new Date(s.date_fin)
      const retard = now > fin
      const nonTerminee = !['transmise', 'archivee', 'lettre_signee'].includes(s.statut)
      return retard && nonTerminee
    })
    .map((s) => {
      const joursRetard = Math.ceil(
        (now.getTime() - new Date(s.date_fin).getTime()) / (1000 * 60 * 60 * 24),
      )
      return {
        id: `surv_retard_${s.id}`,
        type: 'surveillance_en_retard' as AnomalieType,
        severite: joursRetard > 14 ? 'critique' : joursRetard > 7 ? 'haute' : 'normale',
        titre: `Surveillance en retard (${joursRetard}j)`,
        description: `La surveillance du ${new Date(s.date_debut).toLocaleDateString('fr-FR')} est à ${s.statut} depuis ${joursRetard} jours`,
        entiteId: s.id,
        entiteType: 'surveillance',
        detecteeLe: now.toISOString(),
      } satisfies Anomalie
    })
}

// ─────────────────────────────────────────────────────────────
// PAC EN RETARD
// ─────────────────────────────────────────────────────────────

export function detectPACsEnRetard(ecarts: Ecart[], now: Date): Anomalie[] {
  return ecarts
    .filter((e) => {
      const enAttente = ['ouvert', 'pac_attendu'].includes(e.statut)
      const depasse = e.delai_pac && new Date(e.delai_pac) < now
      return enAttente && depasse
    })
    .map((e) => {
      const joursRetard = Math.ceil(
        (now.getTime() - new Date(e.delai_pac).getTime()) / (1000 * 60 * 60 * 24),
      )
      return {
        id: `pac_retard_${e.id}`,
        type: 'pac_en_retard' as AnomalieType,
        severite: e.niveau_risque === 'critique' ? 'critique' : joursRetard > 7 ? 'haute' : 'normale',
        titre: `PAC en retard — ${e.reference}`,
        description: `L'écart ${e.reference} (${e.niveau_risque}) est sans PAC depuis ${joursRetard} jours`,
        entiteId: e.id,
        entiteType: 'ecart',
        detecteeLe: now.toISOString(),
      } satisfies Anomalie
    })
}

// ─────────────────────────────────────────────────────────────
// DÉGRADATION DU PROFIL DE RISQUE
// ─────────────────────────────────────────────────────────────

export function detectRisqueDegradation(profilsRisque: ProfilRisque[]): Anomalie[] {
  return profilsRisque
    .filter((p) => p.tendance === 'hausse' || p.niveau === 'critique')
    .map((p) => ({
      id: `risque_deg_${p.aerodrome_id}`,
      type: 'risque_degradation' as AnomalieType,
      severite: p.niveau === 'critique' ? 'critique' : 'haute',
      titre: `Risque en hausse`,
      description: `Score ${p.score_global}/100 (${p.niveau}) — tendance : ${p.tendance}`,
      entiteId: p.aerodrome_id,
      entiteType: 'aerodrome',
      detecteeLe: p.computed_at,
    }))
}

// ─────────────────────────────────────────────────────────────
// INACTIVITÉ AÉRODROMES
// ─────────────────────────────────────────────────────────────

export function detectInactiviteAerodromes(
  aerodromes: Aerodrome[],
  surveillances: Surveillance[],
  now: Date,
  seuilJours = 180,
): Anomalie[] {
  return aerodromes
    .filter((a) => a.statut === 'actif')
    .flatMap((a) => {
      const derniere = surveillances
        .filter((s) => s.aerodrome_id === a.id && ['transmise', 'archivee'].includes(s.statut))
        .sort((x, y) => new Date(y.date_debut).getTime() - new Date(x.date_debut).getTime())[0]

      if (!derniere) {
        return [{
          id: `inactif_${a.id}`,
          type: 'inactivite_aerodrome' as AnomalieType,
          severite: 'normale' as AnomalieSeverite,
          titre: `Aucune surveillance — ${a.code_oaci}`,
          description: `${a.nom} n'a jamais été surveillé`,
          entiteId: a.id,
          entiteType: 'aerodrome' as const,
          detecteeLe: now.toISOString(),
        }]
      }

      const joursInactif = Math.ceil(
        (now.getTime() - new Date(derniere.date_debut).getTime()) / (1000 * 60 * 60 * 24),
      )

      if (joursInactif >= seuilJours) {
        return [{
          id: `inactif_${a.id}`,
          type: 'inactivite_aerodrome' as AnomalieType,
          severite: joursInactif >= seuilJours * 2 ? 'critique' : 'normale',
          titre: `Inactivité ${joursInactif}j — ${a.code_oaci}`,
          description: `Dernière surveillance il y a ${joursInactif} jours`,
          entiteId: a.id,
          entiteType: 'aerodrome' as const,
          detecteeLe: now.toISOString(),
        }]
      }

      return []
    })
}

// ─────────────────────────────────────────────────────────────
// CONFLITS PLANNING
// ─────────────────────────────────────────────────────────────

export function detectConflitsPlanning(plannings: Planning[]): Anomalie[] {
  const anomalies: Anomalie[] = []
  const now = new Date()

  for (let i = 0; i < plannings.length; i++) {
    for (let j = i + 1; j < plannings.length; j++) {
      const a = plannings[i]
      const b = plannings[j]

      const sharedInspectors = (a.equipe_ids ?? []).filter((id: string) =>
        (b.equipe_ids ?? []).includes(id),
      )

      if (sharedInspectors.length === 0) continue

      const aStart = new Date(a.date_debut)
      const aEnd = new Date(a.date_fin)
      const bStart = new Date(b.date_debut)
      const bEnd = new Date(b.date_fin)

      const overlap = aStart <= bEnd && bStart <= aEnd

      if (overlap) {
        anomalies.push({
          id: `conflit_${a.id}_${b.id}`,
          type: 'conflit_planning',
          severite: 'haute',
          titre: `Conflit planning — ${sharedInspectors.length} inspecteur(s)`,
          description: `Chevauchement entre deux plannings avec ${sharedInspectors.length} inspecteur(s) commun(s)`,
          entiteId: a.id,
          entiteType: 'planning',
          detecteeLe: now.toISOString(),
        })
      }
    }
  }

  return anomalies
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────

export function groupBySeverite(anomalies: Anomalie[]): Record<AnomalieSeverite, Anomalie[]> {
  return {
    critique: anomalies.filter((a) => a.severite === 'critique'),
    haute: anomalies.filter((a) => a.severite === 'haute'),
    normale: anomalies.filter((a) => a.severite === 'normale'),
    info: anomalies.filter((a) => a.severite === 'info'),
  }
}

export function countBySeverite(anomalies: Anomalie[]): Record<AnomalieSeverite, number> {
  const g = groupBySeverite(anomalies)
  return { critique: g.critique.length, haute: g.haute.length, normale: g.normale.length, info: g.info.length }
}
