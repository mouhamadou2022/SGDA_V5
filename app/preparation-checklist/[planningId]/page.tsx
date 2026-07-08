// app/preparation-checklist/[planningId]/page.tsx
// Contexte : Préparation (pré-visite) — PAS de signature de validation
// La signature d'approbation (SignaturePadWithColor) est UNIQUEMENT
// dans SurveillanceChecklistStandard (contexte Exécution).
//
// Modes supportés :
//   ?type=standard  → ChecklistFormContent (tous domaines, y compris SGS + bouton PAOE)
//   ?type=pac       → PACChecklistItem
//   ?type=suivi     → SuiviEcartChecklistItem
//   ?type=mixte     → onglets Standard / PAC / Suivi dans la même page
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import type { Ecart } from '@/lib/store';
import {
  ArrowLeft, Save, Wifi, WifiOff, ClipboardList, Brain, Sparkles,
  AlertTriangle, Shield, CheckCircle2, AlertCircle, ChevronDown,
  Activity, LayoutGrid, FileText, Eye, Trash2, Upload, X, Check, Loader2,
} from 'lucide-react';
import { kitDocAgent, toDomaineChecklistArray } from '@/lib/ia/agents/kitDocAgent';
import type { DomaineChecklist, ChecklistItem, EvaluationSGS, PAOELevel, EvaluationAction } from '@/types/checklist';
import { computeEvaluationActionScore } from '@/types/checklist';
import { ChecklistStandardTable } from '@/components/modules/checklist/ChecklistStandardTable';
import { SGSEvaluationModal, SGSEvaluationContent } from '@/components/modules/surveillance/SGSEvaluation';
import { EcartEvaluationCard } from '@/components/modules/surveillance';
import type { EcartEvaluation, NiveauRisque } from '@/components/modules/surveillance';
import { getDomaineLabel, getDomaineCode } from '@/lib/domaines';
import { getCellColor } from '@/lib/risque';
import { ChatIALateral } from '@/components/checklist-editor/ChatIALateral';
import { checklistAgent } from '@/lib/ia/agents/checklistAgent';

// ─────────────────────────────────────────────────────────────
// Helper — normalisation des domaines chargés
// ChecklistFormContent utilise `domaine.isExpanded` pour
// expand/collapse. Si le champ est absent (undefined) après
// désérialisation, les items sont invisibles.
// ─────────────────────────────────────────────────────────────
function normalizeDomaines(domaines: DomaineChecklist[]): DomaineChecklist[] {
  return domaines.map(d => ({
    ...d,
    isExpanded: d.isExpanded !== false,
    items: d.items ?? [],
    sousDomaines: (d.sousDomaines ?? []).map(sd => ({
      ...sd,
      isExpanded: sd.isExpanded !== false,
      items: sd.items ?? [],
      sousSousDomaines: (sd.sousSousDomaines ?? []).map(ssd => ({
        ...ssd,
        isExpanded: ssd.isExpanded !== false,
        items: ssd.items ?? [],
      })),
    })),
  }));
}

function excludeSGSDomaines(domaines: DomaineChecklist[], _portee: string[]): DomaineChecklist[] {
  return domaines.filter(d => (d.nom || d.id || '').toUpperCase() !== 'SGS');
}

// ─────────────────────────────────────────────────────────────
// IndexedDB Offline Sync
// ─────────────────────────────────────────────────────────────

const DB_NAME = 'sgda-offline';
const DB_VERSION = 1;
const STORE_NAME = 'checklists';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(key: string): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result?.data || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function dbPut(key: string, data: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: key, data, ts: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    try { localStorage.setItem(`sgda-offline-${key}`, JSON.stringify(data)); } catch {}
  }
}

