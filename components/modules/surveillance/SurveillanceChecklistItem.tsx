// components/modules/surveillance/SurveillanceChecklistItem.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle,
  XCircle,
  MinusCircle,
  AlertCircle,
  FileText,
  Download,
  Trash2,
  Edit3,
  Check,
  X,
  Eye,
  Info,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { FileUploader } from '@/components/ui/FileUploader';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

export type ResultatChecklist = 'SA' | 'NS' | 'NA' | 'NV';

export interface ChecklistItemData {
  id: string;
  numero: string;
  reference_reglementaire: string;
  point_verification: string;
  directive_preuve: string;
  domaine: string;
  sous_domaine: string;
  type?: 'standard' | 'custom';
}

export interface ChecklistItemState {
  itemId: string;
  resultat?: ResultatChecklist;
  observation?: string;
  fichiers?: {
    nom: string;
    url: string;
    dateUpload: string;
  }[];
  lastModified: string;
  prediction?: ResultatChecklist;
  confiance?: number;
  justification?: string;
  alerte?: boolean;
  prefill?: boolean;
}

interface SurveillanceChecklistItemProps {
  item: ChecklistItemData;
  state: ChecklistItemState;
  readOnly?: boolean;
  onResultatChange: (itemId: string, resultat: ResultatChecklist) => void;
  onObservationChange: (itemId: string, observation: string) => void;
  onFileUpload: (itemId: string, file: { nom: string; url: string }) => void;
  onFileDelete: (itemId: string, fileUrl: string) => void;
  onDeleteItem?: (itemId: string) => void;
  onUpdateItem?: (itemId: string, field: string, value: string) => void;
}

const RESULTAT_CONFIG: Record<ResultatChecklist, {
  label: string;
  color: string;
  icon: any;
  description: string;
}> = {
  SA: {
    label: 'Satisfaisant',
    color: 'bg-success/20 text-success-800 border-success',
    icon: CheckCircle,
    description: 'Conforme aux exigences'
  },
  NS: {
    label: 'Non satisfaisant',
    color: 'bg-danger/20 text-danger-800 border-danger',
    icon: XCircle,
    description: 'Non conforme, écart à traiter'
  },
  NA: {
    label: 'Non applicable',
    color: 'bg-gray-100 text-gray-600 border-gray-300',
    icon: MinusCircle,
    description: 'Ne s\'applique pas à cet aérodrome'
  },
  NV: {
    label: 'Non vérifié',
    color: 'bg-warning/20 text-warning-800 border-warning',
    icon: AlertCircle,
    description: 'À vérifier lors de la visite'
  },
};

