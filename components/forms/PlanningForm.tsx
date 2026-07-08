// components/forms/PlanningForm.tsx
// VERSION COMPLÈTE - Intègre le profil de risque pour :
// - Suggestion automatique des domaines prioritaires
// - Suggestion de la priorité basée sur le score
// - Suggestion du type de mission
// - Pré-remplissage des objectifs avec justification
// - Utilisation des vrais inspecteurs avec compétences
// 0 style inline, 0 fetch direct

'use client';

import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Calendar,
  Users,
  AlertCircle,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Zap,
  Clock,
  UserCheck,
  Sparkles,
  Brain,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore, type Planning, type ProfilRisque } from '@/lib/store';
import { TYPES_SURVEILLANCE, DOMAINES_SURVEILLANCE, expandDomaines, SPECIALITES_INSPECTEUR } from '@/lib/domaines';
import { getRiskLevel, suggestMissionType, computeFinalFrequency } from '@/lib/risque';
import { useDecisionEngine } from '@/hooks/useDecisionEngine';
import { useFormProgress } from '@/hooks/useFormProgress';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat',
}
const labelClass = "filter-label text-role-primary text-xs font-semibold uppercase tracking-wide"

const planningSchema = z.object({
  aerodrome_id: z.string().min(1, "L'aérodrome est requis"),
  type: z.enum([
    'programmee', 'inopinee', 'speciale', 'suivi_ecarts',
    'mise_oeuvre_pac', 'certification', 'homologation',
    'audit_complet', 'urgence', 'periodique', 'inopine', 'maintien'
  ]),
  date_debut: z.string().min(1, "La date de début est requise"),
  date_fin: z.string().min(1, "La date de fin est requise"),
  portee: z.array(z.string()).min(1, "Au moins un domaine doit être sélectionné"),
  equipe_ids: z.array(z.string()).min(1, "Au moins un inspecteur doit être sélectionné"),
  chef_id: z.string().min(1, "Le chef d'équipe est requis"),
  objectifs: z.string().min(30, "Les objectifs doivent contenir au moins 30 caractères"),
  priorite: z.enum(['basse', 'moyenne', 'haute', 'critique']),
  declencheur: z.enum(['automatique', 'manuel', 'renouvellement', 'evenement', 'demande_dg']).optional(),
  observations: z.string().optional(),
}).refine(data => !data.date_debut || !data.date_fin || data.date_fin >= data.date_debut, {
  message: "La date de fin doit être postérieure à la date de début",
  path: ["date_fin"],
});

// Seul un inspecteur titulaire ou principal peut être chef d'équipe
const TYPES_CHEF_AUTORISES = ['inspecteur_titulaire', 'inspecteur_principal']
function peutEtreChef(insp: any): boolean {
  const type = insp?.type_inspecteur || (insp as any)?._insp?.type
  return TYPES_CHEF_AUTORISES.includes(type)
}
function equipeContientChefEligible(membres: any[]): boolean {
  return membres.some(m => peutEtreChef(m))
}

type PlanningFormData = z.infer<typeof planningSchema>;

interface PlanningFormProps {
  planning?: Planning | null;
  onClose: () => void;
  onSuccess: () => void;
  onProgressChange?: (n: number) => void;
}

// Mapping des domaines pour suggestion
const DOMAINE_MAPPING: Record<string, { critere: string; seuil: number; label: string }> = {
  'SGS': { critere: 'c1', seuil: 60, label: 'Maturité SGS' },
  'PAC': { critere: 'c2', seuil: 60, label: 'Efficacité PAC' },
  'PHY': { critere: 'c3', seuil: 60, label: 'Conformité PHY' },
  'OPS': { critere: 'c3', seuil: 60, label: 'Conformité OPS' },
  'SLI': { critere: 'c5', seuil: 60, label: 'Résilience SLI' },
  'Écarts': { critere: 'c4', seuil: 60, label: 'Charge critique' },
};

// Récupérer les domaines prioritaires basés sur le profil
function getDomainesPrioritaires(profil: ProfilRisque | null): string[] {
  if (!profil) return [];
  
  const domaines: string[] = [];
  
  if (profil.c1 < 60) domaines.push('SGS');
  if (profil.c2 < 60) domaines.push('PAC');
  if (profil.c3 < 60) {
    domaines.push('PHY');
    domaines.push('OPS');
  }
  if (profil.c4 < 60) domaines.push('Écarts');
  if (profil.c5 < 60) domaines.push('SLI');
  
  return [...new Set(domaines)];
}

// Suggérer les dates basées sur le profil
function getDateSuggerer(profil: ProfilRisque | null, aerodrome?: { type_entite?: string; type?: string }): { date_debut: string; date_fin: string } {
  const now = new Date()
  const delaiJours = profil ? (profil.score_global < 30 ? 7 : profil.score_global < 60 ? 30 : 90) : 30
  const dureeJours = aerodrome?.type_entite === 'helistation' ? 1 : aerodrome?.type === 'international' ? 5 : 3
  const debut = new Date(now.getTime() + delaiJours * 24 * 60 * 60 * 1000)
  const fin = new Date(debut.getTime() + dureeJours * 24 * 60 * 60 * 1000)
  return {
    date_debut: debut.toISOString().slice(0, 16),
    date_fin: fin.toISOString().slice(0, 16),
  }
}

