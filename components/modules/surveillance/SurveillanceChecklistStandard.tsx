'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Save, PenLine, Calendar, Users, MapPin,
  Target, Brain, Sparkles, Shield,
  Zap, Check, ChevronDown, Eye, X,
} from 'lucide-react';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { ChecklistStandardTable } from '@/components/modules/checklist/ChecklistStandardTable';
import { ConfidenceIndicator } from '@/components/modules/checklist/ChecklistFormContent';
import {
  DomaineChecklist, ChecklistItem,
  ResultatChecklist,
  EvaluationSGS, MaturiteSGSDetaillee, buildEvaluationFromMaturiteDetaillee,
} from '@/types/checklist';
import { SGSEvaluationModal } from './SGSEvaluation';
import { kitDocAgent } from '@/lib/ia/agents/kitDocAgent';


function getProgressBarColor(taux: number): string {
  if (taux >= 80) return 'bg-success';
  if (taux >= 60) return 'bg-primary';
  if (taux >= 40) return 'bg-warning';
  return 'bg-danger';
}

function getConformiteBadgeColor(taux: number): string {
  if (taux >= 80) return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  if (taux >= 60) return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  if (taux >= 40) return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800';
}


const DOMAINES_PREDEFINIS = [
  { id: 'sli', nom: 'SLI', description: 'Sauvetage et Lutte Incendie' },
  { id: 'phy', nom: 'PHY', description: 'Caractéristiques physiques' },
  { id: 'ols', nom: 'OLS', description: 'Surface de limitation d\'obstacles' },
  { id: 'ra', nom: 'RA', description: 'Risque Animalier' },
  { id: 'elec', nom: 'ELEC', description: 'Réseaux Électriques' },
  { id: 'mfp', nom: 'MFP', description: 'Marques, Feux et Panneaux' },
  { id: 'cop', nom: 'COP', description: 'Compétences Organisationnelles et Personnels' },
  { id: 'ops', nom: 'OPS', description: 'Procédures opérationnelles' },
];

