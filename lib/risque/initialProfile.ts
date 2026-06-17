// lib/risque/initialProfile.ts
// Calcul du profil de risque initial à la création d'un aérodrome ou hélistation.
// S'exécute sans données historiques (aucun écart, surveillance, événement).
// Les heuristiques sont calibrées pour éviter le faux "tout va bien" d'un aérodrome non encore audité.

import { Aerodrome, ProfilRisque } from '@/lib/store'
import { calculateC1, calculateGlobalScore } from '@/lib/risque'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecommandationInitiale {
  domaine: string
  priorite: 'critique' | 'haute' | 'moyenne' | 'basse'
  message: string
  action: string
  ref_reglementaire?: string
}

export interface ProfilInitialResult {
  profil: ProfilRisque
  recommandations: RecommandationInitiale[]
  confiance: number   // 0-100 — faible au départ (pas de données historiques)
  source: 'initial_form'
}

// ─── Heuristiques multi-domaines C3 / C4 / C5 ────────────────────────────────

const POIDS_DOMAINES: Record<string, number> = {
  SGS: 0.25, PHY: 0.15, OLS: 0.10, MFP: 0.15, SLI: 0.10, OPS: 0.15, RA: 0.10,
}

function parseCat(aerodrome: Aerodrome): number {
  return parseInt(aerodrome.categorie_sslia, 10) || 1
}

type ScoreDomaine = {
  SGS: number; PHY: number; OLS: number; MFP: number; SLI: number; OPS: number; RA: number
}

function scorePondere(domaines: ScoreDomaine): number {
  let score = 0
  for (const [dom, val] of Object.entries(domaines)) {
    score += val * (POIDS_DOMAINES[dom] || 0.10)
  }
  return score
}

function scoresDomainesC3(aerodrome: Aerodrome): ScoreDomaine {
  const cat  = parseCat(aerodrome)
  const type = aerodrome.type ?? 'national'
  const sgs  = aerodrome.maturite_sgs ?? 50
  const heli = aerodrome.type_entite === 'helistation' || aerodrome.type_entite === 'mixte'
  const precision = aerodrome.piste_principale?.type_approche === 'cat1' || aerodrome.piste_principale?.type_approche === 'cat2'
  const raRisk = aerodrome.region === 'Ziguinchor' || aerodrome.region === 'Kolda' || aerodrome.region === 'Tambacounda'

  return {
    SGS: sgs,
    PHY: heli ? 55 : 70,
    OLS: precision ? 55 : 70,
    MFP: Math.max(40, 80 - Math.max(0, (cat - 3)) * 5),
    SLI: aerodrome.horaires === 'h24' ? 60 : 75,
    OPS: type === 'international' ? 55 : type === 'national' ? 70 : 80,
    RA:  raRisk ? 50 : 75,
  }
}

function baselineC3(aerodrome: Aerodrome): number {
  const d = scoresDomainesC3(aerodrome)
  return Math.min(95, Math.max(30, Math.round(scorePondere(d))))
}

// ─── Helper : âge en mois depuis une date ────────────────────────────────────

function ageMois(dateStr: string | undefined): number | null {
  if (!dateStr) return null
  return (Date.now() - new Date(dateStr).getTime()) / (86400000 * 30.44)
}

// ─── Profil selon certification ──────────────────────────────────────────────

function profilCertifie(aerodrome: Aerodrome): {
  c1: number; c2: number; c3: number; c4: number; c5: number;
  confiance: number; scoreGlobal: number; tendance: ProfilRisque['tendance']
} {
  const age = ageMois(aerodrome.certifie_le)
  const recents = age !== null && age < 36
  const confiance = recents ? 60 : 50

  const c1 = Math.round(Math.min(95, Math.max(70, aerodrome.maturite_sgs ?? 80)))
  const c2 = 95
  const c3 = 90
  const c4 = 92
  const c5 = recents ? 90 : 80
  const scoreGlobal = calculateGlobalScore({ c1, c2, c3, c4, c5 })
  const tendance: ProfilRisque['tendance'] = !recents ? 'baisse' : (aerodrome.maturite_sgs ?? 80) >= 80 ? 'stable' : 'hausse'

  return { c1, c2, c3, c4, c5, confiance, scoreGlobal, tendance }
}

