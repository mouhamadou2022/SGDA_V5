// components/modules/planning/useIaSuggestions.ts
// Gestion des suggestions AERORISQ + assistant IA, extraite de
// PlanningModule (comportement identique). La construction du planning
// depuis une suggestion est dédupliquée dans lib/planning-lancement.ts
// (buildPlanningFromSuggestion).

import {
  useAppStore, type AppStore, type Planning, type IaSuggestion,
  type SuggestionFeedback, type Notification,
} from '@/lib/store';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { suggestionMLAgent, extractFeatures } from '@/lib/ia/agents/suggestionMLAgent';
import { buildPlanningFromSuggestion } from '@/lib/planning-lancement';

export interface FeedbackTarget {
  aerodromeId: string;
  suggestionType: string;
  missionType: string;
  ecartIds?: string[];
}

type Notifier = (n: Omit<Notification, 'id' | 'sent_at'>) => void;

export interface DepsIaSuggestions {
  isManager: boolean;
  user: AppStore['user'];
  userRole: string;
  addNotification: Notifier;
  addPlanning: AppStore['addPlanning'];
  removeIaSuggestion: AppStore['removeIaSuggestion'];
  submitSuggestionFeedbackStore: AppStore['submitSuggestionFeedback'];
  setEditingPlanning: (p: Planning | null) => void;
  setFormOpen: (v: boolean) => void;
  setShowIaSuggestionModal: (v: boolean) => void;
  feedbackTarget: FeedbackTarget | null;
  setFeedbackTarget: (v: FeedbackTarget | null) => void;
  feedbackValue: boolean;
  setFeedbackValue: (v: boolean) => void;
  feedbackReason: string;
  setFeedbackReason: (v: string) => void;
  setFeedbackModalOpen: (v: boolean) => void;
  ecarts: AppStore['ecarts'];
  profilsRisque: AppStore['profilsRisque'];
  suggestionFeedbacks: AppStore['suggestionFeedbacks'];
  iaQuestion: string;
  setIsAskingIa: (v: boolean) => void;
  setIaAnswer: (v: string) => void;
  selectedAerodrome: string;
}

