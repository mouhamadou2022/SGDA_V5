'use client';

import jsPDF from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);
import type { DomaineChecklist, ChecklistItem } from '@/types/checklist';
import type { ExportMeta, SGSTemplateEntry } from './documentTemplater';

const RESULTAT_LABELS: Record<string, string> = {
  SA: 'Satisfaisant', NS: 'Non Satisfaisant', NV: 'Non Validé', NA: 'Non Applicable',
};

const RESULTAT_RGB: Record<string, [number, number, number]> = {
  SA: [0x16, 0xa3, 0x4a], NS: [0xdc, 0x26, 0x26], NV: [0xd9, 0x77, 0x06], NA: [0x64, 0x74, 0x8b],
};

const PRIMARY_RGB: [number, number, number] = [0x1e, 0x40, 0x73];

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

function resultatCell(doc: jsPDF, val: string, rgb: [number, number, number] | undefined) {
  if (rgb) doc.setTextColor(...rgb);
}

// ═════════════════════════════════════════
// PDF EXPORT (jspdf + jspdf-autotable)
// ═════════════════════════════════════════

// ═════════════════════════════════════════
// BUILD PDF (Blob) — réutilisable pour la publication portail (dossier transmission)
// ═════════════════════════════════════════

export async function buildChecklistPDFBlob(
  domaines: DomaineChecklist[],
  meta: ExportMeta = {},
): Promise<Blob> {
  const doc = await buildChecklistDoc(domaines, meta);
  return doc.output('blob');
}

export async function exportChecklistPDF(
  domaines: DomaineChecklist[],
  meta: ExportMeta = {},
): Promise<void> {
  const doc = await buildChecklistDoc(domaines, meta);
  doc.save(`${(meta.code || 'checklist').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`);
}

