'use client';

import type { DomaineChecklist } from '@/types/checklist';
import type { SGSTemplateEntry, ExportMeta } from './documentTemplater';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** État d'un item SGS : quels niveaux P/A/O/E sont cochés, et le commentaire libre. */
export interface SGSItemState {
  P?: boolean;
  A?: boolean;
  O?: boolean;
  E?: boolean;
  commentaire?: string;
}

/** Préfixe utilisé dans l'alias des cases à cocher pour les identifier sans ambiguïté à la relecture. */
const CHECKBOX_ALIAS_PREFIX = 'sgs-eval';

function checkboxAlias(numero: string, level: 'P' | 'A' | 'O' | 'E'): string {
  return `${CHECKBOX_ALIAS_PREFIX}|${numero}|${level}`;
}

function elementIdOf(numero: string | undefined): string | null {
  const parts = (numero || '').split('.');
  if (parts.length < 2) return null;
  return `${parts[0]}.${parts[1]}`;
}

const COLOR_PRIMARY = '1E4073';
const COLOR_PRIMARY_LIGHT = 'EAF0F8';
const COLOR_ORIENTATION_BG = 'F5F7FA';
const COLOR_BORDER = 'C9D2DE';

// ─────────────────────────────────────────────────────────────
// EXPORT : formulaire fidèle au design original, cases cochables
// ─────────────────────────────────────────────────────────────

