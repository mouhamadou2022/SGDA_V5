// components/modules/surveillance/SurveillanceChecklistSuiviEcarts.tsx
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
  Download,
  Trash2,
  Plus,
  Eye,
  Calendar,
  Users,
  MapPin,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Target,
  UserCheck,
  AlertTriangle,
  Clock,
  Upload,
  Camera,
  Info,
  Zap,
  Sparkles,
  Brain,
  Wifi,
  WifiOff,
  RefreshCw,
  Flame,
  Send,
  TrendingUp,
} from 'lucide-react';
import { FileUploader } from '@/components/ui/FileUploader';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { DomaineCode, getDomaineInfo, getDomaineLabel, grouperParDomaine, DomaineItems } from '@/lib/domaines';
import { EvaluationTerrain, computeEvaluationTerrainScore } from '@/types/checklist';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// Types
export type ResultatSuivi = 'SA' | 'NS' | 'NV';
export type ModeSaisie = 'clavier' | 'stylet' | 'ocr';

export interface SuiviItem {
  id: string;
  numero: string;
  domaine?: DomaineCode;
  reference_reglementaire: string;
  point_verification: string;
  directive_preuve: string;
  resultat?: ResultatSuivi;
  observation?: string;
  fichiers?: { id: string; nom: string; url: string; dateUpload: string }[];
  ordre: number;
  prediction?: ResultatSuivi;
  confiance?: number;
  justification?: string;
  alerte?: boolean;
  prefill?: boolean;
  evaluationTerrain?: EvaluationTerrain;
}

export interface EcartSuiviVerification {
  id: string;
  ecart_id: string;
  domaine?: DomaineCode;
  ecart_reference: string;
  ecart_libelle: string;
  ecart_niveau: 'critique' | 'eleve' | 'moyen' | 'faible';
  date_echeance: string;
  statut: string;
  progression_pac?: number;
  items: SuiviItem[];
  observations_generales?: string;
  progression: number;
  isExpanded: boolean;
}

export const RESULTAT_LABELS = {
  SA: { label: 'Satisfaisant', variant: 'success', icon: CheckCircle, color: 'bg-success/20 text-success-800 border-success', short: 'SA' },
  NS: { label: 'Non satisfaisant', variant: 'danger', icon: XCircle, color: 'bg-danger/20 text-danger-800 border-danger', short: 'NS' },
  NV: { label: 'À vérifier', variant: 'warning', icon: AlertCircle, color: 'bg-warning/20 text-warning-800 border-warning', short: 'NV' },
};

// Composant: Indicateur de confiance
function ConfidenceIndicator({ confiance }: { confiance: number }) {
  let color = 'bg-gray-200';
  
  if (confiance >= 85) {
    color = 'bg-success';
  } else if (confiance >= 70) {
    color = 'bg-primary';
  } else if (confiance >= 50) {
    color = 'bg-warning';
  } else if (confiance >= 30) {
    color = 'bg-orange-400';
  } else {
    color = 'bg-danger';
  }
  
  return (
    <div className="flex items-center gap-1" title={`Confiance: ${confiance}%`}>
      <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`progress-fill ${color}`} style={{ '--pf': confiance } as React.CSSProperties} />
      </div>
      <span className="text-[9px] text-muted-foreground">{confiance}%</span>
    </div>
  );
}

