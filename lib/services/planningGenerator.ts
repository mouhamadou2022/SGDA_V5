// lib/services/planningGenerator.ts
// Générateur centralisé de planning — consolide profil de risque + carry-over écarts/PAC + certification
// Plan glissant 12 mois, par aérodrome, avec détails exploitant

import type { Planning, ProfilRisque, Ecart, Certification, Homologation } from '@/lib/store'
import { computeFinalFrequency, suggestMissionType } from '@/lib/risque/frequency'

export interface PlanningSource {
  type: 'profil_risque' | 'carryover_ecart' | 'carryover_pac' | 'certification_renouvellement' | 'injection'
  raison: string
  details?: string[]
}

export interface PlanningProposal extends Partial<Planning> {
  source: PlanningSource
  sort_order: number // pour trier par priorité
}

export interface PlanningGeneratorParams {
  aerodromeId: string
  annee: number
  profilRisque?: ProfilRisque
  ecartsActifs?: Ecart[]
  certifications?: Certification[]
  homologations?: Homologation[]
  inspecteurs?: { id: string; prenom: string; nom: string; competences?: any[] }[]
  historiqueSurveillances?: { type: string; date: string; domaines: string[] }[]
}

/**
 * Génère le planning glissant 12 mois pour un aérodrome.
 * Consolide 4 sources : profil de risque, carry-over écarts, carry-over PAC, certification.
 */
