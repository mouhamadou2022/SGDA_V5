// lib/risque/amdecEngine.ts
// AMDEC — Analyse des Modes de Défaillance et de leurs Effets et Criticité
// Approche bottom-up (OACI Doc 9859) : par système/équipement, on liste
// mode de défaillance → effet → cause → détection, puis criticité IPR.
//
// IPR = Gravité (OACI A-E) × Probabilité (1-5) × Détection (1-5) → plage 1-125.
// Priorisation : critique (IPR ≥ 60), élevé (≥ 40), moyen (≥ 20), faible.
// Une criticité élevée non corrigée dégrade le C3 du profil de risque.

import type { NiveauGravite } from './types'

// ─────────────────────────────────────────────────────────────
// SCORES IPR
// ─────────────────────────────────────────────────────────────

export type NiveauIPR = 'critique' | 'eleve' | 'moyen' | 'faible'
export type StatutAmdec = 'a_analyser' | 'analyse' | 'surveille' | 'corrige'

// Gravité OACI (A = catastrophique → 5, E = négligeable → 1)
export const GRAVITE_VALEUR: Record<NiveauGravite, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 }

export const GRAVITE_LABEL: Record<NiveauGravite, string> = {
  A: 'Catastrophique',
  B: 'Dangereuse',
  C: 'Majeure',
  D: 'Mineure',
  E: 'Négligeable',
}

export const PROBABILITE_LABEL: Record<number, string> = {
  1: 'Extrêmement improbable',
  2: 'Improbable',
  3: 'Probable',
  4: 'Occasionnelle',
  5: 'Fréquente',
}

export const DETECTION_LABEL: Record<number, string> = {
  1: 'Détection immédiate',
  2: 'Bonne détection',
  3: 'Détection occasionnelle',
  4: 'Détection difficile',
  5: 'Non détectable',
}

export function calculeIPR(gravite: NiveauGravite, probabilite: number, detectionScore: number): number {
  return GRAVITE_VALEUR[gravite] * Math.min(5, Math.max(1, probabilite)) * Math.min(5, Math.max(1, detectionScore))
}

export function getIPRNiveau(ipr: number): NiveauIPR {
  if (ipr >= 60) return 'critique'
  if (ipr >= 40) return 'eleve'
  if (ipr >= 20) return 'moyen'
  return 'faible'
}

export const IPR_COULEURS: Record<NiveauIPR, string> = {
  critique: '#dc2626',
  eleve: '#ea580c',
  moyen: '#eab308',
  faible: '#16a34a',
}

export const IPR_LABELS: Record<NiveauIPR, string> = {
  critique: 'Critique',
  eleve: 'Élevé',
  moyen: 'Moyen',
  faible: 'Faible',
}

export const STATUT_LABELS: Record<StatutAmdec, string> = {
  a_analyser: 'À analyser',
  analyse: 'Analysé',
  surveille: 'Surveillé',
  corrige: 'Corrigé',
}

// ─────────────────────────────────────────────────────────────
// CATALOGUE DES MODES DE DÉFAILLANCE (référence par domaine)
// ─────────────────────────────────────────────────────────────

export interface ModeDefaillanceRef {
  id: string
  domaine: string
  systeme: string
  equipement: string
  mode: string
  effet: string
  cause: string
  detection: string
  gravite: NiveauGravite
  probabilite: number // 1-5
  detectionScore: number // 1-5
}

