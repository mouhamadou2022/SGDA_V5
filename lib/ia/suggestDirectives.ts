'use client';

import { inspecteurVirtuel } from './agents/inspecteurVirtuelAgent';

export interface SuggestedDirectives {
  directive_sa: string
  directive_ns: string
  directive_nv: string
  directive_na: string
}

export interface SuggestDirectivesOptions {
  /** Si fourni, la génération s'appuie sur le contexte de risque AERORISQ de l'aérodrome */
  aerodromeId?: string
  /** Code du domaine (ex: SGS, OPS, PHY) pour calibrer le score AERORISQ */
  domaine?: string
}

export async function suggestDirectives(
  directivePreuve: string,
  pointVerification: string,
  referenceReglementaire: string,
  options?: SuggestDirectivesOptions,
): Promise<SuggestedDirectives> {
  return inspecteurVirtuel.suggestDirectives({
    directivePreuve,
    pointVerification,
    referenceReglementaire,
    aerodromeId: options?.aerodromeId,
    domaine: options?.domaine,
  })
}

export interface SuggestQuestionOptions {
  referenceReglementaire?: string
  guideEtape?: string
  directiveSA?: string
  aerodromeId?: string
  domaine?: string
}

/** Suggère/reformule un point de vérification (question) via l'IA. */
export async function suggestQuestion(
  questionActuelle: string,
  options?: SuggestQuestionOptions,
): Promise<string> {
  const res = await inspecteurVirtuel.suggestQuestion({
    questionActuelle,
    referenceReglementaire: options?.referenceReglementaire,
    guideEtape: options?.guideEtape,
    directiveSA: options?.directiveSA,
    aerodromeId: options?.aerodromeId,
    domaine: options?.domaine,
  })
  return res.question
}

export interface SuggestGuideOptions {
  referenceReglementaire?: string
  guideActuel?: string
  aerodromeId?: string
  domaine?: string
}

/** Suggère le guide d'évaluation étape par étape d'une question via l'IA. */
export async function suggestGuideEtape(
  question: string,
  options?: SuggestGuideOptions,
): Promise<string> {
  const res = await inspecteurVirtuel.suggestGuideEtape({
    question,
    referenceReglementaire: options?.referenceReglementaire,
    guideActuel: options?.guideActuel,
    aerodromeId: options?.aerodromeId,
    domaine: options?.domaine,
  })
  return res.guide
}