// Composant: Bouton info pour suggestion
function SuggestionInfoButton({ justification, confiance }: { justification: string; confiance: number }) {
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
  
  return (
    <div className="relative inline-block" ref={popupRef}>
      <button
        type="button"
        onClick={() => setShowPopup(!showPopup)}
        className="btn btn-sm px-3 py-1 btn-ghost p-0 h-5 w-5 text-blue-600"
        title="Pourquoi cette suggestion ?"
      >
        <Info className="w-3 h-3" />
      </button>
      {showPopup && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 bg-background border border-border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-xs font-semibold">Pourquoi cette suggestion ?</span>
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

// Composant: Carte d'item à vérifier
function SuiviItemCard({
  item,
  index,
  readOnly,
  onUpdate,
  onAddFile,
  onDeleteFile,
}: {
  item: SuiviItem;
  index: number;
  readOnly: boolean;
  onUpdate: (item: SuiviItem) => void;
  onAddFile: (itemId: string, file: { id: string; nom: string; url: string; dateUpload: string }) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [observation, setObservation] = useState(item.observation || '');
  const [selectedResultat, setSelectedResultat] = useState<ResultatSuivi>(item.resultat || item.prediction || 'NV');
  
  const hasPrediction = item.prediction && !item.resultat;
  const isPrefilled = item.prefill === true;
  const isAlerte = item.alerte === true;
  
  const handleResultatChange = (resultat: ResultatSuivi) => {
    setSelectedResultat(resultat);
    onUpdate({ ...item, resultat });
  };
  
  const handleObservationChange = (obs: string) => {
    setObservation(obs);
    onUpdate({ ...item, observation: obs });
  };
  
  const currentResultat = item.resultat || item.prediction || 'NV';
  const resultatConfig = RESULTAT_LABELS[currentResultat as ResultatSuivi];
  const ResultatIcon = resultatConfig.icon;
  
  return (
    <div className={`card border-border mb-3 overflow-hidden ${isAlerte ? 'border-l-4 border-l-danger' : ''}`}>
      {/* En-tête de l'item */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-role-primary-soft transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="code-oaci-badge text-xs">{item.numero}</span>
            {isPrefilled && (
              <Sparkles className="w-3 h-3 text-primary" />
            )}
            {isAlerte && (
              <AlertTriangle className="w-3 h-3 text-danger" />
            )}
          </div>
          <span className="text-sm text-foreground flex-1">{item.point_verification}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100">
            <ResultatIcon className="w-3 h-3" />
            <span className={`text-xs font-medium ${resultatConfig.color.split(' ')[0]}`}>
              {currentResultat === 'NV' ? 'À vérifier' : currentResultat}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 pt-0 space-y-3">
          {/* Directive preuve */}
          <div className="p-2 bg-blue-50 rounded-lg text-[12px] text-blue-700">
            <span className="font-semibold">Directive de preuve : </span>
            {item.directive_preuve}
          </div>
          
          {/* Prédiction système */}
          {hasPrediction && !readOnly && (
            <div className="p-2 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-3 h-3 text-primary" />
                  <span className="text-xs text-primary">Prédiction système</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-primary">{item.prediction}</span>
                  <ConfidenceIndicator confiance={item.confiance || 0} />
                  <SuggestionInfoButton justification={item.justification || ''} confiance={item.confiance || 0} />
                </div>
              </div>
            </div>
          )}
          
          {/* Zone de vérification */}
          <div className="border-t border-border pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              🔍 Vérification sur site
            </p>
            
            {/* Boutons résultat SA/NS */}
            <div className="checklist-etat mb-3">
              <button
                type="button"
                onClick={() => handleResultatChange('SA')}
                className={`checklist-etat-btn ${selectedResultat === 'SA' ? 'active-sa' : ''}`}
                disabled={readOnly}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>SA</span>
              </button>
              <button
                type="button"
                onClick={() => handleResultatChange('NS')}
                className={`checklist-etat-btn ${selectedResultat === 'NS' ? 'active-ns' : ''}`}
                disabled={readOnly}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>NS</span>
              </button>
            </div>
            
            {/* Observations */}
            <div className="mb-3">
              <textarea
                value={observation}
                onChange={(e) => handleObservationChange(e.target.value)}
                placeholder="Notez vos observations sur site..."
                rows={2}
                className={`form-textarea text-sm w-full ${focusClass}`}
                disabled={readOnly}
              />
            </div>
            
            {/* Preuves */}
            <div>
              {item.fichiers && item.fichiers.length > 0 && (
                <div className="space-y-1 mb-2">
                  {item.fichiers.map((proof: any) => (
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
                    className="btn btn-sm px-3 py-1 btn-secondary text-sm"
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

// Composant: Bandeau de suggestions
function SuggestionsBanner({
  suggestions,
  onAcceptAll,
  onIgnore,
}: {
  suggestions: { itemId: string; itemNumero: string; justification: string; confiance: number }[];
  onAcceptAll: () => void;
  onIgnore: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [accepted, setAccepted] = useState<string[]>([]);
  
  if (suggestions.length === 0) return null;
  
  const remainingSuggestions = suggestions.filter(s => !accepted.includes(s.itemId));
  
  if (remainingSuggestions.length === 0) return null;
  
  return (
    <div className="card border-l-4 border-l-primary bg-primary/5 mb-4">
      <button
        className="w-full flex items-center justify-between p-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">Suggestions intelligentes ({remainingSuggestions.length})</span>
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
                <span className="code-oaci-badge text-xs">{suggestion.itemNumero}</span>
                <span className="text-sm text-muted-foreground flex-1">{suggestion.justification}</span>
                <ConfidenceIndicator confiance={suggestion.confiance} />
              </div>
              <button
                onClick={() => {
                  setAccepted(prev => [...prev, suggestion.itemId]);
                }}
                className="btn btn-sm px-3 py-1 btn-primary"
              >
                <Check className="w-3 h-3" />
                Appliquer SA
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Composant: Modal observations générales
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
              placeholder="Observations générales sur le suivi des écarts..."
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

// Composant principal
export function SurveillanceChecklistSuiviEcarts({
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
  
  // Trouver l'écart associé à cette surveillance
  const ecart = useMemo(() => {
    return ecarts.find(e => e.surveillance_id === surveillanceId);
  }, [ecarts, surveillanceId]);
  
  // État principal
  const [verification, setVerification] = useState<EcartSuiviVerification | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [observationsModalOpen, setObservationsModalOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<{ itemId: string; itemNumero: string; justification: string; confiance: number }[]>([]);
  
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
  
  // Générer les items de vérification
  useEffect(() => {
    if (ecart) {
      const domaineEcart = (ecart as any).domaine as DomaineCode | undefined;
      // Générer des items de vérification basés sur l'écart
      const items: SuiviItem[] = [
        {
          id: `item-${Date.now()}-1`,
          numero: '1.1',
          domaine: domaineEcart,
          reference_reglementaire: ecart.ref_reglementaire,
          point_verification: `Vérification de l'état d'avancement de l'écart ${ecart.reference}`,
          directive_preuve: 'Documents, photos, constats terrain',
          ordre: 1,
        },
        {
          id: `item-${Date.now()}-2`,
          numero: '1.2',
          domaine: domaineEcart,
          reference_reglementaire: ecart.ref_reglementaire,
          point_verification: 'Vérification des actions correctives mises en œuvre',
          directive_preuve: 'Preuves de réalisation des actions',
          ordre: 2,
        },
        {
          id: `item-${Date.now()}-3`,
          numero: '1.3',
          domaine: domaineEcart,
          reference_reglementaire: ecart.ref_reglementaire,
          point_verification: 'Évaluation de l\'efficacité des actions',
          directive_preuve: 'Tests, mesures, inspections',
          ordre: 3,
        },
      ];
      
      setVerification({
        id: `suivi-${Date.now()}`,
        ecart_id: ecart.id,
        domaine: domaineEcart,
        ecart_reference: ecart.reference,
        ecart_libelle: ecart.libelle,
        ecart_niveau: ecart.niveau_risque,
        date_echeance: ecart.delai_regularisation,
        statut: ecart.statut,
        progression_pac: ecart.pac?.version ? 50 : 0,
        items,
        observations_generales: '',
        progression: 0,
        isExpanded: true,
      });
    }
  }, [ecart]);
  
  // Générer les suggestions
  useEffect(() => {
    if (verification && !readOnly && !isSigned) {
      const newSuggestions = verification.items
        .filter(item => !item.resultat && item.prediction === 'SA' && (item.confiance || 0) >= 70)
        .map(item => ({
          itemId: item.id,
          itemNumero: item.numero,
          justification: item.justification || 'Conforme lors des vérifications précédentes',
          confiance: item.confiance || 0,
        }));
      setSuggestions(newSuggestions);
    }
  }, [verification, readOnly, isSigned]);
  
  // Mettre à jour la progression
  const updateProgression = useCallback((items: SuiviItem[]) => {
    const total = items.length;
    const verifiees = items.filter(i => i.resultat).length;
    const progression = total > 0 ? Math.round((verifiees / total) * 100) : 0;
    setVerification(prev => prev ? { ...prev, items, progression } : null);
  }, []);
  
  // Handlers
  const handleUpdateItem = useCallback((updatedItem: SuiviItem) => {
    setVerification(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i => i.id === updatedItem.id ? updatedItem : i);
      updateProgression(newItems);
      return { ...prev, items: newItems };
    });
  }, [updateProgression]);
  
  const handleAddFile = useCallback((itemId: string, file: { id: string; nom: string; url: string; dateUpload: string }) => {
    setVerification(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i => 
        i.id === itemId 
          ? { ...i, fichiers: [...(i.fichiers || []), file] }
          : i
      );
      return { ...prev, items: newItems };
    });
  }, []);
  
  const handleDeleteFile = useCallback((itemId: string, fileId: string) => {
    setVerification(prev => {
      if (!prev) return prev;
      const newItems = prev.items.map(i => 
        i.id === itemId 
          ? { ...i, fichiers: i.fichiers?.filter(p => p.id !== fileId) || [] }
          : i
      );
      return { ...prev, items: newItems };
    });
  }, []);
  
  const handleSaveObservations = useCallback((observations: string) => {
    setVerification(prev => prev ? { ...prev, observations_generales: observations } : null);
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
      if (verification && !readOnly && !isSigned) {
        setLastSaved(new Date());
        onSave?.(verification);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [verification, readOnly, isSigned, onSave]);
  
  // Accepter toutes les suggestions
  const handleAcceptAllSuggestions = () => {
    setVerification(prev => {
      if (!prev) return prev;
      const newItems: SuiviItem[] = prev.items.map(item => {
        const suggestion = suggestions.find(s => s.itemId === item.id);
        if (suggestion && !item.resultat) {
          return { ...item, resultat: 'SA' as const, prefill: true };
        }
        return item;
      });
      updateProgression(newItems);
      return { ...prev, items: newItems };
    });
    setSuggestions([]);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Suggestions appliquées',
      message: `${suggestions.length} suggestion(s) appliquée(s)`,
      canal: 'in_app',
    });
  };
  
  const handleIgnoreSuggestions = () => {
    setSuggestions([]);
  };
  
  // Signature
  const handleSign = () => {
    if (verification && verification.progression < 100) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Vérification incomplète',
        message: `${100 - verification.progression}% des items non vérifiés`,
        canal: 'in_app',
      });
      return;
    }
    setSignatureDialogOpen(true);
  };
  
  const onSignatureSave = async (signatureUrl: string) => {
    setIsSigned(true);
    setSignatureDialogOpen(false);

    const itemsEvalues = verification?.items.filter(i => i.evaluationTerrain) || [];
    const scoreSuivi = itemsEvalues.length > 0
      ? Math.round(itemsEvalues.reduce((sum, i) => sum + i.evaluationTerrain!.score, 0) / itemsEvalues.length)
      : (verification?.progression || 0);

    updateSurveillance(surveillanceId, {
      statut: 'checklist_signee',
      score_global: scoreSuivi,
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
      title: 'Suivi des écarts complété',
      message: 'La vérification des écarts a été signée',
      canal: 'in_app',
    });
  };
  
  // Calcul des stats
  const stats = useMemo(() => {
    if (!verification) return { total: 0, sa: 0, ns: 0, nv: 0, progression: 0 };
    
    const total = verification.items.length;
    const sa = verification.items.filter(i => i.resultat === 'SA').length;
    const ns = verification.items.filter(i => i.resultat === 'NS').length;
    const nv = verification.items.filter(i => !i.resultat || i.resultat === 'NV').length;
    
    return { total, sa, ns, nv, progression: verification.progression };
  }, [verification]);
  
  const getEcartNiveauBadge = () => {
    if (!verification) return 'badge neutral';
    switch (verification.ecart_niveau) {
      case 'critique': return 'badge danger';
      case 'eleve': return 'badge warning';
      case 'moyen': return 'badge primary';
      default: return 'badge neutral';
    }
  };
  
  const getStatutBadge = () => {
    if (!verification) return 'badge neutral';
    switch (verification.statut) {
      case 'en_retard': return 'badge danger animate-pulse';
      case 'pac_attendu': return 'badge warning';
      case 'pac_soumis': return 'badge primary';
      case 'pac_accepte': return 'badge success';
      default: return 'badge neutral';
    }
  };
  
  const getStatutLabel = () => {
    if (!verification) return '';
    switch (verification.statut) {
      case 'en_retard': return 'En retard';
      case 'pac_attendu': return 'PAC attendu';
      case 'pac_soumis': return 'PAC soumis';
      case 'pac_accepte': return 'PAC accepté';
      default: return verification.statut;
    }
  };
  
  if (!verification || !ecart) {
    return (
      <div className="card border-border">
        <div className="card-content py-12 text-center text-muted-foreground">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-body">Aucun écart à suivre pour cette surveillance</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6" data-role={userRole} data-module="checklist-suivi-ecarts">
      
      {/* En-tête */}
      <div className="card border-l-4 border-l-warning bg-gradient-to-r from-warning/10 to-warning/5">
        <div className="card-content p-4">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-warning-soft rounded-lg">
                <AlertTriangle className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">SUIVI DES ÉCARTS</p>
                <p className="font-bold text-small">Vérification terrain des écarts non résolus</p>
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
          
          {/* Carte écart */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="code-oaci-badge text-xs">{verification.ecart_reference}</span>
              <span className={getEcartNiveauBadge()}>{verification.ecart_niveau}</span>
              <span className={getStatutBadge()}>{getStatutLabel()}</span>
            </div>
            <p className="text-sm text-foreground mb-2">{verification.ecart_libelle}</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Échéance: <span className="font-medium">{new Date(verification.date_echeance).toLocaleDateString('fr-FR')}</span>
              </span>
              {verification.progression_pac !== undefined && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Progression PAC: <span className="font-medium">{verification.progression_pac}%</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Barre de progression */}
      <div className="card border-border">
        <div className="card-content p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-small font-medium">Items: {stats.total}</span>
                <div className="flex items-center gap-2">
                  <span className="badge success text-[12px]">SA: {stats.sa}</span>
                  <span className="badge danger text-[12px]">NS: {stats.ns}</span>
                  <span className="badge warning text-[12px]">À vérifier: {stats.nv}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-small">Progression: {stats.progression}%</span>
                <button type="button" onClick={() => onSave?.(verification)} className="btn btn-sm px-3 py-1 btn-secondary">
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
      
      {/* Suggestions */}
      <SuggestionsBanner
        suggestions={suggestions}
        onAcceptAll={handleAcceptAllSuggestions}
        onIgnore={handleIgnoreSuggestions}
      />
      
      {/* Liste des items groupés par domaine */}
      {(() => {
        const itemsParDomaine = grouperParDomaine(verification.items, verification.domaine || 'SGS');
        return (
          <div className="space-y-4">
            {itemsParDomaine.map((groupe: DomaineItems<SuiviItem>) => (
              <div key={groupe.domaine} className="border rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600/5 to-transparent border-b">
                  <span className="inline-flex items-center justify-center w-7 h-6 rounded-md text-[10px] font-bold bg-blue-600 text-white">
                    {groupe.domaine}
                  </span>
                  <span className="text-sm font-medium text-foreground">{groupe.domaineLabel}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                    {groupe.items.length} item(s)
                  </span>
                </div>
                <div className="p-2 space-y-2 bg-white">
                  {groupe.items.map((item, idx) => (
                    <SuiviItemCard
                      key={item.id}
                      item={item}
                      index={idx}
                      readOnly={readOnly || isSigned}
                      onUpdate={handleUpdateItem}
                      onAddFile={handleAddFile}
                      onDeleteFile={handleDeleteFile}
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
                {verification.observations_generales || 'Aucune observation générale'}
              </p>
            </div>
            {!readOnly && !isSigned && (
              <button
                onClick={() => setObservationsModalOpen(true)}
                className="action-button"
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
                  Signer le suivi des écarts
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
        observations={verification.observations_generales || ''}
        onSave={handleSaveObservations}
        readOnly={readOnly || isSigned}
      />
      
      {/* Modal signature */}
      {signatureDialogOpen && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title">Signature du suivi des écarts</div>
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

export default SurveillanceChecklistSuiviEcarts;