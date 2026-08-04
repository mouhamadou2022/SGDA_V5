import * as fs from 'fs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType, BorderStyle } from 'docx';

const HDR = '1E4073';
const B = { top: { style: BorderStyle.SINGLE as any, size: 1, color: 'CCCCCC' }, bottom: { style: BorderStyle.SINGLE as any, size: 1, color: 'CCCCCC' }, left: { style: BorderStyle.SINGLE as any, size: 1, color: 'CCCCCC' }, right: { style: BorderStyle.SINGLE as any, size: 1, color: 'CCCCCC' } };

function c(text: string, o?: { w?: number; s?: string; a?: string; b?: boolean }) {
  return new TableCell({
    width: o?.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
    shading: o?.s ? { type: ShadingType.SOLID, color: o.s } : undefined,
    verticalAlign: 'center', borders: B,
    children: [new Paragraph({
      alignment: o?.a === 'c' ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 30, after: 30 },
      children: [new TextRun({ text, size: 18, bold: o?.b, font: 'Calibri' })],
    })],
  });
}

async function main() {
  const doc = new Document({
    title: 'Template checklist',
    sections: [{
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'RÉPUBLIQUE DU SÉNÉGAL', size: 14, bold: true, font: 'Calibri', color: HDR })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'ANACIM', size: 14, bold: true, font: 'Calibri', color: HDR })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: '{titre}', size: 22, bold: true, font: 'Calibri', color: HDR })] }),
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Code : {code}  |  Version : {version}  |  Date : {date}', size: 14, font: 'Calibri', color: '666666' })] }),
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Portée : {portee}', size: 14, font: 'Calibri', color: '666666' })] }),
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Aérodrome : {aerodrome}', size: 14, font: 'Calibri', color: '666666' })] }),
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Inspecteur(s) : {inspecteurs}', size: 14, font: 'Calibri', color: '666666' })] }),
        new Paragraph({ spacing: { after: 120 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HDR } }, children: [] }),

        new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: '{#domaines}{domaine_titre}', size: 18, bold: true, font: 'Calibri', color: HDR })] }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: [
              c('#', { w: 4, s: HDR, a: 'c', b: true }),
              c('N°', { w: 6, s: HDR, a: 'c', b: true }),
              c('Réf. Régl.', { w: 13, s: HDR, a: 'c', b: true }),
              c('Point à vérifier', { w: 28, s: HDR, b: true }),
              c("Guide d'évaluation", { w: 22, s: HDR, b: true }),
              c('État', { w: 9, s: HDR, a: 'c', b: true }),
              c('Observation', { w: 18, s: HDR, b: true }),
            ]}),
            new TableRow({ children: [
              c('{#items}{index}', { w: 4, a: 'c' }),
              c('{numero}', { w: 6, a: 'c' }),
              c('{reference}', { w: 13 }),
              c('{point_verification}', { w: 28 }),
              c('{guide}', { w: 22 }),
              c('{resultat}', { w: 9, a: 'c' }),
              c('{observation}{/items}{/domaines}', { w: 18 }),
            ]}),
          ],
        }),

        new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Document confidentiel — ANACIM Sénégal — {reference_doc}', size: 12, font: 'Calibri', color: '999999', italics: true })] }),
      ],
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync('public/templates/checklist-template.docx', buf);
  console.log('✓ Template généré: public/templates/checklist-template.docx');
}

main().catch(console.error);
