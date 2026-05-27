// lib/pdfGenerator.ts
'use client';

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

import { RapportStats, RapportDomaineStats, RapportEcart, RapportPresence, RapportProfil } from './rapportUtils';

// Types
export interface PDFGeneratorOptions {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  pageSize?: 'A4' | 'Letter';
  orientation?: 'portrait' | 'landscape';
  margin?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  header?: {
    text: string;
    height: number;
  };
  footer?: {
    text: string;
    height: number;
  };
}

export interface PDFGenerationResult {
  success: boolean;
  blob?: Blob;
  url?: string;
  error?: string;
}

// Configuration par défaut
const DEFAULT_OPTIONS: PDFGeneratorOptions = {
  title: 'Rapport de surveillance',
  author: 'ANACIM',
  subject: 'Rapport de surveillance aérodrome',
  keywords: ['ANACIM', 'surveillance', 'aérodrome', 'rapport'],
  pageSize: 'A4',
  orientation: 'portrait',
  margin: {
    top: 40,
    right: 40,
    bottom: 40,
    left: 40,
  },
  header: {
    text: '',
    height: 20,
  },
  footer: {
    text: '',
    height: 20,
  },
};

/**
 * Génère un PDF à partir d'un élément HTML
 * Utilise html2canvas pour la capture et jsPDF pour la génération
 */
