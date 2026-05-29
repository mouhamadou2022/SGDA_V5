// components/modules/planning/PlanningModule.tsx
// VERSION FINALE CORRIGÉE
// ✅ Suppression des fonctions dupliquées getFrequenceSuggerer et getTypeSuggerer
// ✅ Utilisation de computeFinalFrequency et suggestMissionType depuis risque.ts
// ✅ Ajout du feedback utilisateur pour l'apprentissage
// ✅ Correction de handleLancer (position du feedback)
// ✅ Déplacement de enregistrerFeedbackPlanning dans le composant
// ✅ Refonte de PreparationModal avec les classes CSS globales (.tabs, .tab, .tab-content)
// 0 style inline, 0 fetch direct

'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { FormShell } from '@/components/ui/FormShell';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore, Planning, Aerodrome, ProfilRisque, Surveillance, Utilisateur, Ecart } from '@/lib/store';
import { getProcessusActifs } from '@/lib/processus';
import {
  CalendarDays,
  List,
  LayoutGrid,
  LayoutList,
  Plus,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Download,
  Activity,
  Users,
  Briefcase,
  TrendingUp,
  Search,
  AlertTriangle,
  Shield,
  Target,
  Info,
  PlayCircle,
  Edit2,
  MapPin,
  Brain,
  Loader2,
  Send,
  XCircle,
} from 'lucide-react';

import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';

// Store
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { DOMAINES_SURVEILLANCE, getDomaineLabel, expandDomaines, genererSuggestionsMaintien, type SuggestionMaintien } from '@/lib/domaines';

// Composants du module
import { PlanningCalendarView } from './PlanningCalendarView';
import PlanningGanttView from './PlanningGanttView';
import PlanningForm from '@/components/forms/PlanningForm';
import { WorkloadView } from './WorkloadView';
import { SmartAssignment } from './SmartAssignment';
import PlanningNPlus1 from './PlanningNPlus1';
import PreparationModal from './PreparationModal'
import { PlanningCard } from '@/components/cards/PlanningCard';
import { learningEngine } from '@/lib/learningEngine';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { kitDocAgent, toDomaineChecklistArray } from '@/lib/ia/agents/kitDocAgent';

// Import des fonctions risque
import { 
  RISK_LEVELS, 
  getRiskLevel, 
  computeVelocityMetrics, 
  computeProactiveAlert, 
  computeFinalFrequency,
  genererPlanningN1
} from '@/lib/risque';
import { riskEngine, getEcartTriggers, type EcartTrigger } from '@/lib/riskEngine';
import { SuggestionFeedback } from '@/lib/store';
import { suggestionMLAgent, extractFeatures } from '@/lib/ia/agents/suggestionMLAgent';

const getSurveillanceBadge = (statut: string) => {
  const labels: Record<string, string> = {
    'planifiee': 'Planifié',
    'en_cours': 'En cours',
    'checklist_signee': 'Checklist signée',
    'ecarts_signes': 'Écarts signés',
    'rapport_signe': 'Rapport signé',
    'lettre_signee': 'Lettre signée',
    'transmise': 'Exécuté avec succès',
    'archivee': 'Archivée'
  };
  const classes: Record<string, string> = {
    'planifiee': 'outline',
    'en_cours': 'warning',
    'checklist_signee': 'primary',
    'ecarts_signes': 'primary',
    'rapport_signe': 'success',
    'lettre_signee': 'success',
    'transmise': 'success',
    'archivee': 'neutral'
  };
  return { label: labels[statut] || statut, cls: classes[statut] || 'neutral' };
};

