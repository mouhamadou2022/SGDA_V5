// lib/services/rapportConversation.ts
// Export d'une conversation du copilote IA — PDF (pdfRapport.shared) et Word (docx).
// Les deux formats réutilisent le gabarit institutionnel ANACIM (style du module
// Profil de Risque) : page de garde, Times New Roman, sections soulignées, méta,
// en-tête / pied de page paginé. Les réponses IA sont découpées par paragraphes.

'use client'

import { downloadBlob } from '@/lib/pdfGenerator'
import type { MessageCopilote } from '@/lib/ia/agents/copiloteAgent'

export interface RapportConversationInput {
  titre: string
  aerodromeNom?: string
  redacteur?: string
  messages: MessageCopilote[]
  date?: string
}

export function buildRapportConversationFilename(titre: string): string {
  const base = titre.trim().replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40) || 'conversation'
  return `conversation_${base}.`
}

// ============================================================
// PDF — format institutionnel ANACIM (pdfRapport.shared)
// ============================================================

async function buildRapportConversationPDF(data: RapportConversationInput): Promise<{ blob: Blob }> {
  const { creerRapportPdf } = await import('@/lib/services/pdfRapport')
  const pdf = await creerRapportPdf()

  const date = data.date ? new Date(data.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
  const par = data.redacteur ? ` par ${data.redacteur}` : ''

  // ── Page de garde ─────────────────────────────────────────
  pdf.coverPage({
    titre: 'COMPTE-RENDU DE DIALOGUE IA',
    sousTitre: data.titre,
    ref: data.aerodromeNom ? `Aérodrome de ${data.aerodromeNom}` : undefined,
    meta: [
      ['Établi le', `${date}${par}`],
      ['Confidentialité', "Document confidentiel — diffusion autorisée dans le circuit d'instruction"],
    ],
  })

  pdf.addPage()

  // ── Échange ───────────────────────────────────────────────
  for (const m of data.messages) {
    if (m.role === 'user') {
      pdf.subHeading('INSPECTEUR — QUESTION')
      pdf.paragraph(m.content, 10)
    } else {
      pdf.subHeading('COPILOTE IA — RÉPONSE', { color: [0x0f, 0x62, 0x38] })
      pdf.paragraph(m.content, 10)
    }
    pdf.setY(pdf.y + 3)
  }

  pdf.drawFooter('ANACIM — Direction de la Sécurité et de la Sûreté — Document confidentiel')

  return { blob: pdf.blob() }
}

// ============================================================
// WORD (DOCX)
// ============================================================

async function buildRapportConversationDOCX(data: RapportConversationInput): Promise<{ blob: Blob }> {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Header, Footer,
    PageNumber, PageBreak, BorderStyle, WidthType, Table, TableRow, TableCell, VerticalAlign,
  } = await import('docx')

  const C_PRIMARY = '1E4073'
  const C_GRAY = '444444'
  const C_LIGHT = '888888'
  const C_GREEN = '0F6238'
  const C_DARK = '1A1A1A'
  const C_RULE = 'CBD5E1'

  const date = data.date ? new Date(data.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR')
  const par = data.redacteur ? ` par ${data.redacteur}` : ''

  const cover = (
    text: string,
    opts: { bold?: boolean; size?: number; color?: string; before?: number; after?: number; rule?: boolean } = {},
  ) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
      border: opts.rule
        ? { bottom: { color: C_RULE, size: 8, style: BorderStyle.SINGLE, space: 6 } }
        : undefined,
      children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 20, color: opts.color ?? C_DARK })],
    })

  const metaValue = (text: string, widthPct: number, opts: { bold?: boolean; color?: string } = {}) =>
    new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 0, right: 60 },
      borders: { bottom: { color: C_RULE, size: 4, style: BorderStyle.SINGLE } },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold, size: 20, color: opts.color ?? C_DARK })] })],
    })

  const content: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = []

  // ── Page de garde ─────────────────────────────────────────
  content.push(cover('RÉPUBLIQUE DU SÉNÉGAL', { bold: true, size: 26, color: C_PRIMARY, before: 960, after: 90 }))
  content.push(cover('MINISTÈRE DES INFRASTRUCTURES, DES TRANSPORTS TERRESTRES ET DU DÉSENCLAVEMENT', { size: 18, color: C_GRAY, after: 40 }))
  content.push(cover('AGENCE NATIONALE DE L\'AVIATION CIVILE ET DE LA MÉTÉOROLOGIE (ANACIM)', { size: 20, color: C_GRAY, after: 40 }))
  content.push(cover('Direction de la Sécurité et de la Sûreté — Bureau Études & Normes des Aérodromes', { size: 18, color: C_GRAY, after: 280 }))
  content.push(cover('', { rule: true, after: 700 }))

  content.push(cover('COMPTE-RENDU DE DIALOGUE IA', { bold: true, size: 44, color: C_PRIMARY, before: 480, after: 200 }))
  content.push(cover(data.titre, { bold: true, size: 28, color: C_DARK, after: 180 }))
  if (data.aerodromeNom) content.push(cover(`Aérodrome de ${data.aerodromeNom}`, { size: 24, color: C_GRAY, after: 340 }))
  content.push(cover('', { rule: true, after: 760 }))

  const metaRows: Array<InstanceType<typeof TableRow>> = [
    ['Établi le', `${date}${par}`],
    ['Aérodrome', data.aerodromeNom ?? '—'],
    ['Confidentialité', "Document confidentiel — diffusion autorisée dans le circuit d'instruction"],
  ].map(([k, v]) =>
    new TableRow({
      children: [
        metaValue(`${k} :`, 30, { bold: true, color: C_GRAY }),
        metaValue(v, 70),
      ],
    })
  )

  content.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: metaRows,
  }))

  // ── Échange ───────────────────────────────────────────────
  content.push(new Paragraph({ children: [new PageBreak()] }))

  content.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 220 },
    border: { bottom: { color: C_PRIMARY, size: 10, style: BorderStyle.SINGLE, space: 4 } },
    children: [new TextRun({ text: 'ÉCHANGE', bold: true, size: 26, color: C_PRIMARY })],
  }))

  for (const m of data.messages) {
    const label = m.role === 'user' ? 'INSPECTEUR — QUESTION' : 'COPILOTE IA — RÉPONSE'
    const color = m.role === 'user' ? C_PRIMARY : C_GREEN
    content.push(new Paragraph({
      spacing: { before: 240, after: 60 },
      children: [new TextRun({ text: label, bold: true, size: 21, color })],
    }))
    const blocks = String(m.content).split(/\r?\n+/).map((s) => s.trim()).filter(Boolean)
    for (const block of blocks.length > 0 ? blocks : ['']) {
      content.push(new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120 },
        children: [new TextRun({ text: block, size: 20, color: C_DARK })],
      }))
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 20 } },
      },
    },
    sections: [{
      properties: {
        titlePage: true,
        page: { margin: { top: 1000, bottom: 1000, left: 900, right: 900 } },
      },
      headers: {
        first: new Header({ children: [] }),
        default: new Header({ children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: 'ANACIM — Direction de la Sécurité et de la Sûreté', size: 16, color: C_LIGHT })],
        })] }),
      },
      footers: {
        first: new Footer({ children: [] }),
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Document confidentiel — Page ', size: 16, color: C_LIGHT }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, color: C_LIGHT }),
            new TextRun({ text: ' / ', size: 16, color: C_LIGHT }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: C_LIGHT }),
          ],
        })] }),
      },
      children: content,
    }],
  })

  return { blob: await Packer.toBlob(doc) }
}

// ============================================================
// EXPORTS PUBLICS
// ============================================================

export async function genererRapportConversationBlob(
  data: RapportConversationInput,
  format: 'pdf' | 'word',
): Promise<Blob> {
  const { blob } = format === 'pdf'
    ? await buildRapportConversationPDF(data)
    : await buildRapportConversationDOCX(data)
  return blob
}

export async function exporterRapportConversation(
  data: RapportConversationInput,
  format: 'pdf' | 'word',
): Promise<void> {
  const blob = await genererRapportConversationBlob(data, format)
  downloadBlob(blob, `${buildRapportConversationFilename(data.titre)}${format === 'pdf' ? 'pdf' : 'docx'}`)
}