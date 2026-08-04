const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak,
  Header, Footer,
} = require('docx');
const fs = require('fs');

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const BORDER_BLUE = { style: BorderStyle.SINGLE, size: 1, color: '002060' };
const HCOLOR = '002060';

function hdrCell(text) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, color: 'D9E2F3' },
    verticalAlign: 'center',
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text, bold: true, size: 18, font: 'Arial' })],
    })],
  });
}

function rCell(text) {
  return new TableCell({
    verticalAlign: 'center',
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: String(text ?? ''), size: 18, font: 'Arial' })],
    })],
  });
}

function lCell(text) {
  return new TableCell({
    verticalAlign: 'center',
    children: [new Paragraph({
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: String(text ?? ''), size: 18, font: 'Arial' })],
    })],
  });
}

function sectionTitle(num, title) {
  return new Paragraph({
    spacing: { before: 300, after: 200 },
    border: { left: { style: BorderStyle.SINGLE, size: 24, color: HCOLOR }, bottom: { style: BorderStyle.SINGLE, size: 4, color: HCOLOR } },
    shading: { type: ShadingType.CLEAR, color: 'D9E2F3' },
    children: [new TextRun({ text: `${num}. ${title}`, bold: true, size: 22, color: HCOLOR, font: 'Arial' })],
  });
}

function bodyText(text) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text, font: 'Times New Roman', size: 20 })],
  });
}

// ─── Page de garde annexes ─────────────────────────────────────
const cover = [
  new Paragraph({ spacing: { before: 3000 }, children: [] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: 'ANNEXES AU RAPPORT DE SURVEILLANCE', bold: true, size: 28, color: HCOLOR, font: 'Times New Roman' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: '{aerodrome_nom} ({aerodrome_code})', bold: true, size: 22, font: 'Times New Roman' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: 'Réf: {reference}', size: 20, font: 'Times New Roman' })],
  }),
  new Paragraph({ spacing: { before: 200, after: 100 }, border: { bottom: BORDER }, children: [] }),
];

// ─── A-1: Fiches de présence ──────────────────────────────────
const a1 = [
  new Paragraph({ children: [new PageBreak()] }),
  sectionTitle('Annexe A-1', 'Fiches de présence'),
  bodyText('Liste des participants aux réunions de la surveillance du {date_debut} au {date_fin}.'),
  new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: 'Tableau des présences', bold: true, size: 18, color: HCOLOR, font: 'Arial' })] }),
  new Table({
    columnWidths: [3000, 2000, 3000, 2000, 2000],
    rows: [
      new TableRow({ children: [hdrCell('Nom'), hdrCell('Structure'), hdrCell('Fonction'), hdrCell('Téléphone'), hdrCell('Signature')] }),
      new TableRow({ children: [lCell('{#presences}{nom_presence}{/presences}'), lCell('{structure_presence}'), lCell('{fonction_presence}'), lCell('{tel_presence}'), lCell('{signature_presence}')] }),
    ],
  }),
];

// ─── A-2: Écarts constatés ────────────────────────────────────
const a2 = [
  new Paragraph({ children: [new PageBreak()] }),
  sectionTitle('Annexe A-2', 'Écarts constatés'),
  bodyText('{nb_ecarts} écart(s) constaté(s) lors de l\'inspection.'),
  new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: 'Détail des écarts', bold: true, size: 18, color: HCOLOR, font: 'Arial' })] }),
  new Table({
    columnWidths: [2000, 1500, 4500, 1500, 1500],
    rows: [
      new TableRow({ children: [hdrCell('Référence'), hdrCell('Domaine'), hdrCell('Constatation'), hdrCell('Niveau'), hdrCell('Statut')] }),
      new TableRow({ children: [lCell('{#ecarts_liste}{ref_ecart}{/ecarts_liste}'), lCell('{domaine_ecart}'), lCell('{constat_ecart}'), rCell('{niveau_ecart}'), rCell('{statut_ecart}')] }),
    ],
  }),
];

