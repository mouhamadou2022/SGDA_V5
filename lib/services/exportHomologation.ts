// lib/services/exportHomologation.ts
// Rapport PDF national d'homologation des aérodromes nationaux :
// - Page de garde + KPIs
// - Synthèse décisionnelle AERORISQ (ou analyse déterministe en secours)
// - Fiche détaillée par aérodrome : statut, échéance, renouvellement, phases 1→3
// - Alertes : homologations expirant sous 30/90 j, expirées, suspendues, phases bloquées

'use client'

import type { Aerodrome, Homologation, ProfilRisque } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { creerRapportPdf, PDF_COLORS } from '@/lib/services/pdfRapport'
import type { RGB } from '@/lib/services/pdfRapport'
import { getPhaseStats, getHomologationProgress } from '@/lib/homologationUtils'
import {
  formatDateFR, joursRestants, classerEcheance, libelleEcheance,
  genererSyntheseAerorisq,
} from '@/lib/services/exportReglementaire'
import type { Echeance } from '@/lib/services/exportReglementaire'

export const PHASES_HOMOLOGATION = [
  { numero: 1, nom: 'Demande Formelle' },
  { numero: 2, nom: 'Vérification sur Site' },
  { numero: 3, nom: 'Délivrance Décision' },
]

export interface LignePhaseHomo {
  numero: number
  nom: string
  etat: 'terminee' | 'en_cours' | 'bloquee' | 'non_commencee'
  dateReception?: string
  cloture?: string
  decision?: string
}

export interface DetailAerodromeHomo {
  id: string
  code_oaci: string
  nom: string
  region?: string
  categorie?: string
  homologation?: Homologation
  profil?: ProfilRisque
  statutLabel: string
  statutCouleur: RGB
  phaseActive: number
  progression: number
  typeDemande: string
  dateDelivrance?: string
  dateExpiration?: string
  joursRestants: number | null
  echeance: Echeance
  phases: LignePhaseHomo[]
  alertes: Array<{ niveau: 'info' | 'warning' | 'critical'; message: string }>
}

export interface EtatHomologation {
  date: string
  totalAerodromes: number
  homologues: number
  enCours: number
  suspendus: number
  expires: number
  expirants30: number
  expirants90: number
  renouvellements: number
  phasesBloquees: number
  details: DetailAerodromeHomo[]
}

export const STATUT_COULEURS_HOMO: Record<string, RGB> = {
  homologue: PDF_COLORS.green,
  en_cours: PDF_COLORS.blue,
  suspendu: PDF_COLORS.amber,
  expire: PDF_COLORS.red,
  archive: PDF_COLORS.gray,
  non_homologue: PDF_COLORS.gray,
}

export function libelleStatutHomo(statut?: string): string {
  switch (statut) {
    case 'homologue': return 'Homologué'
    case 'en_cours': return 'En cours'
    case 'suspendu': return 'Suspendu'
    case 'expire': return 'Expiré'
    case 'archive': return 'Archivé'
    default: return 'Non homologué'
  }
}

function etatPhaseHomo(numero: number, phaseActive: number, dateReception?: string, cloture?: string): LignePhaseHomo['etat'] {
  if (cloture || numero < phaseActive) return 'terminee'
  if (numero > phaseActive) return 'non_commencee'
  if (!dateReception) return 'non_commencee'
  const days = Math.floor((Date.now() - new Date(dateReception).getTime()) / 86_400_000)
  return days > 60 ? 'bloquee' : 'en_cours'
}

function extrairePhasesHomo(h: Homologation): LignePhaseHomo[] {
  const d = h.phases_data as any
  const active = h.phase_active || 1
  return PHASES_HOMOLOGATION.map(({ numero, nom }) => {
    const p = d?.[`phase${numero}`] || {}
    let decision = '—'
    if (numero === 1 && p.observations) decision = p.observations
    if (numero === 2) decision = p.conclusion ? `${p.conclusion}${p.score_conformite != null ? ` · ${p.score_conformite}%` : ''}` : '—'
    if (numero === 3) decision = p.numero_decision ? `${p.numero_decision}${p.nature_decision ? ` · ${p.nature_decision}` : ''}` : '—'
    return {
      numero, nom,
      etat: etatPhaseHomo(numero, active, p.date_reception || p.date_verification, p.cloture_le),
      dateReception: p.date_reception || p.date_verification || p.date_delivrance,
      cloture: p.cloture_le,
      decision,
    }
  })
}