// Composant: Indicateur de confiance (mini)
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
      <div className="w-8 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${confiance}%` }} />
      </div>
      <span className="text-[8px] text-muted-foreground">{confiance}%</span>
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
        className="action-button h-5 w-5 p-0 text-primary"
        title="Pourquoi cette suggestion ?"
      >
        <Info className="w-3 h-3" />
      </button>
      {showPopup && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-64 bg-background border border-border rounded-lg shadow-lg p-2">
          <p className="text-xs text-muted-foreground">{justification}</p>
          <div className="text-[9px] text-muted-foreground mt-1 pt-1 border-t border-border">
            Confiance: {confiance}%
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dropdown contextuel pour custom items ────────────────────────────────────
function ItemDropdown({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="action-button h-6 w-6 p-0"
        onClick={() => setOpen(o => !o)}
      >
        <Edit3 className="h-3 w-3" />
      </button>
      {open && (
        <div className="dropdown-menu absolute left-0 z-50 min-w-[140px]">
          <button
            className="dropdown-item danger"
            onClick={() => { onDelete(); setOpen(false); }}
          >
            <Trash2 className="h-4 w-4 mr-2 text-danger" />
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

export function SurveillanceChecklistItem({
  item,
  state,
  readOnly = false,
  onResultatChange,
  onObservationChange,
  onFileUpload,
  onFileDelete,
  onDeleteItem,
  onUpdateItem,
}: SurveillanceChecklistItemProps) {
  const [editingField, setEditingField] = useState<'reference' | 'point' | 'directive' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showPredictionInfo, setShowPredictionInfo] = useState(false);
  const predictionInfoRef = useRef<HTMLDivElement>(null);

  const handleStartEdit = (field: 'reference' | 'point' | 'directive', value: string) => {
    if (readOnly || item.type !== 'custom') return;
    setEditingField(field);
    setEditValue(value);
  };

  const handleSaveEdit = () => {
    if (editingField && onUpdateItem) {
      onUpdateItem(item.id, editingField, editValue);
      setEditingField(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingField(null);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (predictionInfoRef.current && !predictionInfoRef.current.contains(e.target as Node)) {
        setShowPredictionInfo(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Résultat à afficher (priorité au résultat saisi, sinon prédiction)
  const currentResultat = state.resultat || state.prediction || 'NV';
  const resultatConfig = RESULTAT_CONFIG[currentResultat as ResultatChecklist];
  const ResultatIcon = resultatConfig.icon;
  const hasPrediction = state.prediction && !state.resultat;
  const isPrefilled = state.prefill === true;
  const isAlerte = state.alerte === true;

  // Rendu d'une cellule éditable
  const renderEditableCell = (
    field: 'reference' | 'point' | 'directive',
    value: string,
    className: string = ''
  ) => {
    if (editingField === field) {
      return (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className={`form-input h-8 text-small ${focusClass}`}
            autoFocus
          />
          <button
            type="button"
            className="action-button h-7 w-7 p-0 text-success"
            onClick={handleSaveEdit}
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="action-button h-7 w-7 p-0 text-danger"
            onClick={handleCancelEdit}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      );
    }

    return (
      <div
        className={`group flex items-start gap-1 cursor-pointer hover:bg-role-primary-soft p-1 rounded ${className}`}
        onClick={() => handleStartEdit(field, value)}
      >
        <span className="text-small flex-1 line-clamp-3">{value}</span>
        {item.type === 'custom' && !readOnly && (
          <Edit3 className="h-3 w-3 opacity-0 group-hover:opacity-100 text-gray-400 flex-shrink-0 mt-1" />
        )}
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-12 gap-4 py-3 border-t hover:bg-role-primary-soft transition-colors group relative ${isAlerte ? 'bg-danger/5' : ''}`}>
      {/* Menu contextuel pour items personnalisés */}
      {item.type === 'custom' && !readOnly && onDeleteItem && (
        <div className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100">
          <ItemDropdown onDelete={() => onDeleteItem(item.id)} />
        </div>
      )}

      {/* Colonne 1: N° */}
      <div className="col-span-1 font-mono text-small text-gray-600 flex items-center gap-1">
        {item.numero}
        {isPrefilled && (
          <span title="Prérempli par le système"><Sparkles className="w-3 h-3 text-primary" /></span>
        )}
        {isAlerte && (
          <span title="Alerte système"><AlertTriangle className="w-3 h-3 text-danger" /></span>
        )}
        {item.type === 'custom' && (
          <span className="badge outline ml-1 text-[8px] bg-amber-50">+</span>
        )}
      </div>

      {/* Colonne 2: Réf. réglementaire - ÉDITABLE */}
      <div className="col-span-2">
        {renderEditableCell('reference', item.reference_reglementaire)}
      </div>

      {/* Colonne 3: Point à vérifier - ÉDITABLE */}
      <div className="col-span-2">
        {renderEditableCell('point', item.point_verification)}
      </div>

      {/* Colonne 4: Directive - ÉDITABLE */}
      <div className="col-span-2">
        {renderEditableCell('directive', item.directive_preuve)}
      </div>

      {/* Colonne 5: État SA/NS/NA/NV + Prédiction */}
      <div className="col-span-1">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => !readOnly && onResultatChange(item.id, currentResultat === 'SA' ? 'NV' : currentResultat === 'NS' ? 'NV' : 'SA')}
            disabled={readOnly}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
              resultatConfig.color
            }`}
          >
            <ResultatIcon className="h-3 w-3" />
            <span className="font-medium">{currentResultat}</span>
          </button>
          
          {hasPrediction && !readOnly && (
            <div className="flex items-center gap-1 mt-0.5">
              <ConfidenceIndicator confiance={state.confiance || 0} />
              <div className="relative" ref={predictionInfoRef}>
                <button
                  type="button"
                  onClick={() => setShowPredictionInfo(!showPredictionInfo)}
                  className="action-button h-4 w-4 p-0"
                  title="Pourquoi cette suggestion ?"
                >
                  <Info className="w-2.5 h-2.5" />
                </button>
                {showPredictionInfo && (
                  <div className="absolute bottom-full left-0 mb-1 z-50 w-48 bg-background border border-border rounded-lg shadow-lg p-2">
                    <p className="text-[10px] text-muted-foreground">{state.justification || 'Prédiction basée sur l\'historique'}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Colonne 6: Observations + Fichiers */}
      <div className="col-span-4 space-y-2">
        <textarea
          value={state.observation || ''}
          onChange={(e) => onObservationChange(item.id, e.target.value)}
          placeholder="Observations..."
          className={`form-textarea text-small min-h-[60px] ${focusClass}`}
          disabled={readOnly}
        />

        {/* Liste des fichiers */}
        {state.fichiers && state.fichiers.length > 0 && (
          <div className="space-y-1">
            {state.fichiers.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs bg-role-primary-soft p-1.5 rounded border">
                <FileText className="h-3 w-3 text-primary" />
                <span className="flex-1 truncate text-small">{f.nom}</span>
                <span className="text-[10px] text-gray-400">
                  {new Date(f.dateUpload).toLocaleTimeString()}
                </span>
                <button
                  type="button"
                  className="action-button h-5 w-5 p-0"
                  onClick={() => window.open(f.url, '_blank')}
                >
                  <Eye className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="action-button h-5 w-5 p-0"
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = f.url;
                    link.download = f.nom;
                    link.click();
                  }}
                >
                  <Download className="h-3 w-3" />
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="action-button danger h-5 w-5 p-0"
                    onClick={() => onFileDelete(item.id, f.url)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Bouton upload */}
        {!readOnly && (
          <FileUploader
            onUpload={(file) => onFileUpload(item.id, file)}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
          />
        )}
      </div>
    </div>
  );
}