function SuggestionsBanner({ suggestions, onAcceptAll, onIgnore }: {
  suggestions: { itemId: string; itemNumero: string; justification: string; confiance: number }[];
  onAcceptAll: () => void;
  onIgnore: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [accepted, setAccepted] = useState<string[]>([]);
  if (suggestions.length === 0) return null;
  const remaining = suggestions.filter(s => !accepted.includes(s.itemId));
  if (remaining.length === 0) return null;
  return (
    <div className="card border-l-4 border-l-primary bg-primary/5 mb-4">
      <button className="w-full flex items-center justify-between p-3" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-blue-500" />
          <span className="font-semibold text-sm">Suggestions du système ({remaining.length})</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-200">Intelligentes</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); onAcceptAll(); }} className="btn btn-sm btn-primary gap-2"><Zap className="w-4 h-4" /> Accepter tout</button>
          <button onClick={(e) => { e.stopPropagation(); onIgnore(); }} className="btn btn-sm btn-secondary gap-2">Ignorer</button>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="p-3 pt-0 space-y-2">
          {remaining.map(s => (
            <div key={s.itemId} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <span className="code-oaci-badge text-xs">{s.itemNumero}</span>
                <span className="text-sm text-blue-500">{s.justification}</span>
                <ConfidenceIndicator confiance={s.confiance} />
              </div>
              <button onClick={() => setAccepted(prev => [...prev, s.itemId])} className="btn btn-sm btn-primary gap-2"><Check className="w-3 h-3" /> Appliquer</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatchValidationButton({ itemsSA, onValidateAll, tempsEstime }: {
  itemsSA: { id: string; prediction: ResultatChecklist; confiance: number }[];
  onValidateAll: () => void;
  tempsEstime: number;
}) {
  if (itemsSA.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <button onClick={onValidateAll} className="btn btn-sm btn-primary gap-2" title={`Valider automatiquement les ${itemsSA.length} items SA avec haute confiance`}>
        <Zap className="w-3 h-3" /> Valider les {itemsSA.length} SA
      </button>
      <span className="text-[10px] text-blue-400">(~{tempsEstime} min gagné)</span>
    </div>
  );
}


export function SurveillanceChecklistStandard({
  surveillanceId, surveillance, onSave, onComplete, readOnly = false, userRole = 'inspector', autoOpenSGS = false, excludeDomaines = [],
  modeSaisie = 'clavier',
}: {
  surveillanceId: string;
  surveillance: { aerodrome?: { code_oaci: string; nom: string }; type: string; date_debut: string; equipe_ids: string[]; chef_id: string; };
  onSave?: (checklistState: any) => void;
  onComplete?: () => void;
  readOnly?: boolean;
  userRole?: string;
  /** Ouvre automatiquement l'évaluation SGS (PAOE) dès le montage — pour les surveillances SGS-only */
  autoOpenSGS?: boolean;
  /** Domaines à exclure de la checklist (ex: ['SGS'] pour portée mixte SGS + autres) */
  excludeDomaines?: string[];
  /** Mode de saisie (piloté depuis le header de page) */
  modeSaisie?: import('@/types/checklist').ModeSaisie;
}) {
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const recordCorrection = useAppStore(s => s.recordCorrection);
  const upsertItemHistory = useAppStore(s => s.upsertItemHistory);
  const validateBatchItems = useAppStore(s => s.validateBatchItems);
  const getExemptionsActives = useAppStore(s => s.getExemptionsActives);

  const [domaines, setDomaines] = useState<DomaineChecklist[]>([]);
  const [iaPrefilledCount, setIaPrefilledCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<{ itemId: string; itemNumero: string; justification: string; confiance: number }[]>([]);
  const [sgsEvaluationOpen, setSgsEvaluationOpen] = useState(autoOpenSGS);
  const [sgsEvaluation, setSgsEvaluation] = useState<EvaluationSGS | null>(null);


  const aerodromeId = surveillance.aerodrome?.code_oaci || 'unknown';
  const profil = profilsRisque?.[aerodromeId] || null;
  const exemptionsActives = getExemptionsActives(aerodromeId);

  const aerodrome = useAppStore(s => s.aerodromes.find(a => a.id === aerodromeId) || s.aerodromes.find(a => a.code_oaci === aerodromeId));
  const previousSGSMaturite = aerodrome?.maturite_sgs_detaille || null;

  const previousEvaluation = useMemo(() => {
    if (!previousSGSMaturite || !user?.id) return null;
    try {
      return buildEvaluationFromMaturiteDetaillee(
        previousSGSMaturite as MaturiteSGSDetaillee,
        aerodromeId,
        surveillanceId,
        user.id,
        `${user.prenom || ''} ${user.nom || ''}`,
      );
    } catch {
      return null;
    }
  }, [previousSGSMaturite, aerodromeId, surveillanceId, user]);

  const riskTrend = useMemo(() => {
    if (!profil || !previousSGSMaturite) return 'stable';
    const previousScore = previousSGSMaturite.scoreGlobal ?? 0;
    const currentScore = profil.c1 ?? 50;
    const diff = currentScore - previousScore;
    if (diff > 10) return 'improving';
    if (diff < -10) return 'degrading';
    return 'stable';
  }, [profil, previousSGSMaturite]);


  // Merge saved flat item data into hierarchy (recovery for data saved via updateChecklistItem)
  const mergeItemsIntoHierarchy = (domaines: DomaineChecklist[], flatItems: any[]) => {
    if (!flatItems.length) return;
    const itemMap = new Map(flatItems.map(i => [i.id, i]));
    const walkItems = (items: ChecklistItem[] | undefined) => {
      if (!items) return;
      items.forEach(item => {
        const saved = itemMap.get(item.id);
        if (saved) {
          item.resultat = saved.resultat;
          item.observation = saved.observation;
          item.observation_stylus_data = saved.observation_stylus_data;
          item.fichiers = saved.fichiers;
          item.mode_saisie_obs = saved.mode_saisie_obs;
          if (item.resultat || item.observation) item.prefilled = false;
        }
      });
    };
    domaines.forEach(d => {
      walkItems(d.items);
      (d.sousDomaines || []).forEach(sd => {
        walkItems(sd.items);
        (sd.sousSousDomaines || []).forEach(ssd => walkItems(ssd.items));
      });
    });
  };

  useEffect(() => {
    const store = useAppStore.getState();
    const surveillanceObj = store.surveillances.find(s => s.id === surveillanceId);
    const flatItems = store.checklistItems?.[surveillanceId] || [];
    if (surveillanceObj?.checklist_hierarchy && surveillanceObj.checklist_hierarchy.length > 0) {
      let hierarchy = surveillanceObj.checklist_hierarchy as unknown as DomaineChecklist[];
      if (excludeDomaines.length > 0) {
        const excludeUpper = excludeDomaines.map(e => e.toUpperCase());
        hierarchy = hierarchy.filter(d => !excludeUpper.some(e => (d.nom || d.id || '').toUpperCase().includes(e)));
      }
      mergeItemsIntoHierarchy(hierarchy, flatItems);
      // Filtrer par délégation pour les inspecteurs (pas le chef)
      const delegKey2 = `sgda_delegations_${surveillanceObj.planning_id || surveillanceId}`
      try {
        const raw = localStorage.getItem(delegKey2)
        if (raw) {
          const delegations: Record<string, string> = JSON.parse(raw)
          const hasDelegations = Object.values(delegations).some(Boolean)
          const isChef = user?.id === (surveillanceObj as any).chef_id || user?.role === 'admin'
          if (hasDelegations && !isChef && user?.id) {
            hierarchy = hierarchy.filter(d => {
              const code = (d.id || d.nom || '').toUpperCase()
              return delegations[code] === user?.id || !delegations[code]
            })
          }
        }
      } catch { /* ignore */ }
      setDomaines(hierarchy);
      let count = 0;
      const countItems = (d: DomaineChecklist) => {
        count += (d.items || []).filter(i => i.prefilled).length;
        (d.sousDomaines || []).forEach(sd => {
          count += (sd.items || []).filter(i => i.prefilled).length;
          (sd.sousSousDomaines || []).forEach(ssd => count += (ssd.items || []).filter(i => i.prefilled).length);
        });
      };
      hierarchy.forEach(d => countItems(d));
      setIaPrefilledCount(count);
      return;
    }
    const prefilledHierarchy = store.checklistHierarchy?.[surveillanceId];
    if (prefilledHierarchy && prefilledHierarchy.length > 0) {
      let hierarchy = prefilledHierarchy as unknown as DomaineChecklist[];
      if (excludeDomaines.length > 0) {
        const excludeUpper = excludeDomaines.map(e => e.toUpperCase());
        hierarchy = hierarchy.filter(d => !excludeUpper.some(e => (d.nom || d.id || '').toUpperCase().includes(e)));
      }
      mergeItemsIntoHierarchy(hierarchy, flatItems);
      setDomaines(hierarchy);
      let count = 0;
      const countItems = (d: any) => {
        count += (d.items || []).filter((i: ChecklistItem) => i.prefilled).length;
        (d.sousDomaines || []).forEach((sd: any) => {
          count += (sd.items || []).filter((i: ChecklistItem) => i.prefilled).length;
          (sd.sousSousDomaines || []).forEach((ssd: any) => count += (ssd.items || []).filter((i: ChecklistItem) => i.prefilled).length);
        });
      };
      hierarchy.forEach(d => countItems(d));
      setIaPrefilledCount(count);
      return;
    }
    const initialDomaines: DomaineChecklist[] = DOMAINES_PREDEFINIS
      .filter(d => excludeDomaines.length === 0 || !excludeDomaines.map(e => e.toUpperCase()).some(e => (d.nom || d.id || '').toUpperCase().includes(e)))
      .map((d, idx) => ({
        id: d.id, nom: d.nom, description: d.description, items: [], sousDomaines: [],
        isExpanded: true, progression: 0, ordre: idx,
      }));
    setDomaines(initialDomaines);
  }, [surveillanceId]);

  const stats = useMemo(() => {
    let total = 0, sa = 0, ns = 0, nv = 0, na = 0;
    const collect = (items: ChecklistItem[] | undefined) => {
      if (!items) return;
      items.forEach(item => {
        total++;
        const r = item.resultat || item.prediction || 'NV';
        if (r === 'SA') sa++; else if (r === 'NS') ns++; else if (r === 'NA') na++; else nv++;
      });
    };
    domaines.forEach(d => {
      collect(d.items ?? []);
      (d.sousDomaines ?? []).forEach(sd => {
        collect(sd.items ?? []);
        (sd.sousSousDomaines ?? []).forEach(ssd => collect(ssd.items ?? []));
      });
    });
    const renseignes = sa + ns + na;
    const progression = total > 0 ? Math.round((renseignes / total) * 100) : 0;
    const tauxConformiteReel = total > 0 ? Math.round((sa / (sa + ns + nv)) * 100) : 0;
    const itemsSA: { id: string; prediction: ResultatChecklist; confiance: number }[] = [];
    const collectSA = (items: ChecklistItem[] | undefined) => {
      if (!items) return;
      items.forEach(item => {
        if ((item.resultat === 'SA' || item.prediction === 'SA') && (item.confiance || 0) >= 70) {
          itemsSA.push({ id: item.id, prediction: 'SA', confiance: item.confiance || 0 });
        }
      });
    };
    domaines.forEach(d => {
      collectSA(d.items ?? []);
      (d.sousDomaines ?? []).forEach(sd => {
        collectSA(sd.items ?? []);
        (sd.sousSousDomaines ?? []).forEach(ssd => collectSA(ssd.items ?? []));
      });
    });
    return { total, sa, ns, nv, na, progression, tauxConformiteReel, itemsSA };
  }, [domaines]);

  useEffect(() => {
    const newSuggestions: { itemId: string; itemNumero: string; justification: string; confiance: number }[] = [];
    domaines.forEach(d => {
      const process = (items: ChecklistItem[]) => {
        items.forEach(item => {
          if (item.alerte === true && !item.resultat) {
            newSuggestions.push({ itemId: item.id, itemNumero: item.numero, justification: item.justification || 'Vérification recommandée', confiance: item.confiance || 0 });
          }
        });
      };
      process(d.items ?? []);
      (d.sousDomaines ?? []).forEach(sd => {
        process(sd.items ?? []);
        (sd.sousSousDomaines ?? []).forEach(ssd => process(ssd.items ?? []));
      });
    });
    setSuggestions(newSuggestions);
  }, [domaines]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (domaines.length > 0 && !readOnly && !isSigned) { setLastSaved(new Date()); onSave?.(domaines); }
    }, 2000);
    return () => clearInterval(interval);
  }, [domaines, readOnly, isSigned, onSave]);

  const handleBatchValidate = () => {
    const batchResult = validateBatchItems(stats.itemsSA, true);
    const applyBatch = (items: ChecklistItem[]) => items.map(item =>
      batchResult.items_valides.includes(item.id) ? { ...item, resultat: 'SA' as ResultatChecklist, prefilled: true } : item);
    setDomaines(prev => prev.map(d => ({
      ...d, items: applyBatch(d.items),
      sousDomaines: d.sousDomaines.map(sd => ({ ...sd, items: applyBatch(sd.items), sousSousDomaines: sd.sousSousDomaines.map(ssd => ({ ...ssd, items: applyBatch(ssd.items) })) })),
    })));
    addNotification({ user_id: user?.id || '', type: 'success', title: 'Validation batch', message: `${batchResult.items_valides.length} items SA validés automatiquement`, canal: 'in_app' });
  };

  const handleAcceptAllSuggestions = () => {
    const apply = (items: ChecklistItem[]) => items.map(item => item.alerte && !item.resultat ? { ...item, resultat: item.prediction, prefilled: true, alerte: false } : item);
    setDomaines(prev => prev.map(d => ({
      ...d, items: apply(d.items),
      sousDomaines: d.sousDomaines.map(sd => ({ ...sd, items: apply(sd.items), sousSousDomaines: sd.sousSousDomaines.map(ssd => ({ ...ssd, items: apply(ssd.items) })) })),
    })));
    setSuggestions([]);
    addNotification({ user_id: user?.id || '', type: 'success', title: 'Suggestions appliquées', message: 'Toutes les suggestions ont été appliquées', canal: 'in_app' });
  };

  const handleIgnoreSuggestions = () => setSuggestions([]);

  const updateItem = useCallback((updated: ChecklistItem) => {
    setDomaines(prev => {
      // Find old item & context for history tracking
      let oldItem: ChecklistItem | undefined;
      let dNom = '', sdNom = '', ssdNom = '';

      outer: for (const d of prev) {
        for (const i of (d.items || [])) {
          if (i.id === updated.id) { oldItem = i; dNom = d.nom; break outer; }
        }
        for (const sd of d.sousDomaines) {
          for (const i of (sd.items || [])) {
            if (i.id === updated.id) { oldItem = i; dNom = d.nom; sdNom = sd.nom; break outer; }
          }
          for (const ssd of sd.sousSousDomaines) {
            for (const i of (ssd.items || [])) {
              if (i.id === updated.id) { oldItem = i; dNom = d.nom; sdNom = sd.nom; ssdNom = ssd.nom; break outer; }
            }
          }
        }
      }

      if (oldItem && (oldItem.resultat !== updated.resultat || oldItem.observation !== updated.observation)) {
        upsertItemHistory(aerodromeId, surveillance.type, dNom, sdNom, ssdNom, {
          id: updated.id, numero: updated.numero || '', point_verification: updated.point_verification || '',
          resultat: updated.resultat, observation: updated.observation, fichiers: updated.fichiers,
        }, surveillanceId);
        if (oldItem.prediction && oldItem.prediction !== 'NV' && oldItem.prediction !== updated.resultat) {
          recordCorrection(aerodromeId, surveillance.type, dNom, sdNom, ssdNom, updated.id, oldItem.prediction, updated.resultat ?? '', updated.observation);
        }
      }

      const replaceItem = (items: ChecklistItem[]) => items.map(i => i.id === updated.id ? updated : i);
      return prev.map(d => ({
        ...d,
        items: replaceItem(d.items || []),
        sousDomaines: d.sousDomaines.map(sd => ({
          ...sd,
          items: replaceItem(sd.items || []),
          sousSousDomaines: sd.sousSousDomaines.map(ssd => ({
            ...ssd,
            items: replaceItem(ssd.items || []),
          })),
        })),
      }));
    });
  }, [aerodromeId, surveillance.type, surveillanceId, upsertItemHistory, recordCorrection]);

  const handleSaveSGSEvaluation = (evaluation: EvaluationSGS) => {
    setSgsEvaluation(evaluation);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Évaluation SGS enregistrée',
      message: `Maturité SGS: ${evaluation.scoreGlobal}% — sera appliquée à la signature`,
      canal: 'in_app',
    });
  };

  const handleGenerateSGSByIA = useCallback(async (composanteId: number, elementId: string) => {
    const aerodrome = useAppStore.getState().aerodromes.find(a => a.id === aerodromeId || a.code_oaci === aerodromeId);
    const docsActifs = (useAppStore.getState().kitDocuments || []).filter(d => d.etat === 'a_jour' && d.domaines.includes('SGS'));
    try {
      const result = await kitDocAgent.generateSGSQuestions({
        aerodromeType: aerodrome?.type || 'national',
        maturiteInitiale: aerodrome?.maturite_sgs,
        composanteId: composanteId as 1 | 2 | 3 | 4 | 5,
        elementId,
        elementLabel: elementId,
        documentsActifs: docsActifs,
      });
      return result;
    } catch (err) {
      console.error('[SurveillanceChecklistStandard] Erreur génération SGS IA:', err);
      return null;
    }
  }, [aerodromeId]);

  const computeSurveillanceScore = useCallback((): number => {
    const { sa, ns, na, total } = stats;
    if (total === 0) return 70;
    const renseignes = sa + ns + na;
    if (renseignes === 0) return 70;
    const tauxConformite = Math.round((sa / (sa + ns)) * 100);
    const tauxCompletion = Math.round((renseignes / total) * 100);
    return Math.round(tauxConformite * 0.7 + tauxCompletion * 0.3);
  }, [stats]);

  const onSignatureSave = async (signatureUrl: string) => {
    setIsSigned(true);
    setSignatureDialogOpen(false);

    const scoreGlobal = computeSurveillanceScore();
    
    // Récupérer les signatures existantes et ajouter la nouvelle
    const existingSigs = surveillance?.signatures_checklist || []
    const newSig = { signataire_id: user?.id || '', signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`, date_signature: new Date().toISOString(), signature_url: signatureUrl }
    const allSigs = [...existingSigs.filter(s => s.signataire_id !== user?.id), newSig]

    // Vérifier si TOUS les délégués ont signé
    let allDelegatedSigned = true
    const delegationRaw = localStorage.getItem(`sgda_delegations_${surveillance?.planning_id || surveillanceId}`)
    if (delegationRaw) {
      try {
        const delegations: Record<string, string> = JSON.parse(delegationRaw)
        const delegatedIds = new Set(Object.values(delegations).filter(Boolean))
        const signedIds = new Set(allSigs.map(s => s.signataire_id))
        allDelegatedSigned = delegatedIds.size === 0 || [...delegatedIds].every(id => signedIds.has(id))
      } catch { /* ignoré */ }
    }

    updateSurveillance(surveillanceId, {
      statut: allDelegatedSigned ? 'checklist_signee' : surveillance?.statut || 'en_cours',
      score_global: scoreGlobal,
      signatures_checklist: allSigs,
    });

    if (sgsEvaluation) {
      const { updateAerodrome, recalculerProfilRisque } = useAppStore.getState();
      await updateAerodrome(aerodromeId, {
        maturite_sgs: sgsEvaluation.scoreGlobal,
        maturite_sgs_detaille: {
          composantes: Object.fromEntries(
            sgsEvaluation.composantes.map(c => [c.id, {
              score: c.score,
              niveauGlobal: c.niveauGlobal,
              elements: c.elements.map(e => ({
                elementId: e.elementId,
                niveau: e.niveauGlobal,
                questions: e.questions.map(q => ({ questionId: q.id, niveau: q.niveau, justification: q.justification })),
              })),
            }])
          ) as Record<1 | 2 | 3 | 4 | 5, { score: number; niveauGlobal: string; elements: { elementId: string; niveau: string; questions: { questionId: string; niveau: string; justification?: string }[] }[] }>,
          scoreGlobal: sgsEvaluation.scoreGlobal,
          evalueLe: sgsEvaluation.date,
          evaluePar: sgsEvaluation.inspecteurNom,
        },
      });
      await recalculerProfilRisque(aerodromeId);
    } else {
      const { recalculerProfilRisque } = useAppStore.getState();
      await recalculerProfilRisque(aerodromeId);
    }

    onComplete?.();
  };

  const handleSignChecklist = () => {
    if (stats.progression < 100) {
      addNotification({ user_id: user?.id || '', type: 'warning', title: 'Checklist incomplète', message: `${100 - stats.progression}% des items non renseignés`, canal: 'in_app' });
      return;
    }
    setSignatureDialogOpen(true);
  };



  // Autoriser l'édition si aucune restriction d'équipe n'est configurée (chef_id vide = surveillance non affectée)
  const noTeamRestriction = !surveillance.chef_id;
  const isChef = noTeamRestriction || user?.id === surveillance.chef_id || userRole === 'admin';
  const isEquipeMember = noTeamRestriction || (!!user?.id && (surveillance.equipe_ids || []).includes(user.id));
  const canEditChecklist = isChef || isEquipeMember;
  const actualReadOnly = readOnly || isSigned || !canEditChecklist;

  return (
    <div className="space-y-6" data-role={userRole} data-module="checklist-standard">
      {/* En-tête */}
      <div className="card border-l-4 border-l-role-primary bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="card-content p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 border border-blue-400/30 shadow-lg shadow-blue-500/20 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div><p className="filter-label text-xs">Aérodrome</p><p className="font-bold text-small">{surveillance.aerodrome?.code_oaci} - {surveillance.aerodrome?.nom}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 border border-indigo-400/30 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
                  <Eye className="h-5 w-5 text-white" />
                </div>
                <div><p className="filter-label text-xs">Type</p><p className="font-medium text-small">{surveillance.type}</p></div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 border border-amber-400/30 shadow-lg shadow-amber-500/20 flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <div><p className="filter-label text-xs">Date</p><p className="font-medium text-small">{new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}</p></div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 border border-purple-400/30 shadow-lg shadow-purple-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div className="flex -space-x-2">
                {surveillance.equipe_ids.map(id => (
                  <div key={id} className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center text-white text-[13px] font-bold border-2 border-white shadow-lg">{id.slice(-2).toUpperCase()}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-primary/20">
            <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wide mb-2 flex items-center gap-2"><Target className="w-3 h-3" /> Domaines à inspecter (fixes)</p>
            <div className="flex flex-wrap gap-2">
              {domaines.map(d => (
                <span key={d.id ?? d.nom} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold !text-white bg-gradient-to-br from-blue-600 to-blue-500 border border-blue-400/30 shadow-lg shadow-blue-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-blue-500/40 hover:brightness-110 hover:scale-105">{d.nom}</span>
              ))}
            </div>
          </div>
          {exemptionsActives.length > 0 && (
            <div className="mt-3 pt-3 border-t border-warning/30">
              <p className="text-[11px] font-semibold text-warning uppercase tracking-wide mb-2 flex items-center gap-2"><Shield className="w-3 h-3" /> Exemptions actives ({exemptionsActives.length})</p>
              <div className="flex flex-wrap gap-2">
                {exemptionsActives.map(e => (
                  <span key={e.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-medium bg-amber-100 text-amber-700 border border-amber-200" title={e.description}>{e.reference}</span>
                ))}
              </div>
              <p className="text-[10px] text-blue-400 mt-1">Les mesures d'atténuation seront ajoutées aux checklists de suivi.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bouton Évaluation SGS */}
      {domaines.some(d => d.nom === 'SGS') && !actualReadOnly && (
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
                      : previousEvaluation
                        ? `Évaluation précédente: ${previousEvaluation.scoreGlobal}% — Pré-remplie avec suggestions`
                        : 'Évaluez les 5 composantes du SGS avec le modèle PAOE (OACI Annexe 19)'}
                  </p>
                  {previousEvaluation && riskTrend !== 'stable' && (
                    <p className={`text-[10px] font-medium mt-0.5 ${riskTrend === 'improving' ? 'text-success' : 'text-danger'}`}>
                      {riskTrend === 'improving' ? '↑ Tendance: risque en amélioration' : '↓ Tendance: risque en dégradation'}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSgsEvaluationOpen(true)}
                className="btn btn-sm btn-primary gap-2"
              >
                <Shield className="w-4 h-4" />
                {sgsEvaluation ? 'Modifier l\'évaluation' : previousEvaluation ? 'Voir et ajuster les suggestions' : 'Évaluer le SGS'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SuggestionsBanner suggestions={suggestions} onAcceptAll={handleAcceptAllSuggestions} onIgnore={handleIgnoreSuggestions} />

      {iaPrefilledCount > 0 && (
        <div className="card border-l-4 border-l-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30">
          <div className="card-content p-3">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-purple-100 dark:bg-purple-900/50 p-1.5 flex-shrink-0"><Brain className="w-4 h-4 text-purple-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-purple-700 dark:text-purple-300 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Pré-remplissage IA actif — Kit Inspecteur</p>
                <p className="text-[12px] text-purple-600 dark:text-purple-400 mt-0.5">{iaPrefilledCount} item{iaPrefilledCount > 1 ? 's' : ''} pré-rempli{iaPrefilledCount > 1 ? 's' : ''} à partir des documents réglementaires analysés. Vous restez maître de chaque évaluation — acceptez, corrigez ou ignorez les propositions.</p>
              </div>
              <span className="badge text-[12px] bg-purple-100 text-purple-700 border-purple-200 flex-shrink-0">Suggestions IA</span>
            </div>
          </div>
        </div>
      )}

      {/* Stats conformité */}
      <div className="card border-border overflow-hidden">
        <div className="card-content p-4">
          {/* Compteurs SA/NS/NV/NA */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {([
              { r: 'SA', label: 'Satisfaisants', color: 'from-emerald-500 to-green-600', shadow: 'shadow-emerald-500/25' },
              { r: 'NS', label: 'Non satisfaisants', color: 'from-red-500 to-rose-600', shadow: 'shadow-red-500/25' },
              { r: 'NV', label: 'Non vérifiés', color: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/25' },
              { r: 'NA', label: 'Non applicables', color: 'from-slate-400 to-gray-500', shadow: 'shadow-slate-400/25' },
            ] as const).map(({ r, label, color, shadow }) => (
              <div key={r} className={`rounded-xl bg-gradient-to-br ${color} shadow-lg ${shadow} p-3 text-white text-center`}>
                <div className="text-2xl font-bold">{stats[r.toLowerCase() as 'sa'|'ns'|'nv'|'na']}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-90 mt-0.5">{r}</div>
                <div className="text-[9px] opacity-70 mt-0.5 leading-tight">{label}</div>
              </div>
            ))}
          </div>

          {/* Conformité + progress + actions */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold border flex-shrink-0 ${getConformiteBadgeColor(stats.tauxConformiteReel)}`}>
                <Target className="w-3.5 h-3.5" />
                Conformité: {stats.tauxConformiteReel}%
              </span>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="progress h-2 flex-1">
                  <div className={`progress-bar ${getProgressBarColor(stats.progression)} progress-fill`} style={{ '--pf': stats.progression } as React.CSSProperties} />
                </div>
                <span className="text-[12px] font-semibold text-muted-foreground w-12 text-right flex-shrink-0">{stats.progression}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lastSaved && <span className="text-[11px] text-muted-foreground hidden sm:block">✓ {lastSaved.toLocaleTimeString()}</span>}
              <BatchValidationButton itemsSA={stats.itemsSA} onValidateAll={handleBatchValidate} tempsEstime={Math.round(stats.itemsSA.length * 0.5)} />
              <button type="button" onClick={() => onSave?.(domaines)} className="btn btn-sm btn-primary gap-2">
                <Save className="w-4 h-4" /> Sauvegarder
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Checklist SGS-style table — rendu partagé */}
      <ChecklistStandardTable
        domaines={domaines}
        onUpdateItem={updateItem}
        onUpdateDomaines={actualReadOnly ? undefined : setDomaines}
        modeSaisie={modeSaisie}
        readOnly={actualReadOnly}
      />

      {/* Signature */}
      {!readOnly && !isSigned && (
        <div className={`card border-2 border-dashed ${stats.progression === 100 ? 'border-success bg-success/10' : 'border-blue-300 bg-blue-50 opacity-50'}`}>
          <div className="card-content p-6 text-center">
            <PenLine className={`h-12 w-12 mx-auto mb-4 ${stats.progression === 100 ? 'text-success' : 'text-blue-400'}`} />
            <h3 className="text-lg font-medium mb-2">Signature des inspecteurs</h3>
            {stats.progression === 100 ? (
              <>
                <p className="text-small text-blue-600 mb-4">✅ Tous les items sont renseignés ({stats.progression}%)</p>
                <button type="button" onClick={handleSignChecklist} className="btn btn-sm btn-primary gap-2">Signer la checklist</button>
              </>
            ) : (
              <p className="text-small text-blue-500">⏳ Progression: {stats.progression}% - {stats.nv} item(s) non vérifiés</p>
            )}
          </div>
        </div>
      )}

      {/* Modal évaluation SGS */}
      <SGSEvaluationModal
        isOpen={sgsEvaluationOpen}
        onClose={() => setSgsEvaluationOpen(false)}
        aerodromeId={aerodromeId}
        surveillanceId={surveillanceId}
        aerodromeNom={surveillance.aerodrome?.nom}
        surveillanceType={surveillance.type}
        surveillanceDate={surveillance.date_debut}
        equipeCount={surveillance.equipe_ids?.length}
        inspecteurId={user?.id || ''}
        inspecteurNom={`${user?.prenom || ''} ${user?.nom || ''}`}
        onSave={handleSaveSGSEvaluation}
        existingEvaluation={sgsEvaluation}
        previousEvaluation={previousEvaluation}
        riskTrend={riskTrend}
        onGenerateByIA={handleGenerateSGSByIA}
        readOnly={actualReadOnly}
      />

      {signatureDialogOpen && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl" onClick={e => e.stopPropagation()}>
            <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
              <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
                <div className="modal-title">Signature de la checklist</div>
                <button className="modal-close" onClick={() => setSignatureDialogOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body">
                <SignaturePadWithColor onSave={onSignatureSave} onCancel={() => setSignatureDialogOpen(false)}
                  signataireNom={`${user?.prenom || ''} ${user?.nom || ''}`} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default SurveillanceChecklistStandard;
