// lib/risque/recommendations.ts
// Moteur de recommandations enrichi (rule-based) à destination de l'INSPECTEUR
// Combine les signaux multiple pour produire des vérifications contextuelles variées.

import type { ProfilRisque } from '@/lib/store'

export interface ActionConcrete {
  titre: string
  constat: string
  verification: string
  priorite: 'immediate' | 'haute' | 'moyenne' | 'basse'
  echeance: string
  impactAttendu: string
  donnees: Record<string, unknown> // data snapshot for LLM enrichment
}

const POIDS: Record<string, number> = { c1: 0.2, c2: 0.25, c3: 0.2, c4: 0.2, c5: 0.15 }

const LABELS: Record<string, string> = {
  c1: 'Maturite SGS',
  c2: 'Efficacite PAC',
  c3: 'Conformite Technique',
  c4: 'Charge Critique',
  c5: 'Resilience',
}

function seuilLabel(v: number): string {
  if (v >= 80) return 'acceptable'
  if (v >= 60) return 'surveillance'
  if (v >= 40) return 'degrade'
  if (v >= 20) return 'alarmant'
  return 'critique'
}

function niveauAnomalie(c: number): string[] {
  if (c >= 80) return ['bonne pratique', 'conforme', 'satisfaisant']
  if (c >= 60) return ['a surveiller', 'mitige', 'moyen']
  if (c >= 40) return ['insuffisant', 'preoccupant', 'a ameliorer']
  if (c >= 20) return ['degrade', 'critique', 'inacceptable']
  return ['tres degrade', 'hors seuil', 'dangereux']
}

// Phrases de constat variees
function constatCritere(key: string, val: number, label: string): string {
  const anom = niveauAnomalie(val)
  const ecart = Math.round(100 - val)
  const impact = Math.round(ecart * POIDS[key])
  const templates = [
    `Le critere ${key} (${label}) est en niveau ${anom[0]} a ${val}/100. L'ecart a la cible est de ${ecart} pts, soit un impact de -${impact} pts sur le score global.`,
    `${key} — ${label} : ${val}/100. Ce niveau ${anom[1]} retire ${impact} pts au score global. Un plan de rattrapage est necessaire.`,
    `Alerte sur ${key} (${label}) : ${val}/100 (${anom[2]}). Chaque point de progression sur ce critere rapporterait ${POIDS[key]} pt(s) au score global.`,
  ]
  return templates[Math.floor(Math.random() * templates.length)]
}

// Verifications enrichies selon la valeur
function verifCritere(key: string, val: number): string {
  const severe = val < 30
  const modere = val < 50
  const leger = val < 65
  const keyIdx = parseInt(key[1])

  if (key === 'c1') {
    if (severe) return "Exiger la mise a jour complete du manuel SGS et la preuve de diffusion a l'ensemble du personnel. Verifier les registres de formation securite des 24 derniers mois. Audit documentaire a prevoir dans la mission."
    if (modere) return "Demander le plan d'action SGS et verifier les enregistrements de formation de l'annee ecoulante. S'assurer que la culture securite est bien integree dans les processus."
    return "Verifier la mise a jour des documents SGS et la tracabilite des briefings securite lors de la prochaine visite."
  }
  if (key === 'c2') {
    if (severe) return "Exiger le rapport de traitement PAC detaille : nombre d'actions creees, en cours, clôturees > 60j et > 90j. Demander un plan de rattrapage avec echeances et responsables nominatifs."
    if (modere) return "Analyser le taux de clôture PAC et la proportion d'actions depassant l'echeance. Verifier que les actions recurrentes font l'objet d'une analyse cause racine."
    return "Verifier l'etat d'avancement des PAC en cours et la conformite des delais de traitement."
  }
  if (key === 'c3') {
    if (severe) return "Inspection technique approfondie des equipements de piste (balisage lumineux, SSLIA, aires de manoeuvre, radio). Verifier les certificats de maintenance et les echeances de conformite reglementaire."
    if (modere) return "Verifier la conformite des equipements critiques et les registres de maintenance. S'assurer que les non-conformites relevees lors de la derniere inspection ont ete traitees."
    return "Controle periodique de la conformite technique. Verifier les points de la derniere inspection."
  }
  if (key === 'c4') {
    if (severe) return "Exiger la liste exhaustive des ecarts critiques avec leur date de detection, delai de traitement et responsable. Identifier les ecarts recurrents et demander une analyse des causes profondes."
    if (modere) return "Analyser la repartition des ecarts par service et par type. Verifier que les ecarts de niveau eleve font l'objet d'actions correctives documentees."
    return "Verifier l'etat des ecarts ouverts et leur delai de traitement. S'assurer du suivi par les services concernes."
  }
  else {
    if (severe) return "Exiger le plan de continuite d'activite, les conventions de soutien et les resultats des exercices de crise. Verifier les stocks de materiel d'urgence et leur date de peremption."
    if (modere) return "Evaluer les dispositifs de prevention : plans de continuite, stocks d'urgence, exercices realises dans les 12 derniers mois."
    return "Verifier la mise a jour des dispositifs de resilience et les resultats du dernier exercice de simulation."
  }
}

