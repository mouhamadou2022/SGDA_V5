// lib/services/rapportWord.ts
// Génération Word (docx) des rapports institutionnels ANACIM — homologue des
// exports PDF (exportCertification, exportHomologation, ficheBriefingPDF,
// exportChecklist) : mêmes données via les collecteurs partagés, même charte
// (garde, en-tête, pied de page). Appelé par l'outil pilote
// generer_rapport_word : à la voix, sans bouton.

import { downloadBlob } from '@/lib/pdfGenerator';
import {
  collecterEtatCertification,
  syntheseDeterministeCert,
} from './exportCertification';
import {
  collecterEtatHomologation,
  syntheseDeterministeHomo,
} from './exportHomologation';
import type { FicheBriefing, DomaineChecklist, ChecklistItem } from '@/lib/store';

export type TypeRapportWord = 'briefing' | 'checklist' | 'certification' | 'homologation';

export interface SectionWord {
  titre: string;
  paragraphes?: string[];
  puces?: string[];
  tableau?: { entetes: string[]; lignes: string[][] };
}

interface DocumentWordInput {
  titre: string;
  sousTitre?: string;
  meta: [string, string][];
  sections: SectionWord[];
}

const fmtDate = (iso?: string): string =>
  iso ? new Date(iso).toLocaleDateString('fr-FR') : '—';

async function construireDocument(input: DocumentWordInput): Promise<Blob> {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Header, Footer,
    PageNumber, PageBreak, BorderStyle, WidthType, Table, TableRow, TableCell, VerticalAlign,
  } = await import('docx');

  const C_PRIMARY = '1E4073';
  const C_GRAY = '444444';
  const C_LIGHT = '888888';
  const C_DARK = '1A1A1A';
  const C_RULE = 'CBD5E1';

  const cover = (text: string, opts: { bold?: boolean; size?: number; color?: string; before?: number; after?: number; rule?: boolean } = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: opts.before ?? 0, after: opts.after ?? 0 },
      border: opts.rule
        ? { bottom: { color: C_RULE, size: 8, style: BorderStyle.SINGLE, space: 6 } }
        : undefined,
      children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 20, color: opts.color ?? C_DARK })],
    });

  const cellule = (text: string, opts: { bold?: boolean; entete?: boolean } = {}) =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      shading: opts.entete ? { fill: '1E4073' } : undefined,
      children: [new Paragraph({
        children: [new TextRun({
          text,
          bold: opts.bold ?? opts.entete,
          size: 18,
          color: opts.entete ? 'FFFFFF' : C_DARK,
        })],
      })],
    });

  const content: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];

  // ── Page de garde ──
  content.push(cover('RÉPUBLIQUE DU SÉNÉGAL', { bold: true, size: 26, color: C_PRIMARY, before: 960, after: 90 }));
  content.push(cover("MINISTÈRE DES INFRASTRUCTURES, DES TRANSPORTS TERRESTRES ET DU DÉSENCLAVEMENT", { size: 18, color: C_GRAY, after: 40 }));
  content.push(cover("AGENCE NATIONALE DE L'AVIATION CIVILE ET DE LA MÉTÉOROLOGIE (ANACIM)", { size: 20, color: C_GRAY, after: 40 }));
  content.push(cover('Direction de la Sécurité et de la Sûreté — Bureau Études & Normes des Aérodromes', { size: 18, color: C_GRAY, after: 280 }));
  content.push(cover('', { rule: true, after: 700 }));
  content.push(cover(input.titre, { bold: true, size: 44, color: C_PRIMARY, before: 480, after: 200 }));
  if (input.sousTitre) content.push(cover(input.sousTitre, { bold: true, size: 28, color: C_DARK, after: 180 }));
  content.push(cover('', { rule: true, after: 760 }));

  content.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: input.meta.map(([k, v]) => new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: `${k} :`, bold: true, size: 20, color: C_GRAY })] })],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, color: C_DARK })] })],
        }),
      ],
    })),
  }));

  // ── Sections ──
  content.push(new Paragraph({ children: [new PageBreak()] }));
  for (const section of input.sections) {
    content.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 160 },
      children: [new TextRun({ text: section.titre.toUpperCase(), bold: true, size: 26, color: C_PRIMARY })],
    }));
    for (const p of section.paragraphes || []) {
      for (const block of String(p).split(/\r?\n+/).map(s => s.trim()).filter(Boolean)) {
        content.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 120 },
          children: [new TextRun({ text: block, size: 20, color: C_DARK })],
        }));
      }
    }
    for (const puce of section.puces || []) {
      content.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60 },
        children: [new TextRun({ text: puce, size: 20, color: C_DARK })],
      }));
    }
    if (section.tableau && section.tableau.lignes.length > 0) {
      const { entetes, lignes } = section.tableau;
      content.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: entetes.map(h => cellule(h, { entete: true })) }),
          ...lignes.map(ligne => new TableRow({
            children: ligne.map((v, i) => cellule(i < entetes.length ? v : '')),
          })),
        ],
      }));
    }
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 20 } } } },
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
  });

  return Packer.toBlob(doc);
}

