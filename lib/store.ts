// lib/store.ts - VERSION COMPLÈTE FUSIONNÉE
// Contient TOUTES vos fonctionnalités existantes + TOUS les modèles avancés
// À copier-coller INTÉGRALEMENT

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuthUser, buildIdentifiant, PosteANACIM } from './auth'
import { notifyDeletionCascade, notifyAerodromeDeleted } from './notifications'
import { toast } from './toast'
import { risqueUtils } from './risque'
import { plansActionsUtils } from './plansActionsUtils'
import { NIVEAUX_RISQUE_ECART } from './config'
import { riskEngine, DecisionChecklist, DomainDegradation, EcartUrgent } from './riskEngine';
import { ItemHistoryRecord } from './checklistMemory';
import type { TypeSurveillanceContinue, TypeChecklist } from './domaines';
import { supabase } from './supabase'
import * as datastore from './datastore'
import { learningEngine, LearningFeedback, ModelCalibration, RecalibrationAlert } from './learningEngine';
import { learningEnginePAC, PACLearningFeedback, PreuveLearningFeedback } from './learningEnginePAC';
import { createAdvancedModelsSlice, AdvancedModelsSlice } from './store/advancedModelsSlice';
import { createExemptionsSlice, ExemptionSlice } from './store/exemptionsSlice';
// Types canoniques du slice exemptions (source unique : lib/store/exemptionsSlice.ts).
export type { Exemption, MesureAtténuation, ExemptionSlice } from './store/exemptionsSlice';
import { createNotificationsSlice, type Notification, type NotificationSlice } from './store/notificationsSlice';
export type { Notification, NotificationSlice } from './store/notificationsSlice';
import { createDelegationsSlice, DelegationSlice } from './store/delegationsSlice';
export type { Delegation, DelegationSlice } from './store/delegationsSlice';
import { createAlertesSlice, AlerteSlice } from './store/alertesSlice';
export type { AlerteSecuriteFull, AlerteSlice } from './store/alertesSlice';
import { createPresenceSlice, PresenceSlice } from './store/presenceSlice';
export type { PresenceEntry, PresenceSlice } from './store/presenceSlice';
import { createRiskIndexFeedbackSlice, RiskIndexFeedbackSlice } from './store/riskIndexFeedbackSlice';
export type { RiskIndexFeedback, RiskIndexFeedbackSlice } from './store/riskIndexFeedbackSlice';
import { createIaSuggestionsSlice, IaSuggestionSlice } from './store/iaSuggestionsSlice';
export type { IaSuggestion, IaSuggestionSlice } from './store/iaSuggestionsSlice';
import { createSgsMemorySlice, SgsMemorySlice } from './store/sgsMemorySlice';
export type { SgsMemorySlice } from './store/sgsMemorySlice';
import { createSuggestionFeedbacksSlice, SuggestionFeedbackSlice } from './store/suggestionFeedbacksSlice';
export type { SuggestionFeedback, SuggestionFeedbackSlice } from './store/suggestionFeedbacksSlice';
import { createChecklistSlice, type ChecklistSlice, type ChecklistItem, type DomaineChecklist, type SousDomaine, type SousSousDomaine } from './store/checklistSlice';
export type { ChecklistSlice, ChecklistItem, DomaineChecklist, SousDomaine, SousSousDomaine } from './store/checklistSlice';
export { flattenHierarchyItems } from './store/checklistSlice';
import { createEcartsRedactionSlice, type EcartsRedactionSlice, type EcartRedaction } from './store/ecartsRedactionSlice';
export type { EcartsRedactionSlice, EcartRedaction } from './store/ecartsRedactionSlice';
import { createCertificationsSlice, type CertificationSlice, type Certification, type CertificationPhaseData } from './store/certificationsSlice';
export type { CertificationSlice, Certification, CertificationPhaseData } from './store/certificationsSlice';
import { createHomologationsSlice, type HomologationSlice, type Homologation, type HomologationPhaseData } from './store/homologationsSlice';
export type { HomologationSlice, Homologation, HomologationPhaseData } from './store/homologationsSlice';
import { createUISlice, type UISlice } from './store/uiSlice';
export type { UISlice } from './store/uiSlice';
import { createApiKeysSlice, type ApiKeySlice, type ApiKey } from './store/apiKeysSlice';
export type { ApiKeySlice, ApiKey } from './store/apiKeysSlice';
import { createCodesAccesSlice, type CodeAccesSlice, type CodeAcces } from './store/codesAccesSlice';
export type { CodeAccesSlice, CodeAcces } from './store/codesAccesSlice';
import { createAuditSlice, type AuditSlice, type AuditLog } from './store/auditSlice';
export type { AuditSlice, AuditLog } from './store/auditSlice';
import { createRegistresSlice, type RegistreSlice, type RegistreEntry, type CertificationMetadata, type HomologationMetadata } from './store/registresSlice';
export type { RegistreSlice, RegistreEntry, CertificationMetadata, HomologationMetadata } from './store/registresSlice';
import { createRegistreIASlice, type RegistreIASlice, type RegulationAnalysis, type FormationSuggestion } from './store/registreIASlice';
export type { RegistreIASlice, RegulationAnalysis, FormationSuggestion } from './store/registreIASlice';
import { createMasterChecklistsSlice, type MasterChecklistSlice } from './store/masterChecklistsSlice';
export type { MasterChecklistSlice } from './store/masterChecklistsSlice';
import { createEnquetesSlice, type EnqueteSlice, type Enquete, type ReponseEnquete, type StatistiquesEnquete, type QuestionEnquete } from './store/enquetesSlice';
export type { EnqueteSlice, Enquete, ReponseEnquete, StatistiquesEnquete, QuestionEnquete } from './store/enquetesSlice';
import { createMessagerieSlice, type MessagerieSlice, type Message, type Conversation } from './store/messagerieSlice';
export type { MessagerieSlice, Message, Conversation } from './store/messagerieSlice';
import { createAuthSlice, type AuthSlice } from './store/authSlice';
export type { AuthSlice } from './store/authSlice';
import { createUtilisateursSlice, type UtilisateurSlice, type Utilisateur } from './store/utilisateursSlice';
export type { UtilisateurSlice, Utilisateur } from './store/utilisateursSlice';
import { createAerodromesSlice, type AerodromeSlice, type Aerodrome, type PhaseCertification } from './store/aerodromesSlice';
export type { AerodromeSlice, Aerodrome, PhaseCertification } from './store/aerodromesSlice';
export { startDossiersSync, stopDossiersSync } from './store/dossiersSlice';
import { createDossiersSlice, type DossierSlice, type Dossier, type DossierExtension, type DossierFeedback, type DossierCollaborateur, type DossierAssignment, type DossierChecklistItem, type DossierAnalyseCritere, type DossierAnalyseResult, type DossierFormulaire } from './store/dossiersSlice';
export type { DossierSlice, Dossier, DossierExtension, DossierFeedback, DossierCollaborateur, DossierAssignment, DossierChecklistItem, DossierAnalyseCritere, DossierAnalyseResult, DossierFormulaire } from './store/dossiersSlice';
import { createFormationsSlice, type FormationSlice, type Formation, type Competence, type CompetenceDeclarative, type Inspecteur, declarativeNiveauVersNombre, declarativesVersCompetences } from './store/formationsSlice';
export type { FormationSlice, Formation, Competence, CompetenceDeclarative, Inspecteur } from './store/formationsSlice';
export { declarativeNiveauVersNombre, declarativesVersCompetences } from './store/formationsSlice';
import { createKitDocumentsSlice, type KitSlice, type KitDocument } from './store/kitDocumentsSlice';
export type { KitSlice, KitDocument } from './store/kitDocumentsSlice';
import type { TypeDocumentOACI, FormatDocument, KitDocExtrait, KitChecklistItemGenere } from './store/kitTypes';
export type { TypeDocumentOACI, FormatDocument, KitDocExtrait, KitChecklistItemGenere } from './store/kitTypes';
import { createEvenementsSlice, type EvenementSlice, type EvenementSecurite } from './store/evenementsSlice';
export type { EvenementSlice, EvenementSecurite } from './store/evenementsSlice';
import { createAmdecSlice, type AmdecSlice } from './store/amdecSlice';
export type { AmdecSlice } from './store/amdecSlice';
import { createFtaSlice, type FtaSlice } from './store/ftaSlice';
export type { FtaSlice } from './store/ftaSlice';
import { createProfilsSlice, type ProfilRisqueSlice, type ProfilRisque, type VelocityMetricsStored, type SystemStressStored, type ProactiveAlertStored, assainirProfilRisque } from './store/profilsSlice';
export type { ProfilRisqueSlice, ProfilRisque, VelocityMetricsStored, SystemStressStored, ProactiveAlertStored } from './store/profilsSlice';
export { assainirProfilRisque } from './store/profilsSlice';
import { createWorkflowSlice, type WorkflowSlice } from './store/workflowSlice';
export type { WorkflowSlice } from './store/workflowSlice';
import { createRiskEnginesSlice, type RiskEngineSlice } from './store/riskEnginesSlice';
export type { RiskEngineSlice } from './store/riskEnginesSlice';
import { createChecklistMemorySlice, type ChecklistMemorySlice } from './store/checklistMemorySlice';
export type { ChecklistMemorySlice } from './store/checklistMemorySlice';
import { createLearningEnginesSlice, type LearningEngineSlice } from './store/learningEnginesSlice';
export type { LearningEngineSlice } from './store/learningEnginesSlice';
import { createPacLearningSlice, type PACLearningEngineSlice } from './store/pacLearningSlice';
export type { PACLearningEngineSlice } from './store/pacLearningSlice';
import { createRiskAnalyticsSlice, type RiskAnalyticsSlice, type PredictionHistoryRecord, type ActionOutcomeRecord, type ChangePointRecord, type VelocitySnapshotRecord, type StressHistoryRecord, type ProactiveAlertRecord, type ModelPerformanceRecord } from './store/riskAnalyticsSlice';
export type { RiskAnalyticsSlice, PredictionHistoryRecord, ActionOutcomeRecord, ChangePointRecord, VelocitySnapshotRecord, StressHistoryRecord, ProactiveAlertRecord, ModelPerformanceRecord } from './store/riskAnalyticsSlice';
import { createPlanningsSlice, type PlanningSlice, type Planning, type FicheBriefing } from './store/planningsSlice';
export type { PlanningSlice, Planning, FicheBriefing } from './store/planningsSlice';
import { createEcartsSlice, type EcartSlice } from './store/ecartsSlice';
import type { Ecart, SoumissionPAC, EvaluationPAC, SoumissionPreuves, ValidationPreuves, HistoriqueEcart, StatistiquesPAC } from './store/ecartsTypes';
export type { EcartSlice } from './store/ecartsSlice';
export type { Ecart, SoumissionPAC, EvaluationPAC, SoumissionPreuves, ValidationPreuves, HistoriqueEcart, StatistiquesPAC } from './store/ecartsTypes';
import { createSurveillancesSlice, type SurveillanceSlice, type Surveillance } from './store/surveillancesSlice';
export type { SurveillanceSlice, Surveillance } from './store/surveillancesSlice';
import { syncLearningFromStore, syncPACFromStore, startScheduledLearningRecalibration } from './learningPersistence';
import { codeAccesUtils } from './codeAccesUtils';
import { registreUtils } from './registreUtils';
import { genererPlanning } from './services/planningGenerator';
import { isPlanningTerminal, normalizePlanningType, type PlanningStatut, type PlanningType } from './planning';
import type { ResultatChecklist } from '@/types/checklist';
import type { HelistationData } from './types/helistation'
import { mapTypeInstallationToSousType } from './types/helistation'
import type { SuggestionDetaillee } from './checklistMemory';
import type { NiveauRisque, ScoreHistoryPoint } from './risque/types';
import type { AmdecAnalyse } from './risque/amdecEngine';
import type { ArbreFTA, NoeudFTA } from './risque/ftaEngine';
import { dedupeHierarchyItems } from './checklistNormalize';
// Ré-exporter ScoreHistoryPoint depuis risque/types.ts (type canonique unique)
// pour les modules qui importent depuis '@/lib/store' sans changer leurs imports.
export type { ScoreHistoryPoint } from './risque/types';
export type { AmdecAnalyse } from './risque/amdecEngine';
export type { ArbreFTA, NoeudFTA } from './risque/ftaEngine';