export const CATALOGUE_AMDEC: ModeDefaillanceRef[] = [
  // ── SLI — Service SSLIA ─────────────────────────────────────
  { id: 'sli-01', domaine: 'SLI', systeme: 'Service SSLIA', equipement: 'Véhicules d\'extinction', mode: 'Véhicule SSLIA inopérant', effet: 'Impossibilité d\'intervenir dans les délais sur un incendie — perte de capacité de sauvetage', cause: 'Maintenance préventive insuffisante, pannes moteur/pompe', detection: 'Essais journaliers SSLIA', gravite: 'A', probabilite: 3, detectionScore: 2 },
  { id: 'sli-02', domaine: 'SLI', systeme: 'Service SSLIA', equipement: 'Effectifs SSLIA', mode: 'Effectif SSLIA en sous-nombre', effet: 'Temps d\'intervention supérieur au délai réglementaire (catégorie non tenue)', cause: 'Absentéisme, planification insuffisante, manque de recrutement', detection: 'Contrôle de présence / pointage', gravite: 'A', probabilite: 4, detectionScore: 3 },
  { id: 'sli-03', domaine: 'SLI', systeme: 'Service SSLIA', equipement: 'Agent extincteur', mode: 'Quantité d\'agent extincteur insuffisante', effet: 'Extinction incomplète — propagation de l\'incendie', cause: 'Reconstitution retardée après intervention, fuite réservoir', detection: 'Inspection mensuelle des stocks', gravite: 'A', probabilite: 3, detectionScore: 3 },
  { id: 'sli-04', domaine: 'SLI', systeme: 'Service SSLIA', equipement: 'Personnel SSLIA', mode: 'Personnel non formé / non habilité', effet: 'Manipulation incorrecte des équipements — intervention inefficace', cause: 'Formation initiale et recyclage non réalisés', detection: 'Vérification des dossiers de formation', gravite: 'B', probabilite: 3, detectionScore: 3 },
  { id: 'sli-05', domaine: 'SLI', systeme: 'Service SSLIA', equipement: 'Alimentation eau', mode: 'Débit / pression d\'eau insuffisant', effet: 'Baisse de l\'efficacité d\'extinction sur site', cause: 'Pompe défaillante, réserve d\'eau non entretenue', detection: 'Essai de débit périodique', gravite: 'B', probabilite: 3, detectionScore: 2 },
  { id: 'sli-06', domaine: 'SLI', systeme: 'Service SSLIA', equipement: 'Délai d\'intervention', mode: 'Temps de réponse SSLIA dépassé', effet: 'Escalade de l\'incendie avant arrivée des secours', cause: 'Poste de veille mal situé, véhicule indisponible', detection: 'Chronométrage des exercices', gravite: 'A', probabilite: 3, detectionScore: 2 },

  // ── ELEC — Balisage lumineux ────────────────────────────────
  { id: 'elec-01', domaine: 'ELEC', systeme: 'Balisage lumineux', equipement: 'Réseau de balisage', mode: 'Balisage lumineux en panne', effet: 'Perte de visualisation de la piste de nuit / mauvaise visibilité — risque d\'incursion et d\'atterrissage hors piste', cause: 'Défaut électrique, lampes HS, câbles endommagés', detection: 'Inspection visuelle / télésurveillance balisage', gravite: 'A', probabilite: 3, detectionScore: 2 },
  { id: 'elec-02', domaine: 'ELEC', systeme: 'Balisage lumineux', equipement: 'Groupe électrogène', mode: 'Groupe de secours en panne', effet: 'Absence de secours électrique en cas de coupure secteur — balisage éteint', cause: 'Batterie déchargée, démarreur HS, maintenance différée', detection: 'Essai hebdomadaire du groupe', gravite: 'A', probabilite: 3, detectionScore: 2 },
  { id: 'elec-03', domaine: 'ELEC', systeme: 'Balisage lumineux', equipement: 'Alimentation principale', mode: 'Coupure alimentation principale', effet: 'Bascule sur secours non préparée — balisage interrompu', cause: 'Défaut réseau, transformateur HS', detection: 'Alarme coupure secteur', gravite: 'B', probabilite: 4, detectionScore: 3 },
  { id: 'elec-04', domaine: 'ELEC', systeme: 'Balisage lumineux', equipement: 'Contrôleur balisage', mode: 'Contrôleur de balisage défaillant', effet: 'Impossibilité de régler l\'intensité — intensité non conforme au message', cause: 'Vieillissement, surtension, logiciel obsolète', detection: 'Contrôle télésurveillance', gravite: 'C', probabilite: 3, detectionScore: 2 },

  // ── PHY — Caractéristiques physiques ────────────────────────
  { id: 'phy-01', domaine: 'PHY', systeme: 'Aire de mouvement', equipement: 'Piste', mode: 'Déformation / fissuration du revêtement', effet: 'Détérioration de l\'état de surface — risque pour l\'atterrissage, dégagement', cause: 'Vieillissement, drainage insuffisant, trafic lourd', detection: 'Inspection FOD et dégradations', gravite: 'A', probabilite: 3, detectionScore: 2 },
  { id: 'phy-02', domaine: 'PHY', systeme: 'Aire de mouvement', equipement: 'Piste / taxiway', mode: 'Présence d\'objets étrangers (FOD)', effet: 'Risque d\'ingestion moteur, crevaison, blessures', cause: 'Nettoyage insuffisant, débris de travaux', detection: 'Inspection quotidienne de piste', gravite: 'B', probabilite: 4, detectionScore: 3 },
  { id: 'phy-03', domaine: 'PHY', systeme: 'Aire de mouvement', equipement: 'Marquage piste', mode: 'Marquage effacé / non conforme', effet: 'Confusion des limites de piste — incursion et sortie de piste', cause: 'Usure, absence de reprise de peinture', detection: 'Inspection périodique du marquage', gravite: 'B', probabilite: 4, detectionScore: 3 },
  { id: 'phy-04', domaine: 'PHY', systeme: 'Aire de mouvement', equipement: 'Revêtement piste', mode: 'Perte d\'adhérence (glissance)', effet: 'Risque de sortie de piste au freinage', cause: 'Revêtement usé, contamination (neige, dépôts)', detection: 'Mesures de coefficient de frottement', gravite: 'A', probabilite: 3, detectionScore: 3 },

  // ── MFP — Marques, feux et panneaux ─────────────────────────
  { id: 'mfp-01', domaine: 'MFP', systeme: 'Signalisation aéroportuaire', equipement: 'Panneaux de signalisation', mode: 'Panneaux illisibles / manquants', effet: 'Guidage au sol défaillant — risque d\'incursion de piste', cause: 'Vandalisme, vieillissement, éclairage des panneaux HS', detection: 'Inspection visuelle nocturne', gravite: 'B', probabilite: 4, detectionScore: 3 },
  { id: 'mfp-02', domaine: 'MFP', systeme: 'Signalisation aéroportuaire', equipement: 'Feux de seuil / approche', mode: 'Feux de seuil en panne', effet: 'Repérage du seuil de piste dégradé en approche', cause: 'Lampe HS, défaut électrique', detection: 'Télésurveillance balisage', gravite: 'B', probabilite: 3, detectionScore: 2 },
  { id: 'mfp-03', domaine: 'MFP', systeme: 'Signalisation aéroportuaire', equipement: 'Balises lumineuses', mode: 'Balise hors service', effet: 'Signalisation de l\'axe de piste dégradée la nuit', cause: 'Batterie déchargée, panneau solaire défectueux', detection: 'Ronde de nuit', gravite: 'C', probabilite: 3, detectionScore: 3 },

  // ── OPS — Procédures opérationnelles ─────────────────────────
  { id: 'ops-01', domaine: 'OPS', systeme: 'Procédures d\'exploitation', equipement: 'Procédures SGS / exploitation', mode: 'Procédure non appliquée par le personnel', effet: 'Écart entre procédure et pratique — défaut de contrôle des risques', cause: 'Procédures obsolètes, formation insuffisante, supervision défaillante', detection: 'Audit et observations de terrain', gravite: 'C', probabilite: 4, detectionScore: 3 },
  { id: 'ops-02', domaine: 'OPS', systeme: 'Procédures d\'exploitation', equipement: 'Coordination ATC', mode: 'Coordination ATC / exploitation inadéquate', effet: 'Risque d\'incursion de piste et de conflit de circulation', cause: 'Communication défaillante, protocoles imprécis', detection: 'Contrôle du trafic / retour d\'incident', gravite: 'A', probabilite: 3, detectionScore: 3 },
  { id: 'ops-03', domaine: 'OPS', systeme: 'Procédures d\'urgence', equipement: 'Procédures d\'urgence', mode: 'Procédure d\'urgence non maîtrisée', effet: 'Intervention d\'urgence incohérente en cas d\'accident', cause: 'Exercices non réalisés, procédures non à jour', detection: 'Exercices / simulation', gravite: 'A', probabilite: 3, detectionScore: 3 },
  { id: 'ops-04', domaine: 'OPS', systeme: 'Procédures d\'exploitation', equipement: 'Gestion des travaux', mode: 'Travaux sur piste sans coordination', effet: 'Présence d\'engins et obstacles non déclarés — risque de collision', cause: 'Permis de travail non appliqué, coordination ATC défaillante', detection: 'Inspection de piste / coordination travaux', gravite: 'A', probabilite: 3, detectionScore: 3 },

  // ── SGS — Système de gestion de la sécurité ─────────────────
  { id: 'sgs-01', domaine: 'SGS', systeme: 'Gestion de la sécurité', equipement: 'Documentation SGS', mode: 'Documentation SGS obsolète', effet: 'Référentiel de sécurité non conforme — démonstration de la maîtrise des risques défaillante', cause: 'Mise à jour non planifiée, absence de responsable', detection: 'Audit documentaire', gravite: 'C', probabilite: 4, detectionScore: 3 },
  { id: 'sgs-02', domaine: 'SGS', systeme: 'Gestion de la sécurité', equipement: 'Rapports d\'événements', mode: 'Rapport d\'événement non déposé', effet: 'Perte de données de sécurité — non-détection des tendances', cause: 'Culture de reporting faible, procédure complexe', detection: 'Suivi des rapports / superviseur', gravite: 'C', probabilite: 4, detectionScore: 3 },
  { id: 'sgs-03', domaine: 'SGS', systeme: 'Gestion de la sécurité', equipement: 'Audits internes', mode: 'Audit interne non réalisé', effet: 'Non-détection des écarts SGS — dérive progressive', cause: 'Planning d\'audit non suivi, ressources insuffisantes', detection: 'Contrôle du programme d\'audit', gravite: 'C', probabilite: 4, detectionScore: 3 },

  // ── RA — Risque animalier ───────────────────────────────────
  { id: 'ra-01', domaine: 'RA', systeme: 'Risque animalier', equipement: 'Aire de mouvement', mode: 'Présence de faune sur piste', effet: 'Risque de collision animal / aéronef (péril animalier)', cause: 'Effarouchement inefficace, gestion des abords insuffisante', detection: 'Patrouilles de prévention', gravite: 'A', probabilite: 4, detectionScore: 3 },
  { id: 'ra-02', domaine: 'RA', systeme: 'Risque animalier', equipement: 'Zone d\'approche', mode: 'Population d\'oiseaux en approche', effet: 'Risque d\'ingestion moteur (bird strike)', cause: 'Décharges, mares, végétation attractive à proximité', detection: 'Recensement de la faune', gravite: 'B', probabilite: 4, detectionScore: 3 },

  // ── OLS — Surfaces de limitation d'obstacles ────────────────
  { id: 'ols-01', domaine: 'OLS', systeme: 'Limitation d\'obstacles', equipement: 'Surfaces OLS', mode: 'Obstacle pénétrant les surfaces OLS', effet: 'Réduction des marges d\'approche — risque de collision', cause: 'Construction non contrôlée, végétation en croissance', detection: 'Relevé topographique', gravite: 'B', probabilite: 3, detectionScore: 3 },

  // ── COP — Compétences et personnel ──────────────────────────
  { id: 'cop-01', domaine: 'COP', systeme: 'Compétences', equipement: 'Personnel de piste', mode: 'Personnel sans habilitation à jour', effet: 'Tâches opérationnelles réalisées sans compétence requise', cause: 'Suivi des habilitations défaillant, formation non renouvelée', detection: 'Vérification des dossiers de formation', gravite: 'C', probabilite: 4, detectionScore: 3 },
]