// ─── A-3: Profil de risque ────────────────────────────────────
const a3 = [
  new Paragraph({ children: [new PageBreak()] }),
  sectionTitle('Annexe A-3', 'Profil de risque'),
  bodyText('Profil de risque de l\'aérodrome {aerodrome_nom} au {date_profil}.'),
  new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: 'Indicateurs C1 - C5', bold: true, size: 18, color: HCOLOR, font: 'Arial' })] }),
  new Table({
    columnWidths: [4000, 2000, 4000],
    rows: [
      new TableRow({ children: [hdrCell('Indicateur'), hdrCell('Score'), hdrCell('Niveau')] }),
      new TableRow({ children: [lCell('C1 — Maturité SGS'), rCell('{c1_score}'), lCell('{c1_niveau}')] }),
      new TableRow({ children: [lCell('C2 — Efficacité PAC'), rCell('{c2_score}'), lCell('{c2_niveau}')] }),
      new TableRow({ children: [lCell('C3 — Conformité'), rCell('{c3_score}'), lCell('{c3_niveau}')] }),
      new TableRow({ children: [lCell('C4 — Charge critique'), rCell('{c4_score}'), lCell('{c4_niveau}')] }),
      new TableRow({ children: [lCell('C5 — Résilience'), rCell('{c5_score}'), lCell('{c5_niveau}')] }),
    ],
  }),
  bodyText('Score global: {score_global}/100 — Tendance: {tendance} — Prédiction 3 mois: {prediction_3m} — Prédiction 6 mois: {prediction_6m}.'),
  new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: 'Analyse détaillée', bold: true, size: 18, color: HCOLOR, font: 'Arial' })] }),
  bodyText('{analyse_profil}'),
];

// ─── A-4: Synthèse checklist ──────────────────────────────────
const a4 = [
  new Paragraph({ children: [new PageBreak()] }),
  sectionTitle('Annexe A-4', 'Synthèse de la checklist'),
  bodyText('Résultats par domaine de la checklist de surveillance.'),
  new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: 'Synthèse par domaine', bold: true, size: 18, color: HCOLOR, font: 'Arial' })] }),
  new Table({
    columnWidths: [3000, 2000, 2000, 2000, 2000],
    rows: [
      new TableRow({ children: [hdrCell('Domaine'), hdrCell('SA'), hdrCell('NS'), hdrCell('NV'), hdrCell('Taux')] }),
      new TableRow({ children: [lCell('{#domaines_checklist}{nom_domaine}{/domaines_checklist}'), rCell('{sa_domaine}'), rCell('{ns_domaine}'), rCell('{nv_domaine}'), rCell('{taux_domaine}')] }),
    ],
  }),
  bodyText('Taux de conformité global: {taux_global}% ({sa_total} SA / {ns_total} NS / {nv_total} NV sur {total_items} points).'),
];

// ─── Header / Footer ──────────────────────────────────────────
const headerComponent = new Header({
  children: [
    new Paragraph({
      border: { bottom: BORDER_BLUE },
      spacing: { after: 40 },
      children: [new TextRun({ text: 'ANACIM / DNA — Annexes au rapport {reference}', italics: true, size: 16, color: HCOLOR, font: 'Arial' })],
    }),
  ],
});

const footerComponent = new Footer({
  children: [
    new Paragraph({
      border: { top: BORDER_BLUE },
      alignment: AlignmentType.CENTER,
      spacing: { before: 40 },
      children: [new TextRun({ text: 'Document confidentiel — ANACIM', size: 16, color: '666666', font: 'Arial' })],
    }),
  ],
});

// ─── Assemblage ──────────────────────────────────────────────
const doc = new Document({
  sections: [{
    properties: { page: { margin: { top: 1440, right: 1440, bottom: 1080, left: 1440 } } },
    headers: { default: headerComponent },
    footers: { default: footerComponent },
    children: [...cover, ...a1, ...a2, ...a3, ...a4],
  }],
  styles: { default: { document: { run: { font: 'Times New Roman', size: 20 } } } },
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = 'public/templates/annexe-template.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('Template generated: ' + outPath + ' (' + (buffer.length / 1024).toFixed(1) + ' KB)');
});
