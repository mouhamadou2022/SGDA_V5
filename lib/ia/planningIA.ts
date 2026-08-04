// lib/ia/planningIA.ts
// Explication AERORISQ en langage clair d'une surveillance programmée, côté
// exploitant : « Pourquoi cette inspection ? », « Détails » et la vérification
// de la section « À préparer avant l'inspection ».
// Le fallback déterministe reflète les mêmes données réelles — aucun texte
// statique, aucune valeur inventée.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { getDomaineLabel } from '@/lib/domaines'

export interface InspectionClair {
  pourquoi: string
  details: string
  preparation: string[]
  fallbackIA: boolean
}

export interface InspectionClairInput {
  aerodrome: { id: string; code: string; nom: string }
  type: string
  date_debut: string
  date_fin: string
  portee: string[]
  priorite: string
  objectifs?: string
  statut: string
  isLaunched: boolean
  profil?: {
    score_global?: number
    niveau?: string
    tendance?: string
    c1?: number
    c2?: number
    c3?: number
  }
  ecarts?: Array<{
    reference?: string
    libelle?: string
    niveau_risque?: string
    statut?: string
    domaine?: string
  }>
  historique?: Array<{ type: string; date: string }>
}

const TYPE_LABELS: Record<string, string> = {
  certification: 'une certification',
  homologation: 'une homologation',
  suivi_ecarts: 'un suivi des écarts',
  mise_oeuvre_pac: 'une vérification de la mise en œuvre des PAC',
  maintien: 'un maintien de la surveillance',
  audit_complet: 'un audit complet',
  periodique: 'une surveillance périodique',
  programmee: 'une surveillance périodique',
  urgence: 'une surveillance en urgence',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] || `une surveillance de type « ${type} »`
}

function dateFr(d?: string): string {
  if (!d) return 'date non précisée'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('fr-FR')
}

export function fallbackPourquoiInspection(input: InspectionClairInput): InspectionClair {
  const ecarts = input.ecarts || []
  const profil = input.profil

  // ── Pourquoi cette inspection ? ──
  const raisons: string[] = []
  if (profil?.score_global !== undefined) {
    raisons.push(`votre score de risque est de ${profil.score_global}/100 (niveau ${profil.niveau || 'non évalué'})`)
    if (profil.c1 !== undefined) {
      raisons.push(`votre maturité SGS est ${getSgsMaturiteLabel(profil.c1)} (${profil.c1}/100)`)
    }
    if (profil.tendance === 'baisse') raisons.push('et la tendance est en dégradation')
  }
  const nbCritiques = ecarts.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture').length
  if (nbCritiques > 0) raisons.push(`${nbCritiques} écart(s) critique(s) non clôturé(s)`)
  const nbPacAttendu = ecarts.filter(e => e.statut === 'pac_attendu' || e.statut === 'pac_refuse').length
  if (nbPacAttendu > 0) raisons.push(`${nbPacAttendu} plan(s) d'action correctifs (PAC) attendu(s) ou à reprendre`)
  const nbPacAccepte = ecarts.filter(e => e.statut === 'pac_accepte' || e.statut === 'preuves_evaluees').length
  if (nbPacAccepte > 0) raisons.push(`${nbPacAccepte} PAC accepté(s) dont les preuves doivent être fournies`)
  const nbEnRetard = ecarts.filter(e => e.statut === 'en_retard').length
  if (nbEnRetard > 0) raisons.push(`${nbEnRetard} écart(s) en retard`)

  const pourquoi = raisons.length > 0
    ? `Cette inspection a été programmée car ${raisons.join(', ')}.`
    : `Cette inspection fait partie de votre plan de surveillance annuel, établi à partir de votre profil de risque et de vos échéances.`

  // ── Détails ──
  const detailsParties: string[] = [
    `${typeLabel(input.type)} du ${dateFr(input.date_debut)} au ${dateFr(input.date_fin)}`,
  ]
  if (input.portee.length > 0) {
    detailsParties.push(`domaines vérifiés : ${input.portee.slice(0, 6).map(d => getDomaineLabel(d)).join(', ')}${input.portee.length > 6 ? '…' : ''}`)
  }
  if (input.priorite) detailsParties.push(`priorité ${input.priorite}`)
  if (input.statut === 'en_retard') detailsParties.push('mission marquée en retard')
  const details = `Détails : ${detailsParties.join(' ; ')}.`

  // ── À préparer avant l'inspection ──
  const preparation: string[] = []
  if (input.type === 'suivi_ecarts') {
    if (nbPacAttendu > 0) preparation.push('soumettre ou reprendre les PAC en attente')
    if (nbPacAccepte > 0) preparation.push('rassembler et fournir les preuves des PAC acceptés')
    if (nbEnRetard > 0) preparation.push('régulariser les écarts en retard (mettre à jour les échéances)')
  }
  if (input.type === 'mise_oeuvre_pac') {
    preparation.push('vérifier que les actions des PAC sont réellement mises en œuvre')
    preparation.push('préparer les preuves (documents, photos, rapports) pour chaque action')
    preparation.push('corriger les échéances dépassées des actions')
  }
  input.portee.slice(0, 5).forEach(d => {
    preparation.push(`préparer les documents et les points à vérifier du domaine ${getDomaineLabel(d)}`)
  })
  if (preparation.length === 0) preparation.push('rassembler la documentation des domaines de la surveillance')

  return { pourquoi, details, preparation, fallbackIA: true }
}

