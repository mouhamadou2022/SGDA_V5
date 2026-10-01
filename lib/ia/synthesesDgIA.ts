// lib/ia/synthesesDgIA.ts
// Synthèses en langage clair des 3 onglets DG (Pilotage, Conformité,
// Décisions) : même pattern que syntheseNationaleIA (fallback déterministe
// sur chiffres réels + réécriture IA optionnelle, badge IA si appliquée).

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'

export interface TexteIA {
  texte: string
  fallbackIA: boolean
}

async function reecrire(
  rubrique: string,
  contexte: Record<string, unknown>,
  fallback: string,
): Promise<TexteIA> {
  const userMessage = `Explique en langage clair et très simple, pour le Directeur Général de l'ANACIM (non-expert), la rubrique « ${rubrique} » de son tableau de bord.

CONTEXTE RÉEL (ne jamais réinventer ni ajouter de chiffres) :
${JSON.stringify(contexte, null, 2)}

Contraintes : 2 phrases maximum, phrases courtes, chiffres réels repris tels quels, aucun acronyme sans explication.
Retourne uniquement un JSON : { "texte": "..." }`
  try {
    const result = await aiClient.callJSON<Record<string, string>>(
      {
        systemPrompt: RISK_SYSTEM_PROMPT,
        userMessage,
        temperature: 0.3,
        maxTokens: 256,
        responseFormat: 'json_object',
      },
      { texte: fallback },
    )
    const v = result.texte
    if (typeof v === 'string' && v.trim()) return { texte: v.trim(), fallbackIA: false }
  } catch {
    // silencieux : le fallback s'affiche
  }
  return { texte: fallback, fallbackIA: true }
}

// ── Pilotage Sécurité ──────────────────────────────────────────

export interface ContextePilotage {
  sitesAlerte: string[]
  nbEcartsCritiques: number
  topDomaine: string | null
  topDomaineTotal: number
  topDomaineCritiques: number
  nbEvenements90j: number
  nbPacRetard: number
}

export function fallbackPilotage(ctx: ContextePilotage): string {
  const sites = ctx.sitesAlerte.length > 0
    ? `Sites sous alerte : ${ctx.sitesAlerte.slice(0, 5).join(', ')}.`
    : 'Aucun site en alerte.'
  const domaine = ctx.topDomaine
    ? ` Domaine le plus touché : ${ctx.topDomaine} (${ctx.topDomaineTotal} écarts ouverts` +
      (ctx.topDomaineCritiques > 0 ? ` dont ${ctx.topDomaineCritiques} critique(s)` : '') + ').'
    : ' Aucun écart ouvert.'
  const events = ctx.nbEvenements90j > 0 ? ` ${ctx.nbEvenements90j} événement(s) ces 90 derniers jours.` : ''
  const pac = ctx.nbPacRetard > 0 ? ` ${ctx.nbPacRetard} PAC en retard à relancer.` : ''
  return `${sites}${domaine}${events}${pac}`
}

export function expliquerPilotage(ctx: ContextePilotage): Promise<TexteIA> {
  return reecrire('Pilotage Sécurité — où intervenir', ctx as unknown as Record<string, unknown>, fallbackPilotage(ctx))
}

export interface DetailsPilotage {
  domaines: string
  evenements: string
  scores: string
  /** Nombre d'écarts critiques listés par aérodrome. */
  nbEcartsCritiques: number
}

/** Mini-explication IA : dernier score + maturité SGS (données réelles). */
export function explicationScoresMaturite(
  derniersScores: Array<{ score: number | null; maturite?: string }>,
): string {
  const scores = derniersScores.filter(s => s.score != null)
  if (scores.length === 0) return 'Aucun score de surveillance transmis pour le moment.'
  const dernier = scores[0]
  const faibles = derniersScores.filter(s =>
    (s.maturite || '').startsWith('N1') || (s.maturite || '').startsWith('N2')).length
  return `Dernier score relevé : ${dernier.score}/100.` +
    (faibles > 0
      ? ` ${faibles} site(s) récent(s) avec une maturité SGS faible (N1-N2) — à accompagner.`
      : ' Maturité SGS satisfaisante sur les sites récemment surveillés.')
}

export interface AlerteSite {
  code: string
  nom: string
  niveau: string
  score: number
  tendance: string
  c1?: number
  statutSgs?: string
  prediction3m?: number
  prediction6m?: number
  ecritsCritiques: number
  ecritsEleves: number
  pacRetard: number
  preuvesRetard: number
  eventsCritiques: number
  motif: string
}

