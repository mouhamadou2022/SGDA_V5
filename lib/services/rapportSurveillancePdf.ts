// lib/services/rapportSurveillancePdf.ts
// Builder PDF NATIF partagé du rapport de surveillance (style ANACIM).
// Source unique de vérité utilisée par :
//  - SurveillanceRapport.handleExportPDF (téléchargement côté inspecteur)
//  - dossierTransmission.ts (publication du rapport signé vers le portail exploitant)
// Reprend exactement la structure du rapport : couverture, sommaire, 11 sections.

'use client';

export interface RapportSurveillanceData {
  surveillance: any;
  aerodrome?: any;
  profil?: any;
  /** checklistItems[surveillanceId] */
  items: any[];
  /** écarts liés à la surveillance */
  ecarts: any[];
  utilisateurs: any[];
  sections?: any;
  pageGardeFields?: Record<string, string>;
  dgNom?: string;
  reference: string;
}

const DEFAUT_SECTIONS = {
  resume: '',
  introduction: '',
  methodologie: '',
  equipe: '',
  deroulement: { preparation: '', reunionOuverture: '', verificationSite: '', reunionCloture: '' },
  preoccupations: '',
  recommandations: '',
  conclusion: '',
  resultsIntro: '',
  resultsAnalysis: '',
};

