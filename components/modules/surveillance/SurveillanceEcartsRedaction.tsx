// components/modules/surveillance/SurveillanceEcartsRedaction.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  CheckCircle,
  PenLine,
  Plus,
  AlertTriangle,
  X,
  Save,
  FileText,
  ChevronDown,
  Target,
  Send,
  FolderTree,
  Sparkles,
  Brain,
  Loader2,
  Zap,
} from 'lucide-react';
import { SignaturePadWithColor } from '@/components/modules/signatures/SignaturePadWithColor';
import DetectionCombinaisonsProactive, { ProactiveItem } from './DetectionCombinaisonsProactive';
import { Card } from '@/components/ui/card';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { ecartAgent } from '@/lib/ia/agents/ecartAgent';
import { mergeArrayById } from '@/lib/persistence/iaStorage';
import { libelleMemory } from '@/lib/ia/libelleMemory';
import { assistantAgent } from '@/lib/ia/agents/assistantAgent';
import { recordRiskIndexFeedback, getRiskLevelFromCellIdx } from '@/lib/riskIndex';
import { getRiskLevelFromCell, getCellColor, getRiskLevelVariant } from '@/lib/risque';
import { classifyEcartTexte, suggestGraviteFromTexte } from '@/lib/risque/ecartClassifier';
import { generateEcartReference, computeNextEcartCounter, getTypeAbbr } from '@/lib/surveillanceUtils';
import { inspecteurMonitoring } from '@/lib/ia/engines/inspecteurMonitoring';

// Styles + helpers : voir ./ecartsRedactionUtils.ts (importés ci-dessous).
import type { EcartRedaction, QuestionNSNV } from './EcartsRedactionTypes';
export type { EcartRedaction, QuestionNSNV } from './EcartsRedactionTypes';
import { NotesInspecteurPopover } from './NotesInspecteurPopover';
import { EcartCard } from './EcartCard';
import { IaSuggestionBanner } from './IaSuggestionBanner';
import { IaAssistant } from './IaAssistant';
import { focusClass, selectStyle, NIVEAUX, isValidOACI, decouperLibelleEnEcarts, getProgressBarColorDynamic } from './ecartsRedactionUtils';

interface SurveillanceEcartsRedactionProps {
  surveillanceId: string;
  itemsNSNV: QuestionNSNV[];
  ecartsExistants?: EcartRedaction[];
  onSave?: (ecarts: EcartRedaction[]) => void;
  onSigner?: (signatureUrl: string) => void;
  readOnly?: boolean;
  isSigned?: boolean;
  userRole?: string;
  aerodromeId: string;
  /** Type de la surveillance pour l'abréviation dans la référence */
  surveillanceType?: string;
  /** Code OACI de l'aérodrome */
  aerodromeCode?: string;
  /** Préfixe de l'écart : SDT (standard) ou SGS */
  ecartPrefix?: 'SDT' | 'SGS';
}

// NIVEAUX + helpers : voir ./ecartsRedactionUtils.ts (importés ci-dessus).




