// lib/services/pdfRapport.ts
// Bibliothèque de rendu PDF NATIF partagé — style ANACIM institutionnel
// (Times, bleu institutionnel, couverture, sections soulignées, tables).
// Reprend le langage de design validé du bulletin mensuel (bulletinMensuel.ts)
// pour tous les exports PDF : rapport de surveillance, rapport d'événement,
// registres, checklist. Texte réel (searchable), pagination automatique,
// fichiers légers — contrairement à html2canvas (image tronquée / lourde).

'use client'

export type RGB = [number, number, number]

export const PDF_COLORS: Record<string, RGB> = {
  primary: [0x1e, 0x40, 0x73],
  green: [0x16, 0xa3, 0x4a],
  red: [0xdc, 0x26, 0x26],
  amber: [0xd9, 0x77, 0x06],
  blue: [0x25, 0x63, 0xeb],
  gray: [0x64, 0x74, 0x8b],
  dark: [0x1a, 0x1a, 0x1a],
  lightGreenBg: [0xf0, 0xfd, 0xf4],
  greenBorder: [0x22, 0xc5, 0x5e],
  lightRedBg: [0xfe, 0xf2, 0xf2],
  redBorder: [0xfc, 0xa5, 0xa5],
  lightAmberBg: [0xfe, 0xf9, 0xc3],
  amberBorder: [0xf5, 0x9e, 0x0b],
}

export interface PdfRapportOptions {
  orientation?: 'portrait' | 'landscape'
  margin?: number
}

export interface TableOptions {
  head?: string[][]
  body: (string | number)[][]
  columnStyles?: Record<number, Record<string, any>>
  headStyles?: Record<string, any>
  bodyStyles?: Record<string, any>
  fontSize?: number
  headFontSize?: number
  tableWidth?: number
  didParseCell?: (d: any) => void
}

export interface CoverPageOptions {
  titre: string
  sousTitre?: string
  ref?: string
  meta?: Array<[string, string]>
}

export interface ParagraphOptions {
  color?: RGB
  bold?: boolean
  italic?: boolean
  indent?: number
  maxWidth?: number
}

