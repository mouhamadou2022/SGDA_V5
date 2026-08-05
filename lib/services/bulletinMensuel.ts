// lib/services/bulletinMensuel.ts
// Bulletin mensuel de sécurité PDF — ton administratif cohérent avec lettres de mise en demeure.
// Génération NATIVE jsPDF + jspdf-autotable : texte réel, pagination automatique,
// aucune coupure de contenu, fichier léger (contrairement à html2canvas qui rastérisait
// l'élément et produisait un PDF tronqué à 1 page).
// Génération réutilisable (Blob) pour le téléchargement ou l'envoi par email (pièce jointe).

'use client'

import { downloadBlob } from '@/lib/pdfGenerator'
import type { BulletinAerodromeInput as BulletinAerodrome, BulletinAerodromeAnalyse } from '@/lib/ia/bulletinIA'

interface BulletinData {
  mois: number
  annee: number
  aerodromes: BulletinAerodrome[]
  stats: {
    totalAerodromes: number
    scoreMoyen: number
    ecartsCritiquesTotal: number
    risqueCritique: number
    risqueEleve: number
  }
  recommandationDuMois: string
  redacteur?: string
  /** Analyses IA par aérodrome (code -> analyse). */
  analyses?: Record<string, BulletinAerodromeAnalyse>
}

const MOIS_LABELS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function moisLabel(m: number): string {
  return MOIS_LABELS_FR[m - 1] || ''
}

function batirRecommandationDuMois(aerodromes: BulletinAerodrome[]): string {
  if (aerodromes.length === 0) {
    return 'Aucun aérodrome sous surveillance n\'est enregistré dans le système pour la période considérée.'
  }
  const pire = [...aerodromes].sort((a, b) => a.scoreGlobal - b.scoreGlobal)[0]
  const dims: { key: keyof BulletinAerodrome; label: string }[] = [
    { key: 'c1', label: 'la maturité SGS' },
    { key: 'c2', label: 'l\'efficacité des PAC' },
    { key: 'c3', label: 'la conformité' },
    { key: 'c4', label: 'la charge critique' },
    { key: 'c5', label: 'la résilience' },
  ]
  const dim = dims.reduce((acc, cur) => (pire[cur.key] as number) < (pire[acc.key] as number) ? cur : acc, dims[0])
  const nbCritiquesTotal = aerodromes.reduce((s, a) => s + a.ecartsCritiques, 0)
  const retards = aerodromes.reduce((s, a) => s + a.pacEnRetard, 0)

  const parts: string[] = []
  if (nbCritiquesTotal > 0) parts.push(`la résorption des ${nbCritiquesTotal} écart(s) critique(s) en cours`)
  if (retards > 0) parts.push(`la relance des ${retards} PAC en retard`)
  if (parts.length > 0) {
    return `La priorité du mois est ${parts.join(' et ')}. `
      + `${pire.nom} (${pire.code}) présente le score le plus dégradé (${pire.scoreGlobal}/100), `
      + `avec ${dim.label} comme dimension la plus faible (${pire[dim.key] as number}/100) : une inspection ciblée est recommandée. `
      + 'Une attention particulière sera portée aux aérodromes en tendance baissière et à ceux dont le C2 est inférieur à 40.'
  }
  return 'La priorité du mois est la réduction des écarts critiques et le renforcement de l\'efficacité des PAC. Une attention particulière sera portée aux aérodromes en tendance baissière et à ceux présentant un C2 inférieur à 40.'
}

// ─────────────────────────────────────────────────────────────
// Données (lecture du store)
// ─────────────────────────────────────────────────────────────

