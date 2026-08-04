// lib/services/dossierTransmission.ts
// À la transmission d'une surveillance, génère en PDF NATIF (jsPDF, style ANACIM)
// la checklist signée et le rapport signé, les publie dans le bucket Supabase
// « documents » et retourne leurs URLs publiques pour le portail exploitant
// (prévisualisation / téléchargement par le point focal).
// Appel best-effort depuis passerEtapeSuivante — jamais bloquant.

'use client';

import type { DomaineChecklist } from '@/types/checklist';
import type { Surveillance } from '@/lib/store';
import { uploadFile } from '@/lib/datastore';

const BUCKET = 'documents';

export interface DossierPublie {
  rapportPdfUrl?: string;
  checklistPdfUrl?: string;
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const [head, base64] = dataUrl.split(',');
    if (!head || !base64) return null;
    const mime = head.match(/data:([^;]+)/)?.[1] || 'application/pdf';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

function parseSections(json?: string): any | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

async function uploadPdf(
  surveillanceId: string,
  nom: string,
  blob: Blob,
): Promise<string | undefined> {
  const result = await uploadFile(BUCKET, `surveillances/${surveillanceId}/${nom}`, blob);
  if (result.error || !result.data) {
    console.error(`[dossierTransmission] Échec upload ${nom}:`, result.error);
    return undefined;
  }
  return result.data.url;
}

async function genererRapportPdfUrl(surveillance: Surveillance): Promise<string | undefined> {
  if (surveillance.rapport_pdf_url) return surveillance.rapport_pdf_url;

  const { rapport_fichier_url } = surveillance;
  if (rapport_fichier_url) {
    // Fichier chargé (base64) → le convertir en vrai fichier Supabase
    if (rapport_fichier_url.startsWith('data:')) {
      const blob = dataUrlToBlob(rapport_fichier_url);
      if (blob) return uploadPdf(surveillance.id, 'rapport_signe.pdf', blob);
      return undefined;
    }
    // URL déjà persistée (http/https/blob) → réutiliser telle quelle
    return rapport_fichier_url;
  }

  // Rapport rédigé en interne → reconstruire le PDF natif depuis les sections persistées
  const sections = parseSections(surveillance.rapport_sections);
  if (!sections) return undefined;

  const { useAppStore } = await import('@/lib/store');
  const st = useAppStore.getState();
  const aerodrome = st.aerodromes.find(a => a.id === surveillance.aerodrome_id);
  const profil = st.profilsRisque?.[surveillance.aerodrome_id || ''];
  const items = st.checklistItems?.[surveillance.id] || [];
  let ecarts = st.ecarts.filter(e => e.surveillance_id === surveillance.id);
  if (ecarts.length === 0) {
    ecarts = st.ecartsRedaction.filter(e => e.surveillance_id === surveillance.id) as any;
  }
  const utilisateurs = st.utilisateurs || [];
  const dgAnacim = utilisateurs.find(u => u.role === 'dg_anacim');
  const dgNom = dgAnacim ? `${dgAnacim.prenom || ''} ${dgAnacim.nom || ''}` : 'Le Directeur Général';

  const today = new Date();
  const reference = `${aerodrome?.code_oaci || 'XXX'}_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}_SURV`;

  const { batirRapportSurveillancePdf } = await import('@/lib/services/rapportSurveillancePdf');
  const blob = await batirRapportSurveillancePdf({
    surveillance,
    aerodrome,
    profil,
    items,
    ecarts,
    utilisateurs,
    sections,
    dgNom,
    reference,
  });

  return uploadPdf(surveillance.id, 'rapport_signe.pdf', blob);
}

async function genererChecklistPdfUrl(surveillance: Surveillance): Promise<string | undefined> {
  if (surveillance.checklist_pdf_url) return surveillance.checklist_pdf_url;

  const hierarchy = Array.isArray(surveillance.checklist_hierarchy)
    ? (surveillance.checklist_hierarchy as DomaineChecklist[])
    : [];
  const hasItems = hierarchy.some(d => (d.items?.length || 0) > 0);
  if (!hasItems) return undefined;

  const { useAppStore } = await import('@/lib/store');
  const st = useAppStore.getState();
  const aerodrome = st.aerodromes.find(a => a.id === surveillance.aerodrome_id);
  const utilisateurs = st.utilisateurs || [];
  const membres = utilisateurs.filter(u => surveillance.equipe_ids?.includes(u.id));
  const inspecteurs = membres.length > 0
    ? membres.map(u => `${u.prenom || ''} ${u.nom || ''}`).join(', ')
    : undefined;

  const today = new Date();
  const reference = `${aerodrome?.code_oaci || 'XXX'}_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}_SURV`;

  const { buildChecklistPDFBlob } = await import('@/lib/services/exportChecklist');
  const blob = await buildChecklistPDFBlob(hierarchy, {
    titre: `Checklist signée — Surveillance ${surveillance.type || ''}`.trim(),
    code: reference,
    version: '1.0',
    portee: surveillance.portee,
    aerodrome: aerodrome ? `${aerodrome.nom} (${aerodrome.code_oaci})` : undefined,
    inspecteurs,
  });

  return uploadPdf(surveillance.id, 'checklist_signee.pdf', blob);
}

/**
 * Génère et publie le dossier PDF (rapport signé + checklist signée) vers le
 * bucket Supabase. Best-effort : retourne toujours un objet (URLs éventuellement
 * vides) et n'émet jamais d'exception bloquante.
 */
export async function publierDossier(surveillanceId: string): Promise<DossierPublie> {
  try {
    const { useAppStore } = await import('@/lib/store');
    const surveillance = useAppStore.getState().surveillances.find(s => s.id === surveillanceId);
    if (!surveillance) return {};

    const [rapportPdfUrl, checklistPdfUrl] = await Promise.all([
      genererRapportPdfUrl(surveillance),
      genererChecklistPdfUrl(surveillance),
    ]);

    return { rapportPdfUrl, checklistPdfUrl };
  } catch (err) {
    console.warn('[dossierTransmission] Erreur publication dossier:', err);
    return {};
  }
}