interface AerodromeRisque extends Aerodrome {
  niveauAlerte: string | null;
  suggestion: string | null;
  profilScore: number;
  profilTendance: string;
  decisionSurveillance: {
    type: string;
    raison: string;
    priorite: string;
    delaiRecommandation: number;
    domainesCibles: string[];
    typesChecklist: string[];
  };
  frequenceSuggestion: { frequence: number; label: string; justification: string };
  nbEcartsCritiques: number;
  aDesExemptions: boolean;
  aDesMesuresEnRetard: boolean;
  domainesCritiques: { domaine: string; code: string; seuil: number; group: string | null; score: number }[];
  ecartTriggers: EcartTrigger[];
  nbTriggersCritiques: number;
  nbTriggersHautes: number;
  hasPacAccepteEnAttente: boolean;
  suggestionsMaintien: Array<{ domaines: string[]; typesChecklist: string[]; raison: string; source: string; confiance: number }>;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

type ViewMode = 'list' | 'calendar' | 'gantt' | 'workload' | 'assignment' | 'table';

interface PlanningModuleProps {
  userRole: string;
  setActiveModule?: (module: string) => void;
}



export default function PlanningModule({ userRole, setActiveModule }: PlanningModuleProps) {
  const router = useRouter();

  // Store
  const aerodromes         = useOptimizedStore(s => s.aerodromes);
  const profilsRisque      = useOptimizedStore(s => s.profilsRisque);
  const surveillances      = useOptimizedStore(s => s.surveillances);
  const utilisateurs       = useOptimizedStore(s => s.utilisateurs);
  const ecarts             = useOptimizedStore(s => s.ecarts);
  const user               = useOptimizedStore(s => s.user);
  const addNotification    = useAppStore(s => s.addNotification);

  const aerodromesActifs = useMemo(() => aerodromes.filter(a => !a.deleted_at), [aerodromes]);

  const ecartsCritiquesParAerodrome = useMemo(() => {
    const map = new Map<string, number>();
    ecarts.forEach((e: any) => {
      if (e.niveau_risque === 'critique' && e.statut !== 'cloture') {
        map.set(e.aerodrome_id, (map.get(e.aerodrome_id) || 0) + 1);
      }
    });
    return map;
  }, [ecarts]);

  const exemptionsActivesParAerodrome = useMemo(() => {
    const map = new Map<string, any[]>();
    try {
      const store = useAppStore.getState();
      aerodromesActifs.forEach(aero => {
        const actives = store.getExemptionsActives?.(aero.id);
        if (actives && actives.length > 0) {
          map.set(aero.id, actives);
        }
      });
    } catch (_) {}
    return map;
  }, [aerodromesActifs, surveillances]);

  const suggestionFeedbacks = useOptimizedStore(s => s.suggestionFeedbacks || []);
  const planningsStore = useAppStore(s => s.plannings || []);
  const deletePlanning = useAppStore(s => s.deletePlanning);
  const updatePlanning = useAppStore(s => s.updatePlanning);
  const submitSuggestionFeedbackStore = useAppStore(s => s.submitSuggestionFeedback);

  // State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedAerodrome, setSelectedAerodrome] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatut, setSelectedStatut] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showNPlus1Modal, setShowNPlus1Modal] = useState(false);
  const propositionsCount = useAppStore(s => s.propositionsN1?.length || 0);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [preparationPlanning, setPreparationPlanning] = useState<Planning | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlanning, setEditingPlanning] = useState<Planning | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planningToDelete, setPlanningToDelete] = useState<Planning | null>(null);
  const [executeTarget, setExecuteTarget] = useState<Planning | null>(null);
  const [executeConfirmOpen, setExecuteConfirmOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState<{ aerodromeId: string; suggestionType: string; missionType: string; ecartIds?: string[] } | null>(null);
  const [feedbackValue, setFeedbackValue] = useState(true);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [isAskingIa, setIsAskingIa] = useState(false);
  const [iaQuestion, setIaQuestion] = useState('');
  const [iaAnswer, setIaAnswer] = useState('');
  const [showProactiveSuggestions, setShowProactiveSuggestions] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<'active' | 'all' | 'retards'>('active');
  const [showProcessus, setShowProcessus] = useState(false);
  const certifications = useAppStore(s => s.certifications || []);
  const homologations = useAppStore(s => s.homologations || []);
  const processusActifs = useMemo(() => getProcessusActifs(certifications, homologations, surveillances, ecarts, aerodromes), [certifications, homologations, surveillances, ecarts, aerodromes]);
  const [mounted, setMounted] = useState(false);
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setMounted(true);
    return () => {
      if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
    }
  }, []);

  const filteredPlannings = useMemo(() => {
    let list = planningsStore;
    if (selectedYear) {
      list = list.filter(p => new Date(p.date_debut).getFullYear() === selectedYear);
    }
    if (selectedAerodrome !== 'all') {
      list = list.filter(p => p.aerodrome_id === selectedAerodrome);
    }
    if (selectedType !== 'all') {
      list = list.filter(p => p.type === selectedType);
    }
    if (selectedStatut !== 'all') {
      list = list.filter(p => p.statut === selectedStatut);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const aero = aerodromesActifs.find(a =>
        a.code_oaci.toLowerCase().includes(term) || a.nom.toLowerCase().includes(term)
      );
      if (aero) {
        list = list.filter(p => p.aerodrome_id === aero.id);
      }
    }
    return list;
  }, [planningsStore, selectedYear, selectedAerodrome, selectedType, selectedStatut, searchTerm, aerodromesActifs]);

  const aerodromesRisque = useMemo(() => {
    return aerodromesActifs.map(aero => {
      const profil = profilsRisque[aero.id];
      if (!profil) return null;
      const ecartsAerodrome = ecarts.filter(
        (e: any) => e.aerodrome_id === aero.id && e.statut !== 'cloture'
      );
      const nbEcartsCritiques = ecartsAerodrome.filter(
        (e: any) => e.niveau_risque === 'critique'
      ).length;
      const exemptions = exemptionsActivesParAerodrome.get(aero.id) || [];
      const aDesMesuresEnRetard = exemptions.some((e: any) =>
        e.mesures_atténuation?.some((m: any) => m.statut === 'en_retard')
      );
      const niveauAlerte = ({
        CRITIQUE: 'critique', ELEVE: 'haute', MOYEN: 'moyen', FAIBLE: null
      } as Record<string, string | null>)[getRiskLevel(profil.score_global)] || null;

      // ── Utilise le moteur complet de surveillance continue ──
      const urgents = riskEngine.detectUrgentEcards(ecartsAerodrome, profil);
      const degradations = riskEngine.detectDomainDegradations(profil);
      const decision = riskEngine.determineTypeSurveillanceContinue(
        profil, urgents, degradations,
        ecartsAerodrome, undefined, undefined, undefined, aero.statut_sgs as 'complet' | 'simplifie' | 'non_applicable' | undefined,
      );

      const decisionSurveillance = {
        type: decision.type,
        raison: decision.raison,
        priorite: decision.priorite,
        delaiRecommandation: decision.delaiRecommandation,
        domainesCibles: decision.domainesCibles,
        typesChecklist: decision.typesChecklist,
      };

      const freqSuggestion = {
        frequence: computeFinalFrequency(profil.score_global, [profil.score_global < 50 ? 0.8 : 1]),
        label: decision.priorite === 'critique' ? 'Immédiate' : decision.priorite === 'haute' ? 'Renforcée' : profil.score_global >= 70 ? 'Réduite' : 'Normale',
        justification: decision.raison,
      };

      // Domaines critiques (score < seuil) avec structure AGA
      const domainesCritiques = [
        { domaine: 'SGS', code: 'c1', seuil: 60, group: 'AGA/EXPLOITATION' },
        { domaine: 'COP', code: 'c3', seuil: 60, group: 'AGA/EXPLOITATION' },
        { domaine: 'OPS', code: 'c3', seuil: 60, group: 'AGA/EXPLOITATION' },
        { domaine: 'PHY', code: 'c3', seuil: 60, group: 'AGA/GENIE_CIVIL' },
        { domaine: 'OLS', code: 'c3', seuil: 60, group: 'AGA/GENIE_CIVIL' },
        { domaine: 'ELEC', code: 'c3', seuil: 60, group: 'AGA/GENIE_ELEC' },
        { domaine: 'MFP', code: 'c3', seuil: 60, group: 'AGA/GENIE_ELEC' },
        { domaine: 'SLI', code: 'c5', seuil: 60, group: 'AGA/SLI_RA' },
        { domaine: 'RA', code: 'c5', seuil: 60, group: 'AGA/SLI_RA' },
        { domaine: 'Écarts', code: 'c4', seuil: 60, group: null },
      ].filter(d => (profil as unknown as Record<string, number>)[d.code] < d.seuil)
        .sort((a, b) => (profil as unknown as Record<string, number>)[a.code] - (profil as unknown as Record<string, number>)[b.code])
        .map(d => ({ ...d, score: (profil as unknown as Record<string, number>)[d.code] }));

      const ecartTriggers = getEcartTriggers(
        ecartsAerodrome,
        profil,
        suggestionFeedbacks,
      );
      const nbTriggersCritiques = ecartTriggers.filter(t => t.urgence === 'critique').length;
      const nbTriggersHautes = ecartTriggers.filter(t => t.urgence === 'haute').length;
      const hasPacAccepteEnAttente = ecartTriggers.some(
        t => t.ecart.statut === 'pac_accepte' && t.typeSurveillanceSuggere === 'mise_oeuvre_pac'
      );

      // Suggestions de maintien
      const suggestionsMaintien = genererSuggestionsMaintien({
        ecartsActifs: ecartsAerodrome,
        profilRisque: profil,
      });

      return {
        ...aero,
        niveauAlerte,
        suggestion: decision.type,
        profilScore: profil.score_global,
        profilTendance: profil.tendance,
        decisionSurveillance,
        frequenceSuggestion: freqSuggestion,
        nbEcartsCritiques: nbEcartsCritiques || 0,
        aDesExemptions: exemptions.length > 0,
        aDesMesuresEnRetard: !!aDesMesuresEnRetard,
        domainesCritiques,
        ecartTriggers,
        nbTriggersCritiques,
        nbTriggersHautes,
        hasPacAccepteEnAttente,
        suggestionsMaintien,
      };
    }).filter(a => a !== null && (a.niveauAlerte !== null || (a as any).ecartTriggers?.length > 0)) as AerodromeRisque[];
  }, [aerodromesActifs, profilsRisque, ecartsCritiquesParAerodrome, exemptionsActivesParAerodrome, ecarts, suggestionFeedbacks]);

  // Plannings avec enrichissement risque et lien vers surveillance
  const planningsEnrichis = useMemo(() => {
    return filteredPlannings.map(planning => {
      const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id);
      const profil = profilsRisque[planning.aerodrome_id];
      const risqueData = aerodromesRisque.find(a => a.id === planning.aerodrome_id);
      const exemptions = exemptionsActivesParAerodrome.get(planning.aerodrome_id) || [];
      
      const surveillanceLiee = surveillances.find(s => s.planning_id === planning.id);
      const isLancee = !!surveillanceLiee;
      const surveillanceId = surveillanceLiee?.id;
      
      return {
        ...planning,
        aerodromeNom: aerodrome?.nom,
        aeroCode: aerodrome?.code_oaci,
        risqueNiveau: risqueData?.niveauAlerte,
        risqueSuggestion: risqueData?.suggestion,
        profilScore: profil?.score_global,
        profilTendance: profil?.tendance,
        nbEcartsCritiques: risqueData?.nbEcartsCritiques || 0,
        aDesExemptions: risqueData?.aDesExemptions || false,
        aDesMesuresEnRetard: risqueData?.aDesMesuresEnRetard || false,
        isLancee,
        surveillanceId,
      };
    });
  }, [filteredPlannings, aerodromes, aerodromesActifs, profilsRisque, aerodromesRisque, surveillances, exemptionsActivesParAerodrome]);

  // Grouper par aérodrome pour la vue liste
  const planningsByAerodrome = useMemo(() => {
    const grouped = new Map();
    
    planningsEnrichis.forEach(planning => {
      const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id);
      if (!aerodrome) return;

      if (!grouped.has(planning.aerodrome_id)) {
        grouped.set(planning.aerodrome_id, {
          aerodrome,
          plannings: [],
          stats: { total: 0, realisees: 0, enRetard: 0, planifiees: 0 },
          aDesExemptions: planning.aDesExemptions,
          aDesMesuresEnRetard: planning.aDesMesuresEnRetard,
        });
      }
      
      const group = grouped.get(planning.aerodrome_id);
      group.plannings.push(planning);
      group.stats.total++;
      
      if (planning.statut === 'realisee') group.stats.realisees++;
      if (planning.statut === 'en_retard') group.stats.enRetard++;
      if (planning.statut === 'planifiee') group.stats.planifiees++;
      
      if (planning.aDesExemptions) group.aDesExemptions = true;
      if (planning.aDesMesuresEnRetard) group.aDesMesuresEnRetard = true;
    });

    return Array.from(grouped.values())
      .sort((a, b) => a.aerodrome.code_oaci.localeCompare(b.aerodrome.code_oaci));
  }, [planningsEnrichis, aerodromes, aerodromesActifs]);

  // Statistiques globales
  const stats = useMemo(() => {
    const total = filteredPlannings.length;
    const planifiees = filteredPlannings.filter(p => p.statut === 'planifiee').length;
    const enCours = filteredPlannings.filter(p => p.statut === 'en_cours').length;
    const realisees = filteredPlannings.filter(p => p.statut === 'realisee').length;
    const enRetard = filteredPlannings.filter(p => p.statut === 'en_retard').length;
    const executionRate = total > 0 ? Math.round((realisees / total) * 100) : 0;
    return { total, planifiees, enCours, realisees, enRetard, executionRate };
  }, [filteredPlannings]);

  // Fonction de feedback
  const enregistrerFeedbackPlanning = useCallback((
    planning: Planning,
    suggestionAcceptee: boolean,
    raison?: string
  ) => {
    const profil = profilsRisque[planning.aerodrome_id];
    if (!profil) return;
    
    learningEngine.recordLearningFeedback(
      planning.aerodrome_id,
      'planning',
      planning.type,
      planning.id,
      'SA',
      70,
      'SA',
      raison || (suggestionAcceptee ? 'Planning validé' : 'Planning rejeté')
    );
    
    addNotification({
      user_id: user?.id || '',
      type: suggestionAcceptee ? 'success' : 'info',
      title: suggestionAcceptee ? 'Planning validé' : 'Planning ignoré',
      message: `Votre ${suggestionAcceptee ? 'validation' : 'rejet'} a été enregistré pour l'apprentissage du modèle.`,
      canal: 'in_app'
    });
  }, [profilsRisque, addNotification, user]);

  // Handlers
  const handleNewPlanning = () => {
    setEditingPlanning(null);
    startTransition(() => setFormOpen(true));
  };

  const handlePrepare = (planning: Planning) => {
    setPreparationPlanning(planning);
    startTransition(() => setPreparationOpen(true));
  };

  const handleRefuser = (planning: Planning) => {
    enregistrerFeedbackPlanning(planning, false, 'Planning rejeté par l\'utilisateur');
    deletePlanning(planning.id);
  };

  const handleRequestExecute = (planning: Planning) => {
    setExecuteTarget(planning);
    setExecuteConfirmOpen(true);
  };

  const handleConfirmExecute = async () => {
    if (!executeTarget) return;
    setExecuteConfirmOpen(false);
    await handleLancer(executeTarget);
  };

  const handleLancer = async (planning: Planning) => {
    if ((planning as Planning & { isLancee?: boolean }).isLancee) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Déjà lancée',
        message: 'Cette surveillance a déjà été lancée',
        canal: 'in_app',
      });
      return;
    }

    enregistrerFeedbackPlanning(planning, true, 'Planning validé et lancé');

    // Certification : tous les domaines techniques + SGS
    const porteeComplete = planning.type === 'certification'
      ? ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS']
      : planning.type === 'homologation'
        ? ['SGS', ...(planning.portee || [])]
        : (planning.portee || [])

    const nouvelleSurveillance: Omit<Surveillance, 'id' | 'created_at' | 'updated_at'> = {
      aerodrome_id: planning.aerodrome_id,
      planning_id: planning.id,
      type: planning.type,
      portee: porteeComplete,
      equipe_ids: planning.equipe_ids || [],
      chef_id: planning.chef_id || '',
      date_debut: planning.date_debut,
      date_fin: planning.date_fin,
      statut: 'en_cours',
    };

    const { addSurveillance, setChecklistHierarchy, updateSurveillance } = useAppStore.getState();
    const surveillance = await addSurveillance(nouvelleSurveillance);

    if (surveillance && surveillance.id) {
      updatePlanning(planning.id, {
        surveillance_id: surveillance.id,
        updated_at: new Date().toISOString(),
      });

      // Transférer la checklist préparée depuis le planning vers la surveillance
      if (planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0) {
        setChecklistHierarchy(surveillance.id, planning.checklist_hierarchy);
        updateSurveillance(surveillance.id, { checklist_hierarchy: planning.checklist_hierarchy });
        console.debug('[Planning] Checklist préparée transférée depuis le planning:', planning.id);
      }
      // Transférer l'évaluation SGS PAOE préparée si présente
      if (planning.sgs_evaluation_prepa) {
        updateSurveillance(surveillance.id, { sgs_evaluation_prepa: planning.sgs_evaluation_prepa });
        console.debug('[Planning] Évaluation SGS préparée transférée:', planning.id);
      }
      if (!(planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0)) {
        // Fallback : générer la checklist si aucune n'a été préparée
        const profil = profilsRisque?.[planning.aerodrome_id] || undefined;
        const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id);
        const typeSurv: 'periodique' | 'inopine' | 'maintien' =
          (planning.type === 'inopinee' || planning.type === 'inopine') ? 'inopine' :
          planning.type === 'maintien' ? 'maintien' : 'periodique';

        const store = useAppStore.getState();
        const master = store.findMasterChecklistForPortee(planning.portee || []);
        if (master) {
          const snapshot = JSON.parse(JSON.stringify(master.checklist));
          const filtered = aerodrome ? kitDocAgent.filterChecklistByAerodrome(snapshot, aerodrome) : snapshot;
          const enriched = kitDocAgent.applyRiskProfileToChecklist(filtered, {
            entite_id: planning.aerodrome_id,
            type_entite: aerodrome?.type_entite ?? 'aerodrome',
            type_surveillance: typeSurv,
            portee: planning.portee || [],
            profil_risque: profil,
          });
          setChecklistHierarchy(surveillance.id, enriched);
          updateSurveillance(surveillance.id, { checklist_hierarchy: enriched });
        } else {
          const analysesDocs = kitDocAgent.getAnalysesForPortee(planning.portee || []);
          const analyses = analysesDocs.length > 0 ? analysesDocs : undefined;
          try {
            const result = kitDocAgent.generateChecklist({
              surveillance_id: surveillance.id,
              entite_id: planning.aerodrome_id,
              type_entite: aerodrome?.type_entite ?? 'aerodrome',
              type_surveillance: typeSurv,
              portee: planning.portee || [],
              profil_risque: profil,
              analyses_docs: analyses,
            });
            const resultFiltered = aerodrome ? { ...result, domaines: kitDocAgent.filterChecklistByAerodrome(result.domaines as any[], aerodrome) } : result;
            kitDocAgent.injectIntoStore(surveillance.id, resultFiltered);
            updateSurveillance(surveillance.id, { checklist_hierarchy: toDomaineChecklistArray(resultFiltered) });
          } catch { /* génération silencieuse */ }
        }
      }

      // ── Pre-remplir les items checklist avec les prédictions IA (checklistMemory) ──
      try {
        const { checklistMemory } = await import('@/lib/checklistMemory')
        const profil = useAppStore.getState().profilsRisque?.[planning.aerodrome_id]
        const surv = useAppStore.getState().surveillances.find(s => s.id === surveillance.id)
        const hierarchy = surv?.checklist_hierarchy

        if (hierarchy && profil) {
          const typeSurv = surv?.type || 'programmee'
          let changed = false

          const prefillItems = (domaines: any[]) => {
            for (const domaine of domaines) {
              const items = domaine.items || []
              for (const item of items) {
                try {
                  const pred = checklistMemory.getPredictionForItem(
                    planning.aerodrome_id,
                    typeSurv,
                    domaine.nom || '',
                    '',
                    '',
                    item.id || '',
                    profil
                  )
                  if (pred && pred.prediction) {
                    item.resultat = pred.prediction
                    item.prediction = { resultat: pred.prediction, confiance: pred.confiance || 70, justification: pred.justification || '' }
                    item.confiance = pred.confiance || 70
                    changed = true
                  }
                } catch { /* ignorer les items sans prediction */ }
              }
              if (domaine.sousDomaines) prefillItems(domaine.sousDomaines)
              if (domaine.sousSousDomaines) {
                for (const ssd of domaine.sousSousDomaines) {
                  for (const item of (ssd.items || [])) {
                    try {
                      const pred = checklistMemory.getPredictionForItem(
                        planning.aerodrome_id,
                        typeSurv,
                        domaine.nom || '',
                        ssd.nom || '',
                        '',
                        item.id || '',
                        profil
                      )
                      if (pred && pred.prediction) {
                        item.resultat = pred.prediction
                        item.prediction = { resultat: pred.prediction, confiance: pred.confiance || 70, justification: pred.justification || '' }
                        item.confiance = pred.confiance || 70
                        changed = true
                      }
                    } catch { /* ignorer */ }
                  }
                }
              }
            }
          }

          if (hierarchy) {
            prefillItems(hierarchy)
            if (changed) {
              updateSurveillance(surveillance.id, { checklist_hierarchy: hierarchy })
              useAppStore.getState().setChecklistHierarchy(surveillance.id, hierarchy)
            }
          }
        }
      } catch { /* silencieux si checklistMemory indisponible */ }
    }

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Surveillance lancée',
      message: `La surveillance pour ${(planning as Planning & { aeroCode?: string }).aeroCode} a été créée`,
      canal: 'in_app',
    });

    // ── Notifier les exploitants de l'aérodrome ──────────────────
    {
      const typeLabel = (planning.type as string)?.replace(/_/g, ' ') ?? 'surveillance';
      const domainesLabels = (planning.portee || []).map(getDomaineLabel).join(', ');
      const dateDebut = new Date(planning.date_debut).toLocaleDateString('fr-FR');
      const dateFin = new Date(planning.date_fin).toLocaleDateString('fr-FR');
      const equipeNoms = (planning.equipe_ids || []).map((id: string) => {
        const u = utilisateurs.find((x: any) => x.id === id);
        return u ? `${u.prenom} ${u.nom}` : id;
      }).join(', ');
      const aeroCode = (planning as any).aeroCode || '';
      const message = `Une surveillance ${typeLabel} est programmée du ${dateDebut} au ${dateFin} sur ${aeroCode}.\nDomaines: ${domainesLabels}\nÉquipe: ${equipeNoms}\nPréparez vos documents et registres pour l'équipe ANACIM.`;
      utilisateurs
        .filter(u =>
          u.aerodrome_id === planning.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        .forEach(u =>
          addNotification({
            user_id: u.id,
            type: 'warning',
            title: `Surveillance programmée — ${aeroCode}`,
            message,
            canal: 'email',
            link: `/surveillance/${surveillance.id}`,
          })
        );
    }
    // ─────────────────────────────────────────────────────────────

    // Naviguer vers la page de la surveillance (pas directement la checklist)
    router.push(`/surveillance/${surveillance.id}`);
  };

  const handleEdit = (planning: Planning) => {
    setEditingPlanning(planning);
    startTransition(() => setFormOpen(true));
  };

  // Appliquer les suggestions IA & Profil pour un planning donné
  const handleAppliquerSuggestionsGlobal = (planning: { aerodrome_id: string; id?: string }) => {
    if (!planning?.aerodrome_id) return;
    
    const profil = profilsRisque[planning.aerodrome_id];
    if (!profil) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Profil indisponible',
        message: 'Aucun profil de risque trouvé pour cet aérodrome',
        canal: 'in_app',
      });
      return;
    }

    // Suggérer les domaines prioritaires selon le profil
    const domaines: string[] = [];
    ['c1', 'c2', 'c3', 'c4', 'c5'].forEach(key => {
      const score = (profil as unknown as Record<string, number>)[key];
      if (score < 60) {
        const mapping: Record<string, string> = {
          'c1': 'SGS', 'c2': 'PAC', 'c3': 'PHY', 'c4': 'Ecarts', 'c5': 'SLI'
        };
        domaines.push(mapping[key] || key);
      }
    });
    domaines.sort((a, b) => (profil as unknown as Record<string, number>)['c' + (a === 'SGS' ? '1' : a === 'PAC' ? '2' : a === 'PHY' ? '3' : a === 'Ecarts' ? '4' : '5')] - 
                              (profil as unknown as Record<string, number>)['c' + (b === 'SGS' ? '1' : b === 'PAC' ? '2' : b === 'PHY' ? '3' : b === 'Ecarts' ? '4' : '5')]);
    if (domaines.length > 3) domaines.length = 3;

    // Suggérer la priorité
    const priorite = profil.score_global < 30 ? 'critique' :
                   profil.score_global < 50 ? 'haute' :
                   profil.score_global < 70 ? 'moyenne' : 'basse';

    // Suggérer le type
    const type = profil.score_global < 30 ? 'audit_complet' :
                 profil.c4 < 40 ? 'suivi_ecarts' :
                 profil.c2 < 50 ? 'mise_oeuvre_pac' : 'programmee';

    // Suggérer l'équipe selon spécialité AGA et disponibilité
    const equipeSuggeree = utilisateurs
      .filter(u => u.role === 'inspector' && u.statut !== 'inactif' && u.statut !== 'suspendu')
      .filter(u => {
        if (!u.competences || u.competences.length === 0) return false;
        
        // Vérifier si l'inspecteur a une spécialité AGA qui couvre les domaines prioritaires
        return u.competences.some((c: { domaine: string; niveau: string } | string) => {
          const domaineInsp = typeof c === 'string' ? c : c.domaine;
          
          // Si AGA/XXX, vérifier si ça couvre les domaines critiques
          if (domaineInsp.startsWith('AGA/')) {
            const mapping: Record<string, string[]> = {
              'AGA/EXPLOITATION': ['SGS', 'COP', 'OPS'],
              'AGA/GENIE_CIVIL': ['PHY', 'OLS'],
              'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
              'AGA/SLI_RA': ['SLI', 'RA'],
            };
            const domainesInsp = mapping[domaineInsp] || [];
            return domaines.some((d: string) => domainesInsp.includes(d));
          }
          
          // Si domaine direct, vérifier s'il est dans la liste
          return domaines.includes(domaineInsp);
        });
      })
      .map(u => ({
        id: u.id,
        nom: u.nom,
        prenom: u.prenom,
        competences: u.competences,
        // Privilégier ceux qui ont le plus de domaines correspondants
        scoreMatch: (u.competences || []).filter((c: { domaine: string; niveau: string } | string) => {
          const d = typeof c === 'string' ? c : c.domaine;
          if (d.startsWith('AGA/')) {
            const mapping: Record<string, string[]> = {
              'AGA/EXPLOITATION': ['SGS', 'COP', 'OPS'],
              'AGA/GENIE_CIVIL': ['PHY', 'OLS'],
              'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
              'AGA/SLI_RA': ['SLI', 'RA'],
            };
            const domainesInsp = mapping[d] || [];
            return domaines.some((dom: string) => domainesInsp.includes(dom));
          }
          return domaines.includes(d);
        }).length
      }))
      .sort((a, b) => b.scoreMatch - a.scoreMatch)
      .slice(0, 3)
      .map(u => u.id);

    // Enregistrer le feedback pour apprentissage
    learningEngine.recordLearningFeedback(
      planning.aerodrome_id,
      domaines[0] || 'SGS',
      '',
      `global-suggestion-${planning.id || Date.now()}`,
      'SA' as const,
      90,
      'SA' as const,
      `Suggestion IA appliquée: ${type}, ${priorite}, domaines: ${domaines.join(', ')}`
    );

    // Submit SuggestionFeedback pour alimenter le ML Agent
    const suggestionTypeMap: Record<string, 'surveillance_pac' | 'surveillance_ecarts' | 'audit_complet' | 'surveillance_mixte'> = {
      'audit_complet': 'audit_complet',
      'suivi_ecarts': 'surveillance_ecarts',
      'mise_oeuvre_pac': 'surveillance_pac',
      'programmee': 'surveillance_mixte',
    };
    const feedbackType = suggestionTypeMap[type] || 'surveillance_mixte';
    try {
      submitSuggestionFeedbackStore({
        aerodrome_id: planning.aerodrome_id,
        suggestion_type: feedbackType,
        mission_type_suggeree: type,
        etait_pertinent: true,
        date_suggestion: new Date().toISOString(),
      });
    } catch (_) {}

    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Suggestion IA & Profil appliquée',
      message: `Domaines: ${domaines.join(', ')} | Type: ${type} | Priorité: ${priorite} | Équipe: ${equipeSuggeree.length} inspecteur(s) suggérés selon leur spécialité AGA`,
      canal: 'in_app',
    });
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

  const handleView = (planning: Planning & { surveillanceId?: string }) => {
    if (planning.surveillanceId) {
      router.push(`/surveillance/${planning.surveillanceId}`);
    }
  };

  const handleDelete = (planning: Planning & { isLancee?: boolean }) => {
    if (planning.isLancee) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Suppression impossible',
        message: 'Ce planning a déjà une surveillance lancée',
        canal: 'in_app',
      });
      return;
    }
    setPlanningToDelete(planning);
    startTransition(() => setDeleteDialogOpen(true));
  };

  const confirmDelete = useCallback(() => {
    if (planningToDelete) {
      deletePlanning(planningToDelete.id);
      setDeleteDialogOpen(false);
      setPlanningToDelete(null);
    }
  }, [planningToDelete, deletePlanning]);

  const handleExportCSV = () => {
    const headers = ['Aérodrome', 'Type', 'Début', 'Fin', 'Statut', 'Priorité', 'Score risque', 'Tendance', 'Écarts critiques', 'Exemptions'];
    const rows = planningsEnrichis.map(p => {
      return [
        p.aeroCode,
        p.type,
        new Date(p.date_debut).toLocaleDateString('fr-FR'),
        new Date(p.date_fin).toLocaleDateString('fr-FR'),
        p.statut,
        p.priorite,
        p.profilScore || '-',
        p.profilTendance || '-',
        p.nbEcartsCritiques || '0',
        p.aDesExemptions ? 'Oui' : 'Não',
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plannings_${selectedYear}.csv`;
    a.click();
  };

  const resetFilters = () => {
    setSelectedAerodrome('all');
    setSelectedType('all');
    setSelectedStatut('all');
    setSearchTerm('');
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

  const typeOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'programmee', label: 'Programmée' },
    { value: 'inopinee', label: 'Inopinée' },
    { value: 'speciale', label: 'Spéciale' },
    { value: 'suivi_ecarts', label: 'Suivi écarts' },
    { value: 'mise_oeuvre_pac', label: 'Mise œuvre PAC' },
    { value: 'certification', label: 'Certification' },
    { value: 'homologation', label: 'Homologation' },
    { value: 'audit_complet', label: 'Audit complet' },
    { value: 'urgence', label: 'Urgence' },
  ];

  const statutOptions = [
    { value: 'all', label: 'Tous' },
    { value: 'planifiee', label: 'Planifiée' },
    { value: 'en_cours', label: 'En cours' },
    { value: 'realisee', label: 'Réalisée' },
    { value: 'annulee', label: 'Annulée' },
    { value: 'en_retard', label: 'En retard' },
  ];

  const viewButtons = [
    { id: 'list', label: 'Liste', icon: List },
    { id: 'table', label: 'Tableau', icon: LayoutList },
    { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
    { id: 'gantt', label: 'Gantt', icon: LayoutGrid },
    { id: 'workload', label: 'Charge', icon: Users },
    { id: 'assignment', label: 'Assignation', icon: Briefcase },
  ];

  const hasExemptionsAnywhere = Array.from(exemptionsActivesParAerodrome.values()).some(arr => arr.length > 0);
  const hasMesuresEnRetard = aerodromesRisque.some(a => a.aDesMesuresEnRetard);

  const DeleteConfirmModal = () => {
    if (!deleteDialogOpen) return null;
    return createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => setDeleteDialogOpen(false)}>
        <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
              <div className="modal-title flex items-center gap-2 text-danger">
                <AlertCircle className="w-5 h-5" />
                Confirmer la suppression
              </div>
              <button className="modal-close" onClick={() => setDeleteDialogOpen(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body py-6 px-5">
              <p className="text-foreground">Êtes-vous sûr de vouloir supprimer ce planning ?</p>
              <p className="text-small text-muted-foreground mt-2">Cette action est irréversible.</p>
            </div>
            <div className="modal-footer border-t border-border p-5 flex justify-end gap-3">
              <button className="btn btn-secondary" onClick={() => setDeleteDialogOpen(false)}>Annuler</button>
              <button className="btn btn-danger" onClick={confirmDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const ExecuteConfirmModal = () => {
    if (!executeConfirmOpen || !executeTarget) return null;
    const aerodrome = aerodromesActifs.find(a => a.id === executeTarget.aerodrome_id) || aerodromes.find(a => a.id === executeTarget.aerodrome_id);
    return createPortal(
      <div className="modal-overlay" data-role={userRole} onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>
        <div className="modal-content max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
              <div className="modal-title flex items-center gap-2 text-role-primary">
                <PlayCircle className="w-5 h-5" />
                Lancer la surveillance
              </div>
              <button className="modal-close" onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body py-6 px-5 space-y-4">
              <div className="p-3 bg-role-primary-soft rounded-lg">
                <p className="text-sm font-medium">Aérodrome: <span className="text-foreground">{aerodrome?.code_oaci} — {aerodrome?.nom}</span></p>
                <p className="text-sm font-medium mt-1">Type: <span className="text-foreground">{executeTarget.type.replace('_', ' ')}</span></p>
                <p className="text-sm font-medium mt-1">Période: <span className="text-foreground">{new Date(executeTarget.date_debut).toLocaleDateString('fr-FR')} → {new Date(executeTarget.date_fin).toLocaleDateString('fr-FR')}</span></p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Vous allez être redirigé vers le module Surveillance</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      La surveillance sera créée automatiquement. Vous pourrez ensuite rédiger la checklist, identifier les écarts et produire le rapport.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer border-t border-border p-5 flex justify-end gap-3">
              <button className="btn btn-secondary" onClick={() => { setExecuteConfirmOpen(false); setExecuteTarget(null); }}>Annuler</button>
              <button className="btn btn-primary" onClick={handleConfirmExecute}>
                <PlayCircle className="w-4 h-4 mr-1" />
                Continuer vers Surveillance
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const FormModal = () => (
    <FormShell
      open={!!formOpen}
      onClose={() => setFormOpen(false)}
      title={editingPlanning ? 'Modifier le planning' : 'Nouveau planning'}
      icon={CalendarDays}
      size="3xl"
      dataRole={userRole}
    >
      <PlanningForm
        planning={editingPlanning}
        onClose={() => setFormOpen(false)}
        onSuccess={() => { setFormOpen(false); setEditingPlanning(null); }}
      />
    </FormShell>
  );

  if (!mounted) return null;

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="planning">
      
      {/* Bandeau d'alerte sur les mesures d'atténuation en retard */}
      {hasMesuresEnRetard && (
        <div className="alert alert-danger">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">⚠️ Mesures d'atténuation en retard</div>
            <div className="alert-description">
              Des mesures d'atténuation liées à des exemptions sont en retard. 
              Une inspection de type "Mise en œuvre PAC" est recommandée.
            </div>
          </div>
        </div>
      )}

      {/* Bandeau d'information sur les exemptions */}
      {hasExemptionsAnywhere && !hasMesuresEnRetard && (
        <div className="alert alert-info">
          <Shield className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">Exemptions actives détectées</div>
            <div className="alert-description">
              Certains aérodromes bénéficient d'exemptions. Les mesures d'atténuation seront automatiquement ajoutées aux checklists.
            </div>
          </div>
        </div>
      )}

      {/* En-tête */}
      <ModuleHeader
        icon={<CalendarDays />}
        title="Planning des Surveillances"
        description="Gestion et planification des surveillances"
        actions={<div className="flex items-center gap-3">
          <button onClick={handleNewPlanning} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Nouveau planning
          </button>
        </div>}
      />

      {/* KPIs */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <CalendarDays className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total</div>
          <div className="kpi-value">{stats.total}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label">Planifiées</div>
          <div className="kpi-value">{stats.planifiees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <Activity className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label">En cours</div>
          <div className="kpi-value">{stats.enCours}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label">Réalisées</div>
          <div className="kpi-value">{stats.realisees}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <AlertCircle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label">En retard</div>
          <div className="kpi-value text-danger">{stats.enRetard}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon bg-info-soft">
            <TrendingUp className="w-5 h-5 text-info" />
          </div>
          <div className="kpi-label">Taux exec.</div>
          <div className="kpi-value">{stats.executionRate}%</div>
          <div className="progress h-1 mt-1">
            <div className="progress-bar" style={{ width: `${stats.executionRate}%` }} />
          </div>
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md space-y-3">
        <div className="flex flex-wrap items-center gap-2">
           <div className="view-toggle">
             {viewButtons.map((view) => {
               const Icon = view.icon;
               return (
                 <button
                   key={view.id}
                   onClick={() => setViewMode(view.id as ViewMode)}
                   className={viewMode === view.id ? 'active' : ''}
                 >
                   <Icon className="w-4 h-4" />
                   <span>{view.label}</span>
                 </button>
               );
              })}
            </div>

            {/* Bouton N+1 */}
            <div className="relative inline-flex">
              <button
                onClick={() => setShowNPlus1Modal(true)}
                className="btn btn-secondary gap-2"
                title="Générer le planning de l'année suivante"
              >
                <TrendingUp className="w-4 h-4" />
                <span>N+1</span>
              </button>
              {propositionsCount > 0 && (
                <span className={`badge ${propositionsCount > 5 ? 'danger pulse' : 'warning'} absolute -top-2 -right-2 h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-xs font-bold`}>
                  {propositionsCount > 99 ? '99+' : propositionsCount}
                </span>
              )}
            </div>
            
            {/* Bouton Suggestions IA — animé selon la sévérité des déclencheurs */}
            {(() => {
              const totalCritiques    = aerodromesRisque.reduce((sum, a) => sum + (a.nbTriggersCritiques || 0), 0);
              const totalHautes       = aerodromesRisque.reduce((sum, a) => sum + (a.nbTriggersHautes    || 0), 0);
              const totalPacEnAttente = aerodromesRisque.filter(a => a.hasPacAccepteEnAttente).length;
              const badgeCount        = totalCritiques + totalHautes + totalPacEnAttente;

              // ── états ────────────────────────────────────────────────────────
              // ouvert   : panneau IA déjà visible      → bleu stable, pas de pulse
              // critique : triggers critiques ou PAC    → rouge, double ring-ping + pulse
              // eleve    : triggers hauts seulement     → orange, ring-ping + pulse
              // calme    : aucun déclencheur urgent     → secondaire, pas d'animation
              const urgent  = !showProactiveSuggestions && (totalCritiques > 0 || totalPacEnAttente > 0);
              const warning = !showProactiveSuggestions && !urgent && totalHautes > 0;
              const ouvert  = showProactiveSuggestions;

              const badge = badgeCount > 0 && (
                <span className={`badge text-xs ${urgent ? 'danger' : 'warning'}`}>
                  {badgeCount}
                </span>
              );

              const titleText = urgent
                ? `${totalCritiques} urgence(s) critique(s) · ${totalPacEnAttente} PAC en attente — cliquer pour traiter`
                : warning
                ? `${totalHautes} alerte(s) haute(s) — cliquer pour voir les suggestions`
                : ouvert
                ? 'Fermer le panneau de suggestions'
                : 'Suggestions IA & Profil';

              /* ── État CRITIQUE : ring-ping rouge + pulse bouton ── */
              if (urgent) return (
                <div className="relative inline-flex shrink-0">
                  <span className="absolute inset-0 rounded-md animate-ping bg-danger/35 pointer-events-none" />
                  <button
                    onClick={() => setShowProactiveSuggestions(!showProactiveSuggestions)}
                    className="btn btn-danger gap-2 animate-pulse relative"
                    title={titleText}
                  >
                    <Brain className="w-4 h-4" />
                    <span>Suggestions IA</span>
                    {badge}
                  </button>
                </div>
              );

              /* ── État ÉLEVÉ : ring-ping orange + pulse bouton ── */
              if (warning) return (
                <div className="relative inline-flex shrink-0">
                  <span className="absolute inset-0 rounded-md animate-ping bg-warning/30 pointer-events-none" />
                  <button
                    onClick={() => setShowProactiveSuggestions(!showProactiveSuggestions)}
                    className="btn btn-warning gap-2 animate-pulse relative"
                    title={titleText}
                  >
                    <Brain className="w-4 h-4" />
                    <span>Suggestions IA</span>
                    {badge}
                  </button>
                </div>
              );

              /* ── État OUVERT : bleu stable ── */
              if (ouvert) return (
                <button
                  onClick={() => setShowProactiveSuggestions(false)}
                  className="btn btn-primary gap-2"
                  title={titleText}
                >
                  <Brain className="w-4 h-4" />
                  <span>Suggestions IA</span>
                </button>
              );

              /* ── État CALME : secondaire, pas d'animation ── */
              return (
                <button
                  onClick={() => setShowProactiveSuggestions(true)}
                  className="btn btn-secondary gap-2"
                  title={titleText}
                >
                  <Brain className="w-4 h-4" />
                  <span>Suggestions IA</span>
                </button>
              );
            })()}
         </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Nom, code OACI ou type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>
            <option value={new Date().getFullYear() + 1}>{new Date().getFullYear() + 1}</option>
          </select>

          <select
            value={selectedAerodrome}
            onChange={(e) => setSelectedAerodrome(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            <option value="all">Tous les aérodromes</option>
            {aerodromesActifs.map(a => {
              const hasExemptions = exemptionsActivesParAerodrome.has(a.id);
              return (
                <option key={a.id} value={a.id}>
                  {a.code_oaci} - {a.nom}{hasExemptions ? ' ⚠️' : ''}
                </option>
              );
            })}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            {typeOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={selectedStatut}
            onChange={(e) => setSelectedStatut(e.target.value)}
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
          >
            {statutOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* ── Filtre de visibilité style view-toggle ──*/}
          <div className="view-toggle">
            <button
              onClick={() => setVisibilityFilter('active')}
              className={visibilityFilter === 'active' ? 'active' : ''}
            >
              <PlayCircle className="w-4 h-4" />
              <span>Actives</span>
            </button>
            <button
              onClick={() => setVisibilityFilter('all')}
              className={visibilityFilter === 'all' ? 'active' : ''}
            >
              <List className="w-4 h-4" />
              <span>Tout</span>
            </button>
            <button
              onClick={() => setVisibilityFilter('retards')}
              className={visibilityFilter === 'retards' ? 'active' : ''}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Retards</span>
            </button>
          </div>

          <button onClick={resetFilters} className="action-button" title="Réinitialiser les filtres">
            <X className="w-4 h-4" />
          </button>

          {processusActifs.length > 0 && (
            <button
              onClick={() => setShowProcessus(!showProcessus)}
              className={`filter-chip ${showProcessus ? 'active' : ''}`}
            >
              <Shield className="w-3 h-3 mr-1" />
              Certification / Homologation
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-primary text-white">{processusActifs.length}</span>
            </button>
          )}

          <button onClick={handleExportCSV} className="action-button" title="Export CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Assistant IA */}
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={iaQuestion}
              onChange={(e) => setIaQuestion(e.target.value)}
              placeholder="Demandez conseil à l'IA pour la planification..."
              className={`flex-1 form-input text-sm ${focusClass}`}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAskAssistant(); }}
            />
            <button
              onClick={handleAskAssistant}
              disabled={isAskingIa || !iaQuestion.trim()}
              className="btn btn-primary gap-2"
            >
              {isAskingIa
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
              Demander
            </button>
          </div>
          {iaAnswer && (
            <div className="mt-2 p-2 bg-primary-soft/50 rounded-lg text-sm">
              <Brain className="w-3 h-3 inline mr-1 text-role-primary" />
              {iaAnswer}
            </div>
          )}
        </div>
      </div>

      {/* Vue Liste */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {planningsByAerodrome.map(({ aerodrome, plannings: aeroPlannings, stats: aeroStats, aDesExemptions, aDesMesuresEnRetard }) => {
            const risqueData = aerodromesRisque.find(a => a.id === aerodrome.id);
            const hasRisque = risqueData?.niveauAlerte === 'critique' || risqueData?.niveauAlerte === 'haute';
            
            return (
              <AccordionSection
                key={aerodrome.id}
                icon={<MapPin className="w-4 h-4 text-white" />}
                title={
                  <span>
                    <span className="code-oaci-badge">{aerodrome.code_oaci}</span>
                    <span className="ml-2 text-foreground font-medium">{aerodrome.nom}</span>
                  </span>
                }
                badges={
                  <>
                    {risqueData?.niveauAlerte === 'critique' && (
                      <span className="badge danger animate-pulse">Critique</span>
                    )}
                    {risqueData?.niveauAlerte === 'haute' && (
                      <span className="badge warning">Haute priorité</span>
                    )}
                    {aDesExemptions && !hasRisque && (
                      <span className="badge warning flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        Exemption(s)
                      </span>
                    )}
                    <span className="badge outline">{aeroPlannings.length} planning(s)</span>
                  </>
                }
                actions={
                  <div className="flex items-center gap-3 text-small text-muted-foreground">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" />{aeroStats.realisees}</span>
                    <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-danger" />{aeroStats.enRetard}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-primary" />{aeroStats.planifiees}</span>
                    <div className="progress w-24 h-1.5">
                      <div className="progress-bar" style={{ width: `${aeroStats.total > 0 ? (aeroStats.realisees / aeroStats.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                }
                className={hasRisque ? 'border-l-4 border-l-danger' : aDesExemptions ? 'border-l-4 border-l-warning' : ''}
              >
                {/* Alerte si mesures en retard */}
                {aDesMesuresEnRetard && (
                  <div className="alert alert-danger mb-2 p-2 text-sm">
                    <AlertTriangle className="alert-icon" />
                    <div className="alert-content">
                      <p className="text-small font-medium">Mesures d'atténuation en retard</p>
                      <p className="text-xs">Une inspection de type "Mise en oeuvre PAC" est recommandée.</p>
                    </div>
                  </div>
                )}

                {/* Alerte si exemptions actives */}
                {aDesExemptions && !aDesMesuresEnRetard && (
                  <div className="alert alert-info mb-2 p-2 text-sm">
                    <Shield className="alert-icon" />
                    <div className="alert-content">
                      <p className="text-small">Exemptions actives - Les mesures d'atténuation seront ajoutées aux checklists</p>
                    </div>
                  </div>
                )}

                {risqueData && risqueData.frequenceSuggestion && (
                  <div className="card bg-primary/5 border border-primary/20">
                    <p className="text-xs font-semibold text-primary flex items-center gap-2">
                      <Target className="w-3.5 h-3.5" />
                      Analyse prédictive - Recommandations
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2 text-sm">
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Fréquence</span>
                        <p className="font-bold text-primary">{risqueData.frequenceSuggestion.label}</p>
                        <p className="text-xs text-muted-foreground">{risqueData.frequenceSuggestion.justification}</p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Type suggéré</span>
                        <p className="font-bold text-primary capitalize">
                          {risqueData.decisionSurveillance.type === 'maintien' ? 'Maintien' :
                           risqueData.decisionSurveillance.type === 'inopine' ? 'Inopinée' :
                           risqueData.decisionSurveillance.type === 'periodique' ? 'Périodique' : risqueData.decisionSurveillance.type}
                        </p>
                        <p className="text-xs text-muted-foreground">{risqueData.decisionSurveillance.raison}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Délai: {risqueData.decisionSurveillance.delaiRecommandation}j · {risqueData.decisionSurveillance.domainesCibles.length} domaine(s)
                        </p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Écarts critiques</span>
                        <p className={`font-bold ${risqueData.nbEcartsCritiques > 0 ? 'text-danger' : 'text-success'}`}>
                          {risqueData.nbEcartsCritiques} actif(s)
                        </p>
                      </div>
                      <div className="bg-background rounded p-2 text-center">
                        <span className="text-xs text-muted-foreground">Exemptions</span>
                        <p className={`font-bold ${risqueData.aDesExemptions ? 'text-warning' : 'text-success'}`}>
                          {risqueData.aDesExemptions ? 'Oui' : 'Non'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {aeroPlannings.filter((p: any) => {
                  if (visibilityFilter === 'all') return true
                  if (visibilityFilter === 'active') return p.statut === 'planifiee' || p.statut === 'en_cours'
                  if (visibilityFilter === 'retards') return p.statut === 'en_retard' || (p.statut === 'planifiee' && p.date_debut && new Date(p.date_debut) < new Date())
                  return true
                }).map((planning: any) => (
                  <div key={planning.id} className="space-y-1">
                    {showProcessus && (() => {
                      const pr = processusActifs.find(p => p.aerodrome_id === planning.aerodrome_id && p.processus_type === planning.type);
                      return pr ? (
                        <div className="flex items-center gap-2 px-1">
                          <span className={`badge ${pr.processus_type === 'certification' ? 'primary' : 'info'} text-xs`}>
                            {pr.phase_label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(pr.progression)}%
                          </span>
                          <div className="progress w-16 h-1.5 ml-1">
                            <div className="progress-bar" style={{ width: `${pr.progression}%` }} />
                          </div>
                          <button className="action-button text-xs text-role-primary hover:underline" onClick={() => setActiveModule?.(pr.processus_type)}>
                            <span>Voir le processus →</span>
                          </button>
                        </div>
                      ) : null
                    })()}
                   <PlanningCard
                     key={planning.id}
                     planning={planning}
                     aerodrome={aerodrome}
                     onPrepare={() => handlePrepare(planning)}
                     onExecute={() => handleRequestExecute(planning)}
                     onView={() => handleView(planning)}
                     onEdit={() => handleEdit(planning)}
                     onDelete={() => handleDelete(planning)}
                     isLancee={planning.isLancee}
                     surveillanceId={planning.surveillanceId}
                     userRole={userRole}
                     profilScore={planning.profilScore}
                      onSuggestionIA={(p) => {
                        // Ouvrir le formulaire avec suggestions IA
                        setEditingPlanning(p);
                        setFormOpen(true);
                         // Déclencher la suggestion après ouverture
                         if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                         suggestionsTimerRef.current = setTimeout(() => {
                           handleAppliquerSuggestionsGlobal(p);
                         }, 500);
                      }}
                    />
                  </div>
                ))}
              </AccordionSection>
            );
          })}

          {planningsByAerodrome.length === 0 && (
            <div className="card">
              <div className="card-content py-12 text-center text-muted-foreground">
                <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Aucun planning trouvé pour les filtres sélectionnés</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Suggestions IA & Profil - Panneau de déclenchement */}
      {showProactiveSuggestions && createPortal(
        <div className="modal-overlay" data-role={userRole} onClick={() => setShowProactiveSuggestions(false)}>
          <div className="modal-content max-w-6xl max-h-[90vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
        <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary">
      <div className="modal-header border-b border-border bg-role-primary-soft">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center text-white">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Suggestions IA</h2>
            <p className="text-xs text-muted-foreground">Déclencheurs PAC, Écarts & Profil de risque</p>
          </div>
        </div>
        <button onClick={() => setShowProactiveSuggestions(false)} className="btn btn-secondary gap-2">
          <X className="h-4 w-4" />Fermer
        </button>
      </div>
      <div className="p-6">
          <div className="card border-primary mb-6 animate-fade-up">
          <div className="card-header bg-gradient-to-r from-primary/10 to-transparent">
            <div className="card-title flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Suggestions IA – Déclencheurs PAC & Écarts
            </div>
            <button 
              onClick={() => setShowProactiveSuggestions(false)}
              className="modal-close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              {aerodromesRisque
                .filter(a => (a.ecartTriggers && a.ecartTriggers.length > 0) || a.niveauAlerte === 'critique' || a.niveauAlerte === 'haute')
                .sort((a, b) => {
                  const order: Record<string, number> = { 'critique': 0, 'haute': 1, 'moyenne': 2 };
                  return (a.nbTriggersCritiques || 0) - (b.nbTriggersCritiques || 0) || (order[a.niveauAlerte as string] ?? 3) - (order[b.niveauAlerte as string] ?? 3);
                })
                .map((aero: AerodromeRisque) => (
                  <AccordionSection
                    key={aero.id}
                    icon={<Brain className="w-4 h-4 text-white" />}
                    title={
                      <span>
                        <span className="code-oaci-badge">{aero.code_oaci}</span>
                        <span className="ml-2 font-medium">{aero.nom}</span>
                      </span>
                    }
                    badges={
                      <>
                        {aero.nbTriggersCritiques > 0 && (
                          <span className="badge danger animate-pulse text-xs">{aero.nbTriggersCritiques} urgence(s)</span>
                        )}
                        {aero.nbTriggersHautes > 0 && (
                          <span className="badge warning text-xs">{aero.nbTriggersHautes} alerte(s)</span>
                        )}
                        {aero.hasPacAccepteEnAttente && (
                          <span className="badge primary text-xs">PAC à vérifier</span>
                        )}
                      </>
                    }
                    className={
                      aero.nbTriggersCritiques > 0 ? 'border-l-4 border-l-danger' :
                      aero.nbTriggersHautes > 0 ? 'border-l-4 border-l-warning' :
                      'border-l-4 border-l-role-primary'
                    }
                  >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Profil de risque</p>
                        <p className={`text-2xl font-bold ${aero.profilScore < 30 ? 'text-danger' : aero.profilScore < 60 ? 'text-warning' : 'text-success'}`}>
                          {aero.profilScore || 'N/A'}/100
                        </p>
                        {aero.profilTendance && (
                          <p className="text-xs text-muted-foreground">Tendance: {aero.profilTendance}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Type suggéré</p>
                        <p className="font-medium capitalize">
                          {aero.decisionSurveillance?.type === 'maintien' ? 'Maintien' :
                           aero.decisionSurveillance?.type === 'inopine' ? 'Inopinée' :
                           aero.decisionSurveillance?.type === 'periodique' ? 'Périodique' : aero.decisionSurveillance?.type || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{aero.decisionSurveillance?.raison}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Délai: {aero.decisionSurveillance?.delaiRecommandation || '-'}j</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fréquence</p>
                        <p className="font-medium">{aero.frequenceSuggestion?.label || 'N/A'}</p>
                      </div>
                    </div>

                    {/* Création rapide pour cas critique */}
                    {aero.decisionSurveillance?.priorite === 'critique' && (
                      <div className="flex items-center gap-3 mb-4 p-2 bg-danger/5 border border-danger/20 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-danger shrink-0" />
                        <span className="text-xs text-danger font-medium flex-1">
                          Action immédiate requise — créer une surveillance d'urgence maintenant
                        </span>
                        <button
                          onClick={() => {
                            setEditingPlanning({
                              id: '', aerodrome_id: aero.id,
                              type: 'audit_complet',
                              date_debut: '', date_fin: '',
                              portee: aero.decisionSurveillance.domainesCibles,
                              equipe_ids: [], chef_id: '',
                              statut: 'planifiee',
                              priorite: 'critique',
                              objectifs: aero.decisionSurveillance.raison,
                              est_proposition: true,
                              annee_cible: selectedYear,
                              created_at: new Date().toISOString(),
                              updated_at: new Date().toISOString(),
                            });
                            setFormOpen(true);
                            if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                            suggestionsTimerRef.current = setTimeout(() => handleAppliquerSuggestionsGlobal({ aerodrome_id: aero.id }), 500);
                          }}
                          className="btn btn-sm btn-danger gap-1 shrink-0"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          Créer maintenant
                        </button>
                      </div>
                    )}

                    <div className="space-y-2">
                      {aero.ecartTriggers?.slice(0, 10).map((trigger) => {
                        const typeLabel = trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'Vérification PAC' : trigger.typeSurveillanceSuggere === 'suivi_ecarts' ? 'Suivi écarts' : 'Audit complet';
                        const urgenceColor = trigger.urgence === 'critique' ? 'border-l-danger bg-danger/5' : trigger.urgence === 'haute' ? 'border-l-warning bg-warning/5' : 'border-l-role-primary bg-muted/30';
                        const statutBadge = trigger.ecart.statut === 'pac_attendu' ? 'badge warning' : trigger.ecart.statut === 'pac_accepte' ? 'badge primary' : trigger.ecart.statut === 'preuves_soumises' ? 'badge success' : 'badge outline';

                        return (
                          <div key={trigger.ecart.id} className={`card border-l-4 ${urgenceColor}`}>
                            <div className="card-content p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-semibold">{trigger.ecart.reference}</span>
                                  <span className={`badge text-xs ${statutBadge}`}>{trigger.ecart.statut.replace(/_/g, ' ')}</span>
                                  <span className="badge outline text-xs">OACI {trigger.celluleOACI}</span>
                                  {trigger.badgeLabel && (
                                    <span className={`text-xs font-medium ${trigger.urgence === 'critique' ? 'text-danger' : trigger.urgence === 'haute' ? 'text-warning' : 'text-muted-foreground'}`}>
                                      {trigger.badgeLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${trigger.predictionResultat === 'SA' ? 'bg-success/20 text-success' : trigger.predictionResultat === 'NS' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning'}`}>
                                    {trigger.predictionResultat} ({trigger.predictionConfiance}%)
                                  </span>
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">{trigger.justification}</p>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">→</span>
                                <span className="text-xs font-medium">{typeLabel}</span>
                                <button
                                  onClick={() => {
                                    setEditingPlanning({
                                      id: '', aerodrome_id: aero.id,
                                      type: trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'mise_oeuvre_pac' : trigger.typeSurveillanceSuggere === 'suivi_ecarts' ? 'suivi_ecarts' : 'audit_complet',
                                      date_debut: '', date_fin: '', portee: [], equipe_ids: [], chef_id: '',
                                      statut: 'planifiee', priorite: trigger.urgence === 'critique' ? 'critique' : trigger.urgence === 'haute' ? 'haute' : 'moyenne',
                                      objectifs: `Surveillance déclenchée: ${trigger.justification}`,
                                      est_proposition: true, annee_cible: selectedYear,
                                      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                                    });
                                    setFormOpen(true);
                                    if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                                    suggestionsTimerRef.current = setTimeout(() => handleAppliquerSuggestionsGlobal({ aerodrome_id: aero.id }), 500);
                                    submitSuggestionFeedback(aero.id, trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'surveillance_pac' : 'surveillance_ecarts', trigger.typeSurveillanceSuggere, true, undefined, [trigger.ecart.id]);
                                  }}
                                  className="btn btn-sm btn-primary gap-1"
                                >
                                  <PlayCircle className="w-3 h-3" />
                                  Planifier
                                </button>
                                <button
                                  onClick={() => openFeedbackModal(aero.id, trigger.typeSurveillanceSuggere === 'mise_oeuvre_pac' ? 'surveillance_pac' : 'surveillance_ecarts', trigger.typeSurveillanceSuggere, [trigger.ecart.id])}
                                  className="btn btn-sm btn-outline gap-1"
                                >
                                  <X className="w-3 h-3" />
                                  Ignorer
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Suggestions de maintien */}
                    {aero.suggestionsMaintien && aero.suggestionsMaintien.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2">
                          <Shield className="w-3.5 h-3.5 text-role-primary" />
                          Suggestions de maintien ({aero.suggestionsMaintien.length})
                        </p>
                        <div className="space-y-2">
                          {aero.suggestionsMaintien.map((s, idx) => (
                            <div key={idx} className="card border-l-4 border-l-primary bg-primary/5">
                              <div className="card-content p-3">
                                <div className="flex items-center justify-between flex-wrap gap-1 mb-1">
                                  <span className="text-xs font-medium">{s.raison}</span>
                                  <span className="badge outline text-xs">{s.confiance}%</span>
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {s.domaines.map((d: string) => (
                                    <span key={d} className="code-oaci-badge text-xs">{d}</span>
                                  ))}
                                  {s.typesChecklist.map((t: string) => (
                                    <span key={t} className="badge neutral text-xs">{t.replace(/_/g, ' ')}</span>
                                  ))}
                                </div>
                                <span className="text-xs text-muted-foreground mt-1 block">
                                  Source: {s.source === 'ecart_actif' ? 'Écart actif' : s.source === 'evenement_securite' ? 'Événement sécurité' : s.source === 'conformite_baisse' ? 'Conformité' : s.source === 'domaine_critique' ? 'Domaine critique' : s.source === 'historique' ? 'Historique' : s.source === 'lanceur_alerte' ? 'Lanceur alerte' : s.source}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Domaines critiques */}
                    {aero.domainesCritiques && aero.domainesCritiques.length > 0 && (
                      <div className="mb-4">
                        <p className="text-sm font-medium mb-2">Domaines à surveiller</p>
                        <div className="space-y-2">
                          {aero.domainesCritiques.map((d, idx) => (
                            <div key={idx} className="card border-l-4 border-l-primary bg-primary/5">
                              <div className="card-content p-3">
                                <div className="flex items-center justify-between">
                                  <span className={`badge text-xs ${d.score < 30 ? 'danger' : d.score < 60 ? 'warning' : 'primary'}`}>
                                    {d.domaine} (Score: {d.score})
                                  </span>
                                  <span className="text-xs text-muted-foreground">Seuil: {d.seuil}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {aero.nbEcartsCritiques > 0 && (
                        <span className="badge danger text-xs">{aero.nbEcartsCritiques} écart(s) critique(s)</span>
                      )}
                      {aero.aDesExemptions && (
                        <span className="badge warning text-xs">Exemptions actives</span>
                      )}
                      {aero.aDesMesuresEnRetard && (
                        <span className="badge danger text-xs animate-pulse">Mesures en retard</span>
                      )}
                    </div>
                  </AccordionSection>
                ))}

              {aerodromesRisque.filter(a => (a.ecartTriggers && a.ecartTriggers.length > 0) || a.niveauAlerte === 'critique' || a.niveauAlerte === 'haute').length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Aucun déclencheur actif — toutes les surveillances sont sous contrôle.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Feedback Suggestion IA */}
      {feedbackModalOpen && createPortal(
        <div className="modal-backdrop" onClick={() => setFeedbackModalOpen(false)}>
          <div className="modal-content max-w-md rounded-2xl overflow-hidden border-t-4 border-t-role-primary" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title flex items-center gap-2">
                <Brain className="w-5 h-5 text-role-primary" />
                Feedback sur la suggestion
              </div>
              <button onClick={() => setFeedbackModalOpen(false)} className="modal-close"><X className="w-4 h-4" /></button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <p className="text-sm text-muted-foreground">Cette suggestion était-elle pertinente ?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setFeedbackValue(true); setFeedbackReason(''); }}
                  className={`flex-1 py-3 rounded-lg border-2 text-center font-medium transition-all ${feedbackValue ? 'border-success bg-success/10 text-success' : 'border-border hover:bg-muted'}`}
                >
                  <CheckCircle2 className="w-5 h-5 mx-auto mb-1" />
                  Oui, pertinent
                </button>
                <button
                  onClick={() => { setFeedbackValue(false); }}
                  className={`flex-1 py-3 rounded-lg border-2 text-center font-medium transition-all ${!feedbackValue ? 'border-danger bg-danger/10 text-danger' : 'border-border hover:bg-muted'}`}
                >
                  <XCircle className="w-5 h-5 mx-auto mb-1" />
                  Non, pas pertinent
                </button>
              </div>
              {!feedbackValue && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Pourquoi ?</label>
                  <select
                    value={feedbackReason}
                    onChange={(e) => setFeedbackReason(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm"
                  >
                    <option value="">Sélectionnez une raison</option>
                    <option value="Type incorrect">Type de surveillance incorrect</option>
                    <option value="Pas le bon moment">Pas le bon moment</option>
                    <option value="Déjà planifié">Déjà planifié ailleurs</option>
                    <option value="Priorité trop basse">Priorité trop basse</option>
                    <option value="Autre">Autre raison</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer border-t border-border p-4 flex justify-end gap-2">
              <button className="btn btn-secondary" onClick={() => setFeedbackModalOpen(false)}>Annuler</button>
              <button className="btn btn-primary" onClick={confirmFeedback}>Envoyer</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Vue Tableau */}
      {viewMode === 'table' && (
        <div className="card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left p-3 font-semibold text-muted-foreground">Aérodrome</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Période</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground">Domaines</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Statut</th>
                  <th className="text-center p-3 font-semibold text-muted-foreground">Priorité</th>
                  <th className="text-right p-3 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlannings.length === 0 ? (
                  <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Aucun planning</td></tr>
                ) : filteredPlannings.map(planning => {
                  const aero = aerodromes.find(a => a.id === planning.aerodrome_id)
                  const statutMap: Record<string, { cls: string; label: string }> = {
                    planifiee: { cls: 'badge primary', label: 'Planifiée' },
                    en_cours: { cls: 'badge warning', label: 'En cours' },
                    realisee: { cls: 'badge success', label: 'Réalisée' },
                    annulee: { cls: 'badge neutral', label: 'Annulée' },
                    en_retard: { cls: 'badge danger', label: 'En retard' },
                  }
                  const s = statutMap[planning.statut] || { cls: 'badge outline', label: planning.statut }
                  return (
                    <tr key={planning.id} className="border-b border-border hover:bg-role-primary-soft/10 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="code-oaci-badge text-xs">{aero?.code_oaci || '?'}</span>
                          <span className="font-medium truncate max-w-[140px]">{aero?.nom || planning.aerodrome_id?.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="capitalize">{planning.type?.replace(/_/g, ' ') || '—'}</span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {planning.date_debut ? new Date(planning.date_debut).toLocaleDateString('fr-FR') : '?'} → {planning.date_fin ? new Date(planning.date_fin).toLocaleDateString('fr-FR') : '?'}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-0.5">
                          {planning.portee?.slice(0, 3).map(d => <span key={d} className="text-xs bg-muted/30 px-1 rounded">{d}</span>)}
                          {(!planning.portee || planning.portee.length === 0) && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="p-3 text-center"><span className={`badge text-xs ${s.cls}`}>{s.label}</span></td>
                      <td className="p-3 text-center">
                        {planning.priorite && (() => {
                          const pBadge: Record<string, string> = { critique: 'badge danger', haute: 'badge warning', moyenne: 'badge primary', basse: 'badge success' }
                          const pLabel: Record<string, string> = { critique: 'Critique', haute: 'Élevée', moyenne: 'Moyen', basse: 'Faible' }
                          return <span className={`badge text-xs ${pBadge[planning.priorite] || 'badge neutral'}`}>{pLabel[planning.priorite] || planning.priorite}</span>
                        })()}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleView(planning)} className="action-button" title="Voir"><Info className="w-4 h-4" /></button>
                          <button onClick={() => handlePrepare(planning)} className="action-button" title="Préparer"><PlayCircle className="w-4 h-4" /></button>
                          <button onClick={() => handleEdit(planning)} className="action-button" title="Modifier"><Edit2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vues modales */}
      {viewMode === 'calendar' && (
        <PlanningCalendarView
          plannings={planningsEnrichis}
          aerodromes={aerodromes}
          onSelectEvent={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {viewMode === 'gantt' && (
        <PlanningGanttView
          plannings={filteredPlannings}
          aerodromes={aerodromes}
          selectedYear={selectedYear}
          userRole={userRole}
        />
      )}

      {viewMode === 'workload' && <WorkloadView userRole={userRole} />}
      {viewMode === 'assignment' && <SmartAssignment userRole={userRole} />}

      {/* ── Modale Planning N+1 ── */}
      {showNPlus1Modal && createPortal(
        <div className="modal-overlay" data-role={userRole} onClick={() => setShowNPlus1Modal(false)}>
          <div className="modal-content max-w-7xl max-h-[92vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
            <PlanningNPlus1 onClose={() => setShowNPlus1Modal(false)} userRole={userRole} />
          </div>
        </div>,
        document.body
      )}

      {/* Modales */}
      <FormModal />
      <DeleteConfirmModal />
      <ExecuteConfirmModal />
      <PreparationModal open={preparationOpen} planning={preparationPlanning} onClose={() => setPreparationOpen(false)} userRole={userRole} />
    </div>
  );
}
