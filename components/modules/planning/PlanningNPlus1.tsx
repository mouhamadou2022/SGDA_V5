// components/modules/planning/PlanningNPlus1.tsx
// VERSION CORRIGÉE AVEC IA - Utilise computeFinalFrequency au lieu de calcul local
// ✅ Suppression du calcul local de fréquence
// ✅ Utilisation de computeFinalFrequency depuis risque.ts
// ✅ Ajout de suggestions IA pour la génération

'use client';

import React from 'react';

import { useState, useMemo } from 'react';
import { useAppStore, Planning } from '@/lib/store';
import { genererPlanningN1, computeFinalFrequency, computeBaseFrequency, computeMultipliers, getRiskLevel, RISK_LEVELS } from '@/lib/risque';
import { formatDate } from '@/lib/utils';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { learningEngine } from '@/lib/learningEngine';
import {
  Calendar,
  CheckSquare,
  Square,
  AlertTriangle,
  Zap,
  CheckCircle2,
  XCircle,
  Info,
  X,
  Users,
  Target,
  MapPin,
  CalendarDays,
  TrendingDown,
  Shield,
  Eye,
  Brain,
  Loader2,
  Sparkles,
} from 'lucide-react';

interface PropositionPlanning extends Partial<Planning> {
  _conflits?: string[];
  _equipeSuggerer?: { nom: string; prenom: string; competences: string[] }[];
  _domainesPrioritaires?: { domaine: string; score: number; raison: string }[];
  _sousDomainesCritiques?: string[];
  _frequenceSuggerer?: { label: string; valeur: number };
  _velocityAlert?: boolean;
  _aDesExemptions?: boolean;
  _aDesMesuresEnRetard?: boolean;
  _nbExemptions?: number;
}

interface PlanningNPlus1Props {
  onClose?: () => void;
  userRole?: string;
}

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
}

function badgePriorite(priorite: string) {
  switch (priorite) {
    case 'critique': return <span className="badge danger">Critique</span>;
    case 'haute': return <span className="badge warning">Haute</span>;
    case 'moyenne': return <span className="badge primary">Moyenne</span>;
    default: return <span className="badge neutral">Basse</span>;
  }
}

function getDomainesPrioritaires(profil: any): { domaine: string; score: number; raison: string }[] {
  if (!profil) return []
  
  const domaines = [
    { key: 'c1', domaine: 'SGS', seuil: 50 },
    { key: 'c2', domaine: 'PAC', seuil: 50 },
    { key: 'c3', domaine: 'PHY/OPS', seuil: 50 },
    { key: 'c4', domaine: 'Écarts', seuil: 50 },
    { key: 'c5', domaine: 'SLI', seuil: 50 },
  ]
  
  return domaines
    .filter(d => profil[d.key] < d.seuil)
    .sort((a, b) => profil[a.key] - profil[b.key])
    .slice(0, 3)
    .map(d => ({ domaine: d.domaine, score: profil[d.key], raison: `Score ${profil[d.key]}/100, en dessous du seuil ${d.seuil}` }))
}

function getEquipeSuggerer(profil: any, utilisateurs: any[], planningsExistants: any[]): { nom: string; prenom: string; competences: string[] }[] {
  const inspecteurs = utilisateurs.filter(u => u.role === 'inspector' && u.statut !== 'inactif')
  const domainesRequis = getDomainesPrioritaires(profil).map(d => d.domaine)
  
  const getCompetences = (insp: any): string[] => {
    if (insp.competences && Array.isArray(insp.competences)) {
      return insp.competences.map((c: any) => typeof c === 'string' ? c : c.domaine)
    }
    return ['Général']
  }
  
  return inspecteurs
    .map(insp => ({
      nom: insp.nom || '',
      prenom: insp.prenom || 'Inspecteur',
      competences: getCompetences(insp),
      matchCount: getCompetences(insp).filter(c => domainesRequis.some(d => c.includes(d) || d.includes(c))).length
    }))
    .filter(i => i.matchCount > 0)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, 3)
}

