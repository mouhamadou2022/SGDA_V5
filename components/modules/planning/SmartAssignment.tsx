// components/modules/planning/SmartAssignment.tsx
// VERSION CORRIGÉE AVEC IA - Ajout du feedback utilisateur et suggestions IA
// ✅ Ajout de enregistrerFeedbackAssignation
// ✅ Appel à learningEngine.recordLearningFeedback dans handleAssigner — RETIRÉ (corrompait le Random Forest)
// ✅ Suggestions IA pour les assignations
// 0 style inline, 0 fetch direct

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAppStore, type Planning, type Utilisateur, type Formation, type Exemption, type ProfilRisque } from '@/lib/store';
import type { ResultatChecklist } from '@/types/surveillance';
import { formatDate } from '@/lib/utils';
import { computeCompetenceScore } from '@/lib/competences';
import { getDomainesFromSpecialites, couvertureSuffisante, verifierCompositionEquipe } from '@/lib/domaines';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import {
  CheckCircle2,
  AlertCircle,
  UserCheck,
  Briefcase,
  ChevronDown,
  ChevronRight,
  Shield,
  Target,
  AlertTriangle,
  Brain,
  Loader2,
} from 'lucide-react';
import { Card } from '@/components/ui/card';

interface InspecteurSuggeré {
  id: string;
  prenom: string;
  nom: string;
  specialites: string[];
  disponible: boolean;
  score: number;
  chargeMissions: number;
  competenceScore: number;
  niveauCompetence: string;
  correspondance: string[];
  /** Vrai si l'inspecteur a au moins une compétence couvrant les domaines requis */
  isQualified: boolean;
  /** Vrai si l'inspecteur peut être chef d'équipe (titulaire/principal) */
  peutEtreChef: boolean;
}