// ============================================================
// Types métier existants
// ============================================================

export type ChecklistMemoryRecord = ItemHistoryRecord;
export type LearningFeedbackRecord = LearningFeedback;
export type ModelCalibrationRecord = ModelCalibration;
export type RecalibrationAlertRecord = RecalibrationAlert;
export type DecisionChecklistRecord = DecisionChecklist;
export type PACLearningFeedbackRecord = PACLearningFeedback;
export type PreuveLearningFeedbackRecord = PreuveLearningFeedback;

export type { SuggestionDetaillee as ChecklistSuggestion } from './checklistMemory';
import { evaluatePAC, computeInitialCell } from './risque/bowTieEngine';

// ============================================================
// Assainissement des valeurs numériques NaN / hors bornes
// (profil de risque : un NaN issu d'un calcul live ne doit jamais
//  atteindre le store — sinon il se propage aux cartes dérivées)
// ============================================================

// toFiniteNumber : source unique lib/utils.ts (réexporté pour compatibilité).
import { toFiniteNumber } from './utils';
export { toFiniteNumber };

// assainirProfilRisque : source unique lib/store/profilsSlice.ts
// (importé et réexporté en tête de fichier pour les rares usages directs).

// Types Exemption / MesureAtténuation : source unique lib/store/exemptionsSlice.ts
// (réexportés en tête de fichier pour les importateurs '@/lib/store').

