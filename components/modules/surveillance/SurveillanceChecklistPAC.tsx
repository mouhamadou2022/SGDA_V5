// components/modules/surveillance/SurveillanceChecklistPAC.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import {
  Save,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  PenLine,
  Eye,
  Calendar,
  Users,
  MapPin,
  Edit3,
  Check,
  X,
  ChevronDown,
  Trash2,
  Camera,
  Info,
  Sparkles,
  Brain,
  Wifi,
  WifiOff,
  ClipboardList,
  Shield,
  TrendingUp,
  Sliders,
  UserCheck,
  Clock,
  AlertTriangle,
  Zap,
  Upload,
} from 'lucide-react';
import { FileUploader } from '@/components/ui/FileUploader';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { DomaineCode, getDomaineInfo, getDomaineLabel, getDomaineCode, grouperParDomaine, DomaineItems } from '@/lib/domaines';
import { EvaluationAction, computeEvaluationActionScore, EcartClosureStatus, computeEcartClosureStatus } from '@/types/checklist';
import { getCellColor } from '@/lib/risque';
import { isEcartProcessusActif } from '@/lib/processus/isEcartProcessusActif';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// Types unifiés
export type ResultatItem = 'SA' | 'NS' | 'NV';
export type ItemType = 'action_pac' | 'mesure_atténuation';

export interface Preuve {
  id: string;
  nom: string;
  url: string;
  dateUpload: string;
}

export interface ItemVerification {
  id: string;
  type: ItemType;
  domaine?: DomaineCode;
  
  // Données originales
  source_id: string;
  reference: string;
  description: string;
  responsable: string;
  date_prevue: string;
  livrables?: string[];
  statut_origine: string;
  exemption_id?: string;
  
  // Évaluation terrain
  resultat?: ResultatItem;
  observation?: string;
  preuves?: Preuve[];
  ordre: number;
  
  // Pour PAC : prédiction SA/NS
  prediction?: 'SA' | 'NS' | 'NV';
  confiance?: number;
  justification?: string;
  prefill?: boolean;
  alerte?: boolean;
  
  // Pour mesure : suggestion d'efficacité
  efficacite_suggeree?: number;
  impact_c3_suggere?: number;
  efficacite_validee?: number;
  commentaire_feedback?: string;
  
  // Données écart source (rappel inspecteur)
  ecart_libelle?: string;
  ecart_niveau_risque?: string;
  ecart_cellule_oaci?: string;
  
  // Risque résiduel évalué par l'inspecteur
  risque_residuel?: string;
  risque_residuel_oaci?: string;
  
  // Évaluation 6 critères terrain (PAC uniquement)
  evaluation_action?: EvaluationAction;
}

export interface ChecklistMixteData {
  id: string;
  aerodrome_id: string;
  aerodrome_nom: string;
  items: ItemVerification[];
  observations_generales: string;
  progression: number;
  isSigned: boolean;
  exemptions_actives?: { id: string; reference: string }[];
  ecart_concerne?: { id: string; reference: string; libelle: string; niveau: string };
}

export const RESULTAT_LABELS = {
  SA: { label: 'Satisfaisant', variant: 'success', icon: CheckCircle, color: 'bg-success/20 text-success-800 border-success', short: 'SA' },
  NS: { label: 'Non satisfaisant', variant: 'danger', icon: XCircle, color: 'bg-danger/20 text-danger-800 border-danger', short: 'NS' },
  NV: { label: 'Non vérifié', variant: 'warning', icon: AlertCircle, color: 'bg-warning/20 text-warning-800 border-warning', short: 'NV' },
};

// Indicateur de confiance
function ConfidenceIndicator({ confiance }: { confiance: number }) {
  let color = 'bg-gray-200';
  if (confiance >= 85) color = 'bg-success';
  else if (confiance >= 70) color = 'bg-primary';
  else if (confiance >= 50) color = 'bg-warning';
  else if (confiance >= 30) color = 'bg-orange-400';
  else color = 'bg-danger';
  
  return (
    <div className="flex items-center gap-1" title={`Confiance: ${confiance}%`}>
      <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`progress-fill ${color}`} style={{ '--pf': confiance } as React.CSSProperties} />
      </div>
      <span className="text-[9px] text-muted-foreground">{confiance}%</span>
    </div>
  );
}

// Bouton info pour suggestion
function SuggestionInfoButton({ justification, confiance, type }: { justification: string; confiance: number; type: ItemType }) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowPopup(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const title = type === 'action_pac' ? 'Pourquoi cette prédiction ?' : 'Pourquoi cette efficacité ?';
  
  return (
    <div className="relative inline-block" ref={popupRef}>
      <button
        type="button"
        onClick={() => setShowPopup(!showPopup)}
        className="btn btn-sm px-3 py-1 btn-ghost p-0 h-5 w-5 text-blue-600"
        title={title}
      >
        <Info className="w-3 h-3" />
      </button>
      {showPopup && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 bg-background border border-border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-xs font-semibold">{title}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{justification}</p>
          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
            Confiance: {confiance}%
          </div>
        </div>
      )}
    </div>
  );
}

// Curseur d'efficacité pour les mesures
function EfficaciteSlider({
  valeur,
  onChange,
  impactC3,
}: {
  valeur: number;
  onChange: (value: number) => void;
  impactC3?: number;
}) {
  const impactReel = Math.round((valeur / 100) * (impactC3 || 20));
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Efficacité estimée</span>
        <span className="text-sm font-semibold text-role-primary">{valeur}%</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={valeur}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full accent-role-primary"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Inefficace</span>
        <span>Peu efficace</span>
        <span>Modérément efficace</span>
        <span>Très efficace</span>
      </div>
      {impactC3 !== undefined && (
        <div className="flex items-center gap-2 mt-2 p-2 bg-role-primary-soft rounded-lg">
          <TrendingUp className="w-3 h-3 text-role-primary" />
          <span className="text-xs">
            Impact potentiel sur C3: <strong>+{impactReel} points</strong>
          </span>
        </div>
      )}
    </div>
  );
}

