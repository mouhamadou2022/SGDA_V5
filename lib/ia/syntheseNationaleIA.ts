// lib/ia/syntheseNationaleIA.ts
// Synthèse nationale en langage clair pour le Directeur Général (cockpit
// Vue Nationale) : traduit les indicateurs du réseau en phrases très simples.
// Même pattern que decisionIA.ts : fallback déterministe construit sur les
// chiffres réels (aucune valeur inventée), puis réécriture IA optionnelle
// via aiClient — en cas d'échec, le fallback s'affiche.

'use client'

import { aiClient } from './aiClient'
import { RISK_SYSTEM_PROMPT } from './prompts'

export interface ContexteNational {
  scoreNational: number
  totalAerodromes: number
  critiques: number
  eleves: number
  nomsCritiques: string[]
  certifsExpirantes: number
  certifies: number
  homologues: number
  pacRetard: number
  ecartsCritiquesOuverts: number
  surveillancesAn: number
  signaturesAttente: number
  tendance6m?: 'hausse' | 'baisse' | 'stable'
  prediction6m?: number
}

export interface SyntheseNationale {
  resume: string
  sante: string
  alertes: string
  certifications: string
  pac: string
  missions: string
  conformite: string
  fallbackIA: boolean
}

function niveauMot(score: number): string {
  if (score >= 80) return 'bon'
  if (score >= 60) return 'moyen'
  return 'critique'
}

export function fallbackSyntheseNationale(ctx: ContexteNational): SyntheseNationale {
  const nbAlertes = ctx.critiques + ctx.eleves
  const priorite = ctx.critiques > 0
    ? `${ctx.critiques} aérodrome(s) en situation critique à traiter en priorité${ctx.nomsCritiques.length > 0 ? ` (${ctx.nomsCritiques.slice(0, 3).join(', ')})` : ''}`
    : ctx.pacRetard > 0
      ? `${ctx.pacRetard} plan(s) d'actions en retard à relancer`
      : ctx.certifsExpirantes > 0
        ? `${ctx.certifsExpirantes} certification(s) à renouveler dans 90 jours`
        : 'aucune urgence, maintenir la surveillance continue'
  const resume = `Le réseau est globalement ${niveauMot(ctx.scoreNational)} (score ${ctx.scoreNational}/100). ` +
    `Priorité du moment : ${priorite}.` +
    (ctx.tendance6m === 'baisse' ? ' La tendance à 6 mois est à la dégradation.'
      : ctx.tendance6m === 'hausse' ? ' La tendance à 6 mois est positive.' : '')

  const sante = ctx.scoreNational >= 80
    ? 'Niveau satisfaisant sur l\u2019ensemble du réseau.'
    : ctx.scoreNational >= 60
      ? 'Niveau à surveiller : des progrès restent à faire.'
      : 'Niveau préoccupant — des actions correctives sont requises.'

  const alertes = ctx.critiques > 0
    ? `Dont ${ctx.critiques} en situation critique — intervention immédiate.`
    : ctx.eleves > 0
      ? `${ctx.eleves} en vigilance élevée — à suivre de près.`
      : 'Aucun site en alerte — situation nominale.'

  const certifications = `${ctx.certifies} sites certifiés sur ${ctx.totalAerodromes} au total.` +
    (ctx.certifsExpirantes > 0 ? ` ${ctx.certifsExpirantes} arrivent à échéance — prévoir les renouvellements.` : '')

  const pac = ctx.pacRetard > 0
    ? `Dont ${ctx.ecartsCritiquesOuverts} écart(s) critique(s) non soldé(s) — à relancer.`
    : 'Tous les plans d\u2019actions sont à jour.'

  const missions = ctx.signaturesAttente > 0
    ? `${ctx.signaturesAttente} dossier(s) attendent votre signature.`
    : 'Aucun dossier en attente de signature.'

  const taux = ctx.totalAerodromes > 0
    ? Math.round(((ctx.certifies + ctx.homologues) / ctx.totalAerodromes) * 100)
    : 0
  const conformite = `${ctx.certifies} certifiés, ${ctx.homologues} homologués sur ${ctx.totalAerodromes} sites (soit ${taux} % en règle).`

  return { resume, sante, alertes, certifications, pac, missions, conformite, fallbackIA: true }
}

export async function expliquerSyntheseNationale(ctx: ContexteNational): Promise<SyntheseNationale> {
  const fallback = fallbackSyntheseNationale(ctx)
  const fb: Record<string, string> = {
    resume: fallback.resume,
    sante: fallback.sante,
    alertes: fallback.alertes,
    certifications: fallback.certifications,
    pac: fallback.pac,
    missions: fallback.missions,
    conformite: fallback.conformite,
  }

  const userMessage = `Explique en langage clair et très simple, pour le Directeur Général de l'ANACIM (non-expert), la situation nationale de la sécurité des aérodromes.

CONTEXTE RÉEL (ne jamais réinventer ni ajouter de chiffres) :
${JSON.stringify(ctx, null, 2)}

Contraintes :
- « resume » : 2 phrases maximum : état global du réseau + priorité du moment, avec les chiffres réels.
- Une phrase courte par carte : sante, alertes, certifications, pac, missions, conformite.
- Langage très simple, phrases courtes, aucun acronyme sans explication.
- Ne pas inventer de données absentes du contexte.

Retourne uniquement un JSON :
{
  "resume": "...",
  "sante": "...",
  "alertes": "...",
  "certifications": "...",
  "pac": "...",
  "missions": "...",
  "conformite": "..."
}`

  const result = await aiClient.callJSON<Record<string, string>>(
    {
      systemPrompt: RISK_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.3,
      maxTokens: 512,
      responseFormat: 'json_object',
    },
    fb
  )

  const clean = (key: keyof SyntheseNationale): string => {
    const v = result[key]
    return typeof v === 'string' && v.trim() ? v.trim() : String(fallback[key])
  }

  const texte: SyntheseNationale = {
    resume: clean('resume'),
    sante: clean('sante'),
    alertes: clean('alertes'),
    certifications: clean('certifications'),
    pac: clean('pac'),
    missions: clean('missions'),
    conformite: clean('conformite'),
    fallbackIA: false,
  }

  const toutFallback =
    texte.resume === fallback.resume &&
    texte.sante === fallback.sante &&
    texte.alertes === fallback.alertes &&
    texte.certifications === fallback.certifications &&
    texte.pac === fallback.pac &&
    texte.missions === fallback.missions &&
    texte.conformite === fallback.conformite

  return { ...texte, fallbackIA: toutFallback }
}