function profilHomologue(aerodrome: Aerodrome): {
  c1: number; c2: number; c3: number; c4: number; c5: number;
  confiance: number; scoreGlobal: number; tendance: ProfilRisque['tendance']
} {
  const age = ageMois(aerodrome.homologue_le)
  const recents = age !== null && age < 36
  const confiance = recents ? 40 : 30

  const c1 = Math.round(Math.min(85, Math.max(55, aerodrome.maturite_sgs ?? 65)))
  const c2 = 85
  const c3 = 80
  const c4 = 90
  const c5 = recents ? 85 : 78
  const scoreGlobal = calculateGlobalScore({ c1, c2, c3, c4, c5 })
  const tendance: ProfilRisque['tendance'] = !recents ? 'baisse' : 'stable'

  return { c1, c2, c3, c4, c5, confiance, scoreGlobal, tendance }
}

// ─── Calcul principal ────────────────────────────────────────────────────────

export function calculerProfilInitial(aerodrome: Aerodrome): ProfilInitialResult {
  // Si l'aérodrome est déjà certifié ou homologué, utiliser le profil correspondant
  if (aerodrome.statut_certification === 'certifie') {
    const p = profilCertifie(aerodrome)
    return {
      profil: construireProfil(aerodrome, p),
      recommandations: genererRecommandations(aerodrome),
      confiance: p.confiance,
      source: 'initial_form',
    }
  }
  if (aerodrome.statut_certification === 'homologue') {
    const p = profilHomologue(aerodrome)
    return {
      profil: construireProfil(aerodrome, p),
      recommandations: genererRecommandations(aerodrome),
      confiance: p.confiance,
      source: 'initial_form',
    }
  }

  // Aucun statut → heuristique (C3) + valeurs par défaut (C4=95, C5=90)
  const c1 = calculateC1(aerodrome.maturite_sgs ?? 50)
  const c3 = baselineC3(aerodrome)
  // Pas d'écarts ni d'événements à la création → scores par défaut élevés
  const c4 = 95
  const c5 = 90

  function degradeC2ParTemps(aerodrome: Aerodrome): number {
    if (!aerodrome.created_at) return 100
    const ageJours = (Date.now() - new Date(aerodrome.created_at).getTime()) / 86400000
    if (ageJours < 90) return 100
    if (ageJours < 180) return 92
    if (ageJours < 365) return 82
    if (ageJours < 730) return 68
    return 50
  }

  const c2 = degradeC2ParTemps(aerodrome)
  const scoreGlobal = calculateGlobalScore({ c1, c2, c3, c4, c5 })

  const sgs = aerodrome.maturite_sgs ?? 50
  const tendanceOffset = sgs >= 75 ? 2 : sgs <= 25 ? -4 : 0
  const tendance: ProfilRisque['tendance'] = sgs >= 75 ? 'hausse' : sgs <= 25 ? 'baisse' : 'stable'

  return {
    profil: construireProfil(aerodrome, { c1, c2, c3, c4, c5, scoreGlobal, tendance }),
    recommandations: genererRecommandations(aerodrome),
    confiance: 15,
    source: 'initial_form',
  }
}

// ─── Construction du ProfilRisque ────────────────────────────────────────────