export type TypeEntiteAerodrome = 'aerodrome' | 'helistation' | 'mixte'

// Types Aerodrome, PhaseCertification : source unique lib/store/aerodromesSlice.ts
// (importés et réexportés en tête de fichier).

export interface SignatureInfo {
  signataire_id: string;
  signataire_nom: string;
  date_signature: string;
  signature_url: string;
}

// Type Surveillance : source unique lib/store/surveillancesSlice.ts
// (importé et réexporté en tête de fichier).

// Types Ecart + PAC/preuves/historique/statistiques : source unique
// lib/store/ecartsTypes.ts (importés et réexportés en tête de fichier).

// ============================================================
// PROFIL RISQUE ENRICHIE AVEC MODÈLES AVANCÉS
// ============================================================

// Types pour les modèles avancés
// Types VelocityMetricsStored, SystemStressStored, ProactiveAlertStored :
// source unique lib/store/profilsSlice.ts (importés et réexportés en tête).

// Type ProfilRisque : source unique lib/store/profilsSlice.ts
// (importé et réexporté en tête de fichier).
// ============================================================
// Types PredictionHistoryRecord, ActionOutcomeRecord, ChangePointRecord,
// VelocitySnapshotRecord, StressHistoryRecord, ProactiveAlertRecord,
// ModelPerformanceRecord : source unique lib/store/riskAnalyticsSlice.ts.
// Interface RiskAnalyticsSlice : idem.
// Type ModelPerformanceRecord : source unique lib/store/riskAnalyticsSlice.ts
// (importé et réexporté en tête de fichier).

// ============================================================
// Types existants (suite)
// ============================================================

// Type Notification : source unique lib/store/notificationsSlice.ts (réexporté en tête).

// Types EcartRedaction, ChecklistItem, SousSousDomaine, SousDomaine,
// DomaineChecklist : sources uniques dans lib/store/ecartsRedactionSlice.ts
// et lib/store/checklistSlice.ts (importés et réexportés en tête de fichier).

export type ChecklistTemplateType = 'IT' | 'SOP' | 'QSC' | 'SGS' | 'VALIDATION_SITE' | 'HMG' | 'COP' | 'AUT'
export type ChecklistTemplateEtat = 'brouillon' | 'publie' | 'archive'
export type ChecklistTemplateCategorie = 'homologation' | 'certification' | 'surveillance_continue' | 'validation_site' | 'autres'
export type ChecklistTemplateRegime = 'certifie' | 'homologue' | 'tous'
export type ChecklistTemplateSousTypeEntite = 'helistation_surface' | 'helistation_mer' | 'heliplateforme'

export interface ChecklistTemplate {
  id: string
  type: ChecklistTemplateType
  code: string
  nom: string
  version: string
  edition_date?: string
  source_fichier?: string
  fichier_url?: string
  description?: string
  portee: string[]
  type_entite_cible: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
  /** Sous-type d'hélistation quand type_entite_cible = 'helistation' (surface, en mer, héliplateforme). */
  sous_type_entite?: ChecklistTemplateSousTypeEntite
  /** Famille métier guidée à l'import (homologation, certification, surveillance_continue, validation_site, autres) */
  categorie?: ChecklistTemplateCategorie
  /** Régime pour la surveillance continue : certifie | homologue | tous */
  regime?: ChecklistTemplateRegime
  etat: ChecklistTemplateEtat
  hierarchie: DomaineChecklist[]
  metadonnees?: Record<string, unknown>
  actif: boolean
  created_at: string
  updated_at: string
  created_by?: string
  updated_by?: string
}