async function dbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    try { localStorage.removeItem(`sgda-offline-${key}`); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────
// Item PAC
// ─────────────────────────────────────────────────────────────

interface PreuveItem {
  id: string;
  nom: string;
  url: string;
  dateUpload: string;
}

interface PACItem {
  id: string;
  ecart_id: string;
  reference: string;
  description: string;
  responsable: string;
  date_prevue: string;
  statut_origine: string;
  resultat?: 'SA' | 'NS' | 'NV';
  observation?: string;
  prediction?: 'SA' | 'NS' | 'NV';
  confiance?: number;
  justification?: string;
  prefilled?: boolean;
  alerte?: boolean;
  ordre: number;
  domaine?: string;
  livrables?: string[];
  preuves?: PreuveItem[];
  // Rappel écart source
  ecart_libelle?: string;
  ecart_niveau_risque?: string;
  ecart_cellule_oaci?: string;
  // Risque résiduel évalué par l'inspecteur
  risque_residuel?: string;
  risque_residuel_oaci?: string;
  // Évaluation 6 critères (pré-remplissage)
  evaluation_action?: EvaluationAction;
}

function ResultatBadge({ resultat }: { resultat: string }) {
  const colors: Record<string, string> = {
    SA: 'bg-success/20 text-success border-success',
    NS: 'bg-danger/20 text-danger border-danger',
    NA: 'bg-gray-200 text-gray-600 border-gray-300',
    NV: 'bg-warning/20 text-warning border-warning',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colors[resultat] || colors.NV}`}>
      {resultat || 'NV'}
    </span>
  );
}

function PreuveModal({ isOpen, onClose, itemRef, preuves, onAdd, onRemove }: {
  isOpen: boolean; onClose: () => void; itemRef: string;
  preuves: PreuveItem[]; onAdd: (p: PreuveItem) => void; onRemove: (id: string) => void;
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

function PACChecklistItem({ item, onUpdate }: { item: PACItem; onUpdate: (item: PACItem) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [preuveOpen, setPreuveOpen] = useState(false);
  const [preuveWarning, setPreuveWarning] = useState<'SA' | 'NV' | null>(null);
  const [observation, setObservation] = useState(item.observation || '');
  const [selectedResultat, setSelectedResultat] = useState<'SA' | 'NS' | 'NV'>(item.resultat || 'NV');
  const [risqueResiduel, setRisqueResiduel] = useState(item.risque_residuel || '');
  const initialOACI = item.risque_residuel_oaci || item.ecart_cellule_oaci || '';
  const [risqueResiduelOACI, setRisqueResiduelOACI] = useState(/^[1-5][A-E]$/.test(initialOACI) ? initialOACI : '');
  const [oaciEditing, setOaciEditing] = useState(false);
  const [criteriaState, setCriteriaState] = useState<Omit<EvaluationAction, 'score' | 'decision'>>({
    realisation: item.evaluation_action?.realisation ?? null,
    conformitePAC: item.evaluation_action?.conformitePAC ?? null,
    efficacite: item.evaluation_action?.efficacite ?? null,
    perennite: item.evaluation_action?.perennite ?? null,
    preuves: item.evaluation_action?.preuves ?? null,
    effetsSecondaires: item.evaluation_action?.effetsSecondaires ?? null,
    observation: item.evaluation_action?.observation || '',
  });
  const criteriaScore = useMemo(() => computeEvaluationActionScore(criteriaState), [criteriaState]);

  // Auto-sauvegarde évaluation
  useEffect(() => {
    onUpdate({ ...item, evaluation_action: { ...criteriaState, ...criteriaScore } });
  }, [criteriaScore.score]);

  const handleCriteriaToggle = (key: keyof Omit<EvaluationAction, 'score' | 'decision'>, value: boolean) => {
    setCriteriaState(prev => ({ ...prev, [key]: prev[key] === value ? null : value }));
  };

  const handleResultatChange = (r: 'SA' | 'NS' | 'NV') => {
    if ((r === 'SA' || r === 'NV') && (!item.preuves || item.preuves.length === 0)) {
      setPreuveWarning(r);
      setPreuveOpen(true);
      return;
    }
    setPreuveWarning(null);
    setSelectedResultat(r);
    if (r === 'NS') {
      const reset = { conformitePAC: null as boolean | null, efficacite: null as boolean | null, perennite: null as boolean | null, preuves: null as boolean | null, effetsSecondaires: null as boolean | null };
      setCriteriaState(prev => ({ ...prev, realisation: false, ...reset, observation: '' }));
    } else if (r === 'SA') {
      setCriteriaState(prev => ({ ...prev, realisation: true }));
    }
    onUpdate({ ...item, resultat: r });
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

  const isPrefilled = item.prefilled === true;
  const currentResultat = item.resultat || 'NV';
  const getEcheanceClass = () => {
    const echeance = new Date(item.date_prevue);
    const aujourdhui = new Date();
    const diffJours = Math.ceil((echeance.getTime() - aujourdhui.getTime()) / (1000 * 60 * 60 * 24));
    if (diffJours < 0) return 'text-danger';
    if (diffJours < 7) return 'text-warning';
    return 'text-muted-foreground';
  };

  return (
    <div className={`border border-border rounded-lg mb-3 overflow-hidden ${isPrefilled ? 'border-l-4 border-l-purple-400' : 'border-l-4 border-l-role-primary'} ${item.alerte ? 'border-l-danger' : ''}`}>
      {/* En-tête */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-role-primary/5 to-transparent cursor-pointer hover:bg-role-primary-soft transition-colors"
        onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-6 rounded-md text-[11px] font-bold bg-blue-900 text-white">{getDomaineCode(item.domaine || 'SGS')}</span>
          <span className="text-[12px] font-medium text-foreground">{getDomaineLabel(getDomaineCode(item.domaine || 'SGS'))}</span>
          {item.reference && <span className="code-oaci-badge text-[12px]">{item.reference}</span>}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${currentResultat === 'SA' ? 'badge success' : currentResultat === 'NS' ? 'badge danger' : 'badge warning'}`}>
            {currentResultat}
          </span>
          {isPrefilled && <Sparkles className="w-3 h-3 text-purple-500" />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-muted-foreground">Action {item.ordre + 1}</span>
          {item.evaluation_action && item.evaluation_action.decision !== 'non_evaluee' && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${item.evaluation_action.decision === 'validee' ? 'bg-success/20 text-success border-success' : item.evaluation_action.decision === 'partielle' ? 'bg-warning/20 text-warning border-warning' : 'bg-danger/20 text-danger border-danger'}`}>
              {item.evaluation_action.score}%
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform" />
        </div>
      </div>

      {/* Rappel écart source */}
      {item.ecart_libelle && (
        <div className={`px-3 py-1.5 ${item.ecart_niveau_risque === 'critique' ? 'bg-gradient-to-r from-red-50 to-red-100 border-red-200' : item.ecart_niveau_risque === 'eleve' ? 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-200' : item.ecart_niveau_risque === 'moyen' ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200' : 'bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200'} border-b flex items-center gap-3 flex-wrap`}>
          <span className={`text-[12px] font-medium ${item.ecart_niveau_risque === 'critique' ? 'text-red-900' : item.ecart_niveau_risque === 'eleve' ? 'text-amber-900' : item.ecart_niveau_risque === 'moyen' ? 'text-blue-900' : 'text-emerald-900'}`}>Écart : {item.ecart_libelle}</span>
          {item.ecart_niveau_risque && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${item.ecart_niveau_risque === 'critique' ? 'badge danger animate-pulse' : item.ecart_niveau_risque === 'eleve' ? 'badge warning' : item.ecart_niveau_risque === 'moyen' ? 'badge primary' : 'badge success'}`}>
              {item.ecart_niveau_risque}
            </span>
          )}
          {item.ecart_cellule_oaci && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${getCellColor(item.ecart_cellule_oaci)}`}>
              {item.ecart_cellule_oaci}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="bg-gray-50/70">
          {/* Table 4 colonnes */}
          <div className="border border-blue-100 rounded-lg mx-3 my-2 overflow-hidden">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-blue-50 border-b border-blue-200">
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[35%]">Action corrective</th>
                  <th className="p-1.5 text-center text-[11px] font-bold text-foreground border-r border-blue-100 w-32 min-w-[7rem] max-w-[9rem]">Preuve</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[20%]">État</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground w-[30%]">Observation</th>
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
                      <div className="flex gap-1">
                        {(['SA', 'NS', 'NV'] as const).map(r => (
                          <button key={r} type="button" onClick={() => handleResultatChange(r)}
                            className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-bold border transition-all ${selectedResultat === r ? (r === 'SA' ? 'bg-success text-white border-success' : r === 'NS' ? 'bg-danger text-white border-danger' : 'bg-warning text-white border-warning') : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>{r === 'SA' ? 'Réalisée' : r === 'NS' ? 'Non réalisée' : 'En cours'}</button>
                        ))}
                      </div>
                      {preuveWarning && (
                        <p className="text-[10px] text-danger flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Preuve requise
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="p-1.5 align-top">
                    <textarea value={observation} onChange={e => handleObservationChange(e.target.value)}
                      placeholder="Observation terrain..." rows={2}
                      className="form-textarea w-full text-[13px] resize-none" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Prédiction système */}
          {!item.resultat && item.prediction && item.confiance && (
            <div className="mx-3 mb-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 text-[11px]">
                <Brain className="w-3 h-3 text-primary" />
                <span className="font-medium text-primary">
                  Prédiction : {item.prediction === 'SA' ? 'Satisfaisant (SA)' : 'Non satisfaisant (NS)'}
                </span>
                <span className="text-[11px] text-primary font-medium">({item.confiance}%)</span>
                {item.justification && (
                  <span className="text-[10px] text-muted-foreground ml-1">{item.justification}</span>
                )}
              </div>
            </div>
          )}

          {/* Évaluation 6 critères */}
          <div className="mx-3 mb-2">
            <p className="text-[12px] font-semibold text-muted-foreground mb-1">Évaluation des critères</p>
            <div className="border border-blue-100 rounded-lg overflow-hidden">
              <div className="grid grid-cols-6">
                {([
                  { key: 'realisation' as const, label: 'Réalisation' },
                  { key: 'conformitePAC' as const, label: 'Conformité' },
                  { key: 'efficacite' as const, label: 'Efficacité' },
                  { key: 'perennite' as const, label: 'Pérennité' },
                  { key: 'preuves' as const, label: 'Preuves' },
                  { key: 'effetsSecondaires' as const, label: 'Effets second.' },
                ]).map(({ key, label }) => (
                  <div key={key} className="border-r border-blue-100 last:border-r-0">
                    <div className="p-1 text-[10px] font-semibold text-center text-muted-foreground bg-blue-50/50 border-b border-blue-100">{label}</div>
                    <div className="flex gap-0.5 justify-center p-1">
                      <button type="button" onClick={() => handleCriteriaToggle(key, true)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${criteriaState[key] === true ? 'bg-success text-white border-success' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}`}>Oui</button>
                      <button type="button" onClick={() => handleCriteriaToggle(key, false)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${criteriaState[key] === false ? 'bg-danger text-white border-danger' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'}`}>Non</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold">Score: {criteriaScore.score}%</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${criteriaScore.decision === 'validee' ? 'bg-success/20 text-success border-success' : criteriaScore.decision === 'partielle' ? 'bg-warning/20 text-warning border-warning' : criteriaScore.decision === 'non_validee' ? 'bg-danger/20 text-danger border-danger' : 'bg-gray-200 text-gray-500 border-gray-300'}`}>
                  {criteriaScore.decision === 'validee' ? 'Validée' : criteriaScore.decision === 'partielle' ? 'Partielle' : criteriaScore.decision === 'non_validee' ? 'Non validée' : 'Non évaluée'}
                </span>
              </div>
              {criteriaScore.decision !== 'non_evaluee' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">Conclusion :</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${criteriaScore.score >= 75 ? 'bg-success text-white border-success' : 'bg-danger text-white border-danger'}`}>
                    {criteriaScore.score >= 75 ? 'SA' : 'NS'}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${criteriaScore.score >= 75 ? 'bg-success/20 text-success border-success' : criteriaScore.score >= 25 ? 'bg-warning/20 text-warning border-warning' : 'bg-danger/20 text-danger border-danger'}`}>
                    {criteriaScore.score >= 75 ? '100%' : criteriaScore.score >= 25 ? '75%' : criteriaScore.score > 0 ? '25%' : '0%'}
                  </span>
                </div>
              )}
              {/* Risque résiduel */}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground">Risque résiduel :</span>
                <div className="flex gap-1">
                  {['faible', 'moyen', 'eleve', 'critique'].map(niveau => (
                    <button key={niveau} type="button"
                      onClick={() => handleRisqueResiduelChange(risqueResiduel === niveau ? '' : niveau)}
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
                      onBlur={() => setOaciEditing(false)} autoFocus maxLength={2}
                      className="w-14 text-center text-[11px] font-bold border border-blue-300 rounded bg-white px-1 py-0.5" />
                  ) : (
                    <button type="button" onClick={() => setOaciEditing(true)}
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
          </div>
        </div>
      )}

      {/* Modal preuve */}
      <PreuveModal
        isOpen={preuveOpen}
        onClose={() => setPreuveOpen(false)}
        itemRef={item.reference}
        preuves={item.preuves || []}
        onAdd={(p) => onUpdate({ ...item, preuves: [...(item.preuves || []), p] })}
        onRemove={(id) => onUpdate({ ...item, preuves: (item.preuves || []).filter(x => x.id !== id) })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helper : niveau de maturité PAOE pour un écart SGS
// ─────────────────────────────────────────────────────────────

function getNiveauMaturiteForEcart(ecart: Ecart, sgsEval?: EvaluationSGS | null): PAOELevel | undefined {
  if (ecart.domaine !== 'SGS') return undefined;
  if (sgsEval?.composantes) {
    const m = ecart.ref_reglementaire?.match(/Composante\s+(\d)/i);
    if (m) {
      const comp = sgsEval.composantes.find(c => c.id === parseInt(m[1]) as 1|2|3|4|5);
      if (comp) return comp.niveauGlobal;
    }
    for (const comp of sgsEval.composantes) {
      if (ecart.ref_reglementaire?.includes(comp.label)) return comp.niveauGlobal;
    }
  }
  const niveauxRisque: Record<string, PAOELevel> = { critique: 'absent', eleve: 'present', moyen: 'approprie', faible: 'operationnel' };
  return niveauxRisque[ecart.niveau_risque] || 'present';
}

// ─────────────────────────────────────────────────────────────
// Migration d'anciens SuiviEcartItem → EcartEvaluation
// ─────────────────────────────────────────────────────────────

function migrateSuiviItem(old: any, ecarts?: Ecart[], sgsEval?: EvaluationSGS | null): EcartEvaluation {
  if (old.criticite && old.risque_initial !== undefined) {
    const ecart = ecarts?.find(e => e.id === old.ecart_id);
    return { ...old, reference: ecart?.reference || old.reference || '' };
  }
  const ecartSrc = ecarts?.find(e => e.id === old.ecart_id);
  return {
    id: old.id,
    ecart_id: old.ecart_id,
    reference: ecartSrc?.reference || old.reference || '',
    libelle: old.libelle || 'Écart sans libellé',
    niveau_risque: (old.niveau_risque || 'moyen') as NiveauRisque,
    statut_mesure: old.statut_mesure || 'aucune',
    mesure_description: old.action_prevue || '',
    preuves: old.preuves || [],
    risque_initial: (old.risque_initial || old.niveau_risque || 'moyen') as NiveauRisque,
    niveau_maturite: old.niveau_maturite || (ecartSrc ? getNiveauMaturiteForEcart(ecartSrc, sgsEval) : undefined),
    niveau_maturite_residuel: old.niveau_maturite_residuel,
    criticite: {
      defenses_existantes: { valeur: null },
      facteurs_aggravants: { valeur: null },
      recurrence: { valeur: null },
      impact_operationnel: { valeur: null },
      delai_correction: { valeur: null },
      ...(old.criticite || {}),
    },
    commentaire: old.observation || old.commentaire,
    conclusion: (old.resultat || old.conclusion) as 'SA' | 'NS' | 'NV' | undefined,
    ordre: old.ordre ?? 0,
    isExpanded: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Sous-composant : contenu standard (ChecklistFormContent + SGS)
// ─────────────────────────────────────────────────────────────
function StandardContent({
  domaines,
  onChangeDomaines,
  sgsEvaluation,
  onSaveSGS,
  planningId,
  aerodromeId,
  planningType,
  planningDateDebut,
  equipeIds,
  user,
  autoOpenSGS = false,
}: {
  domaines: DomaineChecklist[];
  onChangeDomaines: (d: DomaineChecklist[]) => void;
  sgsEvaluation: EvaluationSGS | null;
  onSaveSGS: (e: EvaluationSGS) => void;
  planningId: string;
  aerodromeId: string;
  planningType: string;
  planningDateDebut: string;
  equipeIds: string[];
  user: any;
  /** Ouvre automatiquement l'évaluation SGS (PAOE) dès le montage */
  autoOpenSGS?: boolean;
}) {
  const [sgsOpen, setSgsOpen] = useState(autoOpenSGS);

  const hasSGSDomain = domaines.some(d => d.nom?.toUpperCase().includes('SGS'));

  return (
    <>
      {/* Bouton PAOE SGS — uniquement si domaine SGS présent */}
      {hasSGSDomain && (
        <div className="card border-l-4 border-l-role-primary bg-gradient-to-r from-role-primary/5 to-transparent">
          <div className="card-content p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-role-primary" />
                <div>
                  <p className="font-semibold text-sm">Évaluation de la maturité SGS</p>
                  <p className="text-xs text-muted-foreground">
                    {sgsEvaluation
                      ? `Évaluation enregistrée: ${sgsEvaluation.scoreGlobal}%`
                      : 'Évaluez les 5 composantes du SGS avec le modèle PAOE (OACI Annexe 19)'}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setSgsOpen(true)} className="btn btn-sm px-4 py-2 btn-primary">
                <Shield className="w-4 h-4" />
                {sgsEvaluation ? "Modifier l'évaluation" : 'Évaluer le SGS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checklist standard — même design que l'exécution */}
      <ChecklistStandardTable
        domaines={domaines}
        onUpdateItem={(updated: ChecklistItem) => {
          const replaceItem = (items: ChecklistItem[]) =>
            items.map(i => i.id === updated.id ? updated : i);
          onChangeDomaines(domaines.map(d => ({
            ...d,
            items: replaceItem(d.items ?? []),
            sousDomaines: (d.sousDomaines ?? []).map(sd => ({
              ...sd,
              items: replaceItem(sd.items ?? []),
              sousSousDomaines: (sd.sousSousDomaines ?? []).map(ssd => ({
                ...ssd,
                items: replaceItem(ssd.items ?? []),
              })),
            })),
          })));
        }}
        onUpdateDomaines={onChangeDomaines}
        readOnly={false}
      />
      {/* Note: modeSaisie géré par défaut ('clavier') — la préparation n'a pas de header sticky avec wifi */}

      {/* Modal SGS PAOE — UNIQUEMENT en préparation ici.
          En exécution, c'est SurveillanceChecklistStandard qui le gère. */}
      {hasSGSDomain && (
        <SGSEvaluationModal
          isOpen={sgsOpen}
          onClose={() => setSgsOpen(false)}
          aerodromeId={aerodromeId}
          surveillanceId={planningId}
          surveillanceType={planningType}
          surveillanceDate={planningDateDebut}
          equipeCount={equipeIds?.length}
          inspecteurId={user?.id || ''}
          inspecteurNom={`${user?.prenom || ''} ${user?.nom || ''}`}
          onSave={(evaluation) => { onSaveSGS(evaluation); setSgsOpen(false); }}
          existingEvaluation={sgsEvaluation}
          readOnly={false}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Composant SGS direct — évaluation PAOE uniquement (pas de checklist standard)
// ─────────────────────────────────────────────────────────────

function SGSEvaluationDirect({
  sgsEvaluation, onSaveSGS, planningId, aerodromeId, aerodromeNom, planningType, planningDateDebut, equipeIds, user,
}: {
  sgsEvaluation: EvaluationSGS | null;
  onSaveSGS: (e: EvaluationSGS) => void;
  planningId: string;
  aerodromeId: string;
  aerodromeNom?: string;
  planningType: string;
  planningDateDebut: string;
  equipeIds: string[];
  user: any;
}) {
  return (
    <SGSEvaluationContent
      aerodromeId={aerodromeId}
      surveillanceId={planningId}
      aerodromeNom={aerodromeNom}
      surveillanceType={planningType}
      surveillanceDate={planningDateDebut}
      equipeCount={equipeIds?.length}
      inspecteurId={user?.id || ''}
      inspecteurNom={`${user?.prenom || ''} ${user?.nom || ''}`}
      onSave={onSaveSGS}
      existingEvaluation={sgsEvaluation}
      readOnly={false}
      onBack={() => window.history.back()}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Page principale
// ─────────────────────────────────────────────────────────────

type ChecklistMode = 'standard' | 'pac' | 'suivi' | 'mixte' | 'sgs';
type MixteTab = 'standard' | 'pac' | 'suivi';

export default function PreparationChecklistPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planningId = params.planningId as string;
  const checklistType = (searchParams.get('type') || 'standard') as ChecklistMode;
  const isMixte = checklistType === 'mixte';
  // ?type=sgs → mode standard + auto-ouverture évaluation PAOE
  const isSgsMode = checklistType === 'sgs';

  const plannings = useAppStore(s => s.plannings);
  const aerodromes = useAppStore(s => s.aerodromes);
  const profilsRisque = useAppStore(s => s.profilsRisque);
  const ecarts = useAppStore(s => s.ecarts);
  const user = useAppStore(s => s.user);
  const updatePlanning = useAppStore(s => s.updatePlanning);
  const findMasterChecklistForPortee = useAppStore(s => s.findMasterChecklistForPortee);

  // ── États ──────────────────────────────────────────────────
  const [standardDomaines, setStandardDomaines] = useState<DomaineChecklist[]>([]);
  const [pacItems, setPacItems] = useState<PACItem[]>([]);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [suiviItems, setSuiviItems] = useState<EcartEvaluation[]>([]);
  const [sgsEvaluation, setSgsEvaluation] = useState<EvaluationSGS | null>(null);

  const [isOffline, setIsOffline] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [iaPrefilledCount, setIaPrefilledCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [iaBatchLoading, setIaBatchLoading] = useState(false);

  // Onglet actif en mode mixte
  const [mixteTab, setMixteTab] = useState<MixteTab>('standard');

  // Délégations (domaine → inspecteur) chargées depuis la préparation
  const [delegations, setDelegations] = useState<Record<string, string>>({});
  useEffect(() => {
    const raw = localStorage.getItem(`sgda_delegations_${planningId}`);
    if (raw) { try { setDelegations(JSON.parse(raw)) } catch { /* ignore */ } }
  }, [planningId]);

  // Filtrer les domaines selon les délégations (inspecteur ne voit que ses domaines)
  const filteredDomaines = useMemo(() => {
    const hasDelegations = Object.keys(delegations).some(k => delegations[k])
    if (!hasDelegations || !user?.id) return standardDomaines
    const isChef = user?.role === 'admin' || user?.role === 'inspector' && (user as any).poste === 'chef_dnsa'
    if (isChef) return standardDomaines // Chef voit tout
    return standardDomaines.filter(d => {
      const code = d.id?.toUpperCase() || d.nom?.toUpperCase() || ''
      // Domaines délégués à l'utilisateur OU domaines non assignés (visibles par tous)
      const isDelegated = delegations[code] === user.id
      const isUnassigned = !delegations[code]
      return isDelegated || isUnassigned
    })
  }, [standardDomaines, delegations, user?.id, user?.role]);

  const planning = plannings.find(p => p.id === planningId);
  const aerodrome = aerodromes.find(a => a.id === planning?.aerodrome_id);
  const profil = profilsRisque?.[planning?.aerodrome_id || ''] || undefined;

  const dataRef = useRef({ standardDomaines, pacItems, suiviItems, sgsEvaluation });
  dataRef.current = { standardDomaines, pacItems, suiviItems, sgsEvaluation };

  // ── Online/offline ─────────────────────────────────────────
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    setIsOffline(!navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  // ── Chargement ─────────────────────────────────────────────
  useEffect(() => {
    if (!planning) return;
    const typeSurv = (planning.type === 'inopinee' || planning.type === 'inopine') ? 'inopine'
      : planning.type === 'maintien' ? 'maintien' : 'periodique';
    const checklistPrefix = planning.type === 'certification' ? 'CERT'
      : planning.type === 'homologation' ? 'HMG' : 'QSC';

    // Détermine si on doit charger un type de données
    const needsStandard = checklistType === 'standard' || isMixte;
    const needsPAC = checklistType === 'pac' || isMixte;
    const needsSuivi = checklistType === 'suivi' || isMixte;
    // SGS mode : chargement de l'évaluation PAOE existante depuis le planning

    const load = async () => {
      try {
      // ── Standard ──
      if (needsStandard) {
        const key = `preparation-${planningId}-standard`;
        const offline = await dbGet(key);
        if (offline?.domaines) {
          setStandardDomaines(normalizeDomaines(excludeSGSDomaines(offline.domaines, planning.portee || [])));
          setHasChanges(true);
        } else if (planning.checklist_hierarchy?.length) {
          setStandardDomaines(normalizeDomaines(excludeSGSDomaines(planning.checklist_hierarchy as unknown as DomaineChecklist[], planning.portee || [])));
          if (planning.sgs_evaluation_prepa) setSgsEvaluation(planning.sgs_evaluation_prepa as EvaluationSGS);
          let cnt = 0;
          const walk = (d: any) => { cnt += (d.items || []).filter((i: ChecklistItem) => i.prefilled).length; (d.sousDomaines || []).forEach(walk); (d.sousSousDomaines || []).forEach(walk); };
          planning.checklist_hierarchy.forEach(d => walk(d));
          setIaPrefilledCount(prev => prev + cnt);
        } else {
          // Générer depuis le kit inspecteur
          const master = findMasterChecklistForPortee(planning.portee || []);
          if (master) {
            const snapshot = JSON.parse(JSON.stringify(master.checklist));
            const filtered = aerodrome ? kitDocAgent.filterChecklistByAerodrome(snapshot, aerodrome) : snapshot;
            const enriched = kitDocAgent.applyRiskProfileToChecklist(filtered, {
              entite_id: planning.aerodrome_id, type_entite: aerodrome?.type_entite ?? 'aerodrome',
              type_surveillance: typeSurv, portee: planning.portee || [], profil_risque: profil,
            });
            setStandardDomaines(normalizeDomaines(excludeSGSDomaines(enriched as unknown as DomaineChecklist[], planning.portee || [])));
            let cnt = 0;
            const walk = (d: any) => { cnt += (d.items || []).filter((i: ChecklistItem) => i.prefilled).length; (d.sousDomaines || []).forEach(walk); (d.sousSousDomaines || []).forEach(walk); };
            enriched.forEach(d => walk(d));
            setIaPrefilledCount(prev => prev + cnt);
          } else {
            try {
              const result = await kitDocAgent.generateChecklist({
                surveillance_id: planningId, entite_id: planning.aerodrome_id,
                type_entite: aerodrome?.type_entite ?? 'aerodrome', type_surveillance: typeSurv,
                portee: planning.portee || [], profil_risque: profil,
                prefix_numero: checklistPrefix,
              });
              const resultFiltered = aerodrome ? { ...result, domaines: kitDocAgent.filterChecklistByAerodrome(result.domaines as any[], aerodrome) } : result;
              setStandardDomaines(normalizeDomaines(excludeSGSDomaines(toDomaineChecklistArray(resultFiltered) as unknown as DomaineChecklist[], planning.portee || [])));
            } catch (e) { console.error(e); }
          }
        }
      }

      // ── PAC ──
      if (needsPAC) {
        const key = `preparation-${planningId}-pac`;
        const offline = await dbGet(key);
        if (offline?.items) {
          setPacItems(offline.items);
          setHasChanges(true);
        } else if (planning.checklist_pac?.length) {
          setPacItems(planning.checklist_pac as PACItem[]);
          setIaPrefilledCount(prev => prev + planning.checklist_pac!.filter((i: PACItem) => i.prefilled).length);
        } else {
          const ecartsActifs = ecarts.filter(e => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture' && e.pac);
          const items: PACItem[] = [];
          ecartsActifs.forEach((ecart, idx) => {
            (ecart.pac?.actions || []).forEach((action: any, aIdx: number) => {
              items.push({
                id: `pac-${ecart.id}-${aIdx}`, ecart_id: ecart.id, reference: ecart.reference,
                description: action.description, responsable: action.responsable || 'Non assigné',
                date_prevue: action.date_prevue || ecart.delai_pac || '', statut_origine: action.status || 'planifie',
                prediction: (() => { const d = new Date(action.date_prevue || ecart.delai_pac || ''); return (!isNaN(d.getTime()) && d.getTime() < Date.now()) ? 'NS' : 'NV' })(),
                confiance: (() => { const d = new Date(action.date_prevue || ecart.delai_pac || ''); return !isNaN(d.getTime()) ? 85 : 40 })(),
                justification: "Basé sur l'historique des vérifications", ordre: idx * 100 + aIdx,
                domaine: ecart.domaine || (ecart as any).domaine,
                livrables: action.livrables || [],
                ecart_libelle: ecart.libelle,
                ecart_niveau_risque: ecart.niveau_risque,
                ecart_cellule_oaci: ecart.cellule_risque_oaci,
              });
            });
          });
          items.sort((a, b) => a.ordre - b.ordre);
          setPacItems(items);
          setIaPrefilledCount(prev => prev + items.filter(i => i.prediction).length);
        }
      }

      // ── Suivi écarts ──
      if (needsSuivi) {
        const key = `preparation-${planningId}-suivi`;
        const offline = await dbGet(key);
        if (offline?.items) {
          setSuiviItems(offline.items.map((item: any) => migrateSuiviItem(item, ecarts, planning.sgs_evaluation_prepa as EvaluationSGS | null | undefined)));
          setHasChanges(true);
        } else if (planning.checklist_suivi_ecarts?.length) {
          setSuiviItems(planning.checklist_suivi_ecarts.map((item: any) => migrateSuiviItem(item, ecarts, planning.sgs_evaluation_prepa as EvaluationSGS | null | undefined)));
        } else {
          const items: EcartEvaluation[] = ecarts
            .filter(e => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture')
            .map((ecart, idx) => ({
              id: `eval-${ecart.id}-${Date.now()}`, ecart_id: ecart.id,
              reference: ecart.reference || ecart.ref_reglementaire || '',
              libelle: ecart.libelle || 'Écart sans libellé',
              niveau_risque: (ecart.niveau_risque || 'moyen') as NiveauRisque,
              statut_mesure: 'aucune' as const,
              preuves: [],
              risque_initial: (ecart.niveau_risque || 'moyen') as NiveauRisque,
              niveau_maturite: getNiveauMaturiteForEcart(ecart, planning.sgs_evaluation_prepa as EvaluationSGS | null | undefined),
              niveau_maturite_residuel: undefined,
              criticite: {
                defenses_existantes: { valeur: null },
                facteurs_aggravants: { valeur: null },
                recurrence: { valeur: null },
                impact_operationnel: { valeur: null },
                delai_correction: { valeur: null },
              },
              ordre: idx,
              isExpanded: true,
            }));
          setSuiviItems(items);
        }
      }

      // ── SGS (évaluation PAOE) — restauration depuis le planning ──
      if (isSgsMode) {
        const key = `preparation-${planningId}-sgs`;
        const offline = await dbGet(key);
        if (offline?.evaluation) {
          setSgsEvaluation(offline.evaluation);
        } else if (planning.sgs_evaluation_prepa) {
          setSgsEvaluation(planning.sgs_evaluation_prepa as EvaluationSGS);
        }
      }

      setIsLoading(false);
    } catch (e) {
      console.error('Erreur chargement préparation checklist:', e);
      setIsLoading(false);
    }
    };

    load();
  }, [planning, aerodrome, profil, planningId, checklistType, ecarts, findMasterChecklistForPortee]);

  // ── Save helper ────────────────────────────────────────────
  const saveAll = useCallback(async (data: typeof dataRef.current) => {
    const { standardDomaines: sd, pacItems: pi, suiviItems: si, sgsEvaluation: sgsEval } = data;

    if (checklistType === 'standard' || isMixte) {
      const key = `preparation-${planningId}-standard`;
      await dbPut(key, { domaines: sd });
      if (!isOffline) {
        await updatePlanning(planningId, { checklist_hierarchy: sd as any, ...(sgsEval ? { sgs_evaluation_prepa: sgsEval } : {}) });
        await dbDelete(key);
      }
    }
    // SGS mode — sauvegarde de l'évaluation PAOE uniquement
    if (isSgsMode && sgsEval) {
      const key = `preparation-${planningId}-sgs`;
      await dbPut(key, { evaluation: sgsEval });
      if (!isOffline) {
        await updatePlanning(planningId, { sgs_evaluation_prepa: sgsEval } as any);
        await dbDelete(key);
      }
    }
    if (checklistType === 'pac' || isMixte) {
      const key = `preparation-${planningId}-pac`;
      await dbPut(key, { items: pi });
      if (!isOffline) { await updatePlanning(planningId, { checklist_pac: pi }); await dbDelete(key); }
    }
    if (checklistType === 'suivi' || isMixte) {
      const key = `preparation-${planningId}-suivi`;
      await dbPut(key, { items: si });
      if (!isOffline) { await updatePlanning(planningId, { checklist_suivi_ecarts: si }); await dbDelete(key); }
    }
  }, [planningId, checklistType, isMixte, isSgsMode, isOffline, updatePlanning]);

  // ── Auto-save ─────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || !hasChanges) return;
    const interval = setInterval(async () => {
      setIsSaving(true);
      try { await saveAll(dataRef.current); setLastSaved(new Date()); setHasChanges(false); }
      catch (e) { console.error('[Auto-save]', e); }
      finally { setIsSaving(false); }
    }, 5000);
    return () => clearInterval(interval);
  }, [isLoading, hasChanges, saveAll]);

  // ── Sync on reconnect ─────────────────────────────────────
  useEffect(() => {
    if (!isOffline && hasChanges) {
      const sync = async () => {
        setIsSaving(true);
        try { await saveAll(dataRef.current); setLastSaved(new Date()); setHasChanges(false); }
        catch (e) { console.error('[Sync]', e); }
        finally { setIsSaving(false); }
      };
      sync();
    }
  }, [isOffline]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try { await saveAll(dataRef.current); setLastSaved(new Date()); setHasChanges(false); }
    catch (e) { console.error('[Save]', e); }
    finally { setIsSaving(false); }
  }, [saveAll]);

  // ── Handlers items ─────────────────────────────────────────
  const handleUpdatePACItem = useCallback((item: PACItem) => {
    setPacItems(prev => prev.map(i => i.id === item.id ? item : i));
    setHasChanges(true);
  }, []);

  const handleUpdateSuiviItem = useCallback((item: EcartEvaluation) => {
    setSuiviItems(prev => prev.map(i => i.id === item.id ? item : i));
    setHasChanges(true);
  }, []);

  // ── Enrichissement IA batch ─────────────────────────────────
  const walkItems = useCallback((domaines: DomaineChecklist[]): Array<{ id: string; numero: string; point_verification: string; domaine: string; sousDomaine: string; sousSousDomaine: string }> => {
    const items: any[] = [];
    const walk = (d: { items?: ChecklistItem[]; nom: string }, sdNom?: string, ssdNom?: string) => {
      (d.items || []).forEach(i => items.push({ id: i.id, numero: i.numero, point_verification: i.point_verification, domaine: d.nom, sousDomaine: sdNom || d.nom, sousSousDomaine: ssdNom || '' }));
    };
    domaines.forEach(d => {
      walk(d);
      (d.sousDomaines || []).forEach(sd => {
        walk(sd, sd.nom);
        (sd.sousSousDomaines || []).forEach(ssd => walk(ssd, sd.nom, ssd.nom));
      });
    });
    return items;
  }, []);

  const handleBatchPredict = useCallback(async () => {
    if (!aerodrome || !planning || iaBatchLoading) return;
    setIaBatchLoading(true);
    try {
      const flatItems = walkItems(standardDomaines);
      if (flatItems.length === 0) return;
      const result = await checklistAgent.predictBatch({
        surveillanceId: planningId,
        aerodromeId: planning.aerodrome_id,
        items: flatItems,
        profil: profil ?? undefined,
      }, {});
      // Appliquer les prédictions enrichies dans l'arbre
      const applyToTree = (d: DomaineChecklist): DomaineChecklist => ({
        ...d,
        items: (d.items || []).map(i => {
          const pred = result.predictions.get(i.id);
          if (!pred) return i;
          return { ...i, prediction: pred.prediction as any, confiance: pred.confidence, justification: pred.justification, prefilled: pred.confidence >= 70 } as any;
        }),
        sousDomaines: (d.sousDomaines || []).map(sd => ({
          ...sd,
          items: (sd.items || []).map(i => {
            const pred = result.predictions.get(i.id);
            if (!pred) return i;
            return { ...i, prediction: pred.prediction as any, confiance: pred.confidence, justification: pred.justification, prefilled: pred.confidence >= 70 } as any;
          }),
          sousSousDomaines: (sd.sousSousDomaines || []).map(ssd => ({
            ...ssd,
            items: (ssd.items || []).map(i => {
              const pred = result.predictions.get(i.id);
              if (!pred) return i;
              return { ...i, prediction: pred.prediction as any, confiance: pred.confidence, justification: pred.justification, prefilled: pred.confidence >= 70 } as any;
            }),
          })) as any,
        })) as any,
      });
      setStandardDomaines(prev => prev.map(d => applyToTree(d)));
      setIaPrefilledCount(result.stats.sa + result.stats.ns);
    } catch (e) { console.error('[BatchPredict]', e); }
    finally { setIaBatchLoading(false); }
  }, [standardDomaines, aerodrome, planning, planningId, profil, iaBatchLoading, walkItems]);

  // ── Stats ──────────────────────────────────────────────────
  const stats = React.useMemo(() => {
    const activeType = isMixte ? mixteTab : checklistType;
    if (activeType === 'standard') {
      let total = 0, sa = 0, ns = 0, nv = 0, na = 0;
      const collect = (items: ChecklistItem[] | undefined) => {
        if (!items) return;
        items.forEach(i => { total++; const r = i.resultat || i.prediction || 'NV'; if (r === 'SA') sa++; else if (r === 'NS') ns++; else if (r === 'NA') na++; else nv++; });
      };
      standardDomaines.forEach(d => { collect(d.items); d.sousDomaines?.forEach(sd => { collect(sd.items); sd.sousSousDomaines?.forEach(ssd => collect(ssd.items)); }); });
      return { total, sa, ns, nv, na, progression: total > 0 ? Math.round(((sa + ns + na) / total) * 100) : 0 };
    }
    if (activeType === 'pac') {
      const total = pacItems.length; const sa = pacItems.filter(i => i.resultat === 'SA').length;
      const ns = pacItems.filter(i => i.resultat === 'NS').length; const nv = pacItems.filter(i => !i.resultat || i.resultat === 'NV').length;
      return { total, sa, ns, nv, na: 0, progression: total > 0 ? Math.round(((sa + ns) / total) * 100) : 0 };
    }
    if (activeType === 'suivi') {
      const total = suiviItems.length; const sa = suiviItems.filter(i => i.conclusion === 'SA').length;
      const ns = suiviItems.filter(i => i.conclusion === 'NS').length; const nv = suiviItems.filter(i => !i.conclusion || i.conclusion === 'NV').length;
      return { total, sa, ns, nv, na: 0, progression: total > 0 ? Math.round(((sa + ns) / total) * 100) : 0 };
    }
    return { total: 0, sa: 0, ns: 0, nv: 0, na: 0, progression: 0 };
  }, [checklistType, isMixte, mixteTab, standardDomaines, pacItems, suiviItems]);

  if (!planning) return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center">
      <p className="text-muted-foreground">Planning non trouvé</p>
    </div>
  );
  if (isLoading) return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-role-primary border-t-transparent rounded-full animate-spin mr-3" />
      <p className="text-muted-foreground">Génération de la checklist...</p>
    </div>
  );

  // Mode SGS — page entière dédiée (pas de layout standard)
  if (isSgsMode) {
    return (
      <SGSEvaluationDirect
        sgsEvaluation={sgsEvaluation}
        onSaveSGS={(e) => { setSgsEvaluation(e); setHasChanges(true); }}
        planningId={planningId}
        aerodromeId={aerodrome?.id || planning.aerodrome_id}
        aerodromeNom={aerodrome?.nom}
        planningType={planning.type}
        planningDateDebut={planning.date_debut}
        equipeIds={planning.equipe_ids || []}
        user={user}
      />
    );
  }

  // Label et icône du header
  const typeLabels: Record<ChecklistMode, string> = {
    standard: 'Checklist Standard', pac: 'Mise en œuvre PAC',
    suivi: 'Suivi des Écarts', mixte: 'Checklist Mixte', sgs: 'Évaluation SGS',
  };
  const typeIcons: Record<ChecklistMode, React.ReactNode> = {
    standard: <ClipboardList className="w-4 h-4 text-white" />,
    pac: <Shield className="w-4 h-4 text-white" />,
    suivi: <AlertTriangle className="w-4 h-4 text-white" />,
    mixte: <LayoutGrid className="w-4 h-4 text-white" />,
    sgs: <Brain className="w-4 h-4 text-white" />,
  };

  // Onglet actif à afficher
  // Pour 'sgs' : traiter comme 'standard' (même contenu + auto-ouverture PAOE)
  const activeContent = isMixte ? mixteTab : checklistType as MixteTab;

  // ── Couleurs score risque ───────────────────────────────────
  const scoreRisque = profil?.score_global;
  const niveauRisque = profil?.niveau;
  const maturiteSGS = aerodrome?.maturite_sgs;
  const scoreColor = scoreRisque == null ? 'text-muted-foreground'
    : scoreRisque >= 80 ? 'text-success' : scoreRisque >= 60 ? 'text-warning' : 'text-danger';
  const niveauBadgeClass = niveauRisque === 'faible' ? 'bg-success/20 text-success border-success'
    : niveauRisque === 'moyen' ? 'bg-warning/20 text-warning border-warning'
    : niveauRisque === 'eleve' ? 'bg-orange-100 text-orange-700 border-orange-300'
    : 'bg-danger/20 text-danger border-danger';

  return (
    <div className="min-h-screen bg-background" data-module="preparation-checklist">
      {/* ── Header sticky premium ─────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border shadow-role-glow">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-2">

          {/* Ligne 1 : retour + icône + titre + actions */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button onClick={() => router.back()} className="btn btn-ghost p-2 shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </button>
              {/* Icône type de checklist */}
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                checklistType === 'pac'   ? 'bg-gradient-to-br from-green-500 to-emerald-600' :
                checklistType === 'suivi' ? 'bg-gradient-to-br from-amber-500 to-orange-600' :
                checklistType === 'mixte' ? 'bg-gradient-to-br from-purple-500 to-purple-600' :
                                            'bg-role-gradient'
              }`}>
                {typeIcons[checklistType]}
              </div>
              <div>
                <h1 className="text-base font-bold text-foreground leading-tight">
                  {typeLabels[checklistType]}
                </h1>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="font-semibold text-role-primary text-xs">{aerodrome?.code_oaci}</span>
                  <span className="text-xs text-muted-foreground">{aerodrome?.nom}</span>
                  <span className="text-xs text-border">·</span>
                  <span className="text-xs text-muted-foreground capitalize">{planning.type.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-border">·</span>
                  <span className="text-xs text-muted-foreground">{new Date(planning.date_debut).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Statut réseau */}
              {isOffline
                ? <span className="badge warning badge-icon"><WifiOff className="w-3 h-3" /> Hors ligne</span>
                : <span className="badge success badge-icon"><Wifi className="w-3 h-3" /> En ligne</span>
              }
              {lastSaved && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {isSaving ? 'Sauvegarde...' : `Sauvegardé ${lastSaved.toLocaleTimeString()}`}
                </span>
              )}
              <button
                onClick={() => setShowAiAssistant(!showAiAssistant)}
                className={`btn btn-sm gap-1.5 ${showAiAssistant ? 'btn-primary' : 'btn-secondary'}`}
              >
                <Brain className="w-3.5 h-3.5" /> IA
              </button>
              <button onClick={handleSave} className="btn btn-sm btn-primary gap-1.5" disabled={isSaving}>
                <Save className="w-3.5 h-3.5" /> Sauvegarder
              </button>
            </div>
          </div>

          {/* Ligne 2 : score risque · maturité SGS · stats temps réel */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Score de risque */}
            {scoreRisque != null && (
              <span className="badge muted badge-icon">
                <Activity className="w-3 h-3" />
                Risque&nbsp;<strong className={scoreColor}>{scoreRisque}/100</strong>
                {niveauRisque && (
                  <span className={`badge ${niveauBadgeClass} text-[10px]`}>{niveauRisque}</span>
                )}
              </span>
            )}
            {/* Maturité SGS */}
            {maturiteSGS != null && (
              <span className="badge muted badge-icon">
                <Shield className="w-3 h-3" />
                SGS&nbsp;<strong className={maturiteSGS >= 4 ? 'text-success' : maturiteSGS >= 3 ? 'text-warning' : 'text-danger'}>{maturiteSGS}/5</strong>
              </span>
            )}
            {/* Séparateur + stats temps réel */}
            {stats.total > 0 && (
              <>
                <span className="text-border text-xs">|</span>
                <span className="badge muted text-xs">
                  <strong className="text-foreground">{stats.total}</strong>&nbsp;items
                </span>
                <span className="badge success">SA&nbsp;{stats.sa}</span>
                <span className="badge danger">NS&nbsp;{stats.ns}</span>
                <span className="badge warning">NV&nbsp;{stats.nv}</span>
                {/* Barre de progression sans inline style */}
                <div className="flex items-center gap-1.5">
                  <div className="progress w-24 h-1.5">
                    <div
                      className={`progress-bar progress-fill ${stats.progression >= 80 ? 'bg-success' : stats.progression >= 50 ? 'bg-warning' : 'bg-danger'}`}
                      style={{ '--pf': stats.progression } as React.CSSProperties}
                    />
                  </div>
                  <strong className="text-xs text-foreground">{stats.progression}%</strong>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Onglets — uniquement en mode mixte */}
        {isMixte && (
          <div className="max-w-6xl mx-auto px-4 border-t border-border/50">
            <div className="tabs">
              <button onClick={() => setMixteTab('standard')}
                className={`tab py-2 px-4 flex items-center gap-2 ${mixteTab === 'standard' ? 'active' : ''}`}>
                <ClipboardList className="w-4 h-4" /> Checklist standard
              </button>
              <button onClick={() => setMixteTab('suivi')}
                className={`tab py-2 px-4 flex items-center gap-2 ${mixteTab === 'suivi' ? 'active' : ''}`}>
                <AlertTriangle className="w-4 h-4" /> Suivi des écarts
              </button>
              <button onClick={() => setMixteTab('pac')}
                className={`tab py-2 px-4 flex items-center gap-2 ${mixteTab === 'pac' ? 'active' : ''}`}>
                <CheckCircle2 className="w-4 h-4" /> Mise en œuvre PAC
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Content — pleine largeur */}
      <div className={`w-full ${showAiAssistant ? 'flex flex-row gap-3 px-2 py-4' : 'px-2 py-4 space-y-4'}`}>
        {showAiAssistant && (
          <div className="w-80 shrink-0 overflow-y-auto max-h-[calc(100vh-140px)] space-y-2">
            <ChatIALateral
              checklistJson={standardDomaines}
              onChecklistUpdate={(updated) => setStandardDomaines(updated)}
            />
          </div>
        )}
        <div className={showAiAssistant ? 'flex-1 space-y-4' : ''}>
        {/* Bandeau IA */}
        {iaPrefilledCount > 0 && (
          <div className="card border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30">
            <div className="card-content p-3">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-purple-100 dark:bg-purple-900/50 p-1.5 flex-shrink-0">
                  <Brain className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Pré-remplissage IA actif
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                    {iaPrefilledCount} item{iaPrefilledCount > 1 ? 's' : ''} pré-rempli{iaPrefilledCount > 1 ? 's' : ''} via profil de risque et historique.
                  </p>
                </div>
                <button onClick={handleBatchPredict} disabled={iaBatchLoading}
                  className="btn btn-sm btn-secondary gap-1.5 shrink-0">
                  {iaBatchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                  Enrichir
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stats (basées sur l'onglet actif) */}
        <div className="card border-border">
          <div className="card-content p-4">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-small font-medium">Items: <strong>{stats.total}</strong></span>
                <div className="flex items-center gap-1.5">
                  <span className="badge success">SA&nbsp;{stats.sa}</span>
                  <span className="badge danger">NS&nbsp;{stats.ns}</span>
                  <span className="badge warning">NV&nbsp;{stats.nv}</span>
                </div>
              </div>
              <span className="text-small font-semibold">{stats.progression}%</span>
            </div>
            <div className="progress h-2">
              <div
                className={`progress-bar progress-fill ${stats.progression >= 80 ? 'bg-success' : stats.progression >= 50 ? 'bg-warning' : 'bg-danger'}`}
                style={{ '--pf': stats.progression } as React.CSSProperties}
              />
            </div>
          </div>
        </div>

        {/* ── Contenu par type ── */}

        {/* Standard (mode standard, ou onglet standard en mixte) */}
        {activeContent === 'standard' && (
          <StandardContent
                    domaines={filteredDomaines}
            onChangeDomaines={(d) => { setStandardDomaines(d); setHasChanges(true); }}
            sgsEvaluation={sgsEvaluation}
            onSaveSGS={(e) => { setSgsEvaluation(e); setHasChanges(true); }}
            planningId={planningId}
            aerodromeId={aerodrome?.id || planning.aerodrome_id}
            planningType={planning.type}
            planningDateDebut={planning.date_debut}
            equipeIds={planning.equipe_ids || []}
            user={user}
            autoOpenSGS={false}
          />
        )}

        {/* PAC */}
        {activeContent === 'pac' && (
          <div className="space-y-2">
            {pacItems.length === 0 ? (
              <div className="card border-border bg-muted/30">
                <div className="card-content p-8 text-center text-muted-foreground">
                  <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun item PAC — aucun écart actif avec plan d'action.</p>
                </div>
              </div>
            ) : (
              pacItems.map(item => <PACChecklistItem key={item.id} item={item} onUpdate={handleUpdatePACItem} />)
            )}
          </div>
        )}

        {/* Suivi écarts */}
        {activeContent === 'suivi' && (
          <div className="space-y-2">
            {suiviItems.length === 0 ? (
              <div className="card border-border bg-muted/30">
                <div className="card-content p-8 text-center text-muted-foreground">
                  <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun écart actif à suivre.</p>
                </div>
              </div>
            ) : (
              suiviItems.map(item => (
                <EcartEvaluationCard
                  key={item.id}
                  item={item}
                  readOnly={false}
                  onUpdate={handleUpdateSuiviItem}
                  onAddFile={() => {}}
                  onDeleteFile={() => {}}
                />
              ))
            )}
          </div>
        )}

        {/* Note de bas de page */}
        <div className="card border-border bg-muted/30">
          <div className="card-content p-4 text-center text-sm text-muted-foreground">
            <p>💡 Sauvegarde automatique toutes les 5 secondes. Fonctionne hors ligne.</p>
            <p className="mt-1">Revenez au planning pour exécuter la surveillance sur site.</p>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