/**
 * Pourquoi ce site est en alerte + que faire — langage clair pour décision
 * rapide. Règle d'action : critique (profil ou écarts) → mission urgente ;
 * sinon échéances et validations à relancer.
 */
export function explicationSiteAlerte(site: AlerteSite, maturiteSgs: string): {
  pourquoi: string
  action: string
} {
  const pourquoi: string[] = [site.motif + '.']
  if (site.statutSgs === 'non_applicable') {
    pourquoi.push('SGS non applicable sur ce site.')
  } else {
    pourquoi.push(`Maturité SGS : ${maturiteSgs}.`)
  }
  if (site.prediction3m != null || site.prediction6m != null) {
    const parts: string[] = []
    if (site.prediction3m != null) parts.push(`3 mois : ${Math.round(site.prediction3m)}/100`)
    if (site.prediction6m != null) parts.push(`6 mois : ${Math.round(site.prediction6m)}/100`)
    pourquoi.push(`Trajectoire projetée — ${parts.join(', ')}.`)
  }
  const critique = site.niveau === 'critique' || site.ecritsCritiques > 0
  const action = critique
    ? 'Décision recommandée : mission de surveillance urgente sur ce site.'
    : site.pacRetard > 0 || site.preuvesRetard > 0
      ? 'Décision recommandée : relancer les validations et échéances en retard.'
      : site.eventsCritiques > 0
        ? 'Décision recommandée : suivre les événements récents et vérifier les mesures prises.'
        : 'Décision recommandée : maintenir la surveillance programmée.'
  return { pourquoi: pourquoi.join(' '), action }
}

/** Lignes d'interprétation par carte (déterministes, chiffres réels). */
export function detailsPilotage(
  topDomaine: string | null,
  topDomaineTotal: number,
  topDomaineCritiques: number,
  nbEvenements90j: number,
  derniersScores: Array<{ score: number | null }>,
  nbEcartsCritiques = 0,
): DetailsPilotage {
  const domaines = nbEcartsCritiques > 0
    ? `${nbEcartsCritiques} écart(s) critique(s) ouvert(s), listés par aérodrome ci-dessous` +
      (topDomaine ? ` — domaine le plus touché : ${topDomaine} (${topDomaineTotal} écarts).` : '.')
    : 'Aucun écart critique ouvert.'
  const evenements = nbEvenements90j > 0
    ? `${nbEvenements90j} événement(s) déclarés ces 90 derniers jours — à croiser avec les sites en alerte.`
    : 'Aucun événement déclaré ces 90 derniers jours.'
  const scores = derniersScores.filter(s => s.score != null)
  const scoresTexte = scores.length > 0
    ? `Dernier score relevé : ${scores[0].score}/100.`
    : 'Aucun score de surveillance transmis pour le moment.'
  return { domaines, evenements, scores: scoresTexte, nbEcartsCritiques }
}

// ── Conformité & Contrôle ──────────────────────────────────────

export interface ExpirationVue {
  aerodrome: string
  type: string
  jours: number
}

export interface ContexteConformite {
  taux: number
  certifies: number
  homologues: number
  total: number
  expirations: ExpirationVue[]
  sansSurveillance: string[]
  planifiees: number
}

export function fallbackConformite(ctx: ContexteConformite): string {
  const base = `${ctx.taux} % des sites sont en règle (${ctx.certifies} certifiés, ${ctx.homologues} homologués sur ${ctx.total}).`
  const exp = ctx.expirations.length > 0
    ? ` À renouveler sous 90 jours : ${ctx.expirations.slice(0, 5).map(e => `${e.aerodrome} (${e.type}, J-${e.jours})`).join(', ')}.`
    : ' Aucune expiration imminente.'
  const sans = ctx.sansSurveillance.length > 0
    ? ` Sans surveillance depuis plus d'un an : ${ctx.sansSurveillance.slice(0, 5).join(', ')}.`
    : ''
  const plan = ctx.planifiees > 0 ? ` ${ctx.planifiees} surveillance(s) planifiée(s).` : ''
  return `${base}${exp}${sans}${plan}`
}

export function expliquerConformite(ctx: ContexteConformite): Promise<TexteIA> {
  return reecrire('Conformité et Contrôle — qui est en règle', ctx as unknown as Record<string, unknown>, fallbackConformite(ctx))
}

export type StatutProcessus = 'bloque' | 'attente' | 'en_cours'