export function PlanningNPlus1({ onClose, userRole = 'admin' }: PlanningNPlus1Props) {
  const aerodromes = useAppStore(s => s.aerodromes)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const surveillances = useAppStore(s => s.surveillances)
  const plannings = useAppStore(s => s.plannings)
  const ecarts = useAppStore(s => s.ecarts)
  const certifications = useAppStore(s => s.certifications)
  const addPlanning = useAppStore(s => s.addPlanning)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user);
  const genererPlanningN1 = useAppStore(s => s.genererPlanningN1);

  const getExemptionsActives = (useAppStore as any).getExemptionsActives?.bind(useAppStore) || (() => []);

  const [iaSuggestion, setIaSuggestion] = useState<string | null>(null);
  const [isIaLoading, setIsIaLoading] = useState(false);

  const anneeN1 = new Date().getFullYear() + 1;
  const [propositions, setPropositions] = useState<PropositionPlanning[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [generated, setGenerated] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [showDetails, setShowDetails] = useState<number | null>(null);

  const exemptionsActivesParAerodrome = useMemo(() => {
    const map = new Map<string, { count: number; hasMesuresEnRetard: boolean }>();
    try {
      aerodromes.forEach(aero => {
        const actives = getExemptionsActives(aero.id);
        if (actives && actives.length > 0) {
          const hasMesuresEnRetard = actives.some((e: any) => 
            e.mesures && e.mesures.some((m: any) => m.statut === 'en_retard')
          );
          map.set(aero.id, { count: actives.length, hasMesuresEnRetard });
        }
      });
    } catch (e) {
      // Fonction non disponible
    }
    return map;
  }, [aerodromes, getExemptionsActives]);

  // Suggestion IA pour la génération
  const getIaSuggestion = async () => {
    setIsIaLoading(true);
    try {
      const result = await assistantAgent.chat({
        message: `Conseils pour générer le planning N+1 ${anneeN1} avec ${aerodromes.length} aérodromes`,
        contexte: { module: 'planning' },
        userRole: userRole
      });
      setIaSuggestion(result.message);
      setTimeout(() => setIaSuggestion(null), 10000);
    } catch (error) {
      console.error('[IA] Erreur:', error);
    } finally {
      setIsIaLoading(false);
    }
  };

  function detecterConflit(a: Partial<Planning>, b: Partial<Planning>): boolean {
    if (!a.date_debut || !a.date_fin || !b.date_debut || !b.date_fin) return false;
    if (a.aerodrome_id !== b.aerodrome_id) return false;
    const aStart = new Date(a.date_debut).getTime();
    const aEnd = new Date(a.date_fin).getTime();
    const bStart = new Date(b.date_debut).getTime();
    const bEnd = new Date(b.date_fin).getTime();
    return aStart < bEnd && bStart < aEnd;
  }

  function handleGenerer() {
    const toutes: PropositionPlanning[] = [];

    aerodromes.forEach((aero) => {
      const profil = profilsRisque[aero.id];
      if (!profil) return;

      const historique = surveillances
        .filter((s) => s.aerodrome_id === aero.id)
        .map((s) => ({
          type: s.type,
          date: s.date_debut,
          domaines: s.portee || [],
        }));

      // Nouveau générateur centralisé (profil + carry-over écarts/PAC + certification)
      const props = genererPlanningN1(aero.id, anneeN1)
      
      const velocityMetrics = profil.velocity_metrics;
      const velocityAlert = velocityMetrics && velocityMetrics.vitesse < -1.5;
      const exemptionsInfo = exemptionsActivesParAerodrome.get(aero.id);
      const aDesExemptions = !!exemptionsInfo;
      const aDesMesuresEnRetard = exemptionsInfo?.hasMesuresEnRetard || false;
      
      // Use the correct functions from risque.ts
      const riskLevelKey = getRiskLevel(profil.score_global)
      const riskLevelMap: Record<string, any> = {
        'EXCELLENT': 'critique',
        'BON': 'eleve', 
        'RENFORCE': 'moyen',
        'CRITIQUE': 'faible'
      }
      const riskLevelForFreq = riskLevelMap[riskLevelKey] || 'moyen'
      
      const baseFreq = computeBaseFrequency(riskLevelForFreq)
      const multipliers = computeMultipliers({
        typeAeroport: aero.type,
        hasCriticalEcarts: props.some(p => (p as any).nbEcartsCritiques > 0),
        tendance: profil.tendance === 'baisse' ? 'baisse' : profil.tendance === 'hausse' ? 'hausse' : 'stable',
        hasTriggers: false,
        hasAggravators: false
      })
      const freqResult = computeFinalFrequency(baseFreq, multipliers)
      
      const frequenceSuggerer = {
        label: freqResult >= 12 ? 'Mensuelle' :
               freqResult >= 6 ? 'Bimensuelle' :
               freqResult >= 4 ? 'Trimestrielle' :
               freqResult >= 2 ? 'Semestrielle' : 'Annuelle',
        valeur: freqResult
      };
      
      const propsEnrichies = props.map((prop) => ({
        ...prop,
        _domainesPrioritaires: getDomainesPrioritaires(profil),
        _equipeSuggerer: getEquipeSuggerer(profil, utilisateurs, plannings),
        _frequenceSuggerer: frequenceSuggerer,
        _velocityAlert: velocityAlert,
        _aDesExemptions: aDesExemptions,
        _aDesMesuresEnRetard: aDesMesuresEnRetard,
        _nbExemptions: exemptionsInfo?.count || 0,
      }));
      
      toutes.push(...propsEnrichies);
    });

    const avecConflits: PropositionPlanning[] = toutes.map((prop, idx) => {
      const conflits: string[] = [];

      toutes.forEach((other, oidx) => {
        if (idx === oidx) return;
        if (detecterConflit(prop, other)) {
          const aeronm = aerodromes.find((a) => a.id === other.aerodrome_id)?.nom ?? other.aerodrome_id;
          conflits.push(`Chevauchement avec ${aeronm} (${formatDate(other.date_debut ?? '')})`);
        }
      });

      plannings.forEach((existing) => {
        if (detecterConflit(prop, existing)) {
          const aeronm = aerodromes.find((a) => a.id === existing.aerodrome_id)?.nom ?? existing.aerodrome_id;
          conflits.push(`Conflit avec planning existant ${aeronm}`);
        }
      });

      return { ...prop, _conflits: conflits };
    });

    setPropositions(avecConflits);
    setSelected(new Set(avecConflits.map((_, i) => i)));
    setGenerated(true);
    setValidated(false);
  }

  function toggleSelection(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === propositions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(propositions.map((_, i) => i)));
    }
  }

  async function handleValider() {
    setValidating(true);
    const selectedProps = propositions.filter((_, i) => selected.has(i));

    selectedProps.forEach((prop) => {
      const { 
        _conflits, _domainesPrioritaires, _equipeSuggerer, _frequenceSuggerer, 
        _velocityAlert, _aDesExemptions, _aDesMesuresEnRetard, _nbExemptions, 
        ...planningData 
      } = prop;
      const maintenant = new Date().toISOString();
      const planning: Planning = {
        id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        aerodrome_id: planningData.aerodrome_id ?? '',
        type: planningData.type ?? 'programmee',
        date_debut: planningData.date_debut ?? '',
        date_fin: planningData.date_fin ?? '',
        portee: planningData.portee ?? [],
        equipe_ids: planningData.equipe_ids ?? [],
        chef_id: planningData.chef_id ?? '',
        statut: 'planifiee',
        priorite: planningData.priorite ?? 'moyenne',
        declencheur: 'automatique',
        objectifs: planningData.objectifs ?? '',
        est_proposition: false,
        annee_cible: anneeN1,
        created_at: maintenant,
        updated_at: maintenant,
      };
      addPlanning(planning);
    });

    setValidating(false);
    setValidated(true);
    
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Planning validé',
      message: `${selected.size} proposition(s) ajoutée(s) au planning ${anneeN1}`,
      canal: 'in_app'
    });
  }

  const nbConflits = propositions.filter((p) => (p._conflits?.length ?? 0) > 0).length;
  const nbPropositionsAvecExemptions = propositions.filter((p) => p._aDesExemptions).length;
  const nbPropositionsAvecMesuresEnRetard = propositions.filter((p) => p._aDesMesuresEnRetard).length;

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole}>
      
      {/* Bandeau d'alerte sur les mesures en retard */}
      {generated && nbPropositionsAvecMesuresEnRetard > 0 && (
        <div className="alert alert-danger">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">⚠️ Mesures d'atténuation en retard</div>
            <div className="alert-description">
              {nbPropositionsAvecMesuresEnRetard} proposition(s) concernent des aérodromes avec des mesures d'atténuation en retard.
              Une inspection de type "Mise en œuvre PAC" est recommandée.
            </div>
          </div>
        </div>
      )}

      {/* Bandeau d'information sur les exemptions */}
      {generated && nbPropositionsAvecExemptions > 0 && nbPropositionsAvecMesuresEnRetard === 0 && (
        <div className="alert alert-info">
          <Shield className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">Exemptions actives détectées</div>
            <div className="alert-description">
              {nbPropositionsAvecExemptions} proposition(s) concernent des aérodromes avec des exemptions actives.
              Les mesures d'atténuation seront automatiquement ajoutées aux checklists.
            </div>
          </div>
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="heading-4 text-role-primary">Génération du planning {anneeN1}</h2>
          <p className="text-small text-muted-foreground mt-1">
            Propositions automatiques basées sur les profils de risque des aérodromes
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={getIaSuggestion}
            disabled={isIaLoading}
            className="btn btn-secondary gap-2"
            title="Demander conseil à l'IA"
          >
            {isIaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
            Conseil IA
          </button>
          <button onClick={handleGenerer} className="btn btn-primary gap-2">
            <Zap className="w-4 h-4" />
            Générer le planning {anneeN1}
          </button>
        </div>
      </div>

      {/* Suggestion IA */}
      {iaSuggestion && (
        <div className="alert alert-info animate-fade-up">
          <Brain className="alert-icon" />
          <div className="alert-content flex-1">
            <div className="alert-title">💡 Suggestion IA</div>
            <div className="alert-description">{iaSuggestion}</div>
          </div>
        </div>
      )}

      {/* Profils de risque des aérodromes */}
      <div className="card border-border">
        <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
          <div className="card-title text-base">Profils de risque actuels</div>
        </div>
        <div className="card-content p-0">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr className="border-b border-border">
                  <th>Aérodrome</th>
                  <th>Code OACI</th>
                  <th>Niveau de risque</th>
                  <th>Fréquence suggérée</th>
                  <th>Score</th>
                  <th>Exemptions</th>
                 </tr>
              </thead>
              <tbody>
                {aerodromes.map((aero) => {
                  const profil = profilsRisque[aero.id];
                  const niveauKey = profil ? getRiskLevel(profil.score_global) : null;
                  const cfg = niveauKey ? RISK_LEVELS[niveauKey] : null;
                  const exemptionsInfo = exemptionsActivesParAerodrome.get(aero.id);
                  const aDesExemptions = !!exemptionsInfo;
                  const aDesMesuresEnRetard = exemptionsInfo?.hasMesuresEnRetard || false;
                  
                  let frequenceLabel = '—';
                  if (profil) {
                    const riskLevelKey = getRiskLevel(profil.score_global)
                    const riskLevelMap: Record<string, any> = {
                      'EXCELLENT': 'critique',
                      'BON': 'eleve', 
                      'RENFORCE': 'moyen',
                      'CRITIQUE': 'faible'
                    }
                    const riskLevelForFreq = riskLevelMap[riskLevelKey] || 'moyen'
                    
                    const baseFreq = computeBaseFrequency(riskLevelForFreq)
                    const multipliers = computeMultipliers({
                      typeAeroport: aero.type,
                      hasCriticalEcarts: false,
                      tendance: profil.tendance === 'baisse' ? 'baisse' : profil.tendance === 'hausse' ? 'hausse' : 'stable',
                      hasTriggers: false,
                      hasAggravators: false
                    })
                    const freqResult = computeFinalFrequency(baseFreq, multipliers)
                    
                    frequenceLabel = freqResult >= 12 ? 'Mensuelle (×12/an)' :
                                    freqResult >= 6 ? 'Bimensuelle (×6/an)' :
                                    freqResult >= 4 ? 'Trimestrielle (×4/an)' :
                                    freqResult >= 2 ? 'Semestrielle (×2/an)' : 'Annuelle (×1/an)';
                  }
                  
                  return (
                    <tr key={aero.id} className="border-b border-border hover:bg-role-primary-soft">
                      <td className="font-medium text-foreground">{aero.nom}</td>
                      <td>
                        <span className="code-oaci-badge inline-block px-2 py-0.5 bg-gray-800 text-white rounded-md font-mono text-xs">
                          {aero.code_oaci}
                        </span>
                      </td>
                      <td>
                        {profil && cfg ? (
                          <span className={`badge ${cfg.color === 'success' ? 'success' : cfg.color === 'primary' ? 'primary' : cfg.color === 'warning' ? 'warning' : 'danger'}`}>
                            {cfg.label} ({profil.score_global}/100)
                          </span>
                        ) : (
                          <span className="badge neutral">Non calculé</span>
                        )}
                      </td>
                      <td className="text-small text-muted-foreground">
                        {frequenceLabel}
                      </td>
                      <td>
                        {profil ? (
                          <div className="flex items-center gap-2">
                            <div className="progress w-20 h-1.5">
                              <div className={`progress-bar ${profil.score_global < 30 ? 'progress-critique' : profil.score_global < 60 ? 'progress-eleve' : 'progress-moyen'}`} style={{ width: `${profil.score_global}%` }} />
                            </div>
                            <span className="text-small font-medium text-foreground">{profil.score_global}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td>
                        {aDesExemptions ? (
                          <div className="flex items-center gap-1">
                            <Shield className="w-4 h-4 text-warning" />
                            <span className="text-small text-warning">{exemptionsInfo.count}</span>
                            {aDesMesuresEnRetard && (
                              <AlertTriangle className="w-3 h-3 
text-danger ml-1" />
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Résultats de la génération */}
      {generated && (
        <div className="space-y-4 animate-fade-in">
          {nbConflits > 0 && (
            <div className="alert alert-warning">
              <AlertTriangle className="alert-icon" />
              <div className="alert-content">
                <div className="alert-title">{nbConflits} conflit{nbConflits > 1 ? 's' : ''} détecté{nbConflits > 1 ? 's' : ''}</div>
                <div className="alert-description">Certaines propositions se chevauchent. Vérifiez avant de valider.</div>
              </div>
            </div>
          )}

          {validated && (
            <div className="alert alert-success">
              <CheckCircle2 className="alert-icon" />
              <div className="alert-content">
                <div className="alert-title">Propositions validées avec succès</div>
                <div className="alert-description">
                  {selected.size} mission{selected.size > 1 ? 's' : ''} ajoutée{selected.size > 1 ? 's' : ''} au planning {anneeN1}.
                </div>
              </div>
            </div>
          )}

          <div className="card border-border">
            <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="card-title text-base">
                  {propositions.length} propositions générées
                  <span className="ml-2 text-small font-normal text-muted-foreground">
                    ({selected.size} sélectionnée{selected.size > 1 ? 's' : ''})
                  </span>
                  {nbPropositionsAvecExemptions > 0 && (
                    <span className="ml-2 badge warning text-[10px]">
                      {nbPropositionsAvecExemptions} avec exemptions
                    </span>
                  )}
                </div>
                <button onClick={toggleAll} className="btn btn-secondary btn-sm gap-1">
                  {selected.size === propositions.length ? (
                    <><XCircle className="w-3 h-3" />Tout désélectionner</>
                  ) : (
                    <><CheckCircle2 className="w-3 h-3" />Tout sélectionner</>
                  )}
                </button>
              </div>
            </div>
            <div className="card-content p-0">
              <div className="table-container">
                <table className="table">
                   <thead>
                     <tr className="border-b border-border">
                       <th className="w-10"></th>
                       <th>Aérodrome</th>
                       <th>Profil de risque</th>
                       <th>Domaines/Sous-domaines</th>
                       <th>Type</th>
                       <th>Fréquence</th>
                       <th>Dates</th>
                       <th>Équipe suggérée</th>
                       <th>Justification</th>
                       <th>Feedback</th>
                     </tr>
                   </thead>
                  <tbody>
                     {propositions.map((prop, idx) => {
                       const aerodrome = aerodromes.find((a) => a.id === prop.aerodrome_id);
                       const showDetail = showDetails === idx;
                       const isSelected = selected.has(idx);
                       const aDesExemptions = prop._aDesExemptions;
                       const aDesMesuresEnRetard = prop._aDesMesuresEnRetard;
                       const nbExemptions = prop._nbExemptions || 0;
                       const profil = aerodrome ? profilsRisque[aerodrome.id] : null;
                       
                       return (
                         <React.Fragment key={idx}>
                           <tr
                             className={`cursor-pointer hover:bg-role-primary-soft transition-colors ${
                               isSelected ? 'bg-role-primary-soft' : ''
                             } ${(prop._conflits?.length ?? 0) > 0 ? 'border-l-2 border-warning' : ''} ${
                               aDesMesuresEnRetard ? 'border-l-4 border-l-danger' : aDesExemptions ? 'border-l-2 border-l-warning' : ''
                             }`}
                             onClick={() => toggleSelection(idx)}
                           >
                             <td onClick={(e) => e.stopPropagation()}>
                               <button onClick={() => toggleSelection(idx)} className="action-button">
                                 {isSelected ? (
                                   <CheckSquare className="w-4 h-4 text-role-primary" />
                                 ) : (
                                   <Square className="w-4 h-4 text-muted-foreground" />
                                 )}
                               </button>
                             </td>
                             
                             {/* Aérodrome */}
                             <td className="font-medium text-small text-foreground">
                               <div>
                                 {aerodrome?.nom ?? prop.aerodrome_id}
                                 {aerodrome && (
                                   <div className="text-[10px] text-muted-foreground">{aerodrome.code_oaci}</div>
                                 )}
                               </div>
                             </td>
                             
                             {/* Profil de risque */}
                             <td>
                               {profil ? (
                                 <div className="space-y-1">
                                   <div className="flex items-center gap-1">
                                     <div className={`w-2 h-2 rounded-full ${
                                       profil.score_global < 30 ? 'bg-danger animate-pulse' :
                                       profil.score_global < 60 ? 'bg-warning' : 'bg-success'
                                     }`} />
                                     <span className="text-xs font-semibold">{profil.score_global}/100</span>
                                   </div>
                                   <div className="text-[10px] text-muted-foreground">
                                     C1:{profil.c1} C2:{profil.c2} C3:{profil.c3}
                                   </div>
                                   <div className="text-[10px] text-muted-foreground">
                                     C4:{profil.c4} C5:{profil.c5} | {profil.tendance}
                                   </div>
                                 </div>
                               ) : (
                                 <span className="text-xs text-gray-400">—</span>
                               )}
                             </td>
                             
                             {/* Domaines/Sous-domaines */}
                             <td>
                               <div className="space-y-1">
                                 {prop._domainesPrioritaires && prop._domainesPrioritaires.length > 0 ? (
                                   <div className="flex flex-wrap gap-1">
                                     {prop._domainesPrioritaires.map((d, i) => (
                                       <span key={i} className={`badge text-[9px] ${d.score < 30 ? 'danger' : d.score < 60 ? 'warning' : 'primary'}`}
                                             title={d.raison}>
                                         {d.domaine}
                                       </span>
                                     ))}
                                   </div>
                                 ) : null}
                                 <div className="flex flex-wrap gap-1">
                                   {(prop.portee ?? []).slice(0, 3).map((d) => (
                                     <span key={d} className="badge neutral text-[9px]">{d}</span>
                                   ))}
                                 </div>
                               </div>
                             </td>
                             
                             {/* Type */}
                             <td className="text-small text-muted-foreground capitalize">
                               <span className={`badge outline text-xs`}>
                                 {prop.type?.replace(/_/g, ' ')}
                               </span>
                             </td>
                             
                             {/* Fréquence */}
                             <td className="text-xs text-foreground">
                               {prop._frequenceSuggerer ? (
                                 <div>
                                   <div className="font-medium">{prop._frequenceSuggerer.label}</div>
                                   <div className="text-[10px] text-muted-foreground">{prop._frequenceSuggerer.valeur}x/an</div>
                                 </div>
                               ) : '—'}
                             </td>
                             
                             {/* Dates */}
                             <td className="text-xs text-foreground">
                               <div>{prop.date_debut ? formatDate(prop.date_debut) : '—'}</div>
                               <div className="text-[10px] text-muted-foreground">
                                 au {prop.date_fin ? formatDate(prop.date_fin) : '—'}
                               </div>
                             </td>
                             
                             {/* Équipe suggérée */}
                             <td>
                               {prop._equipeSuggerer && prop._equipeSuggerer.length > 0 ? (
                                 <div className="space-y-1">
                                   {prop._equipeSuggerer.map((m, i) => (
                                     <div key={i} className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full">
                                       {m.prenom} {m.nom}
                                     </div>
                                   ))}
                                 </div>
                               ) : (
                                 <span className="text-xs text-gray-400">—</span>
                               )}
                             </td>
                             
                             {/* Justification */}
                             <td className="text-[10px] text-muted-foreground max-w-[150px]">
                               {profil ? (
                                 <div>
                                   Score: {profil.score_global}/100
                                   {profil.tendance === 'baisse' && ' (tendance ↓)'}
                                   {prop._domainesPrioritaires && prop._domainesPrioritaires.length > 0 && (
                                     <div>Domaines: {prop._domainesPrioritaires.map(d => d.domaine).join(', ')}</div>
                                   )}
                                 </div>
                               ) : '—'}
                             </td>
                             
                             {/* Feedback */}
                             <td onClick={(e) => e.stopPropagation()}>
                               <div className="flex gap-1">
                                 <button
                                   className="action-button text-success"
                                   onClick={() => {
                                     learningEngine.recordLearningFeedback(
                                       prop.aerodrome_id || '',
                                       prop.portee?.[0] || 'SGS',
                                       '',
                                       `planning-${idx}`,
                                       'SA',
                                       85,
                                       'SA',
                                       'Validé par inspecteur'
                                     );
                                     toggleSelection(idx);
                                   }}
                                   title="Valider cette proposition (feedback positif)"
                                 >
                                   <CheckCircle2 className="w-3 h-3" />
                                 </button>
                                 <button
                                   className="action-button text-danger"
                                   onClick={() => {
                                     learningEngine.recordLearningFeedback(
                                       prop.aerodrome_id || '',
                                       prop.portee?.[0] || 'SGS',
                                       '',
                                       `planning-${idx}`,
                                       'NA',
                                       85,
                                       'NA',
                                       'Refusé par inspecteur'
                                     );
                                     const next = new Set(selected);
                                     next.delete(idx);
                                     setSelected(next);
                                   }}
                                   title="Refuser cette proposition (feedback négatif)"
                                 >
                                   <XCircle className="w-3 h-3" />
                                 </button>
                               </div>
                             </td>
                           </tr>
                          
                             {/* Ligne de détails avec justification complète */}
                             {showDetail && (
                               <tr className="bg-role-primary-soft/30">
                                 <td colSpan={10} className="p-3">
                                   <div className="text-sm space-y-2">
                                     <div className="flex items-center gap-2 mb-2">
                                       <Info className="w-4 h-4 text-role-primary" />
                                       <span className="font-semibold">Détails de la proposition</span>
                                     </div>
                                     {profil && (
                                       <div className="grid grid-cols-2 gap-4 text-xs">
                                         <div>
                                           <strong>Profil de risque:</strong>
                                           <div>Score global: {profil.score_global}/100</div>
                                           <div>C1 (SGS): {profil.c1} | C2 (PAC): {profil.c2}</div>
                                           <div>C3 (PHY/OPS): {profil.c3} | C4 (Écarts): {profil.c4}</div>
                                           <div>C5 (SLI): {profil.c5} | Tendance: {profil.tendance}</div>
                                         </div>
                                         <div>
                                           <strong>Justification:</strong>
                                           <div>{prop._domainesPrioritaires?.map(d => `${d.domaine} (score ${d.score}: ${d.raison})`).join('; ')}</div>
                                           <div className="mt-1">FrÃ©quence: {prop._frequenceSuggerer?.label} ({prop._frequenceSuggerer?.valeur}x/an)</div>
                                           {aDesExemptions && (
                                             <div className="text-warning mt-1">
                                               {nbExemptions} exemption(s) active(s)
                                               {aDesMesuresEnRetard && ' - Mesures en retard!'}
                                             </div>
                                           )}
                                         </div>
                                       </div>
                                     )}
                                   </div>
                                 </td>
                               </tr>
                             )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

           {/* Légende */}
           <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
             <div className="flex items-center gap-1">
               <div className="w-3 h-3 rounded-full bg-danger" />
               <span>Score &lt; 30 (Critique)</span>
             </div>
             <div className="flex items-center gap-1">
               <div className="w-3 h-3 rounded-full bg-warning" />
               <span>Score 30-59 (ModÃ©rÃ©)</span>
             </div>
             <div className="flex items-center gap-1">
               <div className="w-3 h-3 rounded-full bg-primary" />
               <span>Score 60-79 (Bon)</span>
             </div>
             <div className="flex items-center gap-1">
               <div className="w-3 h-3 rounded-full bg-success" />
               <span>Score ≥ 80 (Excellent)</span>
             </div>
             <div className="flex items-center gap-1">
               <AlertTriangle className="w-3 h-3 text-warning" />
               <span>Conflit détecté</span>
             </div>
             <div className="flex items-center gap-1">
               <Shield className="w-3 h-3 text-warning" />
               <span>Exemption active</span>
             </div>
           </div>

          <div className="flex justify-end gap-3">
            {onClose && (
              <button onClick={onClose} className="btn btn-secondary">
                Fermer
              </button>
            )}
            <button
              onClick={handleValider}
              disabled={selected.size === 0 || validating || validated}
              className="btn btn-primary gap-2"
            >
              {validating ? 'Validation...' : `Valider les ${selected.size} proposition${selected.size > 1 ? 's' : ''} sélectionnée${selected.size > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlanningNPlus1;