function construireProfil(aerodrome: Aerodrome, p: {
  c1: number; c2: number; c3: number; c4: number; c5: number;
  scoreGlobal: number; tendance: ProfilRisque['tendance']
}): ProfilRisque {
  let niveau: ProfilRisque['niveau'] = 'faible'
  if (p.scoreGlobal < 30) niveau = 'critique'
  else if (p.scoreGlobal < 60) niveau = 'eleve'
  else if (p.scoreGlobal < 80) niveau = 'moyen'
  else niveau = 'faible'

  const sgs = aerodrome.maturite_sgs ?? 50
  const tendanceOffset = sgs >= 75 ? 2 : sgs <= 25 ? -4 : 0

  return {
    aerodrome_id: aerodrome.id,
    score_global: p.scoreGlobal,
    niveau,
    c1: p.c1, c2: p.c2, c3: p.c3, c4: p.c4, c5: p.c5,
    prediction_3m:  Math.min(100, Math.max(0, p.scoreGlobal + tendanceOffset)),
    infrastructure: {
      type_entite: aerodrome.type_entite,
      horaires: aerodrome.horaires,
      aides_visuelles: aerodrome.aides_visuelles,
      revetement: aerodrome.piste_principale?.revetement,
      type_approche: aerodrome.piste_principale?.type_approche,
      categorie_sslia: aerodrome.categorie_sslia,
      type: aerodrome.type,
    },
    prediction_6m:  Math.min(100, Math.max(0, p.scoreGlobal + tendanceOffset * 2)),
    prediction_12m: Math.min(100, Math.max(0, p.scoreGlobal + tendanceOffset * 3)),
    prediction_interval_3m: { lower: Math.max(0, p.scoreGlobal - 12), upper: Math.min(100, p.scoreGlobal + 12) },
    prediction_interval_6m: { lower: Math.max(0, p.scoreGlobal - 18), upper: Math.min(100, p.scoreGlobal + 18) },
    tendance: p.tendance,
    computed_at: new Date().toISOString(),
    historical_scores: [],
    hawkes_intensity: 0,
    effectiveness_score: aerodrome.statut_certification === 'certifie' ? 85 : aerodrome.statut_certification === 'homologue' ? 70 : 50,
    incident_prediction_3m:  aerodrome.statut_certification === 'certifie' ? 0.02 : aerodrome.statut_certification === 'homologue' ? 0.04 : 0.05,
    incident_prediction_6m:  aerodrome.statut_certification === 'certifie' ? 0.05 : aerodrome.statut_certification === 'homologue' ? 0.08 : 0.12,
    incident_prediction_12m: aerodrome.statut_certification === 'certifie' ? 0.10 : aerodrome.statut_certification === 'homologue' ? 0.15 : 0.22,
    event_frequency: 0,
    event_trend_acceleration: 0,
    days_since_last_event:  undefined,
    event_severity_trend:   'stable',
    bayesian_posterior: aerodrome.statut_certification === 'certifie' ? 0.15 : aerodrome.statut_certification === 'homologue' ? 0.22 : 0.30,
    bayesian_prior:     aerodrome.statut_certification === 'certifie' ? 0.15 : aerodrome.statut_certification === 'homologue' ? 0.22 : 0.30,
    bayesian_black_swan: false,
    ensemble_confidence: aerodrome.statut_certification === 'certifie' ? 0.60 : aerodrome.statut_certification === 'homologue' ? 0.40 : 0.15,
    scenarios: [
      {
        nom: 'Optimiste',
        description: aerodrome.statut_certification === 'certifie'
          ? 'Certification maintenue, SGS progresse'
          : aerodrome.statut_certification === 'homologue'
          ? 'Processus de certification engagé, surveillance conforme'
          : 'Premières surveillances conformes, SGS progresse rapidement',
        probabilite: 0.30,
        scoreProjecte: Math.min(100, p.scoreGlobal + 8),
        intervalleConfiance: [p.scoreGlobal, Math.min(100, p.scoreGlobal + 15)],
        actionsRecommandees: aerodrome.statut_certification
          ? ['Planifier la revue annuelle', 'Mettre à jour la documentation']
          : ['Maintenir le programme SGS', 'Programmer la surveillance initiale dans les 60 jours'],
      },
      {
        nom: 'Réaliste',
        description: 'Scénario médian conforme aux données disponibles',
        probabilite: 0.50,
        scoreProjecte: p.scoreGlobal,
        intervalleConfiance: [Math.max(0, p.scoreGlobal - 10), Math.min(100, p.scoreGlobal + 5)],
        actionsRecommandees: ['Poursuivre les actions en cours', 'Documenter les procédures'],
      },
      {
        nom: 'Pessimiste',
        description: 'Dérive détectée lors du prochain audit',
        probabilite: 0.15,
        scoreProjecte: Math.max(0, p.scoreGlobal - 20),
        intervalleConfiance: [Math.max(0, p.scoreGlobal - 30), p.scoreGlobal],
        actionsRecommandees: ['Planifier un audit complémentaire', 'Renforcer le dispositif SGS'],
      },
      {
        nom: 'Catastrophe',
        description: 'Défaillance critique — fermeture temporaire requise',
        probabilite: 0.05,
        scoreProjecte: Math.max(0, p.scoreGlobal - 40),
        intervalleConfiance: [0, Math.max(0, p.scoreGlobal - 25)],
        actionsRecommandees: ['Déclencher protocole d\'urgence', 'Alerter la Direction Générale ANACIM'],
      },
    ],
  }
}

// ─── Recommandations IA initiales ────────────────────────────────────────────