// Type Certification : source unique lib/store/certificationsSlice.ts
// (importé et réexporté en tête de fichier).

// Types Homologation, HomologationPhaseData, Certification, CertificationPhaseData :
// sources uniques dans lib/store/homologationsSlice.ts et
// lib/store/certificationsSlice.ts (importés et réexportés en tête de fichier).

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T


// Type Utilisateur : source unique lib/store/utilisateursSlice.ts
// (importé et réexporté en tête de fichier).

// Type EvenementSecurite : source unique lib/store/evenementsSlice.ts
// (importé et réexporté en tête de fichier).

// Types QuestionEnquete, Enquete, ReponseEnquete, StatistiquesEnquete : source
// unique lib/store/enquetesSlice.ts. Types Message, Conversation : source
// unique lib/store/messagerieSlice.ts. (Importés et réexportés en tête.)

// Types Dossier + famille (DossierExtension, DossierFeedback,
// DossierCollaborateur, DossierAssignment, DossierChecklistItem,
// DossierAnalyseCritere, DossierAnalyseResult, DossierFormulaire) : source
// unique lib/store/dossiersSlice.ts (importés et réexportés en tête).

// Fiche de briefing pré-mission générée par l'IA dans le module Planning
// Types Planning, FicheBriefing : source unique lib/store/planningsSlice.ts
// (importés et réexportés en tête de fichier).

// Types Formation, Competence, CompetenceDeclarative, Inspecteur + helpers
// declarativeNiveauVersNombre / declarativesVersCompetences : source unique
// lib/store/formationsSlice.ts (importés et réexportés en tête de fichier).

// Types TypeDocumentOACI, FormatDocument, KitDocExtrait,
// KitChecklistItemGenere : source unique lib/store/kitTypes.ts
// (importés et réexportés en tête de fichier).

// Type KitDocument : source unique lib/store/kitDocumentsSlice.ts
// Interfaces RiskEngineSlice, ChecklistMemorySlice, LearningEngineSlice,
// PACLearningEngineSlice : sources uniques dans lib/store/<nom>Slice.ts
// (importées et réexportées en tête de fichier).

// Interfaces ChecklistSlice, EcartsRedactionSlice : sources uniques dans
// lib/store/checklistSlice.ts et lib/store/ecartsRedactionSlice.ts
// (importées et réexportées en tête de fichier).

// Interface WorkflowSlice : source unique lib/store/workflowSlice.ts
// (importée et réexportée en tête de fichier).

// Interfaces AuthSlice, AerodromeSlice : sources uniques dans
// lib/store/authSlice.ts et lib/store/aerodromesSlice.ts
// (importées et réexportées en tête de fichier).

// Interface EcartSlice : source unique lib/store/ecartsSlice.ts
// (importée et réexportée en tête de fichier).

// Interface ProfilRisqueSlice : source unique lib/store/profilsSlice.ts
// (importée et réexportée en tête de fichier).

// Interface NotificationSlice : source unique lib/store/notificationsSlice.ts
// (importée et réexportée en tête de fichier).

// Interfaces CertificationSlice, HomologationSlice : sources uniques dans
// lib/store/certificationsSlice.ts et lib/store/homologationsSlice.ts
// (importées et réexportées en tête de fichier).

// Interface UISlice : source unique lib/store/uiSlice.ts
// (importée et réexportée en tête de fichier).

// Interface PlanningSlice : source unique lib/store/planningsSlice.ts
// (importée et réexportée en tête de fichier).

// Interface SurveillanceSlice : source unique lib/store/surveillancesSlice.ts
// (importée et réexportée en tête de fichier).

// Interface UtilisateurSlice : source unique lib/store/utilisateursSlice.ts
// (importée et réexportée en tête de fichier).

// Interface EvenementSlice : source unique lib/store/evenementsSlice.ts
// (importée et réexportée en tête de fichier).

// Interfaces EnqueteSlice, MessagerieSlice : sources uniques dans
// lib/store/enquetesSlice.ts et lib/store/messagerieSlice.ts
// (importées et réexportées en tête de fichier).

// Interfaces DossierSlice, FormationSlice, KitSlice : sources uniques dans
// lib/store/dossiersSlice.ts, lib/store/formationsSlice.ts,
// lib/store/kitDocumentsSlice.ts (importées et réexportées en tête).

// Interfaces MasterChecklistSlice, ApiKeySlice, CodeAccesSlice, RegistreSlice,
// RegistreIASlice, AuditSlice : sources uniques dans lib/store/<nom>Slice.ts
// (importées et réexportées en tête de fichier).

// Interface RiskAnalyticsSlice : source unique lib/store/riskAnalyticsSlice.ts
// (importée et réexportée en tête de fichier).

// ============================================================
// SLICE AMDEC — Analyse des Modes de Défaillance et de leur Criticité
// ============================================================

// Interfaces AmdecSlice, FtaSlice : sources uniques dans
// lib/store/amdecSlice.ts et lib/store/ftaSlice.ts
// (importées et réexportées en tête de fichier).

// ============================================================
// STORE COMPLET
// ============================================================

