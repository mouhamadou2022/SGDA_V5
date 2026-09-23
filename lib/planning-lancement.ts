// lib/planning-lancement.ts — Lancement planning → surveillance
// Briques pures extraites de PlanningModule.handleLancer (comportement
// identique) : calcul de portée, construction de la surveillance,
// conversion des délégations, mapping du type checklist, message
// exploitants, pré-remplissage IA. L'orchestration async (store, router)
// vit dans components/modules/planning/useLancerSurveillance.ts.

import { normalizePlanningType } from './planning';
import { checklistMemory, type TypeInspection } from './checklistMemory';
import type {
  Planning, Surveillance, Aerodrome, Delegation, Utilisateur, DomaineChecklist, ChecklistItem,
} from './store';

// Noeud de hiérarchie checklist (DomaineChecklist → SousDomaine →
// SousSousDomaine) : tous les champs optionnels pour couvrir les trois
// niveaux dans le prefill récursif.
export interface NoeudPrefillChecklist {
  id?: string;
  nom?: string;
  items?: ChecklistItem[];
  sousDomaines?: NoeudPrefillChecklist[];
  sousSousDomaines?: NoeudPrefillChecklist[];
  isExpanded?: boolean;
  ordre?: number;
}

/** Portée complète au lancement (certification : tous les domaines techniques). */
export function calculerPorteeLancement(
  type: Planning['type'],
  portee: string[] | undefined,
  sgsApplicable: boolean,
): string[] {
  if (type === 'certification') {
    return sgsApplicable
      ? ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS']
      : ['SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS']
  }
  if (type === 'homologation') {
    return sgsApplicable ? ['SGS', ...(portee || [])] : (portee || [])
  }
  return portee || []
}

/** Corps de la surveillance créée au lancement (id/dates générés par le slice). */
export function buildNouvelleSurveillance(
  planning: Planning,
  porteeComplete: string[],
  dateDebutISO: string,
  dateFinISO: string,
): Omit<Surveillance, 'id' | 'created_at' | 'updated_at'> {
  return {
    aerodrome_id: planning.aerodrome_id,
    planning_id: planning.id,
    type: normalizePlanningType(planning.type) as Surveillance['type'],
    portee: porteeComplete,
    equipe_ids: planning.equipe_ids || [],
    chef_id: planning.chef_id || '',
    date_debut: dateDebutISO,
    date_fin: dateFinISO,
    statut: 'en_cours',
  }
}

/** Convertit les délégations préparatoires du planning en Delegation[] (id généré par le slice). */
export function convertirDelegationsPlanning(
  planning: Planning,
  surveillanceId: string,
  chefId: string,
  hierarchy: DomaineChecklist[],
  userId: string,
  now: string,
): Omit<Delegation, 'id'>[] {
  const mapping = planning.delegations as Record<string, string> | undefined
  if (!mapping || Object.keys(mapping).length === 0) return []
  const sortie: Omit<Delegation, 'id'>[] = []
  for (const [domaine, inspecteurId] of Object.entries(mapping)) {
    if (!inspecteurId) continue
    const itemsIds = hierarchy.flatMap(d =>
      d.nom?.toUpperCase() === domaine.toUpperCase()
        ? (d.items || []).map(i => i.id)
        : []
    )
    sortie.push({
      surveillance_id: surveillanceId,
      aerodrome_id: planning.aerodrome_id,
      chef_id: planning.chef_id || chefId,
      domaine: domaine.toUpperCase(),
      domaine_nom: domaine.toUpperCase(),
      assigne_a: inspecteurId,
      assigne_par: userId || planning.chef_id || '',
      items_ids: itemsIds,
      progression: 0,
      statut: 'assigne',
      assigne_le: now,
      derniere_activite: now,
      derniere_sync: now,
    })
  }
  return sortie
}

/** Mapping type planning normalisé → type checklist (ne jamais hardcoder 'programmee'). */
export function resoudreTypeSurveillance(normalizedType: string): TypeInspection {
  return normalizedType === 'inopine' ? 'inopine'
    : normalizedType === 'maintien' ? 'maintien'
    : normalizedType === 'certification' ? 'certification'
    : normalizedType === 'homologation' ? 'homologation'
    : normalizedType === 'suivi_ecarts' ? 'suivi_ecarts'
    : normalizedType === 'mise_oeuvre_pac' ? 'mise_oeuvre_pac'
    : 'periodique'
}

/** Corps du message envoyé aux exploitants au lancement. */
export function construireMessageExploitants(args: {
  typeLabel: string;
  domainesLabels: string;
  dateDebut: string;
  dateFin: string;
  equipeNoms: string;
  aeroCode: string;
}): string {
  return `Une surveillance ${args.typeLabel} est programmée du ${args.dateDebut} au ${args.dateFin} sur ${args.aeroCode}.\nDomaines: ${args.domainesLabels}\nÉquipe: ${args.equipeNoms}\nPréparez vos documents et registres pour l'équipe ANACIM.`
}

