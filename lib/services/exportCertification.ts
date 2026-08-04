// lib/services/exportCertification.ts
// Rapport PDF national de certification des aérodromes internationaux :
// - Page de garde + KPIs
// - Synthèse décisionnelle AERORISQ (ou analyse déterministe en secours)
// - Fiche détaillée par aérodrome : statut, échéance, renouvellement, phases 1→5
// - Alertes : certifications expirant sous 30/90 j, expirées, suspendues, phases bloquées

'use client'

import type { Aerodrome, Certification, ProfilRisque } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { creerRapportPdf, PDF_COLORS } from '@/lib/services/pdfRapport'
import type { RGB } from '@/lib/services/pdfRapport'
import { getPhaseStats, getCertificationProgress } from '@/lib/certificationUtils'
import {
  formatDateFR, joursRestants, classerEcheance, libelleEcheance,
  genererSyntheseAerorisq,
} from '@/lib/services/exportReglementaire'
import type { Echeance } from '@/lib/services/exportReglementaire'

export const PHASES_CERTIFICATION = [
  { numero: 1, nom: "Expression d'Intérêt" },
  { numero: 2, nom: 'Demande Formelle' },
  { numero: 3, nom: 'Vérification sur Site' },
  { numero: 4, nom: 'Délivrance du Certificat' },
  { numero: 5, nom: 'Publication Statut' },
]

export interface LignePhaseCert {
  numero: number
  nom: string
  etat: 'terminee' | 'en_cours' | 'bloquee' | 'non_commencee'
  dateReception?: string
  cloture?: string
  decision?: string
}

export interface DetailAerodromeCert {
  id: string
  code_oaci: string
  nom: string
  region?: string
  categorie?: string
  certification?: Certification
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
  phases: LignePhaseCert[]
  alertes: Array<{ niveau: 'info' | 'warning' | 'critical'; message: string }>
}

export interface EtatCertification {
  date: string
  totalAerodromes: number
  certifies: number
  enCours: number
  suspendus: number
  expires: number
  expirants30: number
  expirants90: number
  renouvellements: number
  phasesBloquees: number
  details: DetailAerodromeCert[]
}

export const STATUT_COULEURS_CERT: Record<string, RGB> = {
  certifie: PDF_COLORS.green,
  en_cours: PDF_COLORS.blue,
  suspendu: PDF_COLORS.amber,
  expire: PDF_COLORS.red,
  archive: PDF_COLORS.gray,
  non_certifie: PDF_COLORS.gray,
}

export function libelleStatutCert(statut?: string): string {
  switch (statut) {
    case 'certifie': return 'Certifié'
    case 'en_cours': return 'En cours'
    case 'suspendu': return 'Suspendu'
    case 'expire': return 'Expiré'
    case 'archive': return 'Archivé'
    default: return 'Non certifié'
  }
}

function etatPhaseCert(numero: number, phaseActive: number, dateReception?: string, cloture?: string): LignePhaseCert['etat'] {
  if (cloture || numero < phaseActive) return 'terminee'
  if (numero > phaseActive) return 'non_commencee'
  if (!dateReception) return 'non_commencee'
  const days = Math.floor((Date.now() - new Date(dateReception).getTime()) / 86_400_000)
  return days > 60 ? 'bloquee' : 'en_cours'
}

function extrairePhasesCert(cert: Certification): LignePhaseCert[] {
  const d = cert.phases_data as any
  const active = cert.phase_active || 1
  return PHASES_CERTIFICATION.map(({ numero, nom }) => {
    const p = d?.[`phase${numero}`] || {}
    let decision = '—'
    if (numero === 1 && (p.nature_demande || p.description)) decision = p.nature_demande || p.description
    if (numero === 2 && p.avis) decision = `${p.avis}${p.numero_dossier ? ` · ${p.numero_dossier}` : ''}`
    if (numero === 3) decision = p.conclusion ? `${p.conclusion}${p.score_conformite != null ? ` · ${p.score_conformite}%` : ''}` : '—'
    if (numero === 4 && p.numero_certificat) decision = p.numero_certificat
    if (numero === 5 && p.statut_officiel) decision = p.statut_officiel
    return {
      numero, nom,
      etat: etatPhaseCert(numero, active, p.date_reception || p.date_verification, p.cloture_le),
      dateReception: p.date_reception || p.date_verification || p.date_delivrance,
      cloture: p.cloture_le,
      decision,
    }
  })
}