async function batirDonnees(mois: number, annee: number, redacteur?: string): Promise<BulletinData> {
  const { useAppStore } = await import('@/lib/store')
  const state = useAppStore.getState()
  const aerodromes = state.aerodromes || []
  const profils = state.profilsRisque || {}
  const now = Date.now()

  const aerodromeData: BulletinAerodrome[] = aerodromes.map(aero => {
    const p = profils[aero.id]
    const ecartsAero = (state.ecarts || []).filter(e => e.aerodrome_id === aero.id)
    const evenementsAero = (state.evenements || []).filter(e => (e as any).aerodrome_id === aero.id)
    const evts90j = evenementsAero.filter(e => {
      const d = new Date(e.date)
      return !isNaN(d.getTime()) && (now - d.getTime()) < 90 * 86400000
    })
    const scenarioPire = p?.scenarios && p.scenarios.length > 0
      ? p.scenarios.reduce((max, s) => (s.probabilite > max.probabilite ? s : max))
      : undefined
    return {
      nom: aero.nom || '',
      code: aero.code_oaci || aero.id,
      scoreGlobal: p?.score_global ?? 50,
      tendance: p?.tendance ?? 'stable',
      niveauRisque: p?.niveau ?? 'moyen',
      ecartsCritiques: ecartsAero.filter(e => e.niveau_risque === 'critique' && e.statut !== 'cloture').length,
      c1: p?.c1 ?? 50,
      c2: p?.c2 ?? 50,
      c3: p?.c3 ?? 50,
      c4: p?.c4 ?? 50,
      c5: p?.c5 ?? 50,
      prediction3m: p?.prediction_3m,
      ecartsOuverts: ecartsAero.filter(e => e.statut !== 'cloture').length,
      pacEnRetard: ecartsAero.filter(e => e.statut === 'en_retard').length,
      evenements90j: evts90j.length,
      evenementsGraves90j: evts90j.filter(e => e.gravite === 'critique' || e.gravite === 'eleve').length,
      qualityScore: p?.qualityScore,
      qualite: p?.qualite,
      signaux: p
        ? {
            hmmTransition: p.hmm_state?.isTransitioning,
            hmmJoursAvantCritique: p.hmm_state?.daysToCritical,
            tailRisk: p.extreme_risk?.tailRisk,
            queueLourde: p.extreme_risk?.isHeavyTailed,
            hazard90j: p.survival_metrics?.hazard90d,
            blackSwan: p.bayesian_black_swan,
            bowtieDomainesDegrades: (p.bowtie_metrics ?? [])
              .filter(b => b.niveauRisqueResiduel === 'critique' || b.niveauRisqueResiduel === 'eleve')
              .map(b => b.domaine),
            scenarioPireNom: scenarioPire?.nom,
            scenarioPireScore: scenarioPire?.scoreProjecte,
            scenarioPireProba: scenarioPire?.probabilite,
            incidentPrediction3m: p.incident_prediction_3m,
          }
        : undefined,
    }
  })

  const stats = {
    totalAerodromes: aerodromeData.length,
    scoreMoyen: aerodromeData.length > 0
      ? Math.round(aerodromeData.reduce((s, a) => s + a.scoreGlobal, 0) / aerodromeData.length)
      : 0,
    ecartsCritiquesTotal: aerodromeData.reduce((s, a) => s + a.ecartsCritiques, 0),
    risqueCritique: aerodromeData.filter(a => a.niveauRisque === 'critique').length,
    risqueEleve: aerodromeData.filter(a => a.niveauRisque === 'eleve').length,
  }

  return {
    mois, annee,
    aerodromes: aerodromeData,
    stats,
    recommandationDuMois: batirRecommandationDuMois(aerodromeData),
    redacteur,
  }
}

function buildFilename(mois: number, annee: number): string {
  return `bulletin_securite_${moisLabel(mois)}_${annee}.pdf`
}

// ─────────────────────────────────────────────────────────────
// Rendu PDF natif (jsPDF + jspdf-autotable)
// ─────────────────────────────────────────────────────────────

const PRIMARY: [number, number, number] = [0x1e, 0x40, 0x73]
const GREEN: [number, number, number] = [0x16, 0xa3, 0x4a]
const RED: [number, number, number] = [0xdc, 0x26, 0x26]
const AMBER: [number, number, number] = [0xd9, 0x77, 0x06]
const BLUE: [number, number, number] = [0x25, 0x63, 0xeb]
const GRAY: [number, number, number] = [0x64, 0x74, 0x8b]
const LIGHT_GREEN_BG: [number, number, number] = [0xf0, 0xfd, 0xf4]
const GREEN_BORDER: [number, number, number] = [0x22, 0xc5, 0x5e]