function genererRecommandations(aerodrome: Aerodrome): RecommandationInitiale[] {
  const recs: RecommandationInitiale[] = []
  const sgs   = aerodrome.maturite_sgs ?? 50
  const cat   = parseCat(aerodrome)
  const type  = aerodrome.type ?? 'national'
  const entite = aerodrome.type_entite ?? 'aerodrome'

  if (sgs <= 25) {
    recs.push({
      domaine: 'SGS',
      priorite: 'critique',
      message: `Maturité SGS faible (${sgs}/100) — programme de sécurité insuffisant pour l'exploitation`,
      action: 'Mettre en place un plan de renforcement SGS immédiatement (Annexe 19 OACI)',
      ref_reglementaire: 'RAS 14 I §1.4 / Annexe 19 OACI',
    })
  } else if (sgs <= 50) {
    recs.push({
      domaine: 'SGS',
      priorite: 'haute',
      message: 'SGS en développement — progression à documenter',
      action: 'Établir un plan de progression SGS sur 12 mois et programmer une surveillance de maturité',
      ref_reglementaire: 'RAS 14 I §1.4',
    })
  } else {
    recs.push({
      domaine: 'SGS',
      priorite: 'basse',
      message: `SGS mature (${sgs}/100) — maintenir le programme de revue périodique`,
      action: 'Planifier la revue annuelle SGS et la mise à jour du Manuel de Sécurité',
      ref_reglementaire: 'RAS 14 I §1.4',
    })
  }

  // ── SSLIA ──
  if (cat >= 7) {
    recs.push({
      domaine: 'SLI',
      priorite: 'critique',
      message: `Catégorie SSLIA ${cat} — niveau critique : équipements lourds et personnels spécialisés requis`,
      action: `Vérifier la dotation complète en équipements SSLIA cat. ${cat} avant toute opération`,
      ref_reglementaire: 'RAS 14 I Partie 9 / Doc OACI 9137',
    })
  } else if (cat >= 4) {
    recs.push({
      domaine: 'SLI',
      priorite: 'haute',
      message: `Catégorie SSLIA ${cat} — surveillance du dispositif de secours obligatoire`,
      action: `Programmer un exercice SSLIA dans les 30 jours suivant l'ouverture`,
      ref_reglementaire: 'RAS 14 I Partie 9',
    })
  } else {
    recs.push({
      domaine: 'SLI',
      priorite: 'moyenne',
      message: `Catégorie SSLIA ${cat} — vérifier la conformité des équipements de secours`,
      action: 'Réaliser une inspection SSLIA lors de la première surveillance physique',
      ref_reglementaire: 'RAS 14 I Partie 9',
    })
  }

  // ── International ──
  if (type === 'international') {
    recs.push({
      domaine: 'OPS',
      priorite: 'haute',
      message: 'Aérodrome international — exigences OACI renforcées sur tous les domaines',
      action: 'Réaliser un audit initial complet (PHY, OLS, MFP, SLI, SGS, OPS) dans les 90 jours',
      ref_reglementaire: 'Annexe 14 OACI Vol. I / RAS 14',
    })
  }

  // ── Hélistation ──
  if (entite === 'helistation' || entite === 'mixte') {
    recs.push({
      domaine: 'PHY',
      priorite: 'haute',
      message: 'Hélistation — normes surfaces de poser, marques H et obstacles spécifiques',
      action: 'Vérifier conformité TLOF/FATO, marquages H, balise lumineuse et dégagement obstacles',
      ref_reglementaire: 'RAS 14 II / Doc OACI 9261',
    })
  }

  // ── Conformité physique (toujours) ──
  recs.push({
    domaine: 'PHY',
    priorite: type === 'international' ? 'haute' : 'moyenne',
    message: 'Aucune surveillance physique enregistrée — état initial des infrastructures inconnu',
    action: 'Programmer une surveillance PHY initiale dans les 60 jours (piste, balisage, clôture, obstacles)',
    ref_reglementaire: 'RAS 14 I Partie 3',
  })

  // ── Obstacle Limitation Surface ──
  recs.push({
    domaine: 'OLS',
    priorite: 'moyenne',
    message: 'Surface de limitation d\'obstacles à vérifier — risque de pénétration non détectée',
    action: 'Effectuer un relevé OLS initial et mettre à jour le registre des obstacles',
    ref_reglementaire: 'RAS 14 I Partie 4',
  })

  // ── Risque animalier ──
  if (aerodrome.region === 'Ziguinchor' || aerodrome.region === 'Kolda' || aerodrome.region === 'Tambacounda') {
    recs.push({
      domaine: 'RA',
      priorite: 'haute',
      message: 'Région à risque animalier élevé — plan de gestion faune requis',
      action: 'Élaborer ou mettre à jour le Plan de Gestion du Risque Animalier (PGRA)',
      ref_reglementaire: 'RAS 14 I §9.4 / Circulaire ANACIM RA',
    })
  }

  return recs
}

// ─── Résumé textuel pour notifications ───────────────────────────────────────

export function resumeRisqueInitial(result: ProfilInitialResult): string {
  const { profil, recommandations } = result
  const niveauLabel = {
    critique: '🔴 CRITIQUE',
    eleve:    '🟠 ÉLEVÉ',
    moyen:    '🟡 MODÉRÉ',
    faible:   '🟢 FAIBLE',
  }[profil.niveau]
  const critiques = recommandations.filter(r => r.priorite === 'critique').length
  const hautes    = recommandations.filter(r => r.priorite === 'haute').length
  return `Risque initial ${niveauLabel} (${profil.score_global}/100) · ${critiques} action(s) critique(s), ${hautes} haute(s) priorité`
}