export function useIaSuggestions(deps: DepsIaSuggestions) {
  const {
    isManager, user, userRole, addNotification, addPlanning, removeIaSuggestion,
    submitSuggestionFeedbackStore, setEditingPlanning, setFormOpen,
    setShowIaSuggestionModal, feedbackTarget, setFeedbackTarget, feedbackValue,
    setFeedbackValue, feedbackReason, setFeedbackReason, setFeedbackModalOpen,
    ecarts, profilsRisque, suggestionFeedbacks,
    iaQuestion, setIsAskingIa, setIaAnswer, selectedAerodrome,
  } = deps;

  const handleValiderSuggestion = async (suggestion: IaSuggestion) => {
    if (!isManager) return;
    const now = new Date().toISOString()
    const planning = buildPlanningFromSuggestion(suggestion, now)
    try {
      await addPlanning(planning)
      removeIaSuggestion(suggestion.id)
      submitSuggestionFeedbackStore({
        aerodrome_id: suggestion.aerodrome_id,
        suggestion_type: 'audit_complet',
        mission_type_suggeree: suggestion.type,
        etait_pertinent: true,
        date_suggestion: suggestion.created_at,
        date_feedback: now,
      })
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Planning créé',
        message: `Planning ${suggestion.type.replace(/_/g, ' ')} créé à partir de la suggestion AERORISQ.`,
        canal: 'in_app',
      })
    } catch (e) {
      console.error('Erreur validation suggestion:', e)
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Impossible de créer le planning.',
        canal: 'in_app',
      })
    }
  };

  // Ajuster une suggestion → ouvre le formulaire de planning pré-rempli
  const handleAjusterSuggestion = (suggestion: IaSuggestion) => {
    if (!isManager) return;
    setEditingPlanning(buildPlanningFromSuggestion(suggestion, new Date().toISOString()))
    setFormOpen(true)
    setShowIaSuggestionModal(false)
  };

  // Rejeter une suggestion → enregistre le feedback et la supprime
  const handleRejeterSuggestion = (suggestion: IaSuggestion, motif?: string) => {
    if (!isManager) return;
    const now = new Date().toISOString()
    removeIaSuggestion(suggestion.id)
    submitSuggestionFeedbackStore({
      aerodrome_id: suggestion.aerodrome_id,
      suggestion_type: 'audit_complet',
      mission_type_suggeree: suggestion.type,
      etait_pertinent: false,
      raison_inexactitude: motif || 'rejetée',
      date_suggestion: suggestion.created_at,
      date_feedback: now,
    })
  };

  const submitSuggestionFeedback = (aerodromeId: string, suggestionType: string, missionType: string, etaitPertinent: boolean, raison?: string, ecartIds?: string[]) => {
    const feedback: Omit<SuggestionFeedback, 'id'> = {
      aerodrome_id: aerodromeId,
      suggestion_type: suggestionType as SuggestionFeedback['suggestion_type'],
      mission_type_suggeree: missionType,
      etait_pertinent: etaitPertinent,
      raison_inexactitude: raison,
      ecart_ids: ecartIds,
      date_suggestion: new Date().toISOString(),
    };
    submitSuggestionFeedbackStore(feedback);

    const ecart = ecartIds?.[0] ? ecarts.find(e => e.id === ecartIds[0]) : null;
    if (ecart) {
      const profil = profilsRisque[aerodromeId];
      const features = extractFeatures(ecart, profil, ecarts, suggestionFeedbacks);
      const model = suggestionMLAgent.loadModelWeights();
      suggestionMLAgent.updateModelWithFeedback(
        { id: crypto.randomUUID(), ...feedback, date_feedback: new Date().toISOString() },
        features,
        model,
      );
    }

    addNotification({
      user_id: user?.id || '',
      type: etaitPertinent ? 'success' : 'info',
      title: etaitPertinent ? 'Feedback enregistré ✓' : 'Feedback enregistré',
      message: etaitPertinent
        ? 'La suggestion était pertinente — le modèle ML renforce ce pattern.'
        : 'Le modèle ML sera ajusté pour cet aérodrome.',
      canal: 'in_app',
    });
  };

  const openFeedbackModal = (aerodromeId: string, suggestionType: string, missionType: string, ecartIds?: string[]) => {
    setFeedbackTarget({ aerodromeId, suggestionType, missionType, ecartIds });
    setFeedbackValue(true);
    setFeedbackReason('');
    setFeedbackModalOpen(true);
  };

  const confirmFeedback = () => {
    if (!feedbackTarget) return;
    submitSuggestionFeedback(
      feedbackTarget.aerodromeId,
      feedbackTarget.suggestionType,
      feedbackTarget.missionType,
      feedbackValue,
      feedbackValue ? undefined : feedbackReason || undefined,
      feedbackTarget.ecartIds,
    );
    setFeedbackModalOpen(false);
    setFeedbackTarget(null);
  };

  const handleAskAssistant = async () => {
    if (!iaQuestion.trim()) return;
    setIsAskingIa(true);
    try {
      const result = await assistantAgent.chat({
        message: iaQuestion,
        contexte: {
          module: 'planning',
          aerodromeId: selectedAerodrome !== 'all' ? selectedAerodrome : undefined,
        },
        userRole: userRole,
      });
      setIaAnswer(result.message);
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: "Impossible de contacter l'assistant",
        canal: 'in_app',
      });
    } finally {
      setIsAskingIa(false);
    }
  };

  return {
    handleValiderSuggestion,
    handleAjusterSuggestion,
    handleRejeterSuggestion,
    submitSuggestionFeedback,
    openFeedbackModal,
    confirmFeedback,
    handleAskAssistant,
  };
}

/** Sélecteurs store partagés par le hook (évite la dérive des clés). */
export function useIaSuggestionsStore() {
  return {
    addPlanning: useAppStore(s => s.addPlanning),
    removeIaSuggestion: useAppStore(s => s.removeIaSuggestion),
    submitSuggestionFeedbackStore: useAppStore(s => s.submitSuggestionFeedback),
  };
}
