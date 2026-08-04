'use client';

import type { DomaineChecklist, ChecklistItem } from '@/types/checklist';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SGSDirectivesExport {
  present: string[];
  approprie: string[];
  operationnel: string[];
  efficace: string[];
}

export interface SGSGuideEtapeExport {
  etape: number;
  titre: string;
  actions: string[];
}

export interface SGSTemplateEntry {
  questions: { id: string; ref: string; texte: string; niveau?: string; sourceReglementaire?: string }[];
  directives: SGSDirectivesExport;
  guideEtapes: SGSGuideEtapeExport[];
  /** Nom de l'élément tel qu'il apparaît dans le document source (ex. "Engagement de la direction") */
  titre?: string;
}

export interface ExportMeta {
  titre?: string;
  code?: string;
  version?: string;
  portee?: string[];
  aerodrome?: string;
  inspecteurs?: string;
  /** Uniquement pour les templates SGS : sortie de buildSGSTemplateFromImport(), clé = élément "X.Y" */
  sgsTemplate?: Record<string, SGSTemplateEntry>;
}

const RESULTAT_LABELS: Record<string, string> = {
  SA: 'Satisfaisant', NS: 'Non Satisfaisant', NV: 'Non Validé', NA: 'Non Applicable',
};

const RESULTAT_COLORS: Record<string, string> = {
  SA: '16A34A', NS: 'DC2626', NV: 'D97706', NA: '64748B',
};

const COLOR_PRIMARY = '1E4073';
const COLOR_PRIMARY_LIGHT = 'EAF0F8';
const COLOR_ORIENTATION_BG = 'F5F7FA';
const COLOR_BORDER = 'C9D2DE';

