// components/modules/surveillance/SurveillanceChecklistPAC.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
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
} from 'lucide-react';
import { FileUploader } from '@/components/ui/FileUploader';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { DomaineCode, getDomaineInfo, getDomaineLabel, grouperParDomaine, DomaineItems } from '@/lib/domaines';
import { EvaluationAction, computeEvaluationActionScore, EcartClosureStatus, computeEcartClosureStatus } from '@/types/checklist';

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

// Carte d'item (PAC ou Mesure)
function ItemCard({
  item,
  index,
  readOnly,
  onUpdate,
  onAddFile,
  onDeleteFile,
  onValidateEfficacite,
  onEvaluate,
}: {
  item: ItemVerification;
  index: number;
  readOnly: boolean;
  onUpdate: (item: ItemVerification) => void;
  onAddFile: (itemId: string, file: Preuve) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
  onValidateEfficacite?: (itemId: string, efficacite: number) => void;
  onEvaluate?: (itemId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [observation, setObservation] = useState(item.observation || '');
  const [selectedResultat, setSelectedResultat] = useState<ResultatItem>(item.resultat || 'NV');
  const [efficaciteTemp, setEfficaciteTemp] = useState(item.efficacite_validee || item.efficacite_suggeree || 70);
  const [showEfficaciteSlider, setShowEfficaciteSlider] = useState(false);
  
  const isPAC = item.type === 'action_pac';
  const isMesure = item.type === 'mesure_atténuation';
  const hasPrediction = isPAC && item.prediction && !item.resultat;
  const isPrefilled = item.prefill === true;
  const isAlerte = item.alerte === true;
  
  const getStatusBadge = () => {
    switch (item.statut_origine) {
      case 'termine': return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">Terminé</span>;
      case 'en_cours': return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">En cours</span>;
      default: return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">Planifié</span>;
    }
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
    setSelectedResultat(resultat);
    onUpdate({ ...item, resultat });
  };
  
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
  
  const getEvaluationBadge = () => {
    if (!item.evaluation_action || item.evaluation_action.decision === 'non_evaluee') return null;
    const ev = item.evaluation_action;
    let color = '';
    let label = '';
    switch (ev.decision) {
      case 'validee': color = 'bg-success/20 text-success-800 border-success'; label = `✅ ${ev.score}%`; break;
      case 'partielle': color = 'bg-warning/20 text-warning-800 border-warning'; label = `🟠 ${ev.score}%`; break;
      case 'non_validee': color = 'bg-danger/20 text-danger-800 border-danger'; label = `🔴 ${ev.score}%`; break;
      default: return null;
    }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}>
        {label}
      </span>
    );
  };
  
  return (
    <div className={`card border-border mb-4 overflow-hidden ${isAlerte ? 'border-l-4 border-l-danger' : ''}`}>
      {/* En-tête */}
      <div
        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
          isPAC ? 'bg-gradient-to-r from-role-primary/5 to-transparent' : 'bg-gradient-to-r from-role-secondary/5 to-transparent'
        } hover:bg-role-primary-soft`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {isPAC ? (
              <ClipboardList className="w-4 h-4 text-primary" />
            ) : (
              <Shield className="w-4 h-4 text-role-secondary" />
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
              {isPAC ? `Action PAC ${index + 1}` : `Mesure ${index + 1}`}
            </span>
            {getStatusBadge()}
            {isPrefilled && (
              <Sparkles className="w-3 h-3 text-primary" />
            )}
            {isAlerte && (
              <AlertTriangle className="w-3 h-3 text-danger" />
            )}
          </div>
          <span className="font-medium text-sm text-foreground line-clamp-1">{item.description}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
            <ResultatIcon className="w-3 h-3" />
            <span className={`text-xs font-medium ${resultatConfig.color.split(' ')[0]}`}>
              {currentResultat === 'NV' ? 'À vérifier' : currentResultat}
            </span>
          </div>
          {isPAC && getEvaluationBadge()}
          {isPAC && onEvaluate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEvaluate(item.id); }}
              className="btn btn-sm px-2 py-1 btn-ghost text-xs"
              title="Évaluer l'action"
            >
              <Shield className="w-3 h-3" />
              <span className="hidden sm:inline">Évaluer</span>
            </button>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Informations */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserCheck className="w-4 h-4 text-role-primary" />
              <span>Responsable: <span className="text-foreground">{item.responsable}</span></span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="w-4 h-4 text-role-primary" />
              <span>Échéance: <span className={getEcheanceClass()}>{new Date(item.date_prevue).toLocaleDateString('fr-FR')}</span></span>
            </div>
          </div>
          
          {item.livrables && item.livrables.length > 0 && (
            <div className="p-2 bg-gray-50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Livrables attendus:</p>
              <div className="flex flex-wrap gap-1">
                {item.livrables.map((livrable, idx) => (
                  <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">{livrable}</span>
                ))}
              </div>
            </div>
          )}
          
          {/* Suggestion système */}
          {!readOnly && !item.resultat && (
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-primary">
                  {isPAC ? 'Prédiction système' : 'Suggestion système'}
                </span>
              </div>
              
              {isPAC && item.prediction && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {item.prediction === 'SA' ? 'Satisfaisant (SA)' : 'Non satisfaisant (NS)'}
                    </span>
                    <ConfidenceIndicator confiance={item.confiance || 0} />
                  </div>
                  <SuggestionInfoButton
                    justification={item.justification || 'Basé sur l\'historique des vérifications'}
                    confiance={item.confiance || 0}
                    type="action_pac"
                  />
                </div>
              )}
              
              {isMesure && (
                <div className="space-y-3">
                  {!showEfficaciteSlider ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">
                          Efficacité estimée: <strong>{item.efficacite_suggeree || 70}%</strong>
                        </span>
                        <SuggestionInfoButton
                          justification={item.justification || 'Calculé sur l\'impact potentiel de la mesure'}
                          confiance={item.confiance || 70}
                          type="mesure_atténuation"
                        />
                      </div>
                      {item.impact_c3_suggere && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TrendingUp className="w-3 h-3" />
                          Impact potentiel sur C3: +{Math.round(((item.efficacite_suggeree || 70) / 100) * item.impact_c3_suggere)} points
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowEfficaciteSlider(true)}
                          className="btn btn-sm px-3 py-1 btn-primary"
                        >
                          <Sliders className="w-3 h-3" />
                          Ajuster l'efficacité
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <EfficaciteSlider
                        valeur={efficaciteTemp}
                        onChange={handleEfficaciteChange}
                        impactC3={item.impact_c3_suggere}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleValidateEfficacite}
                          className="btn btn-sm px-3 py-1 btn-primary"
                        >
                          <Check className="w-3 h-3" />
                          Valider l'efficacité
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowEfficaciteSlider(false)}
                          className="btn btn-sm px-3 py-1 btn-secondary"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Efficacité validée (affichage si déjà validée) */}
          {isMesure && item.efficacite_validee !== undefined && !readOnly && (
            <div className="p-2 bg-success/10 rounded-lg border border-success/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-[12px] text-success">Efficacité validée</span>
                </div>
                <span className="text-sm font-semibold text-success">{item.efficacite_validee}%</span>
              </div>
            </div>
          )}
          
          {/* Zone de vérification terrain */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              🔍 VÉRIFICATION SUR SITE
            </p>
            
            {/* Boutons SA/NS/NV */}
            <div className="checklist-etat checklist-etat-3 mb-4">
              {(['SA', 'NS', 'NV'] as ResultatItem[]).map((resultat) => {
                const config = RESULTAT_LABELS[resultat];
                const Icon = config.icon;
                const isSelected = selectedResultat === resultat;
                
                return (
                  <button
                    key={resultat}
                    type="button"
                    onClick={() => handleResultatChange(resultat)}
                    className={`checklist-etat-btn ${isSelected ? `active-${resultat.toLowerCase()}` : ''}`}
                    disabled={readOnly}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{config.short}</span>
                  </button>
                );
              })}
            </div>
            
            {/* Observations */}
            <div className="mb-4">
              <label className="text-xs text-muted-foreground mb-1 block">Observations</label>
              <textarea
                value={observation}
                onChange={(e) => handleObservationChange(e.target.value)}
                placeholder="Notez vos observations sur site..."
                rows={2}
                className={`form-textarea w-full text-sm ${focusClass}`}
                disabled={readOnly}
              />
            </div>
            
            {/* Preuves */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Preuves</label>
              {item.preuves && item.preuves.length > 0 && (
                <div className="space-y-2 mb-3">
                  {item.preuves.map(proof => (
                    <div key={proof.id} className="flex items-center gap-2 text-xs bg-role-primary-soft p-2 rounded-lg">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="flex-1 truncate text-sm">{proof.nom}</span>
                      <button
                        type="button"
                        className="btn btn-sm px-3 py-1 btn-ghost"
                        onClick={() => window.open(proof.url, '_blank')}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                            className="btn btn-sm px-3 py-1 btn-ghost text-red-600"
                          onClick={() => onDeleteFile(item.id, proof.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {!readOnly && (
                <div className="flex gap-2">
                  <FileUploader
                    onUpload={(file) => onAddFile(item.id, {
                      id: `proof-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                      nom: file.nom,
                      url: file.url,
                      dateUpload: new Date().toISOString(),
                    })}
                    accept=".pdf,.jpg,.jpeg,.png"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary gap-2"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.capture = 'environment';
                      input.onchange = (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (file) {
                          const url = URL.createObjectURL(file);
                          onAddFile(item.id, {
                            id: `photo-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                            nom: `photo_${new Date().toISOString().slice(0, 19)}.jpg`,
                            url,
                            dateUpload: new Date().toISOString(),
                          });
                        }
                      };
                      input.click();
                    }}
                  >
                    <Camera className="w-4 h-4" />
                    Photo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
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
    <div className="card border-l-4 border-l-primary bg-primary/5 mb-4">
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
    </div>
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
  
  // État principal
  const [checklistData, setChecklistData] = useState<ChecklistMixteData | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [observationsModalOpen, setObservationsModalOpen] = useState(false);
  const [suggestionsPAC, setSuggestionsPAC] = useState<{ itemId: string; description: string; justification: string; confiance: number }[]>([]);
  const [suggestionsMesures, setSuggestionsMesures] = useState<{ itemId: string; description: string; justification: string; confiance: number }[]>([]);
  const [evaluationModalOpen, setEvaluationModalOpen] = useState(false);
  const [evaluationTarget, setEvaluationTarget] = useState<ItemVerification | null>(null);
  
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
  const ecartsPACAcceptes = useMemo(() => {
    return ecarts.filter(e =>
      e.aerodrome_id === aerodromeId &&
      e.pac && e.pac.actions && e.pac.actions.length > 0 &&
      // PAC accepté mais écart pas encore clôturé → preuves à vérifier
      ['pac_accepte', 'preuves_soumises', 'preuves_evaluees'].includes(e.statut)
    )
  }, [ecarts, aerodromeId])
  
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
  
  const handleOpenEvaluation = useCallback((itemId: string) => {
    const item = checklistData?.items.find(i => i.id === itemId);
    if (item) {
      setEvaluationTarget(item);
      setEvaluationModalOpen(true);
    }
  }, [checklistData]);
  
  const handleSaveEvaluation = useCallback((itemId: string, evaluation: EvaluationAction) => {
    setChecklistData(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i =>
        i.id === itemId ? { ...i, evaluation_action: evaluation } : i
      );
      return { ...prev, items: newItems };
    });
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Évaluation enregistrée',
      message: 'L\'évaluation terrain de l\'action a été sauvegardée',
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
      <div className="card border-border">
        <div className="card-content py-12 text-center text-muted-foreground">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-body">Aucun élément à vérifier</p>
          <p className="text-xs text-muted-foreground mt-2">
            Aucun PAC actif ni exemption avec mesures actives
          </p>
        </div>
      </div>
    );
  }
  
  const hasPACItems = checklistData.items.some(i => i.type === 'action_pac');
  const hasMesureItems = checklistData.items.some(i => i.type === 'mesure_atténuation');
  
  return (
    <div className="space-y-6" data-role={userRole} data-module="checklist-pac">
      
      {/* En-tête */}
      <div className="card border-l-4 border-l-success bg-gradient-to-r from-success/10 to-success/5">
        <div className="card-content p-4">
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
        </div>
      </div>
      
      {/* Barre de progression */}
      <div className="card border-border">
        <div className="card-content p-4">
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
        </div>
      </div>
      
      {/* Statut de clôture de l'écart */}
      {ecartClosureStatus && ecartClosureStatus.totalActions > 0 && (
        <div className={`card border-2 ${ecartClosureStatus.decision === 'cloturable' ? 'border-success bg-success/5' : ecartClosureStatus.decision === 'non_cloturable' ? 'border-danger bg-danger/5' : ecartClosureStatus.decision === 'conditionnelle' ? 'border-warning bg-warning/5' : 'border-gray-300 bg-gray-50'}`}>
          <div className="card-content p-4">
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
              <p className={`text-sm font-medium ${ecartClosureStatus.decision === 'non_cloturable' ? 'text-danger' : ecartClosureStatus.decision === 'conditionnelle' ? 'text-warning' : 'text-muted-foreground'}`}>
                {ecartClosureStatus.message}
              </p>
            </div>
          </div>
        </div>
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
              <div key={groupe.domaine} className="card border-border overflow-hidden">
                <div className="card-header bg-gradient-to-r from-blue-600/5 to-transparent">
                  <div className="card-title text-base flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-8 h-7 rounded-md text-[13px] font-bold bg-blue-600 text-white">
                      {groupe.domaine}
                    </span>
                    <span className="text-sm font-medium">{groupe.domaineLabel}</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                      {groupe.items.length} item(s)
                    </span>
                  </div>
                </div>
                <div className="card-content p-4 space-y-4">
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
                      onEvaluate={item.type === 'action_pac' ? handleOpenEvaluation : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
      
      {/* Observations générales */}
      <div className="card border-border">
        <div className="card-header bg-gradient-to-r from-role-primary/5 to-transparent">
          <div className="card-title text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-role-primary" />
            Observations générales
          </div>
        </div>
        <div className="card-content p-4">
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
        </div>
      </div>
      
      {/* Signature */}
      {!readOnly && !isSigned && (
        <div className={`card border-2 border-dashed ${stats.progression === 100 ? 'border-success bg-success/10' : 'border-gray-300 bg-gray-50 opacity-50'}`}>
          <div className="card-content p-6 text-center">
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
          </div>
        </div>
      )}
      
      {/* Modal observations générales */}
      <GeneralObservationsModal
        isOpen={observationsModalOpen}
        onClose={() => setObservationsModalOpen(false)}
        observations={checklistData.observations_generales || ''}
        onSave={handleSaveObservations}
        readOnly={readOnly || isSigned}
      />
      
      {/* Modal évaluation action corrective */}
      <EvaluationActionModal
        isOpen={evaluationModalOpen}
        onClose={() => setEvaluationModalOpen(false)}
        item={evaluationTarget}
        onSave={handleSaveEvaluation}
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