export function collecterEtatHomologation(): EtatHomologation {
  const store = useAppStore.getState()
  const aerodromes: Aerodrome[] = (store.aerodromes || []).filter(a => a.type === 'national')
  const homologations: Homologation[] = store.homologations || []

  const details: DetailAerodromeHomo[] = aerodromes
    .map((a) => {
      const h = homologations.find(x => x.aerodrome_id === a.id)
      const profil = store.profilsRisque?.[a.id]
      const dateExpiration = h?.date_expiration || h?.phases_data?.phase3?.date_expiration
      const jr = joursRestants(dateExpiration)
      const statutLabel = libelleStatutHomo(h?.statut_global)
      const alertes: DetailAerodromeHomo['alertes'] = []
      if (jr !== null) {
        if (jr < 0) alertes.push({ niveau: 'critical', message: `Homologation expirée depuis ${-jr} jours — renouvellement requis immédiatement.` })
        else if (jr < 30) alertes.push({ niveau: 'critical', message: `Homologation expire dans ${jr} jours — engager le renouvellement en urgence.` })
        else if (jr < 90) alertes.push({ niveau: 'warning', message: `Homologation expire dans ${jr} jours — prévoir le renouvellement.` })
      }
      if (h && getPhaseStats(h).blocked > 0) {
        alertes.push({ niveau: 'warning', message: `${getPhaseStats(h).blocked} phase(s) bloquée(s) sans activité depuis plus de 60 jours.` })
      }
      return {
        id: a.id,
        code_oaci: a.code_oaci,
        nom: a.nom,
        region: a.region,
        categorie: a.categorie_sslia,
        homologation: h,
        profil,
        statutLabel,
        statutCouleur: STATUT_COULEURS_HOMO[h?.statut_global || 'non_homologue'],
        phaseActive: h?.phase_active || 1,
        progression: h ? getHomologationProgress(h) : 0,
        typeDemande: h?.type_homologation === 'renouvellement' ? 'Renouvellement' : h ? 'Initiale' : '—',
        dateDelivrance: h?.date_delivrance || h?.phases_data?.phase3?.date_delivrance,
        dateExpiration,
        joursRestants: jr,
        echeance: classerEcheance(jr),
        phases: h ? extrairePhasesHomo(h) : PHASES_HOMOLOGATION.map(({ numero, nom }) => ({ numero, nom, etat: 'non_commencee' as const })),
        alertes,
      }
    })
    .sort((x, y) => {
      const ordre: Record<string, number> = { critique: 0, expire: 1, proche: 2, ok: 3, nulle: 4 }
      return (ordre[x.echeance] ?? 5) - (ordre[y.echeance] ?? 5) || x.code_oaci.localeCompare(y.code_oaci)
    })

  const homologues = details.filter(d => d.homologation?.statut_global === 'homologue').length
  const enCours = details.filter(d => d.homologation?.statut_global === 'en_cours').length
  const suspendus = details.filter(d => d.homologation?.statut_global === 'suspendu').length
  const expires = details.filter(d => d.homologation?.statut_global === 'expire').length
  const expirants30 = details.filter(d => d.joursRestants !== null && d.joursRestants >= 0 && d.joursRestants < 30).length
  const expirants90 = details.filter(d => d.joursRestants !== null && d.joursRestants >= 0 && d.joursRestants < 90).length
  const renouvellements = details.filter(d => d.homologation?.type_homologation === 'renouvellement').length
  const phasesBloquees = homologations.reduce((acc, h) => acc + getPhaseStats(h).blocked, 0)

  return {
    date: formatDateFR(new Date().toISOString()),
    totalAerodromes: details.length,
    homologues, enCours, suspendus, expires, expirants30, expirants90, renouvellements, phasesBloquees,
    details,
  }
}