export interface AppStore extends
  AuthSlice,
  AerodromeSlice,
  SurveillanceSlice,
  EcartSlice,
  PlanningSlice,
  ProfilRisqueSlice,
  NotificationSlice,
  ExemptionSlice,
  CertificationSlice,
  HomologationSlice,
   UISlice,
   RegistreSlice,
   ChecklistSlice,      
   EcartsRedactionSlice, 
   WorkflowSlice,
   EvenementSlice,
   EnqueteSlice,
   MessagerieSlice,
   DossierSlice,
  FormationSlice,
  KitSlice,
  MasterChecklistSlice,
  CodeAccesSlice,
  AuditSlice,
  UtilisateurSlice,
   ApiKeySlice,
   RiskEngineSlice,
   ChecklistMemorySlice,
   LearningEngineSlice,
  PACLearningEngineSlice,
  RiskAnalyticsSlice,
  RegistreIASlice,
  AdvancedModelsSlice,
  DelegationSlice,
  AlerteSlice,
  PresenceSlice,
   RiskIndexFeedbackSlice,
   IaSuggestionSlice,
   SuggestionFeedbackSlice,
   SgsMemorySlice,
   AmdecSlice,
   FtaSlice {}


// Interfaces DelegationSlice, AlerteSlice, PresenceSlice, RiskIndexFeedbackSlice,
// IaSuggestion(+Slice), SuggestionFeedback(+Slice), SgsMemorySlice : sources
// uniques dans lib/store/<nom>Slice.ts (réexportées en tête de fichier).

import { zustandIDBStorage } from '@/lib/persistence/zustandStorage'

// Helpers stripHtmlToText, normalizeEcartNiveau, extractEcartsFromRapportHtml :
// usage exclusif du workflow — déplacés dans lib/store/workflowSlice.ts.

// Timer pour vérifier les rappels + vigie risque toutes les heures
let rappelsTimerId: ReturnType<typeof setInterval> | null = null

// flattenHierarchyItems : source unique lib/store/checklistSlice.ts
// (réexporté en tête de fichier pour les importateurs '@/lib/store').

