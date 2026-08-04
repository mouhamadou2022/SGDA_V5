const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak,
  Header, Footer, TabStopPosition, TabStopType,
} = require('docx');
const fs = require('fs');

// ─── Constantes ──────────────────────────────────────────────────────
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const BORDER_BLUE = { style: BorderStyle.SINGLE, size: 1, color: '002060' };
const HCOLOR = '002060';
const LOGO_TEXT = { bold: true, color: HCOLOR, font: 'Arial' };
const BODY_FONT = { font: 'Times New Roman', size: 20 };
const TITLE_FONT = { font: 'Arial', color: HCOLOR };

function hdrCell(text, opts = {}) {
  return new TableCell({
    shading: { type: ShadingType.CLEAR, color: 'D9E2F3' },
    verticalAlign: 'center',
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text, bold: true, size: 18, font: 'Arial', ...opts })],
    })],
  });
}

function rCell(text, opts = {}) {
  return new TableCell({
    verticalAlign: 'center',
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: String(text ?? ''), size: 18, font: 'Arial', ...opts })],
    })],
  });
}

function lCell(text, opts = {}) {
  return new TableCell({
    verticalAlign: 'center',
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 40, after: 40 },
      children: [new TextRun({ text: String(text ?? ''), size: 18, font: 'Arial', ...opts })],
    })],
  });
}

function sectionTitle(num, title) {
  return new Paragraph({
    spacing: { before: 300, after: 200 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 24, color: HCOLOR },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: HCOLOR },
    },
    shading: { type: ShadingType.CLEAR, color: 'D9E2F3' },
    children: [new TextRun({ text: `${num}. ${title}`, bold: true, size: 22, color: HCOLOR, font: 'Arial' })],
  });
}

function subSectionTitle(num, title) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text: `${num} ${title}`, bold: true, size: 20, color: HCOLOR, font: 'Arial' })],
  });
}

function bodyText(placeholder) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: placeholder, ...BODY_FONT })],
  });
}

// ─── Page de garde ────────────────────────────────────────────────────
const cover = [
  new Paragraph({ spacing: { before: 2000 }, children: [] }),
  new Paragraph({
    spacing: { after: 100 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'République du Sénégal', bold: true, size: 28, font: 'Times New Roman' })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Un Peuple \u2013 Un But \u2013 Une Foi', italics: true, size: 22, font: 'Times New Roman' })],
  }),
  new Paragraph({
    spacing: { before: 400, after: 100 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'MINISTERE DES TRANSPORTS TERRESTRES ET AERIENS', bold: true, size: 20, font: 'Times New Roman' })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA METEOROLOGIE", bold: true, color: HCOLOR, size: 20, font: 'Times New Roman' })],
  }),
  new Paragraph({
    spacing: { after: 300 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'DIRECTION DE LA NAVIGATION AERIENNE ET DES AERODROMES', bold: true, size: 20, font: 'Times New Roman' })],
  }),
  new Paragraph({ spacing: { before: 200, after: 100 }, border: { bottom: BORDER }, children: [] }),

  // Titre
  new Paragraph({
    spacing: { before: 600, after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Rapport de surveillance continue', bold: true, size: 28, color: HCOLOR, font: 'Times New Roman' })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '{aerodrome_nom} ({aerodrome_code})', bold: true, size: 24, font: 'Times New Roman' })],
  }),
  new Paragraph({
    spacing: { after: 400 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'du {date_debut} au {date_fin}', size: 22, font: 'Times New Roman' })],
  }),

  // Informations
  new Paragraph({ spacing: { before: 400 }, border: { top: BORDER }, children: [] }),
  new Paragraph({
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({ text: 'Référence : ', bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: '{reference}', size: 20, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: 'Type de surveillance : ', bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: '{type_surveillance}', size: 20, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: 'Date inspection : ', bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: 'du {date_debut} au {date_fin}', size: 20, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: "Chef d'équipe : ", bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: '{chef_equipe}', size: 20, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: "Équipe d'inspection : ", bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: '{equipe_inspecteurs}', size: 20, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: 'Portée : ', bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: '{portee_inspection}', size: 20, font: 'Arial' }),
    ],
  }),
  new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: 'Niveau de risque : ', bold: true, size: 20, font: 'Arial' }),
      new TextRun({ text: '{niveau_risque}', size: 20, font: 'Arial' }),
    ],
  }),
];

// ─── En-tête et pied de page ─────────────────────────────────────────
const headerTable = new Table({
  rows: [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: 'ANACIM / DNA', bold: true, size: 16, color: HCOLOR, font: 'Arial' })] })],
        }),
        new TableCell({
          width: { size: 9000, type: WidthType.DXA },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Rapport de surveillance {aerodrome_code} - {reference}', italics: true, size: 16, color: HCOLOR, font: 'Arial' })],
          })],
        }),
      ],
    }),
  ],
});