export function genererPlanning(
  params: PlanningGeneratorParams
): PlanningProposal[] {
  const { aerodromeId, annee, profilRisque, ecartsActifs = [], certifications = [], homologations = [], inspecteurs = [], historiqueSurveillances = [] } = params
  const propositions: PlanningProposal[] = []

  // ── SOURCE 1 : Profil de risque → maintien / périodique / audit ──
  if (profilRisque) {
    const nbEcartsCritiques = ecartsActifs.filter(e => e.niveau_risque === 'critique').length
    const hasPendingPac = ecartsActifs.some(e => e.pac && ['pac_attendu', 'pac_soumis'].includes(e.statut))
    const typeAero = 'national'

    // Fréquence basée sur le niveau de risque
    const riskLevel = profilRisque.niveau === 'critique' ? 'critique'
      : profilRisque.niveau === 'eleve' ? 'élevé'
      : profilRisque.niveau === 'moyen' ? 'moyen'
      : 'faible'
    const freqResult = computeFinalFrequency({ riskLevel: riskLevel as any })
    const frequence = typeof freqResult === 'number' ? freqResult : (freqResult as any).frequencyPerYear || 2
    const freqLabel = typeof freqResult === 'object' ? (freqResult as any).label || '' : ''

    const isCertPhase = historiqueSurveillances.some(h => h.type === 'certification')
    const missionType = suggestMissionType({
      riskLevel: (riskLevel as any),
      hasCriticalEcarts: nbEcartsCritiques > 0,
      hasPacInProgress: hasPendingPac,
      isCertificationPhase: isCertPhase,
    })

    // Domaines prioritaires basés sur C2/C3
    const domainesPrioritaires: string[] = profilRisque.c3 < 50
      ? ['PHY', 'OLS', 'ELEC', 'MFP']
      : profilRisque.c2 < 50
        ? ['SLI', 'RA', 'COP', 'OPS']
        : ['SLI', 'PHY', 'OLS', 'ELEC', 'MFP', 'RA', 'COP', 'OPS']

    const intervalle = Math.floor(12 / Math.max(frequence, 1))

    for (let i = 0; i < frequence; i++) {
      const mois = i * intervalle
      const debut = new Date(annee, mois, 1)
      const fin = new Date(annee, mois, 3)
      const domaines = domainesPrioritaires.slice(0, Math.min(3 + i, 8))

      const objectifs = buildObjectifsProfil(missionType, domaines, profilRisque, freqLabel, '')

      propositions.push({
        aerodrome_id: aerodromeId,
        type: missionType as Planning['type'],
        date_debut: debut.toISOString(),
        date_fin: fin.toISOString(),
        portee: domaines,
        equipe_ids: [],
        chef_id: '',
        statut: 'planifiee',
        priorite: profilRisque.score_global < 30 ? 'critique' : profilRisque.score_global < 50 ? 'haute' : profilRisque.score_global < 70 ? 'moyenne' : 'basse',
        objectifs,
        est_proposition: true,
        annee_cible: annee,
        source: {
          type: 'profil_risque',
          raison: `Fréquence ${freqLabel || `${frequence}/an`} — Score ${profilRisque.score_global}/100 (${profilRisque.niveau})`,
          details: domaines.map(d => `Domaine ${d} : C1=${profilRisque.c1} C2=${profilRisque.c2} C3=${profilRisque.c3} C5=${profilRisque.c5}`),
        },
        sort_order: 3, // priorité moyenne
      })
    }
  }

  // ── SOURCE 2 : Carry-over écarts → suivi_ecarts ──
  const ecartsASuivre = ecartsActifs.filter(e => {
    if (e.statut === 'cloture') return false
    return ['ouvert', 'pac_attendu', 'pac_soumis', 'pac_refuse', 'en_retard'].includes(e.statut)
  })

  if (ecartsASuivre.length > 0) {
    const debut = new Date(annee, 0, 15)
    const fin = new Date(annee, 0, 16)
    const ecartsDetails = ecartsASuivre.map(e =>
      `Écart ${e.reference} : ${e.libelle?.substring(0, 80) || 'sans libellé'} (${e.niveau_risque}, statut: ${e.statut}, délai: ${e.delai_regularisation || e.delai_pac || 'non défini'})`
    )

    propositions.push({
      aerodrome_id: aerodromeId,
      type: 'suivi_ecarts',
      date_debut: debut.toISOString(),
      date_fin: fin.toISOString(),
      portee: [...new Set(ecartsASuivre.map(e => e.domaine).filter(Boolean))] as string[],
      equipe_ids: [],
      chef_id: '',
      statut: 'planifiee',
      priorite: ecartsASuivre.some(e => e.niveau_risque === 'critique') ? 'critique' : 'haute',
      objectifs: `[CARRY-OVER] Suivi de ${ecartsASuivre.length} écart(s) non clôturé(s) de l'année précédente.\n${ecartsDetails.join('\n')}`,
      est_proposition: true,
      annee_cible: annee,
      source: {
        type: 'carryover_ecart',
        raison: `${ecartsASuivre.length} écart(s) nécessitent un suivi`,
        details: ecartsASuivre.map(e => e.reference),
      },
      sort_order: 1, // priorité haute
    })
  }

  // ── SOURCE 3 : Carry-over PAC → mise_oeuvre_pac ──
  const pacsASuivre = ecartsActifs.filter(e => {
    if (e.statut === 'cloture') return false
    return e.pac && ['pac_accepte', 'preuves_soumises', 'preuves_evaluees'].includes(e.statut)
  })

  if (pacsASuivre.length > 0) {
    const debut = new Date(annee, 1, 1)
    const fin = new Date(annee, 1, 2)
    const pacDetails = pacsASuivre.map(e => {
      const actions = (e.pac?.actions || []).map(a =>
        `  → ${a.description?.substring(0, 60)} (resp: ${a.responsable}, prévu: ${a.date_prevue?.substring(0, 10) || '?'})`
      ).join('\n')
      return `Écart ${e.reference} — PAC v${e.pac?.version || '?'} :\n${actions}`
    })

    propositions.push({
      aerodrome_id: aerodromeId,
      type: 'mise_oeuvre_pac',
      date_debut: debut.toISOString(),
      date_fin: fin.toISOString(),
      portee: [...new Set(pacsASuivre.map(e => e.domaine).filter(Boolean))] as string[],
      equipe_ids: [],
      chef_id: '',
      statut: 'planifiee',
      priorite: 'haute',
      objectifs: `[CARRY-OVER] Vérification de la mise en œuvre de ${pacsASuivre.length} PAC accepté(s).\n${pacDetails.join('\n\n')}`,
      est_proposition: true,
      annee_cible: annee,
      source: {
        type: 'carryover_pac',
        raison: `${pacsASuivre.length} PAC accepté(s) sans preuves validées`,
        details: pacsASuivre.map(e => e.reference),
      },
      sort_order: 2, // priorité moyennement haute
    })
  }

  // ── SOURCE 4 : Certification → renouvellement ──
  const certsExpirant = (certifications || []).filter(c => {
    if (!c.date_expiration || c.statut_global !== 'certifie') return false
    const expireAt = new Date(c.date_expiration)
    const debutAnnee = new Date(annee, 0, 1)
    const finAnnee = new Date(annee + 1, 0, 1)
    return expireAt >= debutAnnee && expireAt < finAnnee
  })

  if (certsExpirant.length > 0) {
    for (const cert of certsExpirant) {
      const expireDate = new Date(cert.date_expiration!)
      // Planifier 4 mois avant expiration
      const debut = new Date(expireDate.getTime() - 120 * 24 * 60 * 60 * 1000)
      const fin = new Date(debut.getTime() + 5 * 24 * 60 * 60 * 1000)

      propositions.push({
        aerodrome_id: aerodromeId,
        type: 'certification',
        date_debut: debut.toISOString(),
        date_fin: fin.toISOString(),
        portee: ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS'],
        equipe_ids: [],
        chef_id: '',
        statut: 'planifiee',
        priorite: 'haute',
        objectifs: `[RENOUVELLEMENT] Certification ${cert.numero_cert || cert.reference} expire le ${expireDate.toLocaleDateString('fr-FR')}.\nRenouvellement : Phase 1 sautée (dossier existant), début à la Phase 2.\nTous les domaines + SGS inclus.\nPréparez le dossier de renouvellement avant l'inspection.`,
        est_proposition: true,
        annee_cible: annee,
        declencheur: 'renouvellement',
        source: {
          type: 'certification_renouvellement',
          raison: `Certificat expire le ${expireDate.toLocaleDateString('fr-FR')}`,
          details: [`Numéro: ${cert.numero_cert || 'N/A'}`, `Phase 1 sautée — renouvellement`],
        },
        sort_order: 1,
      })
    }
  }

  return propositions.sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return new Date(a.date_debut || '').getTime() - new Date(b.date_debut || '').getTime()
  })
}