export const useAppStore = create<AppStore>()(
  persist(
    (set, get, api) => ({
      // ============================================================
      // AUTH SLICE — extrait dans lib/store/authSlice.ts (Phase 2).
      // ============================================================
      ...createAuthSlice(set, get, api),

      // ============================================================
      // UTILISATEUR SLICE — extrait dans lib/store/utilisateursSlice.ts (Phase 2).
      // ============================================================
      ...createUtilisateursSlice(set, get, api),

      // ============================================================
      // EXEMPTION SLICE — extrait dans lib/store/exemptionsSlice.ts (Phase 2).
      // Comportement identique, composé ici comme advancedModelsSlice.
      // ============================================================
      ...createExemptionsSlice(set, get, api),

// Dans le create, ajouter les implémentations
// Dans le create, ajouter les implémentations
      // ============================================================
      // REGISTRE SLICE — extrait dans lib/store/registresSlice.ts (Phase 2).
      // ============================================================
      ...createRegistresSlice(set, get, api),
      // ============================================================
      // AERODROME SLICE — extrait dans lib/store/aerodromesSlice.ts (Phase 2).
      // ============================================================
      ...createAerodromesSlice(set, get, api),

      // ============================================================
      // ============================================================
      // RISKENGINE SLICE — extrait dans lib/store/riskEnginesSlice.ts (Phase 2).
      // ============================================================
      ...createRiskEnginesSlice(set, get, api),
      // ============================================================
      // CHECKLISTMEMORY SLICE — extrait dans lib/store/checklistMemorySlice.ts (Phase 2).
      // ============================================================
      ...createChecklistMemorySlice(set, get, api),
      // ============================================================
      // LEARNINGENGINE SLICE — extrait dans lib/store/learningEnginesSlice.ts (Phase 2).
      // ============================================================
      ...createLearningEnginesSlice(set, get, api),
      ...createSgsMemorySlice(set, get, api),
      ...createSurveillancesSlice(set, get, api),
      ...createEcartsSlice(set, get, api),

      // ============================================================
      // IMPLÉMENTATION DES SLICES DANS LE STORE surveillance
      // ============================================================

      // Slices extraits (Phase 2) — comportement identique, sources uniques
      // dans lib/store/<nom>Slice.ts, composés comme advancedModelsSlice.
      ...createDelegationsSlice(set, get, api),
      ...createAlertesSlice(set, get, api),
      ...createPresenceSlice(set, get, api),
      ...createRiskIndexFeedbackSlice(set, get, api),
      ...createIaSuggestionsSlice(set, get, api),
      ...createSuggestionFeedbacksSlice(set, get, api),


      // ============================================================
      // ============================================================
      // PROFIL RISQUE SLICE — extrait dans lib/store/profilsSlice.ts (Phase 2).
      // ============================================================
      ...createProfilsSlice(set, get, api),

      // ============================================================
      // ============================================================
      // NOTIFICATION SLICE — extrait dans lib/store/notificationsSlice.ts (Phase 2).
      // Comportement identique (throttle email déplacé avec le slice).
      // ============================================================
      ...createNotificationsSlice(set, get, api),

      // ============================================================
      // CERTIFICATION SLICE — extrait dans lib/store/certificationsSlice.ts (Phase 2).
      // ============================================================
      ...createCertificationsSlice(set, get, api),

      // ============================================================
      // HOMOLOGATION SLICE — extrait dans lib/store/homologationsSlice.ts (Phase 2).
      // ============================================================
      ...createHomologationsSlice(set, get, api),

      // ============================================================
      // PLANNING SLICE — extrait dans lib/store/planningsSlice.ts (Phase 2).
      // ============================================================
      ...createPlanningsSlice(set, get, api),

      // ============================================================
      // EVENEMENT SLICE — extrait dans lib/store/evenementsSlice.ts (Phase 2).
      // (actions workflow incluses : le bloc implémentation était scindé en deux.)
      // ============================================================
      ...createEvenementsSlice(set, get, api),
      // ============================================================
      // AMDEC SLICE — extrait dans lib/store/amdecSlice.ts (Phase 2).
      // ============================================================
      ...createAmdecSlice(set, get, api),
      // ============================================================
      // FTA SLICE — extrait dans lib/store/ftaSlice.ts (Phase 2).
      // ============================================================
      ...createFtaSlice(set, get, api),
      // ============================================================
      // ENQUETE SLICE — extrait dans lib/store/enquetesSlice.ts (Phase 2).
      // ============================================================
      ...createEnquetesSlice(set, get, api),

      // ============================================================
      // MESSAGERIE SLICE — extrait dans lib/store/messagerieSlice.ts (Phase 2).
      // ============================================================
      ...createMessagerieSlice(set, get, api),

      // ============================================================
      // REGISTRE IA SLICE — extrait dans lib/store/registreIASlice.ts (Phase 2).
      // ============================================================
      ...createRegistreIASlice(set, get, api),

      // ============================================================
      // DOSSIER SLICE — extrait dans lib/store/dossiersSlice.ts (Phase 2).
      // ============================================================
      ...createDossiersSlice(set, get, api),
      getDossiersUrgents: () => get().dossiers.filter(d => d.statut === 'en_cours' || d.statut === 'en_attente'),

      // ============================================================
      // FORMATION SLICE — extrait dans lib/store/formationsSlice.ts (Phase 2).
      // ============================================================
      ...createFormationsSlice(set, get, api),

      // ============================================================
      // KIT SLICE — extrait dans lib/store/kitDocumentsSlice.ts (Phase 2).
      // ============================================================
      ...createKitDocumentsSlice(set, get, api),

      // ============================================================
      // MASTER CHECKLIST SLICE — extrait dans lib/store/masterChecklistsSlice.ts (Phase 2).
      // ============================================================
      ...createMasterChecklistsSlice(set, get, api),

      // ============================================================
      // API KEYS SLICE — extrait dans lib/store/apiKeysSlice.ts (Phase 2).
      // ============================================================
      ...createApiKeysSlice(set, get, api),

      // ============================================================
      // CODE ACCES SLICE — extrait dans lib/store/codesAccesSlice.ts (Phase 2).
      // ============================================================
      ...createCodesAccesSlice(set, get, api),

      // ============================================================
      // AUDIT SLICE — extrait dans lib/store/auditSlice.ts (Phase 2).
      // ============================================================
      ...createAuditSlice(set, get, api),

      // ============================================================
      // UI SLICE — extrait dans lib/store/uiSlice.ts (Phase 2).
      // ============================================================
      ...createUISlice(set, get, api),

      // ============================================================
      // CHECKLIST SLICE — extrait dans lib/store/checklistSlice.ts (Phase 2).
      // ============================================================
      ...createChecklistSlice(set, get, api),

      // ============================================================
      // ECARTS REDACTION SLICE — extrait dans lib/store/ecartsRedactionSlice.ts (Phase 2).
      // ============================================================
      ...createEcartsRedactionSlice(set, get, api),

      // ============================================================
      // ============================================================
      // WORKFLOW SLICE — extrait dans lib/store/workflowSlice.ts (Phase 2).
      // ============================================================
      ...createWorkflowSlice(set, get, api),
      // ============================================================
      // RISKANALYTICS SLICE — extrait dans lib/store/riskAnalyticsSlice.ts (Phase 2).
      // ============================================================
      ...createRiskAnalyticsSlice(set, get, api),
      // ============================================================
      // PACLEARNING SLICE — extrait dans lib/store/pacLearningSlice.ts (Phase 2).
      // ============================================================
      ...createPacLearningSlice(set, get, api),

      // ============================================================
      // ADVANCED MODELS SLICE (Random Forest + Graph Network)
      // ============================================================
      // (getActiveEcarts rapatrié dans lib/store/ecartsSlice.ts — il y était
      // égaré dans le bloc Advanced Models.)
      getHawkesRiskForAerodrome: (aerodromeId) => {
        try {
          const ecartsAero = get().ecarts.filter((e: Ecart) => e.aerodrome_id === aerodromeId);
          const hawkesInput = ecartsAero.map((e: Ecart) => ({ createdAt: e.created_at, niveau: e.niveau_risque }));
          return risqueUtils.computeHawkesContagion(hawkesInput);
        }
        catch (e) { return { riskNext30Days: 50, currentIntensity: 0.5 }; }
      },
      getRecurrentPatterns: (aerodromeId) => {
        try {
          const ecartsAero = get().ecarts.filter(e => e.aerodrome_id === aerodromeId);
          return risqueUtils.detectChangePoints(ecartsAero.map(e => ({ date: e.date_detection || e.created_at, score: e.niveau_risque === 'critique' ? 90 : e.niveau_risque === 'eleve' ? 70 : e.niveau_risque === 'moyen' ? 50 : 30 })));
        } catch (e) { return []; }
      },
      getBanditRecommendation: (context) => {
        try { return risqueUtils.computeActionEffectiveness(context as unknown as { type: string; improvement: number; costDays: number }[]); }
        catch (e) { return null; }
      },
      updateBanditReward: (_context, _actionId, _reward) => {},
      getTransferPredictions: (_aerodromeId) => new Map(),
      ...createAdvancedModelsSlice(set, get),
    }),
    {
      storage: zustandIDBStorage,
      name: 'sgda-storage',
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        if (version >= 4) return persistedState as never
        // Migration progressive : préserver les données existantes,
        // ne réinitialiser que ce qui est nécessaire pour la nouvelle version
        const old = (persistedState || {}) as Record<string, unknown>

        // v4 : normalisation gravité événements (échelle OACI 5 niveaux → risque 4 niveaux)
        const GRAVITE_MAP_V4: Record<string, string> = { CRITIQUE: 'critique', ORANGE: 'eleve', JAUNE: 'moyen', GRIS: 'faible', BLEU: 'faible' }
        const normaliserGraviteV4 = (g: unknown): unknown => {
          if (typeof g !== 'string') return g
          const lower = g.trim().toLowerCase()
          if (lower === 'critique' || lower === 'eleve' || lower === 'moyen' || lower === 'faible') return lower
          return GRAVITE_MAP_V4[g.trim()] || g
        }
        const evenements = Array.isArray(old.evenements)
          ? (old.evenements as Array<Record<string, unknown>>).map(e => ({ ...e, gravite: normaliserGraviteV4(e.gravite) }))
          : []

        if (version === 3) {
          return { ...old, evenements } as never
        }

        // Migration v1/v2 → v4 : préserver les données existantes
        return {
          aerodromes: Array.isArray(old.aerodromes) ? old.aerodromes : [],
          utilisateurs: Array.isArray(old.utilisateurs) ? old.utilisateurs : [],
          ecarts: Array.isArray(old.ecarts) ? old.ecarts : [],
          profilsRisque: (old.profilsRisque && typeof old.profilsRisque === 'object') ? old.profilsRisque : {},
          historiqueScores: (old.historiqueScores && typeof old.historiqueScores === 'object') ? old.historiqueScores : {},
          proactiveAlerts: Array.isArray(old.proactiveAlerts) ? old.proactiveAlerts : [],
          surveillances: Array.isArray(old.surveillances) ? old.surveillances : [],
          certifications: Array.isArray(old.certifications) ? old.certifications : [],
          homologations: Array.isArray(old.homologations) ? old.homologations : [],
          exemptions: Array.isArray(old.exemptions) ? old.exemptions : [],
          plannings: Array.isArray(old.plannings) ? old.plannings : [],
          kitDocuments: Array.isArray(old.kitDocuments) ? old.kitDocuments : [],
          masterChecklists: (old.masterChecklists && typeof old.masterChecklists === 'object') ? old.masterChecklists : {},
          archivedMasterChecklists: (old.archivedMasterChecklists && typeof old.archivedMasterChecklists === 'object') ? old.archivedMasterChecklists : {},
          templateVersions: (old.templateVersions && typeof old.templateVersions === 'object') ? old.templateVersions : {},
          notifications: Array.isArray(old.notifications) ? old.notifications : [],
          delegations: Array.isArray(old.delegations) ? old.delegations : [],
          dossiers: Array.isArray(old.dossiers) ? old.dossiers : [],
          evenements,
        } as never
      },
      partialize: (state) => ({
        // Données métier critiques — doivent survivre au rechargement
        aerodromes: state.aerodromes,
        surveillances: state.surveillances,
        ecarts: state.ecarts,
        ecartsRedaction: state.ecartsRedaction,
        historiqueEcarts: state.historiqueEcarts,
        utilisateurs: state.utilisateurs,
        profilsRisque: state.profilsRisque,
        historiqueScores: state.historiqueScores,
        certifications: state.certifications,
        homologations: state.homologations,
        exemptions: state.exemptions,
        plannings: state.plannings,
        propositionsN1: state.propositionsN1,
        dossiers: state.dossiers,
        formations: state.formations,
        inspecteurs: state.inspecteurs,
        evenements: state.evenements,
        enquetes: state.enquetes,
        codesAcces: state.codesAcces,
        registreEntries: state.registreEntries,
        delegations: state.delegations,
        alertesSecurite: state.alertesSecurite,
        fichesPresence: state.fichesPresence,
        kitDocuments: state.kitDocuments,
        masterChecklists: state.masterChecklists,
        archivedMasterChecklists: state.archivedMasterChecklists,
        templateVersions: state.templateVersions,
        // UI
        filters: state.filters,
        viewMode: state.viewMode,
        theme: state.theme,
        notifications: state.notifications,
        messages: state.messages,
        apiKeys: state.apiKeys,
        auditLogs: state.auditLogs,
        iaSuggestions: state.iaSuggestions,
        suggestionFeedbacks: state.suggestionFeedbacks,
        checklistMemoryRecords: state.checklistMemoryRecords,
        sgsMemoryRecords: state.sgsMemoryRecords,
        amdecAnalyses: state.amdecAnalyses,
        ftaAnalyses: state.ftaAnalyses,
      }),
      onRehydrateStorage: () => {
        clearRappelsTimer()
        startRappelsTimer()
        let deferred = false
        return (state) => {
          if (!state) return
          useAppStore.setState({ _hydrated: true })
          if (!deferred) {
            deferred = true
            // Déférer la synchronisation ML après le rendu initial
            requestAnimationFrame(() => {
              syncLearningFromStore({
                learningFeedbacks: (state as any).learningFeedbacks || [],
                recalibrationAlerts: (state as any).recalibrationAlerts || [],
                currentModel: (state as any).currentModel || null,
              })
              syncPACFromStore({
                pacFeedbacks: (state as any).pacFeedbacks || [],
                preuveFeedbacks: (state as any).preuveFeedbacks || [],
                ponderationsCriteres: (state as any).ponderationsCriteres || {},
                ponderationsPriorisation: (state as any).ponderationsPriorisation || {},
              })
              if (typeof window !== 'undefined') {
                startScheduledLearningRecalibration(
                  () => ({ currentModel: (state as any).currentModel || null }),
                  (declencheur, initiePar) => {
                    const model = learningEngine.recalibrateModel(declencheur || 'auto', initiePar || 'system')
                    return model
                  }
                )
              }
            })
          }
        }
      },
    }
  )
)