const headerComponent = new Header({
  children: [
    new Paragraph({ spacing: { after: 40 }, border: { bottom: BORDER_BLUE }, children: [] }),
    headerTable,
  ],
});

const footerComponent = new Footer({
  children: [
    new Paragraph({
      border: { top: BORDER_BLUE },
      alignment: AlignmentType.CENTER,
      spacing: { before: 40 },
      children: [
        new TextRun({ text: 'ANACIM — Document confidentiel — Page ', size: 16, color: '666666', font: 'Arial' }),
        new TextRun({ children: [], text: '' }),
      ],
    }),
  ],
});

// ─── Table des matières ──────────────────────────────────────────────
const tocSection = [
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({
    spacing: { before: 200, after: 400 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'TABLE DES MATIÈRES', bold: true, size: 24, color: HCOLOR, font: 'Arial' })],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: '{toc}', size: 20, font: 'Times New Roman' })],
  }),
];

// ─── Section 1: Résumé exécutif ──────────────────────────────────────
const sResume = [
  new Paragraph({ children: [new PageBreak()] }),
  sectionTitle('1', 'Résumé exécutif'),
  bodyText('{resume_executif}'),
];

// ─── Section 2: Introduction ─────────────────────────────────────────
const sIntro = [
  sectionTitle('2', 'Introduction et vue d\'ensemble'),
  subSectionTitle('2.1', 'Contexte'),
  bodyText('{contexte}'),
  subSectionTitle('2.2', 'Objectifs de la mission'),
  bodyText('{objectifs}'),
  subSectionTitle('2.3', 'Équipe d\'inspection'),

  // Tableau équipe
  new Paragraph({
    spacing: { before: 100, after: 100 },
    children: [new TextRun({ text: 'Équipe d\'inspecteurs', bold: true, size: 18, color: HCOLOR, font: 'Arial' })],
  }),
  new Table({
    columnWidths: [4000, 5000, 3000],
    rows: [
      new TableRow({
        children: [
          hdrCell('Nom & Prénom(s)'),
          hdrCell('Fonction / Spécialité'),
          hdrCell('Rôle'),
        ],
      }),
      // Ligne avec loop pour les membres de l'équipe
      new TableRow({
        children: [
          lCell('{#equipe_membres}{nom_membre}{/equipe_membres}'),
          lCell('{fonction_membre}'),
          lCell('{role_membre}'),
        ],
      }),
    ],
  }),
];

// ─── Section 3: Information générale ─────────────────────────────────
const sInfo = [
  sectionTitle('3', 'Information générale sur l\'aéroport'),

  // Infos aéroport en tableau 2 colonnes
  new Table({
    columnWidths: [5000, 7000],
    rows: [
      new TableRow({ children: [lCell('Nom', { bold: true }), lCell('{aerodrome_nom}')] }),
      new TableRow({ children: [lCell('Code OACI', { bold: true }), lCell('{aerodrome_code}')] }),
      new TableRow({ children: [lCell('Type', { bold: true }), lCell('{aerodrome_type}')] }),
      new TableRow({ children: [lCell('Catégorie SSLIA', { bold: true }), lCell('{aerodrome_categorie_sslia}')] }),
      new TableRow({ children: [lCell('Région', { bold: true }), lCell('{aerodrome_region}')] }),
      new TableRow({ children: [lCell('Exploitant', { bold: true }), lCell('{aerodrome_exploitant}')] }),
    ],
  }),
  new Paragraph({ spacing: { after: 200 }, children: [] }),
  bodyText('{information_generale}'),
];

// ─── Section 4: Portée ───────────────────────────────────────────────
const sPortee = [
  sectionTitle('4', 'Portée de l\'inspection'),
  bodyText('{portee_inspection}'),
];

// ─── Section 5: Méthodologie ─────────────────────────────────────────
const sMethodo = [
  sectionTitle('5', 'Méthodologie de l\'inspection'),
  bodyText('{methodologie}'),
];

// ─── Section 6: Référentiel ──────────────────────────────────────────
const sReferentiel = [
  sectionTitle('6', 'Référentiel d\'évaluation'),
  bodyText('{referentiel_evaluation}'),
];

// ─── Section 7: Déroulement ──────────────────────────────────────────
const sDeroulement = [
  sectionTitle('7', 'Déroulement de la mission'),
  subSectionTitle('7.1', 'Préparation'),
  bodyText('{deroulement_preparation}'),
  subSectionTitle('7.2', 'Réunion d\'ouverture'),
  bodyText('{deroulement_reunion_ouverture}'),
  subSectionTitle('7.3', 'Vérification sur site'),
  bodyText('{deroulement_visite_site}'),
  subSectionTitle('7.4', 'Réunion de clôture'),
  bodyText('{deroulement_reunion_cloture}'),
];