export default function SurveillanceEcartsRedaction({
  surveillanceId,
  itemsNSNV,
  ecartsExistants,
  onSave,
  onSigner,
  readOnly = false,
  isSigned = false,
  userRole = 'inspector',
  aerodromeId,
  surveillanceType,
  aerodromeCode,
  ecartPrefix = 'SDT',
}: SurveillanceEcartsRedactionProps) {
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const updateDelegation = useAppStore(s => s.updateDelegation);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const surveillances = useOptimizedStore(s => s.surveillances);
  const aerodromes = useOptimizedStore(s => s.aerodromes);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === aerodromeId);
  const oaciCode = aerodromeCode || aerodrome?.code_oaci || '';
  const typeAbbr = getTypeAbbr(surveillanceType || surveillance?.type || '');

  const officialEcarts = useAppStore(s => s.ecarts).filter(e => e.surveillance_id === surveillanceId);
  const [ecarts, setEcarts] = useState<EcartRedaction[]>(ecartsExistants || []);

  const getNouvelleReference = useCallback((prefix: 'SDT' | 'SGS' = ecartPrefix): string => {
    const year = new Date().getFullYear();
    const nextNum = computeNextEcartCounter(ecarts, officialEcarts, year, oaciCode, typeAbbr, prefix);
    return generateEcartReference(oaciCode, year, typeAbbr, prefix, nextNum);
  }, [ecarts, officialEcarts, oaciCode, typeAbbr, ecartPrefix]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [formEcart, setFormEcart] = useState<Partial<EcartRedaction>>({ niveau: 'moyen' });
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [selectedEcartDetails, setSelectedEcartDetails] = useState<EcartRedaction | null>(null);
  const [expandedDomaines, setExpandedDomaines] = useState<string[]>([]);
  
  // États IA
  const [iaSuggestion, setIaSuggestion] = useState<{ libelle: string; niveau: string; ref_reglementaire: string; justification: string; confiance: number; cellule: string; probabilite: 1 | 2 | 3 | 4 | 5; gravite: 'A' | 'B' | 'C' | 'D' | 'E'; avis?: string; nbEcarts?: number; pourquoi?: string; intervalleConfiance?: { min: number; max: number } } | null>(null);
  const [isIaGenerating, setIsIaGenerating] = useState(false);
  const [iaAnswer, setIaAnswer] = useState<string | null>(null);
  const [isAskingAssistant, setIsAskingAssistant] = useState(false);
  const [showIaSuggestion, setShowIaSuggestion] = useState(false);
  const [isSuggestingLibelle, setIsSuggestingLibelle] = useState(false);
  // true quand l'IA est indisponible et qu'on bascule sur la rédaction manuelle
  const [iaIndisponible, setIaIndisponible] = useState(false);

  // Garde anti-race : chaque nouvelle génération incrémente l'id. Le résultat
  // d'une génération n'est pris en compte que s'il provient de la génération
  // la plus récente — sinon on le jette (évite spinner infini / écrasement de
  // l'état par un ancien appel LLM qui se résout en retard).
  const iaGenerationRef = useRef(0);
  const suggestingLibelleRef = useRef(0);

  // Refs pour auto-resize des textareas du formulaire écart
  const refReglementaireRef = useRef<HTMLTextAreaElement>(null);
  const libelleRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  };

  // Auto-resize des textareas quand le contenu change
  useEffect(() => { autoResize(refReglementaireRef.current); }, [formEcart.ref_reglementaire]);
  useEffect(() => { autoResize(libelleRef.current); }, [formEcart.libelle]);

  // Charger la mémoire des libellés corrigés (boucle d'apprentissage textuelle)
  useEffect(() => { libelleMemory.initFromIDB(); }, []);

  const profilAerodrome = profilsRisque?.[aerodromeId] || null;

  // Classification du libellé → suggestion domaine/niveau (moteur ecartClassifier, 100% local)
  const classificationLibelle = useMemo(() => {
    const libelle = formEcart.libelle?.trim() || '';
    if (libelle.length < 10) return null;
    try {
      const cls = classifyEcartTexte(libelle);
      const grav = suggestGraviteFromTexte(libelle);
      return { domaine: cls.domaine, confiance: Math.round(cls.score * 100), keywords: cls.keywords, gravite: grav.gravite, scoreGravite: grav.score };
    } catch { return null; }
  }, [formEcart.libelle]);

  // Sync ecarts existants when prop changes — FUSION (et non écrasement) pour ne
  // pas perdre les écarts encore présents uniquement en local (fraîchement ajoutés,
  // pas encore répercutés côté parent) tout en intégrant les vraies mises à jour
  // venant du parent (autre onglet / autre inspecteur).
  useEffect(() => {
    if (ecartsExistants && ecartsExistants.length > 0) {
      setEcarts(prev => mergeArrayById(prev, ecartsExistants));
    }
  }, [ecartsExistants]);

  // Calcul des items restants (non encore traités).
  // Déduplication par item id : un item référencé par plusieurs écarts (ou en
  // double via des templates dédoublés) ne doit compter qu'une seule fois, sinon
  // le compteur "items traités" dépasse le nombre d'items NS/NV détectés.
  const processedItemIds = useMemo(() => {
    const seen = new Set<string>();
    for (const e of ecarts) {
      for (const id of e.item_ids || []) seen.add(id);
    }
    return Array.from(seen);
  }, [ecarts]);

  // Grouper les items par domaine pour l'affichage
  const itemsByDomaine = useMemo(() => {
    const groups: Record<string, QuestionNSNV[]> = {};
    itemsNSNV.forEach(item => {
      if (!processedItemIds.includes(item.id)) {
        if (!groups[item.domaine]) groups[item.domaine] = [];
        groups[item.domaine].push(item);
      }
    });
    return groups;
  }, [itemsNSNV, processedItemIds]);

  const itemsRestantsCount = itemsNSNV.filter(i => !processedItemIds.includes(i.id)).length;

  // Générer la suggestion IA quand des items sont sélectionnés
  useEffect(() => {
    const generateIaSuggestion = async () => {
      if (selectedItems.length === 0) {
        iaGenerationRef.current += 1;
        setIaSuggestion(null);
        setIaIndisponible(false);
        setIsIaGenerating(false);
        return;
      }

      const generationId = ++iaGenerationRef.current;
      // Le debounce n'annule pas une requête déjà partie : un changement de
      // sélection pendant une génération produit un second appel. Les deux
      // peuvent se résoudre dans le désordre. On ne rend visible que le
      // résultat de la génération la plus récente.
      setIsIaGenerating(true);
      // Une nouvelle sélection → on remasque le banner (l'inspecteur le
      // rouvre via le bouton clignotant sur « Items NS/NV à traiter »).
      setShowIaSuggestion(false);
      try {
        const selectedQuestions = itemsNSNV.filter(item => selectedItems.includes(item.id));
        
        const result = await ecartAgent.generateEcart({
          itemsNSNV: selectedQuestions.map(item => ({
            id: item.id,
            numero: item.numero,
            point_verification: item.description,
            reference_reglementaire: item.reference_reglementaire,
            observation: item.observation || '',
            resultat: item.resultat,
            domaine: item.domaine,
            paoeLevel: item.paoeLevel,
          })),
          aerodromeId: aerodromeId,
          surveillanceId: surveillanceId,
          profil: profilAerodrome || undefined,
        }, {});

        // Résultat obsolète (une génération plus récente a démarré) → on jette.
        if (generationId !== iaGenerationRef.current) {
          setIsIaGenerating(false);
          return;
        }

        // IA indisponible → le champ « Libellé de la constatation » sert de
        // fallback : on n'affiche pas de fausse suggestion IA, on pré-remplit
        // le formulaire manuel avec l'ébauche locale pour que l'inspecteur
        // la révise puis clique « Ajouter ».
        if (result.iaDisponible === false) {
          setIaSuggestion(null);
          setShowIaSuggestion(true);
          setIaIndisponible(true);
          if (result.libelle) {
            setFormEcart(prev => ({
              ...prev,
              libelle: result.libelle,
              niveau: result.niveau_risque as EcartRedaction['niveau'],
              ref_reglementaire: result.ref_reglementaire || prev.ref_reglementaire || '',
              cellule_risque_oaci: result.cellule,
              probabilite_risque: result.probabilite,
              gravite_risque: result.gravite,
              justification_risque_ia: result.justification,
              cellule_ia_suggeree: result.cellule,
            }));
          }
          return;
        }

        // IA opérationnelle : on présente la suggestion (banner watch-dog).
        setIaIndisponible(false);
        setIaSuggestion({
          libelle: result.libelle,
          niveau: result.niveau_risque,
          ref_reglementaire: result.ref_reglementaire,
          justification: isSGSDomain
            ? `Basé sur ${selectedItems.length} élément(s) PAOE non conforme(s) et l'évaluation SGS (score ${profilAerodrome?.score_global || 'N/A'})`
            : `Basé sur ${selectedItems.length} items NS/NV et le profil de risque (score ${profilAerodrome?.score_global || 'N/A'})`,
          confiance: result.confiance,
          cellule: result.cellule,
          probabilite: result.probabilite,
          gravite: result.gravite,
          avis: result.avis || undefined,
          nbEcarts: result.nbEcartsRecommande || undefined,
          pourquoi: result.pourquoi || undefined,
          intervalleConfiance: result.intervalleConfiance || undefined,
        });
        // Affichage direct de la suggestion dès qu'elle est prête (pas besoin
        // de cliquer sur le bouton « Suggestion AERORISQ »).
        setShowIaSuggestion(true);
      } catch (error) {
        console.error('[IA] Erreur génération suggestion:', error);
        if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
      } finally {
        if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
      }
    };

    const timeout = setTimeout(() => {
      generateIaSuggestion();
    }, 500);

    return () => clearTimeout(timeout);
  }, [selectedItems, itemsNSNV, aerodromeId, surveillanceId, profilAerodrome]);

  // Mise à jour automatique des références réglementaires lors de la sélection
  useEffect(() => {
    if (selectedItems.length > 0) {
      const selectedQuestions = itemsNSNV.filter(item => selectedItems.includes(item.id));
      const uniqueRefs = [...new Set(selectedQuestions.map(q => q.reference_reglementaire).filter(Boolean))];
      const refReglementaire = uniqueRefs.join(', ');
      
      setFormEcart(prev => ({
        ...prev,
        ref_reglementaire: refReglementaire || prev.ref_reglementaire || '',
      }));
    }
  }, [selectedItems, itemsNSNV]);

  const toggleDomaineExpand = (domaine: string) => {
    setExpandedDomaines(prev =>
      prev.includes(domaine) ? prev.filter(d => d !== domaine) : [...prev, domaine]
    );
  };

  // ── Découpage watch-dog : construit un écart PAR question sélectionnée.
  // Utilisé à la fois par le découpage automatique (libellé à puces) et par
  // l'action explicite « Appliquer le découpage en N écarts » du bandeau.
  const creerEcartsParQuestion = (
    itemsSel: { id: string; item: QuestionNSNV }[],
    libelles: string[],
    opts: {
      ref: string;
      niveau: EcartRedaction['niveau'];
      cellule?: string;
      probabilite?: 1 | 2 | 3 | 4 | 5;
      gravite?: 'A' | 'B' | 'C' | 'D' | 'E';
      justification: string;
      celluleIa: string;
    },
  ): EcartRedaction[] => {
    const now = new Date().toISOString();
    const domaineItems = itemsSel.map(x => x.item!.domaine).filter(Boolean);
    const domaineDeduit = domaineItems[0] || '';
    return itemsSel.map((x, k) => {
      const newEcart: EcartRedaction = {
        id: crypto.randomUUID(),
        reference: getNouvelleReference(),
        ref_reglementaire: opts.ref,
        libelle: libelles[k] || x.item!.description || '',
        niveau: opts.niveau,
        item_ids: [x.id],
        domaine: x.item!.domaine || domaineDeduit,
        created_at: now,
        updated_at: now,
        cellule_risque_oaci: (x.item!.domaine === 'SGS') ? undefined : opts.cellule,
        probabilite_risque: (x.item!.domaine === 'SGS') ? undefined : opts.probabilite,
        gravite_risque: (x.item!.domaine === 'SGS') ? undefined : opts.gravite,
        justification_risque_ia: opts.justification,
        cellule_ia_suggeree: opts.celluleIa,
        delai_pac: NIVEAUX.find(n => n.value === opts.niveau)?.delais.pac,
        delai_regularisation: NIVEAUX.find(n => n.value === opts.niveau)?.delais.regularisation,
      };
      return newEcart;
    });
  };

  // Enregistre les écarts créés + nettoie l'état de rédaction.
  const commiterEcartsCrees = (created: EcartRedaction[], message: string) => {
    const updated = [...ecarts, ...created];
    setEcarts(updated);
    onSave?.(updated);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: `${created.length} écarts créés`,
      message,
      canal: 'in_app',
    });
    setSelectedItems([]);
    setFormEcart({ niveau: 'moyen' });
    setEditingId(null);
    setErrors({});
    setIaSuggestion(null);
    setShowIaSuggestion(true);
  };

  const handleApplyIaSuggestion = (
    adjustedProbabilite?: 1 | 2 | 3 | 4 | 5,
    adjustedGravite?: 'A' | 'B' | 'C' | 'D' | 'E',
    adjustedLibelle?: string,
    forceSingle = false,
  ) => {
    if (!iaSuggestion) return;

    // Garde : si un handler React a transmis un event (PointerEvent) à la
    // place des valeurs, on le neutralise pour ne jamais le persister.
    const safeProb = [1, 2, 3, 4, 5].includes(adjustedProbabilite as number) ? adjustedProbabilite : undefined;
    const safeGrav = ['A', 'B', 'C', 'D', 'E'].includes(String(adjustedGravite)) ? adjustedGravite : undefined;

    const finalProbabilite = (safeProb ?? iaSuggestion?.probabilite ?? 3) as 1 | 2 | 3 | 4 | 5;
    const finalGravite = safeGrav ?? iaSuggestion?.gravite ?? 'C';
    const finalCellule = `${finalProbabilite}${finalGravite}`;
    const finalNiveau = getRiskLevelFromCell(finalCellule);
    const wasAdjusted = safeProb !== undefined || safeGrav !== undefined || adjustedLibelle !== undefined;

    // ── DÉCOUPAGE WATCH-DOG : si l'IA recommande N écarts et que le libellé contient
    // plusieurs puces (1., 2., 3.), on crée un écart distinct PAR question sélectionnée.
    // forceSingle (Refuser le découpage) désactive cette logique → 1 seul écart fusionné.
    const libelleFinal = adjustedLibelle ?? iaSuggestion.libelle;
    const libelleParts = decouperLibelleEnEcarts(libelleFinal);
    const doitDecouper = !forceSingle && libelleParts.length > 1 && selectedItems.length > 1 && (iaSuggestion.nbEcarts ?? 1) > 1;

    if (doitDecouper) {
      const itemsSel = selectedItems
        .map(id => ({ id, item: itemsNSNV.find(i => i.id === id) }))
        .filter((x): x is { id: string; item: QuestionNSNV } => Boolean(x.item));
      const libelles = libelleParts.length >= itemsSel.length
        ? itemsSel.map((_, k) => libelleParts[k % libelleParts.length])
        : (() => {
            const out: string[] = [];
            itemsSel.forEach((_, k) => {
              if (k < libelleParts.length) out.push(libelleParts[k]);
              else out[out.length - 1] = `${out[out.length - 1]} - ${libelleParts[k]}`;
            });
            return out;
          })();

      const created = creerEcartsParQuestion(itemsSel, libelles, {
        ref: iaSuggestion.ref_reglementaire || '',
        niveau: finalNiveau as EcartRedaction['niveau'],
        cellule: finalCellule,
        probabilite: finalProbabilite,
        gravite: finalGravite,
        justification: iaSuggestion.justification,
        celluleIa: iaSuggestion.cellule,
      });
      commiterEcartsCrees(created, `Découpage watch-dog : 1 écart par question (${iaSuggestion.nbEcarts} recommandés)`);
      return;
    }

    setFormEcart(prev => ({
      ...prev,
      libelle: adjustedLibelle ?? iaSuggestion.libelle,
      niveau: finalNiveau as EcartRedaction['niveau'],
      ref_reglementaire: iaSuggestion.ref_reglementaire,
      cellule_risque_oaci: finalCellule,
      probabilite_risque: finalProbabilite,
      gravite_risque: finalGravite,
      justification_risque_ia: iaSuggestion.justification,
      cellule_ia_suggeree: iaSuggestion.cellule,
      delai_pac: NIVEAUX.find(n => n.value === finalNiveau)?.delais.pac,
      delai_regularisation: NIVEAUX.find(n => n.value === finalNiveau)?.delais.regularisation,
    }));

    if (profilAerodrome) {
      recordRiskIndexFeedback(
        aerodromeId,
        {
          score_global: profilAerodrome.score_global,
          c1: profilAerodrome.c1,
          c2: profilAerodrome.c2,
          c3: profilAerodrome.c3,
          c4: profilAerodrome.c4,
          c5: profilAerodrome.c5,
          velocity: profilAerodrome.velocity_metrics?.vitesse || 0,
          nb_ecarts_critiques: 0,
          nb_nv: itemsNSNV.filter(i => i.resultat === 'NV').length,
          nb_ns: itemsNSNV.filter(i => i.resultat === 'NS').length,
        },
        {
          probabilite: iaSuggestion.probabilite,
          gravite: iaSuggestion.gravite,
          cellule: iaSuggestion.cellule,
          niveau: getRiskLevelFromCellIdx(iaSuggestion.cellule),
          score: 0,
          confidence: iaSuggestion.confiance,
          volatilite: 0,
          tendance: 'stable',
        },
        {
          probabilite: finalProbabilite,
          gravite: finalGravite,
          cellule: finalCellule,
          niveau: getRiskLevelFromCellIdx(finalCellule),
          score: 0,
          confidence: iaSuggestion.confiance,
          volatilite: 0,
          tendance: 'stable',
        },
      );
    }

    setShowIaSuggestion(false);
    inspecteurMonitoring.enregistrer({
      capacite: 'ecart',
      action: wasAdjusted ? 'corrigee' : 'acceptee',
      aerodromeId,
      surveillanceId,
      confiance: iaSuggestion.confiance,
    })

    // Boucle d'apprentissage textuelle : mémoriser le libellé final (réajusté ou accepté)
    // comme exemple de référence pour les prochaines suggestions.
    const libelleRetenue = adjustedLibelle ?? iaSuggestion.libelle;
    if (libelleRetenue) {
      const itemsContexte = selectedItems
        .map(id => itemsNSNV.find(i => i.id === id))
        .filter(Boolean) as QuestionNSNV[];
      ecartAgent.enregistrerCorrectionLibelle({
        isSGS: isAllSGSDomain || itemsContexte.some(i => i.domaine === 'SGS'),
        references: iaSuggestion.ref_reglementaire
          ? iaSuggestion.ref_reglementaire.split(/[;,]|\bet\b/i).map(s => s.trim()).filter(Boolean)
          : itemsContexte.map(i => i.reference_reglementaire).filter(Boolean),
        itemIds: itemsContexte.map(i => i.id),
        libellePropose: iaSuggestion.libelle,
        libelleCorrige: libelleRetenue,
        avis: iaSuggestion.avis || undefined,
        nbEcartsRecommande: typeof iaSuggestion.nbEcarts === 'number' ? iaSuggestion.nbEcarts : undefined,
        contexte: itemsContexte
          .map(i => `${i.description}${i.observation ? ` → ${i.observation}` : ''}`)
          .join(' | ')
          .slice(0, 400),
      });
    }
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Suggestion AERORISQ appliquée',
      message: wasAdjusted
        ? `Suggestion appliquée avec ajustement : ${iaSuggestion.cellule} → ${finalCellule}`
        : `Champs pré-remplis — Indice OACI : ${finalCellule}`,
      canal: 'in_app',
    });
  };

  // Action explicite « Appliquer le découpage en N écarts » : force la création
  // d'un écart PAR question sélectionnée, même si le libellé n'a pas de puces
  // (cas où l'IA recommande N écarts mais ne rédige qu'un seul libellé).
  const handleApplySplit = (nbEcarts: number) => {
    if (!iaSuggestion) return;
    const itemsSel = selectedItems
      .map(id => ({ id, item: itemsNSNV.find(i => i.id === id) }))
      .filter((x): x is { id: string; item: QuestionNSNV } => Boolean(x.item));
    if (itemsSel.length < 2) return;

    const cible = Math.max(1, Math.min(nbEcarts, itemsSel.length));
    const libelleBase = iaSuggestion.libelle;
    const libelleParts = decouperLibelleEnEcarts(libelleBase);

    // On répartit : si autant de puces que de questions cible, on les prend une à
    // une ; sinon on met le libellé complet sur la 1re puis on enrichit avec la
    // description de chaque question pour distinguer les écarts entre eux.
    let libelles: string[];
    if (libelleParts.length >= cible) {
      libelles = itemsSel.slice(0, cible).map((_, k) => libelleParts[k % libelleParts.length]);
    } else {
      libelles = itemsSel.slice(0, cible).map((_, k) => {
        const q = itemsSel[k].item!;
        const base = libelleParts[0] || libelleBase;
        const suffix = q.description ? ` — ${q.description}` : '';
        return `${base}${suffix}`.trim();
      });
    }

    const created = creerEcartsParQuestion(itemsSel.slice(0, cible), libelles, {
      ref: iaSuggestion.ref_reglementaire || '',
      niveau: getRiskLevelFromCell(iaSuggestion.cellule) as EcartRedaction['niveau'],
      cellule: iaSuggestion.cellule,
      probabilite: iaSuggestion.probabilite,
      gravite: iaSuggestion.gravite,
      justification: iaSuggestion.justification,
      celluleIa: iaSuggestion.cellule,
    });

    commiterEcartsCrees(created, `Découpage appliqué : ${created.length} écarts créés (${cible} par question)`);
  };

  const handleIgnoreIaSuggestion = () => {
    inspecteurMonitoring.enregistrer({
      capacite: 'ecart',
      action: 'rejetee',
      aerodromeId,
      surveillanceId,
      confiance: iaSuggestion?.confiance,
    })
    if (iaSuggestion?.libelle) {
      const isSGS = isAllSGSDomain || selectedItems.some(id => itemsNSNV.find(i => i.id === id)?.domaine === 'SGS');
      ecartAgent.enregistrerRefusGroupement({
        isSGS,
        references: iaSuggestion.ref_reglementaire
          ? iaSuggestion.ref_reglementaire.split(/[;,]|\bet\b/i).map(s => s.trim()).filter(Boolean)
          : [],
        itemIds: selectedItems.slice(),
        libelleCorrige: iaSuggestion.libelle,
        contexte: selectedItems
          .map(id => itemsNSNV.find(i => i.id === id))
          .filter((q): q is QuestionNSNV => Boolean(q))
          .map(i => `${i.description}${i.observation ? ` → ${i.observation}` : ''}`)
          .join(' | ')
          .slice(0, 400),
      });
    }
    setIaSuggestion(null);
    setShowIaSuggestion(false);
  };

  const handleRegenerateIaSuggestion = async (instruction?: string) => {
    if (selectedItems.length === 0) return;
    const generationId = ++iaGenerationRef.current;
    setIsIaGenerating(true);
    try {
      const selectedQuestions = itemsNSNV.filter(item => selectedItems.includes(item.id));
      const result = await ecartAgent.generateEcart({
        itemsNSNV: selectedQuestions.map(item => ({
          id: item.id,
          numero: item.numero,
          point_verification: item.description,
          reference_reglementaire: item.reference_reglementaire,
          observation: item.observation || '',
          resultat: item.resultat,
          domaine: item.domaine,
          paoeLevel: item.paoeLevel,
        })),
        aerodromeId,
        surveillanceId,
        profil: profilAerodrome || undefined,
        instruction,
      }, {});
      if (generationId !== iaGenerationRef.current) {
        setIsIaGenerating(false);
        return;
      }
      setIaSuggestion({
        libelle: result.libelle,
        niveau: result.niveau_risque,
        ref_reglementaire: result.ref_reglementaire,
        justification: `Régénéré${instruction ? ` avec instruction: "${instruction}"` : ''}`,
        confiance: result.confiance,
        cellule: result.cellule,
        probabilite: result.probabilite,
        gravite: result.gravite,
        avis: result.avis || undefined,
        nbEcarts: result.nbEcartsRecommande || undefined,
        pourquoi: result.pourquoi || undefined,
        intervalleConfiance: result.intervalleConfiance || undefined,
      });
      // Affichage direct après régénération.
      setShowIaSuggestion(true);
    } catch (error) {
      console.error('[IA] Erreur régénération suggestion:', error);
      if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
    } finally {
      if (generationId === iaGenerationRef.current) setIsIaGenerating(false);
    }
  };

  const revealIaSuggestion = () => {
    setShowIaSuggestion(true);
    setTimeout(() => {
      document.getElementById('suggestion-ia-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  // Valider une combinaison proactive (via le composant partagé) : on fusionne
  // les ids du groupe dans la sélection. L'effet existant sur `selectedItems`
  // déclenche alors la génération IA de la suggestion → le workflow validé
  // (valider/ajuster/refuser la suggestion) continue normalement pour la suite.
  const handleProactifValider = (items: ProactiveItem[]) => {
    setSelectedItems(prev => [...new Set([...prev, ...items.map(i => i.id)])]);
  };

  const handleAskAssistant = async (question: string) => {
    setIsAskingAssistant(true);
    try {
      const result = await assistantAgent.chat({
        message: question,
        contexte: {
          module: 'ecarts-redaction',
          aerodromeId: aerodromeId,
          surveillanceId: surveillanceId,
        },
        userRole: userRole,
      });
      setIaAnswer(result.message);
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: "Impossible de contacter l'assistant",
        canal: 'in_app',
      });
    } finally {
      setIsAskingAssistant(false);
    }
  };

  const handleSuggesterLibelle = async () => {
    // Appel IA unique et factorisé : timeout navigateur (AbortSignal) pour ne
    // jamais bloquer le spinner + garde anti-race pour ignorer les réponses
    // obsolètes si l'utilisateur clique plusieurs fois.
    const redigerLibelle = async (payload: Record<string, unknown>) => {
      const requestId = ++suggestingLibelleRef.current;
      const controller = new AbortController();
      const serveurBudgetMs = 30000;
      const timeout = window.setTimeout(() => controller.abort(), serveurBudgetMs + 2000);
      try {
        const res = await fetch('/api/ia/rediger-ecart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await res.json();
        return requestId === suggestingLibelleRef.current ? data : null;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const libelleActuel = (formEcart.libelle || '').trim();
    // Reformulation IA de la constatation existante (prioritaire)
    if (libelleActuel.length > 0) {
      setIsSuggestingLibelle(true);
      try {
        const data = await redigerLibelle({
          constatation: libelleActuel,
          domaine: formEcart.domaine,
          aerodromeCode,
          aerodromeNom: aerodrome?.nom,
          isSGS: isAllSGSDomain || formEcart.domaine === 'SGS',
        });
        if (data && data.ok && data.libelle) {
          setFormEcart(prev => ({ ...prev, libelle: data.libelle }));
          addNotification({ user_id: user?.id || '', type: 'success', title: 'Constatation reformulée', message: 'La constatation a été reformulée par l\'IA.', canal: 'in_app' });
        } else if (data) {
          addNotification({ user_id: user?.id || '', type: 'warning', title: 'Reformulation IA', message: data.error || 'Impossible de reformuler la constatation', canal: 'in_app' });
        }
      } catch (error) {
        addNotification({ user_id: user?.id || '', type: 'danger', title: 'Erreur', message: "Erreur lors de la reformulation IA", canal: 'in_app' });
      } finally {
        setIsSuggestingLibelle(false);
      }
      return;
    }
    if (selectedItems.length === 0) return;
    setIsSuggestingLibelle(true);
    try {
      const items = selectedItems.map(id => itemsNSNV.find(i => i.id === id)).filter(Boolean) as typeof itemsNSNV;
      const isSGS = items.some(i => i.domaine === 'SGS');
      const data = await redigerLibelle({
        items: items.map(i => ({
          id: i.id,
          description: i.description,
          reference_reglementaire: i.reference_reglementaire,
          justification: i.justification,
          resultat: i.resultat,
          paoeLevel: i.paoeLevel,
        })),
        domaine: items[0]?.domaine,
        aerodromeCode,
        aerodromeNom: aerodrome?.nom,
        isSGS,
      });
      if (data && data.ok && data.libelle) {
        setFormEcart(prev => ({ ...prev, libelle: data.libelle }));
      } else if (data) {
        addNotification({ user_id: user?.id || '', type: 'warning', title: 'Suggestion IA', message: data.error || 'Impossible de générer une suggestion', canal: 'in_app' });
      }
    } catch (error) {
      addNotification({ user_id: user?.id || '', type: 'danger', title: 'Erreur', message: "Erreur lors de la suggestion IA", canal: 'in_app' });
    } finally {
      setIsSuggestingLibelle(false);
    }
  };

  const handleAjouterEcart = () => {
    if (selectedItems.length === 0) {
      setErrors({ selectItems: 'Veuillez sélectionner au moins une question NS/NV' });
      return;
    }

    const newErrors: Record<string, string> = {};
    if (!formEcart.libelle) newErrors.libelle = "Le libellé est requis";
    if (isAllSGSDomain) {
      if (!formEcart.delai_pac) newErrors.delai_pac = "Le délai PAC est requis pour les écarts SGS";
      if (!formEcart.delai_regularisation) newErrors.delai_regularisation = "Le délai de régularisation est requis pour les écarts SGS";
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const now = new Date().toISOString();
    // Déduire le domaine depuis les items sélectionnés (premier domaine trouvé)
    const domaineItems = selectedItems
      .map(id => itemsNSNV.find(i => i.id === id)?.domaine)
      .filter(Boolean);
    const domaineDeduit = domaineItems[0] || formEcart.domaine || classificationLibelle?.domaine || '';
    const newEcart: EcartRedaction = {
      id: editingId || crypto.randomUUID(),
      reference: formEcart.reference || getNouvelleReference(),
      ref_reglementaire: formEcart.ref_reglementaire || '',
      libelle: formEcart.libelle || '',
      niveau: (formEcart.niveau as EcartRedaction['niveau']) || 'moyen',
      item_ids: selectedItems,
      domaine: domaineDeduit,
      created_at: editingId ? (ecarts.find(e => e.id === editingId)?.created_at || now) : now,
      updated_at: now,
      // L'indice OACI (matrice probabilité × gravité) n'est pas applicable au domaine SGS
      cellule_risque_oaci: domaineDeduit === 'SGS' ? undefined : formEcart.cellule_risque_oaci,
      probabilite_risque: domaineDeduit === 'SGS' ? undefined : formEcart.probabilite_risque,
      gravite_risque: domaineDeduit === 'SGS' ? undefined : formEcart.gravite_risque,
      justification_risque_ia: formEcart.justification_risque_ia,
      cellule_ia_suggeree: formEcart.cellule_ia_suggeree,
      delai_pac: formEcart.delai_pac ?? NIVEAUX.find(n => n.value === formEcart.niveau)?.delais.pac,
      delai_regularisation: formEcart.delai_regularisation ?? NIVEAUX.find(n => n.value === formEcart.niveau)?.delais.regularisation,
    };

    if (editingId) {
      const updated = ecarts.map(e => e.id === editingId ? newEcart : e);
      setEcarts(updated);
      onSave?.(updated);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Écart modifié',
        message: `L'écart ${newEcart.reference} a été modifié`,
        canal: 'in_app',
      });
    } else {
      const updated = [...ecarts, newEcart];
      setEcarts(updated);
      onSave?.(updated);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Écart créé',
        message: `L'écart ${newEcart.reference} a été créé`,
        canal: 'in_app',
      });
    }

    setSelectedItems([]);
    setFormEcart({ niveau: 'moyen' });
    setEditingId(null);
    setErrors({});
    setIaSuggestion(null);
    setShowIaSuggestion(true);
  };

  const handleModifierEcart = (ecart: EcartRedaction) => {
    setEditingId(ecart.id);
    setFormEcart({
      reference: ecart.reference,
      ref_reglementaire: ecart.ref_reglementaire,
      libelle: ecart.libelle,
      niveau: ecart.niveau,
      cellule_risque_oaci: ecart.cellule_risque_oaci,
      probabilite_risque: ecart.probabilite_risque,
      gravite_risque: ecart.gravite_risque,
      delai_pac: ecart.delai_pac,
      delai_regularisation: ecart.delai_regularisation,
    });
    setSelectedItems(ecart.item_ids);
    setIaSuggestion(null);
  };

  const handleSupprimerEcart = (id: string) => {
    const ecart = ecarts.find(e => e.id === id);
    if (window.confirm(`Supprimer l'écart ${ecart?.reference} ?`)) {
      const updated = ecarts.filter(e => e.id !== id);
      setEcarts(updated);
      onSave?.(updated);
      addNotification({
        user_id: user?.id || '',
        type: 'info',
        title: 'Écart supprimé',
        message: `L'écart ${ecart?.reference} a été supprimé`,
        canal: 'in_app',
      });
    }
  };

  const handleSigner = () => {
    if (itemsRestantsCount > 0) {
      addNotification({
        user_id: user?.id || '',
        type: 'warning',
        title: 'Items non traités',
        message: `${itemsRestantsCount} item(s) NS/NV non encore traités`,
        canal: 'in_app',
      });
      return;
    }
    setSignatureDialogOpen(true);
  };

  const onSignatureSave = (signatureUrl: string) => {
    const fullSurv = useAppStore.getState().surveillances.find(s => s.id === surveillanceId)
    const existingSigs = fullSurv?.signatures_ecarts || []
    const newSig = {
      signataire_id: user?.id || '',
      signataire_nom: `${user?.prenom || ''} ${user?.nom || ''}`,
      date_signature: new Date().toISOString(),
      signature_url: signatureUrl,
    }
    const allSigs = [...existingSigs.filter(s => s.signataire_id !== user?.id), newSig]

    // Vérifier si TOUS les délégués ont signé
    let allDelegatedSigned = true
    const planningObj = fullSurv?.planning_id
      ? useAppStore.getState().plannings.find(p => p.id === fullSurv.planning_id)
      : undefined
    const delegations: Record<string, string> = planningObj?.delegations || {}
    if (Object.keys(delegations).length > 0) {
      const delegatedIds = new Set(Object.values(delegations).filter(Boolean))
      const signedIds = new Set(allSigs.map(s => s.signataire_id))
      allDelegatedSigned = delegatedIds.size === 0 || [...delegatedIds].every(id => signedIds.has(id))
    }

    // Si un onSigner est fourni (page parente), c'est le parent qui gère le statut global
    // (permet la validation SGS+standard avant de passer à ecarts_signes)
    if (!onSigner) {
      updateSurveillance(surveillanceId, {
        statut: allDelegatedSigned ? 'ecarts_signes' : fullSurv?.statut || 'checklist_signee',
      });
    }
    updateSurveillance(surveillanceId, { signatures_ecarts: allSigs });

    // Avancement auto du statut des délégations de l'inspecteur signataire
    const now = new Date().toISOString();
    const storeDels = useAppStore.getState();
    storeDels.getDelegationsBySurveillance(surveillanceId)
      .filter(d => d.assigne_a === user?.id)
      .forEach(d => {
        updateDelegation(d.id, {
          statut: 'ecarts_signes',
          ecarts_signature_url: signatureUrl,
          ecarts_signes_le: now,
          derniere_activite: now,
          derniere_sync: now,
        });
      });

    onSigner?.(signatureUrl);
    setSignatureDialogOpen(false);
    onSave?.(ecarts);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Écarts signés',
      message: 'Tous les écarts ont été signés',
      canal: 'in_app',
    });
  };

  // Auto-save
  useEffect(() => {
    const interval = setInterval(() => {
      if (ecarts.length > 0 && !readOnly && !isSigned) {
        setLastSaved(new Date());
        onSave?.(ecarts);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [ecarts, readOnly, isSigned, onSave]);

  const stats = {
    total: itemsNSNV.length,
    traites: processedItemIds.length,
    restants: itemsRestantsCount,
    ecartsCount: ecarts.length,
  };

  const progression = stats.total > 0 ? Math.round((stats.traites / stats.total) * 100) : 100;

  // Détecter si tous les items sélectionnés appartiennent au domaine SGS
  // → l'indice OACI n'est pas applicable au SGS (système de gestion de la sécurité)
  const isSGSDomain = useMemo(() => {
    if (selectedItems.length === 0) return false;
    return selectedItems.every(id => {
      const item = itemsNSNV.find(i => i.id === id);
      return item?.domaine === 'SGS';
    });
  }, [selectedItems, itemsNSNV]);

  // Détecter si TOUS les items de la liste sont SGS (mode SGS global)
  // → affichage PAOE (Absent/Présent/Approprié) au lieu de NS/NV
  const isAllSGSDomain = useMemo(
    () => itemsNSNV.length > 0 && itemsNSNV.every(i => i.domaine === 'SGS'),
    [itemsNSNV]
  );

  const shouldShowSignedBanner = isSigned || readOnly;

  const getEcartGroupe = (e: EcartRedaction) => {
    if (e.domaine === 'SGS') {
      const comp = (e.item_ids || [])
        .map(id => itemsNSNV.find(i => i.id === id)?.sousDomaine)
        .find(Boolean) as string | undefined;
      return comp && comp.trim() ? comp : 'SGS';
    }
    return e.domaine || 'Autre';
  };

  return (
    <div className="space-y-6" data-role={userRole} data-module="ecarts-redaction">

      {/* Bannière lecture seule / signé */}
      {shouldShowSignedBanner && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-success/10 border border-success/30 text-success">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="font-medium text-sm">Écarts signés — consultation en lecture seule</span>
        </div>
      )}

      {/* Liste des écarts signés — consultation en lecture seule */}
      {readOnly && (
        <Card
          icon={<FileText className="w-4 h-4 text-role-primary" />}
          title={`Écarts signés (${ecarts.length} fiche${ecarts.length > 1 ? 's' : ''})`}
        >
          {ecarts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-body">Aucun écart enregistré pour cette surveillance</p>
            </div>
          ) : (
            <div className={isAllSGSDomain ? '' : 'max-h-[400px] overflow-y-auto'}>
              <AccordionGroup spacing="sm">
                {Object.entries(
                  ecarts.reduce<Record<string, EcartRedaction[]>>((acc, e) => {
                    const d = getEcartGroupe(e);
                    (acc[d] ??= []).push(e);
                    return acc;
                  }, {})
                ).map(([groupe, groupedEcarts]) => (
                  <AccordionSection
                    key={groupe}
                    icon={<FolderTree className="w-4 h-4 !text-white" />}
                    title={groupe}
                    subtitle={`${groupedEcarts.length} écart(s)`}
                    defaultOpen
                  >
                    <div className="space-y-2">
                      {groupedEcarts.map(ecart => (
                        <EcartCard
                          key={ecart.id}
                          ecart={ecart}
                          onEdit={() => undefined}
                          onDelete={() => undefined}
                          onViewDetails={setSelectedEcartDetails}
                          readOnly
                        />
                      ))}
                    </div>
                  </AccordionSection>
                ))}
              </AccordionGroup>
            </div>
          )}
        </Card>
      )}

      {/* Réponse assistant IA */}
      {iaAnswer && (
        <div className="alert alert-info animate-fade-in">
          <Brain className="alert-icon w-4 h-4" />
          <div className="alert-content flex-1">
            <div className="alert-title">🤖 Réponse de l'assistant</div>
            <div className="alert-description">{iaAnswer}</div>
          </div>
          <button onClick={() => setIaAnswer(null)} className="btn btn-sm px-3 py-1 btn-ghost">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Grille items — NS/NV (standard) ou PAOE (SGS) — masquée en lecture seule */}
      {!readOnly && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Colonne gauche: Items à traiter */}
        <Card
          icon={<Target className="w-4 h-4 text-role-primary" />}
          heading={
            <div className="w-full">
              <div className="flex items-center gap-2">
                {isAllSGSDomain
                  ? <>Éléments PAOE non conformes <span className="badge warning text-[10px]">SGS</span></>
                  : 'Items NS/NV à traiter'
                }
                <span className="badge outline text-xs">{itemsRestantsCount} restant(s)</span>

                {/* Bouton proactif (composant partagé) : combinaisons détectées
                    parmi les items restants de même référence réglementaire —
                    la modale s'ouvre en overlay sans toucher à la grille. */}
                <DetectionCombinaisonsProactive
                  items={itemsNSNV.filter(i => !processedItemIds.includes(i.id) && !selectedItems.includes(i.id))}
                  selectedIds={selectedItems}
                  onValidate={handleProactifValider}
                  buttonClassName="ml-auto"
                />

                {/* État IA sur les items sélectionnés : analyse en cours → bouton prêt */}
                {selectedItems.length > 0 && (
                  isIaGenerating ? (
                    <span className="ai-proposed-row inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ml-auto shrink-0 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      AERORISQ analyse...
                    </span>
                  ) : !showIaSuggestion && iaSuggestion ? (
                    <button
                      type="button"
                      onClick={revealIaSuggestion}
                      className="ai-proposed-row inline-flex items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 ml-auto shrink-0"
                      title="Cliquer pour valider / ajuster / régénérer la suggestion AERORISQ"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Suggestion AERORISQ
                      {typeof iaSuggestion.nbEcarts === 'number' && iaSuggestion.nbEcarts >= 1 && (
                        <span className="badge badge-primary text-[10px]">
                          {iaSuggestion.nbEcarts} écart{iaSuggestion.nbEcarts > 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  ) : null
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {isAllSGSDomain
                  ? 'Éléments évalués Absent, Présent ou Approprié — sélectionnez pour créer un écart SGS'
                  : 'Sélectionnez une ou plusieurs questions pour créer un écart'
                }
              </div>
            </div>
          }
        >
          <div className="max-h-[500px] overflow-y-auto">
            {Object.keys(itemsByDomaine).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="w-10 h-10 mx-auto mb-2 text-success" />
                <p className="text-sm">Tous les items ont été traités</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(itemsByDomaine).map(([domaine, items]) => {
                  const isExpanded = expandedDomaines.includes(domaine);
                  return (
                    <div key={domaine} className="border border-border rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between p-2 bg-muted/20 hover:bg-role-primary-soft transition-colors"
                        onClick={() => toggleDomaineExpand(domaine)}
                      >
                        <div className="flex items-center gap-2">
                          <FolderTree className="w-3 h-3 text-role-primary" />
                          <span className="font-medium text-sm">{domaine}</span>
                          <span className="badge outline text-[10px]">{items.length} item(s)</span>
                        </div>
                        <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="p-2 space-y-2">
                          {items.map((item, idx) => (
                            <div
                              key={`${item.id}-${idx}`}
                              className={`flex items-start gap-2 p-2 border border-border rounded-lg cursor-pointer transition-colors ${
                                selectedItems.includes(item.id) 
                                  ? 'border-role-primary bg-role-primary/5' 
                                  : 'hover:bg-role-primary-soft'
                              }`}
                              onClick={() => {
                                if (selectedItems.includes(item.id)) {
                                  setSelectedItems(prev => prev.filter(id => id !== item.id));
                                } else {
                                  setSelectedItems(prev => [...prev, item.id]);
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selectedItems.includes(item.id)}
                                onChange={() => {}}
                                className="form-checkbox mt-1"
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="code-oaci-badge text-xs">{item.numero}</span>
                                  <span className="badge neutral text-[10px]">{item.sousDomaine}</span>
                                  {item.domaine === 'SGS' ? (
                                    <span className={`badge text-[10px] ${
                                      item.paoeLevel === 'absent'    ? 'danger'  :
                                      item.paoeLevel === 'present'   ? 'muted'   :
                                                                       'warning'
                                    }`}>
                                      {item.paoeLevel === 'absent' ? '—' :
                                       item.paoeLevel === 'present' ? 'P' : 'A'}
                                    </span>
                                  ) : (
                                    <span className={`badge ${item.resultat === 'NS' ? 'danger' : 'warning'} text-[10px]`}>
                                      {item.resultat}
                                    </span>
                                  )}
                                </div>
                                <p className="text-small mt-1">{item.description}</p>
                                {item.reference_reglementaire && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Réf: {item.reference_reglementaire}
                                  </p>
                                )}
                                {item.observation && (
                                  <NotesInspecteurPopover texte={item.observation} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Colonne droite: Formulaire de saisie avec IA */}
        {!readOnly && (
        <Card
          icon={<PenLine className="w-4 h-4 text-role-primary" />}
          title={`${editingId ? 'Modifier' : 'Nouvel'} écart`}
          badge={selectedItems.length > 0 ? (
            <span className="badge primary text-[10px]">{selectedItems.length} item(s) sélectionné(s)</span>
          ) : undefined}
        >
          <div className="space-y-4">
            
            {/* Suggestion IA */}
            <div id="suggestion-ia-panel">
            {showIaSuggestion && selectedItems.length > 0 && (
              <IaSuggestionBanner
                suggestion={iaSuggestion}
                onApply={handleApplyIaSuggestion}
                onAdjustAndApply={handleApplyIaSuggestion}
                onApplySplit={handleApplySplit}
                onApplyForceSingle={() => handleApplyIaSuggestion(undefined, undefined, undefined, true)}
                onIgnore={handleIgnoreIaSuggestion}
                onRegenerate={handleRegenerateIaSuggestion}
                isLoading={isIaGenerating}
                hideCellule={isSGSDomain}
                selectedQuestions={itemsNSNV.filter(item => selectedItems.includes(item.id))}
              />
            )}
            </div>

            {/* IA indisponible → rédaction manuelle (champ Libellé) en fallback */}
            {iaIndisponible && !isIaGenerating && (
              <div className="alert alert-warning mb-2 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <strong className="block">AERORISQ indisponible</strong>
                  <span>La suggestion IA n'a pas pu être générée. Le champ « Libellé de la constatation » ci-dessous a été pré-rempli à titre indicatif — révisez-le puis cliquez sur « Ajouter ».</span>
                </div>
              </div>
            )}

            {errors.selectItems && (
              <div className="alert alert-danger p-2 text-sm">
                <AlertCircle className="alert-icon w-4 h-4" />
                {errors.selectItems}
              </div>
            )}

            <div className="form-field">
              <label className="filter-label">Référence (auto-générée)</label>
              <input
                type="text"
                value={formEcart.reference || (editingId ? '' : getNouvelleReference())}
                onChange={(e) => setFormEcart({ ...formEcart, reference: e.target.value })}
                placeholder="2026-GOBD-CERT-SDT-01"
                className={`form-input bg-gray-50 ${focusClass}`}
                disabled={!editingId}
              />
              <p className="field-description">Année-Code OACI-Type-Prefix-Numéro</p>
            </div>

            <div className="form-field">
              <label className="filter-label">Référence réglementaire</label>
              <textarea
                ref={refReglementaireRef}
                value={formEcart.ref_reglementaire || ''}
                readOnly
                className="form-textarea bg-gray-50 cursor-not-allowed overflow-hidden"
              />
              <p className="field-description">Auto-tirée des items checklist sélectionnés</p>
            </div>

            {/* Délais manuels — SGS uniquement */}
            {isAllSGSDomain && (
              <div className="grid grid-cols-2 gap-3">
                <div className="form-field">
                  <label className="filter-label">Délai PAC (jours) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={formEcart.delai_pac ?? ''}
                    onChange={(e) => setFormEcart({ ...formEcart, delai_pac: parseInt(e.target.value) || undefined })}
                    className={`form-input ${errors.delai_pac ? 'border-danger' : ''} ${focusClass}`}
                    placeholder="ex: 15"
                  />
                  <p className="field-description">Soumission du plan d'actions correctives</p>
                  {errors.delai_pac && (
                    <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.delai_pac}
                    </p>
                  )}
                </div>
                <div className="form-field">
                  <label className="filter-label">Délai régularisation (jours) <span className="text-danger">*</span></label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={formEcart.delai_regularisation ?? ''}
                    onChange={(e) => setFormEcart({ ...formEcart, delai_regularisation: parseInt(e.target.value) || undefined })}
                    className={`form-input ${errors.delai_regularisation ? 'border-danger' : ''} ${focusClass}`}
                    placeholder="ex: 90"
                  />
                  <p className="field-description">Régularisation complète de l'écart</p>
                  {errors.delai_regularisation && (
                    <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.delai_regularisation}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="form-field">
              <label className="filter-label flex items-center gap-2">
                Libellé constatation <span className="text-danger">*</span>
                {((formEcart.libelle || '').trim().length > 0 || selectedItems.length > 0) && (
                  <button
                    type="button"
                    onClick={handleSuggesterLibelle}
                    disabled={isSuggestingLibelle}
                    className="btn btn-ghost btn-sm !p-1 !h-5 text-role-primary"
                    title={(formEcart.libelle || '').trim().length > 0 ? "Reformuler la constatation avec l'IA" : "Générer le libellé avec l'IA"}
                  >
                    {isSuggestingLibelle
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Sparkles className="w-3 h-3" />
                    }
                  </button>
                )}
              </label>
              <textarea
                ref={libelleRef}
                value={formEcart.libelle || ''}
                onChange={(e) => { setFormEcart({ ...formEcart, libelle: e.target.value }); autoResize(e.target as HTMLTextAreaElement); }}
                onInput={(e) => autoResize(e.target as HTMLTextAreaElement)}
                placeholder="Description détaillée de l'écart..."
                className={`form-textarea overflow-hidden ${errors.libelle ? 'border-danger' : ''} ${focusClass}`}
              />
              {errors.libelle && (
                <p className="field-error text-xs mt-1 text-danger flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.libelle}
                </p>
              )}
              {classificationLibelle && selectedItems.length === 0 && (
                <div className="mt-2 p-2.5 rounded-lg border border-role-primary/30 bg-role-primary-soft/40">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-role-primary" />
                    Classification AERORISQ (libellé)
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs text-foreground">
                      Domaine suggéré : <strong className="font-mono">{classificationLibelle.domaine}</strong> (confiance {classificationLibelle.confiance}%)
                    </span>
                    <span className="text-xs text-foreground">
                      Niveau suggéré : <strong>{classificationLibelle.gravite}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormEcart(prev => ({
                          ...prev,
                          domaine: classificationLibelle.domaine,
                          niveau: classificationLibelle.gravite as EcartRedaction['niveau'],
                        }));
                      }}
                      className="btn btn-primary btn-sm gap-1 !py-1 !px-2 text-[11px]"
                    >
                      <Zap className="w-3 h-3" /> Appliquer
                    </button>
                  </div>
                  {classificationLibelle.keywords.length > 0 && (
                    <p className="text-[10px] text-foreground mt-1.5">
                      Mots-clés détectés : {classificationLibelle.keywords.map((k: string) => `«${k}»`).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="bg-role-primary-soft p-3 rounded-lg">
              <p className="text-sm text-foreground">
                Items sélectionnés: <span className="font-bold">{selectedItems.length}</span>
              </p>
              {selectedItems.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {selectedItems.map(itemId => {
                    const item = itemsNSNV.find(i => i.id === itemId);
                    return item ? (
                      <span key={itemId} className="badge outline text-[10px]">{item.numero}</span>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAjouterEcart}
                disabled={selectedItems.length === 0 || !formEcart.libelle}
                className={`btn btn-primary flex-1 gap-2 ${(selectedItems.length === 0 || !formEcart.libelle) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingId ? 'Modifier' : 'Ajouter'} l'écart
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setFormEcart({ niveau: 'moyen' });
                    setSelectedItems([]);
                    setErrors({});
                    setIaSuggestion(null);
                  }}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
              )}
            </div>
          </div>
        </Card>
      )}
      </div>
      )}

      {/* Liste des écarts rédigés — masqué en lecture seule (déjà dans "Écarts déjà rédigés") */}
      {!readOnly && (
      <Card
        icon={<FileText className="w-4 h-4 text-role-primary" />}
        title={`Écarts rédigés (${ecarts.length} fiches · ${stats.traites}/${stats.total} items couverts)`}
        badge={stats.restants === 0 && ecarts.length > 0 && !readOnly ? (
          <button onClick={handleSigner} className="btn btn-success btn-sm gap-2">
            <Send className="w-4 h-4" />
            Signer les écarts
          </button>
        ) : undefined}
      >
        <div className={isAllSGSDomain ? '' : 'max-h-[400px] overflow-y-auto'}>
          {ecarts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-body">Aucun écart rédigé pour le moment</p>
              <p className="text-small text-muted-foreground mt-1">
                {isAllSGSDomain
                  ? 'Sélectionnez des éléments PAOE (Absent/Présent) dans la liste ci-dessus'
                  : 'Sélectionnez des questions NS/NV dans la liste ci-dessus'
                }
              </p>
            </div>
          ) : (
            <AccordionGroup spacing="sm">
              {Object.entries(
                ecarts.reduce<Record<string, EcartRedaction[]>>((acc, e) => {
                  const d = getEcartGroupe(e);
                  (acc[d] ??= []).push(e);
                  return acc;
                }, {})
              ).map(([groupe, groupedEcarts]) => (
                <AccordionSection
                  key={groupe}
                  icon={<FolderTree className="w-4 h-4 !text-white" />}
                  title={groupe}
                  subtitle={`${groupedEcarts.length} écart(s)`}
                  defaultOpen
                >
                  <div className="space-y-2">
                    {groupedEcarts.map(ecart => (
                      <EcartCard
                        key={ecart.id}
                        ecart={ecart}
                        onEdit={handleModifierEcart}
                        onDelete={handleSupprimerEcart}
                        onViewDetails={setSelectedEcartDetails}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                </AccordionSection>
              ))}
            </AccordionGroup>
          )}
        </div>
      </Card>
      )}

      {/* Note info — masquée en lecture seule */}
      {!readOnly && (
      <div className="alert alert-info">
        <AlertCircle className="alert-icon h-4 w-4" />
        <span>
          Les écarts sont sauvegardés automatiquement. La signature est disponible uniquement 
          lorsque tous les items NS/NV sont traités.
        </span>
      </div>
      )}

      {/* Modal détails écart */}
      {selectedEcartDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEcartDetails(null)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Détail de l'écart</h2>
              <button className="modal-close" onClick={() => setSelectedEcartDetails(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Référence</p>
                  <p className="code-oaci-badge text-sm">{selectedEcartDetails.reference}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Niveau</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isValidOACI(selectedEcartDetails.cellule_risque_oaci) && (
                      <span className={`inline-flex items-center justify-center rounded font-bold text-xs px-2 py-0.5 font-mono tracking-wide ${getCellColor(selectedEcartDetails.cellule_risque_oaci)}`}>
                        {selectedEcartDetails.cellule_risque_oaci}
                      </span>
                    )}
                    <span className={`badge ${getRiskLevelVariant(selectedEcartDetails.niveau)}`}>
                      {selectedEcartDetails.niveau}
                    </span>
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Référence réglementaire</p>
                  <p className="text-sm">{selectedEcartDetails.ref_reglementaire}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Libellé</p>
                  <p className="text-sm">{selectedEcartDetails.libelle}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Créé le</p>
                  <p className="text-sm">{new Date(selectedEcartDetails.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Modifié le</p>
                  <p className="text-sm">{new Date(selectedEcartDetails.updated_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Questions associées</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedEcartDetails.item_ids.map((itemId, idx) => {
                      const item = itemsNSNV.find(i => i.id === itemId);
                      return (
                        <span key={idx} className="badge outline text-xs">
                          {item?.numero || itemId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedEcartDetails(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal signature */}
      {signatureDialogOpen && typeof window !== 'undefined' && createPortal(
        <div className="modal-overlay" onClick={() => setSignatureDialogOpen(false)}>
          <div className="modal-content max-w-2xl border-t-4 border-t-role-primary" data-role={userRole} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Signature du document des écarts</h2>
              <button className="modal-close" onClick={() => setSignatureDialogOpen(false)}>
                <X className="w-5 h-5" />
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
        </div>,
        document.body
      )}
    </div>
  );
}