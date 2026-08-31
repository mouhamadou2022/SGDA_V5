// components/modules/surveillance/RapportAnnexes.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  ChevronDown,
  Users,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  UserCheck,
  Calendar,
  MapPin,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore, type EcartRedaction } from '@/lib/store';
import { fetchEcartsRedactionBySurveillance } from '@/lib/datastore';
import { getCellColor } from '@/lib/risque';
import { getSgsMaturiteLabel } from '@/lib/utils';
import { PAOE_LABELS } from '@/types/checklist';
import type { PAOELevel } from '@/types/checklist';

// ============================================================
// ANNEXE A-1 : FICHES DE PRÉSENCE
// ============================================================

function AnnexePresence({ surveillanceId }: { surveillanceId: string }) {
  const [expanded, setExpanded] = useState(true);
  const getFichesBySurveillance = useAppStore(s => s.getFichesBySurveillance);
  // Souscription réactive au store : si les fiches changent (ajout/édition/signature)
  // pendant que le composant est monté, la liste se met à jour sans rechargement.
  const presences = getFichesBySurveillance?.(surveillanceId) || [];

  const stats = {
    total: presences.length,
    signees: presences.filter(p => p.signature_url).length,
  };

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <Users className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-1: Fiches de présence</span>
          <span className="badge outline text-xs">{stats.total} participant(s)</span>
          <span className="badge success text-xs">{stats.signees}/{stats.total} signé(s)</span>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="rapport-presences-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prénom et nom</TableHead>
                  <TableHead>Fonction</TableHead>
                  <TableHead>Structure</TableHead>
                  <TableHead>Signature</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                  {presences.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground">{p.prenom_nom || '-'}</TableCell>
                      <TableCell className="text-foreground">{p.fonction || '-'}</TableCell>
                      <TableCell>
                        <span className={`badge ${p.structure === 'ANACIM' ? 'primary' : p.structure === 'EXPLOITANT' ? 'warning' : 'neutral'}`}>
                          {p.structure}
                        </span>
                      </TableCell>
                      <TableCell>
                        {p.signature_url ? (
                          <button className="action-button" onClick={() => window.open(p.signature_url, '_blank')} title="Voir signature">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          </button>
                        ) : (
                          <span className="text-danger text-xs">Non signé</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {presences.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucune fiche de présence disponible</p>
                </div>
              )}

            </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANNEXE A-2 : ÉCARTS CONSTATÉS (avec vérification de cohérence)
// ============================================================

/** Ordre de criticité pour le tri (le plus grave en premier). */
const CRITICITE_ORDER: Record<string, number> = {
  critique: 0, eleve: 1, moyen: 2, faible: 3, tres_faible: 4,
};

/** Niveaux PAOE collectés pour les écarts SGS (aligné avec /ecarts/sgs). */
const NIVEAUX_COLLECTES: PAOELevel[] = ['absent', 'present', 'approprie'];

/** UUID v4 déterministe — même construction que /ecarts/sgs (ids des écarts SGS). */
function stringToUUID(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  const h = Math.abs(hash).toString(16).padStart(8, '0');
  return `${h.slice(0,8)}-${h.slice(0,4)}-4${h.slice(1,4)}-${((parseInt(h.slice(0,2),16)&0x3f)|0x80).toString(16).padStart(2,'0')}${h.slice(2,4)}-${h.slice(0,12).padStart(12,'0')}`;
}

/** Badge couleur selon le niveau PAOE (maturité SGS). */
function getPAOEBadgeNiveau(niveau: PAOELevel): string {
  switch (niveau) {
    case 'absent':       return 'badge danger';
    case 'present':      return 'badge warning';
    case 'approprie':    return 'badge neutral';
    case 'operationnel': return 'badge success';
    case 'efficace':     return 'badge success';
    default:             return 'badge neutral';
  }
}

/** Élément résolu d'un item (référence questionnaire + composante + domaine). */
interface ItemResolu {
  numero: string;
  referenceReglementaire: string;
  domaine: string;
  sousDomaine: string;
  composanteId?: number;
  maturiteNiveau?: PAOELevel;
  maturiteScore?: number;
}

/** Écart enrichi pour l'annexe : item_ids + références questionnaires + composante. */
interface EcartEnrichi {
  id: string;
  reference: string;
  libelle: string;
  ref_reglementaire: string;
  niveau_risque: string;
  domaine: string;
  cellule_risque_oaci?: string;
  probabilite_risque?: number;
  gravite_risque?: string;
  inspecteur_ref_id: string;
  created_at: string;
  statut: string;
  item_ids: string[];
  referencesQuestionnaires: string[];
  composante?: string;
  maturiteNiveau?: PAOELevel;
  maturiteScore?: number;
}

function AnnexeEcarts({ surveillanceId }: { surveillanceId: string }) {
  const [expanded, setExpanded] = useState(true);
  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const getEcartsEffectifs = useAppStore(s => s.getEcartsEffectifsSurveillance);
  const setEcartsRedaction = useAppStore(s => s.setEcartsRedaction);
  // Souscription réactive aux sources d'écarts : si les brouillons (ecartsRedaction)
  // ou les écarts officiels changent pendant que l'annexe est montée, la liste se
  // met à jour sans rechargement.
  const storedRedaction = useAppStore(s => s.ecartsRedaction);
  useAppStore(s => s.ecarts);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);
  const sigs = surveillance?.signatures_ecarts || [];

  // L'annexe A-2 n'affiche QUE les écarts signés : seul le remplissage de
  // `signatures_ecarts` (signature en lot depuis /ecarts) valide l'affichage.
  const ecartsSignes = sigs.length > 0;

  // Chargement des brouillons d'écarts depuis Supabase si le store est vide au
  // moment où l'annexe est montée (rapport ouvert directement sans passer par
  // /ecarts : le store Zustand démarre vide à chaque session). Une fois chargés,
  // la souscription à `ecartsRedaction` maintient la liste à jour.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (getEcartsEffectifs(surveillanceId).length > 0) return;
        const persisted = await fetchEcartsRedactionBySurveillance(surveillanceId);
        if (cancelled || persisted.length === 0) return;
        const storeIds = new Set(storedRedaction.map(e => String(e.id)));
        const toAdd = persisted.filter(e => !storeIds.has(String(e.id)));
        if (toAdd.length > 0) {
          setEcartsRedaction([...storedRedaction, ...toAdd]);
        }
      } catch (err) {
        console.error('[AnnexeEcarts] chargement des écarts signés depuis Supabase échoué:', err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveillanceId, setEcartsRedaction]);

  // Pendant la rédaction les écarts vivent dans `ecartsRedaction` (brouillons) ;
  // on lit donc les écarts « effectifs » (brouillons normalisés) pour que
  // l'annexe A-2 puisse les afficher une fois signés.
  const ecartsEffectifs = getEcartsEffectifs(surveillanceId);
  // Si les écarts ne sont pas encore signés, on n'affiche rien (placeholder).
  const displayedEcarts = ecartsSignes ? ecartsEffectifs : [];

  // Référentiel (items du checklist) + évaluation SGS (composantes/maturité).
  const getChecklistItemsFlat = useAppStore(s => s.getChecklistItemsFromHierarchy);
  const evaluationSgs = (surveillance?.sgs_evaluation_prepa || null) as
    | { composantes: { id: number; label: string; score: number; niveauGlobal: PAOELevel; elements: { elementId: string; label: string; niveauGlobal: PAOELevel }[] }[] }
    | null;

  // Reconstruit les ids d'items SGS (mêmes que ceux des écarts SGS) en attachant
  // la référence questionnaire, la composante et sa maturité.
  const sgsItemsById = useMemo<Map<string, ItemResolu>>(() => {
    const map = new Map<string, ItemResolu>();
    if (!evaluationSgs) return map;
    for (const composante of evaluationSgs.composantes) {
      const compId = Number(composante.id);
      composante.elements.forEach((element, idx) => {
        if (!NIVEAUX_COLLECTES.includes(element.niveauGlobal)) return;
        const itemId = stringToUUID(`sgs-${surveillanceId}-${compId}-${element.elementId}`);
        map.set(itemId, {
          numero: `SGS-${compId}.${idx + 1}`,
          referenceReglementaire: '',
          domaine: 'SGS',
          sousDomaine: `Composante ${compId}: ${composante.label}`,
          composanteId: compId,
          maturiteNiveau: composante.niveauGlobal,
          maturiteScore: composante.score,
        });
      });
    }
    return map;
  }, [evaluationSgs, surveillanceId]);

  // Map des items du référentiel (non-SGS principalement) par id.
  // Souscription réactive à la hiérarchie : recalculée si le référentiel se charge.
  const checklistHierarchyLen = Object.keys(useAppStore(s => s.checklistHierarchy) || {}).length;
  const referentielItemsById = useMemo<Map<string, ItemResolu>>(() => {
    const map = new Map<string, ItemResolu>();
    for (const item of getChecklistItemsFlat(surveillanceId)) {
      const it = item as unknown as { id: string; numero?: string; reference_ras14?: string; reference_reglementaire?: string; domaine?: string; sousDomaine?: string; sousSousDomaine?: string };
      map.set(it.id, {
        numero: it.numero || it.reference_ras14 || '',
        referenceReglementaire: it.reference_reglementaire || it.reference_ras14 || '',
        domaine: it.domaine || '',
        sousDomaine: it.sousDomaine || it.sousSousDomaine || '',
      });
    }
    return map;
  }, [surveillanceId, getChecklistItemsFlat, checklistHierarchyLen]);

  // Obtient l'item résolu d'un écart, en priorité SGS puis référentiel.
  const resolveItem = (id: string): ItemResolu | undefined =>
    sgsItemsById.get(id) || referentielItemsById.get(id);

  // Associe à chaque écart ses item_ids (depuis le brouillon), ses références
  // questionnaires et sa composante (SGS) avec maturité.
  const draftById = useMemo(() => {
    const m = new Map<string, EcartRedaction>();
    for (const d of storedRedaction) m.set(d.id, d);
    return m;
  }, [storedRedaction]);

  const ecartsEnrichis = useMemo<EcartEnrichi[]>(() => {
    const risqueNiveau = (e: any): string => (e as any).niveau_risque || (e as any).niveau || 'moyen';
    return displayedEcarts.map(e => {
      const draft = draftById.get(e.id);
      const itemIds = draft?.item_ids || [];
      const itemsResolus = itemIds.map(resolveItem).filter((i): i is ItemResolu => Boolean(i));
      const numRefs = [...new Set(itemsResolus.map(i => i.numero).filter(Boolean))];
      const isSgs = (itemsResolus[0]?.domaine || e.domaine) === 'SGS';
      const composante = itemsResolus[0]?.sousDomaine;
      const maturiteNiveau = itemsResolus[0]?.maturiteNiveau;
      const maturiteScore = itemsResolus[0]?.maturiteScore;
      return {
        id: e.id,
        reference: e.reference,
        libelle: e.libelle,
        ref_reglementaire: e.ref_reglementaire || (itemsResolus[0]?.referenceReglementaire || ''),
        niveau_risque: risqueNiveau(e),
        domaine: isSgs ? 'SGS' : (itemsResolus[0]?.domaine || e.domaine || 'Autre'),
        cellule_risque_oaci: e.cellule_risque_oaci,
        probabilite_risque: e.probabilite_risque as number | undefined,
        gravite_risque: e.gravite_risque as string | undefined,
        inspecteur_ref_id: e.inspecteur_ref_id,
        created_at: e.created_at || new Date().toISOString(),
        statut: (e as any).statut || 'ouvert',
        item_ids: itemIds,
        referencesQuestionnaires: numRefs,
        composante: composante || (isSgs ? 'SGS' : undefined),
        maturiteNiveau,
        maturiteScore,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedEcarts, draftById, sgsItemsById, referentielItemsById]);

  // Groupes : écarts SGS par composante (triés par id) + écarts non-SGS par
  // domaine (chaque groupe trié par criticité).
  const sgsGroups = useMemo(() => {
    const groups = new Map<string, EcartEnrichi[]>();
    for (const e of ecartsEnrichis) {
      if (e.domaine !== 'SGS') continue;
      const comp = e.composante || 'SGS';
      (groups.get(comp) || groups.set(comp, []).get(comp)!).push(e);
    }
    return [...groups.entries()]
      .map(([composante, ecarts]) => ({
        composante,
        numero: composante,
        maturiteNiveau: ecarts[0]?.maturiteNiveau,
        maturiteScore: ecarts[0]?.maturiteScore,
        ecarts,
      }))
      .sort((a, b) => {
        const ca = Number((a.composante.match(/\d+/) || [99])[0]);
        const cb = Number((b.composante.match(/\d+/) || [99])[0]);
        return ca - cb;
      });
  }, [ecartsEnrichis]);

  const nonSgsGroups = useMemo(() => {
    const groups = new Map<string, EcartEnrichi[]>();
    for (const e of ecartsEnrichis) {
      if (e.domaine === 'SGS') continue;
      (groups.get(e.domaine) || groups.set(e.domaine, []).get(e.domaine)!).push(e);
    }
    return [...groups.entries()]
      .map(([domaine, ecarts]) => ({
        domaine,
        ecarts: [...ecarts].sort(
          (a, b) => (CRITICITE_ORDER[a.niveau_risque] ?? 9) - (CRITICITE_ORDER[b.niveau_risque] ?? 9)
        ),
      }))
      .sort((a, b) => a.domaine.localeCompare(b.domaine));
  }, [ecartsEnrichis]);

  const stats = {
    total: ecartsEnrichis.length,
    critiques: ecartsEnrichis.filter(e => e.niveau_risque === 'critique').length,
    eleves: ecartsEnrichis.filter(e => e.niveau_risque === 'eleve').length,
    moyens: ecartsEnrichis.filter(e => e.niveau_risque === 'moyen').length,
    faibles: ecartsEnrichis.filter(e => e.niveau_risque === 'faible').length,
    clos: ecartsEnrichis.filter(e => e.statut === 'cloture').length,
  };

  const getNiveauBadge = (niveau: any) => {
    switch (niveau) {
      case 'critique': return 'badge danger animate-pulse';
      case 'eleve': return 'badge eleve';
      case 'moyen': return 'badge moyen';
      default: return 'badge neutral';
    }
  };

  const renderEcartCard = (ecart: EcartEnrichi, showCriticite: boolean) => {
    const sig = sigs.find(s => s.signataire_id === ecart.inspecteur_ref_id) || sigs[sigs.length - 1];
    return (
      <div key={ecart.id} className="border border-border rounded-xl overflow-hidden bg-white">
        {/* En-tête: Aérodrome · Date · Référence */}
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-b border-border">
          <div className="flex items-center gap-3 text-xs text-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {aerodrome?.code_oaci || 'N/A'}
            </span>
            <span className="text-foreground/40">|</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {surveillance?.date_fin
                ? new Date(surveillance.date_fin).toLocaleDateString('fr-FR')
                : 'N/A'}
            </span>
          </div>
          <span className="font-semibold text-sm text-foreground">{ecart.reference}</span>
        </div>

        {/* Libellé */}
        <div className="px-4 py-3 border-b border-border">
          <p className="text-sm text-foreground leading-relaxed">{ecart.libelle}</p>
        </div>

        {/* Références questionnaires */}
        {ecart.referencesQuestionnaires.length > 0 && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground">Questions :</span>
            {ecart.referencesQuestionnaires.map((ref, i) => (
              <span key={i} className="badge outline text-[10px] font-mono">{ref}</span>
            ))}
          </div>
        )}

        {/* Ligne: Niveau de risque + Indice OACI (uniquement pour les écarts non-SGS) */}
        {showCriticite && (
          <div className="px-4 py-2 bg-muted/10 border-b border-border flex items-center gap-3 flex-wrap">
            <span className={getNiveauBadge(ecart.niveau_risque)}>{ecart.niveau_risque}</span>
            {ecart.cellule_risque_oaci && (
              <>
                <span className="text-xs text-muted-foreground">|</span>
                <span className="text-xs text-muted-foreground">Indice OACI :</span>
                <span className={`inline-flex items-center justify-center rounded font-bold text-xs px-2 py-0.5 font-mono tracking-wider ${getCellColor(ecart.cellule_risque_oaci)}`}>
                  {ecart.cellule_risque_oaci}
                </span>
                {ecart.probabilite_risque && ecart.gravite_risque && (
                  <span className="text-xs text-muted-foreground">
                    P{ecart.probabilite_risque} × G{ecart.gravite_risque}
                  </span>
                )}
              </>
            )}
            {ecart.ref_reglementaire && (
              <span className="text-xs text-muted-foreground ml-auto">{ecart.ref_reglementaire}</span>
            )}
          </div>
        )}

        {/* Inspecteur + Signature */}
        <div className="px-4 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <UserCheck className="w-3.5 h-3.5" />
            <span className="font-medium text-foreground">
              {sig?.signataire_nom || 'Inspecteur non renseigné'}
            </span>
          </div>
          {sig?.signature_url ? (
            <img
              src={sig.signature_url}
              alt="Signature"
              className="h-8 w-auto object-contain ml-2"
            />
          ) : (
            <div className="h-8 w-20 border border-dashed border-border rounded flex items-center justify-center text-xs text-muted-foreground ml-2">
              Signature
            </div>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {new Date(ecart.created_at).toLocaleDateString('fr-FR')}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <AlertTriangle className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-2: Écarts constatés</span>
          <span className="badge outline text-xs">{stats.total} écart(s)</span>
          {stats.critiques > 0 && (
            <span className="badge danger animate-pulse text-xs">{stats.critiques} critique(s)</span>
          )}
          <span className="badge success text-xs">{stats.clos} clôturé(s)</span>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="grid grid-cols-5 gap-2 mb-4">
            <div className="text-center p-2 bg-danger-soft rounded-lg">
              <div className="text-lg font-bold text-danger">{stats.critiques}</div>
              <div className="text-xs text-muted-foreground">Critique</div>
            </div>
            <div className="text-center p-2 bg-warning-soft rounded-lg">
              <div className="text-lg font-bold text-warning">{stats.eleves}</div>
              <div className="text-xs text-muted-foreground">Élevé</div>
            </div>
            <div className="text-center p-2 bg-primary-soft rounded-lg">
              <div className="text-lg font-bold text-primary">{stats.moyens}</div>
              <div className="text-xs text-muted-foreground">Moyen</div>
            </div>
            <div className="text-center p-2 bg-gray-100 rounded-lg">
              <div className="text-lg font-bold text-gray-600">{stats.faibles}</div>
              <div className="text-xs text-muted-foreground">Faible</div>
            </div>
            <div className="text-center p-2 bg-success-soft rounded-lg">
              <div className="text-lg font-bold text-success">{stats.clos}</div>
              <div className="text-xs text-muted-foreground">Clôturés</div>
            </div>
          </div>

          {ecartsEnrichis.length > 0 ? (
            <div className="space-y-6">
              {sgsGroups.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">Écarts SGS — par composante</span>
                    <span className="badge outline text-xs">{sgsGroups.length} composante(s)</span>
                  </div>
                  {sgsGroups.map(group => (
                    <div key={group.composante} className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-role-primary/10 border-b border-border flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{group.composante}</span>
                        <span className={`${getPAOEBadgeNiveau(group.maturiteNiveau || 'absent')} text-xs`}>
                          Maturité : {group.maturiteNiveau ? PAOE_LABELS[group.maturiteNiveau] : 'N/A'}
                          {group.maturiteScore != null ? ` (${group.maturiteScore}%)` : ''}
                        </span>
                      </div>
                      <div className="space-y-3 p-3">
                        {group.ecarts.map(e => renderEcartCard(e, false))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {nonSgsGroups.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">Écarts par domaine et criticité</span>
                  </div>
                  {nonSgsGroups.map(g => (
                    <div key={g.domaine} className="border border-border rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-muted/10 border-b border-border">
                        <span className="text-sm font-semibold text-foreground">{g.domaine}</span>
                        <span className="badge outline text-xs">{g.ecarts.length} écart(s)</span>
                      </div>
                      <div className="space-y-3 p-3">
                        {g.ecarts.map(e => renderEcartCard(e, true))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {ecartsSignes ? (
                <>
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-success" />
                  <p className="text-sm">Aucun écart constaté</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 text-warning" />
                  <p className="text-sm font-medium text-foreground">Écarts non encore signés</p>
                  <p className="text-xs mt-1">
                    Les écarts seront affichés dans l'annexe une fois signés depuis /ecarts.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANNEXE A-3 : PROFIL DE RISQUE (avec vérification de cohérence)
// ============================================================

function AnnexeProfilRisque({ aerodromeId, readOnly }: { aerodromeId: string; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const profil = profilsRisque[aerodromeId];

  const getNiveauConfig = (score: number) => {
    if (score >= 80) return { label: 'Excellent', color: 'text-success', bg: 'bg-success-soft', badge: 'success' };
    if (score >= 60) return { label: 'Bon', color: 'text-primary', bg: 'bg-primary-soft', badge: 'primary' };
    if (score >= 30) return { label: 'Modéré', color: 'text-warning', bg: 'bg-warning-soft', badge: 'warning' };
    return { label: 'Critique', color: 'text-danger', bg: 'bg-danger-soft', badge: 'danger' };
  };

  const getTendanceIcon = () => {
    if (profil?.tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />;
    if (profil?.tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger animate-pulse" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getProgressClass = (score: number) => {
    if (score >= 80) return 'progress-faible';
    if (score >= 60) return 'progress-moyen';
    if (score >= 30) return 'progress-eleve';
    return 'progress-critique';
  };

  const niveauConfig = profil ? getNiveauConfig(profil.score_global) : null;

  const critereLabels: Record<string, string> = {
    c1: 'Maturité SGS',
    c2: 'Efficacité des PAC',
    c3: 'Conformité réglementaire',
    c4: 'Charge critique',
    c5: 'Résilience',
  };
  const minCritere = profil
    ? ([
        { key: 'c1', label: critereLabels.c1, value: profil.c1 },
        { key: 'c2', label: critereLabels.c2, value: profil.c2 },
        { key: 'c3', label: critereLabels.c3, value: profil.c3 },
        { key: 'c4', label: critereLabels.c4, value: profil.c4 },
        { key: 'c5', label: critereLabels.c5, value: profil.c5 },
      ] as { key: string; label: string; value: number }[]).sort((a, b) => a.value - b.value)[0]
    : { key: 'c5', label: 'Résilience', value: 0 };

  if (!profil) {
    return (
      <div className="accordion mb-4">
        <button
          className="accordion-trigger w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-role-primary" />
            <span className="font-semibold text-foreground">Annexe A-3: Profil de risque</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="accordion-content text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Profil de risque non disponible</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <BarChart3 className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-3: Profil de risque</span>
          <span className={`badge ${niveauConfig?.badge}`}>{niveauConfig?.label}</span>
          <div className="flex items-center gap-1">
            {getTendanceIcon()}
            <span className={`text-xs capitalize ${profil.tendance === 'baisse' ? 'text-danger' : profil.tendance === 'hausse' ? 'text-success' : ''}`}>
              {profil.tendance}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-foreground">Score global</span>
            <span className={`text-2xl font-bold ${niveauConfig?.color}`}>{profil.score_global}/100</span>
          </div>
          <div className="progress h-2 mb-4">
            <div className={`progress-bar ${getProgressClass(profil.score_global)}`} style={{ width: `${profil.score_global}%` }} />
          </div>

          <div className="mb-5 p-3 rounded-lg border border-border/60 bg-white">
            <p className="text-sm text-foreground leading-relaxed">
              Le niveau de risque global de cet aérodrome est
              <strong className="text-foreground"> {niveauConfig?.label.toLowerCase()} </strong>avec un score de{' '}
              <strong className="text-foreground">{profil.score_global}/100</strong>
              {profil.tendance === 'hausse' ? ' , en amélioration par rapport aux calculs précédents (tendance haussière).' :
                profil.tendance === 'baisse' ? ' , en dégradation (tendance baissière) : une attention particulière est requise.' :
                ' , stable par rapport aux calculs précédents.'}
            </p>
            <p className="text-sm text-foreground leading-relaxed mt-2">
              Le critère le plus fragilisant est la{' '}
              <strong className="text-foreground">{minCritere.label}</strong> (score {minCritere.value}/100) : c'est sur ce
              point que les actions de remédiation devraient être priorisées.
            </p>
            {typeof profil.prediction_3m === 'number' && (
              <p className="text-sm text-foreground leading-relaxed mt-2">
                À 3 mois, le score projeté est de <strong className="text-foreground">{profil.prediction_3m}/100</strong>
                {typeof profil.prediction_6m === 'number' && <> et de <strong className="text-foreground">{profil.prediction_6m}/100</strong> à 6 mois</>},
                ce qui permet d'anticiper l'évolution du niveau de risque.
              </p>
            )}
          </div>

          <div className="space-y-4 mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Analyse détaillée par critère</p>
            {[
              { key: 'c1', label: 'C1 — Maturité SGS', value: profil.c1,
                interp: profil.c1 >= 80 ? 'Votre système de gestion de la sécurité est mature et pleinement opérationnel : procédures documentées, comprises et appliquées par tous.' :
                  profil.c1 >= 60 ? 'Votre SGS est opérationnel mais perfectible. Renforcez la documentation des procédures et la formation continue du personnel.' :
                  profil.c1 >= 30 ? 'Votre SGS est partiellement déployé. Priorités : formaliser votre politique sécurité, nommer un responsable SGS, structurer le traitement des événements de sécurité.' :
                  'Votre SGS est insuffisant ou inexistant. Une structure minimale (politique de sécurité, responsabilités, procédures écrites) est requise d\'urgence pour la conformité réglementaire.' },
              { key: 'c2', label: 'C2 — Efficacité des PAC', value: profil.c2,
                interp: profil.c2 >= 80 ? 'Vos actions correctives sont traitées dans les délais et leur efficacité fait l\'objet d\'une vérification systématique.' :
                  profil.c2 >= 60 ? 'Le suivi des PAC est globalement correct mais des retards ponctuels existent. Renforcez la traçabilité des clôtures et les relances.' :
                  profil.c2 >= 30 ? 'Trop de PAC ne sont pas clôturés dans les délais impartis. Mettez en place un tableau de bord de suivi et désignez des responsables par écart.' :
                  'Le suivi des PAC est quasi inexistant. Action prioritaire : établir un processus formel de traitement et de suivi des actions correctives avec échéances.' },
              { key: 'c3', label: 'C3 — Conformité réglementaire', value: profil.c3,
                interp: profil.c3 >= 80 ? 'Votre niveau de conformité est satisfaisant. Maintenez la veille réglementaire et les auto-évaluations périodiques.' :
                  profil.c3 >= 60 ? 'Des écarts de conformité existent mais ne sont pas critiques. Planifiez leur résolution par ordre de priorité (échéances, criticité).' :
                  profil.c3 >= 30 ? 'Plusieurs non-conformités réglementaires nécessitent une attention immédiate. Réalisez un audit interne systématique pour les identifier et les traiter.' :
                  'Le niveau de conformité réglementaire est préoccupant. Une action corrective globale et structurée est nécessaire pour éviter des mesures de suspension.' },
              { key: 'c4', label: 'C4 — Charge critique', value: profil.c4,
                interp: profil.c4 >= 80 ? 'La charge de travail et les facteurs de risque humains sont bien maîtrisés. Poursuivez la surveillance.' :
                  profil.c4 >= 60 ? 'Quelques facteurs de charge critique sont présents. Surveillez les pics d\'activité, les rotations de personnel et la charge mentale.' :
                  profil.c4 >= 30 ? 'La charge critique est élevée. Évaluez les risques de fatigue, l\'adéquation des effectifs et la répartition des tâches opérationnelles.' :
                  'La charge critique est excessive, augmentant le risque d\'erreur humaine. Réorganisez les plannings, renforcez les effectifs et réduisez les tâches simultanées.' },
              { key: 'c5', label: 'C5 — Résilience', value: profil.c5,
                interp: profil.c5 >= 80 ? 'Votre organisation est résiliente : capacité démontrée à absorber et à se remettre des perturbations.' :
                  profil.c5 >= 60 ? 'La résilience est correcte mais des scénarios de continuité d\'activité doivent être formalisés et testés.' :
                  profil.c5 >= 30 ? 'La capacité de réaction face aux imprévus est limitée. Élaborez un plan de continuité d\'activité et organisez des exercices.' :
                  'Votre organisation est fragile face aux perturbations. Un plan de continuité d\'activité détaillé est urgent, accompagné de formations aux procédures d\'urgence.' },
            ].map(crit => {
              const critConfig = getNiveauConfig(crit.value);
              return (
                <div key={crit.key} className="p-3 rounded-lg border border-border/60 bg-white">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-mono font-bold text-muted-foreground w-8">{crit.key.toUpperCase()}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-medium text-foreground">{crit.label}</span>
                        <span className={`text-sm font-bold ${critConfig.color}`}>{crit.value}/100{crit.key === 'c1' && <span className="text-xs text-muted-foreground font-normal ml-1">({getSgsMaturiteLabel(crit.value)})</span>}</span>
                      </div>
                      <div className="progress h-1.5">
                        <div className={`progress-bar ${getProgressClass(crit.value)}`} style={{ width: `${crit.value}%` }} />
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pl-10">{crit.interp}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground">Dernier calcul du profil</p>
            <p className="text-sm">{new Date(profil.computed_at).toLocaleString('fr-FR')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

interface RapportAnnexesProps {
  surveillanceId: string;
  readOnly?: boolean;
  userRole?: string;
}

export function RapportAnnexes({
  surveillanceId,
  readOnly = false,
  userRole = 'inspector',
}: RapportAnnexesProps) {
  const surveillances = useAppStore(s => s.surveillances);
  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodromeId = surveillance?.aerodrome_id;

  const [expandedSections, setExpandedSections] = useState<string[]>(['A1', 'A2', 'A3']);
  const [expandedAll, setExpandedAll] = useState(true);

  const toggleAll = () => {
    setExpandedAll(!expandedAll);
    if (!expandedAll) {
      setExpandedSections(['A1', 'A2', 'A3']);
    } else {
      setExpandedSections([]);
    }
  };

  return (
    <div className="space-y-4" data-role={userRole}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-role-primary" />
          <h3 className="font-semibold text-foreground">Annexes du rapport</h3>
          <span className="badge outline text-xs">A-1, A-2, A-3</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleAll} className="btn btn-secondary btn-sm gap-1">
            {expandedAll ? 'Tout réduire' : 'Tout déployer'}
          </button>
        </div>
      </div>

      {expandedSections.includes('A1') && (
        <AnnexePresence surveillanceId={surveillanceId} />
      )}

      {expandedSections.includes('A2') && (
        <AnnexeEcarts surveillanceId={surveillanceId} />
      )}

      {expandedSections.includes('A3') && aerodromeId && (
        <AnnexeProfilRisque aerodromeId={aerodromeId} readOnly={readOnly} />
      )}

      {expandedSections.length === 0 && (
        <Card className="text-center text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune annexe sélectionnée</p>
          <p className="text-xs mt-1">Cliquez sur "Tout déployer" pour afficher les annexes</p>
        </Card>
      )}
    </div>
  );
}

export default RapportAnnexes;