/**
 * État DG d'un processus (certification 5 phases, homologation 3 phases) :
 * ce qui se passe + blocage éventuel, sans entrer dans le détail du dossier.
 * - bloqué : avis défavorable / à réviser sur la phase active.
 * - attente : phase en attente depuis plus de 30 jours.
 * - en_cours : avance nominalement.
 */
export function etatProcessus(
  phasesData: Record<string, { statut?: string; date_reception?: string; conclusion?: string; cloture_le?: string } | undefined>,
  phaseActive: number,
  maintenant = Date.now(),
): { statut: StatutProcessus; phase: number; depuis: string | null } {
  const phase = phasesData[`phase${phaseActive}`]
  const depuis = phase?.date_reception || null
  const statut = phase?.statut || ''
  if (statut === 'a_reviser' || statut === 'defavorable' || phase?.conclusion === 'defavorable') {
    return { statut: 'bloque', phase: phaseActive, depuis }
  }
  if (statut === 'en_attente' && depuis && maintenant - new Date(depuis).getTime() > 30 * 86400000) {
    return { statut: 'attente', phase: phaseActive, depuis }
  }
  return { statut: 'en_cours', phase: phaseActive, depuis }
}

/** Ligne d'interprétation : processus en cours (cohérente avec le KPI). */
export function resumeProcessus(
  processus: Array<{ statut: StatutProcessus }>,
): string {
  if (processus.length === 0) return 'Aucun processus de certification ou d’homologation en cours.'
  const bloques = processus.filter(p => p.statut === 'bloque').length
  const attentes = processus.filter(p => p.statut === 'attente').length
  if (bloques > 0) return `${processus.length} processus en cours — dont ${bloques} bloqué(s) : arbitrage DG requis.`
  if (attentes > 0) return `${processus.length} processus en cours — dont ${attentes} en attente prolongée (30 jours et plus).`
  return `${processus.length} processus en cours — avancement nominal, aucun blocage.`
}

/** Ligne d'interprétation : expirations imminentes (cohérente avec le KPI). */
export function resumeExpirations(expiresBientot: Array<{ aerodrome: string; jours: number }>): string {
  if (expiresBientot.length === 0) return 'Aucune expiration imminente — situation nominale.'
  const top = [...expiresBientot].sort((a, b) => a.jours - b.jours)[0]
  return `${expiresBientot.length} à renouveler sous 90 jours — le plus urgent : ${top.aerodrome} (J-${top.jours}).`
}

/** Ligne d'interprétation : sites sans surveillance récente. */
export function resumeSansSurveillance(
  sansSurveillanceAn: Array<{ code: string; joursDepuis: number | null; couvert?: number | null }>,
): string {
  if (sansSurveillanceAn.length === 0) return 'Tous les sites ont été surveillés récemment.'
  const jamais = sansSurveillanceAn.filter(a => a.joursDepuis === null).length
  const couverts = sansSurveillanceAn.filter(a => a.couvert != null).length
  const reste = sansSurveillanceAn.length - couverts
  return `${sansSurveillanceAn.length} site(s) sans surveillance accomplie depuis plus d'un an` +
    (jamais > 0 ? ` (dont ${jamais} jamais surveillé(s))` : '') +
    (couverts > 0
      ? ` — ${couverts} déjà couvert(s) par une échéance planifiée, ${reste} à planifier en priorité.`
      : ' — à planifier en priorité.')
}

// ── Décisions & Impact ─────────────────────────────────────────

export interface ContexteDecisions {
  efficacite: number
  fermes: number
  totaux: number
  ameliorations: number
  degradations: number
  signaturesAttente: number
  topAmelioration: string | null
  topDegradation: string | null
}

export function fallbackDecisions(ctx: ContexteDecisions): string {
  const eff = `${ctx.efficacite} % des écarts sont soldés (${ctx.fermes}/${ctx.totaux}) — ` +
    (ctx.efficacite >= 70 ? 'les actions correctives portent leurs fruits.'
      : ctx.efficacite >= 40 ? 'des efforts restent nécessaires.'
        : 'l\u2019efficacité doit être redressée en priorité.')
  const evo = ctx.ameliorations > 0 || ctx.degradations > 0
    ? ` ${ctx.ameliorations} site(s) en amélioration${ctx.topAmelioration ? ` (dont ${ctx.topAmelioration})` : ''}` +
      ` contre ${ctx.degradations} en dégradation${ctx.topDegradation ? ` (dont ${ctx.topDegradation})` : ''}.`
    : ''
  const sign = ctx.signaturesAttente > 0
    ? ` ${ctx.signaturesAttente} dossier(s) attendent votre signature.`
    : ''
  return `${eff}${evo}${sign}`
}

