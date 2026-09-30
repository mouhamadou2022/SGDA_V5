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
