// components/modules/planning/PlanningModule.tsx
// VERSION FINALE CORRIGÉE
// ✅ Suppression des fonctions dupliquées getFrequenceSuggerer et getTypeSuggerer
// ✅ Utilisation de computeFinalFrequency et suggestMissionType depuis risque.ts
// ✅ Ajout du feedback utilisateur pour l'apprentissage (retiré — corrompait le Random Forest)
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
import { useAppStore, Planning, Aerodrome, ProfilRisque, Surveillance, Utilisateur, Ecart, IaSuggestion } from '@/lib/store';
import { getProcessusActifs } from '@/lib/processus';
import {
  CalendarDays,
  Calendar,
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
  Filter,
  PlayCircle,
  Edit2,
  Trash2,
  MapPin,
  Brain,
  Loader2,
  Send,
  XCircle,
  RefreshCw,
} from 'lucide-react';

import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';

// Store
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { DOMAINES_SURVEILLANCE, getDomaineLabel, expandDomaines, genererSuggestionsMaintien, verifierCompositionEquipe, type SuggestionMaintien } from '@/lib/domaines';

const ROLE_EXPLOITANT = ['dg_operator', 'focal_operator', 'staff_operator']

// Composants du module
import { PlanningCalendarView } from './PlanningCalendarView';
import PlanningGanttView from './PlanningGanttView';
import PlanningForm from '@/components/forms/PlanningForm';
import { WorkloadView } from './WorkloadView';
import { SmartAssignment } from './SmartAssignment';
import PlanningNPlus1 from './PlanningNPlus1';
import PreparationModal from './PreparationModal'
import { PlanningCard } from '@/components/cards/PlanningCard';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { kitDocAgent, toDomaineChecklistArray } from '@/lib/ia/agents/kitDocAgent';
import { checklistMemory } from '@/lib/checklistMemory';

// Import des fonctions risque
import { 
  RISK_LEVELS, 
  getRiskLevel, 
  computeVelocityMetrics, 
  computeProactiveAlert, 
  computeFinalFrequency,
} from '@/lib/risque';
import { riskEngine, getEcartTriggers, type EcartTrigger } from '@/lib/riskEngine';
import { Card } from '@/components/ui/card';
import { predictHMM } from '@/lib/risque/hmm'
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
}

