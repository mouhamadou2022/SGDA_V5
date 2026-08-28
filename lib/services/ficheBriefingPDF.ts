// lib/services/ficheBriefingPDF.ts
// Fiche de briefing pré-mission PDF — ton administratif cohérent avec le
// bulletin mensuel de sécurité (style ANACIM : page de garde, KPI, sections,
// tableaux). Génération NATIVE jsPDF + jspdf-autotable, pagination automatique.
// Génération réutilisable (Blob) pour téléchargement ou envoi email.

'use client'

import { downloadBlob } from '@/lib/pdfGenerator'
import type { FicheBriefing } from '@/lib/store'

const PRIMARY: [number, number, number] = [0x1e, 0x40, 0x73]
const GREEN: [number, number, number] = [0x16, 0xa3, 0x4a]
const RED: [number, number, number] = [0xdc, 0x26, 0x26]
const AMBER: [number, number, number] = [0xd9, 0x77, 0x06]
const BLUE: [number, number, number] = [0x25, 0x63, 0xeb]
const GRAY: [number, number, number] = [0x64, 0x74, 0x8b]
const LIGHT_GREEN_BG: [number, number, number] = [0xf0, 0xfd, 0xf4]
const GREEN_BORDER: [number, number, number] = [0x22, 0xc5, 0x5e]

const PAGE_W = 210
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_Y = 287

export interface FicheBriefingPDFInput {
  fiche: FicheBriefing
  planning?: {
    date_debut?: string
    date_fin?: string
    annee_cible?: number
    priorite?: string
    statut?: string
    declencheur?: string
  }
  aerodrome?: {
    code_oaci?: string
    nom?: string
    type_entite?: string
  }
  redacteur?: string
}

function confianceColor(confiance: number): [number, number, number] {
  return confiance >= 70 ? GREEN : confiance >= 40 ? AMBER : RED
}

function prioriteLabel(p?: string): string {
  switch (p) {
    case 'critique': return 'Critique'
    case 'haute': return 'Haute'
    case 'moyenne': return 'Moyenne'
    case 'basse': return 'Basse'
    default: return '—'
  }
}

function statutLabel(s?: string): string {
  switch (s) {
    case 'planifiee': return 'Planifiée'
    case 'en_cours': return 'En cours'
    case 'realisee': return 'Réalisée'
    case 'annulee': return 'Annulée'
    case 'en_retard': return 'En retard'
    default: return '—'
  }
}

function declencheurLabel(d?: string): string {
  switch (d) {
    case 'automatique': return 'Automatique'
    case 'manuel': return 'Manuel'
    case 'renouvellement': return 'Renouvellement certification'
    case 'evenement': return 'Suite événement'
    case 'demande_dg': return 'Demande DG'
    default: return '—'
  }
}

export function buildFicheBriefingFilename(aerodromeCode?: string): string {
  const base = aerodromeCode?.trim().replace(/\s+/g, '_') || 'aerodrome'
  const today = new Date().toISOString().slice(0, 10)
  return `fiche_briefing_${base}_${today}.pdf`
}