export async function batirRapportSurveillancePdf(data: RapportSurveillanceData): Promise<Blob> {
  const { surveillance, aerodrome, profil, items, ecarts, utilisateurs, dgNom, reference } = data;
  const sections = { ...DEFAUT_SECTIONS, ...(data.sections || {}), deroulement: { ...DEFAUT_SECTIONS.deroulement, ...(data.sections?.deroulement || {}) } };
  const pageGardeFields = data.pageGardeFields || {};

  const { creerRapportPdf, PDF_COLORS } = await import('@/lib/services/pdfRapport');
  const pdf = await creerRapportPdf();

  const dateDebut = surveillance?.date_debut ? new Date(surveillance.date_debut).toLocaleDateString('fr-FR') : 'N/A';
  const dateFin = surveillance?.date_fin ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR') : 'N/A';
  const scoreColor = (s: number) => (s >= 60 ? PDF_COLORS.green : s >= 40 ? PDF_COLORS.amber : PDF_COLORS.red);
  const niveauColor = (n: string) => (n === 'critique' ? PDF_COLORS.red : n === 'eleve' ? PDF_COLORS.amber : PDF_COLORS.blue);
  const fmt = (v: number | null | undefined): string => (v === null || v === undefined ? 'N/A' : String(v));

  const checklistStats = (() => {
    const total = items.length;
    const sa = items.filter(i => i.resultat === 'SA').length;
    const ns = items.filter(i => i.resultat === 'NS').length;
    const nv = items.filter(i => i.resultat === 'NV' || !i.resultat).length;
    const na = items.filter(i => i.resultat === 'NA').length;
    const taux = (sa + ns) > 0 ? Math.round((sa / (sa + ns)) * 100) : 0;
    return { total, sa, ns, nv, na, taux };
  })();

  // ── Page de garde ──────────────────────────────────────
  pdf.coverPage({
    titre: pageGardeFields.titreLigne1 || 'Rapport de surveillance',
    sousTitre: pageGardeFields.titreLigne2 || `Aéroport de ${aerodrome?.nom || ''} (${aerodrome?.code_oaci || ''})`,
    ref: reference,
    meta: [
      ['Ministère', pageGardeFields.ministere || 'MINISTÈRE DES TRANSPORTS TERRESTRES ET AÉRIENS'],
      ['Direction', pageGardeFields.direction || 'DIRECTION DE LA NAVIGATION AÉRIENNE ET DES AÉRODROMES'],
      ['Date de l\'inspection', pageGardeFields.dateInspection || `du ${dateDebut} au ${dateFin}`],
      ['Référentiel', pageGardeFields.referentiel || reference],
      ['Mandataire', dgNom || 'Directeur général ANACIM'],
    ],
  });
  pdf.addPage();

  // ── Sommaire ───────────────────────────────────────────
  pdf.sectionTitle('SOMMAIRE');
  pdf.bulletList([
    '1. Résumé exécutif',
    '2. Introduction et contexte',
    '3. Méthodologie',
    '4. Équipe d\'inspection',
    '5. Déroulement de la surveillance',
    '6. Résultats de l\'inspection',
    '7. Préoccupations de sécurité',
    '8. Non-conformités identifiées',
    '9. Recommandations',
    '10. Conclusion',
    '11. Annexes',
  ]);
  pdf.addPage();

  // ── 1. Résumé exécutif ─────────────────────────────────
  pdf.sectionTitle('1. RÉSUMÉ EXÉCUTIF');
  pdf.paragraphsFromHtml(sections.resume || 'À compléter...');

  // ── 2. Introduction et contexte ────────────────────────
  pdf.sectionTitle('2. INTRODUCTION ET CONTEXTE');
  pdf.paragraphsFromHtml(sections.introduction || 'À compléter...');

  // ── 3. Méthodologie ─────────────────────────────────────
  pdf.sectionTitle('3. MÉTHODOLOGIE');
  pdf.paragraphsFromHtml(sections.methodologie || 'À compléter...');

  // ── 4. Équipe d'inspection ──────────────────────────────
  pdf.sectionTitle('4. ÉQUIPE D\'INSPECTION');
  const membres = utilisateurs.filter(u => surveillance?.equipe_ids?.includes(u.id));
  if (membres.length === 0) {
    pdf.paragraph('Aucune équipe assignée.', 9.5);
  } else {
    pdf.table({
      head: [['Nom', 'Fonction', 'Rôle']],
      body: membres.map(u => [
        `${u.prenom || ''} ${u.nom || ''}`,
        Array.isArray(u.specialites) ? u.specialites.join(', ') : (u.specialites || u.service || '-'),
        (u.role === 'chef_equipe' || u.id === surveillance?.chef_id) ? 'Chef d\'équipe' : 'Inspecteur',
      ]),
      columnStyles: {
        0: { cellWidth: 62 },
        1: { cellWidth: 64 },
        2: { cellWidth: 40, halign: 'center' },
      },
      fontSize: 8.5,
    });
  }

  // ── 5. Déroulement de la surveillance ───────────────────
  pdf.sectionTitle('5. DÉROULEMENT DE LA SURVEILLANCE');
  const derouleItems: Array<[string, string]> = [
    ['5.1 Préparation', sections.deroulement.preparation],
    ['5.2 Réunion d\'ouverture', sections.deroulement.reunionOuverture],
    ['5.3 Vérification sur site', sections.deroulement.verificationSite],
    ['5.4 Réunion de clôture', sections.deroulement.reunionCloture],
  ];
  for (const [titre, contenu] of derouleItems) {
    if (contenu) {
      pdf.subHeading(titre);
      pdf.paragraphsFromHtml(contenu);
    }
  }
  if (!derouleItems.some(([, c]) => c)) {
    pdf.paragraph('À compléter...', 9.5);
  }

  // ── 6. Résultats de l'inspection ────────────────────────
  pdf.sectionTitle('6. RÉSULTATS DE L\'INSPECTION');
  pdf.subHeading('6.1 Score de risque');
  const scoreGlobal = profil?.score_global ?? null;
  pdf.paragraph(`Score global : ${fmt(scoreGlobal)}/100 (tendance : ${profil?.tendance || 'stable'})`, 10);
  pdf.kvTable([
    ['C1 — Maturité SGS', `${fmt(profil?.c1)}/100`],
    ['C2 — Efficacité PAC', `${fmt(profil?.c2)}/100`],
    ['C3 — Conformité', `${fmt(profil?.c3)}/100`],
    ['C4 — Charge critique', `${fmt(profil?.c4)}/100`],
    ['C5 — Résilience', `${fmt(profil?.c5)}/100`],
  ]);

  pdf.subHeading('6.2 Taux de conformité');
  pdf.kpiBoxes([
    { value: String(checklistStats.sa), label: 'Satisfaisant (SA)', color: PDF_COLORS.green },
    { value: String(checklistStats.ns), label: 'Non satisfaisant (NS)', color: PDF_COLORS.red },
    { value: String(checklistStats.nv), label: 'Non vérifié (NV)', color: PDF_COLORS.amber },
    { value: `${checklistStats.taux}%`, label: 'Taux de conformité', color: scoreColor(checklistStats.taux) },
  ]);
  pdf.paragraph('Taux de conformité réel (NV = NS) : ' + String(checklistStats.taux) + '%');
  const critCount = ecarts.filter(e => e.niveau_risque === 'critique').length;
  if (critCount > 0) {
    pdf.infoBox(`${critCount} écart(s) critique(s) nécessitent une action immédiate.`, { title: '⚠ Attention', tone: 'red' });
  }

  pdf.subHeading('6.3 Détail par domaine');
  const byDomaine: Record<string, { sa: number; ns: number; nv: number }> = {};
  items.forEach(item => {
    if (!byDomaine[item.domaine]) byDomaine[item.domaine] = { sa: 0, ns: 0, nv: 0 };
    if (item.resultat === 'SA') byDomaine[item.domaine].sa++;
    else if (item.resultat === 'NS') byDomaine[item.domaine].ns++;
    else if (item.resultat === 'NV' || !item.resultat) byDomaine[item.domaine].nv++;
  });
  const domaineRows = Object.entries(byDomaine).map(([domaine, st]) => {
    const dTotal = st.sa + st.ns + st.nv;
    const dTaux = dTotal > 0 ? Math.round((st.sa / dTotal) * 100) : 0;
    return [domaine, String(st.sa), String(st.ns), String(st.nv), `${dTaux}%`];
  });
  if (domaineRows.length === 0) {
    pdf.paragraph('Aucun domaine évalué.', 9.5);
  } else {
    pdf.table({
      head: [['Domaine', 'SA', 'NS', 'NV', 'Taux']],
      body: domaineRows,
      columnStyles: {
        0: { cellWidth: 106 },
        1: { cellWidth: 15, halign: 'center' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 15, halign: 'center' },
      },
      didParseCell: (d: any) => {
        if (d.section === 'body' && d.column.index === 4) {
          const val = Number(String(d.cell.raw).replace('%', ''));
          d.cell.styles.textColor = scoreColor(val);
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ── 7. Préoccupations de sécurité ───────────────────────
  pdf.sectionTitle('7. PRÉOCCUPATIONS DE SÉCURITÉ');
  pdf.paragraphsFromHtml(sections.preoccupations || 'Aucune préoccupation majeure identifiée.');

  // ── 8. Non-conformités identifiées ──────────────────────
  pdf.sectionTitle('8. NON-CONFORMITÉS IDENTIFIÉES');
  if (ecarts.length === 0) {
    pdf.paragraph('Aucun écart constaté.', 9.5);
  } else {
    pdf.table({
      head: [['Référence', 'Libellé', 'Niveau', 'Statut']],
      body: ecarts.map(e => [e.reference, e.libelle, e.niveau_risque, e.statut]),
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 94 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
      },
      didParseCell: (d: any) => {
        if (d.section === 'body' && d.column.index === 2) {
          d.cell.styles.textColor = niveauColor(String(d.cell.raw));
          d.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ── 9. Recommandations ──────────────────────────────────
  pdf.sectionTitle('9. RECOMMANDATIONS');
  pdf.paragraphsFromHtml(sections.recommandations || 'À compléter...');

  // ── 10. Conclusion ──────────────────────────────────────
  pdf.sectionTitle('10. CONCLUSION');
  pdf.paragraphsFromHtml(sections.conclusion || 'À compléter...');

  // ── 11. Annexes ─────────────────────────────────────────
  pdf.sectionTitle('11. ANNEXES');
  pdf.paragraph('Les annexes détaillées sont disponibles dans le dossier de surveillance.', 9.5, { italic: true });
  if (ecarts.length > 0) {
    pdf.subHeading(`Écarts constatés (${ecarts.length})`);
    pdf.table({
      head: [['Référence', 'Libellé', 'Niveau', 'Statut']],
      body: ecarts.map(e => [e.reference, e.libelle, e.niveau_risque, e.statut]),
      columnStyles: {
        0: { cellWidth: 32 },
        1: { cellWidth: 94 },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
      },
    });
  }

  pdf.drawFooter(`ANACIM — Rapport de surveillance — ${aerodrome?.code_oaci || 'rapport'}`);
  return pdf.blob();
}