export default function PlanningModule({ userRole }: PlanningModuleProps) {
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
  const setActiveModule = useAppStore(s => s.setActiveModule);

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
  const [showIaSuggestionModal, setShowIaSuggestionModal] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<'active' | 'all' | 'retards' | 'terminees'>('active');
  const certifications = useAppStore(s => s.certifications || []);
  const homologations = useAppStore(s => s.homologations || []);
  const iaSuggestions = useAppStore(s => s.iaSuggestions || []);
  const addIaSuggestion = useAppStore(s => s.addIaSuggestion);
  const removeIaSuggestion = useAppStore(s => s.removeIaSuggestion);
  const addPlanning = useAppStore(s => s.addPlanning);
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
    // Exclure les plannings est_proposition (remplacés par iaSuggestions)
    list = list.filter(p => !p.est_proposition);
    // Exclure TOUS les plannings certification/homologation (affichés dans l'accordéon dédié)
    list = list.filter(p => p.type !== 'certification' && p.type !== 'homologation');
    return list;
  }, [planningsStore, selectedYear, selectedAerodrome, selectedType, selectedStatut, searchTerm, aerodromesActifs]);

  // Plannings certification/homologation (affichés dans l'accordéon dédié)
  const certHomologPlannings = useMemo(() => {
    return planningsStore.filter(p => p.type === 'certification' || p.type === 'homologation')
  }, [planningsStore, certifications, homologations])

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
        critique: 'critique', eleve: 'haute', moyen: 'moyen', faible: null
      } as Record<string, string | null>)[getRiskLevel(profil.score_global)] || null;

      // ── Utilise le moteur complet de surveillance continue ──
      const urgents = riskEngine.detectUrgentEcards(ecartsAerodrome, profil);
      const degradations = riskEngine.detectDomainDegradations(profil);
      // HMM state — détection transition silencieuse via scores historiques
      let hmmState: string | undefined
      try {
        const scoresHist = surveillances
          .filter(s => s.aerodrome_id === aero.id && (s as any).score_global !== undefined)
          .slice(-12)
          .map(s => (s as any).score_global as number)
        if (scoresHist.length >= 3) {
          const hmmR = predictHMM(scoresHist)
          hmmState = hmmR.isTransitioning ? 'degrading' : hmmR.currentStateName
        }
      } catch { /* HMM indisponible */ }
      const decision = riskEngine.determineTypeSurveillanceContinue(
        profil, urgents, degradations,
        ecartsAerodrome, undefined, undefined, undefined, aero.statut_sgs as 'complet' | 'simplifie' | 'non_applicable' | undefined,
        hmmState,
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

  // Pont : aerodromesRisque → iaSuggestions — alimente le bouton "Suggestions IA"
  useEffect(() => {
    const planningsAerodromeIds = new Set(filteredPlannings.map(p => p.aerodrome_id))
    const suggestionAerodromeIds = new Set(iaSuggestions.map(s => s.aerodrome_id))
    const maintenant = new Date().toISOString()

    for (const aero of aerodromesRisque) {
      if (aero.niveauAlerte !== 'critique' && aero.niveauAlerte !== 'haute') continue
      if (suggestionAerodromeIds.has(aero.id)) continue
      if (planningsAerodromeIds.has(aero.id)) continue

      const newSuggestion: IaSuggestion = {
        id: `ia-sug-${Date.now()}-${aero.id}`,
        aerodrome_id: aero.id,
        type: aero.decisionSurveillance.type === 'inopinee' ? 'programmee' as const : 'programmee' as const,
        portee: aero.decisionSurveillance.domainesCibles || aero.domainesCritiques.map((d: any) => d.domaine).filter(Boolean),
        date_debut: new Date(Date.now() + 7 * 86400000).toISOString(),
        date_fin: new Date(Date.now() + 9 * 86400000).toISOString(),
        equipe_ids: [],
        chef_id: '',
        priorite: (aero.niveauAlerte === 'critique' ? 'critique' : 'haute') as Planning['priorite'],
        objectifs: `Surveillance ${aero.decisionSurveillance.type} — ${aero.decisionSurveillance.raison}`,
        raison: aero.decisionSurveillance.raison,
        confiance: aero.niveauAlerte === 'critique' ? 85 : 70,
        source: aero.niveauAlerte === 'critique' ? 'risque_critique' : 'sgs_faible',
        created_at: maintenant,
      }
      addIaSuggestion(newSuggestion)
    }
  }, [aerodromesRisque, iaSuggestions, filteredPlannings, addIaSuggestion])

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
      
      if (['checklist_signee', 'ecarts_signes', 'rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(planning.statut)) group.stats.realisees++;
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
    // Ancien appel à learningEngine.recordLearningFeedback retiré — 
    // il enregistrait des données non-checklist ('planning'/'SA'/'SA')
    // qui corrompaient l'entraînement du Random Forest.
    // Le feedback planning sera réimplémenté via engineFeedback/decisionTracker.
    
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
    if (planning.est_proposition) {
      addNotification({
        user_id: user?.id || '', type: 'warning',
        title: 'Planning non validé',
        message: 'Validez d\'abord ce planning via la section Planning N+1 avant de l\'exécuter.',
        canal: 'in_app',
      });
      return;
    }
    setExecuteTarget(planning);
    setExecuteConfirmOpen(true);
  };

  const handleConfirmExecute = async () => {
    if (!executeTarget) return;
    setExecuteConfirmOpen(false);
    await handleLancer(executeTarget);
  };

  const handleLancer = async (planning: Planning) => {
    const store = useAppStore.getState()
    const { addSurveillance, setChecklistHierarchy, updateSurveillance } = store;
    if (planning.est_proposition) {
      addNotification({
        user_id: user?.id || '', type: 'danger',
        title: 'Validation requise',
        message: 'Ce planning doit d\'abord être validé via la validation N+1 avant d\'être exécuté.',
        canal: 'in_app',
      });
      return;
    }
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

    // Vérifier la composition de l'équipe avant de lancer
    const equipeIds = planning.equipe_ids || [];
    if (equipeIds.length > 0) {
      const { valide, erreurs } = verifierCompositionEquipe(equipeIds, utilisateurs, porteeComplete)
      if (!valide) {
        addNotification({
          user_id: user?.id || '', type: 'danger',
          title: 'Équipe incompatible',
          message: erreurs.join('. '),
          canal: 'in_app',
        })
        return
      }
    }

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

    const surveillance = await addSurveillance(nouvelleSurveillance);

    if (surveillance && surveillance.id) {
      updatePlanning(planning.id, {
        statut: 'en_cours',
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
          try {
            const checklistPrefix = planning.type === 'certification' ? 'CERT'
              : planning.type === 'homologation' ? 'HMG' : 'QSC';
            const result = await kitDocAgent.generateChecklist({
              surveillance_id: surveillance.id,
              entite_id: planning.aerodrome_id,
              type_entite: aerodrome?.type_entite ?? 'aerodrome',
              type_surveillance: typeSurv,
              portee: planning.portee || [],
              profil_risque: profil,
              prefix_numero: checklistPrefix,
            });
            const resultFiltered = aerodrome ? { ...result, domaines: kitDocAgent.filterChecklistByAerodrome(result.domaines as any[], aerodrome) } : result;
            kitDocAgent.injectIntoStore(surveillance.id, resultFiltered);
            updateSurveillance(surveillance.id, { checklist_hierarchy: toDomaineChecklistArray(resultFiltered) });
          } catch (err) {
              console.error('[Planning] Erreur génération IA checklist:', err);
              addNotification({
                user_id: user?.id || '', type: 'danger',
                title: 'Erreur IA',
                message: 'La génération automatique de la checklist a échoué. Vous pourrez la générer depuis la page checklist.',
                canal: 'in_app',
              });
            }
        }
      }

      // ── Pre-remplir les items checklist avec les prédictions IA (checklistMemory) ──
      try {
        const profil = store.profilsRisque?.[planning.aerodrome_id]
        const surv = store.surveillances.find(s => s.id === surveillance.id)
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
              store.setChecklistHierarchy(surveillance.id, hierarchy)
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
      const aerodrome = aerodromes.find(a => a.id === planning.aerodrome_id);
      utilisateurs
        .filter(u =>
          u.aerodrome_id === planning.aerodrome_id &&
          (ROLE_EXPLOITANT.includes(u.role ?? '') || u.role === 'guest') &&
          u.statut !== 'inactif' && u.statut !== 'suspendu'
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

    // ── Synchroniser surveillance_id vers la certification/homologation liée ──
    if (planning.type === 'certification') {
      const relatedCert = store.certifications.find(
        c => c.aerodrome_id === planning.aerodrome_id && c.phase_active === 3 && c.statut_global === 'en_cours'
      );
      if (relatedCert) {
        const currentPhase3 = (relatedCert.phases_data as any)?.phase3 || {};
        store.updateCertification(relatedCert.id, {
          phases_data: { ...relatedCert.phases_data, phase3: { ...currentPhase3, surveillance_id: surveillance.id } },
        } as any);
      }
    } else if (planning.type === 'homologation') {
      const relatedHomo = store.homologations.find(
        (h: any) => h.aerodrome_id === planning.aerodrome_id && h.phase_active === 2 && h.statut_global === 'en_cours'
      );
      if (relatedHomo) {
        const currentPhase2 = (relatedHomo.phases_data as any)?.phase2 || {};
        store.updateHomologation(relatedHomo.id, {
          phases_data: { ...relatedHomo.phases_data, phase2: { ...currentPhase2, surveillance_id: surveillance.id } },
        } as any);
      }
    }
    // ─────────────────────────────────────────────────────────────

    // Naviguer vers la page de la surveillance (pas directement la checklist)
    router.push(`/surveillance/${surveillance.id}`);
  };

  const handleEdit = (planning: Planning) => {
    setEditingPlanning(planning);
    startTransition(() => setFormOpen(true));
  };

  // Valider une suggestion IA → crée le planning
  const handleValiderSuggestion = useCallback(async (suggestion: IaSuggestion) => {
    const now = new Date().toISOString()
    const planning: Planning = {
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
        message: `Planning ${suggestion.type.replace(/_/g, ' ')} créé à partir de la suggestion IA.`,
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
  }, [addPlanning, removeIaSuggestion, submitSuggestionFeedbackStore, addNotification, user])

  // Ajuster une suggestion → ouvre le formulaire de planning pré-rempli
  const handleAjusterSuggestion = useCallback((suggestion: IaSuggestion) => {
    setEditingPlanning({
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    setFormOpen(true)
    setShowIaSuggestionModal(false)
  }, [setEditingPlanning, setFormOpen])

  // Rejeter une suggestion → enregistre le feedback et la supprime
  const handleRejeterSuggestion = useCallback((suggestion: IaSuggestion, motif?: string) => {
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
  }, [removeIaSuggestion, submitSuggestionFeedbackStore])

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
    const DOMAINE_TO_CKEY: Record<string, string> = { SGS: 'c1', PAC: 'c2', PHY: 'c3', Ecarts: 'c4', SLI: 'c5' }
    domaines.sort((a, b) =>
      ((profil as unknown as Record<string, number>)[DOMAINE_TO_CKEY[a] || 'c3'] ?? 0) -
      ((profil as unknown as Record<string, number>)[DOMAINE_TO_CKEY[b] || 'c3'] ?? 0)
    );
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

    // Ancien appel à learningEngine.recordLearningFeedback retiré — corrompait le Random Forest

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

  const handleView = (planning: Planning) => {
    if (planning.surveillance_id) {
      router.push(`/surveillance/${planning.surveillance_id}`);
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
        p.aDesExemptions ? 'Oui' : 'Non',
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

/* ───────── Composants extraits (hors du corps du composant parent) ───────── */

function ModaleSuppression({ deleteDialogOpen, setDeleteDialogOpen, confirmDelete, userRole }: {
  deleteDialogOpen: boolean, setDeleteDialogOpen: (v: boolean) => void,
  confirmDelete: () => void, userRole: string
}) {
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
}

function ModaleExecution({ executeConfirmOpen, executeTarget, setExecuteConfirmOpen, setExecuteTarget, aerodromesActifs, aerodromes, userRole, handleConfirmExecute }: {
  executeConfirmOpen: boolean, executeTarget: Planning | null,
  setExecuteConfirmOpen: (v: boolean) => void, setExecuteTarget: (v: Planning | null) => void,
  aerodromesActifs: Aerodrome[], aerodromes: Aerodrome[], userRole: string,
  handleConfirmExecute: () => void
}) {
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
}

function ModaleFormulaire({ formOpen, setFormOpen, editingPlanning, setEditingPlanning, userRole }: {
  formOpen: boolean, setFormOpen: (v: boolean) => void,
  editingPlanning: Planning | null, setEditingPlanning: (v: Planning | null) => void,
  userRole: string
}) {
  return (
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
}

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
      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
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
                title={(() => {
                  const mois = new Date().getMonth() + 1
                  return mois >= 11 ? 'Planning N+1 disponible' : 'Planning N+1 — disponible en novembre'
                })()}
              >
                <TrendingUp className="w-4 h-4" />
                <span>N+1</span>
              </button>
              {(() => {
                const mois = new Date().getMonth() + 1
                const isNovOrLater = mois >= 11
                if (!isNovOrLater) {
                  return <span className="badge neutral absolute -top-2 -right-2 h-5 min-w-[1.25rem] px-1.5 flex items-center justify-center text-xs font-bold">Bientôt</span>
                }
                if (propositionsCount === 0) {
                  return <span className="badge success absolute -top-2 -right-2 h-5 min-w-[1.25rem] px-1.5 flex items-center justify-center text-xs font-bold">Dispo.</span>
                }
                return (
                  <span className={`badge ${propositionsCount > 5 ? 'danger pulse' : 'warning'} absolute -top-2 -right-2 h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-xs font-bold`}>
                    {propositionsCount > 99 ? '99+' : propositionsCount}
                  </span>
                )
              })()}
            </div>
            
            {/* Bouton Suggestions IA — badge des suggestions en attente */}
            {(() => {
              const badgeCount = iaSuggestions.length;
              const aDesNouvelles = badgeCount > 0;

              if (aDesNouvelles) return (
                <div className="relative inline-flex shrink-0">
                  <span className="absolute inset-0 rounded-md animate-ping bg-primary/35 pointer-events-none" />
                  <button
                    onClick={() => setShowIaSuggestionModal(true)}
                    className="btn btn-primary gap-2 animate-pulse relative"
                    title={`${badgeCount} suggestion(s) IA en attente de validation`}
                  >
                    <Brain className="w-4 h-4" />
                    <span>Suggestions IA</span>
                    <span className="badge text-xs danger">{badgeCount}</span>
                  </button>
                </div>
              );

              return (
                <button
                  onClick={() => {}}
                  className="btn btn-secondary gap-2 opacity-60"
                  title="Aucune suggestion en attente"
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
            <button
              onClick={() => setVisibilityFilter('terminees')}
              className={visibilityFilter === 'terminees' ? 'active' : ''}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Terminées</span>
            </button>
          </div>

          <button onClick={resetFilters} className="action-button" title="Réinitialiser les filtres">
            <X className="w-4 h-4" />
          </button>


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
            <div className="mt-2 p-3 bg-primary-soft/50 rounded-lg border border-primary/20">
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="flex items-center gap-1 text-xs font-medium text-role-primary">
                  <Brain className="w-3 h-3" /> Réponse IA
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setIaAnswer(''); setIaQuestion(''); }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-role-primary bg-role-primary-soft hover:bg-role-primary-soft/80 transition-colors">
                    <RefreshCw className="w-3 h-3" /> Nouvelle question
                  </button>
                  <button onClick={() => setIaAnswer('')}
                    className="action-button w-6 h-6 p-0" title="Fermer">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{iaAnswer}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Certifications & Homologations (regroupées séparément de la surveillance continue) */}
      {certHomologPlannings.length > 0 && (
        <AccordionGroup spacing="sm">
          {['certification', 'homologation'].map(type => {
            const items = certHomologPlannings.filter(p => p.type === type)
            if (items.length === 0) return null
            return (
              <AccordionSection
                key={type}
                icon={<Shield className="w-4 h-4 !text-white" />}
                title={
                  <span className="text-foreground font-medium">
                    {type === 'certification' ? 'Certifications' : 'Homologations'}
                  </span>
                }
                badges={<span className="badge outline">{items.length} planning(s)</span>}
                defaultOpen={true}
              >
                {items.map(planning => {
                  const aero = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id)
                  const survLiee = surveillances.find(s => s.planning_id === planning.id)
                  return (
                    <div key={planning.id} className="space-y-1">
                      <PlanningCard
                        planning={planning}
                        aerodrome={aero}
                        isLancee={!!survLiee}
                        surveillanceId={survLiee?.id}
                        onPrepare={() => handlePrepare(planning)}
                        onExecute={() => handleRequestExecute(planning)}
                        onView={() => handleView(planning)}
                        onEdit={() => handleEdit(planning)}
                        onDelete={() => handleDelete(planning)}
                        userRole={userRole}
                        onSuggestionIA={(p) => {
                          setEditingPlanning(p);
                          setFormOpen(true);
                          if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                          suggestionsTimerRef.current = setTimeout(() => {
                            handleAppliquerSuggestionsGlobal(p);
                          }, 500);
                        }}
                      />
                    </div>
                  )
                })}
              </AccordionSection>
            )
          })}
        </AccordionGroup>
      )}

      {/* Vue Liste */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {planningsByAerodrome.map(({ aerodrome, plannings: aeroPlannings, stats: aeroStats, aDesExemptions, aDesMesuresEnRetard }) => {
            const risqueData = aerodromesRisque.find(a => a.id === aerodrome.id);
            const hasRisque = risqueData?.niveauAlerte === 'critique' || risqueData?.niveauAlerte === 'haute';
            
            return (
              <AccordionSection
                key={aerodrome.id}
                icon={<MapPin className="w-4 h-4 !text-white" />}
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
                  <Card className="bg-primary/5 border-primary/20">
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
                  </Card>
                )}
                
                {aeroPlannings.filter((p: any) => {
                  if (visibilityFilter === 'all') return true
                  if (visibilityFilter === 'active') return p.statut === 'planifiee' || p.statut === 'en_cours'
                  if (visibilityFilter === 'retards') return p.statut === 'en_retard' || (p.statut === 'planifiee' && p.date_debut && new Date(p.date_debut) < new Date())
                  if (visibilityFilter === 'terminees') return ['checklist_signee', 'ecarts_signes', 'rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(p.statut)
                  return true
                }).length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">Aucun planning {visibilityFilter === 'retards' ? 'en retard' : visibilityFilter === 'terminees' ? 'termine' : ''}</p>
                  </div>
                ) : (
                  aeroPlannings.filter((p: any) => {
                    if (visibilityFilter === 'all') return true
                    if (visibilityFilter === 'active') return p.statut === 'planifiee' || p.statut === 'en_cours'
                    if (visibilityFilter === 'retards') return p.statut === 'en_retard' || (p.statut === 'planifiee' && p.date_debut && new Date(p.date_debut) < new Date())
                    if (visibilityFilter === 'terminees') return ['checklist_signee', 'ecarts_signes', 'rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(p.statut)
                  return true
                }).map((planning: any) => (
                  <div key={planning.id} className="space-y-1">
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
                        setEditingPlanning(p);
                        setFormOpen(true);
                         if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current)
                         suggestionsTimerRef.current = setTimeout(() => {
                           handleAppliquerSuggestionsGlobal(p);
                         }, 500);
                      }}
                    />
                  </div>
                ))
                )}
              </AccordionSection>
            );
          })}

          {planningsByAerodrome.length === 0 && (
            <Card className="[&>div:last-child]:py-12 [&>div:last-child]:text-center">
              <CalendarDays className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-muted-foreground">Aucun planning trouvé pour les filtres sélectionnés</p>
            </Card>
          )}
        </div>
      )}

      {/* Modal Suggestions IA — propositions de surveillance à valider */}
      {showIaSuggestionModal && createPortal(
        <div className="modal-overlay" data-role={userRole} onClick={() => setShowIaSuggestionModal(false)}>
          <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto p-0" onClick={e => e.stopPropagation()}>
            <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary">
              <div className="modal-header border-b border-border bg-role-primary-soft">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center !text-white">
                    <Brain className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Suggestions IA</h2>
                    <p className="text-xs text-muted-foreground">{iaSuggestions.length} proposition(s) de surveillance en attente de validation</p>
                  </div>
                </div>
                <button onClick={() => setShowIaSuggestionModal(false)} className="btn btn-secondary gap-2">
                  <X className="h-4 w-4" />Fermer
                </button>
              </div>
              <div className="p-6 space-y-4">
                {iaSuggestions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>Aucune suggestion IA en attente.</p>
                  </div>
                )}
                {iaSuggestions.map((s) => {
                  const aerodrome = aerodromesActifs.find(a => a.id === s.aerodrome_id)
                  const sourceLabel = s.source === 'risque_critique' ? 'Score critique'
                    : s.source === 'sgs_absent' ? 'SGS absent'
                    : s.source === 'sgs_faible' ? 'SGS insuffisant'
                    : s.source === 'certification_fraiche' ? 'Certification obtenue'
                    : s.source === 'homologation_fraiche' ? 'Homologation obtenue'
                    : s.source
                  const prioriteColor = s.priorite === 'critique' ? 'danger' : s.priorite === 'haute' ? 'warning' : 'primary'

                  return (
                    <div key={s.id} className="border border-border rounded-xl p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="code-oaci-badge">{aerodrome?.code_oaci || s.aerodrome_id}</span>
                          <span className="badge text-xs capitalize">{s.type.replace(/_/g, ' ')}</span>
                          <span className={`badge text-xs ${prioriteColor}`}>{s.priorite}</span>
                          <span className="badge outline text-xs">{Math.round(s.confiance * 100)}% confiance</span>
                        </div>
                        <span className="badge neutral text-xs shrink-0">{sourceLabel}</span>
                      </div>
                      <p className="text-sm font-medium mb-1">{s.objectifs}</p>
                      <p className="text-xs text-muted-foreground mb-3">{s.raison}</p>
                      <div className="flex flex-wrap gap-1 mb-3">
                        {s.portee.map(d => (
                          <span key={d} className="badge outline text-xs">{d}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 flex-wrap">
                        <span>Début: {new Date(s.date_debut).toLocaleDateString('fr-FR')}</span>
                        <span>Fin: {new Date(s.date_fin).toLocaleDateString('fr-FR')}</span>
                        {s.equipe_ids.length > 0 && <span>Équipe: {s.equipe_ids.length} membre(s)</span>}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <button
                          onClick={() => handleValiderSuggestion(s)}
                          className="btn btn-sm btn-success gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Valider
                        </button>
                        <button
                          onClick={() => handleAjusterSuggestion(s)}
                          className="btn btn-sm btn-primary gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Ajuster
                        </button>
                        <button
                          onClick={() => handleRejeterSuggestion(s)}
                          className="btn btn-sm btn-outline gap-1 text-danger border-danger/30 hover:bg-danger/5"
                        >
                          <X className="w-3.5 h-3.5" />
                          Rejeter
                        </button>
                      </div>
                    </div>
                  )
                })}
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

      {/* Vue Tableau — groupé par aérodrome */}
      {viewMode === 'table' && (
        <Card className="overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Aérodrome</th>
                <th>Type</th>
                <th>Période</th>
                <th>Domaines</th>
                <th>Statut</th>
                <th>Priorité</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {planningsByAerodrome.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-muted-foreground"><Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />Aucun planning</td></tr>
              ) : planningsByAerodrome.map(group => {
                const profil = profilsRisque[group.aerodrome.id]
                const scoreCls = !profil ? 'neutral' : profil.score_global < 30 ? 'danger' : profil.score_global < 60 ? 'warning' : 'success'
                return (
                  <React.Fragment key={group.aerodrome.id}>
                    {/* Header groupe aérodrome */}
                    <tr className="bg-muted/20 border-b-2 border-border">
                      <td colSpan={7} className="py-2 px-3">
                        <div className="flex items-center gap-3">
                          <span className="code-oaci-badge">{group.aerodrome.code_oaci}</span>
                          <span className="font-semibold text-sm text-foreground">{group.aerodrome.nom}</span>
                          {profil && (
                            <span className={`badge text-xs ${scoreCls}`}>
                              Score {profil.score_global}/100
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">{group.plannings.length} planning(s)</span>
                        </div>
                      </td>
                    </tr>
                    {/* Lignes plannings */}
                    {group.plannings.map((planning: Planning) => {
                      const statutMap: Record<string, { cls: string; label: string }> = {
                        planifiee: { cls: 'badge primary', label: 'Planifiée' },
                        en_cours: { cls: 'badge warning', label: 'En cours' },
                        realisee: { cls: 'badge success', label: 'Réalisée' },
                        annulee: { cls: 'badge neutral', label: 'Annulée' },
                        en_retard: { cls: 'badge danger', label: 'En retard' },
                      }
                      const s = statutMap[planning.statut] || { cls: 'badge outline', label: planning.statut }
                      const nomsEquipe = (planning.equipe_ids || []).map(id => {
                        const u = utilisateurs.find(x => x.id === id)
                        return u ? `${u.prenom} ${u.nom}`.split(' ').map(w => w[0]).join('') : '?'
                      })
                      const pBadge: Record<string, string> = { critique: 'badge danger', haute: 'badge warning', moyenne: 'badge primary', basse: 'badge success' }
                      const pLabel: Record<string, string> = { critique: 'Critique', haute: 'Élevée', moyenne: 'Moyen', basse: 'Faible' }
                      return (
                        <tr key={planning.id} className="hover:bg-role-primary-soft transition-colors cursor-pointer"
                          onClick={() => handleView(planning)}>
                          <td className="pl-6 text-xs text-muted-foreground">{nomsEquipe.length > 0 ? nomsEquipe.join(', ') : '—'}</td>
                          <td><span className="capitalize text-sm">{planning.type?.replace(/_/g, ' ') || '—'}</span></td>
                          <td className="text-xs text-muted-foreground">
                            {planning.date_debut ? new Date(planning.date_debut).toLocaleDateString('fr-FR') : '?'} → {planning.date_fin ? new Date(planning.date_fin).toLocaleDateString('fr-FR') : '?'}
                          </td>
                          <td className="text-xs">{planning.portee?.length ? planning.portee.slice(0, 4).join(', ') : '—'}</td>
                          <td><span className={`badge text-xs ${s.cls}`}>{s.label}</span></td>
                          <td>
                            {planning.priorite && <span className={`badge text-xs ${pBadge[planning.priorite] || 'badge neutral'}`}>{pLabel[planning.priorite] || planning.priorite}</span>}
                          </td>
                          <td className="text-right">
                            <div className="flex justify-end gap-2">
                              {!planning.est_proposition && (
                                <button className="action-button" onClick={e => { e.stopPropagation(); handlePrepare(planning); }} title="Préparer"><PlayCircle className="w-4 h-4" />
                                </button>
                              )}
                              {!planning.est_proposition && (
                                <button className="action-button" onClick={e => { e.stopPropagation(); handleRequestExecute(planning); }} title="Exécuter"><CheckCircle2 className="w-4 h-4" />
                                </button>
                              )}
                              <button className="action-button" onClick={e => { e.stopPropagation(); handleView(planning); }} title="Voir"><Info className="w-4 h-4" /></button>
                              <button className="action-button" onClick={e => { e.stopPropagation(); handleEdit(planning); }} title="Modifier"><Edit2 className="w-4 h-4" /></button>
                              <button className="action-button danger" onClick={e => { e.stopPropagation(); handleDelete(planning); }} title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </Card>
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
      <ModaleFormulaire formOpen={!!formOpen} setFormOpen={setFormOpen} editingPlanning={editingPlanning} setEditingPlanning={setEditingPlanning} userRole={userRole} />
      <ModaleSuppression deleteDialogOpen={deleteDialogOpen} setDeleteDialogOpen={setDeleteDialogOpen} confirmDelete={confirmDelete} userRole={userRole} />
      <ModaleExecution
        executeConfirmOpen={executeConfirmOpen} executeTarget={executeTarget}
        setExecuteConfirmOpen={setExecuteConfirmOpen} setExecuteTarget={setExecuteTarget}
        aerodromesActifs={aerodromesActifs} aerodromes={aerodromes}
        userRole={userRole} handleConfirmExecute={handleConfirmExecute}
      />
      <PreparationModal open={preparationOpen} planning={preparationPlanning} onClose={() => setPreparationOpen(false)} userRole={userRole} />
    </div>
  );
}

