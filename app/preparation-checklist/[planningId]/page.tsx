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
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import {
  ArrowLeft, Save, Wifi, WifiOff, ClipboardList, Brain, Sparkles,
  AlertTriangle, Shield, CheckCircle2, XCircle, AlertCircle,
  TrendingDown, Activity, FileText, LayoutGrid,
} from 'lucide-react';
import { kitDocAgent, toDomaineChecklistArray } from '@/lib/ia/agents/kitDocAgent';
import type { DomaineChecklist, ChecklistItem, EvaluationTerrain, EvaluationSGS } from '@/types/checklist';
import { computeEvaluationTerrainScore } from '@/types/checklist';
import { ChecklistStandardTable } from '@/components/modules/checklist/ChecklistStandardTable';
import { SGSEvaluationModal, SGSEvaluationContent } from '@/components/modules/surveillance/SGSEvaluation';

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

function excludeSGSDomaines(domaines: DomaineChecklist[], portee: string[]): DomaineChecklist[] {
  const isMixedWithSGS = portee.includes('SGS') && portee.length > 1;
  if (!isMixedWithSGS) return domaines;
  return domaines.filter(d => !(d.nom || d.id || '').toUpperCase().includes('SGS'));
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

function PACChecklistItem({ item, onUpdate }: { item: PACItem; onUpdate: (item: PACItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isPrefilled = item.prefilled === true;
  const currentResultat = item.resultat || 'NV';

  const couleurs: Record<string, string> = {
    SA: 'bg-success/20 text-success border-success hover:bg-success/30',
    NS: 'bg-danger/20 text-danger border-danger hover:bg-danger/30',
    NV: 'bg-warning/20 text-warning border-warning hover:bg-warning/30',
  };

  const statutColors: Record<string, string> = {
    termine: 'bg-green-100 text-green-700 border-green-200',
    en_cours: 'bg-amber-100 text-amber-700 border-amber-200',
    planifie: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  return (
    <div className={`border border-border rounded-lg mb-2 overflow-hidden ${isPrefilled ? 'border-l-4 border-l-purple-400' : ''} ${item.alerte ? 'border-l-danger' : ''}`}>
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Shield className="w-4 h-4 text-role-secondary flex-shrink-0" />
          <span className="text-sm truncate">{item.description}</span>
          {isPrefilled && <Sparkles className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statutColors[item.statut_origine] || statutColors.planifie}`}>
            {item.statut_origine}
          </span>
          <ResultatBadge resultat={currentResultat} />
        </div>
      </div>
      {expanded && (
        <div className="p-3 border-t border-border bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground">Responsable:</span> <span className="text-sm">{item.responsable}</span></div>
            <div><span className="text-xs text-muted-foreground">Échéance:</span> <span className="text-sm">{new Date(item.date_prevue).toLocaleDateString('fr-FR')}</span></div>
          </div>
          {item.prediction && item.confiance && (
            <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
              <Brain className="w-4 h-4 text-purple-500" />
              <div>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  Prédiction: <strong>{item.prediction === 'SA' ? 'Satisfaisant' : 'Non satisfaisant'}</strong> ({item.confiance}%)
                </p>
                {item.justification && <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">{item.justification}</p>}
              </div>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {(['SA', 'NS', 'NV'] as const).map(r => (
              <button key={r} type="button" onClick={() => onUpdate({ ...item, resultat: r, prefilled: false })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${currentResultat === r ? couleurs[r] + ' ring-2 ring-offset-1 ring-role-primary' : 'bg-background border border-border text-muted-foreground hover:bg-muted'}`}>
                {r === 'SA' ? 'Satisfaisant' : r === 'NS' ? 'Non satisfaisant' : 'Non vérifié'}
              </button>
            ))}
          </div>
          <textarea value={item.observation || ''} onChange={(e) => onUpdate({ ...item, observation: e.target.value })}
            placeholder="Observations terrain..." rows={2} className="w-full text-sm border border-border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-role-primary" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Item Suivi Écarts
// ─────────────────────────────────────────────────────────────

interface SuiviEcartItem {
  id: string;
  ecart_id: string;
  reference: string;
  libelle: string;
  niveau_risque: string;
  action_prevue: string;
  responsable: string;
  echeance: string;
  statut: string;
  resultat?: 'SA' | 'NS' | 'NV';
  observation?: string;
  efficacite?: number;
  prefilled?: boolean;
  evaluationTerrain?: EvaluationTerrain;
}

function SuiviEcartChecklistItem({ item, onUpdate }: { item: SuiviEcartItem; onUpdate: (item: SuiviEcartItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const isPrefilled = item.prefilled === true;
  const currentResultat = item.resultat || 'NV';

  const couleurs: Record<string, string> = {
    SA: 'bg-success/20 text-success border-success hover:bg-success/30',
    NS: 'bg-danger/20 text-danger border-danger hover:bg-danger/30',
    NV: 'bg-warning/20 text-warning border-warning hover:bg-warning/30',
  };

  const risqueColors: Record<string, string> = {
    critique: 'text-danger', haute: 'text-warning', moyenne: 'text-primary', basse: 'text-success',
  };

  const ev = item.evaluationTerrain;
  const evNiveauBadge = ev
    ? ev.niveau === 'maitrise' ? { label: 'MAÎTRISÉ', color: 'bg-success text-white', icon: CheckCircle2 }
    : ev.niveau === 'surveillance' ? { label: 'SOUS SURVEILLANCE', color: 'bg-warning text-white', icon: AlertTriangle }
    : { label: 'NON MAÎTRISÉ', color: 'bg-danger text-white', icon: XCircle }
    : null;

  const handleEvalChange = (field: keyof Omit<EvaluationTerrain, 'score' | 'niveau'>, value: any) => {
    const updated = { ...(item.evaluationTerrain || {
      evolutionCriticite: 'stable' as const, defensesExistantes: false,
      facteursAggravants: false, recurrence: false, impactOperationnel: false, justificationAbsence: '',
    }), [field]: value };
    const { score, niveau } = computeEvaluationTerrainScore(updated);
    onUpdate({ ...item, evaluationTerrain: { ...updated, score, niveau } });
  };

  return (
    <div className={`border border-border rounded-lg mb-2 overflow-hidden ${isPrefilled ? 'border-l-4 border-l-purple-400' : ''} ${evNiveauBadge?.label === 'NON MAÎTRISÉ' ? 'border-l-danger' : evNiveauBadge?.label === 'MAÎTRISÉ' ? 'border-l-success' : ''}`}>
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <AlertTriangle className="w-4 h-4 text-danger flex-shrink-0" />
          <span className="text-sm truncate">{item.libelle}</span>
          {isPrefilled && <Sparkles className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" />}
          {evNiveauBadge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${evNiveauBadge.color}`}>
              <evNiveauBadge.icon className="w-3 h-3 inline mr-0.5" />{evNiveauBadge.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {ev && <span className={`text-xs font-bold ${ev.score >= 80 ? 'text-success' : ev.score >= 50 ? 'text-warning' : 'text-danger'}`}>{ev.score}%</span>}
          <span className={`text-xs font-medium ${risqueColors[item.niveau_risque] || 'text-muted-foreground'}`}>{item.niveau_risque}</span>
          <ResultatBadge resultat={currentResultat} />
        </div>
      </div>
      {expanded && (
        <div className="p-3 border-t border-border bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-xs text-muted-foreground">Référence:</span> <span>{item.reference}</span></div>
            <div><span className="text-xs text-muted-foreground">Responsable:</span> <span>{item.responsable}</span></div>
            <div><span className="text-xs text-muted-foreground">Échéance:</span> <span>{new Date(item.echeance).toLocaleDateString('fr-FR')}</span></div>
            <div><span className="text-xs text-muted-foreground">Statut:</span> <span>{item.statut}</span></div>
          </div>
          <div className="p-2 bg-muted rounded-lg"><p className="text-xs text-muted-foreground">Action prévue:</p><p className="text-sm">{item.action_prevue}</p></div>
          {/* Évaluation terrain */}
          <div>
            <button type="button" onClick={() => setShowEval(!showEval)}
              className={`w-full flex items-center justify-between p-2.5 rounded-lg border transition-all ${showEval ? 'border-role-primary bg-role-primary/5' : 'border-border hover:bg-muted/50'}`}>
              <div className="flex items-center gap-2"><Activity className="w-4 h-4 text-role-primary" /><span className="text-sm font-semibold">Évaluation terrain</span></div>
              <div className="flex items-center gap-2">
                {ev && <span className={`text-sm font-bold ${ev.score >= 80 ? 'text-success' : ev.score >= 50 ? 'text-warning' : 'text-danger'}`}>{ev.score}%</span>}
                <svg className={`w-4 h-4 transition-transform ${showEval ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </button>
            {showEval && (
              <div className="mt-2 space-y-2 p-3 bg-background rounded-lg border border-border">
                <div className="space-y-1">
                  <label className="text-xs font-semibold flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" />Évolution de la criticité</label>
                  <div className="flex gap-1.5">
                    {([
                      { value: 'amelioree', label: '📉 Améliorée', color: 'border-success text-success' },
                      { value: 'stable', label: '➡️ Stable', color: 'border-warning text-warning' },
                      { value: 'pire', label: '📈 Pire', color: 'border-danger text-danger' },
                    ] as const).map(opt => (
                      <button key={opt.value} type="button" onClick={() => handleEvalChange('evolutionCriticite', opt.value)}
                        className={`flex-1 py-1.5 px-2 rounded text-[11px] font-medium border-2 transition-all ${ev?.evolutionCriticite === opt.value ? `${opt.color} bg-background ring-1 ring-role-primary` : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {([
                  { field: 'defensesExistantes' as const, label: '🛡️ Défenses existantes', positif: 'Oui', negatif: 'Non', inversé: false },
                  { field: 'facteursAggravants' as const, label: '⚠️ Facteurs aggravants', positif: 'Non', negatif: 'Oui', inversé: true },
                  { field: 'recurrence' as const, label: '🔄 Récurrence', positif: 'Non', negatif: 'Oui', inversé: true },
                  { field: 'impactOperationnel' as const, label: '📊 Impact opérationnel', positif: 'Non', negatif: 'Oui', inversé: true },
                ]).map(crit => {
                  const value = ev?.[crit.field];
                  const favorable = crit.inversé ? !value : value;
                  return (
                    <div key={crit.field} className="flex items-center justify-between">
                      <span className="text-xs font-medium">{crit.label}</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => handleEvalChange(crit.field, crit.inversé ? false : true)}
                          className={`py-1 px-3 rounded text-[11px] font-medium border transition-all ${favorable === true ? 'border-success bg-success/10 text-success' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                          {crit.positif} ✅
                        </button>
                        <button type="button" onClick={() => handleEvalChange(crit.field, crit.inversé ? true : false)}
                          className={`py-1 px-3 rounded text-[11px] font-medium border transition-all ${favorable === false ? 'border-danger bg-danger/10 text-danger' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                          {crit.negatif} ❌
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="space-y-1">
                  <label className="text-xs font-semibold flex items-center gap-1"><FileText className="w-3.5 h-3.5" />Justification</label>
                  <textarea value={ev?.justificationAbsence || ''} onChange={(e) => handleEvalChange('justificationAbsence', e.target.value)}
                    placeholder="Expliquez pourquoi les actions n'ont pas été mises en oeuvre..." rows={2}
                    className="w-full text-xs border border-border rounded p-2 focus:outline-none focus:ring-2 focus:ring-role-primary" />
                </div>
                {ev && (
                  <div className={`p-2.5 rounded-lg border-2 ${ev.niveau === 'maitrise' ? 'border-success/30 bg-success/5' : ev.niveau === 'surveillance' ? 'border-warning/30 bg-warning/5' : 'border-danger/30 bg-danger/5'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {evNiveauBadge && <evNiveauBadge.icon className={`w-4 h-4 ${evNiveauBadge.color.includes('success') ? 'text-success' : evNiveauBadge.color.includes('warning') ? 'text-warning' : 'text-danger'}`} />}
                        <span className={`text-sm font-bold ${evNiveauBadge?.color.includes('success') ? 'text-success' : evNiveauBadge?.color.includes('warning') ? 'text-warning' : 'text-danger'}`}>ÉCART {evNiveauBadge?.label}</span>
                      </div>
                      <span className={`text-lg font-bold ${ev.score >= 80 ? 'text-success' : ev.score >= 50 ? 'text-warning' : 'text-danger'}`}>{ev.score}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {item.efficacite !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Efficacité estimée:</span>
              <span className="text-sm font-semibold text-role-primary">{item.efficacite}%</span>
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            {(['SA', 'NS', 'NV'] as const).map(r => (
              <button key={r} type="button" onClick={() => onUpdate({ ...item, resultat: r, prefilled: false })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${currentResultat === r ? couleurs[r] + ' ring-2 ring-offset-1 ring-role-primary' : 'bg-background border border-border text-muted-foreground hover:bg-muted'}`}>
                {r === 'SA' ? 'Satisfaisant' : r === 'NS' ? 'Non satisfaisant' : 'Non vérifié'}
              </button>
            ))}
          </div>
          <textarea value={item.observation || ''} onChange={(e) => onUpdate({ ...item, observation: e.target.value })}
            placeholder="Observations de suivi..." rows={2} className="w-full text-sm border border-border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-role-primary" />
        </div>
      )}
    </div>
  );
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
  const [suiviItems, setSuiviItems] = useState<SuiviEcartItem[]>([]);
  const [sgsEvaluation, setSgsEvaluation] = useState<EvaluationSGS | null>(null);

  const [isOffline, setIsOffline] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [iaPrefilledCount, setIaPrefilledCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);

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

    // Détermine si on doit charger un type de données
    const needsStandard = checklistType === 'standard' || isMixte;
    const needsPAC = checklistType === 'pac' || isMixte;
    const needsSuivi = checklistType === 'suivi' || isMixte;
    // SGS mode : chargement de l'évaluation PAOE existante depuis le planning

    const load = async () => {
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
            const analysesDocs = kitDocAgent.getAnalysesForPortee(planning.portee || []);
            try {
              const result = kitDocAgent.generateChecklist({
                surveillance_id: planningId, entite_id: planning.aerodrome_id,
                type_entite: aerodrome?.type_entite ?? 'aerodrome', type_surveillance: typeSurv,
                portee: planning.portee || [], profil_risque: profil,
                analyses_docs: analysesDocs.length > 0 ? analysesDocs : undefined,
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
          setSuiviItems(offline.items);
          setHasChanges(true);
        } else if (planning.checklist_suivi_ecarts?.length) {
          setSuiviItems(planning.checklist_suivi_ecarts as SuiviEcartItem[]);
          setIaPrefilledCount(prev => prev + planning.checklist_suivi_ecarts!.filter((i: SuiviEcartItem) => i.prefilled).length);
        } else {
          const ecartsActifs = ecarts.filter(e => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture');
          const items: SuiviEcartItem[] = ecartsActifs.map((ecart) => ({
            id: `suivi-${ecart.id}`, ecart_id: ecart.id, reference: ecart.reference,
            libelle: ecart.libelle, niveau_risque: ecart.niveau_risque || 'moyen',
            action_prevue: ecart.pac?.observations || ecart.libelle || 'Aucune action définie',
            responsable: ecart.responsable_id || 'Non assigné',
            echeance: ecart.delai_pac || ecart.delai_regularisation || '', statut: ecart.statut || 'ouvert',
            efficacite: (() => { const echeance = new Date(ecart.delai_pac || ecart.delai_regularisation || ''); if (isNaN(echeance.getTime())) return 60; const joursRestants = (echeance.getTime() - Date.now()) / 86400000; if (joursRestants < 0) return 30; if (joursRestants < 30) return 50; return 70 })(),
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

  const handleUpdateSuiviItem = useCallback((item: SuiviEcartItem) => {
    setSuiviItems(prev => prev.map(i => i.id === item.id ? item : i));
    setHasChanges(true);
  }, []);

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
      const total = suiviItems.length; const sa = suiviItems.filter(i => i.resultat === 'SA').length;
      const ns = suiviItems.filter(i => i.resultat === 'NS').length; const nv = suiviItems.filter(i => !i.resultat || i.resultat === 'NV').length;
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
      <div className="w-full px-2 py-4 space-y-4">
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
              suiviItems.map(item => <SuiviEcartChecklistItem key={item.id} item={item} onUpdate={handleUpdateSuiviItem} />)
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
  );
}
