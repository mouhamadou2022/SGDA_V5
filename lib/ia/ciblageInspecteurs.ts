// lib/ia/ciblageInspecteurs.ts
// Ciblage des inspecteurs pour une formation liée à un document.
// Remplace « les N premiers de la liste » par un score expliquable croisant
// les données des autres modules : compétences du domaine (table Competence
// + déclaratives profil), fraîcheur des formations suivies. Pur et testé
// (aucun réseau, aucun store — les données sont passées en paramètres).

import type {
  Competence,
  CompetenceDeclarative,
  Formation,
} from '@/lib/store/formationsSlice';
import {
  declarativeNiveauVersNombre,
  normaliserDomaineCompetence,
} from '@/lib/store/formationsSlice';
import { getDomainesIndividuelsCodes } from '@/lib/domaines';

export interface InspecteurCiblable {
  id: string;
  competencesDeclaratives?: CompetenceDeclarative[];
}

export interface CiblageResult {
  /** Ids classés par pertinence décroissante (déjà tronqués). */
  ids: string[];
  /** Score par inspecteur (transparence : pourquoi lui). */
  scores: Record<string, number>;
}

const MOIS_MS = 30 * 86400 * 1000;

/** Domaines du document normalisés ; AGA → tous les domaines individuels. */
export function normaliserDomainesDoc(domainesDoc: string[]): string[] {
  const codes = (domainesDoc || [])
    .map(d => (d || '').trim().toUpperCase())
    .filter(Boolean);
  if (codes.includes('AGA')) return [...getDomainesIndividuelsCodes()];
  return [...new Set(codes)];
}

function meilleurNiveauTable(
  competences: Competence[],
  inspecteurId: string,
  domaines: string[],
  maintenant: number,
): number {
  let best = 0;
  for (const c of competences || []) {
    if (c.inspecteur_id !== inspecteurId) continue;
    const dom = normaliserDomaineCompetence(c.domaine).toUpperCase();
    if (!dom || !domaines.includes(dom)) continue;
    if (c.expire_le && new Date(c.expire_le).getTime() < maintenant) continue;
    const niveau = Math.min(3, Math.max(1, Math.round(Number(c.niveau) || 0)));
    if (niveau > best) best = niveau;
  }
  return best;
}

function meilleurNiveauDeclaratif(
  declaratives: CompetenceDeclarative[] | undefined,
  domaines: string[],
): number {
  let best = 0;
  for (const d of declaratives || []) {
    const dom = normaliserDomaineCompetence(d.domaine).toUpperCase();
    if (!dom || !domaines.includes(dom)) continue;
    const niveau = declarativeNiveauVersNombre(d.niveau);
    if (niveau > best) best = niveau;
  }
  return best;
}

function derniereFormationDomaine(
  formations: Formation[],
  inspecteurId: string,
  domaines: string[],
): number | null {
  let derniere: number | null = null;
  for (const f of formations || []) {
    if (f.statut !== 'terminee') continue;
    if (!(f.participants || []).includes(inspecteurId)) continue;
    const intersecte = (f.domaines || []).some(d =>
      domaines.includes((d || '').trim().toUpperCase()),
    );
    if (!intersecte) continue;
    const t = new Date(f.date || f.created_at).getTime();
    if (Number.isFinite(t) && (derniere == null || t > derniere)) derniere = t;
  }
  return derniere;
}

/**
 * Classe les inspecteurs pour un document : impact majeur → tous (inchangé),
 * sinon score = compétence table (×15/niveau) + déclarative (×10/niveau) +
 * besoin de formation (jamais formé +30, >12 mois +20, >6 mois +10).
 * Tronque à maxNonMajeur (défaut 3), égalités départagées par id (stable).
 */
export function ciblerInspecteurs(params: {
  inspecteurs: InspecteurCiblable[];
  competences: Competence[];
  formations: Formation[];
  domainesDoc: string[];
  impact: string;
  maxNonMajeur?: number;
  maintenant?: number;
}): CiblageResult {
  const {
    inspecteurs,
    competences,
    formations,
    domainesDoc,
    impact,
    maxNonMajeur = 3,
    maintenant = Date.now(),
  } = params;
  const ids = (inspecteurs || []).map(i => i.id).filter(Boolean);
  if (ids.length === 0) return { ids: [], scores: {} };
  if (impact === 'majeur') return { ids, scores: {} };

  const domaines = normaliserDomainesDoc(domainesDoc);
  const scores: Record<string, number> = {};
  for (const insp of inspecteurs) {
    let score = 0;
    score += meilleurNiveauTable(competences, insp.id, domaines, maintenant) * 15;
    score += meilleurNiveauDeclaratif(insp.competencesDeclaratives, domaines) * 10;
    const derniere = derniereFormationDomaine(formations, insp.id, domaines);
    if (derniere == null) score += 30;
    else if (maintenant - derniere > 12 * MOIS_MS) score += 20;
    else if (maintenant - derniere > 6 * MOIS_MS) score += 10;
    scores[insp.id] = score;
  }
  const classes = [...ids].sort((a, b) => scores[b] - scores[a] || (a < b ? -1 : 1));
  return { ids: classes.slice(0, Math.max(1, maxNonMajeur)), scores };
}
