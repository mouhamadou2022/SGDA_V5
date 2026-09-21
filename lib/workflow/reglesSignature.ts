// lib/workflow/reglesSignature.ts — Logique pure du workflow (saga)
// Règles de fusion des signatures et de calcul d'avancement checklist.
// Déplacé depuis lib/store/workflowSlice.ts : aucun changement de
// comportement, uniquement testable isolément.

import type { Surveillance } from '../store/surveillancesSlice';
import type { SignatureInfo } from '../store';

export interface NouvelleSignature {
  signataire_id: string;
  signataire_nom: string;
  signature_url: string;
}

/**
 * Fusion des signatures — dédoublonnage par signataire (une
 * re-signature remplace la précédente au lieu d'écraser toutes).
 */
export function fusionnerSignatures(
  existantes: SignatureInfo[] | undefined,
  opts: NouvelleSignature,
  now: string,
): SignatureInfo[] {
  const nouvelle: SignatureInfo = {
    signataire_id: opts.signataire_id,
    signataire_nom: opts.signataire_nom,
    date_signature: now,
    signature_url: opts.signature_url,
  }
  return [
    ...(existantes || []).filter(s => s.signataire_id !== opts.signataire_id),
    nouvelle,
  ]
}

export interface ContexteAvancement {
  statut: Surveillance['statut'];
  portee: string[];
  /** IDs distincts des inspecteurs délégués sur la surveillance. */
  delegatedIds: string[];
  /** Signatures après fusion. */
  signatures: SignatureInfo[];
  marqueSgs: boolean;
  sgsEvaluationPrepa?: unknown;
  sgsEvaluationSigneeLe?: string | null;
  scoreGlobalExistant?: number | null;
  scoreGlobalPropose?: number | null;
}

export interface DecisionAvancement {
  peutAvancer: boolean;
  raison?: string;
}

/**
 * Prérequis par partie de la portée :
 *  - SGS      : sgs_evaluation_signee_le — requis uniquement si un workflow
 *               d'éval SGS existe (éval transférée ou signature en cours) ;
 *  - standard : score_global renseigné (posé par la checklist standard).
 */
export function evaluerAvancement(ctx: ContexteAvancement): DecisionAvancement {
  const signedIds = new Set(ctx.signatures.map(s => s.signataire_id))
  const allDelegatedSigned = ctx.delegatedIds.every(id => signedIds.has(id))

  const hasPortee = ctx.portee.length > 0
  const sgsWorkflow = ctx.marqueSgs || !!ctx.sgsEvaluationPrepa || !!ctx.sgsEvaluationSigneeLe
  const needSgs = hasPortee && ctx.portee.includes('SGS') && sgsWorkflow
  const needStd = hasPortee && ctx.portee.some(c => c !== 'SGS')
  const sgsDone = !needSgs || ctx.marqueSgs || !!ctx.sgsEvaluationSigneeLe
  const stdDone = !needStd || ctx.scoreGlobalPropose != null || ctx.scoreGlobalExistant != null

  const peutAvancer =
    ['planifiee', 'en_cours'].includes(ctx.statut) &&
    allDelegatedSigned &&
    sgsDone &&
    stdDone

  let raison: string | undefined
  if (!peutAvancer && ['planifiee', 'en_cours'].includes(ctx.statut)) {
    if (!allDelegatedSigned) raison = "En attente des signatures des autres membres délégués"
    else if (!sgsDone) raison = "L'évaluation SGS doit être signée avant de continuer"
    else if (!stdDone) raison = "La checklist standard doit être signée avant de continuer"
  }
  return { peutAvancer, raison }
}

export interface PatchSignatureDelegation {
  statut: 'checklist_signee';
  progression: 100;
  checklist_signature_url?: string;
  checklist_signe_le: string;
  derniere_activite: string;
  derniere_sync: string;
}

/** Patch d'avancement automatique des délégations du signataire. */
export function buildPatchSignatureDelegation(
  signatureUrl: string | undefined,
  now: string,
): PatchSignatureDelegation {
  return {
    statut: 'checklist_signee',
    progression: 100,
    checklist_signature_url: signatureUrl,
    checklist_signe_le: now,
    derniere_activite: now,
    derniere_sync: now,
  }
}