export async function generatePDFFromHTML(
  element: HTMLElement,
  options?: PDFGeneratorOptions
): Promise<PDFGenerationResult> {
  if (!isBrowser) {
    return { success: false, error: 'SSR non supporté' };
  }

  // Imports dynamiques pour éviter les erreurs SSR
  const html2canvas = (await import('html2canvas')).default;
  const jsPDF = (await import('jspdf')).default;

  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Capture de l'élément HTML
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    } as any);

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = opts.pageSize === 'A4' ? 210 : 215.9; // mm (A4 ou Letter)
    const pageHeight = opts.pageSize === 'A4' ? 297 : 279.4; // mm
    const marginLeft = opts.margin?.left || 20;
    const marginTop = opts.margin?.top || 20;
    const marginRight = opts.margin?.right || 20;
    const marginBottom = opts.margin?.bottom || 20;

    const availableWidth = imgWidth - marginLeft - marginRight;
    const imgHeight = (canvas.height * availableWidth) / canvas.width;
    let position = marginTop;

    // Création du PDF
    const pdf = new jsPDF({
      unit: 'mm',
      format: opts.pageSize,
      orientation: opts.orientation,
    });

    // Ajout de l'image
    pdf.addImage(imgData, 'PNG', marginLeft, position, availableWidth, imgHeight);

    // Ajout des pages supplémentaires si nécessaire
    let remainingHeight = imgHeight - (pageHeight - marginTop - marginBottom);
    let currentPosition = position + (pageHeight - marginTop - marginBottom);

    while (remainingHeight > 0) {
      pdf.addPage();
      pdf.addImage(
        imgData,
        'PNG',
        marginLeft,
        -currentPosition + marginTop,
        availableWidth,
        imgHeight
      );
      remainingHeight -= pageHeight - marginTop - marginBottom;
      currentPosition += pageHeight - marginTop - marginBottom;
    }

    // Ajout de l'en-tête et pied de page
    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);

      // En-tête
      if (opts.header?.text) {
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text(opts.header.text, marginLeft, opts.header.height || 10);
      }

      // Pied de page
      if (opts.footer?.text) {
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        const pageHeightMm = opts.pageSize === 'A4' ? 297 : 279.4;
        pdf.text(
          `${opts.footer.text} - Page ${i}/${pageCount}`,
          marginLeft,
          pageHeightMm - (opts.footer.height || 10)
        );
      }
    }

    // Génération du blob
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);

    return {
      success: true,
      blob,
      url,
    };
  } catch (error) {
    console.error('[pdfGenerator] Erreur lors de la génération du PDF:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

/**
 * Génère un PDF à partir d'une chaîne HTML
 */
export async function generatePDFFromHTMLString(
  html: string,
  options?: PDFGeneratorOptions
): Promise<PDFGenerationResult> {
  if (!isBrowser) {
    return { success: false, error: 'SSR non supporté' };
  }

  // Imports dynamiques
  const html2canvas = (await import('html2canvas')).default;
  const jsPDF = (await import('jspdf')).default;

  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Créer un conteneur temporaire
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = opts.pageSize === 'A4' ? '210mm' : '215.9mm';
    container.style.backgroundColor = '#ffffff';
    container.style.padding = '20px';
    container.innerHTML = html;
    document.body.appendChild(container);

    // Capture du contenu
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    } as any);

    // Nettoyage
    document.body.removeChild(container);

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = opts.pageSize === 'A4' ? 210 : 215.9;
    const pageHeight = opts.pageSize === 'A4' ? 297 : 279.4;
    const marginLeft = opts.margin?.left || 20;
    const marginTop = opts.margin?.top || 20;
    const marginRight = opts.margin?.right || 20;
    const marginBottom = opts.margin?.bottom || 20;

    const availableWidth = imgWidth - marginLeft - marginRight;
    const imgHeight = (canvas.height * availableWidth) / canvas.width;
    let position = marginTop;

    const pdf = new jsPDF({
      unit: 'mm',
      format: opts.pageSize,
      orientation: opts.orientation,
    });

    pdf.addImage(imgData, 'PNG', marginLeft, position, availableWidth, imgHeight);

    let remainingHeight = imgHeight - (pageHeight - marginTop - marginBottom);
    let currentPosition = position + (pageHeight - marginTop - marginBottom);

    while (remainingHeight > 0) {
      pdf.addPage();
      pdf.addImage(
        imgData,
        'PNG',
        marginLeft,
        -currentPosition + marginTop,
        availableWidth,
        imgHeight
      );
      remainingHeight -= pageHeight - marginTop - marginBottom;
      currentPosition += pageHeight - marginTop - marginBottom;
    }

    const pageCount = pdf.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i);

      if (opts.header?.text) {
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text(opts.header.text, marginLeft, opts.header.height || 10);
      }

      if (opts.footer?.text) {
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        const pageHeightMm = opts.pageSize === 'A4' ? 297 : 279.4;
        pdf.text(
          `${opts.footer.text} - Page ${i}/${pageCount}`,
          marginLeft,
          pageHeightMm - (opts.footer.height || 10)
        );
      }
    }

    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);

    return {
      success: true,
      blob,
      url,
    };
  } catch (error) {
    console.error('[pdfGenerator] Erreur:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

/**
 * Génère un rapport PDF à partir des données structurées
 */
export async function generateRapportPDF(
  stats: RapportStats,
  statsByDomaine: RapportDomaineStats[],
  ecarts: RapportEcart[],
  presences: RapportPresence[],
  profil: RapportProfil | null,
  metadata: {
    aerodrome_nom: string;
    aerodrome_code: string;
    date_debut: string;
    date_fin: string;
    type: string;
    reference: string;
    chef_equipe?: string;
    redacteur?: string;
  },
  sectionsManuelles?: {
    resume_executif?: string;
    introduction?: string;
    methodologie?: string;
    deroulement?: string;
    preoccupations?: string;
    recommandations?: string;
  },
  options?: PDFGeneratorOptions
): Promise<PDFGenerationResult> {
  // Importer les fonctions d'utils
  const {
    generatePageGardeHTML,
    generateTableMatiereHTML,
    generateEquipeInspectionHTML,
    generateResultatsHTML,
    generateAnnexesHTML,
    generateRapportCompletHTML,
  } = await import('./rapportUtils');

  const sections: Record<string, string> = {
    page_garde: generatePageGardeHTML(
      metadata.aerodrome_nom,
      metadata.aerodrome_code,
      metadata.date_debut,
      metadata.date_fin,
      metadata.type,
      metadata.reference,
      metadata.chef_equipe
    ),
  };

  // Construction des sections
  const sectionsList = [
    { id: 'page_garde', titre: 'Page de garde' },
    { id: 'table_matieres', titre: 'Table des matières' },
    { id: 'resume_executif', titre: 'Résumé exécutif' },
    { id: 'introduction', titre: 'Introduction et contexte' },
    { id: 'equipe_inspection', titre: 'Équipe d\'inspection' },
    { id: 'methodologie', titre: 'Méthodologie' },
    { id: 'deroulement', titre: 'Déroulement de la surveillance' },
    { id: 'resultats', titre: 'Résultats de l\'inspection' },
    { id: 'preoccupations', titre: 'Préoccupations de sécurité' },
    { id: 'recommandations', titre: 'Recommandations et conclusion' },
    { id: 'annexes', titre: 'Annexes' },
  ];

  sections.table_matieres = generateTableMatiereHTML(sectionsList);
  sections.equipe_inspection = generateEquipeInspectionHTML(presences);
  sections.resultats = generateResultatsHTML(stats, statsByDomaine, { profil });
  sections.annexes = generateAnnexesHTML(presences, ecarts, profil);

  // Sections manuelles
  if (sectionsManuelles?.resume_executif) {
    sections.resume_executif = `<div><h2>Résumé exécutif</h2>${sectionsManuelles.resume_executif}</div>`;
  } else {
    sections.resume_executif = `<div><h2>Résumé exécutif</h2><p>À compléter...</p></div>`;
  }

  if (sectionsManuelles?.introduction) {
    sections.introduction = `<div><h2>Introduction et contexte</h2>${sectionsManuelles.introduction}</div>`;
  } else {
    sections.introduction = `<div><h2>Introduction et contexte</h2><p>À compléter...</p></div>`;
  }

  if (sectionsManuelles?.methodologie) {
    sections.methodologie = `<div><h2>Méthodologie</h2>${sectionsManuelles.methodologie}</div>`;
  } else {
    sections.methodologie = `<div><h2>Méthodologie</h2><p>La surveillance a été réalisée sur la base de la checklist RAS 14...</p></div>`;
  }

  if (sectionsManuelles?.deroulement) {
    sections.deroulement = `<div><h2>Déroulement de la surveillance</h2>${sectionsManuelles.deroulement}</div>`;
  } else {
    sections.deroulement = `<div><h2>Déroulement de la surveillance</h2><p>À compléter...</p></div>`;
  }

  if (sectionsManuelles?.preoccupations) {
    sections.preoccupations = `<div><h2>Préoccupations de sécurité</h2>${sectionsManuelles.preoccupations}</div>`;
  } else {
    sections.preoccupations = `<div><h2>Préoccupations de sécurité</h2><p>Aucune préoccupation majeure identifiée.</p></div>`;
  }

  if (sectionsManuelles?.recommandations) {
    sections.recommandations = `<div><h2>Recommandations et conclusion</h2>${sectionsManuelles.recommandations}</div>`;
  } else {
    sections.recommandations = `<div><h2>Recommandations et conclusion</h2><p>Basé sur les constats, les recommandations suivantes sont formulées...</p></div>`;
  }

  const fullHTML = generateRapportCompletHTML(sections, {
    includeCSS: true,
    pageSize: options?.pageSize,
  });

  return generatePDFFromHTMLString(fullHTML, options);
}

/**
 * Télécharger un blob en tant que fichier
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (!isBrowser) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exporter un rapport en PDF avec téléchargement automatique
 */
export async function exportRapportToPDF(
  stats: RapportStats,
  statsByDomaine: RapportDomaineStats[],
  ecarts: RapportEcart[],
  presences: RapportPresence[],
  profil: RapportProfil | null,
  metadata: {
    aerodrome_nom: string;
    aerodrome_code: string;
    date_debut: string;
    date_fin: string;
    type: string;
    reference: string;
    chef_equipe?: string;
    redacteur?: string;
  },
  sectionsManuelles?: {
    resume_executif?: string;
    introduction?: string;
    methodologie?: string;
    deroulement?: string;
    preoccupations?: string;
    recommandations?: string;
  },
  options?: PDFGeneratorOptions
): Promise<boolean> {
  const result = await generateRapportPDF(
    stats,
    statsByDomaine,
    ecarts,
    presences,
    profil,
    metadata,
    sectionsManuelles,
    options
  );

  if (result.success && result.blob) {
    const filename = `rapport_${metadata.aerodrome_code}_${metadata.reference}_${new Date().toISOString().slice(0, 10)}.pdf`;
    downloadBlob(result.blob, filename);
    return true;
  }

  console.error('[pdfGenerator] Échec de l\'export:', result.error);
  return false;
}

/**
 * Exporter un élément HTML en PDF
 */
export async function exportElementToPDF(
  elementId: string,
  filename: string,
  options?: PDFGeneratorOptions
): Promise<boolean> {
  if (!isBrowser) {
    console.error('[pdfGenerator] SSR non supporté');
    return false;
  }
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`[pdfGenerator] Élément ${elementId} non trouvé`);
    return false;
  }

  const result = await generatePDFFromHTML(element, options);
  if (result.success && result.blob) {
    downloadBlob(result.blob, filename);
    return true;
  }

  return false;
}

