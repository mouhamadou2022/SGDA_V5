// lib/services/exportRegistres.ts
// Exports PDF NATIFS des fiches de registre (surveillance, écart, événement,
// formation) — même langage de design que le bulletin mensuel (Times,
// couverture ANACIM, sections soulignées, tables). Remplace l'ancien export
// html2canvas (image tronquée/lourde) par du vrai texte paginé.

'use client'

import { creerRapportPdf } from '@/lib/services/pdfRapport'
import { downloadBlob } from '@/lib/pdfGenerator'
import { normaliserGravite } from '@/lib/evenementUtils'

export interface RegistreTimelineStep {
  etape: string
  date: string
  details?: string
}

export interface RegistreFichier {
  nom: string
  url: string
}

function fmtDate(d?: string): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? d.slice(0, 10) : dt.toLocaleDateString('fr-FR')
}

function renderTimeline(pdf: Awaited<ReturnType<typeof creerRapportPdf>>, steps: RegistreTimelineStep[]) {
  if (!steps || steps.length === 0) {
    pdf.paragraph('Aucune étape enregistrée.', 9.5)
    return
  }
  pdf.bulletList(
    steps.map(s => `${s.etape} — ${fmtDate(s.date)}${s.details ? ` : ${s.details}` : ''}`),
  )
}

function renderFichiers(pdf: Awaited<ReturnType<typeof creerRapportPdf>>, fichiers: RegistreFichier[]) {
  if (!fichiers || fichiers.length === 0) return
  pdf.subHeading('Documents joints')
  pdf.bulletList(fichiers.map(f => f.nom))
}

export async function exporterRegistreSurveillancePDF(
  s: any,
  timeline: RegistreTimelineStep[],
  fichiers: RegistreFichier[],
): Promise<void> {
  const pdf = await creerRapportPdf()
  pdf.coverPage({
    titre: 'FICHE DE REGISTRE — SURVEILLANCE',
    sousTitre: `${s?.aerodrome?.nom || ''} (${s?.aerodrome?.code_oaci || ''})`,
    ref: s?.reference || s?.id,
    meta: [
      ['Type', s?.type || '—'],
      ['Période', `${fmtDate(s?.date_debut)} → ${fmtDate(s?.date_fin)}`],
      ['Équipe', `${s?.equipe_ids?.length || 0} inspecteur(s)`],
      ['Statut', s?.statut || '—'],
    ],
  })
  pdf.addPage()
  let n = 1
  const section = (t: string) => { pdf.sectionTitle(`${n}. ${t}`); n++ }

  section('IDENTIFICATION')
  pdf.kvTable([
    ['Aérodrome', `${s?.aerodrome?.nom || '—'} (${s?.aerodrome?.code_oaci || '—'})`],
    ['Type', s?.type || '—'],
    ['Période', `${fmtDate(s?.date_debut)} → ${fmtDate(s?.date_fin)}`],
    ['Équipe', `${s?.equipe_ids?.length || 0} inspecteur(s)`],
    ['Statut', s?.statut || '—'],
    ['Score global', s?.score_global !== undefined ? `${s.score_global}%` : '—'],
  ])

  if (s?.observations) {
    section('OBSERVATIONS')
    pdf.paragraph(s.observations)
  }

  section('CHRONOLOGIE')
  renderTimeline(pdf, timeline)
  renderFichiers(pdf, fichiers)

  pdf.drawFooter(`ANACIM — Registre de surveillance — ${s?.reference || s?.id || ''}`)
  downloadBlob(pdf.blob(), `surveillance-${s?.id || s?.reference || 'registre'}.pdf`)
}