export async function generateSGSFormDOCX(
  domaines: DomaineChecklist[],
  sgsTemplate: Record<string, SGSTemplateEntry>,
  meta: ExportMeta = {},
  itemStates: Record<string, SGSItemState> = {},
): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
    WidthType, BorderStyle, ShadingType, AlignmentType, Header, Footer, PageNumber,
    VerticalAlign, PageBreak, CheckBox,
  } = await import('docx');

  const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER };
  const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  const headerCell = (text: string, widthPct: number) => new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_PRIMARY },
    verticalAlign: VerticalAlign.CENTER,
    borders: cellBorders,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 15 })],
    })],
  });

  const textCell = (text: string, widthPct: number, opts: { align?: any } = {}) => new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 60, right: 60 },
    children: (text || '').split('\n').map(line => new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text: line, size: 16 })],
    })),
  });

  // Cellule éditable (vide ou pré-remplie) — pour "Commentaires", laissée
  // libre pour que l'inspecteur tape directement dedans dans Word.
  const editableCell = (text: string, widthPct: number) => new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: cellBorders,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 50, bottom: 50, left: 60, right: 60 },
    children: [new Paragraph({ children: [new TextRun({ text: text || '', size: 16 })] })],
  });

  const checkboxCell = (numero: string, level: 'P' | 'A' | 'O' | 'E', widthPct: number) => {
    const checked = !!itemStates[numero]?.[level];
    return new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 50, bottom: 50, left: 40, right: 40 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new CheckBox({ alias: checkboxAlias(numero, level), checked })],
      })],
    });
  };

  function buildItemsTable(entry: SGSTemplateEntry) {
    const columns = [
      { label: 'N°', width: 6 },
      { label: 'Indicateur', width: 42 },
      { label: 'P', width: 6 },
      { label: 'A', width: 6 },
      { label: 'O', width: 6 },
      { label: 'E', width: 6 },
      { label: 'Éléments de mise en œuvre', width: 14 },
      { label: 'Commentaires', width: 14 },
    ];
    const headerRow = new TableRow({ tableHeader: true, children: columns.map(c => headerCell(c.label, c.width)) });
    const rows = entry.questions.map(q => {
      const state = itemStates[q.ref];
      return new TableRow({
        children: [
          textCell(q.ref, columns[0].width, { align: AlignmentType.CENTER }),
          textCell(q.texte, columns[1].width),
          checkboxCell(q.ref, 'P', columns[2].width),
          checkboxCell(q.ref, 'A', columns[3].width),
          checkboxCell(q.ref, 'O', columns[4].width),
          checkboxCell(q.ref, 'E', columns[5].width),
          editableCell('', columns[6].width),
          editableCell(state?.commentaire || '', columns[7].width),
        ],
      });
    });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
  }

  function buildOrientationBlock(entry: SGSTemplateEntry): any[] {
    const blocks: any[] = [];
    if (entry.guideEtapes.length > 0) {
      blocks.push(new Paragraph({
        spacing: { before: 140, after: 50 },
        children: [new TextRun({ text: "Directives pour l'examen des preuves", bold: true, italics: true, color: COLOR_PRIMARY, size: 17 })],
      }));
      for (const etape of entry.guideEtapes) {
        for (const action of etape.actions) {
          blocks.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 30 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_ORIENTATION_BG },
            children: [new TextRun({ text: action, size: 15, italics: true })],
          }));
        }
      }
    }

    const niveaux = [
      { label: 'Présent', texts: entry.directives.present },
      { label: 'Approprié', texts: entry.directives.approprie },
      { label: 'Opérationnel', texts: entry.directives.operationnel },
      { label: 'Efficace', texts: entry.directives.efficace },
    ].filter(n => n.texts.length > 0);

    if (niveaux.length > 0) {
      const headerRow = new TableRow({ tableHeader: true, children: niveaux.map(n => headerCell(n.label, Math.floor(100 / niveaux.length))) });
      const maxLines = Math.max(...niveaux.map(n => n.texts.length));
      const contentRows: any[] = [];
      for (let i = 0; i < maxLines; i++) {
        contentRows.push(new TableRow({ children: niveaux.map(n => textCell(n.texts[i] || '', Math.floor(100 / niveaux.length))) }));
      }
      blocks.push(new Paragraph({ spacing: { before: 100, after: 40 }, children: [] }));
      blocks.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...contentRows] }));
    }

    return blocks;
  }

  const body: any[] = [];

  body.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: meta.titre || 'Checklist SGS', bold: true, size: 30, color: COLOR_PRIMARY })],
  }));
  const infoLines = [
    `Code : ${meta.code || '—'}    Version : ${meta.version || '—'}`,
    `Aérodrome : ${meta.aerodrome || '—'}    Inspecteur(s) : ${meta.inspecteurs || '—'}`,
    `Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`,
  ];
  for (const line of infoLines) {
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: line, size: 17, color: '444444' })] }));
  }
  body.push(new Paragraph({ spacing: { after: 160 }, children: [] }));

  domaines.forEach((domaine, domaineIdx) => {
    if (domaineIdx > 0) body.push(new Paragraph({ children: [new PageBreak()] }));

    body.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 80, after: 140 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_PRIMARY_LIGHT },
      children: [new TextRun({ text: `${domaine.nom}${domaine.description ? ' — ' + domaine.description : ''}`, bold: true, color: COLOR_PRIMARY, size: 22 })],
    }));

    const items = (domaine.items || []) as any[];
    const elementIds = [...new Set(items.map(it => elementIdOf(it.numero)).filter((e): e is string => !!e))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const elementId of elementIds) {
      const entry = sgsTemplate[elementId];
      if (!entry) continue;

      body.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 180, after: 90 },
        children: [new TextRun({ text: entry.titre ? `${elementId} — ${entry.titre}` : elementId, bold: true, color: COLOR_PRIMARY, size: 19 })],
      }));

      body.push(buildItemsTable(entry));
      body.push(...buildOrientationBlock(entry));
    }
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 600, right: 600 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'ANACIM', size: 16, color: '888888' })] })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${meta.titre || 'Checklist SGS'} — Page `, size: 14, color: '888888' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 14, color: '888888' }),
              new TextRun({ text: ' / ', size: 14, color: '888888' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: '888888' }),
            ],
          })],
        }),
      },
      children: body,
    }],
  });

  return Packer.toBlob(doc);
}

export async function exportSGSFormDOCX(
  domaines: DomaineChecklist[],
  sgsTemplate: Record<string, SGSTemplateEntry>,
  meta: ExportMeta = {},
  itemStates: Record<string, SGSItemState> = {},
): Promise<void> {
  const blob = await generateSGSFormDOCX(domaines, sgsTemplate, meta, itemStates);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(meta.code || 'sgs').replace(/[^a-zA-Z0-9_-]/g, '_')}_formulaire.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
// IMPORT : relecture d'un formulaire rempli hors ligne
// ─────────────────────────────────────────────────────────────

export async function parseSGSFormDOCX(file: File): Promise<{ itemStates: Record<string, SGSItemState> }> {
  const buffer = await file.arrayBuffer();
  const { unzipSync, strFromU8 } = await import('fflate');
  const unzipped = unzipSync(new Uint8Array(buffer));
  const docKey = Object.keys(unzipped).find(k => k === 'word/document.xml');
  if (!docKey) throw new Error('Fichier .docx invalide : pas de document.xml.');
  const docXml = strFromU8(unzipped[docKey]);

  const itemStates: Record<string, SGSItemState> = {};

  // 1) Cases à cocher : chaque <w:sdt> porte un alias "sgs-eval|<numero>|<niveau>"
  //    et son état coché dans <w14:checked w14:val="1|0"/>.
  const sdtRegex = /<w:sdt>([\s\S]*?)<\/w:sdt>/g;
  let sdtMatch: RegExpExecArray | null;
  while ((sdtMatch = sdtRegex.exec(docXml)) !== null) {
    const block = sdtMatch[1];
    const aliasMatch = block.match(/<w:alias w:val="([^"]*)"\s*\/>/);
    if (!aliasMatch) continue;
    const alias = aliasMatch[1];
    const parts = alias.split('|');
    if (parts.length !== 3 || parts[0] !== CHECKBOX_ALIAS_PREFIX) continue;
    const [, numero, level] = parts;
    if (level !== 'P' && level !== 'A' && level !== 'O' && level !== 'E') continue;
    const checkedMatch = block.match(/<w14:checked w14:val="(\d)"\s*\/>/);
    const checked = checkedMatch ? checkedMatch[1] === '1' : false;
    if (!itemStates[numero]) itemStates[numero] = {};
    itemStates[numero][level] = checked;
  }

  // 2) Commentaires : dernière cellule de chaque ligne d'item, identifiée par
  //    le numéro (X.X.X) en première cellule — même structure que celle
  //    produite par generateSGSFormDOCX.
  const tblRegex = /<w:tbl>([\s\S]*?)<\/w:tbl>/g;
  let tblMatch: RegExpExecArray | null;
  while ((tblMatch = tblRegex.exec(docXml)) !== null) {
    const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(tblMatch[1])) !== null) {
      const tcRegex = /<w:tc>([\s\S]*?)<\/w:tc>/g;
      const cells: string[] = [];
      let tcMatch: RegExpExecArray | null;
      while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
        const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
        const paragraphs: string[] = [];
        let pMatch: RegExpExecArray | null;
        while ((pMatch = pRegex.exec(tcMatch[1])) !== null) {
          const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
          const texts: string[] = [];
          let tMatch: RegExpExecArray | null;
          while ((tMatch = tRegex.exec(pMatch[1])) !== null) texts.push(tMatch[1]);
          const text = texts.join('').trim();
          if (text) paragraphs.push(text);
        }
        cells.push(paragraphs.join('\n'));
      }
      const numero = cells[0]?.trim();
      if (numero && /^\d+\.\d+\.\d+$/.test(numero) && cells.length >= 8) {
        const commentaire = cells[7]?.trim();
        if (commentaire) {
          if (!itemStates[numero]) itemStates[numero] = {};
          itemStates[numero].commentaire = commentaire;
        }
      }
    }
  }

  return { itemStates };
}
