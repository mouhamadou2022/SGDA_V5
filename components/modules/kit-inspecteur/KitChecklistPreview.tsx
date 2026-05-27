// components/modules/kit-inspecteur/KitChecklistPreview.tsx
// Aperçu de la checklist générée par l'IA après analyse d'un document réglementaire
// MODALE : superposition centrée haute, design modulaire, séparation colonnes, couleurs hiérarchiques
'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Brain,
  Sparkles,
  MapPin,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronRight,
  X,
  Info,
  Send,
  Bot,
  User,
  MessageSquare,
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  PlusCircle,
} from 'lucide-react';
import { aiClient } from '@/lib/ia/aiClient';
import type { KitDocument } from '@/lib/store';
import type { KitDocAnalysis } from '@/lib/ia/agents/kitDocAgent';
import { useAppStore } from '@/lib/store';

// ── Prompt système pour l'assistant IA ──────────────────────
const CHAT_SYSTEM_PROMPT = (contexte: string) => `Tu es un assistant expert en réglementation aéronautique (OACI, Annexe 14, Doc 9137, Doc 9981, Doc 9157, Doc 9859, Doc 9261, circulaires ANACIM).

Tu aides un inspecteur à **construire et affiner une checklist standard** de surveillance d'aérodrome, basée sur l'ensemble des documents réglementaires disponibles (RAS 14, Doc OACI, circulaires ANACIM, etc.).

**Règles :**
- L'utilisateur peut demander d' AJOUTER, MODIFIER ou SUPPRIMER des items, sous-domaines ou sous-sous-domaines.
- Tu dois connaître TOUS les points réglementaires de la base de connaissance (SGS, SLI, PHY, OLS, RA, ELEC, MFP, COP, OPS) — n'hésite pas à proposer des items issus d'autres domaines si pertinent.
- Réponds TOUJOURS en JSON uniquement avec le format ci-dessous.
- Si tu modifies la checklist, renvoie la structure COMPLÈTE mise à jour (pas de diff).
- Si tu ne fais que répondre à une question, mets updatedChecklist: null.
- Conserve scrupuleusement les IDs existants des domaines, sous-domaines et sous-sous-domaines.
- Pour les nouveaux items, génère un ID unique (ex: "ai_item_{Date.now()}_{index}").
- Les items doivent avoir ces champs : id, numero, reference_reglementaire, point_verification, directive_preuve, prediction ("NV"), confiance (50), justification, alerte (false), prefilled (true).

**Format de réponse :**
{"message": "Réponse pour l'utilisateur", "updatedChecklist": null | tableau de domaines}

**Contexte actuel de la checklist (JSON) :**
${contexte}`;

// ── Couleurs hiérarchiques (bleu léger) ─────────────────────
export const HIERARCHY_COLORS = {
  domaine: {
    bg: 'bg-blue-600',
    text: 'text-white',
    border: 'border-blue-300/40',
    shadow: 'shadow-sm shadow-blue-500/10',
    badge: 'bg-blue-100 text-blue-700',
  },
  sousDomaine: {
    bg: 'bg-blue-500',
    text: 'text-white',
    border: 'border-blue-300/40',
    shadow: 'shadow-sm shadow-blue-500/10',
    badge: 'bg-blue-100 text-blue-700',
  },
  sousSousDomaine: {
    bg: 'bg-blue-400',
    text: 'text-white',
    border: 'border-blue-300/40',
    shadow: 'shadow-sm shadow-blue-500/5',
    badge: 'bg-blue-100 text-blue-700',
  },
  tableHeader: {
    bg: 'bg-blue-700',
    text: 'text-white',
  },
} as const;

// ── Couleurs par état ───────────────────────────────────────
const RESULTAT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  SA: { label: 'Satisfaisant', icon: CheckCircle2, color: 'bg-success-soft text-success border-green-300' },
  NS: { label: 'Non satisfaisant', icon: XCircle, color: 'bg-danger-soft text-danger border-red-300' },
  NA: { label: 'Non applicable', icon: MinusCircle, color: 'bg-blue-50 text-blue-600 border-blue-300' },
  NV: { label: 'Non vérifié', icon: AlertCircle, color: 'bg-warning-soft text-warning border-amber-300' },
};

const STATE_LABELS: Record<string, string> = {
  SA: 'Satisfaisant',
  NS: 'Non satisfaisant',
  NA: 'Non applicable',
  NV: 'Non vérifié',
};

// ── Sous-composants ─────────────────────────────────────────

function ConfidenceIndicator({ confiance }: { confiance: number }) {
  let barColor = 'bg-blue-200';
  let text = 'Faible';
  if (confiance >= 85) { barColor = 'bg-green-500'; text = 'Très bonne'; }
  else if (confiance >= 70) { barColor = 'bg-blue-500'; text = 'Bonne'; }
  else if (confiance >= 50) { barColor = 'bg-yellow-500'; text = 'Moyenne'; }
  else if (confiance >= 30) { barColor = 'bg-orange-400'; text = 'Faible'; }
  else { barColor = 'bg-red-500'; text = 'Très faible'; }

  return (
    <div className="flex items-center gap-1" title={`Confiance: ${confiance}% — ${text}`}>
      <div className="w-12 h-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${confiance}%` }} />
      </div>
      <span className="text-[9px] text-muted-foreground">{confiance}%</span>
    </div>
  );
}