export function getModeDefaillance(id: string): ModeDefaillanceRef | undefined {
  return CATALOGUE_AMDEC.find(m => m.id === id)
}

export function getModesParSysteme(): Record<string, ModeDefaillanceRef[]> {
  const groupes: Record<string, ModeDefaillanceRef[]> = {}
  for (const mode of CATALOGUE_AMDEC) {
    const key = `${mode.domaine} — ${mode.systeme}`
    if (!groupes[key]) groupes[key] = []
    groupes[key].push(mode)
  }
  return groupes
}

export function getSystemesParDomaine(): { domaine: string; systemes: { systeme: string; modes: ModeDefaillanceRef[] }[] }[] {
  const parDomaine = new Map<string, Map<string, ModeDefaillanceRef[]>>()
  for (const mode of CATALOGUE_AMDEC) {
    if (!parDomaine.has(mode.domaine)) parDomaine.set(mode.domaine, new Map())
    const systems = parDomaine.get(mode.domaine)!
    if (!systems.has(mode.systeme)) systems.set(mode.systeme, [])
    systems.get(mode.systeme)!.push(mode)
  }
  return Array.from(parDomaine.entries()).map(([domaine, systems]) => ({
    domaine,
    systemes: Array.from(systems.entries()).map(([systeme, modes]) => ({ systeme, modes })),
  }))
}

