// lib/competences.ts — SGDA V5
// Suivi des compétences et habilitations des inspecteurs.
// ✅ R3 : 0 fetch direct — utilise les données passées en paramètre depuis le store.

import type { Utilisateur, Surveillance, Formation } from './store'
import { DOMAINES_SURVEILLANCE } from './domaines'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface CompetenceScore {
  userId: string
  score: number // 0–100
  niveau: 'expert' | 'confirme' | 'debutant' | 'insuffisant'
  domainesCouverts: string[]
  surveillancesRealisees: number
  formationsValidees: number
  habilitations: HabilitationItem[]
  derniereEvaluation?: string
}

export interface HabilitationItem {
  domaine: string
  typeHabilitation: string
  dateObtention: string
  dateExpiration: string
  statut: 'valide' | 'expire' | 'expire_bientot'
  joursRestants: number
}

export interface EcheanceAlert {
  userId: string
  inspecteurNom: string
  type: 'habilitation' | 'formation' | 'visite_medicale'
  label: string
  dateExpiration: string
  joursRestants: number
  priorite: 'critique' | 'haute' | 'normale'
}

export interface FormationSuggestion {
  userId: string
  domaineManquant: string
  formationSuggeree: string
  priorite: 'haute' | 'normale' | 'basse'
  raison: string
}

// ─────────────────────────────────────────────────────────────
// CALCUL SCORE COMPÉTENCE
// ─────────────────────────────────────────────────────────────

const DOMAINES_CONNUS = DOMAINES_SURVEILLANCE.map(d => d.code).filter(c => c !== 'AGA')

export function computeCompetenceScore(
  user: Utilisateur,
  surveillances: Surveillance[],
  formations: Formation[],
): CompetenceScore {
  const userSurveillances = surveillances.filter(
    (s) => s.chef_id === user.id || s.equipe_ids?.includes(user.id),
  )
  const userFormations = formations.filter(
    (f) => f.participants?.includes(user.id) && f.statut === 'terminee',
  )

  const domainesCoverts = new Set<string>()
  userSurveillances.forEach((s) => {
    if (Array.isArray(s.portee)) s.portee.forEach((d) => domainesCoverts.add(d))
  })
  userFormations.forEach((f) => {
    if (Array.isArray(f.domaines)) f.domaines.forEach((d) => domainesCoverts.add(d))
  })

  const habilitations = buildHabilitations(user)
  const habilsValides = habilitations.filter((h) => h.statut === 'valide').length
  const coverageRatio = domainesCoverts.size / DOMAINES_CONNUS.length

  // Score pondéré : 40% couverture domaines, 30% surv réalisées, 20% formations, 10% habilitations
  const scoreCoverage = coverageRatio * 40
  const scoreSurv = Math.min(userSurveillances.length / 20, 1) * 30
  const scoreFormations = Math.min(userFormations.length / 5, 1) * 20
  const scoreHabil = habilitations.length > 0 ? (habilsValides / habilitations.length) * 10 : 0

  const score = Math.round(scoreCoverage + scoreSurv + scoreFormations + scoreHabil)

  let niveau: CompetenceScore['niveau']
  if (score >= 75) niveau = 'expert'
  else if (score >= 50) niveau = 'confirme'
  else if (score >= 25) niveau = 'debutant'
  else niveau = 'insuffisant'

  return {
    userId: user.id,
    score,
    niveau,
    domainesCouverts: Array.from(domainesCoverts),
    surveillancesRealisees: userSurveillances.length,
    formationsValidees: userFormations.length,
    habilitations,
  }
}

function buildHabilitations(user: Utilisateur): HabilitationItem[] {
  const habilitations: HabilitationItem[] = []
  const certifs = (user as { certifications?: { domaine: string; type: string; date_obtention: string; date_expiration: string }[] }).certifications ?? []

  certifs.forEach((c) => {
    const expDate = new Date(c.date_expiration)
    const now = new Date()
    const joursRestants = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    let statut: HabilitationItem['statut']
    if (joursRestants < 0) statut = 'expire'
    else if (joursRestants <= 30) statut = 'expire_bientot'
    else statut = 'valide'

    habilitations.push({
      domaine: c.domaine,
      typeHabilitation: c.type,
      dateObtention: c.date_obtention,
      dateExpiration: c.date_expiration,
      statut,
      joursRestants: Math.max(joursRestants, 0),
    })
  })

  return habilitations
}