// startDossiersSync / stopDossiersSync : source unique lib/store/dossiersSlice.ts
// (réexportés en tête de fichier — la sync polling vit avec son slice).

// ============================================================
// Hooks utilitaires : voir ./store/hooks.ts (re-exportés ici —
// importateurs `@/lib/store` inchangés).
// ============================================================
export * from './store/hooks';
// (emailThrottle déplacé dans lib/store/notificationsSlice.ts avec son slice.)

function startRappelsTimer() {
  clearRappelsTimer()
  if (typeof window === 'undefined') return
  rappelsTimerId = setInterval(() => {
    // Un appelant = trois vigies propriétaires (écarts, dossiers, plannings).
    const s = useAppStore.getState()
    s.verifierRappelsEcarts()
    s.verifierRappelsDossiers()
    s.verifierPlanningsDepasses()
    import('./services/vigieRisque').then(({ declencherVigie }) => declencherVigie()).catch((err) => console.error('[Vigie] échec déclenchement:', err))
  }, 60 * 60 * 1000)
}

export function clearRappelsTimer() {
  if (rappelsTimerId !== null) {
    clearInterval(rappelsTimerId)
    rappelsTimerId = null
  }
}

// ============================================================
// Synchronisation inter-slices par événements (monolithe modulaire).
// Les slices ÉMETTENT (storeEvents.emit) ; seul ce registre S'ABONNE.
// Idempotent (StrictMode / HMR) : un seul abonnement par événement.
// ============================================================
import { storeEvents } from './store/eventBus';