export async function creerRapportPdf(options: PdfRapportOptions = {}) {
  const { default: jsPDF } = await import('jspdf')
  const { applyPlugin } = await import('jspdf-autotable')
  applyPlugin(jsPDF as any)

  const landscape = options.orientation === 'landscape'
  const doc = new jsPDF(landscape ? 'l' : 'p', 'mm', 'a4')
  const pageW = landscape ? 297 : 210
  const pageH = landscape ? 210 : 297
  const margin = options.margin ?? 18
  const contentW = pageW - margin * 2
  const footerY = pageH - 10
  let page = 1
  let y = margin

  const api = {
    get doc() { return doc },
    get page() { return page },
    get y() { return y },
    setY(v: number) { y = v },
    get contentW() { return contentW },
    get pageW() { return pageW },
    get margin() { return margin },

    addPage() {
      doc.addPage()
      page++
      y = margin
    },

    ensure(needed: number) {
      if (y + needed > footerY - 5) {
        doc.addPage()
        page++
        y = margin
      }
    },

    wrapped(text: string, size: number, maxWidth = contentW): string[] {
      return doc.splitTextToSize(text, maxWidth).map(String)
    },

    paragraph(text: string, size = 10.5, opts: ParagraphOptions = {}) {
      const lines = api.wrapped(text, size, (opts.maxWidth ?? contentW) - (opts.indent || 0))
      const lineH = size * 0.45
      for (const line of lines) {
        api.ensure(lineH)
        doc.setFont('times', opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal')
        doc.setFontSize(size)
        doc.setTextColor(...(opts.color || PDF_COLORS.dark))
        doc.text(line, margin + (opts.indent || 0), y)
        y += lineH
      }
      y += 1.5
      return y
    },

    sectionTitle(text: string, opts: { small?: boolean } = {}) {
      api.ensure(14)
      doc.setFont('times', 'bold')
      doc.setFontSize(opts.small ? 11 : 13)
      doc.setTextColor(...PDF_COLORS.primary)
      doc.text(text, margin, y)
      y += 2
      doc.setDrawColor(...PDF_COLORS.primary)
      doc.setLineWidth(0.4)
      doc.line(margin, y, pageW - margin, y)
      y += 6
      return y
    },

    subHeading(text: string, opts: { color?: RGB } = {}) {
      api.ensure(8)
      doc.setFont('times', 'bold')
      doc.setFontSize(10.5)
      doc.setTextColor(...(opts.color || PDF_COLORS.primary))
      doc.text(text, margin, y)
      y += 4.5
      return y
    },

    bulletList(items: string[], size = 9.5) {
      const lineH = size * 0.45
      for (const item of items) {
        const lines = api.wrapped(`•  ${item}`, size, contentW - 6)
        for (const line of lines) {
          api.ensure(lineH)
          doc.setFont('times', 'normal')
          doc.setFontSize(size)
          doc.setTextColor(...PDF_COLORS.dark)
          doc.text(line, margin + 4, y)
          y += lineH
        }
        y += 0.8
      }
      y += 1.5
      return y
    },

    kvTable(
      rows: Array<[string, string]>,
      opts: { labelWidth?: number; fontSize?: number; valueColor?: RGB } = {},
    ): number {
      const labelWidth = opts.labelWidth ?? 60
      const valueWidth = (contentW - 8) - labelWidth
      return api.table({
        head: [['Champ', 'Valeur']],
        body: rows.map(([k, v]) => [k, v]),
        columnStyles: {
          0: { cellWidth: labelWidth, fontStyle: 'bold', textColor: PDF_COLORS.gray },
          1: { cellWidth: valueWidth },
        },
        fontSize: opts.fontSize ?? 8.5,
        headFontSize: 8,
        didParseCell: opts.valueColor
          ? (d: any) => {
              if (d.section === 'body' && d.column.index === 1) {
                d.cell.styles.textColor = opts.valueColor
              }
            }
          : undefined,
      })
    },

    table(opts: TableOptions): number {
      api.ensure(8)
      ;(doc as any).autoTable({
        startY: y,
        head: opts.head ?? [],
        body: opts.body,
        theme: 'grid',
        styles: { font: 'times', fontSize: opts.fontSize ?? 8, cellPadding: 2 },
        headStyles: {
          fillColor: PDF_COLORS.primary,
          textColor: 255,
          fontSize: opts.headFontSize ?? 8.5,
          halign: 'center',
          ...(opts.headStyles || {}),
        },
        bodyStyles: { ...(opts.bodyStyles || {}) },
        columnStyles: opts.columnStyles,
        margin: { left: margin, right: margin },
        didParseCell: opts.didParseCell,
        ...(opts.tableWidth ? { tableWidth: opts.tableWidth } : { tableWidth: contentW - 8 }),
      })
      y = (doc as any).lastAutoTable.finalY + 8
      return y
    },

    kpiBoxes(items: Array<{ value: string; label: string; color: RGB }>, opts: { cols?: number } = {}) {
      const cols = opts.cols ?? Math.max(1, Math.min(4, items.length))
      const gap = 4
      const boxW = (contentW - gap * (cols - 1)) / cols
      const boxH = 22
      api.ensure(boxH + 4)
      items.forEach((item, i) => {
        if (i > 0 && i % cols === 0) {
          y += boxH + 8
          api.ensure(boxH + 4)
        }
        const x = margin + (i % cols) * (boxW + gap)
        doc.setDrawColor(0xe2, 0xe8, 0xf0)
        doc.setLineWidth(0.4)
        doc.roundedRect(x, y, boxW, boxH, 2, 2)
        doc.setFont('times', 'bold')
        doc.setFontSize(17)
        doc.setTextColor(...item.color)
        doc.text(item.value, x + boxW / 2, y + 12, { align: 'center' })
        doc.setFont('times', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...PDF_COLORS.gray)
        doc.text(doc.splitTextToSize(item.label, boxW - 4).map(String), x + boxW / 2, y + 17.5, { align: 'center' })
      })
      y += boxH + 8
      return y
    },

    infoBox(text: string, opts: { title?: string; tone?: 'red' | 'amber' | 'green' } = {}) {      const tone = opts.tone || 'red'
      const bg = tone === 'green' ? PDF_COLORS.lightGreenBg : tone === 'amber' ? PDF_COLORS.lightAmberBg : PDF_COLORS.lightRedBg
      const border = tone === 'green' ? PDF_COLORS.greenBorder : tone === 'amber' ? PDF_COLORS.amberBorder : PDF_COLORS.redBorder
      const lines = api.wrapped(text, 9, contentW - 16)
      const blockH = lines.length * 4.2 + (opts.title ? 12 : 8)
      api.ensure(blockH)
      doc.setFillColor(...bg)
      doc.roundedRect(margin, y, contentW, blockH, 2, 2, 'F')
      doc.setFillColor(...border)
      doc.rect(margin, y, 2.5, blockH, 'F')
      doc.setTextColor(...PDF_COLORS.dark)
      if (opts.title) {
        doc.setFont('times', 'bold')
        doc.setFontSize(9.5)
        doc.text(opts.title, margin + 6, y + 5.5)
        doc.setFont('times', 'normal')
        doc.setFontSize(9)
        doc.text(lines, margin + 6, y + 10.5)
      } else {
        doc.setFont('times', 'normal')
        doc.setFontSize(9)
        doc.text(lines, margin + 6, y + 6.5)
      }
      y += blockH + 6
      return y
    },

    coverPage(opts: CoverPageOptions) {
      doc.setFont('times', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(...PDF_COLORS.gray)
      const entete = ['RÉPUBLIQUE DU SÉNÉGAL', "AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA MÉTÉOROLOGIE"]
      entete.forEach((l, i) => doc.text(l, pageW / 2, 62 + i * 7, { align: 'center' }))

      doc.setDrawColor(0xcb, 0xd5, 0xe1)
      doc.setLineWidth(0.6)
      doc.line(pageW / 2 - 45, 82, pageW / 2 + 45, 82)

      doc.setFont('times', 'bold')
      doc.setFontSize(22)
      doc.setTextColor(...PDF_COLORS.primary)
      const titleLines = api.wrapped(opts.titre, 20, pageW - 60)
      titleLines.forEach((l, i) => doc.text(l, pageW / 2, 98 + i * 10, { align: 'center' }))
      let bottom = 98 + titleLines.length * 10

      if (opts.sousTitre) {
        doc.setFont('times', 'normal')
        doc.setFontSize(13)
        doc.setTextColor(...PDF_COLORS.gray)
        const subLines = api.wrapped(opts.sousTitre, 12, pageW - 60)
        subLines.forEach((l, i) => doc.text(l, pageW / 2, bottom + 8 + i * 6, { align: 'center' }))
        bottom += 8 + subLines.length * 6
      }

      doc.setDrawColor(0xcb, 0xd5, 0xe1)
      doc.setLineWidth(0.6)
      doc.line(pageW / 2 - 45, bottom + 14, pageW / 2 + 45, bottom + 14)

      if (opts.meta && opts.meta.length > 0) {
        let my = bottom + 30
        doc.setFontSize(10.5)
        for (const [k, v] of opts.meta) {
          if (my > footerY - 20) { doc.addPage(); page++; my = margin + 10 }
          doc.setFont('times', 'bold')
          doc.setTextColor(...PDF_COLORS.gray)
          doc.text(`${k} :`, pageW / 2 - 42, my, { align: 'right' })
          doc.setFont('times', 'normal')
          doc.setTextColor(...PDF_COLORS.dark)
          const vLines = api.wrapped(v, 10.5, pageW / 2 - 38)
          vLines.forEach((l, i) => doc.text(l, pageW / 2 - 36, my + i * 5.5, { align: 'left' }))
          my += Math.max(1, vLines.length) * 5.5 + 3
        }
      }

      if (opts.ref) {
        doc.setFont('times', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(...PDF_COLORS.gray)
        doc.text(`Référence : ${opts.ref}`, pageW / 2, pageH - 36, { align: 'center' })
      }
      doc.setFontSize(9)
      doc.setTextColor(...PDF_COLORS.gray)
      doc.text('Document confidentiel — diffusion restreinte', pageW / 2, pageH - 26, { align: 'center' })
    },

    signatureBlock(
      entries: Array<{ label: string; value: string }>,
      opts: { rightTitle?: string } = {},
    ) {
      const leftW = contentW / 2
      api.ensure(55)
      let my = y + 2
      for (const e of entries) {
        doc.setFont('times', 'bold')
        doc.setFontSize(9.5)
        doc.setTextColor(...PDF_COLORS.gray)
        doc.text(e.label, margin, my)
        my += 5
        doc.setFont('times', 'normal')
        doc.setTextColor(...PDF_COLORS.dark)
        const vLines = api.wrapped(e.value, 9.5, leftW - 8)
        for (const l of vLines) { doc.text(l, margin, my); my += 4.5 }
        my += 4
      }
      const sigY = Math.max(y + 45, my - 10)
      doc.setDrawColor(0x33, 0x33, 0x33)
      doc.setLineWidth(0.5)
      doc.line(margin + leftW + 10, sigY, pageW - margin, sigY)
      doc.setFontSize(8.5)
      doc.setTextColor(...PDF_COLORS.gray)
      doc.text(opts.rightTitle || 'Signature et cachet ANACIM', margin + leftW + 10, sigY + 5)
      y = my + 2
      return y
    },

    drawFooter(prefix: string) {
      for (let i = 1; i <= page; i++) {
        doc.setPage(i)
        doc.setFont('times', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...PDF_COLORS.gray)
        doc.text(prefix, margin, footerY)
        doc.text(`Page ${i}/${page}`, pageW - margin, footerY, { align: 'right' })
      }
    },

    htmlToText(html: string): string[] {
      let t = html || ''
      t = t.replace(/<br\s*\/?>/gi, '\n')
      t = t.replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|ul|ol|blockquote|table|section)>/gi, '\n')
      t = t.replace(/<li[^>]*>/gi, '\n• ')
      t = t.replace(/<\/td>/gi, ' | ')
      t = t.replace(/<[^>]+>/g, '')
      t = t.replace(/&nbsp;/gi, ' ')
      t = t.replace(/&amp;/gi, '&')
      t = t.replace(/&lt;/gi, '<')
      t = t.replace(/&gt;/gi, '>')
      t = t.replace(/&quot;/gi, '"')
      t = t.replace(/&#39;/gi, "'")
      t = t.replace(/&#x27;/gi, "'")
      t = t.replace(/&eacute;/gi, 'é').replace(/&egrave;/gi, 'è').replace(/&agrave;/gi, 'à')
      t = t.replace(/&ccedil;/gi, 'ç').replace(/&ecirc;/gi, 'ê').replace(/&icirc;/gi, 'î')
      t = t.replace(/&ocirc;/gi, 'ô').replace(/&ucirc;/gi, 'û').replace(/&uacute;/gi, 'ú')
      t = t.replace(/&ouml;/gi, 'ö').replace(/&uuml;/gi, 'ü').replace(/&euml;/gi, 'ë')
      return t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
    },

    paragraphsFromHtml(html: string, size = 9.5) {
      const blocks = api.htmlToText(html)
      for (const block of blocks) api.paragraph(block, size)
      return y
    },

    blob(): Blob {
      return doc.output('blob')
    },
  }

  return api
}

export type RapportPdf = Awaited<ReturnType<typeof creerRapportPdf>>