/** Noms "Prénom Nom" (repli id) pour l'affichage équipe. */
export function nomsEquipe(equipeIds: string[], utilisateurs: Utilisateur[]): string {
  return equipeIds.map((id: string) => {
    const u = utilisateurs.find(x => x.id === id)
    return u ? `${u.prenom} ${u.nom}` : id
  }).join(', ')
}

export interface ContextePrefill {
  aerodromeId: string;
  typeSurv: TypeInspection;
  profil?: { score_global: number; tendance: string };
}

/**
 * Pré-remplit les items de la hiérarchie avec les prédictions IA
 * (checklistMemory). Mute en place, retourne `true` si modifié.
 */
export function appliquerPredictionsPrefill(
  hierarchy: NoeudPrefillChecklist[],
  ctx: ContextePrefill,
): boolean {
  let changed = false
  const renseigner = (
    item: ChecklistItem,
    domaineNom: string,
    sousDomaineNom: string,
  ) => {
    try {
      const pred = checklistMemory.getPredictionForItem(
        ctx.aerodromeId,
        ctx.typeSurv,
        domaineNom,
        sousDomaineNom,
        '',
        { id: item.id || '', numero: item.numero || '', point_verification: item.point_verification || '' },
        ctx.profil,
      )
      if (pred && pred.prediction) {
        item.resultat = pred.prediction
        item.prediction = pred.prediction
        item.confiance = pred.confiance || 70
        item.justification = pred.justification || ''
        changed = true
      }
    } catch { /* ignorer les items sans prédiction */ }
  }
  const prefillItems = (domaines: NoeudPrefillChecklist[]) => {
    for (const domaine of domaines) {
      for (const item of domaine.items || []) {
        renseigner(item, domaine.nom || '', '')
      }
      if (domaine.sousDomaines) prefillItems(domaine.sousDomaines)
      if (domaine.sousSousDomaines) {
        for (const ssd of domaine.sousSousDomaines) {
          for (const item of (ssd.items || [])) {
            renseigner(item, domaine.nom || '', ssd.nom || '')
          }
        }
      }
    }
  }
  prefillItems(hierarchy)
  return changed
}

/** Garde : seul le chef d'équipe désigné peut lancer. */
export function peutLancer(userId: string | undefined, chefId: string | undefined): boolean {
  return !!userId && !!chefId && chefId === userId
}

/**
 * Familles de templates du kit par type de mission (préfixes d'ID) —
 * source unique (remplace les ternaires dupliqués aux 3 points de sélection).
 * Règles architecte : IT = domaines techniques d'infrastructure (SLI, RA,
 * PHY, MFP…), SOP = procédures de mise en œuvre, COP ∈ certification
 * (jamais validation de site), HMG ∈ homologation.
 */
export function filtresTemplatesParType(type: string): string[] {
  if (type === 'certification') return ['IT', 'SOP', 'SGS', 'COP']
  if (type === 'homologation') return ['HMG', 'IT', 'SOP', 'SGS']
  if (type === 'maintien') return ['QSC', 'SGS']
  return ['QSC']
}

export interface SuggestionPlanifiable {
  aerodrome_id: string;
  type: Planning['type'];
  date_debut: string;
  date_fin: string;
  portee: string[];
  equipe_ids: string[];
  chef_id: string;
  priorite: Planning['priorite'];
  objectifs: string;
}

/**
 * Construit un planning depuis une suggestion AERORISQ (valider ET ajuster
 * fabriquaient le même objet — dédupliqué ici).
 */
export function buildPlanningFromSuggestion(
  suggestion: SuggestionPlanifiable,
  now: string,
): Planning {
  return {
    id: crypto.randomUUID(),
    aerodrome_id: suggestion.aerodrome_id,
    type: suggestion.type,
    date_debut: suggestion.date_debut,
    date_fin: suggestion.date_fin,
    portee: suggestion.portee,
    equipe_ids: suggestion.equipe_ids,
    chef_id: suggestion.chef_id,
    statut: 'planifiee',
    priorite: suggestion.priorite,
    objectifs: suggestion.objectifs,
    est_proposition: false,
    annee_cible: new Date().getFullYear(),
    created_at: now,
    updated_at: now,
  }
}

/** Ligne CSV d'export (en-têtes + lignes depuis les plannings enrichis). */
export function buildExportCSV(
  headers: string[],
  rows: (string | number | undefined | null)[][],
): string {
  return [headers, ...rows].map(row => row.join(',')).join('\n')
}