// ─── Section 8: Résultats ────────────────────────────────────────────
// Tableau 3: Synthèse PAC
function syntheseTable(label, prefix) {
  return new Table({
    columnWidths: [3000, 3000, 3000, 3000, 3000],
    rows: [
      new TableRow({
        children: [
          hdrCell(''),
          hdrCell('PAC\nexaminés'),
          hdrCell('PAC\nen cours'),
          hdrCell('PAC\nréalisés'),
          hdrCell('PAC\nnon réalisés'),
        ],
      }),
      new TableRow({
        children: [
          lCell(label, { bold: true }),
          rCell(`{${prefix}_examines}`),
          rCell(`{${prefix}_en_cours}`),
          rCell(`{${prefix}_realises}`),
          rCell(`{${prefix}_non_realises}`),
        ],
      }),
    ],
  });
}

// Tableau 4: Évolution
const evolutionTable = new Table({
  columnWidths: [4000, 3000, 3000, 3000],
  rows: [
    new TableRow({
      children: [
        hdrCell('Date et type d\'inspection'),
        hdrCell('Nb PAC ouverts'),
        hdrCell('Nb PAC fermés'),
        hdrCell('Taux'),
      ],
    }),
    new TableRow({
      children: [
        lCell('{#evolution_pac}{date_evol}{/evolution_pac}'),
        rCell('{ouverts_evol}'),
        rCell('{fermes_evol}'),
        rCell('{taux_evol}'),
      ],
    }),
  ],
});

// Tableau 5: État détaillé PAC certification initiale
const pacDetHeader = [
  new TableRow({
    children: [
      hdrCell('Référence'),
      hdrCell('État initial'),
      hdrCell('État précédent'),
      hdrCell('État actuel'),
      hdrCell('% mise en œuvre'),
      hdrCell('Statut'),
    ],
  }),
];

function pacDetRow(isLoop, prefix) {
  const first = isLoop
    ? lCell(`{#${prefix}_details}{ref_pac}`)
    : lCell('{ref_pac}');
  const last = isLoop
    ? rCell('{statut_pac}{/' + prefix + '_details}')
    : rCell('{statut_pac}');
  return new TableRow({
    children: [
      first,
      rCell('{etat_initial_pac}'),
      rCell('{etat_precedent_pac}'),
      rCell('{etat_actuel_pac}'),
      rCell('{progression_pac}'),
      last,
    ],
  });
}

const pacDetInitialTable = new Table({
  columnWidths: [3000, 2000, 2000, 2000, 2000, 2000],
  rows: [...pacDetHeader, pacDetRow(true, 'pac_initialisation')],
});

// Tableau 6: Synthèse PAC SC
const pacScTable = new Table({
  columnWidths: [3000, 3000, 3000, 3000, 3000],
  rows: [
    new TableRow({
      children: [
        hdrCell(''),
        hdrCell('PAC SC\nexaminés'),
        hdrCell('PAC SC\nen cours'),
        hdrCell('PAC SC\nréalisés'),
        hdrCell('PAC SC\nnon réalisés'),
      ],
    }),
    new TableRow({
      children: [
        lCell('Surveillance continue', { bold: true }),
        rCell('{pac_sc_examines}'),
        rCell('{pac_sc_en_cours}'),
        rCell('{pac_sc_realises}'),
        rCell('{pac_sc_non_realises}'),
      ],
    }),
  ],
});

// Tableau 7: Écarts critiques
const ecartsTable = new Table({
  columnWidths: [1000, 2000, 5000, 2000, 2000],
  rows: [
    new TableRow({
      children: [
        hdrCell('N°'),
        hdrCell('Domaine'),
        hdrCell('Constatation'),
        hdrCell('Criticité'),
        hdrCell('Délai'),
      ],
    }),
    new TableRow({
      children: [
        rCell('{#ecarts_critiques}{num_ecart}{/ecarts_critiques}'),
        rCell('{domaine_ecart}'),
        lCell('{constat_ecart}'),
        rCell('{criticite_ecart}'),
        rCell('{delai_ecart}'),
      ],
    }),
  ],
});

// Tableau 8: Détail PAC SC
const pacScDetTable = new Table({
  columnWidths: [4000, 3000, 4000],
  rows: [
    new TableRow({
      children: [
        hdrCell('Référence'),
        hdrCell('Taux mise en œuvre'),
        hdrCell('État'),
      ],
    }),
    new TableRow({
      children: [
        lCell('{#pac_sc_details}{ref_pac_sc}{/pac_sc_details}'),
        rCell('{taux_pac_sc}'),
        lCell('{etat_pac_sc}'),
      ],
    }),
  ],
});