// Suggérer la priorité basée sur le profil
function getPrioriteSuggerer(profil: ProfilRisque | null): 'basse' | 'moyenne' | 'haute' | 'critique' {
  if (!profil) return 'moyenne';
  if (profil.score_global < 30) return 'critique';
  if (profil.score_global < 50) return 'haute';
  if (profil.score_global < 70) return 'moyenne';
  return 'basse';
}

// Suggérer le type de mission
function getTypeSuggerer(profil: ProfilRisque | null): PlanningFormData['type'] {
  if (!profil) return 'programmee';
  if (profil.score_global < 30) return 'audit_complet';
  if (profil.c4 < 40) return 'suivi_ecarts';
  if (profil.c2 < 50) return 'mise_oeuvre_pac';
  return 'programmee';
}

// Générer les objectifs suggérés
function genererObjectifsSuggeres(profil: ProfilRisque | null, domaines: string[], decisionJustification?: string): string {
  if (!profil) return '';
  
  const parties: string[] = [];
  
  // Contexte
  parties.push(`Dans le cadre du suivi du profil de risque (score ${profil.score_global}/100, tendance ${profil.tendance}),`);
  
  // Éléments déclencheurs du decision engine
  if (decisionJustification) {
    parties.push(`analyse préalable: ${decisionJustification}.`);
  }
  
  // Objectifs généraux
  if (profil.score_global < 30) {
    parties.push(`cette surveillance a pour objectif de vérifier les mesures d'urgence suite au passage en zone critique.`);
  } else if (profil.tendance === 'baisse') {
    parties.push(`cette surveillance vise à analyser les causes de la dégradation et vérifier l'efficacité des actions correctives.`);
  } else {
    parties.push(`cette surveillance programmée vise à maintenir le niveau de conformité et identifier les axes d'amélioration.`);
  }
  
  // Objectifs spécifiques par domaine
  if (domaines.includes('SGS')) {
    parties.push(`Vérifier la mise en oeuvre du Système de Gestion de la Sécurité (SGS) et son efficacité.`);
  }
  if (domaines.includes('PAC')) {
    parties.push(`Évaluer les délais de traitement des Plans d'Actions Correctives et identifier les retards.`);
  }
  if (domaines.includes('PHY')) {
    parties.push(`Contrôler l'état des infrastructures physiques (pistes, balisage, aires de trafic).`);
  }
  if (domaines.includes('OPS')) {
    parties.push(`Vérifier le respect des procédures opérationnelles et la conformité réglementaire.`);
  }
  if (domaines.includes('SLI')) {
    parties.push(`Évaluer les capacités d'intervention du Service de Lutte contre l'Incendie.`);
  }
  if (domaines.includes('Écarts')) {
    parties.push(`Suivre l'avancement des écarts critiques et vérifier la clôture des actions.`);
  }

  return parties.join(' ');
}

// Obtenir le badge de risque
function getRiskBadgeClass(score: number): string {
  if (score >= 80) return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-success';
  if (score >= 60) return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-primary';
  if (score >= 30) return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-warning';
  return 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white bg-danger animate-pulse';
}

function getRiskLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Bon';
  if (score >= 30) return 'Modéré';
  return 'Critique';
}