// ─────────────────────────────────────────────────────────────
// DÉTECTION ÉCHÉANCES
// ─────────────────────────────────────────────────────────────

export function detectEcheances(
  utilisateurs: Utilisateur[],
  formations: Formation[],
  seuil30j = true,
  seuil90j = false,
): EcheanceAlert[] {
  const alerts: EcheanceAlert[] = []
  const now = new Date()

  utilisateurs
    .filter((u) => u.role === 'inspector')
    .forEach((u) => {
      const habilitations = buildHabilitations(u)
      habilitations.forEach((h) => {
        if (h.statut === 'expire') {
          alerts.push({
            userId: u.id,
            inspecteurNom: `${u.prenom} ${u.nom}`,
            type: 'habilitation',
            label: `${h.domaine} — ${h.typeHabilitation}`,
            dateExpiration: h.dateExpiration,
            joursRestants: 0,
            priorite: 'critique',
          })
        } else if (h.statut === 'expire_bientot') {
          alerts.push({
            userId: u.id,
            inspecteurNom: `${u.prenom} ${u.nom}`,
            type: 'habilitation',
            label: `${h.domaine} — ${h.typeHabilitation}`,
            dateExpiration: h.dateExpiration,
            joursRestants: h.joursRestants,
            priorite: h.joursRestants <= 7 ? 'critique' : 'haute',
          })
        }
      })
    })

  formations
    .filter((f) => f.statut === 'planifiee' || f.statut === 'en_cours')
    .forEach((f) => {
      const expDate = new Date(f.date)
      const joursRestants = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      const seuil = seuil90j ? 90 : seuil30j ? 30 : 0

      if (joursRestants >= 0 && joursRestants <= seuil) {
        f.participants?.forEach((uid: string) => {
          const u = utilisateurs.find((u) => u.id === uid)
          if (!u) return
          alerts.push({
            userId: uid,
            inspecteurNom: `${u.prenom} ${u.nom}`,
            type: 'formation',
            label: f.titre ?? 'Formation',
            dateExpiration: f.date,
            joursRestants,
            priorite: joursRestants <= 7 ? 'critique' : 'normale',
          })
        })
      }
    })

  return alerts.sort((a, b) => a.joursRestants - b.joursRestants)
}

// ─────────────────────────────────────────────────────────────
// SUGGESTIONS DE FORMATIONS
// ─────────────────────────────────────────────────────────────

export function suggestFormations(
  utilisateurs: Utilisateur[],
  surveillances: Surveillance[],
  formations: Formation[],
): FormationSuggestion[] {
  const suggestions: FormationSuggestion[] = []

  utilisateurs
    .filter((u) => u.role === 'inspector')
    .forEach((u) => {
      const score = computeCompetenceScore(u, surveillances, formations)
      const domainesManquants = DOMAINES_CONNUS.filter((d) => !score.domainesCouverts.includes(d))

      domainesManquants.forEach((domaine) => {
        suggestions.push({
          userId: u.id,
          domaineManquant: domaine,
          formationSuggeree: `Formation ${domaine} — Sécurité des aérodromes`,
          priorite: score.niveau === 'insuffisant' ? 'haute' : 'normale',
          raison: `${u.prenom} ${u.nom} n'a aucune surveillance ni formation sur le domaine ${domaine}`,
        })
      })

      if (score.surveillancesRealisees < 3) {
        suggestions.push({
          userId: u.id,
          domaineManquant: 'PRATIQUE',
          formationSuggeree: 'Accompagnement terrain avec inspecteur senior',
          priorite: 'haute',
          raison: `Moins de 3 surveillances réalisées — expérience pratique insuffisante`,
        })
      }
    })

  return suggestions
}

// ─────────────────────────────────────────────────────────────
// ALERTES CERTIFICATIONS
// ─────────────────────────────────────────────────────────────

export function generateCertifAlerts(utilisateurs: Utilisateur[]): EcheanceAlert[] {
  return detectEcheances(utilisateurs, [], true, false)
    .filter((a) => a.type === 'habilitation')
}
