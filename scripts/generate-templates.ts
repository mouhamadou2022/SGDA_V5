/**
 * Génère les templates .docx avec placeholders {tag}.
 * À exécuter une fois : npx ts-node scripts/generate-templates.ts
 * Les templates sont stockés dans public/templates/ et servent de base
 * pour Docxtemplater.
 * 
 * Pour modifier un template : ouvrir le .docx dans Word, modifier le
 * formatage, et ré-enregistrer. Les {placeholders} doivent rester intacts.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, ShadingType, BorderStyle, HeadingLevel,
} from 'docx';

const TEMPLATES_DIR = path.resolve(__dirname, '..', 'public', 'templates');

function cell(text: string, opts?: { bold?: boolean; shading?: string; align?: 'left' | 'center' | 'right'; width?: number }) {
  const borders = { top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }, bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }, left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }, right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } };
  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts?.shading ? { type: ShadingType.SOLID, color: opts.shading } : undefined,
    verticalAlign: 'center',
    borders,
    children: [new Paragraph({
      alignment: opts?.align === 'center' ? AlignmentType.CENTER : opts?.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { before: 30, after: 30 },
      children: [new TextRun({ text: text || '', size: 18, bold: opts?.bold, font: 'Calibri' })],
    })],
  });
}

async function generateChecklistTemplate(): Promise<void> {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('#', { bold: true, shading: '1E4073', align: 'center', width: 4 }),
      cell('N°', { bold: true, shading: '1E4073', align: 'center', width: 6 }),
      cell('Réf. Régl.', { bold: true, shading: '1E4073', align: 'center', width: 12 }),
      cell('Point à vérifier', { bold: true, shading: '1E4073', width: 28 }),
      cell("Guide d'évaluation", { bold: true, shading: '1E4073', width: 22 }),
      cell('État', { bold: true, shading: '1E4073', align: 'center', width: 10 }),
      cell('Observation', { bold: true, shading: '1E4073', width: 18 }),
    ],
  });

  const dataRow = new TableRow({
    children: [
      cell('{#items}{index}', { align: 'center', width: 4 }),
      cell('{numero}', { align: 'center', width: 6 }),
      cell('{reference}', { width: 12 }),
      cell('{point_verification}', { width: 28 }),
      cell('{guide}', { width: 22 }),
      cell('{resultat}', { align: 'center', width: 10 }),
      cell('{observation}', { width: 18 }),
    ],
  });

  const doc = new Document({
    title: '{titre}',
    description: 'Checklist générée',
    sections: [{
      properties: {
        page: {
          margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 },
        },
      },
      children: [
        // En-tête
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: 'RÉPUBLIQUE DU SÉNÉGAL', size: 16, bold: true, font: 'Calibri', color: '1E4073' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [new TextRun({ text: 'ANACIM — Agence Nationale de l\'Aviation Civile et de la Météorologie', size: 16, bold: true, font: 'Calibri', color: '1E4073' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: '{titre}', size: 24, bold: true, font: 'Calibri', color: '1E4073' })],
        }),

        // Infos
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: 'Code : {code}  |  Version : {version}  |  Date : {date}', size: 16, font: 'Calibri', color: '666666' })],
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: 'Portée : {portee}', size: 16, font: 'Calibri', color: '666666' })],
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: 'Aérodrome : {aerodrome}', size: 16, font: 'Calibri', color: '666666' })],
        }),
        new Paragraph({
          spacing: { after: 100 },
          children: [new TextRun({ text: 'Inspecteur(s) : {inspecteurs}', size: 16, font: 'Calibri', color: '666666' })],
        }),

        // Séparateur
        new Paragraph({
          spacing: { after: 200 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1E4073' } },
          children: [],
        }),

        // Titre domaine
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [new TextRun({ text: '{domaine}', size: 20, bold: true, font: 'Calibri', color: '1E4073' })],
        }),

        // Tableau des items
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [headerRow, dataRow],
        }),

        // Note de fin
        new Paragraph({
          spacing: { before: 400 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'Document confidentiel — ANACIM Sénégal', size: 14, font: 'Calibri', color: '999999', italics: true })],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(TEMPLATES_DIR, 'checklist-template.docx');
  if (!fs.existsSync(TEMPLATES_DIR)) fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ Template checklist créé : ${outPath}`);
}

async function main() {
  await generateChecklistTemplate();
  console.log('✓ Tous les templates générés');
}

main().catch(console.error);