const sResultats = [
  new Paragraph({ children: [new PageBreak()] }),
  sectionTitle('8', 'Résultats de l\'inspection'),
  bodyText('{resultats_inspection}'),

  // 8.1 Score de risque
  subSectionTitle('8.1', 'Profil de risque de l\'aéroport'),
  bodyText('{profil_risque_analyse}'),

  // 8.2 Synthèse PAC certification initiale
  subSectionTitle('8.2', 'PAC issus de la certification initiale'),
  syntheseTable('Certification initiale', 'pac'),
  new Paragraph({ spacing: { after: 200 }, children: [] }),

  // 8.3 Évolution
  subSectionTitle('8.3', 'Évolution du taux de mise en œuvre'),
  evolutionTable,
  new Paragraph({ spacing: { after: 200 }, children: [] }),

  // 8.4 Détail PAC certification initiale
  subSectionTitle('8.4', 'État détaillé des PAC — Certification initiale'),
  pacDetInitialTable,
  new Paragraph({ spacing: { after: 200 }, children: [] }),

  // 8.5 PAC surveillance continue
  subSectionTitle('8.5', 'PAC issus de la surveillance continue'),
  pacScTable,
  new Paragraph({ spacing: { after: 200 }, children: [] }),

  // 8.6 Écarts critiques
  subSectionTitle('8.6', 'Écarts critiques et élevés'),
  bodyText('{nb_ecarts} écart(s) constaté(s) lors de cette inspection.'),
  ecartsTable,
  new Paragraph({ spacing: { after: 200 }, children: [] }),

  // 8.7 Détail PAC SC
  subSectionTitle('8.7', 'État détaillé des PAC — Surveillance continue'),
  pacScDetTable,
  new Paragraph({ spacing: { after: 200 }, children: [] }),

  // 8.8 Suivi NAS
  subSectionTitle('8.8', 'Suivi du niveau acceptable de sécurité (NAS)'),
  bodyText('{nas_analyse}'),
];

// ─── Section 9: Rencontre exploitant ─────────────────────────────────
const sRencontre = [
  sectionTitle('9', 'Rencontre avec l\'exploitant'),
  bodyText('{rencontre_exploitant}'),
];

// ─── Section 10: Recommandations ─────────────────────────────────────
const sRecommandations = [
  sectionTitle('10', 'Recommandations et conclusions'),
  bodyText('{recommandations_conclusions}'),
];

// ─── Signature ────────────────────────────────────────────────────────
const sSignature = [
  new Paragraph({ spacing: { before: 600 }, children: [] }),
  new Paragraph({
    spacing: { after: 80 },
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: 'Fait à Dakar, le {date_signature}', italics: true, size: 20, color: HCOLOR, font: 'Arial' })],
  }),
  new Paragraph({
    spacing: { before: 400 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "Pour l'équipe d'inspection,", size: 20, color: HCOLOR, font: 'Arial' })],
  }),
  new Paragraph({
    spacing: { before: 100 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "L'Inspecteur titulaire et Chef de mission", size: 20, color: HCOLOR, font: 'Arial' })],
  }),
  new Paragraph({
    spacing: { before: 400 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '{chef_equipe}', bold: true, size: 22, underline: { type: 'single' }, color: HCOLOR, font: 'Arial' })],
  }),
];

// ─── Annexe ───────────────────────────────────────────────────────────
const sAnnexe = [
  new Paragraph({ children: [new PageBreak()] }),
  sectionTitle('Annexe A-1', 'Fiche de constatations'),
  bodyText('{annexe_fiche_constatations}'),
];

// ─── Assemblage ──────────────────────────────────────────────────────
const children = [
  ...cover,
  ...tocSection,
  ...sResume,
  ...sIntro,
  ...sInfo,
  ...sPortee,
  ...sMethodo,
  ...sReferentiel,
  ...sDeroulement,
  ...sResultats,
  ...sRencontre,
  ...sRecommandations,
  ...sSignature,
  ...sAnnexe,
];

const doc = new Document({
  sections: [{
    properties: {
      page: {
        margin: { top: 1440, right: 1440, bottom: 1080, left: 1440 },
      },
    },
    headers: { default: headerComponent },
    footers: { default: footerComponent },
    children,
  }],
  styles: {
    default: {
      document: { run: { font: 'Times New Roman', size: 20 } },
    },
  },
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = 'public/templates/rapport-template.docx';
  fs.writeFileSync(outPath, buffer);
  console.log('Template generated: ' + outPath + ' (' + (buffer.length / 1024).toFixed(1) + ' KB)');
});