export async function exporterRegistreEcartPDF(
  e: any,
  timeline: RegistreTimelineStep[],
  fichiers: RegistreFichier[],
): Promise<void> {
  const pdf = await creerRapportPdf()
  const decisionLabel = (d?: string) =>
    d === 'accepte' ? 'Accepté' : d === 'reserve' ? 'Accepté avec réserves' : d === 'refuse' ? 'Refusé' : '—'

  pdf.coverPage({
    titre: 'FICHE DE REGISTRE — ÉCART / PAC',
    sousTitre: e?.aerodrome?.nom ? `${e.aerodrome.nom} (${e.aerodrome.code_oaci || ''})` : undefined,
    ref: e?.reference,
    meta: [
      ['Niveau de risque', e?.niveau_risque || '—'],
      ['Statut', e?.statut || '—'],
      ['Réf. réglementaire', e?.ref_reglementaire || '—'],
    ],
  })
  pdf.addPage()
  let n = 1
  const section = (t: string) => { pdf.sectionTitle(`${n}. ${t}`); n++ }

  section('IDENTIFICATION')
  pdf.kvTable([
    ['Référence', e?.reference || '—'],
    ['Niveau de risque', e?.niveau_risque || '—'],
    ['Statut', e?.statut || '—'],
    ['Réf. réglementaire', e?.ref_reglementaire || '—'],
    ['Aérodrome', e?.aerodrome?.nom ? `${e.aerodrome.nom} (${e.aerodrome.code_oaci || ''})` : e?.aerodrome_id || '—'],
  ])

  section('LIBELLÉ')
  pdf.paragraph(e?.libelle || '—')

  if (e?.pac) {
    section("PLAN D'ACTIONS CORRECTIVES (PAC)")
    if (e.pac.actions?.length > 0) {
      pdf.table({
        head: [['Action', 'Responsable', 'Échéance']],
        body: e.pac.actions.map((a: any) => [a?.description || '', a?.responsable || '—', a?.date_prevue || '—']),
        columnStyles: {
          0: { cellWidth: 106 },
          1: { cellWidth: 34 },
          2: { cellWidth: 26, halign: 'center' },
        },
      })
    } else {
      pdf.paragraph('Aucune action corrective renseignée.', 9.5)
    }
    pdf.paragraph(`Soumis par ${e.pac.soumis_par || '—'} le ${fmtDate(e.pac.soumis_le)}`, 9, { italic: true })
  }

  if (e?.evaluation_pac) {
    section('ÉVALUATION DU PAC')
    pdf.kvTable([
      ['Note globale', `${e.evaluation_pac.note_globale}/10`],
      ['Décision', decisionLabel(e.evaluation_pac.decision)],
      ['Évalué par', e.evaluation_pac.evalue_par || '—'],
      ['Date d\'évaluation', fmtDate(e.evaluation_pac.evalue_le)],
    ])
    if (e.evaluation_pac.commentaire_refus) {
      pdf.paragraph(e.evaluation_pac.commentaire_refus)
    }
  }

  if (e?.cloture_le) {
    section('CLÔTURE')
    pdf.paragraph(`Écart clôturé le ${fmtDate(e.cloture_le)}.`, 10)
  }

  section('CHRONOLOGIE')
  renderTimeline(pdf, timeline)
  renderFichiers(pdf, fichiers)

  pdf.drawFooter(`ANACIM — Registre des écarts — ${e?.reference || e?.id || ''}`)
  downloadBlob(pdf.blob(), `ecart-${e?.reference || e?.id || 'registre'}.pdf`)
}