export function collecterEtatCertification(): EtatCertification {
  const store = useAppStore.getState()
  const aerodromes: Aerodrome[] = (store.aerodromes || []).filter(a => a.type === 'international')
  const certifications: Certification[] = store.certifications || []

  const details: DetailAerodromeCert[] = aerodromes
    .map((a) => {
      const cert = certifications.find(c => c.aerodrome_id === a.id)
      const profil = store.profilsRisque?.[a.id]
      const dateExpiration = cert?.date_expiration || cert?.phases_data?.phase4?.date_expiration
      const jr = joursRestants(dateExpiration)
      const statutLabel = libelleStatutCert(cert?.statut_global)
      const alertes: DetailAerodromeCert['alertes'] = []
      if (jr !== null) {
        if (jr < 0) alertes.push({ niveau: 'critical', message: `Certificat expiré depuis ${-jr} jours — renouvellement requis immédiatement.` })
        else if (jr < 30) alertes.push({ niveau: 'critical', message: `Certificat expire dans ${jr} jours — engager le renouvellement en urgence.` })
        else if (jr < 90) alertes.push({ niveau: 'warning', message: `Certificat expire dans ${jr} jours — prévoir le renouvellement.` })
      }
      if (cert && getPhaseStats(cert).blocked > 0) {
        alertes.push({ niveau: 'warning', message: `${getPhaseStats(cert).blocked} phase(s) bloquée(s) sans activité depuis plus de 60 jours.` })
      }
      return {
        id: a.id,
        code_oaci: a.code_oaci,
        nom: a.nom,
        region: a.region,
        categorie: a.categorie_sslia,
        certification: cert,
        profil,
        statutLabel,
        statutCouleur: STATUT_COULEURS_CERT[cert?.statut_global || 'non_certifie'],
        phaseActive: cert?.phase_active || 1,
        progression: cert ? getCertificationProgress(cert) : 0,
        typeDemande: cert?.type_certification === 'renouvellement' ? 'Renouvellement' : cert ? 'Initiale' : '—',
        dateDelivrance: cert?.date_delivrance || cert?.phases_data?.phase4?.date_delivrance,
        dateExpiration,
        joursRestants: jr,
        echeance: classerEcheance(jr),
        phases: cert ? extrairePhasesCert(cert) : PHASES_CERTIFICATION.map(({ numero, nom }) => ({ numero, nom, etat: 'non_commencee' as const })),
        alertes,
      }
    })
    .sort((x, y) => {
      const ordre: Record<string, number> = { critique: 0, expire: 1, proche: 2, ok: 3, nulle: 4 }
      return (ordre[x.echeance] ?? 5) - (ordre[y.echeance] ?? 5) || x.code_oaci.localeCompare(y.code_oaci)
    })

  const certifies = details.filter(d => d.certification?.statut_global === 'certifie').length
  const enCours = details.filter(d => d.certification?.statut_global === 'en_cours').length
  const suspendus = details.filter(d => d.certification?.statut_global === 'suspendu').length
  const expires = details.filter(d => d.certification?.statut_global === 'expire').length
  const expirants30 = details.filter(d => d.joursRestants !== null && d.joursRestants >= 0 && d.joursRestants < 30).length
  const expirants90 = details.filter(d => d.joursRestants !== null && d.joursRestants >= 0 && d.joursRestants < 90).length
  const renouvellements = details.filter(d => d.certification?.type_certification === 'renouvellement').length
  const phasesBloquees = certifications.reduce((acc, c) => acc + getPhaseStats(c).blocked, 0)

  return {
    date: formatDateFR(new Date().toISOString()),
    totalAerodromes: details.length,
    certifies, enCours, suspendus, expires, expirants30, expirants90, renouvellements, phasesBloquees,
    details,
  }
}

function promptSyntheseAerorisq(d: EtatCertification): string {
  const lignes = d.details.map(x => {
    const exp = x.dateExpiration ? ` expire ${formatDateFR(x.dateExpiration)}` : ''
    const jr = x.joursRestants !== null ? ` (${libelleEcheance(x.joursRestants)})` : ''
    const rsk = x.profil ? ` risque ${x.profil.score_global}/100 ${x.profil.niveau}` : ''
    return `${x.code_oaci} — ${x.nom} — ${x.statutLabel}${exp}${jr} — ${x.typeDemande}${rsk}${x.phaseActive && x.certification ? ` — phase ${x.phaseActive}/5` : ''}`
  }).join('\n')

  return `Tu es un expert en certification des aérodromes à l'ANACIM Sénégal (Annexe 14 OACI, Doc 9774 AN/969, RAS 14).
Rédige en français une SYNTHÈSE DÉCISIONNELLE (250 à 400 mots) pour le rapport national de certification, avec cette structure :
- Contexte général : taille du parc, taux de certification, dossiers en cours.
- Priorités d'action : certifications expirant sous 30 jours (urgent) et 90 jours, certificats expirés, renouvellements en cours, phases bloquées.
- Points de vigilance par aérodrome (1 à 2 lignes chacun, uniquement pour les plus critiques).
- Recommandations concrètes et hiérarchisées (ordre d'urgence).

DONNÉES (${d.totalAerodromes} aérodromes internationaux) :
${lignes}

Réponds uniquement avec la synthèse en HTML simple (<p> pour les paragraphes, <ul>/<li> pour les listes). Pas de titre introductif ni de préambule.`
}