export async function expliquerPourquoiInspection(input: InspectionClairInput): Promise<InspectionClair> {
  const fallback = fallbackPourquoiInspection(input)

  const contexte = JSON.stringify(
    {
      aerodrome: { code: input.aerodrome.code, nom: input.aerodrome.nom },
      type: input.type,
      date_debut: input.date_debut,
      date_fin: input.date_fin,
      portee: input.portee.map(d => ({ code: d, label: getDomaineLabel(d) })),
      priorite: input.priorite,
      statut: input.statut,
      mission_lancee: input.isLaunched,
      objectifs_bruts: input.objectifs ? input.objectifs.split('\n').slice(0, 10) : [],
      profil: input.profil ?? null,
      ecarts: (input.ecarts || []).map(e => ({
        reference: e.reference,
        libelle: e.libelle?.substring(0, 120),
        niveau_risque: e.niveau_risque,
        statut: e.statut,
        domaine: e.domaine,
      })),
      historique_recent: (input.historique || []).slice(-3).map(h => ({ type: h.type, date: h.date })),
    },
    null,
    2
  )

  const userMessage = `Explique en langage clair et très simple, pour un exploitant d'aérodrome (non-expert en terminologie réglementaire), ce que cette surveillance programmée va impliquer pour lui.

CONTEXTE RÉEL (données persistées du système, ne jamais les réinventer ni en ajouter) :
${contexte}

Contraintes :
- « pourquoi » : 2 phrases maximum. Explique POURQUOI cette inspection a été programmée (score de risque, maturité SGS, écarts critiques, PAC attendus/acceptés, écarts en retard), avec les chiffres réels. Si rien de critique, explique que c'est le plan de surveillance annuel.
- « details » : 2 phrases maximum. Traduis les détails concrets : dates, domaines vérifiés (utilise leurs libellés), priorité.
- « preparation » : liste de 3 à 6 actions courtes et concrètes à préparer AVANT l'inspection (régulariser les écarts, soumettre ou reprendre les PAC, fournir les preuves, corriger les échéances dépassées, rassembler la documentation des domaines). Adapte selon le type : pour « suivi_ecarts » insiste sur les écarts/PAC, pour « mise_oeuvre_pac » sur les preuves et les échéances des actions.
- Langage très simple, phrases courtes, aucun acronyme technique sans explication immédiate.
- Ne pas inventer de données absentes du contexte.

Retourne uniquement un JSON :
{
  "pourquoi": "...",
  "details": "...",
  "preparation": ["...", "..."]
}`

  const result = await aiClient.callJSON<{ pourquoi?: string; details?: string; preparation?: string[] }>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 640,
      responseFormat: 'json_object',
    },
    { pourquoi: fallback.pourquoi, details: fallback.details, preparation: fallback.preparation }
  )

  const cleanStr = (v: unknown, fb: string): string =>
    typeof v === 'string' && v.trim() ? v.trim() : fb

  let preparation = fallback.preparation
  const prepBrut = result.preparation as unknown
  if (Array.isArray(prepBrut)) {
    preparation = prepBrut.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).map(p => p.trim())
  } else if (typeof prepBrut === 'string' && prepBrut.trim()) {
    preparation = prepBrut.split('\n').map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean)
  }

  const pourquoi = cleanStr(result.pourquoi, fallback.pourquoi)
  const details = cleanStr(result.details, fallback.details)

  const toutFallback =
    pourquoi === fallback.pourquoi &&
    details === fallback.details &&
    preparation.length === fallback.preparation.length &&
    preparation.every((p, i) => p === fallback.preparation[i])

  return { pourquoi, details, preparation, fallbackIA: toutFallback }
}