export default memo(function PlanningForm({ planning, onClose, onSuccess, onProgressChange }: PlanningFormProps) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const addPlanning = useAppStore(s => s.addPlanning)
  const updatePlanning = useAppStore(s => s.updatePlanning)
  const setLoading = useAppStore(s => s.setLoading)
  const getProfilRisque = useAppStore(s => s.getProfilRisque)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user);
  const plannings = useAppStore(s => s.plannings);
  const [error, setError] = useState<string | null>(null);
  const [suggestedDomains, setSuggestedDomains] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);

  // Inspecteurs réels depuis le store
  const inspecteursReels = useMemo(() => {
    return utilisateurs
      .filter(u => u.role === 'inspector' && u.statut !== 'inactif' && u.statut !== 'suspendu')
      .map(u => {
        const linkedInsp = u.inspecteur_id
          ? inspecteurs.find(i => i.id === u.inspecteur_id)
          : inspecteurs.find(i => i.email === u.email || (i.prenom === u.prenom && i.nom === u.nom))
        return { ...u, _insp: linkedInsp }
      })
  }, [utilisateurs, inspecteurs]);

  // Suggérer l'équipe basée sur le profil de risque
  const getEquipeSuggerer = (profil: ProfilRisque | null, domaines: string[]) => {
    if (!profil || !domaines.length) return [];
    
    // Filtrer les inspecteurs disponibles avec les bonnes compétences
    const candidats = inspecteursReels
      .filter(insp => {
        // Vérifier si l'inspecteur a au moins une compétence dans les domaines prioritaires
        if (!insp.competences || insp.competences.length === 0) return false;
        
        // Expandre les domaines (si AGA/XXX, obtenir les domaines individuels)
        const domainesExpandus = expandDomaines(domaines);
        
        return insp.competences.some((c: { domaine: string; niveau: string }) => {
          const domaineInsp = c.domaine;
          // Si c'est un code AGA/XXX, vérifier si ça correspond aux domaines expandus
          if (domaineInsp.startsWith('AGA/')) {
            const sousDomaine = ['AGA/EXPLOIT', 'AGA/GENIE_CIV', 'AGA/GENIE_ELEC', 'AGA/SLI_RA'].find(d => d === domaineInsp);
            if (sousDomaine) {
              const mapping: Record<string, string[]> = {
                'AGA/EXPLOIT': ['SGS', 'COP', 'OPS'],
                'AGA/GENIE_CIV': ['PHY', 'OLS'],
                'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
                'AGA/SLI_RA': ['SLI', 'RA'],
              };
              const domainesInspExpandus = mapping[domaineInsp] || [];
              return domainesInspExpandus.some((d: string) => domainesExpandus.includes(d));
            }
          }
          return domainesExpandus.includes(domaineInsp);
        });
      })
      .map(insp => {
        // Calculer le score de correspondance
        const domainesExpandus = expandDomaines(domaines);
        const matchCount = (insp.competences || []).filter((c: { domaine: string; niveau: string }) => {
          const domaineInsp = c.domaine;
          if (domaineInsp.startsWith('AGA/')) {
            const mapping: Record<string, string[]> = {
              'AGA/EXPLOIT': ['SGS', 'COP', 'OPS'],
              'AGA/GENIE_CIV': ['PHY', 'OLS'],
              'AGA/GENIE_ELEC': ['ELEC', 'MFP'],
              'AGA/SLI_RA': ['SLI', 'RA'],
            };
            const domainesInspExpandus = mapping[domaineInsp] || [];
            return domainesExpandus.some((d: string) => domainesInspExpandus.includes(d));
          }
          return domainesExpandus.includes(domaineInsp);
        }).length;
        
        // Privilégier les experts
        const hasExpert = (insp.competences || []).some((c: { domaine: string; niveau: string }) => c.niveau === 'expert');
        
        return {
          id: insp.id,
          nom: insp.nom,
          prenom: insp.prenom,
          competences: (insp.competences || []).map((c: { domaine: string; niveau: string }) => c.domaine),
          matchScore: matchCount + (hasExpert ? 10 : 0),
          isExpert: hasExpert
        };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);
    
    return candidats;
  };

  const { register, handleSubmit, watch, setValue, setFocus, formState: { errors } } = useForm<PlanningFormData>({
    resolver: zodResolver(planningSchema),
    defaultValues: planning ? {
      aerodrome_id: planning.aerodrome_id,
      type: planning.type,
      date_debut: planning.date_debut.slice(0, 16),
      date_fin: planning.date_fin.slice(0, 16),
      portee: planning.portee,
      equipe_ids: planning.equipe_ids,
      chef_id: planning.chef_id,
      objectifs: planning.objectifs,
      priorite: planning.priorite,
      declencheur: planning.declencheur,
      observations: planning.observations || '',
    } : {
      aerodrome_id: '',
      type: 'programmee',
      date_debut: '',
      date_fin: '',
      portee: [],
      equipe_ids: [],
      chef_id: '',
      objectifs: '',
      priorite: 'moyenne',
      declencheur: 'manuel',
      observations: '',
    },
  });

  // Calculer le profil de risque pour l'aérodrome sélectionné
  const watchAerodrome = watch('aerodrome_id');
  const profilAerodrome = watchAerodrome ? getProfilRisque(watchAerodrome) : null;
  const aerodrome = watchAerodrome ? aerodromes.find(a => a.id === watchAerodrome) : null;

  const watchEquipe = watch('equipe_ids') || [];
  const watchPortee = watch('portee') || [];
  const watchChef = watch('chef_id');
  const watchType = watch('type');

  const decisionResult = useDecisionEngine(watchAerodrome);

  // Mettre à jour les suggestions quand l'aérodrome change
  const handleAerodromeChange = (aerodromeId: string) => {
    setSuggestionsApplied(false);
    const foundAero = aerodromes.find(a => a.id === aerodromeId);
    const profil = getProfilRisque(aerodromeId);

    if (profil) {
      const domaines = getDomainesPrioritaires(profil);
      setSuggestedDomains(domaines);

      // Suggérer les dates (utiliser foundAero pour éviter la closure obsolète)
      const dates = getDateSuggerer(profil, foundAero ?? undefined);
      setValue('date_debut', dates.date_debut, { shouldDirty: false, shouldTouch: false });
      setValue('date_fin', dates.date_fin, { shouldDirty: false, shouldTouch: false });

      // Suggérer la priorité
      setValue('priorite', getPrioriteSuggerer(profil), { shouldDirty: false, shouldTouch: false });

      // Suggérer le type de surveillance
      setValue('type', getTypeSuggerer(profil), { shouldDirty: false, shouldTouch: false });

      // Suggérer l'équipe basée sur le profil
      const equipeSuggerer = getEquipeSuggerer(profil, domaines);
      if (equipeSuggerer.length > 0) {
        const ids = equipeSuggerer.map(i => i.id);
        setValue('equipe_ids', ids, { shouldDirty: false, shouldTouch: false });
        // Premier membre éligible comme chef (titulaire/principal)
        const chef = equipeSuggerer.find(peutEtreChef) || equipeSuggerer[0]
        setValue('chef_id', chef?.id || equipeSuggerer[0].id, { shouldDirty: false, shouldTouch: false });
      }

      // Suggérer les domaines si non sélectionnés
      if (domaines.length > 0 && watchPortee.length === 0) {
        setValue('portee', domaines.slice(0, 3), { shouldDirty: false, shouldTouch: false });
      }

      // Suggérer les objectifs
      if (!watch('objectifs')) {
        setValue('objectifs', genererObjectifsSuggeres(profil, domaines, decisionResult?.portee.justification), { shouldDirty: false, shouldTouch: false });
      }
    } else if (foundAero) {
      // Pas de profil encore — suggérer le type selon les caractéristiques de l'aérodrome
      const typeParDefaut: PlanningFormData['type'] =
        foundAero.type === 'international' ? 'audit_complet' :
        foundAero.type_entite === 'helistation' ? 'periodique' :
        'programmee';
      setValue('type', typeParDefaut, { shouldDirty: false, shouldTouch: false });

      // Suggérer les dates selon le type d'entité
      const dates = getDateSuggerer(null, foundAero);
      setValue('date_debut', dates.date_debut, { shouldDirty: false, shouldTouch: false });
      setValue('date_fin', dates.date_fin, { shouldDirty: false, shouldTouch: false });
    }
  };

  const onSubmit = async (data: PlanningFormData) => {
    try {
      setLoading('planningForm', true);
      setError(null);
      const now = new Date().toISOString();

      // Vérifier que le chef est titulaire/principal
      const chefUser = inspecteursReels.find(i => i.id === data.chef_id)
      if (!chefUser || !peutEtreChef(chefUser)) {
        setError('Le chef d\'équipe doit être un inspecteur titulaire ou principal.')
        setLoading('planningForm', false)
        return
      }
      // Vérifier que l'équipe contient au moins un titulaire/principal
      const equipe = inspecteursReels.filter(i => data.equipe_ids.includes(i.id))
      if (!equipeContientChefEligible(equipe)) {
        setError('L\'équipe doit contenir au moins un inspecteur titulaire ou principal.')
        setLoading('planningForm', false)
        return
      }

      // Notification de succès (inspecteur ANACIM)
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: planning ? 'Planning modifié' : 'Planning créé',
        message: `Le planning pour ${aerodromes.find(a => a.id === data.aerodrome_id)?.code_oaci} a été ${planning ? 'modifié' : 'créé'} avec succès`,
        canal: 'in_app'
      });

      if (planning && plannings.some(p => p.id === planning.id)) {
        updatePlanning(planning.id, { ...data, updated_at: now });
      } else {
        addPlanning({
          id: crypto.randomUUID(),
          ...data,
          statut: 'planifiee' as const,
          est_proposition: false,
          annee_cible: new Date(data.date_debut).getFullYear(),
          created_at: now,
          updated_at: now,
        });
      }

      // ── Notifier les exploitants de l'aérodrome ───────────────
      const aeroTarget = aerodromes.find(a => a.id === data.aerodrome_id);
      const typeLabel = (data.type as string)?.replace(/_/g, ' ') ?? 'surveillance';
      const dateDebut = data.date_debut
        ? new Date(data.date_debut).toLocaleDateString('fr-FR')
        : '—';
      const dateFin = data.date_fin
        ? new Date(data.date_fin).toLocaleDateString('fr-FR')
        : '—';
      utilisateurs
        .filter(u =>
          u.aerodrome_id === data.aerodrome_id &&
          ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
        )
        .forEach(u =>
          addNotification({
            user_id: u.id,
            type: 'info',
            title: planning ? '🗓 Surveillance reprogrammée' : '🗓 Surveillance planifiée',
            message: `Une surveillance ${typeLabel} est prévue pour ${aeroTarget?.code_oaci ?? ''} du ${dateDebut} au ${dateFin}. Préparez vos documents.`,
            canal: 'in_app',
          })
        );
      // ─────────────────────────────────────────────────────────

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setLoading('planningForm', false);
    }
  };

  const handleAppliquerSuggestions = () => {
    if (profilAerodrome) {
      const domaines = getDomainesPrioritaires(profilAerodrome);

      // Suggérer les dates
      const dates = getDateSuggerer(profilAerodrome, aerodrome ?? undefined);
      setValue('date_debut', dates.date_debut, { shouldDirty: false, shouldTouch: false });
      setValue('date_fin', dates.date_fin, { shouldDirty: false, shouldTouch: false });

      setValue('portee', domaines.slice(0, 3), { shouldDirty: false, shouldTouch: false });
      setValue('priorite', getPrioriteSuggerer(profilAerodrome), { shouldDirty: false, shouldTouch: false });
      setValue('type', getTypeSuggerer(profilAerodrome), { shouldDirty: false, shouldTouch: false });
      setValue('objectifs', genererObjectifsSuggeres(profilAerodrome, domaines, decisionResult?.portee.justification), { shouldDirty: false, shouldTouch: false });
      
      // Suggérer l'équipe
      const equipeSuggerer = getEquipeSuggerer(profilAerodrome, domaines);
      if (equipeSuggerer.length > 0) {
        const ids = equipeSuggerer.map(i => i.id);
        setValue('equipe_ids', ids, { shouldDirty: false, shouldTouch: false });
        const chef = equipeSuggerer.find(peutEtreChef) || equipeSuggerer[0]
        setValue('chef_id', chef?.id || equipeSuggerer[0].id, { shouldDirty: false, shouldTouch: false });
      }
      
      setSuggestionsApplied(true);
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Suggestions appliquées',
        message: 'Les dates, domaines prioritaires, la priorité, l\'équipe, le type et les objectifs ont été mis à jour selon le profil de risque',
        canal: 'in_app'
      });
    }
  };

   // Memoize risk calculations based on profilAerodrome.score_global
   const riskLevel = useMemo(() => {
     return profilAerodrome?.score_global ? getRiskLabel(profilAerodrome.score_global) : null
   }, [profilAerodrome?.score_global])

   const riskClass = useMemo(() => {
     return profilAerodrome?.score_global ? getRiskBadgeClass(profilAerodrome.score_global) : ''
   }, [profilAerodrome?.score_global])

   // Optimize progress calculation - only recompute when watched values actually change
   const allValues = useMemo(() => {
     return watch(['aerodrome_id', 'type', 'date_debut', 'date_fin', 'portee', 'equipe_ids', 'chef_id', 'objectifs', 'priorite']) as unknown as Record<string, unknown>
   }, [watch]) // Note: watch is a stable reference from useForm

   const progress = useMemo(() => {
     return useFormProgress(allValues as Record<string, unknown>, [
       'aerodrome_id', 'type', 'date_debut', 'date_fin', 'portee', 'equipe_ids', 'chef_id', 'objectifs', 'priorite',
     ])
   }, [allValues])

   // ─── État du bouton Suggestion IA ──────────────────────────────────────────
   // 'loading'  → aérodrome choisi mais profil absent
   // 'critique' → score < 30 : pulse danger rapide
   // 'eleve'    → score 30-49 ou tendance baisse : pulse warning
   // 'actif'    → profil dispo, pas encore appliqué : ring-ping bleu
   // 'applique' → clic effectué : vert stable
    type IaBtnState = 'loading' | 'critique' | 'eleve' | 'actif' | 'applique'
    const iaBtnState = useMemo<IaBtnState>(() => {
      if (!profilAerodrome) return 'loading'
      if (suggestionsApplied) return 'applique'
      // Détection critique via decisionEngine (certificat retrait, écarts critiques)
      if (decisionResult) {
        if (decisionResult.certificat.action === 'retirer') return 'critique'
        if (decisionResult.certificat.action === 'suspendre') return 'eleve'
        if (decisionResult.declencheurs.some(d => d.urgence === 'elevee')) return 'eleve'
      }
      if (profilAerodrome.score_global < 30) return 'critique'
      if (profilAerodrome.score_global < 50 || profilAerodrome.tendance === 'baisse') return 'eleve'
      return 'actif'
    }, [profilAerodrome, suggestionsApplied, decisionResult])

   const onProgressRef = useRef(onProgressChange)
   onProgressRef.current = onProgressChange
   // Only run when progress actually changes
   useEffect(() => { onProgressRef.current?.(progress) }, [progress])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="form-container animate-fade-up">
      {error && (
        <div className="alert alert-error flex items-center gap-2 mb-6">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Bouton Suggestion IA & Profil - Apparaît quand aérodrome sélectionné */}
       {watchAerodrome && aerodrome && (
        <div className="alert alert-info mb-6 animate-fade-up">
          <Brain className="alert-icon" />
          <div className="alert-content flex-1">
             <div className="alert-title">Profil de risque: {aerodrome.nom} ({aerodrome.code_oaci})</div>
             <div className="alert-description flex items-center gap-4 flex-wrap">
               {profilAerodrome ? (
                 <>
                   <span className={riskClass}>
                     {riskLevel} ({profilAerodrome.score_global}/100)
                   </span>
                   {profilAerodrome.tendance === 'baisse' && (
                     <span className="text-warning text-xs">⚠️ Tendance à la baisse</span>
                   )}
                   {suggestedDomains.length > 0 && (
                     <span className="text-xs">Domaines: {suggestedDomains.join(', ')}</span>
                   )}
                 </>
               ) : (
                 <span className="text-xs text-muted-foreground">Profil en cours de chargement...</span>
               )}
             </div>
          </div>
          {/* ── Bouton Suggestion IA animé selon l'état du profil ── */}
          {iaBtnState === 'critique' && (
            <div className="relative inline-flex shrink-0">
              <span className="absolute inset-0 rounded-md animate-ping bg-danger/40 pointer-events-none" />
              <button
                type="button"
                onClick={handleAppliquerSuggestions}
                className="btn btn-danger gap-2 animate-pulse relative"
                title="Risque critique — appliquer les corrections d'urgence"
              >
                <AlertCircle className="w-4 h-4" />
                Urgence IA
              </button>
            </div>
          )}

          {iaBtnState === 'eleve' && (
            <div className="relative inline-flex shrink-0">
              <span className="absolute inset-0 rounded-md animate-ping bg-warning/30 pointer-events-none" />
              <button
                type="button"
                onClick={handleAppliquerSuggestions}
                className="btn btn-warning gap-2 animate-pulse relative"
                title="Risque élevé ou tendance baissière — appliquer les suggestions"
              >
                <Zap className="w-4 h-4" />
                Suggestion IA
              </button>
            </div>
          )}

          {iaBtnState === 'actif' && (
            <div className="relative inline-flex shrink-0">
              <span className="absolute inset-0 rounded-md animate-ping bg-role-primary/25 pointer-events-none" />
              <button
                type="button"
                onClick={handleAppliquerSuggestions}
                className="btn btn-primary gap-2 animate-pulse relative"
                title="Appliquer toutes les suggestions IA basées sur le profil"
              >
                <Sparkles className="w-4 h-4" />
                Suggestion IA &amp; Profil
              </button>
            </div>
          )}

          {iaBtnState === 'loading' && (
            <button
              type="button"
              disabled
              className="btn btn-primary gap-2 opacity-50 cursor-not-allowed"
              title="Chargement du profil de risque..."
            >
              <Brain className="w-4 h-4 animate-pulse" />
              Suggestion IA
            </button>
          )}

          {iaBtnState === 'applique' && (
            <button
              type="button"
              onClick={() => setSuggestionsApplied(false)}
              className="btn btn-success gap-2"
              title="Suggestions appliquées — cliquer pour réappliquer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Appliqué ✓
            </button>
          )}
        </div>
      )}

      <div className="space-y-6">
        {/* Aérodrome avec affichage du risque */}
        <div className="form-field">
          <label className={`${labelClass} flex items-center gap-2`}>
            <Shield className="w-4 h-4" />
            Aérodrome *
          </label>
          <select
            {...register('aerodrome_id')}
            onChange={(e) => {
              register('aerodrome_id').onChange(e);
              handleAerodromeChange(e.target.value);
            }}
            className={`form-select ${focusClass}${errors.aerodrome_id ? ' border-danger' : ''}`}
            style={selectStyle}
          >
            <option value="">Sélectionner un aérodrome</option>
            {aerodromes.filter(a => !a.deleted_at).map(a => {
              const profil = getProfilRisque(a.id);
              const score = profil?.score_global || 0;
              const niveau = getRiskLabel(score);
              return (
                <option key={a.id} value={a.id}>
                  {a.code_oaci} — {a.nom} [{niveau} {score}/100]
                </option>
              );
            })}
          </select>
          
          {profilAerodrome && (
            <div className="mt-3 p-3 bg-role-primary-soft rounded-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Niveau de risque :</span>
                  <span className={riskClass}>{riskLevel} ({profilAerodrome.score_global}/100)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Tendance :</span>
                  {profilAerodrome.tendance === 'hausse' && (
                    <span className="flex items-center gap-1 text-success"><TrendingUp className="w-4 h-4" /> Hausse</span>
                  )}
                  {profilAerodrome.tendance === 'baisse' && (
                    <span className="flex items-center gap-1 text-danger"><TrendingDown className="w-4 h-4 animate-pulse" /> Baisse</span>
                  )}
                  {profilAerodrome.tendance === 'stable' && (
                    <span className="flex items-center gap-1 text-muted-foreground">Stable</span>
                  )}
                </div>
              </div>
              {profilAerodrome.c4 < 40 && (
                <div className="mt-2 text-xs text-warning flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Charge critique élevée (C4={profilAerodrome.c4}/100) - priorité haute recommandée
                </div>
              )}
            </div>
          )}
          {errors.aerodrome_id && <p className="field-error">{errors.aerodrome_id.message}</p>}
        </div>

        {/* Type et dates */}
        <div className="form-grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="form-field">
            <label className={`${labelClass} flex items-center gap-2`}>
              <Target className="w-4 h-4" />
              Type de surveillance *
            </label>
            <select
              {...register('type')}
              className={`form-select ${focusClass}${errors.type ? ' border-danger' : ''}`}
              style={selectStyle}
            >
              {TYPES_SURVEILLANCE.map((type) => (
                <option key={type.code} value={type.code}>
                  {type.label}
                </option>
              ))}
            </select>
            {watchType === 'audit_complet' && (
              <p className="text-xs text-info mt-1">🔍 Audit complet recommandé pour les situations critiques</p>
            )}
            {watchType === 'suivi_ecarts' && (
              <p className="text-xs text-info mt-1">📋 Suivi des écarts - priorité aux non-conformités ouvertes</p>
            )}
            {errors.type && <p className="field-error">{errors.type.message}</p>}
          </div>

          <div className="form-field">
            <label className={labelClass}>
              <Calendar className="w-4 h-4" />Date début *
            </label>
            <input
              type="datetime-local"
              {...register('date_debut')}
              className={`form-input ${focusClass}${errors.date_debut ? ' border-danger' : ''}`}
            />
            {errors.date_debut && <p className="field-error">{errors.date_debut.message}</p>}
          </div>

          <div className="form-field">
            <label className={labelClass}>
              <Calendar className="w-4 h-4" />Date fin *
            </label>
            <input
              type="datetime-local"
              {...register('date_fin')}
              className={`form-input ${focusClass}${errors.date_fin ? ' border-danger' : ''}`}
            />
            {errors.date_fin && <p className="field-error">{errors.date_fin.message}</p>}
          </div>
        </div>

        {/* Domaines concernés - avec mise en évidence des suggestions */}
        <div className="form-field">
          <label className={`${labelClass} flex items-center gap-2`}>
            <Target className="w-4 h-4" />
            Domaines concernés *
          </label>
          <select
            multiple
            size={6}
            value={watchPortee}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, option => option.value);
              setValue('portee', selected);
            }}
            className={`form-select ${focusClass}${errors.portee ? ' border-danger' : ''}`}
            style={selectStyle}
          >
             {DOMAINES_SURVEILLANCE.map(d => {
              const isSuggested = suggestedDomains.includes(d.code);
              return (
                <option 
                  key={d.code} 
                  value={d.code}
                  style={isSuggested ? { backgroundColor: '#dbeafe', fontWeight: 'bold' } : {}}
                >
                  {d.label} {isSuggested && '⭐ (prioritaire)'}
                </option>
              );
            })}
          </select>
          {suggestedDomains.length > 0 && (
            <p className="field-description text-info">
              ⭐ Domaines prioritaires suggérés: {suggestedDomains.join(', ')} (basés sur le profil de risque)
            </p>
          )}
          <p className="field-description">Maintenez Ctrl (ou Cmd sur Mac) pour sélectionner plusieurs domaines</p>
          {errors.portee && <p className="field-error">{errors.portee.message}</p>}
        </div>

        {/* Équipe d'inspecteurs */}
        <div className="form-field">
          <label className={labelClass}>
            <Users className="w-4 h-4" />Équipe d'inspecteurs *
          </label>
          <select
            multiple
            size={5}
            value={watchEquipe}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, option => option.value);
              setValue('equipe_ids', selected);
              if (watchChef && !selected.includes(watchChef)) {
                setValue('chef_id', '');
              }
            }}
            className={`form-select ${focusClass}${errors.equipe_ids ? ' border-danger' : ''}`}
            style={selectStyle}
          >
            {inspecteursReels.map(insp => {
              const linkedInsp = (insp as any)._insp
              // Afficher les spécialités métier depuis source de vérité unique
              const specialitesLabels = (insp.specialites || [])
                .map((s: string) => SPECIALITES_INSPECTEUR.find(sp => sp.code === s)?.label || s)
                .join(', ');
              const fallbackLabel = linkedInsp
                ? `${linkedInsp.type?.replace(/_/g, ' ')} · ${linkedInsp.domaine_principal?.toUpperCase()}`
                : undefined;
              const specialites = specialitesLabels
                || (insp.competences && insp.competences.length > 0
                  ? insp.competences
                      .slice(0, 3)
                      .map((c: { domaine: string; niveau: string }) =>
                        `${c.domaine}${c.niveau === 'expert' ? ' ★' : c.niveau === 'confirme' ? ' ✓' : ''}`
                      )
                      .join(' · ')
                  : fallbackLabel || insp.service || 'Non spécialisé');
              return (
                <option key={insp.id} value={insp.id}>
                  {insp.prenom} {insp.nom} — {specialites}
                </option>
              );
            })}
          </select>
          <p className="field-description">Maintenez Ctrl (ou Cmd sur Mac) pour sélectionner plusieurs inspecteurs</p>
          {errors.equipe_ids && <p className="field-error">{errors.equipe_ids.message}</p>}
        </div>

        {/* Chef d'équipe avec suggestion automatique */}
        {watchEquipe.length > 0 && (
          <div className="form-field">
            <label className={labelClass}>
              <UserCheck className="w-4 h-4" />Chef d'équipe *
            </label>
            <select
              {...register('chef_id')}
              className={`form-select ${focusClass}${errors.chef_id ? ' border-danger' : ''}`}
              style={selectStyle}
            >
              <option value="">Sélectionner le chef d'équipe</option>
              {watchEquipe
                .filter(id => peutEtreChef(inspecteursReels.find(i => i.id === id)))
                .map(id => {
                const insp = inspecteursReels.find(i => i.id === id);
                return insp ? (
                  <option key={id} value={id}>
                    {insp.prenom} {insp.nom} {((insp as any)._insp?.competences || insp.competences)?.some((c: { domaine: string; niveau: string }) => c.niveau === 'expert') ? '⭐ Expert' : ''}
                  </option>
                ) : null;
              })}
              {!equipeContientChefEligible(watchEquipe.map(id => inspecteursReels.find(i => i.id === id)).filter(Boolean)) && (
                <option value="" disabled>Aucun inspecteur éligible (titulaire/principal requis)</option>
              )}
            </select>
            {watchChef && (
              <p className="field-description text-success">✓ Chef d'équipe sélectionné</p>
            )}
            {errors.chef_id && <p className="field-error">{errors.chef_id.message}</p>}
          </div>
        )}

        {/* Objectifs avec suggestion */}
        <div className="form-field">
          <label className={`${labelClass} flex items-center gap-2`}>
            <Target className="w-4 h-4" />
            Objectifs *
          </label>
          <textarea
            {...register('objectifs')}
            placeholder="Décrivez les objectifs de cette surveillance..."
            rows={4}
            className={`form-textarea ${focusClass}${errors.objectifs ? ' border-danger' : ''}`}
          />
          {profilAerodrome && (
            <div className="mt-2 p-2 bg-info-soft rounded-lg text-xs">
              <p className="font-semibold text-info">💡 Suggestion basée sur le profil de risque :</p>
              <p className="text-muted-foreground">{genererObjectifsSuggeres(profilAerodrome, suggestedDomains, decisionResult?.portee.justification)}</p>
              <button 
                type="button" 
                onClick={() => setValue('objectifs', genererObjectifsSuggeres(profilAerodrome, suggestedDomains, decisionResult?.portee.justification))}
                className="btn btn-ghost btn-sm text-xs mt-1"
              >
                Utiliser cette suggestion
              </button>
            </div>
          )}
          <p className="field-description">Minimum 30 caractères. Soyez précis sur les points à vérifier.</p>
          {errors.objectifs && <p className="field-error">{errors.objectifs.message}</p>}
        </div>

        {/* Priorité et déclencheur */}
        <div className="form-grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-field">
            <label className={labelClass}>Priorité *</label>
            <select
              {...register('priorite')}
              className={`form-select ${focusClass}${errors.priorite ? ' border-danger' : ''}`}
              style={selectStyle}
            >
              <option value="basse">Basse</option>
              <option value="moyenne">Moyenne</option>
              <option value="haute">Haute</option>
              <option value="critique">Critique</option>
            </select>
            {profilAerodrome && getPrioriteSuggerer(profilAerodrome) !== watch('priorite') && (
              <p className="text-xs text-warning mt-1">
                ⚠️ La priorité suggérée est <strong>{getPrioriteSuggerer(profilAerodrome)}</strong> basée sur le score {profilAerodrome.score_global}/100
              </p>
            )}
            {errors.priorite && <p className="field-error">{errors.priorite.message}</p>}
          </div>

          <div className="form-field">
            <label className={labelClass}>Déclencheur</label>
            <select
              {...register('declencheur')}
              className={`form-select ${focusClass}`}
              style={selectStyle}
            >
              <option value="automatique">Automatique</option>
              <option value="manuel">Manuel</option>
              <option value="renouvellement">Renouvellement certification</option>
              <option value="evenement">Suite événement</option>
              <option value="demande_dg">Demande DG</option>
            </select>
          </div>
        </div>

        {/* Observations */}
        <div className="form-field">
          <label className={labelClass}>
            <Clock className="w-4 h-4" />Observations
          </label>
          <textarea
            {...register('observations')}
            placeholder="Observations complémentaires, contraintes particulières..."
            rows={3}
            className={`form-textarea ${focusClass}`}
          />
        </div>
      </div>

      <hr className="border-border my-6" />

      {/* Actions avec indicateur de suggestion */}
      <div className="form-actions flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary gap-2">
          <X className="h-4 w-4" />
          Annuler
        </button>
        <button type="submit" className="btn btn-primary gap-2">
          <Save className="h-4 w-4" />
          {planning ? 'Mettre à jour' : 'Créer'} le planning
        </button>
      </div>

      {/* Récapitulatif des décisions automatiques */}
      {profilAerodrome && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg text-[10px] text-muted-foreground border border-gray-100">
          <p className="font-semibold mb-1">📊 Décisions automatiques basées sur le profil de risque :</p>
          <ul className="space-y-0.5">
            <li>• Score {profilAerodrome.score_global}/100 → {getRiskLabel(profilAerodrome.score_global)}</li>
            <li>• Tendance {profilAerodrome.tendance} → {profilAerodrome.tendance === 'baisse' ? 'Surveillance renforcée recommandée' : 'Maintien du rythme'}</li>
            {suggestedDomains.length > 0 && <li>• Domaines prioritaires : {suggestedDomains.join(', ')}</li>}
            <li>• Type suggéré : {getTypeSuggerer(profilAerodrome).replace('_', ' ')}</li>
          </ul>
          {decisionResult && decisionResult.declencheurs.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-200">
              <p className="font-semibold mb-1">🔍 Analyse décision engine :</p>
              <ul className="space-y-0.5">
                {decisionResult.declencheurs.map((d, i) => (
                  <li key={i}>• <span className={d.urgence === 'elevee' ? 'text-danger' : 'text-warning'}>{d.type}</span> — {d.description}</li>
                ))}
                {decisionResult.recommandations.length > 0 && (
                  <li className="mt-1">💡 Recommandations : {decisionResult.recommandations.slice(0, 3).map(r => r.action).join(', ')}</li>
                )}
              </ul>
              <p className="mt-1 text-[9px] text-muted-foreground italic">
                Certificat : {decisionResult.certificat.action} — {decisionResult.certificat.justification}
              </p>
            </div>
          )}
        </div>
      )}
    </form>
  );
})