async function buildChecklistDoc(
  domaines: DomaineChecklist[],
  meta: ExportMeta = {},
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = 297;
  const margin = 10;
  let y = margin;

  const isSGS = !!meta.sgsTemplate;

  const drawFooterLater: number[] = [];

  const ensureSpace = (needed: number) => {
    if (y + needed > 200) {
      doc.addPage();
      y = margin;
    }
  };

  // Titre — bandeau institutionnel
  doc.setFillColor(...PRIMARY_RGB);
  doc.roundedRect(margin, y, pageW - margin * 2, 14, 1.5, 1.5, 'F');
  doc.setFontSize(15);
  doc.setFont('times', 'bold');
  doc.setTextColor(255);
  doc.text(meta.titre || 'Checklist', pageW / 2, y + 9, { align: 'center' });
  y += 20;

  // Infos
  doc.setFontSize(9);
  doc.setFont('times', 'normal');
  doc.setTextColor(60);
  const infos = [
    `Code : ${meta.code || '—'}  |  Version : ${meta.version || '—'}`,
    `Portée : ${(meta.portee || []).join(', ') || '—'}`,
    `Aérodrome : ${meta.aerodrome || '—'}  |  Inspecteur(s) : ${meta.inspecteurs || '—'}`,
    `Date : ${new Date().toLocaleDateString('fr-FR')}`,
  ];
  for (const line of infos) {
    doc.text(line, margin, y);
    y += 4;
  }
  y += 3;

  const drawSectionTitle = (text: string) => {
    ensureSpace(12);
    doc.setFontSize(13);
    doc.setFont('times', 'bold');
    doc.setTextColor(...PRIMARY_RGB);
    doc.text(text, margin, y);
    y += 2;
    doc.setDrawColor(...PRIMARY_RGB);
    doc.setLineWidth(0.4);
    doc.line(margin, y, pageW - margin, y);
    y += 5;
  };

  const drawSubTitle = (text: string) => {
    ensureSpace(8);
    doc.setFontSize(10);
    doc.setFont('times', 'bold');
    doc.setTextColor(...PRIMARY_RGB);
    doc.text(text, margin, y);
    y += 5;
  };

  for (const domaine of domaines) {
    drawSectionTitle(`${domaine.nom} — ${domaine.description || ''}`);

    if (isSGS && meta.sgsTemplate) {
      const items = getAllItemsFlat([domaine]);
      const itemsById = new Map(items.map(it => [it.numero || '', it]));
      const elementIds = [...new Set(items.map(it => elementIdOf(it.numero)).filter((e): e is string => !!e))]
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      for (const elementId of elementIds) {
        const entry: SGSTemplateEntry | undefined = meta.sgsTemplate[elementId];
        if (!entry) continue;

        drawSubTitle(entry.titre ? `Élément ${elementId} — ${entry.titre}` : `Élément ${elementId}`);

        const rows = entry.questions.map(q => {
          const item = itemsById.get(q.ref);
          return [
            q.ref,
            q.texte,
            item?.resultat ? (RESULTAT_LABELS[item.resultat] || item.resultat) : '—',
            item?.observation || '',
          ];
        });

        (doc as any).autoTable({
          startY: y,
          head: [['N°', 'Indicateur', 'État', 'Observation']],
          body: rows,
          theme: 'grid',
          headStyles: { fillColor: PRIMARY_RGB, fontSize: 7, halign: 'center' },
          bodyStyles: { fontSize: 6.5 },
          columnStyles: {
            0: { cellWidth: 14, halign: 'center' },
            1: { cellWidth: 158 },
            2: { cellWidth: 28, halign: 'center' },
            3: { cellWidth: 65 },
          },
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.column.index === 2 && data.section === 'body') {
              const rowItem = itemsById.get(String(rows[data.row.index]?.[0]));
              const rgb = rowItem?.resultat ? RESULTAT_RGB[rowItem.resultat] : undefined;
              if (rgb) { data.cell.styles.textColor = rgb; data.cell.styles.fontStyle = 'bold'; }
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 4;

        // Directives pour l'examen des preuves
        const allActions = entry.guideEtapes.flatMap(e => e.actions);
        if (allActions.length > 0) {
          ensureSpace(8);
          doc.setFontSize(8.5);
          doc.setFont('times', 'bold');
          doc.setTextColor(...PRIMARY_RGB);
          doc.text("Directives pour l'examen des preuves", margin, y);
          y += 4;
          doc.setFont('times', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(30);
          for (const action of allActions) {
            const wrapped = doc.splitTextToSize(`•  ${action}`, pageW - margin * 2 - 3);
            ensureSpace(wrapped.length * 3.2 + 1);
            doc.text(wrapped, margin + 2, y);
            y += wrapped.length * 3.2 + 0.5;
          }
          y += 2;
        }

        // Niveaux P/A/O/E
        const niveaux: { label: string; texts: string[] }[] = [
          { label: 'Présent', texts: entry.directives.present },
          { label: 'Approprié', texts: entry.directives.approprie },
          { label: 'Opérationnel', texts: entry.directives.operationnel },
          { label: 'Efficace', texts: entry.directives.efficace },
        ].filter(n => n.texts.length > 0);

        if (niveaux.length > 0) {
          const maxLines = Math.max(...niveaux.map(n => n.texts.length));
          const paoeRows: string[][] = [];
          for (let i = 0; i < maxLines; i++) {
            paoeRows.push(niveaux.map(n => n.texts[i] || ''));
          }
          ensureSpace(10);
          (doc as any).autoTable({
            startY: y,
            head: [niveaux.map(n => n.label)],
            body: paoeRows,
            theme: 'grid',
            headStyles: { fillColor: PRIMARY_RGB, fontSize: 7, halign: 'center' },
            bodyStyles: { fontSize: 6.5 },
            margin: { left: margin, right: margin },
          });
          y = (doc as any).lastAutoTable.finalY + 6;
        }
      }
    } else {
      const items = getAllItemsFlat([domaine]);
      if (items.length === 0) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text('Aucun item', margin + 2, y);
        y += 5;
      } else {
        const rows = items.map((item, i) => [
          String(i + 1),
          item.numero || '',
          item.reference_reglementaire || '',
          item.point_verification || '',
          item.directive_preuve || '',
          item.resultat ? RESULTAT_LABELS[item.resultat] || item.resultat : '—',
          item.observation || '',
        ]);

        (doc as any).autoTable({
          startY: y,
          head: [['#', 'N°', 'Réf. Régl.', 'Point à vérifier', "Guide d'évaluation", 'État', 'Observation']],
          body: rows,
          theme: 'grid',
          headStyles: { fillColor: PRIMARY_RGB, fontSize: 7, halign: 'center' },
          bodyStyles: { fontSize: 6 },
          columnStyles: {
            0: { cellWidth: 6, halign: 'center' },
            1: { cellWidth: 10, halign: 'center' },
            2: { cellWidth: 22 },
            3: { cellWidth: 65 },
            4: { cellWidth: 55 },
            5: { cellWidth: 18, halign: 'center' },
            6: { cellWidth: 45 },
          },
          margin: { left: margin, right: margin },
          didParseCell: (data: any) => {
            if (data.column.index === 5 && data.cell.text[0] !== '—') {
              const val = data.cell.text[0];
              if (val === 'Satisfaisant') { data.cell.styles.textColor = RESULTAT_RGB.SA; data.cell.styles.fontStyle = 'bold'; }
              else if (val === 'Non Satisfaisant') { data.cell.styles.textColor = RESULTAT_RGB.NS; data.cell.styles.fontStyle = 'bold'; }
              else if (val === 'Non Applicable') { data.cell.styles.textColor = RESULTAT_RGB.NA; }
              else { data.cell.styles.textColor = RESULTAT_RGB.NV; }
            }
          },
        });
        y = (doc as any).lastAutoTable.finalY + 5;
      }
    }
  }

  // Pied de page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('times', 'normal');
    doc.setTextColor(100);
    doc.text(
      `ANACIM — ${meta.titre || 'Checklist'} — Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      margin,
      205,
    );
    doc.text(`Page ${i}/${pageCount}`, pageW - margin - 10, 205, { align: 'right' });
  }

  return doc;
}