function getAllItemsFlat(domaines: DomaineChecklist[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  for (const d of domaines) {
    items.push(...(d.items || []));
    for (const sd of (d.sousDomaines || [])) {
      items.push(...(sd.items || []));
      for (const ssd of (sd.sousSousDomaines || [])) {
        items.push(...(ssd.items || []));
      }
    }
  }
  return items;
}

function elementIdOf(numero: string | undefined): string | null {
  const parts = (numero || '').split('.');
  if (parts.length < 2) return null;
  return `${parts[0]}.${parts[1]}`;
}

// ─────────────────────────────────────────────────────────────
// Génération DOCX (librairie `docx`, aucun fichier modèle externe)
// ─────────────────────────────────────────────────────────────

export async function generateChecklistDOCX(domaines: DomaineChecklist[], meta: ExportMeta = {}): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
    WidthType, BorderStyle, ShadingType, AlignmentType, Header, Footer, PageNumber,
    VerticalAlign, PageBreak, Numbering,
  } = await import('docx');

  const isSGS = !!meta.sgsTemplate;

  const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: COLOR_BORDER };
  const cellBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

  const headerCell = (text: string, widthPct: number) => new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_PRIMARY },
    verticalAlign: VerticalAlign.CENTER,
    borders: cellBorders,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 16 })],
    })],
  });

  const bodyCell = (text: string, widthPct: number, opts: { bold?: boolean; color?: string; align?: any; shading?: string } = {}) =>
    new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      borders: cellBorders,
      verticalAlign: VerticalAlign.CENTER,
      shading: opts.shading ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.shading } : undefined,
      margins: { top: 50, bottom: 50, left: 80, right: 80 },
      children: (text || '—').split('\n').map(line => new Paragraph({
        alignment: opts.align,
        children: [new TextRun({ text: line, bold: opts.bold, color: opts.color, size: 16 })],
      })),
    });

  // ── Table générique (IT / SOP / QSC / VALIDATION_SITE) ──────
  function buildGenericTable(items: ChecklistItem[]) {
    const columns = [
      { label: '#', width: 4 },
      { label: 'N°', width: 6 },
      { label: 'Réf. réglementaire', width: 14 },
      { label: 'Point à vérifier', width: 32 },
      { label: "Guide d'évaluation", width: 24 },
      { label: 'État', width: 10 },
      { label: 'Observation', width: 10 },
    ];
    const headerRow = new TableRow({
      tableHeader: true,
      children: columns.map(c => headerCell(c.label, c.width)),
    });
    const rows = items.map((item, i) => {
      const resultatLabel = item.resultat ? (RESULTAT_LABELS[item.resultat] || item.resultat) : '—';
      const resultatColor = item.resultat ? RESULTAT_COLORS[item.resultat] : undefined;
      return new TableRow({
        children: [
          bodyCell(String(i + 1), columns[0].width, { align: AlignmentType.CENTER }),
          bodyCell(item.numero || '', columns[1].width, { align: AlignmentType.CENTER }),
          bodyCell(item.reference_reglementaire || '', columns[2].width),
          bodyCell(item.point_verification || '', columns[3].width),
          bodyCell(item.directive_preuve || '', columns[4].width),
          bodyCell(resultatLabel, columns[5].width, { bold: true, color: resultatColor, align: AlignmentType.CENTER }),
          bodyCell(item.observation || '', columns[6].width),
        ],
      });
    });
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...rows],
    });
  }

  // ── Table des questions SGS (P/A/O/E + résultat) pour un élément ──
  function buildSGSQuestionsTable(entry: SGSTemplateEntry, itemsById: Map<string, ChecklistItem>) {
    const columns = [
      { label: 'N°', width: 8 },
      { label: 'Indicateur', width: 62 },
      { label: 'État', width: 15 },
      { label: 'Observation', width: 15 },
    ];
    const headerRow = new TableRow({
      tableHeader: true,
      children: columns.map(c => headerCell(c.label, c.width)),
    });
    const rows = entry.questions.map(q => {
      const item = itemsById.get(q.ref);
      const resultatLabel = item?.resultat ? (RESULTAT_LABELS[item.resultat] || item.resultat) : '—';
      const resultatColor = item?.resultat ? RESULTAT_COLORS[item.resultat] : undefined;
      return new TableRow({
        children: [
          bodyCell(q.ref, columns[0].width, { align: AlignmentType.CENTER }),
          bodyCell(q.texte, columns[1].width),
          bodyCell(resultatLabel, columns[2].width, { bold: true, color: resultatColor, align: AlignmentType.CENTER }),
          bodyCell(item?.observation || '', columns[3].width),
        ],
      });
    });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...rows] });
  }

  // ── Encart "Orientation" : directives + niveaux P/A/O/E pour un élément ──
  function buildOrientationBlock(entry: SGSTemplateEntry): any[] {
    const blocks: any[] = [];
    if (entry.guideEtapes.length > 0) {
      blocks.push(new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [new TextRun({ text: "Directives pour l'examen des preuves", bold: true, color: COLOR_PRIMARY, size: 18 })],
      }));
      for (const etape of entry.guideEtapes) {
        for (const action of etape.actions) {
          blocks.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_ORIENTATION_BG },
            children: [new TextRun({ text: action, size: 16 })],
          }));
        }
      }
    }

    const niveaux: { label: string; texts: string[] }[] = [
      { label: 'Présent', texts: entry.directives.present },
      { label: 'Approprié', texts: entry.directives.approprie },
      { label: 'Opérationnel', texts: entry.directives.operationnel },
      { label: 'Efficace', texts: entry.directives.efficace },
    ].filter(n => n.texts.length > 0);

    if (niveaux.length > 0) {
      blocks.push(new Paragraph({
        spacing: { before: 160, after: 60 },
        children: [new TextRun({ text: "Niveaux d'évaluation (P/A/O/E)", bold: true, color: COLOR_PRIMARY, size: 18 })],
      }));
      const headerRow = new TableRow({
        tableHeader: true,
        children: niveaux.map(n => headerCell(n.label, Math.floor(100 / niveaux.length))),
      });
      const maxLines = Math.max(...niveaux.map(n => n.texts.length));
      const contentRows: any[] = [];
      for (let i = 0; i < maxLines; i++) {
        contentRows.push(new TableRow({
          children: niveaux.map(n => bodyCell(n.texts[i] || '', Math.floor(100 / niveaux.length))),
        }));
      }
      blocks.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...contentRows] }));
    }

    return blocks;
  }

  // ── Corps du document ──
  const body: any[] = [];

  body.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: meta.titre || 'Checklist', bold: true, size: 32, color: COLOR_PRIMARY })],
  }));

  const infoLines = [
    `Code : ${meta.code || '—'}    Version : ${meta.version || '—'}`,
    `Portée : ${(meta.portee || []).join(', ') || '—'}`,
    `Aérodrome : ${meta.aerodrome || '—'}    Inspecteur(s) : ${meta.inspecteurs || '—'}`,
    `Date d'édition : ${new Date().toLocaleDateString('fr-FR')}`,
  ];
  for (const line of infoLines) {
    body.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: line, size: 18, color: '444444' })],
    }));
  }
  body.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  domaines.forEach((domaine, domaineIdx) => {
    if (domaineIdx > 0) body.push(new Paragraph({ children: [new PageBreak()] }));

    body.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 100, after: 160 },
      shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_PRIMARY_LIGHT },
      children: [new TextRun({ text: `${domaine.nom}${domaine.description ? ' — ' + domaine.description : ''}`, bold: true, color: COLOR_PRIMARY, size: 24 })],
    }));

    if (isSGS && meta.sgsTemplate) {
      const items = getAllItemsFlat([domaine]);
      const itemsById = new Map(items.map(it => [it.numero || '', it]));
      const elementIds = [...new Set(items.map(it => elementIdOf(it.numero)).filter((e): e is string => !!e))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      if (elementIds.length === 0) {
        body.push(new Paragraph({ children: [new TextRun({ text: 'Aucun élément', italics: true })] }));
      }

      for (const elementId of elementIds) {
        const entry = meta.sgsTemplate[elementId];
        if (!entry) continue;

        body.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: entry.titre ? `Élément ${elementId} — ${entry.titre}` : `Élément ${elementId}`, bold: true, color: COLOR_PRIMARY, size: 20 })],
        }));

        body.push(buildSGSQuestionsTable(entry, itemsById));
        body.push(...buildOrientationBlock(entry));
      }
    } else {
      const items = getAllItemsFlat([domaine]);
      if (items.length === 0) {
        body.push(new Paragraph({ children: [new TextRun({ text: 'Aucun item', italics: true })] }));
      } else {
        body.push(buildGenericTable(items));
      }
    }
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 20 } },
      },
    },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'ANACIM', size: 16, color: '888888' })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${meta.titre || 'Checklist'} — Page `, size: 14, color: '888888' }),
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

export async function exportChecklistDOCX(domaines: DomaineChecklist[], meta: ExportMeta = {}): Promise<void> {
  const blob = await generateChecklistDOCX(domaines, meta);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(meta.code || 'checklist').replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
