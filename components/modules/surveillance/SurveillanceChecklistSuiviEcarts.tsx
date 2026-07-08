// components/modules/surveillance/SurveillanceChecklistSuiviEcarts.tsx
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
  Trash2,
  Edit3,
  Check,
  X,
  ChevronDown,
  AlertTriangle,
  Brain,
  Wifi,
  WifiOff,
  Zap,
  Info,
  Shield,
  Upload,
} from 'lucide-react';
import { FileUploader } from '@/components/ui/FileUploader';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { DomaineCode } from '@/lib/domaines';
import type { PAOELevel, EvaluationSGS } from '@/types/checklist';
import { isEcartProcessusActif } from '@/lib/processus/isEcartProcessusActif';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// Types
export type ResultatSuivi = 'SA' | 'NS' | 'NV';
export type StatutMesure = 'aucune' | 'prevue' | 'en_cours' | 'realisee';
export type NiveauRisque = 'faible' | 'moyen' | 'eleve' | 'critique';
export type { PAOELevel };

export interface Preuve {
  id: string;
  nom: string;
  url: string;
  dateUpload: string;
}

export interface CritereCriticite {
  valeur: boolean | null;
  justification?: string;
}

export interface CriticiteEvaluation {
  defenses_existantes: CritereCriticite;
  facteurs_aggravants: CritereCriticite;
  recurrence: CritereCriticite;
  impact_operationnel: CritereCriticite;
  delai_correction: CritereCriticite;
}

export interface EcartEvaluation {
  id: string;
  ecart_id: string;
  reference: string;
  libelle: string;
  domaine?: DomaineCode;
  niveau_risque: NiveauRisque;

  statut_mesure: StatutMesure;
  mesure_description?: string;
  mesure_incidence?: string;
  preuves: Preuve[];

  risque_initial: NiveauRisque;
  risque_residuel?: NiveauRisque;
  niveau_maturite?: PAOELevel;
  niveau_maturite_residuel?: PAOELevel;
  criticite: CriticiteEvaluation;

  commentaire?: string;
  conclusion?: ResultatSuivi;

  ordre: number;
  isExpanded: boolean;
}

export const RESULTAT_LABELS = {
  SA: { label: 'Satisfaisant', variant: 'success', icon: CheckCircle, color: 'bg-success/20 text-success-800 border-success', short: 'SA' },
  NS: { label: 'Non satisfaisant', variant: 'danger', icon: XCircle, color: 'bg-danger/20 text-danger-800 border-danger', short: 'NS' },
  NV: { label: 'À vérifier', variant: 'warning', icon: AlertCircle, color: 'bg-warning/20 text-warning-800 border-warning', short: 'NV' },
};

const RISQUE_CONFIG = {
  critique: { label: 'Critique', color: 'text-danger', badge: 'badge danger', gradient: 'from-red-500/10 to-transparent', border: 'border-l-danger', icon: AlertTriangle, bg: 'bg-danger/5' },
  eleve: { label: 'Élevé', color: 'text-warning', badge: 'badge warning', gradient: 'from-orange-500/10 to-transparent', border: 'border-l-warning', icon: AlertTriangle, bg: 'bg-warning/5' },
  moyen: { label: 'Moyen', color: 'text-primary', badge: 'badge primary', gradient: 'from-blue-500/10 to-transparent', border: 'border-l-primary', icon: Shield, bg: 'bg-primary/5' },
  faible: { label: 'Faible', color: 'text-success', badge: 'badge success', gradient: 'from-emerald-500/10 to-transparent', border: 'border-l-success', icon: Shield, bg: 'bg-success/5' },
};