const LIBELLE_RESULTAT: Record<string, string> = {
  SA: 'Satisfaisant',
  NS: 'Non satisfaisant',
  NV: 'Non vérifié',
  NA: 'Non applicable',
};

/** Certification nationale → Word (mêmes données que le PDF). */
export async function genererRapportWordCertification(): Promise<{ fichier: string }> {
  const d = collecterEtatCertification();
  const blob = await construireDocument({
    titre: 'RAPPORT NATIONAL DE CERTIFICATION',
    sousTitre: 'Aérodromes internationaux — Annexe 14 OACI',
    meta: [
      ['Établi le', d.date],
      ['Parc suivi', `${d.totalAerodromes} aérodrome(s) : ${d.certifies} certifié(s), ${d.enCours} en cours, ${d.suspendus} suspendu(s), ${d.expires} expiré(s)`],
      ['Confidentialité', "Document confidentiel — diffusion autorisée dans le circuit d'instruction"],
    ],
    sections: [
      { titre: 'Synthèse', paragraphes: [syntheseDeterministeCert(d)] },
      {
        titre: 'État par aérodrome',
        tableau: {
          entetes: ['OACI', 'Aérodrome', 'Statut', 'Expiration', 'Progression'],
          lignes: d.details.map(x => [
            x.code_oaci,
            x.nom,
            x.statutLabel,
            x.dateExpiration ? fmtDate(x.dateExpiration) : '—',
            `${x.progression}%`,
          ]),
        },
      },
    ],
  });
  const fichier = `Rapport_Certifications_${new Date().toISOString().split('T')[0]}.docx`;
  downloadBlob(blob, fichier);
  return { fichier };
}

/** Homologation nationale → Word (mêmes données que le PDF). */
export async function genererRapportWordHomologation(): Promise<{ fichier: string }> {
  const d = collecterEtatHomologation();
  const blob = await construireDocument({
    titre: 'RAPPORT NATIONAL D\u2019HOMOLOGATION',
    sousTitre: 'Aérodromes nationaux',
    meta: [
      ['Établi le', d.date],
      ['Parc suivi', `${d.totalAerodromes} aérodrome(s) : ${d.homologues} homologué(s), ${d.enCours} en cours, ${d.suspendus} suspendu(s), ${d.expires} expiré(s)`],
      ['Confidentialité', "Document confidentiel — diffusion autorisée dans le circuit d'instruction"],
    ],
    sections: [
      { titre: 'Synthèse', paragraphes: [syntheseDeterministeHomo(d)] },
      {
        titre: 'État par aérodrome',
        tableau: {
          entetes: ['OACI', 'Aérodrome', 'Statut', 'Expiration', 'Progression'],
          lignes: d.details.map(x => [
            x.code_oaci,
            x.nom,
            x.statutLabel,
            x.dateExpiration ? fmtDate(x.dateExpiration) : '—',
            `${x.progression}%`,
          ]),
        },
      },
    ],
  });
  const fichier = `Rapport_Homologations_${new Date().toISOString().split('T')[0]}.docx`;
  downloadBlob(blob, fichier);
  return { fichier };
}