let subscriptionsRegistered = false;

export function registerStoreSubscriptions(): void {
  if (subscriptionsRegistered) return;
  subscriptionsRegistered = true;

  // Risque : tout changement métier invalide le profil (remplace les
  // ~13 appels directs get().recalculerProfilRisque dispersés).
  storeEvents.on('risque:recalcul-demande', ({ aerodrome_id }) => {
    useAppStore.getState().recalculerProfilRisque(aerodrome_id).catch(() => {});
  });

  // Planning : une mission transmise/archivée termine son planning lié.
  // La mutation appartient au slice plannings (testé isolément) ; ici,
  // simple routage événement → action propriétaire.
  storeEvents.on('planning:mission-terminee', ({ planning_id, surveillance_id }) => {
    useAppStore.getState().marquerMissionTerminee(planning_id, surveillance_id);
  });

  // Planning : une surveillance supprimée restaure son planning à planifiée.
  storeEvents.on('planning:mission-annulee', ({ planning_id }) => {
    useAppStore.getState().restaurerMissionAnnulee(planning_id);
  });

  // Notifications : infra transverse, un seul abonné (le slice propriétaire).
  // Remplace les ~65 appels directs get().addNotification dispersés.
  storeEvents.on('notification:envoyer', (payload) => {
    useAppStore.getState().addNotification(payload);
  });

  // Registre : journal append-only, un seul abonné (fire-and-forget,
  // comme les appelants directs d'avant — l'action ne rejette jamais).
  storeEvents.on('registre:ajouter', (entry) => {
    void useAppStore.getState().addRegistreEntry(entry);
  });

  // Messagerie : un seul abonné.
  storeEvents.on('message:envoyer', (message) => {
    useAppStore.getState().envoyerMessage(message);
  });

  // Utilisateurs liés (cascade codes d'accès) : suppression best-effort,
  // repli désactivation si la suppression échoue (politique centralisée ici,
  // identique à l'ancien try/catch inline des émetteurs).
  storeEvents.on('utilisateur:supprimer-lie', ({ user_id }) => {
    const state = useAppStore.getState();
    state.deleteUtilisateur(user_id).catch(() => {
      state.updateUtilisateur(user_id, { statut: 'inactif' }).catch(() => {});
    });
  });
  storeEvents.on('utilisateur:desactiver', ({ user_id }) => {
    useAppStore.getState().updateUtilisateur(user_id, { statut: 'inactif' }).catch(() => {});
  });

  // Miroir inspecteur : la tranche utilisateurs émet le patch calculé,
  // la tranche formations applique (filtre DB inclus).
  storeEvents.on('inspecteur:synchroniser', ({ inspecteur_id, patch }) => {
    useAppStore.getState().updateInspecteur(inspecteur_id, patch as Partial<Inspecteur>).catch(() => {});
  });

  // Écart construit par un autre module : intégration idempotente.
  storeEvents.on('ecart:integrer-externe', (ecart) => {
    useAppStore.getState().integrerEcartExterne(ecart);
  });

  // Flags de rappels : la tranche plannings reste propriétaire.
  storeEvents.on('planning:marquer-rappels', ({ planning_id, rappels }) => {
    useAppStore.getState().marquerRappelsEnvoyes(planning_id, rappels);
  });

  // Nettoyage des liens phases : tranches propriétaires.
  storeEvents.on('certification:nettoyer-lien-surveillance', ({ aerodrome_id, surveillance_id }) => {
    useAppStore.getState().nettoyerLienSurveillanceCertification(aerodrome_id, surveillance_id);
  });
  storeEvents.on('homologation:nettoyer-lien-surveillance', ({ aerodrome_id, surveillance_id }) => {
    useAppStore.getState().nettoyerLienSurveillanceHomologation(aerodrome_id, surveillance_id);
  });
  storeEvents.on('certification:nettoyer-lien-planning', ({ aerodrome_id, planning_id }) => {
    useAppStore.getState().nettoyerLienPlanningCertification(aerodrome_id, planning_id);
  });
  storeEvents.on('homologation:nettoyer-lien-planning', ({ aerodrome_id, planning_id }) => {
    useAppStore.getState().nettoyerLienPlanningHomologation(aerodrome_id, planning_id);
  });
}

registerStoreSubscriptions();