function promptSyntheseAerorisq(d: EtatHomologation): string {
  const lignes = d.details.map(x => {
    const exp = x.dateExpiration ? ` expire ${formatDateFR(x.dateExpiration)}` : ''
    const jr = x.joursRestants !== null ? ` (${libelleEcheance(x.joursRestants)})` : ''
    const rsk = x.profil ? ` risque ${x.profil.score_global}/100 ${x.profil.niveau}` : ''
    return `${x.code_oaci} — ${x.nom} — ${x.statutLabel}${exp}${jr} — ${x.typeDemande}${rsk}${x.phaseActive && x.homologation ? ` — phase ${x.phaseActive}/3` : ''}`
  }).join('\n')

  return `Tu es un expert en homologation des aérodromes à l'ANACIM Sénégal (Annexe 14 OACI, Doc 9774 AN/969, RAS 14).
Rédige en français une SYNTHÈSE DÉCISIONNELLE (250 à 400 mots) pour le rapport national d'homologation, avec cette structure :
- Contexte général : taille du parc national, taux d'homologation, dossiers en cours.
- Priorités d'action : homologations expirant sous 30 jours (urgent) et 90 jours, homologations expirées, renouvellements en cours, phases bloquées.
- Points de vigilance par aérodrome (1 à 2 lignes chacun, uniquement pour les plus critiques).
- Recommandations concrètes et hiérarchisées (ordre d'urgence).

DONNÉES (${d.totalAerodromes} aérodromes nationaux) :
${lignes}

Réponds uniquement avec la synthèse en HTML simple (<p> pour les paragraphes, <ul>/<li> pour les listes). Pas de titre introductif ni de préambule.`
}

export function syntheseDeterministeHomo(d: EtatHomologation): string {
  const blocs: string[] = []
  blocs.push(`Le parc compte ${d.totalAerodromes} aérodromes nationaux : ${d.homologues} homologués, ${d.enCours} en cours d'homologation, ${d.suspendus} suspendus, ${d.expires} expirés.`)
  if (d.expirants30 > 0) blocs.push(`Urgence : ${d.expirants30} homologation(s) expire(nt) sous 30 jours.`)
  if (d.expirants90 > 0) blocs.push(`${d.expirants90} homologation(s) expire(nt) sous 90 jours — engager les renouvellements.`)
  if (d.renouvellements > 0) blocs.push(`${d.renouvellements} renouvellement(s) sont en cours de traitement.`)
  if (d.phasesBloquees > 0) blocs.push(`${d.phasesBloquees} phase(s) bloquée(s) sans activité depuis plus de 60 jours.`)
  const alertes = d.details.filter(x => x.echeance === 'expire' || x.echeance === 'critique')
  if (alertes.length > 0) {
    blocs.push('Aérodromes prioritaires :')
    for (const x of alertes) blocs.push(`• ${x.code_oaci} — ${x.nom} — ${x.statutLabel}${x.dateExpiration ? `, expiration ${formatDateFR(x.dateExpiration)} (${libelleEcheance(x.joursRestants)})` : ''}.`)
  }
  blocs.push('Recommandations : engager les renouvellements des homologations expirant sous 90 jours, relancer les dossiers à phases bloquées, et finaliser les homologations en cours avant toute échéance.')
  return blocs.join('\n')
}