function buildObjectifsProfil(
  type: string,
  domaines: string[],
  profil: ProfilRisque,
  freqJust: string,
  typeJust: string
): string {
  const details: string[] = []
  details.push(`[PROFIL] Score global : ${profil.score_global}/100 (${profil.niveau})`)
  details.push(`C1 (SGS) : ${profil.c1}/100 — C2 (PAC) : ${profil.c2}/100 — C3 (Conformité) : ${profil.c3}/100`)
  details.push(`C4 (Charge) : ${profil.c4}/100 — C5 (Événements) : ${profil.c5}/100`)
  details.push(`Domaines ciblés : ${domaines.join(', ')}`)
  if (freqJust) details.push(`Fréquence : ${freqJust}`)
  if (typeJust) details.push(`Type : ${type === 'maintien' ? 'Maintien (revérification items SA + nouveaux risques)' : type === 'audit_complet' ? 'Audit complet (tous domaines)' : 'Périodique standard'}`)
  return details.join('\n')
}

/**
 * Génère un résumé texte du planning pour l'exploitant (utilisé pour email IA et portail)
 */
export function genererResumeExploitant(
  propositions: PlanningProposal[],
  aerodromeNom: string,
  annee: number
): string {
  if (propositions.length === 0) return `Aucune inspection planifiée pour ${aerodromeNom} en ${annee}.`

  const parType: Record<string, PlanningProposal[]> = {}
  for (const p of propositions) {
    const t = p.type || 'autre'
    if (!parType[t]) parType[t] = []
    parType[t].push(p)
  }

  const lignes: string[] = []
  lignes.push(`Plan de surveillance ${annee} — ${aerodromeNom}`)
  lignes.push(`Total : ${propositions.length} inspection(s)\n`)

  for (const [type, props] of Object.entries(parType)) {
    const label = type === 'suivi_ecarts' ? 'Suivi des écarts'
      : type === 'mise_oeuvre_pac' ? 'Mise en œuvre PAC'
      : type === 'certification' ? 'Certification'
      : type === 'maintien' ? 'Maintien'
      : type === 'audit_complet' ? 'Audit complet'
      : 'Périodique'

    lignes.push(`${label} (${props.length}) :`)
    for (const p of props) {
      const debut = p.date_debut ? new Date(p.date_debut).toLocaleDateString('fr-FR') : '?'
      const fin = p.date_fin ? new Date(p.date_fin).toLocaleDateString('fr-FR') : '?'
      lignes.push(`  ${debut} → ${fin} — ${p.source.raison}`)
    }
    lignes.push('')
  }

  return lignes.join('\n')
}