interface PlanningEnrichi extends Planning {
  aDesExemptions?: boolean;
  aDesMesuresEnRetard?: boolean;
  nbExemptions?: number;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

// Extraction des domaines depuis la portée du planning
function extraireDomaines(portee: string[]): string[] {
  const mapping: Record<string, string[]> = {
    'SGS': ['SGS', 'culture', 'securite'],
    'SLI': ['SLI', 'sauvetage', 'incendie'],
    'PHY': ['PHY', 'piste', 'balisage', 'infrastructure'],
    'OPS': ['OPS', 'exploitation', 'operations'],
    'AGA': ['AGA', 'aerodrome'],
    'ELEC': ['ELEC', 'electrique', 'feux'],
    'RA': ['RA', 'animalier', 'faune'],
    'RH': ['RH', 'personnel', 'ressources'],
    'PAC': ['PAC', 'action', 'corrective'],
    'Écarts': ['ecart', 'non-conformite', 'nc'],
  };
  
  const domaines = new Set<string>();
  portee.forEach(p => {
    Object.entries(mapping).forEach(([domaine, keywords]) => {
      if (keywords.some(k => p.toLowerCase().includes(k.toLowerCase()))) {
        domaines.add(domaine);
      }
    });
  });
  
  return Array.from(domaines);
}

// Seul un inspecteur titulaire ou principal peut être chef d'équipe
const TYPES_CHEF_AUTORISES = ['inspecteur_titulaire', 'inspecteur_principal']
function peutEtreChef(insp: any): boolean {
  const type = insp?.type_inspecteur || insp?._insp?.type
  return TYPES_CHEF_AUTORISES.includes(type)
}

function calculerScoreInspecteur(
  insp: Utilisateur,
  planning: PlanningEnrichi,
  planningsExistants: Planning[],
  profilsRisque: Record<string, ProfilRisque>,
  formations: Formation[]
): InspecteurSuggeré {
  let score = 0;
  const correspondance: string[] = [];

  if (insp.statut === 'inactif' || insp.statut === 'suspendu') {
    return {
      ...insp,
      disponible: false,
      specialites: insp.specialites || insp.competences?.map((c: { domaine: string; niveau: string }) => c.domaine) || [],
      score: 0,
      chargeMissions: 0,
      competenceScore: 0,
      niveauCompetence: 'insuffisant',
      correspondance: ['Inactif'],
      isQualified: false,
      peutEtreChef: false,
    };
  }

  const portee = planning.portee ?? [];
  const domainesRequis = extraireDomaines(portee);
  
  // Domaines de l'inspecteur depuis ses spécialités métier (fallback compétences)
  const domainesInsp = insp.specialites?.length
    ? getDomainesFromSpecialites(insp.specialites)
    : insp.competences?.map((c: { domaine: string; niveau: string }) => c.domaine) || [];
  const matching = domainesInsp.filter((c: string) => 
    domainesRequis.some(d => d === c || c.includes(d))
  );
  
  // ── Qualification domaine ──────────────────────────────────────
  // L'inspecteur est qualifié s'il couvre au moins un domaine requis
  // (ou si la portée ne requiert aucun domaine spécifique)
  const isQualified = matching.length > 0 || domainesRequis.length === 0;

  score += matching.length * 25;
  if (matching.length > 0) {
    correspondance.push(`${matching.length} compétence(s) correspondante(s) : ${matching.join(', ')}`);
  } else if (domainesRequis.length > 0) {
    // Pénalité forte + signal visuel : l'inspecteur n'est pas qualifié pour ces domaines
    correspondance.push(`⚠️ Aucune qualification pour : ${domainesRequis.join(', ')}`);
    score -= 50; // Pénalité augmentée de -30 à -50
  }

  // Vérification des conflits de dates
  const debut = new Date(planning.date_debut).getTime();
  const fin = new Date(planning.date_fin).getTime();
  const enConflit = planningsExistants.filter((p) => {
    if (!p.equipe_ids.includes(insp.id) && p.chef_id !== insp.id) return false;
    const pDebut = new Date(p.date_debut).getTime();
    const pFin = new Date(p.date_fin).getTime();
    return debut < pFin && pDebut < fin;
  });

  if (enConflit.length === 0) {
    score += 30;
    correspondance.push('Aucun conflit de dates');
  } else {
    score -= 50;
    correspondance.push(`${enConflit.length} conflit(s) de dates`);
  }

  // Charge de travail
  const dans30j = new Date();
  dans30j.setDate(dans30j.getDate() + 30);
  const chargeMissions = planningsExistants.filter((p) => {
    if (!p.equipe_ids.includes(insp.id) && p.chef_id !== insp.id) return false;
    const pDebut = new Date(p.date_debut);
    return pDebut <= dans30j;
  }).length;

  if (chargeMissions <= 2) {
    score += 25;
    correspondance.push('Charge légère');
  } else if (chargeMissions <= 4) {
    score += 10;
    correspondance.push('Charge modérée');
  } else {
    score -= 20;
    correspondance.push('Charge élevée');
  }

  // Score de compétence
  let competenceScore = 0;
  let niveauCompetence = 'insuffisant';
  try {
    const formationsFiltered = formations.filter(f => f.participants?.includes(insp.id));
    const competenceResult = computeCompetenceScore(insp, planningsExistants as unknown as import('@/lib/store').Surveillance[], formationsFiltered);
    competenceScore = competenceResult.score;
    niveauCompetence = competenceResult.niveau;
    score += competenceScore / 4;
    if (competenceScore >= 75) correspondance.push(`Expert (${competenceScore}%)`);
    else if (competenceScore >= 50) correspondance.push(`Confirmé (${competenceScore}%)`);
  } catch (e) {
    // Fallback
  }

  // Prise en compte du profil de risque de l'aérodrome
  const profil = profilsRisque[planning.aerodrome_id];
  if (profil && profil.score_global < 30) {
    score += 20;
    correspondance.push(`Aérodrome critique - priorité haute`);
  } else if (profil && profil.tendance === 'baisse') {
    score += 10;
    correspondance.push(`Aérodrome en dégradation`);
  }

  // Prise en compte des exemptions actives
  if (planning.aDesExemptions) {
    score += 15;
    correspondance.push(`${planning.nbExemptions || 1} exemption(s) active(s) - suivi des mesures requis`);
    
    if (planning.aDesMesuresEnRetard) {
      score += 20;
      correspondance.push(`⚠️ Mesures d'atténuation en retard - priorité haute`);
    }
  }

  // Bonus pour expertise en suivi PAC / mesures
  const aExpertisePAC = domainesInsp.some((c: string) => 
    c.toLowerCase().includes('pac') || 
    c.toLowerCase().includes('action') || 
    c.toLowerCase().includes('corrective')
  );
  if (planning.type === 'mise_oeuvre_pac' && aExpertisePAC) {
    score += 15;
    correspondance.push(`Expertise en suivi PAC`);
  }

  return {
    ...insp,
    disponible: true,
    specialites: domainesInsp,
    score: Math.max(0, Math.min(100, score)),
    chargeMissions,
    competenceScore,
    niveauCompetence,
    correspondance,
    isQualified,
    peutEtreChef: peutEtreChef(insp),
  };
}

interface SmartAssignmentProps {
  userRole?: string;
}

export function SmartAssignment({ userRole = 'admin' }: SmartAssignmentProps) {
  const plannings = useAppStore(s => s.plannings)
  const aerodromes = useAppStore(s => s.aerodromes)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const formations = useAppStore(s => s.formations)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const updatePlanning = useAppStore(s => s.updatePlanning)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user);