export function expliquerDecisions(ctx: ContexteDecisions): Promise<TexteIA> {
  return reecrire('Décisions et Impact — les actions marchent-elles', ctx as unknown as Record<string, unknown>, fallbackDecisions(ctx))
}

/** Ligne d'interprétation : évolution des scores par site. */
export function resumeEvolution(
  ameliorations: number,
  degradations: number,
  topAmelioration: string | null,
  topDegradation: string | null,
): string {
  if (ameliorations === 0 && degradations === 0) return 'Pas assez de recul pour mesurer les évolutions.'
  const plus: string[] = []
  if (ameliorations > 0) plus.push(`${ameliorations} en amélioration${topAmelioration ? ` (dont ${topAmelioration})` : ''}`)
  if (degradations > 0) plus.push(`${degradations} en dégradation${topDegradation ? ` (dont ${topDegradation})` : ''}`)
  return plus.join(' contre ') + '.'
}

/** Écart-type d'une série de scores (volatilité passée du site). */
export function ecartTypeScores(scores: number[]): number {
  if (scores.length < 2) return 5
  const moyenne = scores.reduce((s, v) => s + v, 0) / scores.length
  const variance = scores.reduce((s, v) => s + (v - moyenne) ** 2, 0) / scores.length
  return Math.max(2, Math.min(20, Math.round(Math.sqrt(variance))))
}

/**
 * Fourchette prévisionnelle honnête : la projection centrale vient du profil
 * de risque (prediction_3m/6m), l'amplitude vient de la volatilité passée du
 * site (±1 écart-type, borné 0-100). Pas de scénario inventé.
 */
export function calculerFourchette(prediction: number | null, sigma: number): {
  centrale: number | null
  optimiste: number | null
  pessimiste: number | null
} {
  if (prediction == null) return { centrale: null, optimiste: null, pessimiste: null }
  const c = Math.round(prediction)
  return {
    centrale: c,
    optimiste: Math.min(100, c + sigma),
    pessimiste: Math.max(0, c - sigma),
  }
}

/** Explication IA d'une trajectoire site : score, maturité SGS, projections. */
export function explicationTrajectoire(t: {
  evolution: number | null
  scoreActuel: number | null
  maturite: string | null
  maturiteInitiale: string | null
  pred3m: number | null
  pred6m: number | null
  nbSurveillances: number
}): string {
  const sens = t.evolution == null || t.evolution === 0
    ? 'stable'
    : t.evolution > 0 ? `en amélioration (+${t.evolution} points)` : `en dégradation (${t.evolution} points)`;
  const parties = [`Trajectoire ${sens} sur ${t.nbSurveillances} surveillance(s).`];
  if (t.maturite && t.maturiteInitiale && t.maturite !== t.maturiteInitiale) {
    parties.push(`Maturité SGS passée de ${t.maturiteInitiale} à ${t.maturite}.`);
  } else if (t.maturite) {
    parties.push(`Maturité SGS : ${t.maturite}.`);
  }
  if (t.pred3m != null && t.pred6m != null) {
    parties.push(`Projections : ${Math.round(t.pred3m)}/100 à 3 mois, ${Math.round(t.pred6m)}/100 à 6 mois.`);
  } else if (t.pred3m != null) {
    parties.push(`Projection : ${Math.round(t.pred3m)}/100 à 3 mois.`);
  }
  if ((t.evolution ?? 0) < 0) parties.push('À inscrire en priorité au prochain cycle de surveillance.');
  if ((t.scoreActuel ?? 100) < 40) parties.push('Score sous le seuil critique — intervention recommandée.');
  return parties.join(' ')
}

/** Ligne d'interprétation : efficacité des actions correctives. */
export function resumeEfficacite(efficacite: number, fermes: number, totaux: number): string {
  if (totaux === 0) return 'Aucun écart enregistré pour mesurer l\u2019efficacité.'
  return `${efficacite} % des écarts sont soldés (${fermes}/${totaux}) — ` +
    (efficacite >= 70 ? 'les actions portent leurs fruits.'
      : efficacite >= 40 ? 'des efforts restent nécessaires.'
        : 'efficacité à redresser en priorité.')
}