export async function batirRapportHomologationPdf(d: EtatHomologation, synthese: string): Promise<Blob> {
  const pdf = await creerRapportPdf({ orientation: 'landscape' })
  const date = new Date().toISOString().split('T')[0]
  const ref = `HOM-${date.replace(/-/g, '')}-${String(d.totalAerodromes).padStart(2, '0')}A`

  pdf.coverPage({
    titre: "RAPPORT NATIONAL D'HOMOLOGATION DES AÉRODROMES",
    sousTitre: 'État réglementaire des aérodromes nationaux — ANACIM Sénégal',
    ref,
    meta: [
      ['Date du rapport', d.date],
      ['Aérodromes concernés', `${d.totalAerodromes}`],
      ['Homologués', `${d.homologues}`],
      ['En cours', `${d.enCours}`],
      ['Suspendus / Expirés', `${d.suspendus} / ${d.expires}`],
      ['Expirations ≤ 90 jours', `${d.expirants90}`],
    ],
  })

  pdf.addPage()

  pdf.kpiBoxes([
    { value: String(d.homologues), label: 'Homologués', color: PDF_COLORS.green },
    { value: String(d.enCours), label: 'En cours', color: PDF_COLORS.blue },
    { value: String(d.expirants30), label: 'Expirations ≤ 30 j', color: PDF_COLORS.red },
    { value: String(d.expirants90), label: 'Expirations ≤ 90 j', color: PDF_COLORS.amber },
    { value: String(d.suspendus), label: 'Suspendus', color: PDF_COLORS.amber },
    { value: String(d.expires), label: 'Expirés', color: PDF_COLORS.red },
    { value: String(d.renouvellements), label: 'Renouvellements', color: PDF_COLORS.blue },
    { value: String(d.phasesBloquees), label: 'Phases bloquées', color: PDF_COLORS.red },
  ])

  pdf.sectionTitle('Synthèse décisionnelle')
  const texte = synthese || syntheseDeterministeHomo(d)
  pdf.paragraphsFromHtml(`<p>${texte.replace(/\n/g, '<br/>')}</p>`)
  pdf.paragraph(synthese ? 'Source : AERORISQ (analyse décisionnelle automatique).' : 'Source : analyse déterministe (AERORISQ indisponible au moment de l\'export).', 8, { color: PDF_COLORS.gray, italic: true })

  pdf.addPage()
  pdf.sectionTitle('Situation par aérodrome')

  for (const x of d.details) {
    pdf.ensure(16)
    pdf.subHeading(`${x.code_oaci} — ${x.nom}`, { color: x.statutCouleur })
    pdf.kvTable([
      ['Statut', x.statutLabel],
      ['Type de demande', x.typeDemande],
      ['Phase active', x.homologation ? `${x.phaseActive}/3` : '—'],
      ['Progression', x.homologation ? `${x.progression}%` : '—'],
      ['Catégorie SSLIA', x.categorie || '—'],
      ['Région', x.region || '—'],
      ['Date de délivrance', formatDateFR(x.dateDelivrance)],
      ['Date d\'expiration', formatDateFR(x.dateExpiration)],
      ['Échéance', x.joursRestants !== null ? libelleEcheance(x.joursRestants) : '—'],
      ['Score de risque', x.profil ? `${x.profil.score_global}/100 (${x.profil.niveau})` : '—'],
    ])
    if (x.alertes.length > 0) {
      for (const alerte of x.alertes) {
        pdf.infoBox(alerte.message, { title: alerte.niveau === 'critical' ? 'URGENT' : 'Attention', tone: alerte.niveau === 'critical' ? 'red' : 'amber' })
      }
    }
    pdf.subHeading('Phases')
    pdf.table({
      head: [['Phase', 'Intitulé', 'État', 'Date', 'Clôture', 'Décision / Référence']],
      body: x.phases.map(p => [
        String(p.numero), p.nom,
        p.etat === 'terminee' ? 'Terminée' : p.etat === 'en_cours' ? 'En cours' : p.etat === 'bloquee' ? 'Bloquée' : 'Non commencée',
        formatDateFR(p.dateReception), formatDateFR(p.cloture), p.decision || '—',
      ]),
      columnStyles: {
        0: { cellWidth: 12 }, 1: { cellWidth: 40 }, 2: { cellWidth: 24 },
        3: { cellWidth: 26 }, 4: { cellWidth: 26 },
      },
    })
    pdf.setY(pdf.y + 4)
  }

  pdf.drawFooter("RAPPORT NATIONAL D'HOMOLOGATION — ANACIM / Direction de la Navigation Aérienne")
  return pdf.blob()
}

export function nomFichierHomologation(): string {
  const date = new Date().toISOString().split('T')[0]
  return `Rapport_Homologations_${date}.pdf`
}

export interface ResultatExportHomologation {
  fichier: string
  syntheseAerorisq: boolean
}

/**
 * Orchestration complète : collecte des données → synthèse AERORISQ (avec
 * repli déterministe) → génération PDF → téléchargement.
 */
export async function genererRapportHomologation(): Promise<ResultatExportHomologation> {
  const d = collecterEtatHomologation()
  const synthese = await genererSyntheseAerorisq(promptSyntheseAerorisq(d))
  const blob = await batirRapportHomologationPdf(d, synthese)
  const { downloadBlob } = await import('@/lib/pdfGenerator')
  const fichier = nomFichierHomologation()
  downloadBlob(blob, fichier)
  return { fichier, syntheseAerorisq: Boolean(synthese) }
}