function getConformiteColor(taux: number): string {
  if (taux >= 80) return 'text-green-600 dark:text-green-400';
  if (taux >= 60) return 'text-blue-600 dark:text-blue-400';
  if (taux >= 40) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getProgressBarColor(taux: number): string {
  if (taux >= 80) return 'bg-green-500';
  if (taux >= 60) return 'bg-blue-500';
  if (taux >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function InfoTooltip({ justification, confiance }: { justification: string; confiance: number }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button type="button" onClick={() => setShow(!show)}
        className="p-0.5 rounded hover:bg-role-primary/10 transition-colors"
        title="Pourquoi cette suggestion ?"
      >
        <Info className="w-3 h-3 text-muted-foreground" />
      </button>
      {show && (
        <div className="absolute bottom-full left-0 mb-2 z-[60] w-72 bg-background border border-border rounded-lg shadow-lg p-3 text-xs">
          <p className="text-foreground mb-1">{justification}</p>
          <p className="text-muted-foreground">Confiance: {confiance}%</p>
        </div>
      )}
    </div>
  );
}

// ── Barre d'en-tête de niveau hiérarchique ──────────────────
function LevelHeader({
  label,
  count,
  isExpanded,
  onToggle,
  level,
}: {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  level: 'domaine' | 'sousDomaine' | 'sousSousDomaine';
}) {
  const colors = HIERARCHY_COLORS[level];
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-4 py-2.5 ${colors.bg} ${colors.text} ${colors.border} ${colors.shadow} transition-all duration-200 hover:brightness-110`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isExpanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
        <span className="font-semibold text-sm truncate">{label}</span>
      </div>
      <span className={`badge text-[10px] ${colors.badge} shrink-0 ml-2`}>
        {count} item{count > 1 ? 's' : ''}
      </span>
    </button>
  );
}

// ── Barre d'état éditable (SA/NS/NA/NV) ─────────────────────
function EtatSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: 'SA' | 'NS' | 'NA' | 'NV') => void;
}) {
  const etats = ['SA', 'NS', 'NA', 'NV'] as const;
  return (
    <div className="flex gap-0.5">
      {etats.map((e) => {
        const config = RESULTAT_CONFIG[e];
        const Icon = config.icon;
        const selected = (value || 'NV') === e;
        return (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            title={config.label}
            className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-[10px] font-semibold border transition-all ${
              selected
                ? config.color + ' ring-1 ring-offset-0'
                : 'bg-transparent text-muted-foreground border-transparent hover:border-blue-200 hover:bg-blue-50/50'
            }`}
          >
            <Icon className="w-3 h-3" />
            <span>{e}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Input textarea auto-ajustable ───────────────────────────
function AutoTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-transparent border-0 p-0 text-xs leading-relaxed resize-none focus:outline-none focus:ring-0 focus:bg-blue-50/50 rounded ${className || ''}`}
      rows={1}
    />
  );
}

// ── Tableau 6 colonnes éditable ─────────────────────────────
function ChecklistTable({
  items,
  onUpdateItem,
  onDeleteItem,
  onAddItem,
}: {
  items: any[];
  onUpdateItem?: (itemId: string, field: string, value: any) => void;
  onDeleteItem?: (itemId: string) => void;
  onAddItem?: () => void;
}) {
  if (!items || items.length === 0) return null;

  const COLUMNS = [
    { label: 'N°', width: '45px' },
    { label: 'Réf. Réglementaire', width: '15%' },
    { label: 'Point de vérification', width: '20%' },
    { label: 'Directives / Preuves', width: '28%' },
    { label: 'État', width: '75px' },
    { label: 'Observations', width: 'auto' },
  ];

  const isEditable = !!onUpdateItem;

  return (
    <div className="border border-blue-200 rounded-lg overflow-hidden shadow-sm bg-white">
      <table className="w-full" style={{ tableLayout: 'fixed' }}>
        <colgroup>
          {COLUMNS.map((col, i) => (
            <col key={i} style={{ width: col.width }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-blue-700">
            {COLUMNS.map((col, i) => (
              <th
                key={i}
                className={`px-3 py-2.5 text-xs font-semibold text-left ${i > 0 ? 'border-l border-blue-500/30' : ''}`}
                style={{ color: '#fff' }}
              >
                {col.label}
              </th>
            ))}
            {isEditable && (
              <th className="px-2 py-2.5 border-l border-blue-500/30" style={{ color: '#fff', width: '40px' }} />
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, idx: number) => {
            const etat = item.resultat || item.prediction || 'NV';
            const config = RESULTAT_CONFIG[etat] || RESULTAT_CONFIG.NV;
            const Icon = config.icon;
            return (
              <tr
                key={item.id || idx}
                className="border-b border-blue-100 last:border-b-0 hover:bg-blue-50/50 transition-colors"
              >
                <td className="px-3 py-2 align-top bg-white">
                  <div className="flex items-center gap-1 min-w-0">
                    {isEditable ? (
                      <input
                        type="text"
                        value={item.numero || ''}
                        onChange={(e) => onUpdateItem?.(item.id, 'numero', e.target.value)}
                        className="w-full font-mono font-medium text-xs bg-transparent border-0 p-0 focus:outline-none focus:ring-0 focus:bg-blue-50/50 rounded"
                      />
                    ) : (
                      <span className="font-mono font-medium shrink-0 text-xs">{item.numero || '-'}</span>
                    )}
                    {item.alerte && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                    {item.prefilled && <Sparkles className="w-3 h-3 text-purple-500 shrink-0" />}
                  </div>
                </td>
                <td className="px-3 py-2 border-l border-blue-100 align-top bg-white">
                  {isEditable ? (
                    <AutoTextarea
                      value={item.reference_reglementaire || ''}
                      onChange={(v) => onUpdateItem(item.id, 'reference_reglementaire', v)}
                      placeholder="Réf. règlementaire"
                    />
                  ) : (
                    <span className="font-medium text-foreground break-words text-xs leading-relaxed">{item.reference_reglementaire || '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2 border-l border-blue-100 align-top bg-white">
                  {isEditable ? (
                    <AutoTextarea
                      value={item.point_verification || ''}
                      onChange={(v) => onUpdateItem(item.id, 'point_verification', v)}
                      placeholder="Point de vérification"
                    />
                  ) : (
                    <span className="break-words text-xs leading-relaxed">{item.point_verification || '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2 border-l border-blue-100 align-top bg-white">
                  {isEditable ? (
                    <AutoTextarea
                      value={item.directive_preuve || ''}
                      onChange={(v) => onUpdateItem(item.id, 'directive_preuve', v)}
                      placeholder="Directives / Preuves"
                    />
                  ) : (
                    <span className="text-muted-foreground break-words text-xs leading-relaxed whitespace-pre-line">{item.directive_preuve || '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2 border-l border-blue-100 align-top bg-white">
                  {isEditable ? (
                    <EtatSelector
                      value={item.resultat || item.prediction}
                      onChange={(v) => onUpdateItem(item.id, 'resultat', v)}
                    />
                  ) : (
                    <div title={config.label} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border whitespace-nowrap ${config.color}`}>
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{etat}</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 border-l border-blue-100 align-top bg-white">
                  {isEditable ? (
                    <AutoTextarea
                      value={item.observation || item.observations || ''}
                      onChange={(v) => onUpdateItem(item.id, 'observation', v)}
                      placeholder="Observations"
                    />
                  ) : (
                    <span className="text-muted-foreground break-words text-xs leading-relaxed">{item.observation || item.observations || '—'}</span>
                  )}
                </td>
                {isEditable && (
                  <td className="px-2 py-2 align-top bg-white border-l border-blue-100">
                    <button
                      type="button"
                      onClick={() => onDeleteItem?.(item.id)}
                      className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {isEditable && onAddItem && (
        <div className="px-3 py-2 border-t border-blue-100 bg-blue-50/30">
          <button
            type="button"
            onClick={onAddItem}
            className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter une ligne
          </button>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ─────────────────────────────────────
export default function KitChecklistPreview({
  doc,
  analyse,
  preview,
  onClose,
  asPage,
  onBack,
}: {
  doc: KitDocument;
  analyse: KitDocAnalysis;
  preview: any[];
  onClose?: () => void;
  asPage?: boolean;
  onBack?: () => void;
}) {
  const [expandedDomaines, setExpandedDomaines] = useState<Record<string, boolean>>({});
  const [expandedSousDomaines, setExpandedSousDomaines] = useState<Record<string, boolean>>({});
  const [expandedSousSousDomaines, setExpandedSousSousDomaines] = useState<Record<string, boolean>>({});
  const overlayRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Copie locale éditable de preview
  const [localPreview, setLocalPreview] = useState<any[]>(() => preview);

  // État du chat IA
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Scroll auto vers bas du chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Focus input chat à l'ouverture
  useEffect(() => {
    if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 100);
  }, [chatOpen]);

  const toggleDomaine = (id: string) => {
    setExpandedDomaines(prev => ({ ...prev, [id]: prev[id] === undefined ? false : !prev[id] }));
  };
  const toggleSousDomaine = (id: string) => {
    setExpandedSousDomaines(prev => ({ ...prev, [id]: prev[id] === undefined ? false : !prev[id] }));
  };
  const toggleSousSousDomaine = (id: string) => {
    setExpandedSousSousDomaines(prev => ({ ...prev, [id]: prev[id] === undefined ? false : !prev[id] }));
  };

  // ── Helpers CRUD ────────────────────────────────────────────
  const createNewItem = () => ({
    id: `kit_item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    numero: '',
    reference_reglementaire: '',
    point_verification: '',
    directive_preuve: '',
    resultat: undefined,
    prediction: 'NV',
    confiance: 50,
    justification: '',
    alerte: false,
    prefilled: false,
    observation: '',
    fichiers: [],
    ordre: 0,
  });

  const updateItemInPath = (domId: string, sdId: string | null, ssdId: string | null, itemId: string, field: string, value: any) => {
    setLocalPreview(prev => prev.map(d => {
      if (d.id !== domId) return d;
      const updateItem = (items: any[]) => items.map(i => i.id === itemId ? { ...i, [field]: value } : i);
      if (!sdId) return { ...d, items: updateItem(d.items || []) };
      return {
        ...d,
        sousDomaines: (d.sousDomaines || []).map((sd: any) => {
          if (sd.id !== sdId) return sd;
          if (!ssdId) return { ...sd, items: updateItem(sd.items || []) };
          return {
            ...sd,
            sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) =>
              ssd.id === ssdId ? { ...ssd, items: updateItem(ssd.items || []) } : ssd
            ),
          };
        }),
      };
    }));
  };

  const deleteItemInPath = (domId: string, sdId: string | null, ssdId: string | null, itemId: string) => {
    setLocalPreview(prev => prev.map(d => {
      if (d.id !== domId) return d;
      const removeItem = (items: any[]) => items.filter(i => i.id !== itemId);
      if (!sdId) return { ...d, items: removeItem(d.items || []) };
      return {
        ...d,
        sousDomaines: (d.sousDomaines || []).map((sd: any) => {
          if (sd.id !== sdId) return sd;
          if (!ssdId) return { ...sd, items: removeItem(sd.items || []) };
          return {
            ...sd,
            sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) =>
              ssd.id === ssdId ? { ...ssd, items: removeItem(ssd.items || []) } : ssd
            ),
          };
        }),
      };
    }));
  };

  const addItemInPath = (domId: string, sdId: string | null, ssdId: string | null) => {
    const newItem = createNewItem();
    setLocalPreview(prev => prev.map(d => {
      if (d.id !== domId) return d;
      if (!sdId) return { ...d, items: [...(d.items || []), newItem] };
      return {
        ...d,
        sousDomaines: (d.sousDomaines || []).map((sd: any) => {
          if (sd.id !== sdId) return sd;
          if (!ssdId) return { ...sd, items: [...(sd.items || []), newItem] };
          return {
            ...sd,
            sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) =>
              ssd.id === ssdId ? { ...ssd, items: [...(ssd.items || []), newItem] } : ssd
            ),
          };
        }),
      };
    }));
  };

  const addSousDomaine = (domId: string) => {
    const name = prompt('Nom du sous-domaine :');
    if (!name) return;
    const newSd = {
      id: `kit_sd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      nom: name,
      items: [],
      sousSousDomaines: [],
      isExpanded: true,
      ordre: 0,
    };
    setLocalPreview(prev => prev.map(d =>
      d.id === domId ? { ...d, sousDomaines: [...(d.sousDomaines || []), newSd] } : d
    ));
  };

  const addSousSousDomaine = (domId: string, sdId: string) => {
    const name = prompt('Nom du sous-sous-domaine :');
    if (!name) return;
    const newSsd = {
      id: `kit_ssd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      nom: name,
      items: [],
      isExpanded: true,
      ordre: 0,
    };
    setLocalPreview(prev => prev.map(d =>
      d.id === domId ? {
        ...d,
        sousDomaines: (d.sousDomaines || []).map((sd: any) =>
          sd.id === sdId ? { ...sd, sousSousDomaines: [...(sd.sousSousDomaines || []), newSsd] } : sd
        ),
      } : d
    ));
  };

  const deleteSousDomaine = (domId: string, sdId: string) => {
    setLocalPreview(prev => prev.map(d =>
      d.id === domId ? { ...d, sousDomaines: (d.sousDomaines || []).filter((sd: any) => sd.id !== sdId) } : d
    ));
  };

  const deleteSousSousDomaine = (domId: string, sdId: string, ssdId: string) => {
    setLocalPreview(prev => prev.map(d =>
      d.id === domId ? {
        ...d,
        sousDomaines: (d.sousDomaines || []).map((sd: any) =>
          sd.id === sdId ? { ...sd, sousSousDomaines: (sd.sousSousDomaines || []).filter((ssd: any) => ssd.id !== ssdId) } : sd
        ),
      } : d
    ));
  };

  const handleSave = () => {
    const store = useAppStore.getState();
    const id = `kit_master_${doc.id}`;
    store.setMasterChecklist(id, localPreview);
    store.addNotification?.({ type: 'success', message: `Checklist enregistrée comme modèle principal (${stats.total} items)`, user_id: doc.id, canal: 'in_app' });
  };

  // Fermeture Escape (uniquement en mode modal)
  useEffect(() => {
    if (asPage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (chatOpen) setChatOpen(false);
        else onClose?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, chatOpen, asPage]);

  // Fermeture clic hors modale (sur overlay, uniquement en mode modal)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (!asPage && e.target === overlayRef.current) onClose?.();
  };

  // Envoi message au chat IA
  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);

    try {
      // Contexte simplifié de la checklist actuelle
      const contexte = JSON.stringify(localPreview.map((d: any) => ({
        id: d.id,
        nom: d.nom,
        description: d.description,
        sousDomaines: (d.sousDomaines || []).map((sd: any) => ({
          id: sd.id,
          nom: sd.nom,
          items: (sd.items || []).map((i: any) => ({
            id: i.id, numero: i.numero, reference_reglementaire: i.reference_reglementaire,
            point_verification: i.point_verification, directive_preuve: i.directive_preuve,
            directive_sa: i.directive_sa, directive_ns: i.directive_ns,
            directive_nv: i.directive_nv, directive_na: i.directive_na,
            prediction: i.prediction, confiance: i.confiance, justification: i.justification,
          })),
          sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) => ({
            id: ssd.id,
            nom: ssd.nom,
            items: (ssd.items || []).map((i: any) => ({
              id: i.id, numero: i.numero, reference_reglementaire: i.reference_reglementaire,
              point_verification: i.point_verification, directive_preuve: i.directive_preuve,
              directive_sa: i.directive_sa, directive_ns: i.directive_ns,
              directive_nv: i.directive_nv, directive_na: i.directive_na,
              prediction: i.prediction, confiance: i.confiance, justification: i.justification,
            })),
          })),
        })),
      })));

      const result = await aiClient.callJSON<{ message: string; updatedChecklist: any[] | null }>(
        {
          systemPrompt: CHAT_SYSTEM_PROMPT(contexte),
          userMessage: msg,
          temperature: 0.3,
          maxTokens: 4096,
          responseFormat: 'json_object',
        },
        { message: "Je n'ai pas pu traiter votre demande. Veuillez réessayer.", updatedChecklist: null }
      );

      if (result.updatedChecklist && Array.isArray(result.updatedChecklist) && result.updatedChecklist.length > 0) {
        setLocalPreview(result.updatedChecklist);
      }
      setChatMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
    } catch (err) {
      console.error('[Chat IA] Erreur:', err);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Erreur de communication avec l'IA. Vérifiez que le service est disponible." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, localPreview]);

  // Statistiques (basées sur localPreview)
  const stats = useMemo(() => {
    let total = 0, sa = 0, ns = 0, nv = 0, na = 0;
    const walk = (items: any[]) => {
      (items || []).forEach((item: any) => {
        total++;
        const r = item.resultat || item.prediction || 'NV';
        if (r === 'SA') sa++; else if (r === 'NS') ns++; else if (r === 'NA') na++; else nv++;
      });
    };
    (localPreview || []).forEach((d: any) => {
      walk(d.items || []);
      (d.sousDomaines || []).forEach((sd: any) => {
        walk(sd.items || []);
        (sd.sousSousDomaines || []).forEach((ssd: any) => walk(ssd.items || []));
      });
    });
    const renseignes = sa + ns + na;
    const progression = total > 0 ? Math.round((renseignes / total) * 100) : 0;
    const tauxConformiteReel = (sa + ns) > 0 ? Math.round((sa / (sa + ns + nv)) * 100) : 0;
    return { total, sa, ns, nv, na, progression, tauxConformiteReel };
  }, [localPreview]);

  // Contenu principal
  const modalContent = asPage ? (
    <><div className="space-y-4">
      {/* ✅ Informations document + analyse */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl border border-indigo-200/50 p-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Référence</p>
                <p className="text-sm font-medium">{analyse.reference_base}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Type OACI</p>
                <p className="text-sm font-medium">{analyse.type_oaci_detecte}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Analyse le</p>
                <p className="text-sm font-medium">{new Date(analyse.analysed_at).toLocaleDateString('fr-FR')}</p>
              </div>
            </div>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className={`btn btn-sm gap-1.5 ${chatOpen ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Bot className="w-3.5 h-3.5" />
              {chatOpen ? "Fermer l'IA" : "Ouvrir l'IA"}
            </button>
          </div>

          {/* Domaines impactés */}
          <div className="mt-3 pt-3 border-t border-indigo-200/50">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Target className="w-3 h-3" />
              Domaines couverts ({(localPreview || []).length})
            </p>
            <div className="flex flex-wrap gap-2">
              {(localPreview || []).map((d: any) => (
                <span
                  key={d.id}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30"
                  style={{ color: 'white' }}
                >
                  {d.nom}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ✅ Statistiques temps réel */}
        <div className="card border-border">
          <div className="card-content p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-semibold text-foreground">Items: {stats.total}</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-green-500 to-emerald-600" style={{ color: 'white' }} title={STATE_LABELS.SA}>SA: {stats.sa}</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-red-500 to-rose-600" style={{ color: 'white' }} title={STATE_LABELS.NS}>NS: {stats.ns}</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-blue-500 to-blue-600" style={{ color: 'white' }} title={STATE_LABELS.NA}>NA: {stats.na}</span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-amber-500 to-orange-600" style={{ color: 'white' }} title={STATE_LABELS.NV}>NV: {stats.nv}</span>
                </div>
              </div>
              <span className={`text-sm font-semibold ${getConformiteColor(stats.tauxConformiteReel)}`}>
                Conformité réelle: {stats.tauxConformiteReel}%
              </span>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div className="progress h-2 flex-1 bg-blue-100 rounded-full overflow-hidden">
                <div className={`h-full ${getProgressBarColor(stats.progression)} transition-all duration-500`} style={{ width: `${stats.progression}%` }} />
              </div>
              <span className="text-sm font-medium text-foreground w-12">{stats.progression}%</span>
            </div>
          </div>
        </div>

        {/* ✅ Bouton Enregistrer */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-sm btn-success gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            Enregistrer la checklist
          </button>
          <span className="text-[10px] text-muted-foreground">
            {stats.total} item(s) · {stats.progression}% renseigné(s)
          </span>
        </div>

        {/* ✅ Domaines avec tableaux */}
        <div className="space-y-3">
          {(localPreview || []).map((domaine: any) => {
            const isExpanded = expandedDomaines[domaine.id] !== false;
            const totalItems =
              (domaine.items || []).length +
              (domaine.sousDomaines || []).reduce((acc: number, sd: any) =>
                acc + (sd.items || []).length +
                (sd.sousSousDomaines || []).reduce((a: number, ssd: any) => a + (ssd.items || []).length, 0), 0);

            return (
              <div key={domaine.id} className="border border-blue-300 rounded-lg overflow-hidden shadow-sm">
                <LevelHeader
                  label={`${domaine.nom}${domaine.description ? ` — ${domaine.description}` : ''}`}
                  count={totalItems}
                  isExpanded={isExpanded}
                  onToggle={() => toggleDomaine(domaine.id)}
                  level="domaine"
                />

                {isExpanded && (
                  <div className="p-3 space-y-3 bg-white">
                    {domaine.items && domaine.items.length > 0 && (
                      <ChecklistTable
                        items={domaine.items}
                        onUpdateItem={(itemId, field, value) => updateItemInPath(domaine.id, null, null, itemId, field, value)}
                        onDeleteItem={(itemId) => deleteItemInPath(domaine.id, null, null, itemId)}
                        onAddItem={() => addItemInPath(domaine.id, null, null)}
                      />
                    )}
                    {(domaine.items || []).length === 0 && domaine.sousDomaines?.length === 0 && (
                      <ChecklistTable
                        items={[]}
                        onAddItem={() => addItemInPath(domaine.id, null, null)}
                      />
                    )}

                    {(domaine.sousDomaines || []).map((sd: any) => {
                      const sdItems = (sd.items || []).length +
                        (sd.sousSousDomaines || []).reduce((a: number, ssd: any) => a + (ssd.items || []).length, 0);
                      return (
                        <div key={sd.id} className="border border-blue-200 rounded-lg overflow-hidden">
                          <div className="flex items-stretch">
                            <div className="flex-1 min-w-0">
                              <LevelHeader
                                label={sd.nom}
                                count={sdItems}
                                isExpanded={expandedSousDomaines[sd.id] !== false}
                                onToggle={() => toggleSousDomaine(sd.id)}
                                level="sousDomaine"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => deleteSousDomaine(domaine.id, sd.id)}
                              className="px-2 bg-blue-500 hover:bg-red-500 text-white transition-colors flex items-center"
                              title="Supprimer le sous-domaine"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {(expandedSousDomaines[sd.id] !== false) && (
                          <div className="p-3 space-y-3 bg-white">
                            {sd.items && sd.items.length > 0 && (
                              <ChecklistTable
                                items={sd.items}
                                onUpdateItem={(itemId, field, value) => updateItemInPath(domaine.id, sd.id, null, itemId, field, value)}
                                onDeleteItem={(itemId) => deleteItemInPath(domaine.id, sd.id, null, itemId)}
                                onAddItem={() => addItemInPath(domaine.id, sd.id, null)}
                              />
                            )}
                            {(sd.sousSousDomaines || []).map((ssd: any) => (
                              <div key={ssd.id} className="border border-blue-100 rounded-lg overflow-hidden">
                                <div className="flex items-stretch">
                                  <div className="flex-1 min-w-0">
                                    <LevelHeader
                                      label={ssd.nom}
                                      count={(ssd.items || []).length}
                                      isExpanded={expandedSousSousDomaines[ssd.id] !== false}
                                      onToggle={() => toggleSousSousDomaine(ssd.id)}
                                      level="sousSousDomaine"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteSousSousDomaine(domaine.id, sd.id, ssd.id)}
                                    className="px-2 bg-blue-400 hover:bg-red-500 text-white transition-colors flex items-center"
                                    title="Supprimer le sous-sous-domaine"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {(expandedSousSousDomaines[ssd.id] !== false) && (
                                  <div className="p-3 bg-white">
                                    {ssd.items && ssd.items.length > 0 ? (
                                      <ChecklistTable
                                        items={ssd.items}
                                        onUpdateItem={(itemId, field, value) => updateItemInPath(domaine.id, sd.id, ssd.id, itemId, field, value)}
                                        onDeleteItem={(itemId) => deleteItemInPath(domaine.id, sd.id, ssd.id, itemId)}
                                        onAddItem={() => addItemInPath(domaine.id, sd.id, ssd.id)}
                                      />
                                    ) : (
                                      <ChecklistTable
                                        items={[]}
                                        onAddItem={() => addItemInPath(domaine.id, sd.id, ssd.id)}
                                      />
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                            {(sd.sousSousDomaines || []).length === 0 && (sd.items || []).length === 0 && (
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground py-2">Aucun item</p>
                                <div className="flex gap-2 justify-center pb-2">
                                  <button
                                    type="button"
                                    onClick={() => addItemInPath(domaine.id, sd.id, null)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                  >
                                    <Plus className="w-3 h-3" /> Ajouter un item
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => addSousSousDomaine(domaine.id, sd.id)}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-800"
                                  >
                                    <PlusCircle className="w-3 h-3" /> Sous-sous-domaine
                                  </button>
                                </div>
                              </div>
                            )}
                            {sd.sousSousDomaines?.length > 0 && (
                              <div className="flex justify-center pt-1">
                                <button
                                  type="button"
                                  onClick={() => addSousSousDomaine(domaine.id, sd.id)}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-600 hover:text-teal-800 transition-colors"
                                >
                                  <PlusCircle className="w-3 h-3" /> Ajouter un sous-sous-domaine
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        </div>
                      );
                    })}

                    <div className="flex gap-3 justify-center pt-1">
                      <button
                        type="button"
                        onClick={() => addSousDomaine(domaine.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Ajouter un sous-domaine
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chat IA — overlay fixe ───── */}
      {asPage && chatOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-96 bg-white border-l border-border shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-purple-50 to-indigo-50">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-foreground">Assistant IA</span>
            </div>
            <button onClick={() => setChatOpen(false)} className="btn btn-sm btn-secondary gap-1.5">
              <X className="w-3.5 h-3.5" /> Fermer
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="text-center py-8">
                <Bot className="w-8 h-8 mx-auto mb-2 text-purple-300" />
                <p className="text-xs text-muted-foreground">
                  Demandez à l'IA d'ajouter, modifier ou supprimer des items de la checklist.
                </p>
                <div className="mt-3 space-y-1.5">
                  {[
                    'Ajoute 3 items sur le balisage lumineux',
                    'Ajoute des items du Doc 9137 Partie 1 (SLI)',
                    'Supprime les items en double sur le SGS',
                  ].map((exemple, i) => (
                    <button
                      key={i}
                      onClick={() => { setChatInput(exemple); chatInputRef.current?.focus(); }}
                      className="block w-full text-left text-[10px] px-2.5 py-1.5 rounded-lg bg-muted/30 hover:bg-role-primary-soft text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {exemple}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                  m.role === 'user'
                    ? 'bg-role-primary text-white rounded-br-sm'
                    : 'bg-muted/50 text-foreground rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
                {m.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-role-primary" />
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5 text-purple-600" />
                </div>
                <div className="rounded-xl px-3 py-2 bg-muted/50">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                placeholder="Ajouter, modifier, supprimer..."
                disabled={chatLoading}
                className="flex-1 h-9 px-3 text-xs rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-role-primary/50 disabled:opacity-50"
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
                className="h-9 w-9 flex items-center justify-center rounded-lg bg-role-primary text-white hover:bg-role-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>)
  : (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onClick={handleOverlayClick}
      data-module="kit-checklist-preview"
    >
      <div className="form-shell-content max-w-5xl">
        <div className="form-shell-inner">

          {/* ── En-tête ───────────────────────────────────── */}
          <div className="form-shell-header">
            <div className="form-shell-title">
              <span className="form-shell-icon-wrap" style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}>
                <Brain className="w-5 h-5 text-white" />
              </span>
              <div>
                <span className="form-shell-title-text">
                  <Sparkles className="w-4 h-4 inline mr-1.5 text-purple-400" />
                  Checklist générée par l'IA
                </span>
                <span className="form-shell-subtitle">
                  {doc.nom} (v{doc.version}) — {analyse.reference_base}
                </span>
              </div>
            </div>
            <button className="modal-close" onClick={onClose} aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Corps + Chat IA (flex row) ─────────────────── */}
          <div className="form-shell-body max-h-[75vh]" style={{ display: 'flex', flexDirection: 'row', padding: 0, overflow: 'hidden' }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ✅ Informations document + analyse */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl border border-indigo-200/50 p-4">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Référence</p>
                      <p className="text-sm font-medium">{analyse.reference_base}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Type OACI</p>
                      <p className="text-sm font-medium">{analyse.type_oaci_detecte}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-indigo-500" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Analyse le</p>
                      <p className="text-sm font-medium">{new Date(analyse.analysed_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                </div>

                {/* Domaines impactés */}
                <div className="mt-3 pt-3 border-t border-indigo-200/50">
                  <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Target className="w-3 h-3" />
                    Domaines couverts ({(localPreview || []).length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(localPreview || []).map((d: any) => (
                      <span
                        key={d.id}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-br from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/30"
                        style={{ color: 'white' }}
                      >
                        {d.nom}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* ✅ Statistiques temps réel */}
              <div className="border border-border rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">Items: {stats.total}</span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-green-500 to-emerald-600" style={{ color: 'white' }} title={STATE_LABELS.SA}>SA: {stats.sa}</span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-red-500 to-rose-600" style={{ color: 'white' }} title={STATE_LABELS.NS}>NS: {stats.ns}</span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-blue-500 to-blue-600" style={{ color: 'white' }} title={STATE_LABELS.NA}>NA: {stats.na}</span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-gradient-to-br from-amber-500 to-orange-600" style={{ color: 'white' }} title={STATE_LABELS.NV}>NV: {stats.nv}</span>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${getConformiteColor(stats.tauxConformiteReel)}`}>
                    Conformité réelle: {stats.tauxConformiteReel}%
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <div className="progress h-2 flex-1">
                    <div className={`progress-bar ${getProgressBarColor(stats.progression)}`} style={{ width: `${stats.progression}%` }} />
                  </div>
                  <span className="text-sm font-medium text-foreground w-12">{stats.progression}%</span>
                </div>
              </div>

              {/* ✅ Domaines avec tableaux 6 colonnes et couleurs hiérarchiques */}
              <div className="space-y-3">
                {(localPreview || []).map((domaine: any) => {
                  const isExpanded = expandedDomaines[domaine.id] !== false;
                  const totalItems =
                    (domaine.items || []).length +
                    (domaine.sousDomaines || []).reduce((acc: number, sd: any) =>
                      acc + (sd.items || []).length +
                      (sd.sousSousDomaines || []).reduce((a: number, ssd: any) => a + (ssd.items || []).length, 0), 0);

                  return (
                    <div key={domaine.id} className="border border-border rounded-xl overflow-hidden shadow-sm">
                      {/* Niveau 1 : Domaine */}
                      <LevelHeader
                        label={`${domaine.nom}${domaine.description ? ` — ${domaine.description}` : ''}`}
                        count={totalItems}
                        isExpanded={isExpanded}
                        onToggle={() => toggleDomaine(domaine.id)}
                        level="domaine"
                      />

                      {isExpanded && (
                        <div className="p-3 space-y-3 bg-background">
                          {domaine.items && domaine.items.length > 0 && (
                            <ChecklistTable
                              items={domaine.items}
                              onUpdateItem={(itemId, field, value) => updateItemInPath(domaine.id, null, null, itemId, field, value)}
                              onDeleteItem={(itemId) => deleteItemInPath(domaine.id, null, null, itemId)}
                              onAddItem={() => addItemInPath(domaine.id, null, null)}
                            />
                          )}
                          {(domaine.items || []).length === 0 && !domaine.sousDomaines?.length && (
                            <ChecklistTable
                              items={[]}
                              onAddItem={() => addItemInPath(domaine.id, null, null)}
                            />
                          )}

                          {(domaine.sousDomaines || []).map((sd: any) => {
                            const sdItems = (sd.items || []).length +
                              (sd.sousSousDomaines || []).reduce((a: number, ssd: any) => a + (ssd.items || []).length, 0);
                            return (
                              <div key={sd.id} className="border border-blue-200/50 dark:border-blue-800/30 rounded-lg overflow-hidden">
                                {/* Niveau 2 : Sous-domaine */}
                                <div className="flex items-stretch">
                                  <div className="flex-1 min-w-0">
                                    <LevelHeader
                                      label={sd.nom}
                                      count={sdItems}
                                      isExpanded={expandedSousDomaines[sd.id] !== false}
                                      onToggle={() => toggleSousDomaine(sd.id)}
                                      level="sousDomaine"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => deleteSousDomaine(domaine.id, sd.id)}
                                    className="px-2 bg-blue-500 hover:bg-red-500 text-white transition-colors flex items-center"
                                    title="Supprimer le sous-domaine"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {(expandedSousDomaines[sd.id] !== false) && (
                                <div className="p-3 space-y-3">
                                  {sd.items && sd.items.length > 0 && (
                                    <ChecklistTable
                                      items={sd.items}
                                      onUpdateItem={(itemId, field, value) => updateItemInPath(domaine.id, sd.id, null, itemId, field, value)}
                                      onDeleteItem={(itemId) => deleteItemInPath(domaine.id, sd.id, null, itemId)}
                                      onAddItem={() => addItemInPath(domaine.id, sd.id, null)}
                                    />
                                  )}
                                  {(sd.sousSousDomaines || []).map((ssd: any) => (
                                    <div key={ssd.id} className="border border-teal-200/50 dark:border-teal-800/30 rounded-lg overflow-hidden">
                                      {/* Niveau 3 : Sous-sous-domaine */}
                                      <div className="flex items-stretch">
                                        <div className="flex-1 min-w-0">
                                          <LevelHeader
                                            label={ssd.nom}
                                            count={(ssd.items || []).length}
                                            isExpanded={expandedSousSousDomaines[ssd.id] !== false}
                                            onToggle={() => toggleSousSousDomaine(ssd.id)}
                                            level="sousSousDomaine"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => deleteSousSousDomaine(domaine.id, sd.id, ssd.id)}
                                          className="px-2 bg-blue-400 hover:bg-red-500 text-white transition-colors flex items-center"
                                          title="Supprimer le sous-sous-domaine"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      {(expandedSousSousDomaines[ssd.id] !== false) && (
                                      <div className="p-3">
                                        {ssd.items && ssd.items.length > 0 ? (
                                          <ChecklistTable
                                            items={ssd.items}
                                            onUpdateItem={(itemId, field, value) => updateItemInPath(domaine.id, sd.id, ssd.id, itemId, field, value)}
                                            onDeleteItem={(itemId) => deleteItemInPath(domaine.id, sd.id, ssd.id, itemId)}
                                            onAddItem={() => addItemInPath(domaine.id, sd.id, ssd.id)}
                                          />
                                        ) : (
                                          <ChecklistTable
                                            items={[]}
                                            onAddItem={() => addItemInPath(domaine.id, sd.id, ssd.id)}
                                          />
                                        )}
                                      </div>
                                      )}
                                      </div>
                                  ))}
                                  {(sd.sousSousDomaines || []).length === 0 && (sd.items || []).length === 0 && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground py-2">Aucun item</p>
                                      <div className="flex gap-2 justify-center pb-2">
                                        <button
                                          type="button"
                                          onClick={() => addItemInPath(domaine.id, sd.id, null)}
                                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                                        >
                                          <Plus className="w-3 h-3" /> Ajouter un item
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => addSousSousDomaine(domaine.id, sd.id)}
                                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-800"
                                        >
                                          <PlusCircle className="w-3 h-3" /> Sous-sous-domaine
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {sd.sousSousDomaines?.length > 0 && (
                                    <div className="flex justify-center pt-1">
                                      <button
                                        type="button"
                                        onClick={() => addSousSousDomaine(domaine.id, sd.id)}
                                        className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-600 hover:text-teal-800 transition-colors"
                                      >
                                        <PlusCircle className="w-3 h-3" /> Ajouter un sous-sous-domaine
                                      </button>
                                    </div>
                                  )}
                                 </div>
                                )}
                              </div>
                            );
                          })}

                          <div className="flex gap-3 justify-center pt-1">
                            <button
                              type="button"
                              onClick={() => addSousDomaine(domaine.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                            >
                              <PlusCircle className="w-3.5 h-3.5" /> Ajouter un sous-domaine
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>

            {/* ── Chat IA — panneau latéral ───── */}
            {chatOpen && (
            <div className="w-80 shrink-0 border-l border-border flex flex-col bg-background">
              {/* En-tête chat */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-semibold text-foreground">Assistant IA</span>
                </div>
                <button onClick={() => setChatOpen(false)} className="action-button p-1">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <Bot className="w-8 h-8 mx-auto mb-2 text-purple-300" />
                    <p className="text-xs text-muted-foreground">
                      Demandez à l'IA d'ajouter, modifier ou supprimer des items de la checklist.
                    </p>
                    <div className="mt-3 space-y-1.5">
                      {[
                        'Ajoute 3 items sur le balisage lumineux',
                        'Ajoute des items du Doc 9137 Partie 1 (SLI)',
                        'Supprime les items en double sur le SGS',
                      ].map((exemple, i) => (
                        <button
                          key={i}
                          onClick={() => { setChatInput(exemple); chatInputRef.current?.focus(); }}
                          className="block w-full text-left text-[10px] px-2.5 py-1.5 rounded-lg bg-muted/30 hover:bg-role-primary-soft text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {exemple}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'assistant' && (
                      <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-purple-600" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                      m.role === 'user'
                        ? 'bg-role-primary text-white rounded-br-sm'
                        : 'bg-muted/50 text-foreground rounded-bl-sm'
                    }`}>
                      {m.content}
                    </div>
                    {m.role === 'user' && (
                      <div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5 text-role-primary" />
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-2 justify-start">
                    <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-purple-600" />
                    </div>
                    <div className="rounded-xl px-3 py-2 bg-muted/50">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border p-2.5">
                <div className="flex gap-2">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                    placeholder="Ajouter, modifier, supprimer..."
                    disabled={chatLoading}
                    className="flex-1 h-9 px-3 text-xs rounded-lg border border-border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-role-primary/50 disabled:opacity-50"
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={chatLoading || !chatInput.trim()}
                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-role-primary text-white hover:bg-role-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* ── Pied ──────────────────────────────────────── */}
          <div className="form-shell-footer">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className="btn btn-sm btn-success gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Enregistrer
                </button>
                <span className="text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 inline mr-1 text-purple-500" />
                  {stats.total} item(s)
                </span>
                <button
                  onClick={() => setChatOpen(!chatOpen)}
                  className={`btn btn-sm gap-1.5 ${chatOpen ? 'btn-primary' : 'btn-secondary'}`}
                >
                  <Bot className="w-3.5 h-3.5" />
                  IA
                </button>
              </div>
              <button onClick={asPage ? onBack : onClose} className="btn btn-sm btn-secondary gap-2">
                {asPage ? <ArrowLeft className="w-4 h-4" /> : <X className="w-4 h-4" />} {asPage ? 'Retour' : 'Fermer'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );

  if (asPage) return modalContent;

  return createPortal(modalContent, document.body);
}