/** Fiche de briefing → Word (mêmes données que le PDF). */
export async function genererRapportWordBriefing(
  fiche: FicheBriefing,
  info: { codeOaci: string; nom: string; redacteur?: string },
): Promise<{ fichier: string }> {
  const blob = await construireDocument({
    titre: 'FICHE DE BRIEFING',
    sousTitre: `${info.codeOaci} — ${info.nom}`,
    meta: [
      ['Référence', fiche.reference || '—'],
      ['Mission', fiche.type_mission || '—'],
      ['Période', fiche.periode || '—'],
      ['Établi le', `${fmtDate(fiche.genere_le)}${info.redacteur ? ` par ${info.redacteur}` : ''}`],
      ['Confidentialité', "Document confidentiel — diffusion autorisée dans le circuit d'instruction"],
    ],
    sections: [
      ...(fiche.synthese ? [{ titre: 'Synthèse', paragraphes: [fiche.synthese] }] : []),
      ...(fiche.objectifs?.length ? [{ titre: 'Objectifs', puces: fiche.objectifs }] : []),
      ...(fiche.portee?.length ? [{ titre: 'Portée', paragraphes: [fiche.portee.join(' — ')] }] : []),
      ...(fiche.equipe?.length ? [{ titre: 'Équipe', puces: fiche.equipe }] : []),
      ...(fiche.points_attention?.length ? [{ titre: "Points d'attention", puces: fiche.points_attention }] : []),
      ...(fiche.preuves_a_verifier?.length ? [{ titre: 'Preuves à vérifier', puces: fiche.preuves_a_verifier }] : []),
      ...(fiche.recommandations?.length ? [{ titre: 'Recommandations', puces: fiche.recommandations }] : []),
      ...(fiche.contexte_ecarts?.length ? [{
        titre: 'Écarts actifs',
        tableau: {
          entetes: ['Référence', 'Libellé', 'Risque', 'Statut'],
          lignes: fiche.contexte_ecarts.map(e => [e.reference, e.libelle, e.niveau_risque, e.statut]),
        },
      }] : []),
    ],
  });
  const fichier = `Briefing_${info.codeOaci}_${new Date().toISOString().split('T')[0]}.docx`;
  downloadBlob(blob, fichier);
  return { fichier };
}

function aplatirChecklist(
  domaines: DomaineChecklist[],
): { domaine: string; numero: string; texte: string; resultat: string }[] {
  const lignes: { domaine: string; numero: string; texte: string; resultat: string }[] = [];
  const itemVersLigne = (domaine: string, item: ChecklistItem) => {
    lignes.push({
      domaine,
      numero: item.numero || '',
      texte: item.point_verification || item.description || '',
      resultat: LIBELLE_RESULTAT[item.resultat || ''] || item.resultat || '—',
    });
  };
  for (const domaine of domaines || []) {
    for (const item of domaine.items || []) itemVersLigne(domaine.nom, item);
    for (const sd of domaine.sousDomaines || []) {
      for (const item of sd.items || []) itemVersLigne(`${domaine.nom} / ${sd.nom}`, item);
      for (const ssd of sd.sousSousDomaines || []) {
        for (const item of ssd.items || []) itemVersLigne(`${domaine.nom} / ${sd.nom} / ${ssd.nom}`, item);
      }
    }
  }
  return lignes;
}

/** Checklist de surveillance → Word (mêmes données que le PDF). */
export async function genererRapportWordChecklist(
  hierarchy: DomaineChecklist[],
  info: { titre: string; code: string; portee: string[] },
): Promise<{ fichier: string }> {
  const lignes = aplatirChecklist(hierarchy);
  const blob = await construireDocument({
    titre: 'CHECKLIST DE SURVEILLANCE',
    sousTitre: info.titre,
    meta: [
      ['Référence', info.code],
      ['Portée', (info.portee || []).join(', ') || '—'],
      ['Items', `${lignes.length} point(s) de vérification`],
      ['Confidentialité', "Document confidentiel — diffusion autorisée dans le circuit d'instruction"],
    ],
    sections: [{
      titre: 'Points de vérification',
      tableau: {
        entetes: ['Domaine', 'N°', 'Point de vérification', 'Résultat'],
        lignes: lignes.map(l => [l.domaine, l.numero, l.texte, l.resultat]),
      },
    }],
  });
  const fichier = `${info.code.replace(/[^a-zA-Z0-9_-]/g, '_')}.docx`;
  downloadBlob(blob, fichier);
  return { fichier };
}