// ─────────────────────────────────────────────────────────────
// ANALYSE PERSISTÉE
// ─────────────────────────────────────────────────────────────

export interface AmdecAnalyse {
  id: string
  aerodrome_id: string
  mode_id: string
  domaine: string
  systeme: string
  equipement: string
  mode_defaillance: string
  effet: string
  cause: string
  detection: string
  gravite: NiveauGravite
  probabilite: number
  detection_score: number
  ipr: number
  niveau: NiveauIPR
  statut: StatutAmdec
  ecart_id?: string
  observations?: string
  created_at: string
  updated_at: string
}

export function analyseDepuisCatalogue(mode: ModeDefaillanceRef, aerodromeId: string, id?: string): AmdecAnalyse {
  const gravite: NiveauGravite = mode.gravite
  const ipr = calculeIPR(gravite, mode.probabilite, mode.detectionScore)
  const now = new Date().toISOString()
  return {
    id: id || crypto.randomUUID(),
    aerodrome_id: aerodromeId,
    mode_id: mode.id,
    domaine: mode.domaine,
    systeme: mode.systeme,
    equipement: mode.equipement,
    mode_defaillance: mode.mode,
    effet: mode.effet,
    cause: mode.cause,
    detection: mode.detection,
    gravite,
    probabilite: mode.probabilite,
    detection_score: mode.detectionScore,
    ipr,
    niveau: getIPRNiveau(ipr),
    statut: 'a_analyser',
    created_at: now,
    updated_at: now,
  }
}