export async function exporterRegistreEvenementPDF(
  ev: any,
  timeline: RegistreTimelineStep[],
  fichiers: RegistreFichier[],
): Promise<void> {
  const pdf = await creerRapportPdf()
  const graviteLabel = (g?: string) => {
    const labels: Record<string, string> = { critique: 'Critique', eleve: 'Élevé', moyen: 'Moyen', faible: 'Faible' }
    return labels[normaliserGravite(g)] || g || '—'
  }

  pdf.coverPage({
    titre: 'FICHE DE REGISTRE — ÉVÉNEMENT',
    sousTitre: ev?.aerodrome?.nom || ev?.aerodrome_id,
    ref: ev?.reference,
    meta: [
      ['Gravité', graviteLabel(ev?.gravite)],
      ['Type', ev?.type || '—'],
      ['Date / Heure', `${ev?.date || '—'}${ev?.heure ? ` à ${ev.heure}` : ''}`],
      ['Aérodrome', ev?.aerodrome?.nom || ev?.aerodrome_id || '—'],
    ],
  })
  pdf.addPage()
  let n = 1
  const section = (t: string) => { pdf.sectionTitle(`${n}. ${t}`); n++ }

  section('IDENTIFICATION')
  pdf.kvTable([
    ['Référence', ev?.reference || '—'],
    ['Gravité', graviteLabel(ev?.gravite)],
    ['Type', ev?.type || '—'],
    ['Date / Heure', `${ev?.date || '—'}${ev?.heure ? ` à ${ev.heure}` : ''}`],
    ['Aérodrome', ev?.aerodrome?.nom || ev?.aerodrome_id || '—'],
    ['Localisation', ev?.localisation || '—'],
    ['Statut', ev?.statut || '—'],
  ])

  section('DESCRIPTION')
  pdf.paragraph(ev?.description || '—')

  if (ev?.actions_immediates) {
    section('ACTIONS IMMÉDIATES')
    pdf.paragraph(ev.actions_immediates)
  }

  if (ev?.aeronef) {
    section('AÉRONEF IMPLIQUÉ')
    pdf.kvTable([
      ['Immatriculation', ev.aeronef.immatriculation || '—'],
      ['Type', ev.aeronef.type || '—'],
      ['Exploitant', ev.aeronef.exploitant || '—'],
    ])
  }

  section('CHRONOLOGIE')
  renderTimeline(pdf, timeline)
  renderFichiers(pdf, fichiers)

  pdf.drawFooter(`ANACIM — Registre des événements — ${ev?.reference || ev?.id || ''}`)
  downloadBlob(pdf.blob(), `evenement-${ev?.reference || ev?.id || 'registre'}.pdf`)
}

export async function exporterRegistreFormationPDF(
  f: any,
  timeline: RegistreTimelineStep[],
): Promise<void> {
  const pdf = await creerRapportPdf()

  pdf.coverPage({
    titre: 'FICHE DE REGISTRE — FORMATION',
    sousTitre: f?.titre,
    ref: f?.id,
    meta: [
      ['Type', f?.type || '—'],
      ['Date', fmtDate(f?.date)],
      ['Durée', f?.duree_heures ? `${f.duree_heures}h` : '—'],
      ['Lieu', f?.lieu || '—'],
    ],
  })
  pdf.addPage()
  let n = 1
  const section = (t: string) => { pdf.sectionTitle(`${n}. ${t}`); n++ }

  section('IDENTIFICATION')
  pdf.kvTable([
    ['Type', f?.type || '—'],
    ['Date', fmtDate(f?.date)],
    ['Durée', f?.duree_heures ? `${f.duree_heures}h` : '—'],
    ['Lieu', f?.lieu || '—'],
    ['Formateur', f?.formateur || '—'],
  ])

  if (f?.objectifs) {
    section('OBJECTIFS')
    pdf.paragraph(f.objectifs)
  }

  if (f?.evaluation && Object.keys(f.evaluation).length > 0) {
    section('ÉVALUATIONS')
    pdf.kvTable(Object.entries(f.evaluation).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), `${v}/5`]))
  }

  if (f?.documents && f.documents.length > 0) {
    section('DOCUMENTS / ATTESTATIONS')
    pdf.bulletList(f.documents.map((d: any) => d?.nom || '—'))
  }

  section('CHRONOLOGIE')
  renderTimeline(pdf, timeline)

  pdf.drawFooter(`ANACIM — Registre des formations — ${f?.titre || f?.id || ''}`)
  downloadBlob(pdf.blob(), `formation-${f?.id || 'registre'}.pdf`)
}