async function buildBriefingPDF(data: FicheBriefingPDFInput): Promise<{ blob: Blob }> {
  const { default: jsPDF } = await import('jspdf')
  const { applyPlugin } = await import('jspdf-autotable')
  applyPlugin(jsPDF as any)

  const doc = new jsPDF('p', 'mm', 'a4')
  let page = 1
  let y = MARGIN

  const ensure = (needed: number) => {
    if (y + needed > FOOTER_Y - 5) {
      doc.addPage()
      page++
      y = MARGIN
    }
  }

  const wrapped = (text: string, size: number, maxWidth = CONTENT_W): string[] =>
    doc.splitTextToSize(text, maxWidth).map(String)

  const paragraph = (text: string, size: number, opts: { color?: [number, number, number]; bold?: boolean; indent?: number; maxWidth?: number } = {}) => {
    const lines = wrapped(text, size, opts.maxWidth ?? CONTENT_W - (opts.indent || 0))
    const lineH = size * 0.45
    for (const line of lines) {
      ensure(lineH)
      doc.setFont('times', opts.bold ? 'bold' : 'normal')
      doc.setFontSize(size)
      doc.setTextColor(...(opts.color || [0x1a, 0x1a, 0x1a]))
      doc.text(line, MARGIN + (opts.indent || 0), y)
      y += lineH
    }
    y += 1.5
  }

  const bulletList = (items: string[], size: number) => {
    const lineH = size * 0.45
    for (const item of items) {
      const lines = wrapped(`•  ${item}`, size, CONTENT_W - 6)
      for (const line of lines) {
        ensure(lineH)
        doc.setFont('times', 'normal')
        doc.setFontSize(size)
        doc.setTextColor(0x1a, 0x1a, 0x1a)
        doc.text(line, MARGIN + 4, y)
        y += lineH
      }
      y += 0.8
    }
    y += 1.5
  }

  const sectionTitle = (text: string) => {
    ensure(12)
    doc.setFont('times', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...PRIMARY)
    doc.text(text, MARGIN, y)
    y += 2
    doc.setDrawColor(...PRIMARY)
    doc.setLineWidth(0.4)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 6
  }

  const drawFooter = (count: number) => {
    for (let i = 1; i <= count; i++) {
      doc.setPage(i)
      doc.setFont('times', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(...GRAY)
      doc.text(`ANACIM — Fiche de briefing pré-mission — Généré le ${new Date().toLocaleDateString('fr-FR')}`, MARGIN, FOOTER_Y)
      doc.text(`Page ${i}/${count}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' })
    }
  }

  const { fiche, planning, aerodrome } = data
  const codeAero = aerodrome?.code_oaci || fiche.aerodrome || 'AÉRODROME'

  // ── Page de garde ──────────────────────────────────────────
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...GRAY)
  const enteteLines = [
    'RÉPUBLIQUE DU SÉNÉGAL',
    "AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA MÉTÉOROLOGIE",
  ]
  enteteLines.forEach((l, i) => doc.text(l, PAGE_W / 2, 70 + i * 7, { align: 'center' }))

  doc.setFont('times', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...PRIMARY)
  doc.text('FICHE DE BRIEFING PRÉ-MISSION', PAGE_W / 2, 105, { align: 'center' })

  doc.setFont('times', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...GRAY)
  doc.text(`Surveillance — ${codeAero}`, PAGE_W / 2, 114, { align: 'center' })

  doc.setDrawColor(0xcb, 0xd5, 0xe1)
  doc.setLineWidth(0.6)
  doc.line(PAGE_W / 2 - 40, 122, PAGE_W / 2 + 40, 122)

  doc.setFontSize(10)
  doc.setTextColor(0x47, 0x55, 0x69)
  const dateGenere = fiche.genere_le ? new Date(fiche.genere_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(`Émis le ${dateGenere}`, PAGE_W / 2, 138, { align: 'center' })
  if (data.redacteur) {
    doc.text(`Rédacteur : ${data.redacteur}`, PAGE_W / 2, 145, { align: 'center' })
  }

  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('Document confidentiel — diffusion restreinte', PAGE_W / 2, 268, { align: 'center' })

  doc.addPage()
  page = 2
  y = MARGIN

  // ── 1. Récapitulatif de la mission ─────────────────────────
  sectionTitle('1. RÉCAPITULATIF DE LA MISSION')
  paragraph(`Fiche de briefing établie pour la mission de surveillance ${fiche.type_mission || 'non précisé'} de l'aérodrome ${codeAero}, couvrant la période du ${fiche.periode || '—'}. Elle consolide le profil de risque, l'historique des surveillances, les écarts actifs et les PAC en cours de l'aérodrome.`, 10.5)

  // KPI boxes
  const kpis = [
    { value: fiche.reference || '—', label: 'Référence', color: PRIMARY },
    { value: `${fiche.confiance || 0}%`, label: 'Confiance IA', color: confianceColor(fiche.confiance ?? 0) },
    { value: String(fiche.objectifs?.length || 0), label: 'Objectifs', color: BLUE },
    { value: String(fiche.portee?.length || 0), label: 'Domaines', color: AMBER },
  ]
  const gap = 4
  const boxW = (CONTENT_W - gap * 3) / 4
  const boxH = 22
  ensure(boxH + 4)
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (boxW + gap)
    doc.setDrawColor(0xe2, 0xe8, 0xf0)
    doc.setLineWidth(0.4)
    doc.roundedRect(x, y, boxW, boxH, 2, 2)
    doc.setFont('times', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...kpi.color)
    doc.text(kpi.value, x + boxW / 2, y + 12, { align: 'center' })
    doc.setFont('times', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text(doc.splitTextToSize(kpi.label, boxW - 4).map(String), x + boxW / 2, y + 17.5, { align: 'center' })
  })
  y += boxH + 8

  // ── 2. Synthèse AERORISQ ───────────────────────────────────
  if (fiche.synthese?.trim()) {
    sectionTitle('2. SYNTHÈSE AERORISQ')
    paragraph(fiche.synthese, 10)
  }

  // ── 3. Profil de risque (C1-C5) ────────────────────────────
  if (fiche.contexte_profil) {
    sectionTitle('3. PROFIL DE RISQUE')
    const cp = fiche.contexte_profil
    const profilRows = [
      ['Score global', `${cp.score_global}/100`],
      ['Niveau de risque', cp.niveau || '—'],
      ['Tendance', cp.tendance || '—'],
      ['C1 — Maturité SGS', `${cp.c1}/100`],
      ['C2 — Efficacité PAC', `${cp.c2}/100`],
      ['C3 — Conformité', `${cp.c3}/100`],
      ['C4 — Charge critique', `${cp.c4}/100`],
      ['C5 — Résilience', `${cp.c5}/100`],
    ]
    ;(doc as any).autoTable({
      startY: y,
      head: [['Critère', 'Valeur']],
      body: profilRows,
      theme: 'grid',
      tableWidth: 166,
      styles: { font: 'times', fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 74 } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── 4. Identité de la mission ──────────────────────────────
  sectionTitle('4. IDENTITÉ DE LA MISSION')
  const identiteRows = [
    ['Type de mission', fiche.type_mission || '—'],
    ['Aérodrome', `${aerodrome?.code_oaci || ''} ${aerodrome?.nom || fiche.aerodrome || ''}`.trim() || '—'],
    ['Période', fiche.periode || '—'],
    ['Année cible', planning?.annee_cible ? String(planning.annee_cible) : '—'],
    ['Priorité', prioriteLabel(planning?.priorite)],
    ['Statut', statutLabel(planning?.statut)],
    ['Déclencheur', declencheurLabel(planning?.declencheur)],
    ['Référence planning', fiche.reference || '—'],
  ]
  ;(doc as any).autoTable({
    startY: y,
    head: [['Champ', 'Valeur']],
    body: identiteRows,
    theme: 'grid',
    tableWidth: 166,
    styles: { font: 'times', fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 8.5 },
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 104 } },
    margin: { left: MARGIN, right: MARGIN },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // ── 5. Objectifs de la mission ─────────────────────────────
  sectionTitle('5. OBJECTIFS DE LA MISSION')
  if (fiche.objectifs?.length) {
    bulletList(fiche.objectifs, 10)
  } else {
    paragraph('Aucun objectif précisé pour cette mission.', 9.5)
  }

  // ── 6. Portée de la surveillance ───────────────────────────
  sectionTitle('6. PORTÉE DE LA SURVEILLANCE')
  if (fiche.portee?.length) {
    paragraph(fiche.portee.join(' — '), 10)
  } else {
    paragraph('Aucun domaine de la portée précisé.', 9.5)
  }

  // ── 7. Équipe de surveillance ──────────────────────────────
  sectionTitle('7. ÉQUIPE DE SURVEILLANCE')
  if (fiche.equipe?.length) {
    const equipeRows = fiche.equipe.map((n, idx) => [idx === 0 ? 'Chef d\'équipe' : `Inspecteur ${idx}`, n])
    ;(doc as any).autoTable({
      startY: y,
      head: [['Rôle', 'Nom']],
      body: equipeRows,
      theme: 'grid',
      tableWidth: 166,
      styles: { font: 'times', fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 8.5 },
      columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 112 } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  } else {
    paragraph('Équipe non renseignée.', 9.5)
  }

  // ── 8. Points d'attention ──────────────────────────────────
  if (fiche.points_attention?.length) {
    sectionTitle('8. POINTS D\'ATTENTION')
    bulletList(fiche.points_attention, 9.5)
  }

  // ── 9. Preuves à vérifier ──────────────────────────────────
  if (fiche.preuves_a_verifier?.length) {
    sectionTitle('9. PREUVES À VÉRIFIER')
    bulletList(fiche.preuves_a_verifier, 9.5)
  }

  // ── 10. Recommandations ────────────────────────────────────
  if (fiche.recommandations?.length) {
    sectionTitle('10. RECOMMANDATIONS')
    const recLines = wrapped(fiche.recommandations.join(' '), 10, CONTENT_W - 12)
    const recH = recLines.length * 4.5 + 10
    ensure(recH)
    doc.setFillColor(...LIGHT_GREEN_BG)
    doc.roundedRect(MARGIN, y, CONTENT_W, recH, 2, 2, 'F')
    doc.setFillColor(...GREEN_BORDER)
    doc.rect(MARGIN, y, 2.5, recH, 'F')
    doc.setFont('times', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0x1a, 0x1a, 0x1a)
    doc.text(recLines, MARGIN + 6, y + 6.5)
    y += recH + 8
  }

  // ── 11. Historique des surveillances passées ───────────────
  if (fiche.contexte_historique?.length) {
    sectionTitle('11. HISTORIQUE DES SURVEILLANCES PASSÉES')
    const histRows = fiche.contexte_historique.map(s => [
      s.type?.replace(/_/g, ' ') || '—',
      s.date ? new Date(s.date).toLocaleDateString('fr-FR') : '—',
      statutLabel(s.statut),
      s.score_global != null ? `${s.score_global}/100` : '—',
    ])
    ;(doc as any).autoTable({
      startY: y,
      head: [['Type', 'Date', 'Statut', 'Score']],
      body: histRows,
      theme: 'grid',
      tableWidth: 166,
      styles: { font: 'times', fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BLUE, textColor: 255, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 72 }, 1: { cellWidth: 32 }, 2: { cellWidth: 34 }, 3: { cellWidth: 28 } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── 12. Écarts actifs et PAC ───────────────────────────────
  if (fiche.contexte_ecarts?.length) {
    sectionTitle('12. ÉCARTS ACTIFS ET PAC')
    const ecartRows = fiche.contexte_ecarts.map(e => [
      e.reference || '—',
      e.libelle || '—',
      e.niveau_risque || '—',
      e.statut?.replace(/_/g, ' ') || '—',
      e.pac ? 'Oui' : 'Non',
    ])
    ;(doc as any).autoTable({
      startY: y,
      head: [['Référence', 'Libellé', 'Niveau', 'Statut', 'PAC']],
      body: ecartRows,
      theme: 'grid',
      tableWidth: 166,
      styles: { font: 'times', fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: RED, textColor: 255, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 66 }, 2: { cellWidth: 22 }, 3: { cellWidth: 30 }, 4: { cellWidth: 18 } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── 13. Événements de sécurité récents ─────────────────────
  if (fiche.contexte_evenements?.length) {
    sectionTitle('13. ÉVÉNEMENTS DE SÉCURITÉ RÉCENTS')
    const evtRows = fiche.contexte_evenements.map(ev => [
      ev.date ? new Date(ev.date).toLocaleDateString('fr-FR') : '—',
      ev.type?.replace(/_/g, ' ') || '—',
      ev.gravite || '—',
      ev.description || '',
    ])
    ;(doc as any).autoTable({
      startY: y,
      head: [['Date', 'Type', 'Gravité', 'Description']],
      body: evtRows,
      theme: 'grid',
      tableWidth: 166,
      styles: { font: 'times', fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: AMBER, textColor: 255, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 34 }, 2: { cellWidth: 22 }, 3: { cellWidth: 86 } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── 14. Conclusion ─────────────────────────────────────────
  sectionTitle('14. CONCLUSION')
  paragraph(
    fiche.synthese?.trim() || 'La présente fiche de briefing est établie pour préparer la mission de surveillance avant toute exécution sur site. Elle repose sur les données consolidées du système SGDA et les analyses produites par AERORISQ.',
    10,
  )

  doc.setFont('times', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  ensure(12)
  doc.text("ANACIM — Direction de la Sécurité et de la Sûreté", MARGIN, y)
  y += 4.5
  doc.text("Aéroport International Blaise Diagne — BP 8184 Aéroport de Dakar", MARGIN, y)
  y += 4.5
  doc.text("Ce document est confidentiel. Toute diffusion hors du circuit autorisé est interdite.", MARGIN, y)

  drawFooter(page)
  return { blob: doc.output('blob') }
}

/** Génère la fiche de briefing PDF (Blob). */
export async function genererFicheBriefingBlob(
  data: FicheBriefingPDFInput,
): Promise<Blob> {
  const { blob } = await buildBriefingPDF(data)
  return blob
}

/** Télécharge la fiche de briefing en PDF. */
export async function exporterFicheBriefing(
  data: FicheBriefingPDFInput,
): Promise<void> {
  const blob = await genererFicheBriefingBlob(data)
  downloadBlob(blob, buildFicheBriefingFilename(data.aerodrome?.code_oaci))
}