const MATURITE_CONFIG: Record<PAOELevel, { label: string; color: string; badge: string; gradient: string; border: string; icon: React.ComponentType<{ className?: string }>; bg: string }> = {
  absent: { label: 'Absent', color: 'text-danger', badge: 'badge danger', gradient: 'from-red-500/10 to-transparent', border: 'border-l-danger', icon: AlertTriangle, bg: 'bg-danger/5' },
  present: { label: 'Présent', color: 'text-warning', badge: 'badge warning', gradient: 'from-orange-500/10 to-transparent', border: 'border-l-warning', icon: AlertTriangle, bg: 'bg-warning/5' },
  approprie: { label: 'Approprié', color: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700', gradient: 'from-yellow-500/10 to-transparent', border: 'border-l-yellow-500', icon: Shield, bg: 'bg-yellow-50/50' },
  operationnel: { label: 'Opérationnel', color: 'text-success', badge: 'badge success', gradient: 'from-emerald-500/10 to-transparent', border: 'border-l-success', icon: Shield, bg: 'bg-success/5' },
  efficace: { label: 'Efficace', color: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', gradient: 'from-emerald-500/10 to-transparent', border: 'border-l-emerald-500', icon: Shield, bg: 'bg-emerald-50/50' },
};

function getCoherence(initial: NiveauRisque, residuel?: NiveauRisque): { badge: string; label: string; message: string; requireJustification: boolean } {
  if (!residuel) return { badge: 'badge neutral', label: 'Non évalué', message: '', requireJustification: false };
  const levels = ['faible', 'moyen', 'eleve', 'critique'];
  const diff = levels.indexOf(residuel) - levels.indexOf(initial);
  if (diff <= 0) {
    if (diff === 0) return { badge: 'badge success', label: 'Stable ✓', message: 'Le niveau de risque n\'a pas évolué', requireJustification: false };
    if (diff === -1) return { badge: 'badge success', label: 'Amélioration ✓', message: `Risque passé de ${RISQUE_CONFIG[initial].label} à ${RISQUE_CONFIG[residuel].label}`, requireJustification: false };
    return { badge: 'badge warning', label: 'Amélioration marquée ⚠', message: `Baisse de ${Math.abs(diff)} niveau(x) — vérifier la cohérence`, requireJustification: true };
  }
  return { badge: 'badge danger', label: 'Aggravation 🔴', message: `Le risque a augmenté — justifiez impérativement`, requireJustification: true };
}

const MATURITE_ORDER: PAOELevel[] = ['absent', 'present', 'approprie', 'operationnel', 'efficace'];

function getMaturiteCoherence(initial?: PAOELevel, residuel?: PAOELevel): { badge: string; label: string; message: string; requireJustification: boolean } {
  if (!initial || !residuel) return { badge: 'badge neutral', label: 'Non évalué', message: '', requireJustification: false };
  const diff = MATURITE_ORDER.indexOf(residuel) - MATURITE_ORDER.indexOf(initial);
  if (diff >= 0) {
    if (diff === 0) return { badge: 'badge success', label: 'Stable ✓', message: 'Le niveau de maturité n\'a pas évolué', requireJustification: false };
    if (diff === 1) return { badge: 'badge success', label: 'Progression ✓', message: `Maturité passée de ${MATURITE_CONFIG[initial].label} à ${MATURITE_CONFIG[residuel].label}`, requireJustification: false };
    return { badge: 'badge warning', label: 'Progression marquée ⚠', message: `Hausse de ${diff} niveau(x) — vérifier la cohérence`, requireJustification: true };
  }
  return { badge: 'badge danger', label: 'Régression 🔴', message: `La maturité a baissé — justifiez impérativement`, requireJustification: true };
}

const NIVEAU_RISQUE_TO_MATURITE: Record<string, PAOELevel> = { critique: 'absent', eleve: 'present', moyen: 'approprie', faible: 'operationnel' };

function getNiveauMaturiteForEcartInline(ec: any, sgsEval?: EvaluationSGS | null): PAOELevel | undefined {
  if (ec.domaine !== 'SGS') return undefined;
  if (sgsEval?.composantes) {
    const m = ec.ref_reglementaire?.match(/Composante\s+(\d)/i);
    if (m) {
      const comp = sgsEval.composantes.find(c => c.id === parseInt(m[1]) as 1|2|3|4|5);
      if (comp) return comp.niveauGlobal;
    }
    for (const comp of sgsEval.composantes) {
      if (ec.ref_reglementaire?.includes(comp.label)) return comp.niveauGlobal;
    }
  }
  return NIVEAU_RISQUE_TO_MATURITE[ec.niveau_risque] || 'present';
}

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

function SuggestionInfoButton({ justification, confiance }: { justification: string; confiance: number }) {
  const [showPopup, setShowPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setShowPopup(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  return (
    <div className="relative inline-block" ref={popupRef}>
      <button type="button" onClick={() => setShowPopup(!showPopup)} className="btn btn-sm btn-ghost p-0 h-5 w-5 text-blue-600" title="Pourquoi cette suggestion ?">
        <Info className="w-3 h-3" />
      </button>
      {showPopup && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-72 bg-background border border-border rounded-lg shadow-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-xs font-semibold">Pourquoi cette suggestion ?</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{justification}</p>
          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">Confiance: {confiance}%</div>
        </div>
      )}
    </div>
  );
}

const CRITERES_CRITICITE = [
  { key: 'defenses_existantes' as const, label: 'Défenses existantes', question: 'Des mesures compensatoires sont-elles en place ?' },
  { key: 'facteurs_aggravants' as const, label: 'Facteurs aggravants', question: 'Des éléments aggravent-ils la situation ?' },
  { key: 'recurrence' as const, label: 'Récurrence', question: 'Cet écart est-il récurrent ?' },
  { key: 'impact_operationnel' as const, label: 'Impact opérationnel', question: 'L\'écart impacte-t-il les opérations ?' },
  { key: 'delai_correction' as const, label: 'Délai de correction', question: 'Le délai de correction est-il dépassé ou urgent ?' },
];

// ─── PreuveModal ──────────────────────────────────────────────────────────────

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

export function EcartEvaluationCard({
  item,
  readOnly,
  onUpdate,
  onAddFile,
  onDeleteFile,
}: {
  item: EcartEvaluation;
  readOnly: boolean;
  onUpdate: (item: EcartEvaluation) => void;
  onAddFile: (itemId: string, file: Preuve) => void;
  onDeleteFile: (itemId: string, fileId: string) => void;
}) {
  const [preuveOpen, setPreuveOpen] = useState(false);
  const isSGS = item.domaine === 'SGS';
  const risqueConfig = isSGS && item.niveau_maturite ? MATURITE_CONFIG[item.niveau_maturite] : RISQUE_CONFIG[item.niveau_risque];
  const RisqueIcon = risqueConfig.icon;
  const coherence = isSGS
    ? getMaturiteCoherence(item.niveau_maturite, item.niveau_maturite_residuel)
    : getCoherence(item.risque_initial, item.risque_residuel);
  const aUneMesure = item.statut_mesure !== 'aucune';
  const statutMesureBtns = [
    { s: 'prevue' as StatutMesure, label: 'Prévue', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
    { s: 'en_cours' as StatutMesure, label: 'En cours', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
    { s: 'realisee' as StatutMesure, label: 'Réalisée', cls: 'bg-green-100 text-green-700 border-green-300' },
  ];

  const handleCritereToggle = (critereKey: keyof CriticiteEvaluation, value: boolean) => {
    const current = item.criticite[critereKey];
    const updated = current.valeur === value ? { valeur: null, justification: undefined } : { valeur: value };
    onUpdate({ ...item, criticite: { ...item.criticite, [critereKey]: updated } });
  };

  const handleCritereJustification = (critereKey: keyof CriticiteEvaluation, justification: string) => {
    onUpdate({ ...item, criticite: { ...item.criticite, [critereKey]: { ...item.criticite[critereKey], justification } } });
  };

  return (
    <div className={`card border-border mb-3 overflow-hidden ${risqueConfig.border} border-l-4`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 bg-gradient-to-r ${risqueConfig.gradient}`}>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-6 rounded-md text-[11px] font-bold bg-blue-900 text-white">{item.domaine || 'SGS'}</span>
          <span className="code-oaci-badge text-[12px]">{item.reference}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${risqueConfig.badge}`}>
            <RisqueIcon className="w-3 h-3" />
            {risqueConfig.label}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium ${item.conclusion ? RESULTAT_LABELS[item.conclusion].color : 'bg-gray-100 text-gray-500'}`}>
          {item.conclusion ? RESULTAT_LABELS[item.conclusion].short : 'NV'}
        </span>
      </div>

      {/* Libellé */}
      <div className="px-3 py-1.5 text-[13px] text-foreground border-b border-blue-100">
        {item.libelle}
      </div>

      {/* Row 1: Mesure de réduction des risques */}
      <div className="bg-gray-50/70 px-3 py-1.5 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-semibold text-muted-foreground whitespace-nowrap">Mesure de réduction des risques :</span>
          {!readOnly ? (
            <div className="flex gap-1">
              <button type="button" onClick={() => onUpdate({ ...item, statut_mesure: 'prevue' })}
                className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-bold border transition-all ${aUneMesure ? 'bg-success text-white border-success' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Oui</button>
              <button type="button" onClick={() => { onUpdate({ ...item, statut_mesure: 'aucune', risque_residuel: undefined, mesure_description: undefined, mesure_incidence: undefined, preuves: [], commentaire: undefined }); }}
                className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-bold border transition-all ${!aUneMesure ? 'bg-gray-400 text-white border-gray-400' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Non</button>
            </div>
          ) : (
            <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[11px] font-bold border ${aUneMesure ? 'bg-success text-white border-success' : 'bg-gray-400 text-white border-gray-400'}`}>
              {aUneMesure ? 'Oui' : 'Non'}
            </span>
          )}
        </div>
        {aUneMesure && (
          <div className="mt-2 border border-blue-100 rounded-lg overflow-hidden">
            <table className="w-full" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="bg-blue-50 border-b border-blue-200">
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[15%]">Mesure prévue ou mise en œuvre</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[30%]">Description</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[20%]">Incidence sur l'écart</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground border-r border-blue-100 w-[15%]">Preuves</th>
                  <th className="p-1.5 text-left text-[11px] font-bold text-foreground w-[20%]">Observations</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-blue-100">
                  <td className="p-1 border-r border-blue-100 align-top">
                    <div className="flex flex-col gap-1">
                      {statutMesureBtns.map(({ s, label, cls }) => (
                        <button key={s} type="button" onClick={() => onUpdate({ ...item, statut_mesure: s })} disabled={readOnly}
                          className={`text-[11px] px-1.5 py-0.5 rounded border text-left transition-all ${item.statut_mesure === s ? cls : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="p-1 border-r border-blue-100 align-top">
                    <textarea value={item.mesure_description || ''} onChange={e => onUpdate({ ...item, mesure_description: e.target.value })}
                      placeholder="Décrivez la mesure..." rows={2} disabled={readOnly}
                      className="form-textarea w-full text-[13px] resize-none" />
                  </td>
                  <td className="p-1 border-r border-blue-100 align-top">
                    <textarea value={item.mesure_incidence || ''} onChange={e => onUpdate({ ...item, mesure_incidence: e.target.value })}
                      placeholder="Impact de la mesure..." rows={2} disabled={readOnly}
                      className="form-textarea w-full text-[13px] resize-none" />
                  </td>
                  <td className="p-1.5 text-center border-r border-blue-100 w-32 min-w-[7rem] max-w-[9rem] align-middle">
                    <button type="button" onClick={() => setPreuveOpen(true)}
                      className="inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/5 w-full justify-center">
                      <FileText className="w-3.5 h-3.5" />
                      {item.preuves.length > 0 ? (
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
                  <td className="p-1 align-top">
                    <textarea value={item.commentaire || ''} onChange={e => onUpdate({ ...item, commentaire: e.target.value })}
                      placeholder="Observations terrain..." rows={2} disabled={readOnly}
                      className="form-textarea w-full text-[13px] resize-none" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row 2: Évolution de la criticité */}
      <div className="bg-blue-50/60 px-3 py-1.5 border-b border-blue-100">
        <p className="text-[12px] font-semibold text-muted-foreground mb-1.5">Évolution de la criticité</p>
        <div className="border border-blue-100 rounded-lg overflow-hidden">
          <div className="grid grid-cols-5">
            {CRITERES_CRITICITE.map(({ key, label, question }) => {
              const critere = item.criticite[key] || { valeur: null };
              return (
                <div key={key} className="p-1.5 border-r border-blue-100 last:border-r-0 border-b border-blue-100">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[11px] font-bold text-foreground truncate" title={question}>{label}</span>
                    {!readOnly ? (
                      <div className="flex gap-0.5 flex-shrink-0">
                        <button type="button" onClick={() => handleCritereToggle(key, true)}
                          className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${critere.valeur === true ? 'bg-success text-white border-success' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Oui</button>
                        <button type="button" onClick={() => handleCritereToggle(key, false)}
                          className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${critere.valeur === false ? 'bg-danger text-white border-danger' : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'}`}>Non</button>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${critere.valeur === true ? 'bg-success text-white border-success' : critere.valeur === false ? 'bg-danger text-white border-danger' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {critere.valeur === true ? 'Oui' : critere.valeur === false ? 'Non' : '—'}
                      </span>
                    )}
                  </div>
                  {critere.valeur === true && (
                    <textarea value={critere.justification || ''} onChange={e => handleCritereJustification(key, e.target.value)}
                      placeholder="Justification..." rows={2} disabled={readOnly}
                      className="form-textarea w-full text-[11px] resize-none" />
                  )}
                  {readOnly && critere.valeur === true && critere.justification && (
                    <p className="text-[11px] text-muted-foreground">{critere.justification}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3: Risque résiduel / Maturité résiduelle + Conclusion */}
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[12px] font-semibold text-muted-foreground whitespace-nowrap">
            {isSGS ? 'Maturité initiale' : 'Risque initial'} :
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${risqueConfig.badge}`}>
            <RisqueIcon className="w-3 h-3" />
            {risqueConfig.label}
          </span>
          <span className="text-blue-200 text-[13px]">→</span>
          <span className="text-[12px] font-semibold text-muted-foreground whitespace-nowrap">
            {isSGS ? 'Maturité résiduelle' : 'Risque résiduel'} :
          </span>
          {!readOnly ? (
            <div className="flex gap-1 flex-wrap">
              {isSGS ? (
                (Object.entries(MATURITE_CONFIG) as [PAOELevel, typeof MATURITE_CONFIG[PAOELevel]][]).map(([niveau, config]) => (
                  <button key={niveau} type="button" onClick={() => onUpdate({ ...item, niveau_maturite_residuel: item.niveau_maturite_residuel === niveau ? undefined : niveau })}
                    className={`text-[11px] px-2 py-0.5 rounded font-medium border transition-all ${item.niveau_maturite_residuel === niveau ? `${config.bg} ${config.color} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {config.label}
                  </button>
                ))
              ) : (
                (Object.entries(RISQUE_CONFIG) as [NiveauRisque, typeof RISQUE_CONFIG[NiveauRisque]][]).map(([niveau, config]) => (
                  <button key={niveau} type="button" onClick={() => onUpdate({ ...item, risque_residuel: item.risque_residuel === niveau ? undefined : niveau })}
                    className={`text-[11px] px-2 py-0.5 rounded font-medium border transition-all ${item.risque_residuel === niveau ? `${config.bg} ${config.color} border-current` : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                    {config.label}
                  </button>
                ))
              )}
            </div>
          ) : (
            <span className={`text-[13px] font-bold ${isSGS ? (item.niveau_maturite_residuel ? MATURITE_CONFIG[item.niveau_maturite_residuel].color : 'text-gray-400') : (item.risque_residuel ? RISQUE_CONFIG[item.risque_residuel].color : 'text-gray-400')}`}>
              {isSGS
                ? (item.niveau_maturite_residuel ? MATURITE_CONFIG[item.niveau_maturite_residuel].label : 'Non défini')
                : (item.risque_residuel ? RISQUE_CONFIG[item.risque_residuel].label : 'Non défini')}
            </span>
          )}
          {isSGS ? (item.niveau_maturite_residuel && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${coherence.badge}`}>{coherence.label}</span>
          )) : (item.risque_residuel && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${coherence.badge}`}>{coherence.label}</span>
          ))}
          <span className="text-blue-200 text-[13px]">|</span>
          <span className="text-[12px] font-semibold text-muted-foreground whitespace-nowrap">Conclusion :</span>
          <div className="checklist-etat checklist-etat-3 !gap-1">
            {(['SA', 'NS', 'NV'] as ResultatSuivi[]).map((resultat) => {
              const config = RESULTAT_LABELS[resultat];
              const Icon = config.icon;
              return (
                <button key={resultat} type="button" onClick={() => onUpdate({ ...item, conclusion: item.conclusion === resultat ? undefined : resultat })}
                  className={`checklist-etat-btn ${item.conclusion === resultat ? `active-${resultat.toLowerCase()}` : ''}`} disabled={readOnly}>
                  <Icon className="w-3 h-3" /><span>{config.short}</span>
                </button>
              );
            })}
          </div>
        </div>
        {(isSGS ? item.niveau_maturite_residuel : item.risque_residuel) && (
          <p className="text-[11px] text-muted-foreground mt-1">{coherence.message}</p>
        )}
      </div>

      <PreuveModal isOpen={preuveOpen} onClose={() => setPreuveOpen(false)} itemRef={item.reference}
        preuves={item.preuves}
        onAdd={p => onAddFile(item.id, p)}
        onRemove={id => onDeleteFile(item.id, id)} />
    </div>
  );
}

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
    <Card variant="role" className="bg-primary/5 mb-4">
      <button className="w-full flex items-center justify-between p-4" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <span className="font-semibold text-sm">Suggestions intelligentes ({remainingSuggestions.length})</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">Basées sur historique</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); onAcceptAll(); }} className="btn btn-sm px-3 py-1 btn-primary"><Zap className="w-3 h-3" /> Accepter tout</button>
          <button onClick={(e) => { e.stopPropagation(); onIgnore(); }} className="btn btn-sm px-3 py-1 btn-secondary">Ignorer</button>
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
              <button onClick={() => setAccepted(prev => [...prev, suggestion.itemId])} className="btn btn-sm px-3 py-1 btn-primary"><Check className="w-3 h-3" /> Appliquer SA</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

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
  useEffect(() => { setTempObservations(observations); }, [observations]);
  if (!isOpen) return null;
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title"><FileText className="w-5 h-5 text-role-primary" /> Observations générales</div>
            <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
          </div>
          <div className="modal-body p-5">
            <textarea value={tempObservations} onChange={(e) => setTempObservations(e.target.value)} placeholder="Observations générales sur le suivi des écarts..." rows={6} className={`form-textarea w-full ${focusClass}`} disabled={readOnly} />
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
  const surveillances = useAppStore(s => s.surveillances);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);
  const surveillance = useMemo(() => surveillances.find(s => s.id === surveillanceId), [surveillances, surveillanceId]);

  const ecart = useMemo(() => ecarts.find(e => e.surveillance_id === surveillanceId), [ecarts, surveillanceId]);

  const [evaluations, setEvaluations] = useState<EcartEvaluation[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [observationsModalOpen, setObservationsModalOpen] = useState(false);
  const [observationsGenerales, setObservationsGenerales] = useState('');
  const [suggestions, setSuggestions] = useState<{ itemId: string; itemNumero: string; justification: string; confiance: number }[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  useEffect(() => {
    const ecartsASuivre = ecarts.filter(e => {
      if (e.aerodrome_id !== aerodromeId) return false;
      if (e.statut === 'cloture') return false;
      if (!['ouvert', 'pac_attendu', 'pac_soumis', 'pac_refuse', 'en_retard'].includes(e.statut)) return false;
      // Exclure les écarts issus de certification/homologation non terminée
      if (isEcartProcessusActif(e.surveillance_id, aerodromeId, certifications, homologations)) return false;
      return true;
    });

    if (ecartsASuivre.length === 0) {
      setEvaluations([]);
      return;
    }

    const newEvaluations: EcartEvaluation[] = ecartsASuivre.map((ec, idx) => {
      const domaine = (ec as any).domaine as DomaineCode | undefined;
      const ref = ec.ref_reglementaire || ec.reference;
      return {
        id: `eval-${ec.id}-${Date.now()}`,
        ecart_id: ec.id,
        reference: ref,
        libelle: ec.libelle || 'Écart sans libellé',
        domaine,
        niveau_risque: (ec.niveau_risque || 'moyen') as NiveauRisque,
        statut_mesure: 'aucune',
        preuves: [],
        risque_initial: (ec.niveau_risque || 'moyen') as NiveauRisque,
        criticite: {
          defenses_existantes: { valeur: null },
          facteurs_aggravants: { valeur: null },
          recurrence: { valeur: null },
          impact_operationnel: { valeur: null },
          delai_correction: { valeur: null },
        },
        ordre: idx,
        isExpanded: true,
        niveau_maturite: getNiveauMaturiteForEcartInline(ec, surveillance?.sgs_evaluation_prepa as EvaluationSGS | null | undefined),
        niveau_maturite_residuel: undefined,
      };
    });
    setEvaluations(newEvaluations);
  }, [aerodromeId, ecarts, surveillanceId, certifications, homologations]);

  useEffect(() => {
    if (evaluations.length > 0 && !readOnly && !isSigned) {
      const newSuggestions = evaluations
        .filter(item => !item.conclusion && item.niveau_risque === 'critique')
        .map(item => ({
          itemId: item.id,
          itemNumero: item.reference,
          justification: 'Écart critique nécessitant une évaluation prioritaire',
          confiance: 85,
        }));
      setSuggestions(newSuggestions);
    }
  }, [evaluations, readOnly, isSigned]);

  const handleAcceptAllSuggestions = () => {
    setEvaluations(prev => prev.map(item => {
      const suggestion = suggestions.find(s => s.itemId === item.id);
      if (suggestion && !item.conclusion) return { ...item, conclusion: 'SA' as const };
      return item;
    }));
    setSuggestions([]);
    addNotification({ user_id: user?.id || '', type: 'success', title: 'Suggestions appliquées', message: `${suggestions.length} suggestion(s) appliquée(s)`, canal: 'in_app' });
  };

  const handleIgnoreSuggestions = () => {
    setSuggestions([]);
  };

  const updateProgression = useCallback((items: EcartEvaluation[]) => {
    return items;
  }, []);

  const handleUpdateItem = useCallback((updatedItem: EcartEvaluation) => {
    setEvaluations(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
  }, []);

  const handleAddFile = useCallback((itemId: string, file: Preuve) => {
    setEvaluations(prev => prev.map(i => i.id === itemId ? { ...i, preuves: [...i.preuves, file] } : i));
  }, []);

  const handleDeleteFile = useCallback((itemId: string, fileId: string) => {
    setEvaluations(prev => prev.map(i => i.id === itemId ? { ...i, preuves: i.preuves.filter(p => p.id !== fileId) } : i));
  }, []);

  const handleSaveObservations = useCallback((observations: string) => {
    setObservationsGenerales(observations);
    setLastSaved(new Date());
    addNotification({ user_id: user?.id || '', type: 'success', title: 'Observations sauvegardées', message: 'Les observations générales ont été sauvegardées', canal: 'in_app' });
  }, [user, addNotification]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (evaluations.length > 0 && !readOnly && !isSigned) {
        setLastSaved(new Date());
        onSave?.({ items: evaluations, observations_generales: observationsGenerales });
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [evaluations, readOnly, isSigned, onSave, observationsGenerales]);

  const stats = useMemo(() => {
    const total = evaluations.length;
    const sa = evaluations.filter(i => i.conclusion === 'SA').length;
    const ns = evaluations.filter(i => i.conclusion === 'NS').length;
    const nv = evaluations.filter(i => !i.conclusion || i.conclusion === 'NV').length;
    const progression = total > 0 ? Math.round(((sa + ns) / total) * 100) : 0;
    return { total, sa, ns, nv, progression };
  }, [evaluations]);

  const handleSign = () => {
    if (stats.progression < 100) {
      addNotification({ user_id: user?.id || '', type: 'warning', title: 'Évaluation incomplète', message: `${100 - stats.progression}% des écarts non conclus`, canal: 'in_app' });
      return;
    }
    setSignatureDialogOpen(true);
  };

  const onSignatureSave = async (signatureUrl: string) => {
    setIsSigned(true);
    setSignatureDialogOpen(false);

    const scoreSuivi = stats.progression;
    updateSurveillance(surveillanceId, {
      statut: 'checklist_signee',
      score_global: scoreSuivi,
      signatures_checklist: [{ signataire_id: user?.id || '', signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`, date_signature: new Date().toISOString(), signature_url: signatureUrl }],
    });

    const { recalculerProfilRisque } = useAppStore.getState();
    await recalculerProfilRisque(aerodromeId);
    onComplete?.();
    addNotification({ user_id: user?.id || '', type: 'success', title: 'Suivi des écarts complété', message: 'La vérification des écarts a été signée', canal: 'in_app' });
  };

  if (!evaluations.length || !ecart) {
    return (
      <Card className="text-center text-muted-foreground">
        <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
        <p className="text-body">Aucun écart à suivre pour cette surveillance</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-role={userRole} data-module="checklist-suivi-ecarts">
      <Card variant="level" levelColor="warning">
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
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200"><WifiOff className="w-3 h-3" /> Hors ligne</span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium bg-green-100 text-green-700 border border-green-200"><Wifi className="w-3 h-3" /> En ligne</span>
            )}
            {lastSaved && <span className="text-xs text-muted-foreground">Sauvegardé à {lastSaved.toLocaleTimeString()}</span>}
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-small font-medium">Écarts: {stats.total}</span>
              <div className="flex items-center gap-2">
                <span className="badge success text-[12px]">SA: {stats.sa}</span>
                <span className="badge danger text-[12px]">NS: {stats.ns}</span>
                <span className="badge warning text-[12px]">NV: {stats.nv}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-small">Progression: {stats.progression}%</span>
              <button type="button" onClick={() => onSave?.({ items: evaluations, observations_generales: observationsGenerales })} className="btn btn-sm px-3 py-1 btn-secondary">
                <Save className="w-4 h-4" /> Sauvegarder
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

      {/* Suggestions */}
      <SuggestionsBanner
        suggestions={suggestions}
        onAcceptAll={handleAcceptAllSuggestions}
        onIgnore={handleIgnoreSuggestions}
      />

      {/* Liste des écarts */}
      <div className="space-y-4">
        {evaluations.map((item) => (
          <EcartEvaluationCard
            key={item.id}
            item={item}
            readOnly={readOnly || isSigned}
            onUpdate={handleUpdateItem}
            onAddFile={handleAddFile}
            onDeleteFile={handleDeleteFile}
          />
        ))}
      </div>

      {/* Observations générales */}
      <Card icon={<FileText className="w-4 h-4 text-role-primary" />} title="Observations générales">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">{observationsGenerales || 'Aucune observation générale'}</p>
          </div>
          {!readOnly && !isSigned && (
            <button onClick={() => setObservationsModalOpen(true)} className="action-button" title="Modifier les observations">
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
              <p className="text-small text-gray-600 mb-4">✅ Tous les écarts sont évalués ({stats.progression}%)</p>
              <button type="button" onClick={handleSign} className="btn btn-sm px-3 py-1 btn-primary">Signer le suivi des écarts</button>
            </>
          ) : (
            <p className="text-small text-gray-500">⏳ Progression: {stats.progression}% - {stats.nv} écart(s) non conclu(s)</p>
          )}
        </Card>
      )}

      <GeneralObservationsModal
        isOpen={observationsModalOpen}
        onClose={() => setObservationsModalOpen(false)}
        observations={observationsGenerales}
        onSave={handleSaveObservations}
        readOnly={readOnly || isSigned}
      />

      {signatureDialogOpen && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title">Signature du suivi des écarts</div>
                <button className="modal-close" onClick={() => setSignatureDialogOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body">
                <SignaturePadWithColor onSave={onSignatureSave} onCancel={() => setSignatureDialogOpen(false)} signataireNom={`${user?.prenom || ''} ${user?.nom || ''}`} />
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