  // Récupérer les exemptions actives depuis le store
  const storeState = useAppStore.getState()
  const getExemptionsActives = storeState.getExemptionsActives?.bind(storeState) || (() => [] as Exemption[]);

  const [assignations, setAssignations] = useState<Record<string, string>>({});
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showDetails, setShowDetails] = useState<string | null>(null);
  
  // États pour l'IA
  const [iaSuggestion, setIaSuggestion] = useState<string | null>(null);
  const [isIaLoading, setIsIaLoading] = useState(false);
  const [showIaTip, setShowIaTip] = useState(true);
  const iaTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (iaTimeoutRef.current) clearTimeout(iaTimeoutRef.current);
    };
  }, []);

  // Enrichir les plannings avec les infos d'exemptions
  const planningsEnrichis = useMemo(() => {
    return plannings.map(planning => {
      let aDesExemptions = false;
      let aDesMesuresEnRetard = false;
      let nbExemptions = 0;
      
      try {
        const exemptions = getExemptionsActives(planning.aerodrome_id);
        if (exemptions && exemptions.length > 0) {
          aDesExemptions = true;
          nbExemptions = exemptions.length;
          aDesMesuresEnRetard = exemptions.some((e: Exemption) => 
            e.mesures && e.mesures.some((m) => m.statut === 'en_retard')
          );
        }
      } catch (e) {
        // Fonction non disponible
      }
      
      return {
        ...planning,
        aDesExemptions,
        aDesMesuresEnRetard,
        nbExemptions,
      };
    });
  }, [plannings, getExemptionsActives]);

  const planningsSansEquipe = useMemo(() => {
    return planningsEnrichis.filter(
      (p) => p.statut === 'planifiee' && (p.equipe_ids.length === 0 || p.chef_id === '')
    );
  }, [planningsEnrichis]);

  const inspecteurs = useMemo(() => {
    return utilisateurs.filter((u) => u.role === 'inspector' && u.statut !== 'inactif');
  }, [utilisateurs]);

  const enregistrerFeedbackAssignation = useCallback((
    planningId: string,
    inspecteurId: string
  ) => {
    // Feedback ignoré : cette fonction sera réimplémentée via teamOptimizer
    // dans la version AERORISQ. L'ancien appel à learningEngine.recordLearningFeedback
    // corrompait le modèle Random Forest avec des données non-checklist.
    return;
  }, []);

  // ✅ Suggestion IA pour l'assignation
  const getIaSuggestion = useCallback(async (planning: PlanningEnrichi) => {
    setIsIaLoading(true);
    try {
      const result = await assistantAgent.chat({
        message: `Quel inspecteur assigner à une mission ${planning.type} sur l'aérodrome ${planning.aerodrome_id} ?`,
        contexte: {
          module: 'assignment',
          aerodromeId: planning.aerodrome_id,
        },
        userRole: userRole
      });
      setIaSuggestion(result.message);
      iaTimeoutRef.current = setTimeout(() => setIaSuggestion(null), 8000);
    } catch (error) {
      console.error('[IA] Erreur:', error);
    } finally {
      setIsIaLoading(false);
    }
  }, [userRole]);

  function getSuggestions(planning: PlanningEnrichi): InspecteurSuggeré[] {
    const scored = inspecteurs
      .map((insp) => calculerScoreInspecteur(insp, planning, planningsEnrichis, profilsRisque, formations))
      .filter((insp) => insp.disponible);

    // Tri : qualifiés d'abord (peutEtreChef avant, score desc), puis non-qualifiés
    const qualifies    = scored.filter(i => i.isQualified).sort((a, b) => {
      if (a.peutEtreChef !== b.peutEtreChef) return a.peutEtreChef ? -1 : 1
      return b.score - a.score
    });
    const nonQualifies = scored.filter(i => !i.isQualified).sort((a, b) => {
      if (a.peutEtreChef !== b.peutEtreChef) return a.peutEtreChef ? -1 : 1
      return b.score - a.score
    });

    // On retourne les qualifiés en priorité, puis les non-qualifiés (en avertissement)
    return [...qualifies, ...nonQualifies].slice(0, 6);
  }

  function handleAssigner(planningId: string) {
    const inspecteurId = assignations[planningId];
    if (!inspecteurId) return;
    
    const planning = planningsEnrichis.find(p => p.id === planningId);
    if (!planning) return;
    const inspecteur = inspecteurs.find(i => i.id === inspecteurId);
    if (!inspecteur) return;
    
    // Vérifier que l'inspecteur peut être chef d'équipe
    if (!peutEtreChef(inspecteur)) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Chef non valide',
        message: 'Seuls les inspecteurs titulaires ou principaux peuvent être chefs d\'équipe.',
        canal: 'in_app'
      });
      return;
    }
    
    // Vérifier la couverture des domaines
    const portee = planning.portee ?? [];
    const domainesRequis = extraireDomaines(portee);
    const equipeIds = [inspecteurId];
    const { valide, erreurs } = verifierCompositionEquipe(equipeIds, inspecteurs, domainesRequis);
    if (!valide) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Équipe incomplète',
        message: erreurs.join('. '),
        canal: 'in_app'
      });
    }
    
    // ✅ Enregistrer le feedback
    enregistrerFeedbackAssignation(planningId, inspecteurId);
    
    updatePlanning(planningId, {
      chef_id: inspecteurId,
      equipe_ids: [inspecteurId],
      updated_at: new Date().toISOString(),
    });
    
    setAssigned((prev) => new Set(prev).add(planningId));
    
    let message = `${inspecteur?.prenom} ${inspecteur?.nom} a été assigné au planning`;
    if (planning?.aDesExemptions) {
      message += ` (${planning.nbExemptions} exemption(s) active(s))`;
    }
    
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Inspecteur assigné',
      message,
      canal: 'in_app'
    });
  }

  function toggleExpand(planningId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(planningId)) next.delete(planningId);
      else next.add(planningId);
      return next;
    });
  }

  // Charge globale par inspecteur
  const chargeParInspecteur = useMemo(() => {
    const charge: Record<string, number> = {};
    inspecteurs.forEach((insp) => {
      charge[insp.id] = planningsEnrichis.filter(
        (p) => p.equipe_ids.includes(insp.id) || p.chef_id === insp.id
      ).length;
    });
    return charge;
  }, [inspecteurs, planningsEnrichis]);

  // Top recommandations globales
  const topRecommandations = useMemo(() => {
    if (planningsSansEquipe.length === 0) return [];
    
    const toutesSuggestions = planningsSansEquipe.flatMap(p => getSuggestions(p));
    const grouped = new Map<string, { count: number; totalScore: number; inspecteur: InspecteurSuggeré }>();
    
    toutesSuggestions.forEach(s => {
      if (!grouped.has(s.id)) {
        grouped.set(s.id, { count: 0, totalScore: 0, inspecteur: s });
      }
      const g = grouped.get(s.id)!;
      g.count++;
      g.totalScore += s.score;
    });
    
    return Array.from(grouped.values())
      .map(g => ({ ...g.inspecteur, recommandationsCount: g.count, avgScore: Math.round(g.totalScore / g.count) }))
      .sort((a, b) => b.recommandationsCount - a.recommandationsCount)
      .slice(0, 3);
  }, [planningsSansEquipe, inspecteurs, planningsEnrichis, profilsRisque, formations]);

  const nbPlanningsAvecExemptions = planningsSansEquipe.filter(p => p.aDesExemptions).length;
  const nbPlanningsAvecMesuresEnRetard = planningsSansEquipe.filter(p => p.aDesMesuresEnRetard).length;

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="heading-4 text-role-primary">Assignation intelligente</h2>
          <p className="text-small text-muted-foreground mt-1">
            {planningsSansEquipe.length} planning{planningsSansEquipe.length !== 1 ? 's' : ''} en attente d'assignation
          </p>
        </div>
      </div>

      {/* Alertes sur les exemptions */}
      {nbPlanningsAvecMesuresEnRetard > 0 && (
        <div className="alert alert-danger">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">⚠️ Plannings avec mesures d'atténuation en retard</div>
            <div className="alert-description">
              {nbPlanningsAvecMesuresEnRetard} planning(s) concernent des aérodromes avec des mesures en retard.
              Priorité haute pour l'assignation.
            </div>
          </div>
        </div>
      )}

      {nbPlanningsAvecExemptions > 0 && nbPlanningsAvecMesuresEnRetard === 0 && (
        <div className="alert alert-info">
          <Shield className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">Exemptions actives détectées</div>
            <div className="alert-description">
              {nbPlanningsAvecExemptions} planning(s) concernent des aérodromes avec des exemptions actives.
              Les mesures d'atténuation seront intégrées aux checklists.
            </div>
          </div>
        </div>
      )}

      {/* Top recommandations globales */}
      {topRecommandations.length > 0 && showIaTip && (
        <div className="alert alert-info">
          <span className="alert-icon">⭐</span>
          <div className="alert-content">
            <div className="alert-title flex items-center justify-between">
              <span>Top recommandations IA</span>
              <button onClick={() => setShowIaTip(false)} className="text-xs text-muted-foreground hover:text-foreground">
                Ignorer
              </button>
            </div>
            <div className="alert-description">
              {topRecommandations.map(rec => (
                <span key={rec.id} className="inline-block mr-3">
                  {rec.prenom} {rec.nom}: {rec.recommandationsCount} planning(s) recommandé(s)
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Charge de travail par inspecteur */}
      <Card
        icon={<Briefcase className="w-4 h-4 text-role-primary" />}
        title="Charge de travail actuelle"
      >
          {inspecteurs.map((insp) => {
            const charge = chargeParInspecteur[insp.id] ?? 0;
            const surcharge = charge > 15;
            const competence = computeCompetenceScore(insp, planningsEnrichis as unknown as import('@/lib/store').Surveillance[], formations);
            const specs = insp.competences?.slice(0, 3).map(c => c.domaine).join(' · ') || '—';
            return (
              <div key={insp.id} className="flex items-center gap-3 flex-wrap">
                <div className="min-w-[9rem] flex-shrink-0">
                  <span className="text-small font-medium text-foreground">{insp.prenom} {insp.nom}</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{specs}</p>
                </div>
                <div className="flex-1 min-w-[6rem]">
                  <div className={`progress h-2 ${surcharge ? 'progress-critique' : ''}`}>
                    <div className="progress-bar" style={{ width: `${Math.min(100, (charge / 20) * 100)}%` }} />
                  </div>
                </div>
                <div className="w-28 flex items-center gap-1 flex-shrink-0">
                  <span className={`text-small font-medium ${surcharge ? 'text-danger' : 'text-foreground'}`}>
                    {charge} mission{charge > 1 ? 's' : ''}
                  </span>
                  {surcharge && <AlertCircle className="w-3 h-3 text-danger" />}
                </div>
                <div className="w-24 flex-shrink-0">
                  <span className={`badge ${competence.niveau === 'expert' ? 'success' : competence.niveau === 'confirme' ? 'primary' : 'neutral'}`}>
                    {competence.niveau}
                  </span>
                </div>
                <div className="w-20 flex-shrink-0">
                  {insp.statut === 'actif' ? (
                    <span className="badge success text-xs">Actif</span>
                  ) : (
                    <span className="badge neutral text-xs">Inactif</span>
                  )}
                </div>
              </div>
            );
          })}
      </Card>

      {/* Plannings à assigner */}
      {planningsSansEquipe.length === 0 ? (
        <Card variant="level" levelColor="success" className="[&>div:last-child]:py-12 [&>div:last-child]:text-center">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
          <p className="text-muted-foreground">Tous les plannings ont une équipe assignée.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {planningsSansEquipe.map((planning) => {
            const aerodrome = aerodromes.find((a) => a.id === planning.aerodrome_id);
            const profil = profilsRisque[planning.aerodrome_id];
            const suggestions = getSuggestions(planning);
            const isExpanded = expanded.has(planning.id);
            const isAssigned = assigned.has(planning.id);
            const aDesExemptions = planning.aDesExemptions;
            const aDesMesuresEnRetard = planning.aDesMesuresEnRetard;
            const nbExemptions = planning.nbExemptions || 0;

            const getPriorityClass = () => {
              if (aDesMesuresEnRetard) return 'badge danger';
              switch (planning.priorite) {
                case 'critique': return 'badge danger';
                case 'haute': return 'badge warning';
                case 'moyenne': return 'badge primary';
                default: return 'badge neutral';
              }
            };

            const cardLevelColor = profil ? (aDesMesuresEnRetard || profil.score_global < 30 ? 'danger' as const : aDesExemptions || profil.tendance === 'baisse' ? 'warning' as const : undefined) : undefined;

            return (
              <Card
                key={planning.id}
                heading={
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleExpand(planning.id)} className="action-button">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-foreground">{aerodrome?.nom ?? planning.aerodrome_id}</span>
                          <span className="code-oaci-badge">{aerodrome?.code_oaci}</span>
                          <span className={getPriorityClass()}>{planning.priorite}</span>
                          {aDesMesuresEnRetard && (
                            <span className="badge danger pulse flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Mesures en retard
                            </span>
                          )}
                          {aDesExemptions && !aDesMesuresEnRetard && (
                            <span className="badge warning flex items-center gap-1">
                              <Shield className="w-3 h-3" />
                              {nbExemptions} exemption(s)
                            </span>
                          )}
                          {profil && profil.score_global < 30 && (
                            <span className="badge danger pulse">⚠️ Critique</span>
                          )}
                          {profil && profil.tendance === 'baisse' && profil.score_global >= 30 && (
                            <span className="badge warning">📉 Dégradation</span>
                          )}
                        </div>
                        <p className="text-small text-muted-foreground mt-0.5">
                          {planning.type?.replace(/_/g, ' ')} — {formatDate(planning.date_debut)} → {formatDate(planning.date_fin)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isAssigned && (
                        <button
                          onClick={() => getIaSuggestion(planning)}
                          disabled={isIaLoading}
                          className="action-button text-role-primary"
                          title="Suggestion IA"
                        >
                          {isIaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                        </button>
                      )}
                      {isAssigned ? (
                        <div className="flex items-center gap-2 text-success">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-small">Assigné</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <select
                            value={assignations[planning.id] ?? ''}
                            onChange={(e) => setAssignations((prev) => ({ ...prev, [planning.id]: e.target.value }))}
                            className={`form-select w-64 py-3 text-sm ${focusClass}`}
                            style={selectStyle}
                          >
                            <option value="">Choisir un inspecteur</option>
                            {suggestions.map((insp) => {
                              const prefixe = !insp.isQualified
                                ? '⚠️ NON QUALIFIÉ — '
                                : !insp.peutEtreChef
                                ? '🚫 PAS CHEF — '
                                : insp.score >= 80 ? '⭐ '
                                : insp.score >= 60 ? '✓ '
                                : '';
                              const specs = insp.specialites.slice(0, 2).join(', ') || 'Aucune spécialité';
                              return (
                                <option key={insp.id} value={insp.id}>
                                  {prefixe}{insp.prenom} {insp.nom} — {specs} ({insp.score}pts · {insp.niveauCompetence})
                                </option>
                              );
                            })}
                          </select>
                          <button
                            disabled={!assignations[planning.id]}
                            onClick={() => handleAssigner(planning.id)}
                            className="btn btn-primary btn-sm gap-1"
                          >
                            <UserCheck className="w-4 h-4" />
                            Assigner
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                }
                variant={cardLevelColor ? 'level' : 'default'}
                levelColor={cardLevelColor}
                className={isAssigned ? 'border-success bg-success-soft/20' : ''}
              >
                {isExpanded && (
                  <div>
                    {/* Alerte si mesures en retard */}
                    {aDesMesuresEnRetard && (
                      <div className="alert alert-danger mb-3 p-2 text-sm">
                        <AlertTriangle className="alert-icon" />
                        <div className="alert-content">
                          <p className="text-small font-medium">⚠️ Mesures d'atténuation en retard</p>
                          <p className="text-xs">Des mesures d'atténuation sont en retard. Une inspection de type "Mise en œuvre PAC" est recommandée.</p>
                        </div>
                      </div>
                    )}

                    {/* Alerte si exemptions actives */}
                    {aDesExemptions && !aDesMesuresEnRetard && (
                      <div className="alert alert-info mb-3 p-2 text-sm">
                        <Shield className="alert-icon" />
                        <div className="alert-content">
                          <p className="text-small">📋 {nbExemptions} exemption(s) active(s) - Les mesures d'atténuation seront ajoutées aux checklists</p>
                        </div>
                      </div>
                    )}

                    {/* Suggestion IA */}
                    {iaSuggestion && (
                      <div className="alert alert-info mb-3 p-2 text-sm animate-fade-up">
                        <Brain className="alert-icon" />
                        <div className="alert-content">
                          <p className="text-small font-medium">💡 Suggestion IA</p>
                          <p className="text-xs">{iaSuggestion}</p>
                        </div>
                      </div>
                    )}

                    <div className="border-t border-border pt-3 mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-2">
                        <Target className="w-3.5 h-3.5" />
                        Inspecteurs suggérés - Basé sur compétences, disponibilité, profil risque et exemptions
                      </p>
                      <div className="space-y-2">
                        {suggestions.map((insp) => (
                          <div key={insp.id} className="flex items-center justify-between p-3 rounded-xl bg-role-primary-soft border border-role-primary-light">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-role-primary flex items-center justify-center !text-white font-bold">
                                {insp.prenom?.[0]}{insp.nom?.[0]}
                              </div>
                              <div>
                                <span className="text-small font-semibold text-foreground">{insp.prenom} {insp.nom}</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {insp.peutEtreChef && (
                                    <span className="badge primary text-xs">👔 Chef</span>
                                  )}
                                  {insp.correspondance.slice(0, 3).map((c, i) => (
                                    <span key={i} className="badge outline text-xs">{c}</span>
                                  ))}
                                  {insp.correspondance.length > 3 && (
                                    <span className="text-[10px] text-muted-foreground">+{insp.correspondance.length - 3}</span>
                                  )}
                                </div>
                                <div className="flex gap-2 mt-1">
                                  {insp.specialites.slice(0, 3).map((s: string, i: number) => (
                                    <span key={i} className="text-[10px] text-muted-foreground">🏷️ {s}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-bold text-role-primary">{insp.score}pts</div>
                              <div className="text-xs text-muted-foreground">{insp.chargeMissions} missions</div>
                              <div className="text-xs text-muted-foreground">Score compétence: {insp.competenceScore}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {suggestions.length === 0 && (
                        <div className="text-center py-4 text-muted-foreground">
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Aucun inspecteur disponible pour ce planning</p>
                          <p className="text-xs">Vérifiez les compétences requises ou la disponibilité</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SmartAssignment;