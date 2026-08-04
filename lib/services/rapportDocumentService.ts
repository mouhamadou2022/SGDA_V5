'use client';

import type { DomaineChecklist } from '@/types/checklist';

export interface RapportMembreEquipe {
  nom_membre: string;
  fonction_membre: string;
  role_membre: string;
}

export interface RapportEvolutionPac {
  date_evol: string;
  ouverts_evol: number;
  fermes_evol: number;
  taux_evol: string;
}

export interface RapportPacDetail {
  ref_pac: string;
  etat_initial_pac: string;
  etat_precedent_pac: string;
  etat_actuel_pac: string;
  progression_pac: string;
  statut_pac: string;
}

export interface RapportEcartCritique {
  num_ecart: number;
  domaine_ecart: string;
  constat_ecart: string;
  criticite_ecart: string;
  delai_ecart: string;
}

export interface RapportPacScDetail {
  ref_pac_sc: string;
  taux_pac_sc: string;
  etat_pac_sc: string;
}

export interface RapportData {
  // Métadonnées
  aerodrome_nom: string;
  aerodrome_code: string;
  aerodrome_type: string;
  aerodrome_categorie_sslia: string;
  aerodrome_region: string;
  aerodrome_exploitant: string;
  date_debut: string;
  date_fin: string;
  type_surveillance: string;
  reference: string;
  chef_equipe: string;
  equipe_inspecteurs: string;
  portee_inspection: string;
  niveau_risque: string;
  date_signature: string;

  // TOC
  toc: string;

  // Sections texte
  resume_executif: string;
  contexte: string;
  objectifs: string;
  information_generale: string;
  methodologie: string;
  referentiel_evaluation: string;
  deroulement_preparation: string;
  deroulement_reunion_ouverture: string;
  deroulement_visite_site: string;
  deroulement_reunion_cloture: string;
  resultats_inspection: string;
  profil_risque_analyse: string;
  nas_analyse: string;
  rencontre_exploitant: string;
  recommandations_conclusions: string;
  annexe_fiche_constatations: string;

  // Équipe (tableau dynamique)
  equipe_membres: RapportMembreEquipe[];

  // Synthèse PAC certification initiale
  pac_examines: number;
  pac_en_cours: number;
  pac_realises: number;
  pac_non_realises: number;

  // Évolution PAC (tableau dynamique)
  evolution_pac: RapportEvolutionPac[];

  // PAC initialisation (tableau détaillé)
  nb_ecarts: number;
  pac_initialisation_details: RapportPacDetail[];

  // Synthèse PAC surveillance continue
  pac_sc_examines: number;
  pac_sc_en_cours: number;
  pac_sc_realises: number;
  pac_sc_non_realises: number;

  // Écarts critiques (tableau dynamique)
  ecarts_critiques: RapportEcartCritique[];

  // PAC SC détail (tableau dynamique)
  pac_sc_details: RapportPacScDetail[];
}

export async function generateRapportDOCX(data: RapportData): Promise<Blob> {
  const PizZip = (await import('pizzip')).default;
  const Docxtemplater = (await import('docxtemplater')).default;

  const response = await fetch('/templates/rapport-template.docx');
  if (!response.ok) throw new Error(`Template non trouvé: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, { linebreaks: true, paragraphLoop: true });

  doc.render(data);

  const blob = doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return blob;
}

export async function exportRapportDOCX(data: RapportData, filename?: string): Promise<void> {
  const blob = await generateRapportDOCX(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `Rapport_${data.aerodrome_code || 'rapport'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export multi-fichiers DOCX : un fichier par domaine + rapport principal
 * Utilisé pour les checklists longues (certification/homologation) où un seul DOCX serait illisible
 */
export async function exportRapportDOCXByDomaine(
  rapportBlob: Blob,
  domaines: DomaineChecklist[],
  meta: { aerodrome: string; code: string; reference: string }
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const { generateChecklistDOCX } = await import('./documentTemplater');
  const zip = new JSZip();

  zip.file(`Rapport_${meta.aerodrome}_${meta.reference}.docx`, rapportBlob);

  for (const domaine of domaines) {
    const safeName = domaine.nom.replace(/[\\/:"*?<>|]/g, '_');
    const docxBlob = await generateChecklistDOCX([domaine], {
      titre: `${meta.aerodrome} — ${domaine.nom}`,
      code: `${meta.code}_${safeName}`,
      portee: [domaine.nom],
      aerodrome: meta.aerodrome,
    });
    zip.file(`Checklist_${safeName}.docx`, docxBlob);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Dossier_${meta.aerodrome}_${meta.reference}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