export function genererRecommandations(profil: ProfilRisque): ActionConcrete[] {
  const actions: ActionConcrete[] = []
  const hmm = profil.hmm_state
  const surv = profil.survival_metrics
  const evt = profil.extreme_risk

  // --- 1. Criteres faibles combines ---
  const crits = ([1, 2, 3, 4, 5] as const).map(i => ({
    key: `c${i}` as const,
    label: LABELS[`c${i}`],
    value: (profil[`c${i}`] as number) || 0,
  })).sort((a, b) => a.value - b.value)

  // Si plusieurs criteres sont faibles, faire une recommandation combinee
  const faibles = crits.filter(c => c.value < 50)
  if (faibles.length >= 2) {
    const noms = faibles.map(c => `${c.key} (${c.value}/100)`).join(', ')
    const gainTotal = faibles.reduce((s, c) => s + Math.round(Math.min(25, 100 - c.value) * POIDS[c.key]), 0)
    actions.push({
      titre: `Multi-criteres : ${faibles.length} criteres sous le seuil d'acceptabilite`,
      constat: `Les criteres suivants sont en niveau degrade ou alarmant : ${noms}. L'impact cumule sur le score global est estime a -${Math.round(faibles.reduce((s, c) => s + (100 - c.value) * POIDS[c.key], 0))} pts.`,
      verification: `Demander a l'exploitant un plan d'action global couvrant l'ensemble des criteres faibles (${faibles.map(c => c.key).join(', ')}). Verifier la coherence du plan et l'allocation des ressources. S'assurer que les actions ne se limitent pas a un seul critere.`,
      priorite: faibles.some(c => c.value < 30) ? 'immediate' : 'haute',
      echeance: faibles.some(c => c.value < 30) ? 'mission sous 7 jours' : 'mission sous 30 jours',
      impactAttendu: `Gain potentiel cumule de +${gainTotal} pts sur le score global`,
      donnees: { type: 'multi_criteria', criteres: faibles.map(c => ({ key: c.key, value: c.value })), score_global: profil.score_global },
    })
  }

  // Recommandations individuelles pour les criteres restants
  const traites = new Set(faibles.map(c => c.key))
  for (const c of crits) {
    if (traites.has(c.key)) continue
    if (c.value >= 65) break
    const priorite = c.value < 30 ? 'immediate' as const : c.value < 50 ? 'haute' as const : 'moyenne' as const
    actions.push({
      titre: `${c.key} — ${c.label} : ${c.value}/100 (${seuilLabel(c.value)})`,
      constat: constatCritere(c.key, c.value, c.label),
      verification: verifCritere(c.key, c.value),
      priorite,
      echeance: c.value < 30 ? 'mission sous 7 jours' : c.value < 50 ? 'mission sous 30 jours' : 'prochaine mission programmee',
      impactAttendu: `Gain potentiel de +${Math.round(Math.min(25, 100 - c.value) * POIDS[c.key])} pts sur le score global`,
      donnees: { type: 'critere', key: c.key, value: c.value, label: c.label, score_global: profil.score_global },
    })
  }

  // --- 2. HMM transition silencieuse ---
  if (hmm?.isTransitioning || (hmm && hmm.transitionRisk > 50)) {
    const days = hmm.daysToCritical ?? 999
    actions.push({
      titre: days < 30
        ? 'Basculement critique imminent — HMM en transition silencieuse'
        : 'Risque de basculement silencieux — HMM en transition',
      constat: days < 30
        ? `Le modele HMM est en transition vers un etat degrade et le passage en mode critique est estime a moins de ${days} jours. Le risque de transition est de ${Math.round(hmm.transitionRisk)}%.`
        : `Le modele HMM detecte une transition anormale avec un risque de ${Math.round(hmm.transitionRisk)}%. Le delai estime avant etat critique est de ${days} jours.`,
      verification: "Inspection inopinee recommandee. Verifier les 10 dernieres entrees PAC, l'etat des equipements critiques (balisage, SSLIA), et les registres de maintenance. Exiger un point securite exceptionnel de l'exploitant avec compte-rendu ecrit sous 48h.",
      priorite: 'immediate',
      echeance: days < 30 ? '48 heures' : '7 jours',
      impactAttendu: 'Stabilisation du profil et prevention du basculement en etat critique',
      donnees: { type: 'hmm', transitionRisk: hmm.transitionRisk, isTransitioning: hmm.isTransitioning, daysToCritical: hmm.daysToCritical, currentState: hmm.currentStateName },
    })
  }

  // --- 3. Hazard survie + combinaison avec EVT ---
  if (surv && surv.hazard90d > 0.35) {
    const severe = surv.hazard90d > 0.6
    const messages: string[] = [
      `Probabilite d'incident a 90 jours : ${(surv.hazard90d * 100).toFixed(0)}%. Mediane de survie : ${surv.medianDays} jours.`,
      `Le modele de survie estime a ${(surv.hazard90d * 100).toFixed(0)}% le risque d'incident dans les 90 jours. La mediane de survie de ${surv.medianDays} jours confirme un niveau de risque ${severe ? 'eleve' : 'modere'}.`,
    ]
    // Combinaison avec EVT si les deux sont presents
    const combineEvt = evt && evt.tailRisk > 0.15 && surv.hazard90d > 0.4
    const constat = combineEvt
      ? `${messages[0]} Par ailleurs, le risque extreme EVT est de ${(evt!.tailRisk * 100).toFixed(0)}% (queue ${evt!.isHeavyTailed ? 'lourde' : 'normale'}). La conjonction d'un hazard eleve et d'un risque extreme justifie une vigilance maximale.`
      : messages[Math.floor(Math.random() * messages.length)]

    actions.push({
      titre: severe
        ? 'Risque incident 90 jours critique — mission inopinee requise'
        : 'Risque incident 90 jours eleve — surveillance a renforcer',
      constat,
      verification: combineEvt
        ? 'Mission inopinee sous 7 jours. Verifier les occurrences des 90 derniers jours, les facteurs contributeurs et l efficacite des PAC. Exiger simultanement un plan de contingence pour couvrir le risque extreme identifie par le modele EVT.'
        : severe
          ? 'Declencher une mission inopinee sous 7 jours. Analyser les occurrences recentes, identifier les facteurs de degradation, et verifier l efficacite des actions correctives en cours.'
          : "Lors de la prochaine mission, analyser les occurrences recentes et s'assurer que l'exploitant a identifie les causes de la hausse du hazard.",
      priorite: severe ? 'immediate' : 'haute',
      echeance: severe ? '7 jours' : '30 jours',
      impactAttendu: `Reduction du hazard 90j de ${(surv.hazard90d * 100).toFixed(0)}% a <35%`,
      donnees: { type: 'survival_evt', hazard90d: surv.hazard90d, hazard180d: surv.hazard180d, medianDays: surv.medianDays, tailRisk: evt?.tailRisk, isHeavyTailed: evt?.isHeavyTailed, maxExpected12m: evt?.maxExpected12m },
    })
  } else if (evt && evt.tailRisk > 0.15) {
    // Cas EVT seul sans hazard eleve
    actions.push({
      titre: 'Risque extreme detecte — plan de contingence a exiger',
      constat: `Probabilite d'evenement extreme : ${(evt.tailRisk * 100).toFixed(0)}%. ${evt.isHeavyTailed ? 'Distribution a queue lourde : les evenements extremes sont significativement plus frequents que la normale.' : 'Risque extreme modere mais necessitant une preparation.'} Maximum attendu sur 12 mois : ${evt.maxExpected12m} incidents.`,
      verification: "Exiger de l'exploitant un plan de contingence ecrit dans les 30 jours. Verifier les stocks de materiel d'urgence, les conventions de soutien avec les services externes, et les resultats des exercices de simulation de crise.",
      priorite: evt.tailRisk > 0.3 ? 'immediate' : 'haute',
      echeance: evt.tailRisk > 0.3 ? '30 jours' : '60 jours',
      impactAttendu: `Reduction exposition au risque extreme de ${(evt.tailRisk * 100).toFixed(0)}% a <10%`,
      donnees: { type: 'evt', tailRisk: evt.tailRisk, isHeavyTailed: evt.isHeavyTailed, maxExpected12m: evt.maxExpected12m },
    })
  }

  // --- 4. Surdispersion (incidents groupes) ---
  if (profil.negbin_metrics?.isOverdispersed && profil.negbin_metrics.dispersion > 1.5) {
    actions.push({
      titre: 'Incidents non independants — surdispersion detectee',
      constat: `Le modele negatif binomial indique une surdispersion (phi=${profil.negbin_metrics.dispersion.toFixed(2)}). Les incidents ne sont pas independants : la survenue d'un incident augmente la probabilite d'en voir un autre. Cette configuration suggere une cause systemique non resolue.`,
      verification: "Demander a l'exploitant une analyse causes racines (RCA) sur les 6 derniers mois, avec diagramme d'Ishikawa et plan d'actions correctives systemiques. Verifier que les actions ne sont pas des correctifs ponctuels mais s'attaquent aux causes profondes.",
      priorite: 'haute',
      echeance: '45 jours',
      impactAttendu: 'Briser le cycle de recurrence systemique — frequence visee : -30%',
      donnees: { type: 'negbin', dispersion: profil.negbin_metrics.dispersion, isOverdispersed: profil.negbin_metrics.isOverdispersed },
    })
  }

  // --- 5. Degradation projetee + tendance combinee ---
  const p6 = profil.prediction_6m
  const accelere = profil.event_trend_acceleration ?? 0
  if (p6 !== undefined && p6 < (profil.score_global - 8)) {
    const ecart = Math.round(profil.score_global - p6)
    const weakest = crits[0]
    const avecAccel = accelere > 0.5

    actions.push({
      titre: avecAccel
        ? 'Degradation projetee + acceleration — tendance defavorable confirmee'
        : 'Degradation projetee a 6 mois — anticiper la perte de score',
      constat: avecAccel
        ? `Le score global est a ${Math.round(profil.score_global)}/100 mais la projection a 6 mois est de ${Math.round(p6)}/100. Par ailleurs, l'acceleration de la tendance evenementielle (${accelere.toFixed(2)}) confirme une dynamique defavorable.`
        : `Le score global est a ${Math.round(profil.score_global)}/100 mais la projection a 6 mois est de ${Math.round(p6)}/100. Perte potentielle de ${ecart} pts sans action corrective. Le levier principal est ${weakest.key} (${weakest.value}/100).`,
      verification: avecAccel
        ? `S'assurer que l'exploitant a engage des actions correctives sur les leviers principaux (${crits.slice(0, 2).map(c => c.key).join(', ')}). Demander un plan d'action avec echeances et indicateurs de suivi mensuel. Verifier mensuellement l'ecart entre score reel et projete.`
        : `S'assurer que l'exploitant a engage des actions sur le levier principal : ${weakest.key} (${weakest.value}/100). Demander un plan d'action avec echeances et responsable. Suivi mensuel de l'ecart score reel vs projete.`,
      priorite: avecAccel ? 'immediate' : 'haute',
      echeance: avecAccel ? '30 jours' : '90 jours',
      impactAttendu: `Maintien du score a ${Math.round(profil.score_global)}/100 au lieu de ${Math.round(p6)}/100`,
      donnees: { type: 'trend_degradation', score_global: profil.score_global, prediction_6m: p6, acceleration: accelere, weakest_critere: weakest.key, weakest_value: weakest.value },
    })
  }

  // Trier par priorite
  const ordre: Record<string, number> = { immediate: 0, haute: 1, moyenne: 2, basse: 3 }
  return actions.sort((a, b) => ordre[a.priorite] - ordre[b.priorite])
}
