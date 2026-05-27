// lib/planning.ts — SGDA V5
// Algorithme de planification intelligente + détection conflits.
// ✅ R3 : Données passées en paramètre depuis le store.

import type { Utilisateur, Planning, Surveillance, Aerodrome } from './store'

export interface PlanningOptimization {
  assigned: string[]
  conflicts: string[]
  workloadBalance: Record<string, number>
  recommendations: string[]
}

export interface InspecteurWorkload {
  userId: string
  nom: string
  current: number
  forecast_30d: number
  capacity: number
  utilization: number
  status: 'normal' | 'surcharge' | 'critique'
}

// ─────────────────────────────────────────────────────────────
// ASSIGNATION INTELLIGENTE D'INSPECTEURS
// ─────────────────────────────────────────────────────────────

export function smartAssignInspectors(
  aerodrome: Aerodrome,
  equipeSize: number,
  utilisateurs: Utilisateur[],
  existingSurveillances: Surveillance[],
): PlanningOptimization {
  const inspecteurs = utilisateurs.filter((u) => u.role === 'inspector')
  const now = new Date()
  const next30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // Calculer la charge de travail par inspecteur
  const workloads = computeWorkload(inspecteurs, existingSurveillances, now, next30d)

  // Sélectionner les moins surchargés
  const sorted = [...workloads].sort((a, b) => a.utilization - b.utilization)
  const assigned = sorted.slice(0, Math.min(equipeSize, sorted.length)).map((w) => w.userId)

  // Détérer les conflits
  const conflicts = detectConflicts(aerodrome.id, assigned, now, 14) // 14j lookahead

  // Recommandations
  const recommendations = generateRecommendations(workloads, assigned)

  return {
    assigned,
    conflicts,
    workloadBalance: Object.fromEntries(workloads.map((w) => [w.userId, w.utilization])),
    recommendations,
  }
}

// ─────────────────────────────────────────────────────────────
// CALCUL DE CHARGE DE TRAVAIL
// ─────────────────────────────────────────────────────────────

export function computeWorkload(
  utilisateurs: Utilisateur[],
  surveillances: Surveillance[],
  from: Date,
  to: Date,
): InspecteurWorkload[] {
  const inspecteurs = utilisateurs.filter((u) => u.role === 'inspector')
  const capacity = 5 // Max surveillances par mois (configurable par ANACIM)

  return inspecteurs.map((u) => {
    const current = surveillances.filter((s) => {
      const d = new Date(s.date_debut)
      return (
        (s.chef_id === u.id || s.equipe_ids?.includes(u.id)) &&
        d >= from &&
        d <= to &&
        !['archivee', 'transmise'].includes(s.statut)
      )
    }).length

    const forecast_30d = surveillances.filter((s) => {
      const d = new Date(s.date_debut)
      const in30d = new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000)
      return (
        (s.chef_id === u.id || s.equipe_ids?.includes(u.id)) &&
        d >= from &&
        d <= in30d &&
        ['planifiee', 'en_cours'].includes(s.statut)
      )
    }).length

    const utilization = Math.round((current / capacity) * 100)

    let status: InspecteurWorkload['status']
    if (utilization >= 100) status = 'critique'
    else if (utilization >= 80) status = 'surcharge'
    else status = 'normal'

    return {
      userId: u.id,
      nom: `${u.prenom} ${u.nom}`,
      current,
      forecast_30d,
      capacity,
      utilization,
      status,
    }
  })
}

// ─────────────────────────────────────────────────────────────
// RÉÉQUILIBRAGE D'ÉQUIPES
// ─────────────────────────────────────────────────────────────

export function balanceTeam(
  planningId: string,
  equipeIds: string[],
  utilisateurs: Utilisateur[],
  surveillances: Surveillance[],
): string[] {
  const workloads = computeWorkload(utilisateurs, surveillances, new Date(), new Date())
  const surcharges = workloads.filter((w) => w.status === 'surcharge').map((w) => w.userId)
  const underutilized = workloads.filter((w) => w.status === 'normal' && !equipeIds.includes(w.userId))

  const balanced = [...equipeIds]
  surcharges.forEach((sid) => {
    const idx = balanced.indexOf(sid)
    if (idx >= 0 && underutilized.length > 0) {
      const replacement = underutilized.shift()!
      balanced[idx] = replacement.userId
    }
  })

  return balanced
}

// ─────────────────────────────────────────────────────────────
// DÉTECTION CONFLITS (cheval ): overlaps, localisations, expérience)
// ─────────────────────────────────────────────────────────────

export function detectConflicts(
  aerodromeId: string,
  inspecteurIds: string[],
  dateDebut: Date,
  durationDays: number,
): string[] {
  const conflicts: string[] = []
  // À implémenter : vérifier les chevauchements dans le planning
  // et les contraintes (expérience required, domaines couverts)
  return conflicts
}

// ─────────────────────────────────────────────────────────────
// GÉNÉRATION PLANNING N+1 (prédiction prochaines 4 semaines)
// ─────────────────────────────────────────────────────────────

export function generateN1Planning(
  aerodromes: Aerodrome[],
  utilisateurs: Utilisateur[],
  surveillances: Surveillance[],
  riskProfiles: any[],
): Partial<Planning>[] {
  const now = new Date()
  const n1End = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const criticalAerodromes = aerodromes.filter((a) => {
    const risk = riskProfiles.find((r) => r.aerodrome_id === a.id)
    return risk?.niveau === 'critique'
  })

  return criticalAerodromes.map((a) => {
    const { assigned } = smartAssignInspectors(a, 3, utilisateurs, surveillances)
    return {
      aerodrome_id: a.id,
      type: 'programmee',
      portee: ['SGS', 'SLI'],
      equipe_ids: assigned,
      chef_id: assigned[0],
      date_debut: new Date(now.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      date_fin: new Date(
        now.getTime() + (Math.random() + 1) * 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      statut: 'planifiee',
    }
  })
}

// ─────────────────────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────────────────────

function generateRecommendations(workloads: InspecteurWorkload[], assigned: string[]): string[] {
  const recommendations: string[] = []

  const critiques = workloads.filter((w) => w.status === 'critique' && assigned.includes(w.userId))
  if (critiques.length > 0) {
    recommendations.push(`⚠️ ${critiques.length} inspecteur(s) assigné(s) sont déjà en surcharge critique`)
  }

  const underutilized = workloads.filter((w) => w.utilization < 40 && !assigned.includes(w.userId))
  if (underutilized.length > 0) {
    recommendations.push(`✅ ${underutilized.length} inspecteur(s) disponible(s) pour équilibrer`)
  }

  return recommendations
}