function scoreColor(score: number): [number, number, number] {
  return score >= 60 ? GREEN : score >= 40 ? AMBER : RED
}

function riskColor(niveau: string): [number, number, number] {
  if (niveau === 'critique') return RED
  if (niveau === 'eleve') return AMBER
  if (niveau === 'moyen') return BLUE
  return GREEN
}

function tendanceLabel(tendance: string): string {
  if (tendance === 'baisse') return 'En baisse'
  if (tendance === 'hausse') return 'En hausse'
  return 'Stable'
}

function niveauLabel(n: string): string {
  switch (n) {
    case 'critique': return 'Critique'
    case 'eleve': return 'Élevé'
    case 'moyen': return 'Moyen'
    default: return 'Faible'
  }
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18
const CONTENT_W = PAGE_W - MARGIN * 2
const FOOTER_Y = 287

async function buildBulletinPDF(data: BulletinData): Promise<{ blob: Blob }> {
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
      doc.text(`ANACIM — Bulletin mensuel de sécurité — Généré le ${new Date().toLocaleDateString('fr-FR')}`, MARGIN, FOOTER_Y)
      doc.text(`Page ${i}/${count}`, PAGE_W - MARGIN, FOOTER_Y, { align: 'right' })
    }
  }

  const dateStr = `${moisLabel(data.mois).charAt(0).toUpperCase() + moisLabel(data.mois).slice(1)} ${data.annee}`
  const { aerodromes, stats } = data
  const sorted = [...aerodromes].sort((a, b) => a.scoreGlobal - b.scoreGlobal)

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
  doc.text('BULLETIN MENSUEL DE SÉCURITÉ', PAGE_W / 2, 105, { align: 'center' })

  doc.setFont('times', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...GRAY)
  doc.text(`Surveillance des aérodromes — ${dateStr}`, PAGE_W / 2, 114, { align: 'center' })

  doc.setDrawColor(0xcb, 0xd5, 0xe1)
  doc.setLineWidth(0.6)
  doc.line(PAGE_W / 2 - 40, 122, PAGE_W / 2 + 40, 122)

  doc.setFontSize(10)
  doc.setTextColor(0x47, 0x55, 0x69)
  doc.text(`Publié le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`, PAGE_W / 2, 138, { align: 'center' })
  if (data.redacteur) {
    doc.text(`Rédacteur : ${data.redacteur}`, PAGE_W / 2, 145, { align: 'center' })
  }

  doc.setFontSize(9)
  doc.setTextColor(...GRAY)
  doc.text('Document confidentiel — diffusion restreinte', PAGE_W / 2, 268, { align: 'center' })

  doc.addPage()
  page = 2
  y = MARGIN

  // ── 1. Résumé exécutif ─────────────────────────────────────
  sectionTitle('1. RÉSUMÉ EXÉCUTIF')
  const scoreColorGlobal = scoreColor(stats.scoreMoyen)
  paragraph(
    `Le présent bulletin rend compte de l'état de sécurité des ${stats.totalAerodromes} aérodromes sous surveillance au titre du mois de ${moisLabel(data.mois)} ${data.annee}. Le score de risque moyen pondéré s'établit à ${stats.scoreMoyen}/100.`,
    10.5,
  )

  // KPI boxes
  const kpis = [
    { value: String(stats.scoreMoyen), label: 'Score moyen', color: scoreColorGlobal },
    { value: String(stats.ecartsCritiquesTotal), label: 'Écarts critiques', color: RED },
    { value: String(stats.risqueCritique), label: 'Aérodromes risque critique', color: RED },
    { value: String(stats.risqueEleve), label: 'Aérodromes risque élevé', color: AMBER },
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
    doc.setFontSize(17)
    doc.setTextColor(...kpi.color)
    doc.text(kpi.value, x + boxW / 2, y + 12, { align: 'center' })
    doc.setFont('times', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text(doc.splitTextToSize(kpi.label, boxW - 4).map(String), x + boxW / 2, y + 17.5, { align: 'center' })
  })
  y += boxH + 8

  // ── 2. Synthèse par aérodrome ──────────────────────────────
  sectionTitle('2. SYNTHÈSE PAR AÉRODROME')
  paragraph('Situation détaillée par plateforme, classée du plus dégradé au plus favorable :', 9.5)

  const synthRows = sorted.map(a => [
    `${a.nom} (${a.code})`,
    String(a.scoreGlobal),
    tendanceLabel(a.tendance),
    String(a.ecartsCritiques),
    String(a.c2),
  ])
  ;(doc as any).autoTable({
    startY: y,
    head: [['Aérodrome', 'Score', 'Tendance', 'Écarts critiques', 'C2 (PAC)']],
    body: synthRows,
    theme: 'grid',
    tableWidth: 166,
    styles: { font: 'times', fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 8.5, halign: 'center' },
    columnStyles: {
      0: { cellWidth: 66 },
      1: { cellWidth: 27, halign: 'center' },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 23, halign: 'center' },
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (d: any) => {
      if (d.section === 'body' && d.column.index === 1) {
        const val = Number(d.cell.raw)
        d.cell.styles.textColor = scoreColor(val)
        d.cell.styles.fontStyle = 'bold'
      }
      if (d.section === 'body' && d.column.index === 3 && Number(d.cell.raw) > 0) {
        d.cell.styles.textColor = RED
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // ── 3. Détail des dimensions par aérodrome ─────────────────
  sectionTitle('3. DÉTAIL DES DIMENSIONS PAR AÉRODROME')
  paragraph(
    'Ventilation des cinq dimensions du score de risque (C1 maturité SGS, C2 efficacité PAC, C3 conformité, C4 charge critique, C5 résilience), prédiction à 3 mois et indicateurs de suivi par plateforme :',
    9.5,
  )

  const fmt = (v: number | undefined): string => (v === undefined || v === null) ? '—' : String(v)
  const detailHead = ['Aérodrome', 'C1', 'C2', 'C3', 'C4', 'C5', 'Préd. 3m', 'Écarts ouverts', 'PAC retard', 'Évts/90j', 'Qualité']
  const detailBody = sorted.map(a => [
    `${a.nom} (${a.code})`,
    fmt(a.c1), fmt(a.c2), fmt(a.c3), fmt(a.c4), fmt(a.c5),
    fmt(a.prediction3m),
    String(a.ecartsOuverts),
    String(a.pacEnRetard),
    String(a.evenements90j),
    fmt(a.qualityScore),
  ])
  const dimCol = (w: number, halign = 'center') => ({ cellWidth: w, halign })
  ;(doc as any).autoTable({
    startY: y,
    head: [detailHead],
    body: detailBody,
    theme: 'grid',
    tableWidth: 159,
    styles: { font: 'times', fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontSize: 6.8, halign: 'center' },
    columnStyles: {
      0: dimCol(44, 'left'),
      1: dimCol(11), 2: dimCol(11), 3: dimCol(11), 4: dimCol(11), 5: dimCol(11),
      6: dimCol(12), 7: dimCol(12), 8: dimCol(12), 9: dimCol(12), 10: dimCol(12),
    },
    margin: { left: MARGIN, right: MARGIN },
    didParseCell: (d: any) => {
      if (d.section !== 'body') return
      const idx = d.column.index
      const val = Number(d.cell.raw)
      if (idx >= 1 && idx <= 6 && d.cell.raw !== '—' && !isNaN(val)) {
        d.cell.styles.textColor = scoreColor(val)
        d.cell.styles.fontStyle = 'bold'
      }
      if (idx === 8 && val > 0) { d.cell.styles.textColor = AMBER; d.cell.styles.fontStyle = 'bold' }
      if (idx === 9 && val > 0) { d.cell.styles.textColor = RED; d.cell.styles.fontStyle = 'bold' }
      if (idx === 10 && d.cell.raw !== '—' && !isNaN(val)) {
        d.cell.styles.textColor = val < 40 ? RED : val < 60 ? AMBER : GREEN
        d.cell.styles.fontStyle = 'bold'
      }
    },
  })
  y = (doc as any).lastAutoTable.finalY + 8

  // ── 4. Analyse IA par aérodrome ────────────────────────────
  sectionTitle('4. ANALYSE IA PAR AÉRODROME')
  paragraph(
    "Analyse technique par plateforme, rédigée par l'assistant IA d'AERORISQ à partir des données réellement persistées (score, dimensions C1-C5, écarts, PAC, événements, modèles avancés). Aucun chiffre n'est inventé : si une information manque, la limite est signalée. En cas d'indisponibilité de l'IA, une analyse déterministe fondée sur les mêmes données est produite.",
    9.5,
  )

  const analyses = data.analyses || {}
  const aerodromesAnalyses = sorted.filter(a => analyses[a.code])
  if (aerodromesAnalyses.length === 0) {
    paragraph('Aucune analyse disponible pour la période considérée.', 9.5)
  } else {
    const rubriques: Array<[string, 'synthese' | 'forces' | 'faiblesses' | 'signaux' | 'recommandation' | 'fiabilite']> = [
      ['Synthèse', 'synthese'],
      ['Forces', 'forces'],
      ['Faiblesses', 'faiblesses'],
      ['Signaux des modèles avancés', 'signaux'],
      ['Recommandation', 'recommandation'],
      ['Fiabilité des données', 'fiabilite'],
    ]
    for (const a of aerodromesAnalyses) {
      const ana = analyses[a.code]
      const header = `${a.nom} (${a.code}) — Score ${a.scoreGlobal}/100 · ${niveauLabel(a.niveauRisque)} · ${tendanceLabel(a.tendance)}`
      ensure(10)
      doc.setFont('times', 'bold')
      doc.setFontSize(10.5)
      doc.setTextColor(...PRIMARY)
      const headerLines = wrapped(header, 10.5, CONTENT_W - 6)
      for (const hl of headerLines) {
        doc.text(hl, MARGIN + 2, y)
        y += 4.8
      }
      doc.setFont('times', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(...GRAY)
      doc.text(
        ana.fallbackIA
          ? 'Analyse déterministe produite par le système (assistance IA indisponible)'
          : 'Analyse enrichie par l\'assistant IA',
        MARGIN + 2,
        y,
      )
      y += 4.5

      for (const [label, field] of rubriques) {
        const text = ana[field]
        const textLines = wrapped(text, 9, CONTENT_W - 12)
        const blockH = (1 + textLines.length) * 4 + 2
        ensure(blockH)
        doc.setFont('times', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...GRAY)
        doc.text(`${label} :`, MARGIN + 4, y)
        y += 4
        doc.setFont('times', 'normal')
        doc.setFontSize(9.5)
        doc.setTextColor(0x1a, 0x1a, 0x1a)
        for (const line of textLines) {
          doc.text(line, MARGIN + 10, y)
          y += 4
        }
        y += 1.5
      }
      y += 3
      ensure(6)
      doc.setDrawColor(0xd1, 0xd9, 0xe6)
      doc.setLineWidth(0.3)
      doc.line(MARGIN + 4, y, PAGE_W - MARGIN - 4, y)
      y += 6
    }
  }

  // ── 5. Faits marquants ─────────────────────────────────────
  sectionTitle('5. FAITS MARQUANTS')
  paragraph('Analyse des principaux signaux détectés par le système AERORISQ au cours de la période :', 9.5)
  const faits: string[] = []
  for (const a of sorted) {
    if (a.niveauRisque === 'critique') {
      const tend = a.tendance === 'baisse' ? 'baissière appelle une vigilance renforcée' : a.tendance === 'hausse' ? 'haussière est encourageante' : 'est stable'
      faits.push(`${a.nom} (${a.code}) : score ${a.scoreGlobal}/100, ${a.ecartsCritiques} écart(s) critique(s). La tendance ${tend}.`)
    }
  }
  for (const a of sorted.filter(x => x.niveauRisque === 'eleve').slice(0, 3)) {
    faits.push(`${a.nom} (${a.code}) : score ${a.scoreGlobal}/100, C2=${a.c2} — efficacité PAC à surveiller.`)
  }
  for (const a of sorted.filter(x => x.pacEnRetard > 0).slice(0, 3)) {
    faits.push(`${a.nom} (${a.code}) : ${a.pacEnRetard} PAC en retard à relancer.`)
  }
  for (const a of sorted.filter(x => x.evenements90j > 0).slice(0, 3)) {
    faits.push(`${a.nom} (${a.code}) : ${a.evenements90j} événement(s) de sécurité sur les 90 derniers jours.`)
  }
  if (faits.length === 0) {
    faits.push('Aucun signal majeur détecté sur la période : les indicateurs sont globalement stables.')
  }
  bulletList(faits, 9.5)

  // ── 6. Recommandation du mois ──────────────────────────────
  sectionTitle('6. RECOMMANDATION DU MOIS')
  const recLines = wrapped(data.recommandationDuMois, 10, CONTENT_W - 12)
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

  // ── 7. Conclusion ──────────────────────────────────────────
  sectionTitle('7. CONCLUSION')
  paragraph(
    "Le présent bulletin est établi sur la base des données consolidées du système de surveillance et des analyses produites par AERORISQ. Les actions correctives assignées dans le cadre des plans d'action correctives (PAC) feront l'objet d'un suivi dans le prochain bulletin.",
    10.5,
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

// ─────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────

/** Génère le bulletin PDF (mois/année donnés) et retourne le Blob. */
export async function genererBulletinMensuelBlob(
  mois: number,
  annee: number,
  redacteur?: string,
): Promise<Blob> {
  const data = await batirDonnees(mois, annee, redacteur)
  try {
    const { analyserAerodromesPourBulletin } = await import('@/lib/ia/bulletinIA')
    data.analyses = await analyserAerodromesPourBulletin(data.aerodromes)
  } catch (err) {
    console.error('[bulletinMensuel] Analyse IA indisponible :', err)
  }
  const { blob } = await buildBulletinPDF(data)
  return blob
}

/** Télécharge le bulletin mensuel en PDF. */
export async function exporterBulletinMensuel(
  mois: number,
  annee: number,
  redacteur?: string,
): Promise<void> {
  const blob = await genererBulletinMensuelBlob(mois, annee, redacteur)
  downloadBlob(blob, buildFilename(mois, annee))
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string | null
      if (!result) return reject(new Error('Lecture du PDF impossible'))
      resolve(result.split(',')[1] || '')
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export interface BulletinEmailOptions {
  mois: number
  annee: number
  destinataires: string[]
  redacteur?: string
}

/** Envoie le bulletin mensuel (PDF en pièce jointe) aux destinataires indiqués. */
export async function envoyerBulletinMensuelParEmail(
  options: BulletinEmailOptions,
): Promise<{ envoye: number; total: number }> {
  const { mois, annee, destinataires, redacteur } = options
  const adresses = [...new Set(destinataires.filter(e => e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))]
  if (adresses.length === 0) {
    throw new Error('Aucun destinataire valide sélectionné')
  }

  const blob = await genererBulletinMensuelBlob(mois, annee, redacteur)
  const content = await blobToBase64(blob)

  const res = await fetch('/api/notifications/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: adresses,
      subject: `[SGDA] Bulletin mensuel de sécurité — ${moisLabel(mois).charAt(0).toUpperCase() + moisLabel(mois).slice(1)} ${annee}`,
      message: `Veuillez trouver en pièce jointe le bulletin mensuel de sécurité des aérodromes pour ${moisLabel(mois)} ${annee}. Ce document est confidentiel — diffusion restreinte.`,
      attachments: [
        {
          filename: buildFilename(mois, annee),
          content,
        },
      ],
    }),
  })

  const body = await res.json().catch(() => ({ success: false, reason: 'Réponse serveur invalide' }))
  if (!res.ok || body.error || body.success === false) {
    const erreurBrute = body.reason || body.error
    let message: string
    if (typeof erreurBrute === 'string') {
      message = erreurBrute
    } else if (erreurBrute && typeof erreurBrute.message === 'string') {
      message = erreurBrute.message
    } else {
      try {
        message = JSON.stringify(erreurBrute) || `Échec de l'envoi (${res.status})`
      } catch {
        message = `Échec de l'envoi (${res.status})`
      }
    }
    throw new Error(message)
  }
  return { envoye: body.data?.ids?.length ?? adresses.length, total: adresses.length }
}