// Modal preuve (copie du design SuiviEcarts)
function PreuveModal({ isOpen, onClose, itemRef, preuves, onAdd, onRemove }: {
  isOpen: boolean; onClose: () => void; itemRef: string;
  preuves: Preuve[]; onAdd: (p: Preuve) => void; onRemove: (id: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [file, setFile] = useState<File | null>(null);
  if (!isOpen) return null;

  const handleAdd = () => {
    if (!file) return;
    onAdd({ id: `pf-${Date.now()}`, nom: nom.trim() || file.name, url: URL.createObjectURL(file), dateUpload: new Date().toISOString() });
    setNom(''); setFile(null);
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header">
            <div className="modal-title flex items-center gap-2">
              <FileText className="w-4 h-4 text-role-primary" />
              Preuves — <span className="font-mono font-bold text-role-primary">{itemRef}</span>
            </div>
            <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
          <div className="modal-body p-4 space-y-3">
            {preuves.length > 0 && (
              <div className="mb-3">
                <p className="text-[12px] font-semibold text-muted-foreground mb-1.5">{preuves.length} preuve(s)</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {preuves.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-border">
                      <div className="w-7 h-7 rounded bg-role-gradient flex items-center justify-center flex-shrink-0">
                        <FileText className="w-3.5 h-3.5 text-white" />
                      </div>
                      <p className="flex-1 text-[12px] font-medium truncate">{p.nom}</p>
                      <button onClick={() => window.open(p.url, '_blank')} className="btn btn-sm px-1.5 py-1 btn-ghost"><Eye className="w-3 h-3" /></button>
                      <button onClick={() => onRemove(p.id)} className="btn btn-sm px-1.5 py-1 btn-ghost text-red-600"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="border border-border rounded-lg p-3 bg-gray-50 space-y-2">
              <p className="text-[12px] font-semibold flex items-center gap-1"><Upload className="w-3.5 h-3.5 text-role-primary" /> Ajouter une preuve</p>
              <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom de la preuve…" className="form-input w-full text-xs" />
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => { const f = e.target.files?.[0] || null; setFile(f); if (f && !nom) setNom(f.name); }} className="form-input w-full text-xs" />
              <button type="button" onClick={handleAdd} disabled={!file}
                className={`btn btn-sm w-full gap-1.5 ${!file ? 'opacity-50 cursor-not-allowed' : 'btn-primary'}`}>
                <Upload className="w-3 h-3" /> Ajouter
              </button>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm btn-primary px-4" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Carte d'item (PAC ou Mesure)
function ItemCard({
  item,
  index,
  readOnly,
  onUpdate,
  onAddFile,
  onDeleteFile,
  onValidateEfficacite,
}: {
  item: ItemVerification;
  index: number;
  readOnly: boolean;
  onUpdate: (item: ItemVerification) => void;
  onAddFile: (itemId: string, file: Preuve) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
  onValidateEfficacite?: (itemId: string, efficacite: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [observation, setObservation] = useState(item.observation || '');
  const [selectedResultat, setSelectedResultat] = useState<ResultatItem>(item.resultat || 'NV');
  const [risqueResiduel, setRisqueResiduel] = useState(item.risque_residuel || '');
  const initialOACI = item.risque_residuel_oaci || item.ecart_cellule_oaci || '';
  const [risqueResiduelOACI, setRisqueResiduelOACI] = useState(/^[1-5][A-E]$/.test(initialOACI) ? initialOACI : '');
  const [oaciEditing, setOaciEditing] = useState(false);
  const [efficaciteTemp, setEfficaciteTemp] = useState(item.efficacite_validee || item.efficacite_suggeree || 70);
  const [showEfficaciteSlider, setShowEfficaciteSlider] = useState(false);
  const [preuveOpen, setPreuveOpen] = useState(false);
  const [preuveWarning, setPreuveWarning] = useState<'SA' | 'NV' | null>(null);
  const [criteriaState, setCriteriaState] = useState<Omit<EvaluationAction, 'score' | 'decision'>>({
    realisation: item.evaluation_action?.realisation ?? null,
    conformitePAC: item.evaluation_action?.conformitePAC ?? null,
    efficacite: item.evaluation_action?.efficacite ?? null,
    perennite: item.evaluation_action?.perennite ?? null,
    preuves: item.evaluation_action?.preuves ?? null,
    effetsSecondaires: item.evaluation_action?.effetsSecondaires ?? null,
    observation: item.evaluation_action?.observation || '',
  });
  
  const isPAC = item.type === 'action_pac';
  const isMesure = item.type === 'mesure_atténuation';
  const hasPrediction = isPAC && item.prediction && !item.resultat;
  const isPrefilled = item.prefill === true;
  const isAlerte = item.alerte === true;
  
  const criteriaScore = useMemo(() => computeEvaluationActionScore(criteriaState), [criteriaState]);
  
  // Auto-sauvegarde évaluation dès qu'un critère change
  useEffect(() => {
    onUpdate({ ...item, evaluation_action: { ...criteriaState, ...criteriaScore } });
  }, [criteriaScore.score]);

  const handleCriteriaToggle = (key: keyof Omit<EvaluationAction, 'score' | 'decision'>, value: boolean) => {
    setCriteriaState(prev => ({ ...prev, [key]: prev[key] === value ? null : value }));
  };
  
  const getEcheanceClass = () => {
    const echeance = new Date(item.date_prevue);
    const aujourdhui = new Date();
    const diffJours = Math.ceil((echeance.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    if (diffJours < 0) return 'text-danger';
    if (diffJours < 7) return 'text-warning';
    return 'text-muted-foreground';
  };
  
  const handleResultatChange = (resultat: ResultatItem) => {
    if ((resultat === 'SA' || resultat === 'NV') && (!item.preuves || item.preuves.length === 0)) {
      setPreuveWarning(resultat);
      setPreuveOpen(true);
      return;
    }
    setPreuveWarning(null);
    setSelectedResultat(resultat);
    if (resultat === 'NS') {
      const reset = { conformitePAC: null as boolean | null, efficacite: null as boolean | null, perennite: null as boolean | null, preuves: null as boolean | null, effetsSecondaires: null as boolean | null };
      setCriteriaState(prev => ({ ...prev, realisation: false, ...reset, observation: '' }));
    } else if (resultat === 'SA') {
      setCriteriaState(prev => ({ ...prev, realisation: true }));
    }
    onUpdate({ ...item, resultat });
  };
  
  const handleRisqueResiduelChange = (niveau: string) => {
    setRisqueResiduel(niveau);
    onUpdate({ ...item, risque_residuel: niveau });
  };
  
  const handleRisqueResiduelOACIChange = (val: string) => {
    const upper = val.toUpperCase().replace(/[^A-E1-5]/g, '').slice(0, 2);
    setRisqueResiduelOACI(upper);
    onUpdate({ ...item, risque_residuel_oaci: upper });
  };
  
  const coherenceOk = criteriaScore.decision === 'non_evaluee' || !risqueResiduel ? null
    : (criteriaScore.score >= 75 && (risqueResiduel === 'eleve' || risqueResiduel === 'critique')) ? false
    : (criteriaScore.score < 75 && risqueResiduel === 'faible') ? false
    : true;
  
  const handleObservationChange = (obs: string) => {
    setObservation(obs);
    onUpdate({ ...item, observation: obs });
  };
  
  const handleEfficaciteChange = (value: number) => {
    setEfficaciteTemp(value);
  };
  
  const handleValidateEfficacite = () => {
    if (onValidateEfficacite) {
      onValidateEfficacite(item.id, efficaciteTemp);
      onUpdate({ ...item, efficacite_validee: efficaciteTemp });
    }
    setShowEfficaciteSlider(false);
  };
  
  const currentResultat = item.resultat || 'NV';
  const resultatConfig = RESULTAT_LABELS[currentResultat];
  const ResultatIcon = resultatConfig.icon;
  
  return (
    <div className={`card border-border mb-3 overflow-hidden ${isAlerte ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-role-primary'}`}>
      {/* En-tête */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-role-primary/5 to-transparent cursor-pointer hover:bg-role-primary-soft transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-6 rounded-md text-[11px] font-bold bg-blue-900 text-white">{getDomaineCode(item.domaine || 'SGS')}</span>
          <span className="text-[12px] font-medium text-foreground">{getDomaineLabel(getDomaineCode(item.domaine || 'SGS'))}</span>
          <span className="code-oaci-badge text-[12px]">{item.reference}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${currentResultat === 'SA' ? 'badge success' : currentResultat === 'NS' ? 'badge danger' : 'badge warning'}`}>
            {currentResultat}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">{isPAC ? `Action ${index + 1}` : `Mesure ${index + 1}`}</span>
          {isPAC && item.evaluation_action && item.evaluation_action.decision !== 'non_evaluee' && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${item.evaluation_action.decision === 'validee' ? 'bg-success/20 text-success border-success' : item.evaluation_action.decision === 'partielle' ? 'bg-warning/20 text-warning border-warning' : 'bg-danger/20 text-danger border-danger'}`}>
              {item.evaluation_action.score}%
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Rappel écart source : libellé + risque + OACI */}
      {isPAC && item.ecart_libelle && (
        <div className={`px-3 py-1.5 ${item.ecart_niveau_risque === 'critique' ? 'bg-gradient-to-r from-red-50 to-red-100 border-red-200' : item.ecart_niveau_risque === 'eleve' ? 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200' : item.ecart_niveau_risque === 'moyen' ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200' : 'bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200'} border-b flex items-center gap-3 flex-wrap`}>
          <span className={`text-[12px] font-medium ${item.ecart_niveau_risque === 'critique' ? 'text-red-900' : item.ecart_niveau_risque === 'eleve' ? 'text-amber-900' : item.ecart_niveau_risque === 'moyen' ? 'text-blue-900' : 'text-emerald-900'}`}>Écart : {item.ecart_libelle}</span>
          {item.ecart_niveau_risque && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${item.ecart_niveau_risque === 'critique' ? 'badge danger animate-pulse' : item.ecart_niveau_risque === 'eleve' ? 'badge warning' : item.ecart_niveau_risque === 'moyen' ? 'badge primary' : 'badge success'}`}>
              {item.ecart_niveau_risque}
            </span>
          )}
          {item.ecart_cellule_oaci && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${getCellColor(item.ecart_cellule_oaci)}`}>
              {item.ecart_cellule_oaci}
            </span>
          )}
        </div>
      )}

      {isExpanded && (
        <div className="bg-gray-50/70">
          {/* Table 4 colonnes : Action corrective | Preuve | État | Observation */}
          <div className="border border-blue-100 rounded-lg mx-3 my-2 overflow-hidden">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-blue-50 border-b border-blue-200">
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[35%]">Action corrective</th>
                  <th className="p-1.5 text-center text-[11px] font-bold text-foreground border-r border-blue-100 w-32 min-w-[7rem] max-w-[9rem]">Preuve</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[20%]">État</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground w-[25%]">Observation</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-blue-100">
                  <td className="p-1.5 border-r border-blue-100 align-top">
                    <div className="flex flex-col gap-1">
                      <span className="text-[12px] text-foreground font-medium">{item.description}</span>
                      <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                        <span>Responsable : {item.responsable}</span>
                        <span className={getEcheanceClass()}>Échéance : {new Date(item.date_prevue).toLocaleDateString('fr-FR')}</span>
                      </div>
                      {item.livrables && item.livrables.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.livrables.map((l, i) => (
                            <span key={i} className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600">{l}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-1.5 text-center border-r border-blue-100 w-32 min-w-[7rem] max-w-[9rem] align-middle">
                    <button type="button" onClick={() => setPreuveOpen(true)}
                      className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 w-full justify-center">
                      <FileText className="w-3.5 h-3.5" />
                      {item.preuves && item.preuves.length > 0 ? (
                        <div className="flex flex-col items-center gap-0.5 w-full">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-[11px] font-bold text-primary">{item.preuves.length}</span>
                          {item.preuves.slice(0, 2).map(p => (
                            <span key={p.id} className="text-[9px] text-primary truncate max-w-[90px] text-center">{p.nom}</span>
                          ))}
                          {item.preuves.length > 2 && <span className="text-[9px] text-muted-foreground">+{item.preuves.length - 2}</span>}
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-400">Ajouter</span>
                      )}
                    </button>
                  </td>
                  <td className="p-1.5 border-r border-blue-100 align-top">
                    <div className="flex flex-col gap-1">
                      {!readOnly ? (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => handleResultatChange('SA')}
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${selectedResultat === 'SA' ? 'bg-success text-white border-success' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Réalisée</button>
                          <button type="button" onClick={() => handleResultatChange('NS')}
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${selectedResultat === 'NS' ? 'bg-danger text-white border-danger' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Non réalisée</button>
                          <button type="button" onClick={() => handleResultatChange('NV')}
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${selectedResultat === 'NV' ? 'bg-warning text-white border-warning' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>En cours</button>
                        </div>
                      ) : (
                        <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold border ${selectedResultat === 'SA' ? 'bg-success text-white border-success' : selectedResultat === 'NS' ? 'bg-danger text-white border-danger' : 'bg-warning text-white border-warning'}`}>
                          {selectedResultat === 'SA' ? 'Réalisée' : selectedResultat === 'NS' ? 'Non réalisée' : 'En cours'}
                        </span>
                      )}
                      {preuveWarning && (
                        <p className="text-[10px] text-danger flex items-center gap-1 mt-1">
                          <AlertTriangle className="w-3 h-3" /> Preuve requise avant de passer en "{preuveWarning === 'SA' ? 'Réalisée' : 'En cours'}"
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-1.5 align-top">
                    <textarea value={observation} onChange={e => handleObservationChange(e.target.value)}
                      placeholder="Observation terrain..." rows={2} disabled={readOnly}
                      className="form-textarea w-full text-[13px] resize-none" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Prédiction système (compact) */}
          {!readOnly && !item.resultat && isPAC && item.prediction && (
            <div className="mx-3 mb-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 text-[11px]">
                <Brain className="w-3 h-3 text-primary" />
                <span className="font-medium text-primary">
                  Prédiction : {item.prediction === 'SA' ? 'Satisfaisant (SA)' : 'Non satisfaisant (NS)'}
                </span>
                <ConfidenceIndicator confiance={item.confiance || 0} />
                <SuggestionInfoButton
                  justification={item.justification || 'Basé sur l\'historique'}
                  confiance={item.confiance || 0}
                  type="action_pac"
                />
              </div>
            </div>
          )}

          {/* Mesure d'atténuation - efficacité (compact) */}
          {!readOnly && !item.resultat && isMesure && (
            <div className="mx-3 mb-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 text-[11px]">
                <TrendingUp className="w-3 h-3 text-primary" />
                <span>Efficacité estimée : <strong>{item.efficacite_suggeree || 70}%</strong></span>
                <SuggestionInfoButton
                  justification={item.justification || 'Calculé sur l\'impact potentiel'}
                  confiance={item.confiance || 70}
                  type="mesure_atténuation"
                />
                {!showEfficaciteSlider ? (
                  <button type="button" onClick={() => setShowEfficaciteSlider(true)}
                    className="btn btn-sm px-2 py-0.5 btn-primary text-[10px]">
                    Ajuster
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <EfficaciteSlider valeur={efficaciteTemp} onChange={handleEfficaciteChange} impactC3={item.impact_c3_suggere} />
                    <button type="button" onClick={handleValidateEfficacite}
                      className="btn btn-sm px-2 py-0.5 btn-primary text-[10px]">
                      <Check className="w-3 h-3" /> Valider
                    </button>
                    <button type="button" onClick={() => setShowEfficaciteSlider(false)}
                      className="btn btn-sm px-2 py-0.5 btn-secondary text-[10px]">Annuler</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Évaluation 6 critères */}
          {isPAC && (
            <div className="mx-3 mb-2">
              <p className="text-[12px] font-semibold text-muted-foreground mb-1">Évaluation des critères</p>
              <div className="border border-blue-100 rounded-lg overflow-hidden">
                <div className="grid grid-cols-6">
                  {([
                    { key: 'realisation' as const, label: 'Réalisation', question: 'L\'action a-t-elle été physiquement mise en œuvre ?' },
                    { key: 'conformitePAC' as const, label: 'Conformité', question: 'Correspond-elle au PAC ?' },
                    { key: 'efficacite' as const, label: 'Efficacité', question: 'Le problème est-il résolu ?' },
                    { key: 'perennite' as const, label: 'Pérennité', question: 'Correctif durable ?' },
                    { key: 'preuves' as const, label: 'Preuves', question: 'Livrables vérifiables ?' },
                    { key: 'effetsSecondaires' as const, label: 'Effets second.', question: 'Aucun nouvel écart ?' },
                  ] as const).map(({ key, label, question }) => {
                    const value = criteriaState[key];
                    return (
                      <div key={key} className="p-1.5 border-r border-blue-100 last:border-r-0 border-b border-blue-100">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-[10px] font-bold text-foreground text-center truncate w-full" title={question}>{label}</span>
                          {!readOnly ? (
                            <div className="flex gap-0.5">
                              <button type="button" onClick={() => handleCriteriaToggle(key, true)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${value === true ? 'bg-success text-white border-success' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Oui</button>
                              <button type="button" onClick={() => handleCriteriaToggle(key, false)}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${value === false ? 'bg-danger text-white border-danger' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Non</button>
                            </div>
                          ) : (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${value === true ? 'bg-success text-white border-success' : value === false ? 'bg-danger text-white border-danger' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                              {value === true ? 'Oui' : value === false ? 'Non' : '—'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Score + décision */}
              <div className="flex items-center gap-3 mt-1.5 p-2 bg-white rounded-lg border border-blue-100">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">Score :</span>
                  <span className={`text-[13px] font-bold ${criteriaScore.decision === 'validee' ? 'text-success' : criteriaScore.decision === 'partielle' ? 'text-warning' : criteriaScore.decision === 'non_validee' ? 'text-danger' : 'text-gray-400'}`}>
                    {criteriaScore.score}%
                  </span>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${criteriaScore.decision === 'validee' ? 'bg-success/20 text-success border-success' : criteriaScore.decision === 'partielle' ? 'bg-warning/20 text-warning border-warning' : criteriaScore.decision === 'non_validee' ? 'bg-danger/20 text-danger border-danger' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                  {criteriaScore.decision === 'validee' ? 'Validée' : criteriaScore.decision === 'partielle' ? 'Partielle' : criteriaScore.decision === 'non_validee' ? 'Non validée' : 'Non évaluée'}
                </span>
                {/* Conclusion */}
                {criteriaScore.decision !== 'non_evaluee' && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[11px] font-semibold text-muted-foreground">Conclusion :</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${criteriaScore.score >= 75 ? 'bg-success text-white border-success' : 'bg-danger text-white border-danger'}`}>
                      {criteriaScore.score >= 75 ? 'SA' : 'NS'}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${criteriaScore.score >= 75 ? 'bg-success/20 text-success border-success' : criteriaScore.score >= 25 ? 'bg-warning/20 text-warning border-warning' : 'bg-danger/20 text-danger border-danger'}`}>
                      {criteriaScore.score >= 75 ? '100%' : criteriaScore.score >= 25 ? '75%' : criteriaScore.score > 0 ? '25%' : '0%'}
                    </span>
                  </div>
                )}
              </div>
              {/* Risque résiduel */}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">Risque résiduel :</span>
                <div className="flex gap-1">
                  {['faible', 'moyen', 'eleve', 'critique'].map(niveau => (
                    <button key={niveau} type="button"
                      onClick={() => !readOnly && handleRisqueResiduelChange(risqueResiduel === niveau ? '' : niveau)}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${risqueResiduel === niveau
                        ? (niveau === 'critique' ? 'badge danger animate-pulse' : niveau === 'eleve' ? 'badge warning' : niveau === 'moyen' ? 'badge primary' : 'badge success')
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>
                      {niveau === 'eleve' ? 'Élevé' : niveau.charAt(0).toUpperCase() + niveau.slice(1)}
                    </button>
                  ))}
                </div>
                {risqueResiduel && (
                  oaciEditing ? (
                    <input type="text" value={risqueResiduelOACI} onChange={e => handleRisqueResiduelOACIChange(e.target.value)}
                      onBlur={() => setOaciEditing(false)} autoFocus maxLength={2} disabled={readOnly}
                      className="w-14 text-center text-[11px] font-bold border border-blue-300 rounded bg-white px-1 py-0.5" />
                  ) : (
                    <button type="button" onClick={() => !readOnly && setOaciEditing(true)}
                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold border min-w-[2.5rem] ${!/^[1-5][A-E]$/.test(risqueResiduelOACI) ? 'bg-gray-100 text-gray-400 border-gray-200' : getCellColor(risqueResiduelOACI)}`}>
                      {/^[1-5][A-E]$/.test(risqueResiduelOACI) ? risqueResiduelOACI : '—'}
                    </button>
                  )
                )}
                {coherenceOk === false && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-danger" title="Incohérent avec l'évaluation">
                    <AlertTriangle className="w-3 h-3" /> Incohérent
                  </span>
                )}
                {coherenceOk === true && risqueResiduel && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-success">
                    <Check className="w-3 h-3" /> Cohérent
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal preuve */}
      {!readOnly && (
        <PreuveModal
          isOpen={preuveOpen}
          onClose={() => setPreuveOpen(false)}
          itemRef={item.reference}
          preuves={item.preuves || []}
          onAdd={(p) => onAddFile(item.id, p)}
          onRemove={(id) => onDeleteFile(item.id, id)}
        />
      )}
    </div>
  );
}

// Bandeau de suggestions batch
function SuggestionsBanner({
  suggestions,
  onAcceptAll,
  onIgnore,
  type,
}: {
  suggestions: { itemId: string; description: string; justification: string; confiance: number }[];
  onAcceptAll: () => void;
  onIgnore: () => void;
  type: ItemType;
}) {
  const [expanded, setExpanded] = useState(true);
  const [accepted, setAccepted] = useState<string[]>([]);
  
  if (suggestions.length === 0) return null;
  
  const remainingSuggestions = suggestions.filter(s => !accepted.includes(s.itemId));
  
  if (remainingSuggestions.length === 0) return null;
  
  const title = type === 'action_pac' ? 'Prédictions intelligentes' : 'Suggestions d\'efficacité';
  
  return (
    <Card variant="role" className="bg-primary/5 mb-4">
      <button
        className="w-full flex items-center justify-between p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">{title} ({remainingSuggestions.length})</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">Basées sur historique</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onAcceptAll(); }}
            className="btn btn-sm px-3 py-1 btn-primary"
          >
            <Zap className="w-3 h-3" />
            Accepter tout
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onIgnore(); }}
            className="btn btn-sm px-3 py-1 btn-secondary"
          >
            Ignorer
          </button>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      
      {expanded && (
        <div className="p-4 pt-0 space-y-2">
          {remainingSuggestions.map(suggestion => (
            <div key={suggestion.itemId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 flex-1">
                <span className="text-sm font-medium">{suggestion.description.substring(0, 60)}...</span>
                <ConfidenceIndicator confiance={suggestion.confiance} />
              </div>
              <button
                onClick={() => {
                  setAccepted(prev => [...prev, suggestion.itemId]);
                }}
                className="btn btn-sm px-3 py-1 btn-primary"
              >
                <Check className="w-3 h-3" />
                Appliquer
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Modal observations générales
function GeneralObservationsModal({
  isOpen,
  onClose,
  observations,
  onSave,
  readOnly,
}: {
  isOpen: boolean;
  onClose: () => void;
  observations: string;
  onSave: (observations: string) => void;
  readOnly: boolean;
}) {
  const [tempObservations, setTempObservations] = useState(observations);
  
  useEffect(() => {
    setTempObservations(observations);
  }, [observations]);
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title">
              <FileText className="w-5 h-5 text-role-primary" />
              Observations générales
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="modal-body p-5">
            <textarea
              value={tempObservations}
              onChange={(e) => setTempObservations(e.target.value)}
              placeholder="Observations générales sur la vérification..."
              rows={6}
              className={`form-textarea w-full ${focusClass}`}
              disabled={readOnly}
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm px-3 py-1 btn-secondary" onClick={onClose}>Annuler</button>
            <button className="btn btn-sm px-3 py-1 btn-primary" onClick={() => { onSave(tempObservations); onClose(); }}>Sauvegarder</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Modal d'évaluation 6 critères pour une action corrective
function EvaluationActionModal({
  isOpen,
  onClose,
  item,
  onSave,
  readOnly,
}: {
  isOpen: boolean;
  onClose: () => void;
  item: ItemVerification | null;
  onSave: (itemId: string, evaluation: EvaluationAction) => void;
  readOnly: boolean;
}) {
  const [criteria, setCriteria] = useState<Omit<EvaluationAction, 'score' | 'decision'>>({
    realisation: null,
    conformitePAC: null,
    efficacite: null,
    perennite: null,
    preuves: null,
    effetsSecondaires: null,
    observation: '',
  });

  useEffect(() => {
    if (item?.evaluation_action) {
      setCriteria({
        realisation: item.evaluation_action.realisation,
        conformitePAC: item.evaluation_action.conformitePAC,
        efficacite: item.evaluation_action.efficacite,
        perennite: item.evaluation_action.perennite,
        preuves: item.evaluation_action.preuves,
        effetsSecondaires: item.evaluation_action.effetsSecondaires,
        observation: item.evaluation_action.observation || '',
      });
    } else {
      setCriteria({
        realisation: null,
        conformitePAC: null,
        efficacite: null,
        perennite: null,
        preuves: null,
        effetsSecondaires: null,
        observation: '',
      });
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const updateCriterion = (key: keyof Omit<EvaluationAction, 'score' | 'decision'>, value: boolean | null) => {
    setCriteria(prev => ({ ...prev, [key]: value }));
  };

  const computed = computeEvaluationActionScore(criteria);

  const criteriaList: { key: keyof Omit<EvaluationAction, 'score' | 'decision' | 'observation'>; label: string; question: string }[] = [
    { key: 'realisation', label: 'Réalisation', question: 'L\'action a-t-elle été physiquement mise en oeuvre ?' },
    { key: 'conformitePAC', label: 'Conformité au PAC', question: 'Correspond-elle à ce qui était planifié ?' },
    { key: 'efficacite', label: 'Efficacité', question: 'Le problème initial est-il résolu ?' },
    { key: 'perennite', label: 'Pérennité', question: 'Est-ce un correctif durable ?' },
    { key: 'preuves', label: 'Preuves', question: 'Les livrables sont-ils présents et vérifiables ?' },
    { key: 'effetsSecondaires', label: 'Absence d\'effets secondaires', question: 'Aucun nouvel écart créé ?' },
  ];

  const getDecisionBadge = () => {
    switch (computed.decision) {
      case 'validee': return { color: 'bg-success text-success-foreground border-success', label: '✅ Action validée', bg: 'bg-success/10' };
      case 'partielle': return { color: 'bg-warning text-warning-foreground border-warning', label: '🟠 Partiellement validée', bg: 'bg-warning/10' };
      case 'non_validee': return { color: 'bg-danger text-danger-foreground border-danger', label: '🔴 Non validée', bg: 'bg-danger/10' };
      default: return { color: 'bg-gray-200 text-gray-700 border-gray-300', label: '⚪ Non évaluée', bg: 'bg-gray-50' };
    }
  };

  const badge = getDecisionBadge();

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title">
              <Shield className="w-5 h-5 text-role-primary" />
              Évaluation terrain — Action corrective
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="modal-body p-5">
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Action à évaluer</p>
              <p className="text-sm font-medium">{item.description}</p>
              {item.responsable && <p className="text-xs text-muted-foreground mt-1">Responsable: {item.responsable}</p>}
            </div>

            <div className="space-y-3">
              {criteriaList.map(({ key, label, question }) => {
                const value = criteria[key];
                return (
                  <div key={key} className="p-3 border border-border rounded-lg">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground">{question}</p>
                      </div>
                      {!readOnly && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => updateCriterion(key, true)}
                            className={`px-3 py-1 rounded text-[12px] font-medium border transition-all ${value === true ? 'bg-success text-success-foreground border-success' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-success/10'}`}
                          >
                            ✅ Oui
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCriterion(key, false)}
                            className={`px-3 py-1 rounded text-[12px] font-medium border transition-all ${value === false ? 'bg-danger text-danger-foreground border-danger' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-danger/10'}`}
                          >
                            ❌ Non
                          </button>
                        </div>
                      )}
                      {readOnly && (
                        <span className={`px-2 py-1 rounded text-[12px] font-medium border ${value === true ? 'bg-success/10 text-success border-success' : value === false ? 'bg-danger/10 text-danger border-danger' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {value === true ? 'Oui' : value === false ? 'Non' : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <label className="text-xs text-muted-foreground mb-1 block">Observation (optionnel)</label>
              <textarea
                value={criteria.observation || ''}
                onChange={(e) => updateCriterion('observation', e.target.value as any)}
                placeholder="Précisez vos observations..."
                rows={2}
                className={`form-textarea w-full text-sm ${focusClass}`}
                disabled={readOnly}
              />
            </div>

            <div className={`mt-4 p-3 rounded-lg border ${badge.bg}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Score</p>
                  <p className="text-2xl font-bold">{computed.score}%</p>
                </div>
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border ${badge.color}`}>
                  {badge.label}
                </span>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm px-3 py-1 btn-secondary" onClick={onClose}>Annuler</button>
            {!readOnly && (
              <button
                className="btn btn-sm px-3 py-1 btn-primary"
                onClick={() => {
                  const result = computeEvaluationActionScore(criteria);
                  onSave(item.id, { ...criteria, ...result });
                  onClose();
                }}
              >
                Enregistrer l'évaluation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Composant principal
export function SurveillanceChecklistPAC({
  surveillanceId,
  aerodromeId,
  onSave,
  onComplete,
  readOnly = false,
  userRole = 'inspector',
}: {
  surveillanceId: string;
  aerodromeId: string;
  onSave?: (data: any) => void;
  onComplete?: () => void;
  readOnly?: boolean;
  userRole?: string;
}) {
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const ecarts = useOptimizedStore(s => s.ecarts);
  const exemptions = useOptimizedStore(s => s.exemptions);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  
  // État principal
  const [checklistData, setChecklistData] = useState<ChecklistMixteData | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [observationsModalOpen, setObservationsModalOpen] = useState(false);
  const [suggestionsPAC, setSuggestionsPAC] = useState<{ itemId: string; description: string; justification: string; confiance: number }[]>([]);
  const [suggestionsMesures, setSuggestionsMesures] = useState<{ itemId: string; description: string; justification: string; confiance: number }[]>([]);
  
  
  // Détection offline
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Trouver les écarts avec PAC accepté sans preuves validées (pas encore clôturé)
  // Exclut les écarts issus de certification/homologation non terminée
  const ecartsPACAcceptes = useMemo(() => {
    return ecarts.filter(e =>
      e.aerodrome_id === aerodromeId &&
      e.pac && e.pac.actions && e.pac.actions.length > 0 &&
      ['pac_accepte', 'preuves_soumises', 'preuves_evaluees'].includes(e.statut) &&
      !isEcartProcessusActif(e.surveillance_id, aerodromeId, certifications, homologations)
    )
  }, [ecarts, aerodromeId, certifications, homologations])
  
  // Trouver les exemptions actives (pour mesures)
  const exemptionsActives = useMemo(() => {
    const now = new Date();
    return (exemptions || []).filter(e => 
      e.aerodrome_id === aerodromeId &&
      e.statut === 'active' &&
      e.date_fin &&
      new Date(e.date_fin) >= now
    );
  }, [exemptions, aerodromeId]);
  
  // Initialisation des items
  useEffect(() => {
    const items: ItemVerification[] = [];
    let itemCounter = 0

    // 1. Ajouter les actions PAC pour tous les écarts avec PAC accepté (sans preuves validées)
    for (const ec of ecartsPACAcceptes) {
      if (!ec.pac?.actions) continue
      ec.pac.actions.forEach((action: any, idx: number) => {
        const datePrevue = new Date(action.date_prevue)
        const estApprocheOuDepasse = !isNaN(datePrevue.getTime()) && datePrevue.getTime() < Date.now() + 30 * 24 * 60 * 60 * 1000
        if (!estApprocheOuDepasse) return

        items.push({
          id: `pac-${Date.now()}-${itemCounter}`,
          type: 'action_pac',
          domaine: (ec as any).domaine as DomaineCode | undefined,
          source_id: `action-${idx}`,
          reference: ec.reference,
          description: action.description,
          responsable: action.responsable,
          date_prevue: action.date_prevue,
          livrables: action.livrables || [],
          statut_origine: action.status || 'planifie',
          ordre: itemCounter++,
          ecart_libelle: ec.libelle,
          ecart_niveau_risque: ec.niveau_risque,
          ecart_cellule_oaci: ec.cellule_risque_oaci,
          prediction: (() => { const d = new Date(action.date_prevue); return (!isNaN(d.getTime()) && d.getTime() < Date.now()) ? 'NS' : 'NV' })(),
          confiance: (() => { const d = new Date(action.date_prevue); return !isNaN(d.getTime()) ? 85 : 40 })(),
          justification: 'Basé sur l\'historique des vérifications précédentes',
        });
      });
    }
    
    // 2. Ajouter les mesures d'atténuation des exemptions actives
    let mesureIdx = 0;
    for (const exemption of exemptionsActives) {
      for (const mesure of exemption.mesures || []) {
        if (mesure.statut !== 'realisee') {
          const dom = (exemption.domaines_concerne || [])[0] as DomaineCode | undefined;
          items.push({
            id: `mesure-${exemption.id}-${mesureIdx}`,
            type: 'mesure_atténuation',
            domaine: dom,
            source_id: mesure.id,
            reference: exemption.reference,
            description: mesure.description,
            responsable: mesure.responsable,
            date_prevue: mesure.date_fin_prevue,
            statut_origine: mesure.statut,
            exemption_id: exemption.id,
            ordre: 100 + mesureIdx,
            efficacite_suggeree: 70,
            impact_c3_suggere: 20,
            justification: 'Mesure corrective standard - impact estimé modéré',
            confiance: 75,
          });
          mesureIdx++;
        }
      }
    }
    
    // Trier par ordre
    items.sort((a, b) => a.ordre - b.ordre);
    
    const totalItems = items.length;
    const itemsVerifies = items.filter(i => i.resultat).length;
    const progression = totalItems > 0 ? Math.round((itemsVerifies / totalItems) * 100) : 0;
    
    setChecklistData({
      id: `checklist-${Date.now()}`,
      aerodrome_id: aerodromeId,
      aerodrome_nom: 'Aérodrome',
      items,
      observations_generales: '',
      progression,
      isSigned: false,
      exemptions_actives: exemptionsActives.map(e => ({ id: e.id, reference: e.reference })),
      ecart_concerne: ecartsPACAcceptes.length > 0 ? { id: ecartsPACAcceptes[0].id, reference: ecartsPACAcceptes[0].reference, libelle: ecartsPACAcceptes[0].libelle, niveau: ecartsPACAcceptes[0].niveau_risque } : undefined,
    });
  }, [ecartsPACAcceptes, exemptionsActives, aerodromeId]);
  
  // Générer les suggestions
  useEffect(() => {
    if (checklistData && !readOnly && !isSigned) {
      const pacSuggestions = checklistData.items
        .filter(item => item.type === 'action_pac' && !item.resultat && item.prediction === 'SA' && (item.confiance || 0) >= 70)
        .map(item => ({
          itemId: item.id,
          description: item.description,
          justification: item.justification || 'Conforme lors des vérifications précédentes',
          confiance: item.confiance || 0,
        }));
      setSuggestionsPAC(pacSuggestions);
      
      const mesuresSuggestions = checklistData.items
        .filter(item => item.type === 'mesure_atténuation' && !item.resultat && (item.efficacite_suggeree || 0) >= 70)
        .map(item => ({
          itemId: item.id,
          description: item.description,
          justification: item.justification || 'Mesure jugée efficace par le système',
          confiance: item.confiance || 70,
        }));
      setSuggestionsMesures(mesuresSuggestions);
    }
  }, [checklistData, readOnly, isSigned]);
  
  // Mettre à jour la progression
  const updateProgression = useCallback((items: ItemVerification[]) => {
    const total = items.length;
    const verifies = items.filter(i => i.resultat).length;
    const progression = total > 0 ? Math.round((verifies / total) * 100) : 0;
    setChecklistData(prev => prev ? { ...prev, items, progression } : null);
  }, []);
  
  // Handlers
  const handleUpdateItem = useCallback((updatedItem: ItemVerification) => {
    setChecklistData(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i => i.id === updatedItem.id ? updatedItem : i);
      updateProgression(newItems);
      return { ...prev, items: newItems };
    });
  }, [updateProgression]);
  
  const handleAddFile = useCallback((itemId: string, file: Preuve) => {
    setChecklistData(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i => 
        i.id === itemId 
          ? { ...i, preuves: [...(i.preuves || []), file] }
          : i
      );
      return { ...prev, items: newItems };
    });
  }, []);
  
  const handleDeleteFile = useCallback((itemId: string, fileId: string) => {
    setChecklistData(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i => 
        i.id === itemId 
          ? { ...i, preuves: i.preuves?.filter(p => p.id !== fileId) || [] }
          : i
      );
      return { ...prev, items: newItems };
    });
  }, []);
  
  const handleValidateEfficacite = useCallback((itemId: string, efficacite: number) => {
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Efficacité validée',
      message: `Efficacité de la mesure enregistrée: ${efficacite}%`,
      canal: 'in_app',
    });
  }, [user, addNotification]);
  
  const handleSaveObservations = useCallback((observations: string) => {
    setChecklistData(prev => prev ? { ...prev, observations_generales: observations } : null);
    setLastSaved(new Date());
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Observations sauvegardées',
      message: 'Les observations générales ont été sauvegardées',
      canal: 'in_app',
    });
  }, [user, addNotification]);
  
  // Auto-save
  useEffect(() => {
    const interval = setInterval(() => {
      if (checklistData && !readOnly && !isSigned) {
        setLastSaved(new Date());
        onSave?.(checklistData);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [checklistData, readOnly, isSigned, onSave]);
  
  // Accepter toutes les suggestions PAC
  const handleAcceptAllSuggestionsPAC = () => {
    setChecklistData(prev => {
      if (!prev) return prev;
      const newItems: ItemVerification[] = prev.items.map(item => {
        const suggestion = suggestionsPAC.find(s => s.itemId === item.id);
        if (suggestion && !item.resultat && item.type === 'action_pac') {
          return { ...item, resultat: 'SA' as const, prefill: true };
        }
        return item;
      });
      updateProgression(newItems);
      return { ...prev, items: newItems };
    });
    setSuggestionsPAC([]);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Prédictions appliquées',
      message: `${suggestionsPAC.length} prédiction(s) appliquée(s)`,
      canal: 'in_app',
    });
  };
  
  // Accepter toutes les suggestions mesures
  const handleAcceptAllSuggestionsMesures = () => {
    setChecklistData(prev => {
      if (!prev) return prev;
      const newItems: ItemVerification[] = prev.items.map(item => {
        const suggestion = suggestionsMesures.find(s => s.itemId === item.id);
        if (suggestion && !item.resultat && item.type === 'mesure_atténuation') {
          return { ...item, resultat: 'SA' as const, prefill: true };
        }
        return item;
      });
      updateProgression(newItems);
      return { ...prev, items: newItems };
    });
    setSuggestionsMesures([]);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Suggestions appliquées',
      message: `${suggestionsMesures.length} suggestion(s) d\'efficacité appliquée(s)`,
      canal: 'in_app',
    });
  };
  
  const handleIgnoreSuggestionsPAC = () => {
    setSuggestionsPAC([]);
  };
  
  const handleIgnoreSuggestionsMesures = () => {
    setSuggestionsMesures([]);
  };
  
  // Calcul du statut de clôture de l'écart
  const ecartClosureStatus = useMemo((): EcartClosureStatus | null => {
    if (!checklistData) return null;
    const pacItems = checklistData.items.filter(i => i.type === 'action_pac');
    if (pacItems.length === 0) return null;
    const evaluations = pacItems.map(i => i.evaluation_action);
    return computeEcartClosureStatus(evaluations);
  }, [checklistData]);
  
  // Signature
  const handleSign = () => {
    if (checklistData && checklistData.progression < 100) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Vérification incomplète',
        message: `${100 - checklistData.progression}% des items non vérifiés`,
        canal: 'in_app',
      });
      return;
    }
    
    if (ecartClosureStatus && ecartClosureStatus.decision !== 'cloturable') {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Écart non clôturable',
        message: ecartClosureStatus.message,
        canal: 'in_app',
      });
      return;
    }
    
    setSignatureDialogOpen(true);
  };
  
  const onSignatureSave = async (signatureUrl: string) => {
    setIsSigned(true);
    setSignatureDialogOpen(false);

    const pacItems = checklistData?.items.filter(i => i.type === 'action_pac') || [];
    const evaluees = pacItems.filter(i => i.evaluation_action && i.evaluation_action.decision !== 'non_evaluee');
    const scorePAC = evaluees.length > 0
      ? Math.round(evaluees.reduce((sum, i) => sum + i.evaluation_action!.score, 0) / evaluees.length)
      : (checklistData?.progression || 0);

    updateSurveillance(surveillanceId, {
      statut: 'checklist_signee',
      score_global: scorePAC,
      signatures_checklist: [{
        signataire_id: user?.id || '',
        signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`,
        date_signature: new Date().toISOString(),
        signature_url: signatureUrl,
      }],
    });

    const { recalculerProfilRisque } = useAppStore.getState();
    await recalculerProfilRisque(aerodromeId);

    onComplete?.();
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Vérification terminée',
      message: 'La checklist a été signée et validée',
      canal: 'in_app',
    });
  };
  
  // Calcul des stats
  const stats = useMemo(() => {
    if (!checklistData) return { total: 0, sa: 0, ns: 0, nv: 0, progression: 0 };
    
    const total = checklistData.items.length;
    const sa = checklistData.items.filter(i => i.resultat === 'SA').length;
    const ns = checklistData.items.filter(i => i.resultat === 'NS').length;
    const nv = checklistData.items.filter(i => !i.resultat || i.resultat === 'NV').length;
    
    return { total, sa, ns, nv, progression: checklistData.progression };
  }, [checklistData]);
  
  if (!checklistData) {
    return (
      <Card className="text-center text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-body">Aucun élément à vérifier</p>
        <p className="text-xs text-muted-foreground mt-2">
          Aucun PAC actif ni exemption avec mesures actives
        </p>
      </Card>
    );
  }
  
  const hasPACItems = checklistData.items.some(i => i.type === 'action_pac');
  const hasMesureItems = checklistData.items.some(i => i.type === 'mesure_atténuation');
  
  return (
    <div className="space-y-6" data-role={userRole} data-module="checklist-pac">
      
      {/* En-tête */}
      <Card variant="level" levelColor="success">
        <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-success-soft rounded-lg">
              <ClipboardList className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {hasPACItems && hasMesureItems 
                  ? 'VÉRIFICATION MIXTE' 
                  : hasPACItems 
                    ? 'MISE EN ŒUVRE PAC' 
                    : 'MESURES D\'ATTÉNUATION'}
              </p>
              <p className="font-bold text-small">
                {hasPACItems && hasMesureItems 
                  ? 'Vérification des actions PAC et mesures d\'atténuation'
                  : hasPACItems 
                    ? 'Vérification terrain des actions correctives'
                    : 'Suivi des mesures d\'atténuation des exemptions'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOffline ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                <WifiOff className="w-3 h-3" />
                Hors ligne
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium bg-green-100 text-green-700 border border-green-200">
                <Wifi className="w-3 h-3" />
                En ligne
              </span>
            )}
            {lastSaved && (
              <span className="text-xs text-muted-foreground">
                Sauvegardé à {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        
        {/* Alertes exemptions actives */}
        {(checklistData.exemptions_actives && checklistData.exemptions_actives.length > 0) && (
          <div className="alert alert-warning mb-4">
            <AlertTriangle className="alert-icon" />
            <div className="alert-content">
              <p className="font-medium">⚠️ Exemptions actives détectées</p>
              <p className="text-sm mt-1">
                Cet aérodrome bénéficie d'exemption(s) active(s) : 
                {checklistData.exemptions_actives.map(e => ` ${e.reference}`).join(', ')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Les mesures d'atténuation associées ont été automatiquement ajoutées à cette checklist.
              </p>
            </div>
          </div>
        )}
        
        {/* Informations */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Aérodrome</p>
              <p className="font-medium">{checklistData.aerodrome_nom}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-success" />
            <div>
              <p className="text-xs text-muted-foreground">Date de vérification</p>
              <p className="font-medium">{new Date().toLocaleDateString('fr-FR')}</p>
            </div>
          </div>
        </div>
        
        {/* Info écart si présent */}
        {checklistData.ecart_concerne && (
          <div className="border-t border-success/20 pt-3 mt-2">
            <p className="text-xs text-muted-foreground mb-2">Écart concerné</p>
            <div className="p-3 bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="code-oaci-badge text-[12px]">{checklistData.ecart_concerne.reference}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium border ${checklistData.ecart_concerne.niveau === 'critique' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                  {checklistData.ecart_concerne.niveau}
                </span>
              </div>
              <p className="text-sm text-foreground">{checklistData.ecart_concerne.libelle}</p>
            </div>
          </div>
        )}
      </Card>
      
      {/* Barre de progression */}
      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-small font-medium">Total: {stats.total}</span>
              <div className="flex items-center gap-2">
                <span className="badge success text-[12px]">SA: {stats.sa}</span>
                <span className="badge danger text-[12px]">NS: {stats.ns}</span>
                <span className="badge warning text-[12px]">À vérifier: {stats.nv}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-small">Progression: {stats.progression}%</span>
              <button type="button" onClick={() => onSave?.(checklistData)} className="btn btn-sm px-3 py-1 btn-secondary">
                <Save className="w-4 h-4" />
                Sauvegarder
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="progress h-2 flex-1">
              <div className="progress-bar progress-fill" style={{ '--pf': stats.progression } as React.CSSProperties} />
            </div>
            <span className="text-small font-medium w-12">{stats.progression}%</span>
          </div>
        </div>
      </Card>
      
      {/* Statut de clôture de l'écart */}
      {ecartClosureStatus && ecartClosureStatus.totalActions > 0 && (
        <Card className={`border-2 ${ecartClosureStatus.decision === 'cloturable' ? 'border-success bg-success/5' : ecartClosureStatus.decision === 'non_cloturable' ? 'border-danger bg-danger/5' : ecartClosureStatus.decision === 'conditionnelle' ? 'border-warning bg-warning/5' : 'border-gray-300 bg-gray-50'}`}>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Shield className={`w-5 h-5 ${ecartClosureStatus.decision === 'cloturable' ? 'text-success' : ecartClosureStatus.decision === 'non_cloturable' ? 'text-danger' : ecartClosureStatus.decision === 'conditionnelle' ? 'text-warning' : 'text-gray-400'}`} />
              <h3 className="font-semibold text-sm">Statut de clôture de l'écart</h3>
            </div>
            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold border ${ecartClosureStatus.decision === 'cloturable' ? 'bg-success text-success-foreground border-success' : ecartClosureStatus.decision === 'non_cloturable' ? 'bg-danger text-danger-foreground border-danger' : ecartClosureStatus.decision === 'conditionnelle' ? 'bg-warning text-warning-foreground border-warning' : 'bg-gray-200 text-gray-700 border-gray-300'}`}>
              {ecartClosureStatus.decision === 'cloturable' ? '✅ ÉCART CLÔTURABLE' : ecartClosureStatus.decision === 'non_cloturable' ? '🔴 NON CLÔTURABLE' : ecartClosureStatus.decision === 'conditionnelle' ? '🟠 CLÔTURE CONDITIONNELLE' : '⚪ EN ATTENTE'}
            </span>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
            <div className="text-center p-2 bg-white rounded-lg border">
              <p className="text-xs text-muted-foreground">Total actions</p>
              <p className="text-xl font-bold">{ecartClosureStatus.totalActions}</p>
            </div>
            <div className="text-center p-2 bg-success/10 rounded-lg border border-success/20">
              <p className="text-xs text-muted-foreground">Validées</p>
              <p className="text-xl font-bold text-success">{ecartClosureStatus.actionsValidees}</p>
            </div>
            <div className="text-center p-2 bg-warning/10 rounded-lg border border-warning/20">
              <p className="text-xs text-muted-foreground">Partielles</p>
              <p className="text-xl font-bold text-warning">{ecartClosureStatus.actionsPartielles}</p>
            </div>
            <div className="text-center p-2 bg-danger/10 rounded-lg border border-danger/20">
              <p className="text-xs text-muted-foreground">Non validées</p>
              <p className="text-xl font-bold text-danger">{ecartClosureStatus.actionsNonValidees}</p>
            </div>
            <div className="text-center p-2 bg-gray-100 rounded-lg border">
              <p className="text-xs text-muted-foreground">Non évaluées</p>
              <p className="text-xl font-bold">{ecartClosureStatus.actionsNonEvaluees}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Score agrégé</p>
              <p className="text-2xl font-bold">{ecartClosureStatus.scoreAgrege}%</p>
            </div>
            <div className="flex items-center gap-3">
              {checklistData.ecart_concerne?.niveau && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Risque résiduel :</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${checklistData.ecart_concerne.niveau === 'critique' ? 'badge danger animate-pulse' : checklistData.ecart_concerne.niveau === 'eleve' ? 'badge warning' : checklistData.ecart_concerne.niveau === 'moyen' ? 'badge primary' : 'badge success'}`}>
                    {checklistData.ecart_concerne.niveau}
                  </span>
                </div>
              )}
              <p className={`text-sm font-medium ${ecartClosureStatus.decision === 'non_cloturable' ? 'text-danger' : ecartClosureStatus.decision === 'conditionnelle' ? 'text-warning' : 'text-muted-foreground'}`}>
                {ecartClosureStatus.message}
              </p>
            </div>
          </div>
        </Card>
      )}
      
      {/* Suggestions PAC */}
      {suggestionsPAC.length > 0 && (
        <SuggestionsBanner
          suggestions={suggestionsPAC}
          onAcceptAll={handleAcceptAllSuggestionsPAC}
          onIgnore={handleIgnoreSuggestionsPAC}
          type="action_pac"
        />
      )}
      
      {/* Suggestions Mesures */}
      {suggestionsMesures.length > 0 && (
        <SuggestionsBanner
          suggestions={suggestionsMesures}
          onAcceptAll={handleAcceptAllSuggestionsMesures}
          onIgnore={handleIgnoreSuggestionsMesures}
          type="mesure_atténuation"
        />
      )}
      
      {/* Liste des items groupés par domaine */}
      {(() => {
        const itemsParDomaine = grouperParDomaine(checklistData.items, 'SGS');
        return (
          <div className="space-y-6">
            {itemsParDomaine.map((groupe: DomaineItems<ItemVerification>) => (
              <Card key={groupe.domaine} className="overflow-hidden"
                heading={<div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-8 h-7 rounded-md text-[13px] font-bold bg-blue-600 text-white">{getDomaineCode(groupe.domaine)}</span>
                  <span className="text-sm font-medium">{getDomaineLabel(getDomaineCode(groupe.domaine))}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">{groupe.items.length} item(s)</span>
                </div>}
              >
                <div className="space-y-4">
                  {groupe.items.map((item, idx) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      index={idx}
                      readOnly={readOnly || isSigned}
                      onUpdate={handleUpdateItem}
                      onAddFile={handleAddFile}
                      onDeleteFile={handleDeleteFile}
                      onValidateEfficacite={handleValidateEfficacite}
                    />
                  ))}
                </div>
              </Card>
            ))}
          </div>
        );
      })()}
      
      {/* Observations générales */}
      <Card icon={<FileText className="w-4 h-4 text-role-primary" />} title="Observations générales">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {checklistData.observations_generales || 'Aucune observation générale'}
            </p>
          </div>
          {!readOnly && !isSigned && (
            <button
              onClick={() => setObservationsModalOpen(true)}
              className="btn btn-sm px-3 py-1 btn-ghost"
              title="Modifier les observations"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>
      </Card>
      
      {/* Signature */}
      {!readOnly && !isSigned && (
        <Card className={`border-2 border-dashed text-center ${stats.progression === 100 ? 'border-success bg-success/10' : 'border-gray-300 bg-gray-50 opacity-50'}`}>
          <PenLine className={`h-12 w-12 mx-auto mb-4 ${stats.progression === 100 ? 'text-success' : 'text-gray-400'}`} />
          <h3 className="text-lg font-medium mb-2">Signature des inspecteurs</h3>
          {stats.progression === 100 ? (
            <>
              <p className="text-small text-gray-600 mb-4">✅ Tous les items sont vérifiés ({stats.progression}%)</p>
              <button type="button" onClick={handleSign} className="btn btn-sm px-3 py-1 btn-primary">
                Signer la vérification
              </button>
            </>
          ) : (
            <p className="text-small text-gray-500">
              ⏳ Progression: {stats.progression}% - {stats.nv} item(s) non vérifié(s)
            </p>
          )}
        </Card>
      )}
      
      {/* Modal observations générales */}
      <GeneralObservationsModal
        isOpen={observationsModalOpen}
        onClose={() => setObservationsModalOpen(false)}
        observations={checklistData.observations_generales || ''}
        onSave={handleSaveObservations}
        readOnly={readOnly || isSigned}
      />
      
      {/* Modal signature */}
      {signatureDialogOpen && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title">Signature de la vérification</div>
                <button className="modal-close" onClick={() => setSignatureDialogOpen(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="modal-body">
                <SignaturePadWithColor
                  onSave={onSignatureSave}
                  onCancel={() => setSignatureDialogOpen(false)}
                  signataireNom={`${user?.prenom || ''} ${user?.nom || ''}`}
                />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default SurveillanceChecklistPAC;