/**
 * Aperçu PDF dans un nouvel onglet
 */
export async function previewPDF(
  stats: RapportStats,
  statsByDomaine: RapportDomaineStats[],
  ecarts: RapportEcart[],
  presences: RapportPresence[],
  profil: RapportProfil | null,
  metadata: {
    aerodrome_nom: string;
    aerodrome_code: string;
    date_debut: string;
    date_fin: string;
    type: string;
    reference: string;
    chef_equipe?: string;
    redacteur?: string;
  },
  sectionsManuelles?: {
    resume_executif?: string;
    introduction?: string;
    methodologie?: string;
    deroulement?: string;
    preoccupations?: string;
    recommandations?: string;
  }
): Promise<void> {
  const result = await generateRapportPDF(
    stats,
    statsByDomaine,
    ecarts,
    presences,
    profil,
    metadata,
    sectionsManuelles
  );

  if (result.success && result.url) {
    if (isBrowser) {
      window.open(result.url, '_blank');
    }
  } else {
    console.error('[pdfGenerator] Échec de l\'aperçu:', result.error);
  }
}

/**
 * Exporter les fonctions utilitaires
 */
export const pdfGenerator = {
  generatePDFFromHTML,
  generatePDFFromHTMLString,
  generateRapportPDF,
  downloadBlob,
  exportRapportToPDF,
  exportElementToPDF,
  previewPDF,
};