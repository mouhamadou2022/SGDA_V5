'use client';

export interface AnnexeData {
  aerodrome_nom: string;
  aerodrome_code: string;
  reference: string;
  date_debut: string;
  date_fin: string;
  date_profil: string;

  // A-1: Présences
  presences: {
    nom_presence: string;
    structure_presence: string;
    fonction_presence: string;
    tel_presence: string;
    signature_presence: string;
  }[];

  // A-2: Écarts
  nb_ecarts: number;
  ecarts_liste: {
    ref_ecart: string;
    domaine_ecart: string;
    constat_ecart: string;
    niveau_ecart: string;
    statut_ecart: string;
  }[];

  // A-3: Profil de risque
  score_global: string;
  tendance: string;
  prediction_3m: string;
  prediction_6m: string;
  c1_score: string;
  c1_niveau: string;
  c2_score: string;
  c2_niveau: string;
  c3_score: string;
  c3_niveau: string;
  c4_score: string;
  c4_niveau: string;
  c5_score: string;
  c5_niveau: string;
  analyse_profil: string;

  // A-4: Checklist
  domaines_checklist: {
    nom_domaine: string;
    sa_domaine: number;
    ns_domaine: number;
    nv_domaine: number;
    taux_domaine: string;
  }[];
  taux_global: string;
  sa_total: number;
  ns_total: number;
  nv_total: number;
  total_items: number;
}

export async function generateAnnexeDOCX(data: AnnexeData): Promise<Blob> {
  const PizZip = (await import('pizzip')).default;
  const Docxtemplater = (await import('docxtemplater')).default;

  const response = await fetch('/templates/annexe-template.docx');
  if (!response.ok) throw new Error(`Template annexe non trouvé: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();

  const zip = new PizZip(arrayBuffer);
  const doc = new Docxtemplater(zip, { linebreaks: true, paragraphLoop: true });

  doc.render(data);

  return doc.getZip().generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export async function exportAnnexeDOCX(data: AnnexeData, filename?: string): Promise<void> {
  const blob = await generateAnnexeDOCX(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `Annexes_${data.aerodrome_code || 'rapport'}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