export function recalculerAnalyse(analyse: Omit<AmdecAnalyse, 'ipr' | 'niveau' | 'updated_at'>): Pick<AmdecAnalyse, 'ipr' | 'niveau' | 'updated_at'> {
  const ipr = calculeIPR(analyse.gravite, analyse.probabilite, analyse.detection_score)
  return { ipr, niveau: getIPRNiveau(ipr), updated_at: new Date().toISOString() }
}

// ─────────────────────────────────────────────────────────────
// MALUS C3 — alimente le profil de risque (conformité technique)
// ─────────────────────────────────────────────────────────────

/**
 * Malus appliqué au C3 : les modes de défaillance à criticité élevée
 * non corrigés dégradent la conformité technique.
 * -5 / mode critique non corrigé, -2 / mode élevé, plafonné à -20.
 */
export function calculeMalusC3(analyses: AmdecAnalyse[]): number {
  const nonCorriges = analyses.filter(a => a.statut !== 'corrige')
  if (nonCorriges.length === 0) return 0
  const nbCritiques = nonCorriges.filter(a => a.niveau === 'critique').length
  const nbEleves = nonCorriges.filter(a => a.niveau === 'eleve').length
  return Math.min(20, nbCritiques * 5 + nbEleves * 2)
}

export function getMalusC3Details(analyses: AmdecAnalyse[]): { malus: number; critiques: number; eleves: number } {
  const nonCorriges = analyses.filter(a => a.statut !== 'corrige')
  const critiques = nonCorriges.filter(a => a.niveau === 'critique').length
  const eleves = nonCorriges.filter(a => a.niveau === 'eleve').length
  return { malus: Math.min(20, critiques * 5 + eleves * 2), critiques, eleves }
}