export function syntheseDeterministeCert(d: EtatCertification): string {
  const blocs: string[] = []
  blocs.push(`Le parc compte ${d.totalAerodromes} aérodromes internationaux : ${d.certifies} certifiés, ${d.enCours} en cours de certification, ${d.suspendus} suspendus, ${d.expires} expirés.`)
  if (d.expirants30 > 0) blocs.push(`Urgence : ${d.expirants30} certificat(s) expire(nt) sous 30 jours.`)
  if (d.expirants90 > 0) blocs.push(`${d.expirants90} certificat(s) expire(nt) sous 90 jours — engager les renouvellements.`)
  if (d.renouvellements > 0) blocs.push(`${d.renouvellements} renouvellement(s) sont en cours de traitement.`)
  if (d.phasesBloquees > 0) blocs.push(`${d.phasesBloquees} phase(s) bloquée(s) sans activité depuis plus de 60 jours.`)
  const alertes = d.details.filter(x => x.echeance === 'expire' || x.echeance === 'critique')
  if (alertes.length > 0) {
    blocs.push('Aérodromes prioritaires :')
    for (const x of alertes) blocs.push(`• ${x.code_oaci} — ${x.nom} — ${x.statutLabel}${x.dateExpiration ? `, expiration ${formatDateFR(x.dateExpiration)} (${libelleEcheance(x.joursRestants)})` : ''}.`)
  }
  blocs.push('Recommandations : engager les renouvellements des certificats expirant sous 90 jours, relancer les dossiers à phases bloquées, et finaliser les certifications en cours avant toute échéance.')
  return blocs.join('\n')
}

export async function batirRapportCertificationPdf(d: EtatCertification, synthese: string): Promise<Blob> {
  const pdf = await creerRapportPdf({ orientation: 'landscape' })
  const date = new Date().toISOString().split('T')[0]
  const ref = `CERT-${date.replace(/-/g, '')}-${String(d.totalAerodromes).padStart(2, '0')}A`

  pdf.coverPage({
    titre: "RAPPORT NATIONAL DE CERTIFICATION DES AÉRODROMES",
    sousTitre: "État réglementaire des aérodromes internationaux — ANACIM Sénégal",
    ref,
    meta: [
      ['Date du rapport', d.date],
      ['Aérodromes concernés', `${d.totalAerodromes}`],
      ['Certifiés', `${d.certifies}`],
      ['En cours', `${d.enCours}`],
      ['Suspendus / Expirés', `${d.suspendus} / ${d.expires}`],
      ['Expirations ≤ 90 jours', `${d.expirants90}`],
    ],
  })

  pdf.addPage()

  pdf.kpiBoxes([
    { value: String(d.certifies), label: 'Certifiés', color: PDF_COLORS.green },
    { value: String(d.enCours), label: 'En cours', color: PDF_COLORS.blue },
    { value: String(d.expirants30), label: 'Expirations ≤ 30 j', color: PDF_COLORS.red },
    { value: String(d.expirants90), label: 'Expirations ≤ 90 j', color: PDF_COLORS.amber },
    { value: String(d.suspendus), label: 'Suspendus', color: PDF_COLORS.amber },
    { value: String(d.expires), label: 'Expirés', color: PDF_COLORS.red },
    { value: String(d.renouvellements), label: 'Renouvellements', color: PDF_COLORS.blue },
    { value: String(d.phasesBloquees), label: 'Phases bloquées', color: PDF_COLORS.red },
  ])

  pdf.sectionTitle('Synthèse décisionnelle')
  const texte = synthese || syntheseDeterministeCert(d)
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
      ['Phase active', x.certification ? `${x.phaseActive}/5` : '—'],
      ['Progression', x.certification ? `${x.progression}%` : '—'],
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

  pdf.drawFooter('RAPPORT NATIONAL DE CERTIFICATION — ANACIM / Direction de la Navigation Aérienne')
  return pdf.blob()
}

export function nomFichierCertification(): string {
  const date = new Date().toISOString().split('T')[0]
  return `Rapport_Certifications_${date}.pdf`
}

export interface ResultatExportCertification {
  fichier: string
  syntheseAerorisq: boolean
}

/**
 * Orchestration complète : collecte des données → synthèse AERORISQ (avec
 * repli déterministe) → génération PDF → téléchargement.
 */
export async function genererRapportCertification(): Promise<ResultatExportCertification> {
  const d = collecterEtatCertification()
  const synthese = await genererSyntheseAerorisq(promptSyntheseAerorisq(d))
  const blob = await batirRapportCertificationPdf(d, synthese)
  const { downloadBlob } = await import('@/lib/pdfGenerator')
  const fichier = nomFichierCertification()
  downloadBlob(blob, fichier)
  return { fichier, syntheseAerorisq: Boolean(synthese) }
}
