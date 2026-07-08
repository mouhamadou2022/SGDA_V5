'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { getCellColor, getRiskLevelBgColor, getRiskLevelClass } from '@/lib/risque';
import { isEcartProcessusActif } from '@/lib/processus/isEcartProcessusActif';
import {
  ArrowLeft, AlertTriangle, CheckCircle2, XCircle, MinusCircle, FileText, Eye,
  MapPin, Calendar, Users, Target, Clock, Shield, ChevronRight, Sparkles,
  AlertCircle, Merge, Archive, Trash2, ArrowUp, ArrowDown, CheckCircle, X,
  HelpCircle, FileSignature, ClipboardList, BookOpen,
} from 'lucide-react';
import { registreUtils } from '@/lib/registreUtils';

interface SourceConfig {
  label: string;
  badge: string;
  icon: React.ElementType;
}

const SOURCE_CONFIG: Record<string, SourceConfig> = {
  certification: { label: 'Certification', badge: 'badge purple', icon: Shield },
  homologation: { label: 'Homologation', badge: 'badge primary', icon: Shield },
  surveillance: { label: 'Surveillance', badge: 'badge warning', icon: Eye },
  sgs: { label: 'SGS', badge: 'badge neutral', icon: FileText },
  evenement: { label: 'Événement', badge: 'badge danger', icon: AlertTriangle },
};

const ACTION_OPTIONS: { value: string; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'inchangé', label: 'Inchangé', icon: MinusCircle, color: 'text-muted-foreground' },
  { value: 'aggravé', label: 'Aggravé', icon: ArrowUp, color: 'text-danger' },
  { value: 'amélioré', label: 'Amélioré', icon: ArrowDown, color: 'text-success' },
  { value: 'résolu', label: 'Résolu (clôturer)', icon: CheckCircle2, color: 'text-success' },
  { value: 'obsolète', label: 'Obsolète', icon: Archive, color: 'text-neutral' },
  { value: 'fusionné', label: 'Fusionné', icon: Merge, color: 'text-primary' },
];

function getEcartSource(ecart: any, surveillances: any[]): { key: string; config: SourceConfig } {
  if (ecart.surveillance_id) {
    const surv = surveillances.find((s: any) => s.id === ecart.surveillance_id);
    if (surv) {
      const isSgs = (surv.portee || []).length === 1 && surv.portee?.[0] === 'SGS';
      if (isSgs) return { key: 'sgs', config: SOURCE_CONFIG.sgs };
      return { key: 'surveillance', config: SOURCE_CONFIG.surveillance };
    }
  }
  if (ecart.domaine === 'SGS') return { key: 'sgs', config: SOURCE_CONFIG.sgs };
  return { key: 'surveillance', config: SOURCE_CONFIG.surveillance };
}

function getEcartAnnee(ecart: any): string {
  const date = ecart.created_at || ecart.date_detection;
  if (date) return new Date(date).getFullYear().toString();
  return '—';
}

function getStatutBadge(statut: string, motif?: string): { cls: string; label: string } {
  const motifs: Record<string, string> = {
    resolu_normal: 'Clôturé',
    resolu_reconciliation: 'Résolu',
    obsolete: 'Obsolète',
    fusionne: 'Fusionné',
  };
  if (statut === 'cloture' && motif && motifs[motif]) {
    return { cls: 'badge neutral', label: motifs[motif] };
  }
  switch (statut) {
    case 'ouvert': return { cls: 'badge danger', label: 'Ouvert' };
    case 'pac_attendu': return { cls: 'badge warning', label: 'PAC attendu' };
    case 'pac_soumis': return { cls: 'badge primary', label: 'PAC soumis' };
    case 'pac_refuse': return { cls: 'badge danger', label: 'PAC refusé' };
    case 'pac_accepte': return { cls: 'badge success', label: 'PAC accepté' };
    case 'preuves_soumises': return { cls: 'badge primary', label: 'Preuves soumises' };
    case 'preuves_evaluees': return { cls: 'badge warning', label: 'Preuves évaluées' };
    case 'en_retard': return { cls: 'badge danger', label: 'En retard' };
    case 'cloture': return { cls: 'badge neutral', label: 'Clôturé' };
    default: return { cls: 'badge outline', label: statut };
  }
}

function getNiveauLabel(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'Critique';
    case 'eleve': return 'Élevé';
    case 'moyen': return 'Moyen';
    case 'faible': return 'Faible';
    case 'tres_faible': return 'Très faible';
    default: return niveau;
  }
}

interface ReconciliationProps {
  surveillanceId: string;
  onBack?: () => void;
}

interface EcartAction {
  ecartId: string;
  action: string;
  nouveauNiveau?: string;
  fusionneVersId?: string;
  justification?: string;
}

export default function SurveillanceReconciliation({ surveillanceId, onBack }: ReconciliationProps) {
  const router = useRouter();
  const surveillances = useAppStore(s => s.surveillances);
  const aerodromes = useAppStore(s => s.aerodromes);
  const user = useAppStore(s => s.user);
  const ecarts = useAppStore(s => s.ecarts);
  const getItemsNSNVFromHierarchy = useAppStore(s => s.getItemsNSNVFromHierarchy);
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const updateEcart = useAppStore(s => s.updateEcart);
  const addEcart = useAppStore(s => s.addEcart);
  const addNotification = useAppStore(s => s.addNotification);
  const addHistoriqueEntry = useAppStore(s => s.addHistoriqueEntry);
  const addRegistreEntry = useAppStore(s => s.addRegistreEntry);
  const updatePlanning = useAppStore(s => s.updatePlanning);
  const certifications = useAppStore(s => s.certifications);
  const homologations = useAppStore(s => s.homologations);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);
  const aerodromeId = surveillance?.aerodrome_id;

  // Tous les écarts de l'aérodrome (toutes sources confondues)
  // Exclut ceux issus de certification/homologation non terminée
  const aerodromeEcarts = useMemo(() => {
    if (!aerodromeId) return [];
    return ecarts
      .filter(e => e.aerodrome_id === aerodromeId)
      .filter(e => !isEcartProcessusActif(e.surveillance_id, aerodromeId, certifications, homologations))
      .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
  }, [ecarts, aerodromeId, certifications, homologations]);

  // Résultats NS/NV des checklists standard + SGS
  const itemsNSNV = useMemo(() => {
    const raw = getItemsNSNVFromHierarchy(surveillanceId) as any[];
    return raw.map(item => ({
      id: item.id,
      numero: item.reference_ras14 || item.categorie || item.id,
      description: item.description || '',
      domaine: item.domaine || '',
      sousDomaine: item.sousDomaine || '',
      resultat: item.resultat as 'NS' | 'NV',
    }));
  }, [surveillanceId, getItemsNSNVFromHierarchy]);

  // Écarts liés au suivi écarts / PAC de cette surveillance
  const surveillanceEcarts = useMemo(() => {
    return aerodromeEcarts.filter(e => e.surveillance_id === surveillanceId);
  }, [aerodromeEcarts, surveillanceId]);

  // Surveillance N (la plus récente transmise du même aérodrome) à archiver
  const previousSurveillance = useMemo(() => {
    if (!aerodromeId) return null;
    return surveillances
      .filter(s => s.aerodrome_id === aerodromeId && s.id !== surveillanceId)
      .filter(s => s.statut === 'transmise')
      .sort((a, b) => new Date(b.date_fin || b.created_at).getTime() - new Date(a.date_fin || a.created_at).getTime())
      [0] || null;
  }, [surveillances, aerodromeId, surveillanceId]);

  // Actions par écart
  const [ecartActions, setEcartActions] = useState<Record<string, EcartAction>>({});
  const [nouveauxEcarts, setNouveauxEcarts] = useState<string[]>([]);
  const [ignoresNSNV, setIgnoresNSNV] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [showSynthesis, setShowSynthesis] = useState(false);

  // Stats de réconciliation
  const reconciliationStats = useMemo(() => {
    const actions = Object.values(ecartActions);
    return {
      resolus: actions.filter(a => a.action === 'résolu').length,
      obsoletes: actions.filter(a => a.action === 'obsolète').length,
      agreges: actions.filter(a => a.action === 'aggravé').length,
      resumes: actions.filter(a => a.action === 'amélioré').length,
      fusionnes: actions.filter(a => a.action === 'fusionné').length,
      inchanges: actions.filter(a => a.action === 'inchangé').length,
      nouveaux: nouveauxEcarts.length,
      totalActions: actions.length,
    };
  }, [ecartActions, nouveauxEcarts]);

  const setEcartAction = (ecartId: string, action: string) => {
    setEcartActions(prev => {
      const next = { ...prev };
      if (action === 'inchangé' || !action) {
        delete next[ecartId];
      } else {
        next[ecartId] = { ...next[ecartId], ecartId, action };
      }
      return next;
    });
  };

  const toggleNouvelEcart = (itemId: string) => {
    setNouveauxEcarts(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleIgnoreNSNV = (itemId: string) => {
    setIgnoresNSNV(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const handleValidate = async () => {
    const totalActions = Object.keys(ecartActions).length + nouveauxEcarts.length;
    if (totalActions === 0) {
      addNotification({
        user_id: user?.id || '', type: 'warning' as const,
        title: 'Aucune action', message: 'Veuillez définir au moins une action de réconciliation.',
        canal: 'in_app' as const,
      });
      return;
    }

    const now = new Date().toISOString();
    const acteur = user?.id || 'system';
    const roleActeur = user?.role || 'system';
    let compteurResolus = 0;
    let compteurFusionnes = 0;
    let compteurObsoletes = 0;
    let compteurAggraves = 0;
    let compteurAmeliores = 0;
    let compteurNouveaux = 0;

    try {
      for (const [ecartId, actionData] of Object.entries(ecartActions)) {
        const ecart = ecarts.find(e => e.id === ecartId);
        if (!ecart) continue;

        switch (actionData.action) {
          case 'résolu':
            await updateEcart(ecartId, {
              statut: 'cloture',
              cloture_le: now,
              motif_cloture: 'resolu_reconciliation',
              updated_at: now,
            });
            addHistoriqueEntry(ecartId, {
              type: 'reconciliation',
              date: now,
              acteur,
              role_acteur: roleActeur,
              description: 'Écart résolu lors de la réconciliation',
            });
            compteurResolus++;
            break;

          case 'obsolète':
            await updateEcart(ecartId, {
              statut: 'cloture',
              cloture_le: now,
              motif_cloture: 'obsolete',
              updated_at: now,
            });
            addHistoriqueEntry(ecartId, {
              type: 'reconciliation',
              date: now,
              acteur,
              role_acteur: roleActeur,
              description: 'Écart déclaré obsolète lors de la réconciliation',
            });
            compteurObsoletes++;
            break;

          case 'fusionné':
            const fusionTargetId = actionData.fusionneVersId;
            const fusionTargetItem = fusionTargetId ? itemsNSNV.find(i => i.id === fusionTargetId) : null;
            const fusionTargetRef = fusionTargetItem
              ? `REC-${surveillanceId.slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`
              : 'Nouvel écart issu des NS/NV';
            await updateEcart(ecartId, {
              statut: 'cloture',
              cloture_le: now,
              motif_cloture: 'fusionne',
              fusionne_vers_id: fusionTargetId,
              updated_at: now,
            });
            addHistoriqueEntry(ecartId, {
              type: 'reconciliation',
              date: now,
              acteur,
              role_acteur: roleActeur,
              description: `Écart fusionné → ${fusionTargetRef}`,
              details: { fusionne_vers_id: fusionTargetId, fusion_ne_ref: fusionTargetRef },
            });
            compteurFusionnes++;
            break;

          case 'aggravé':
            if (actionData.nouveauNiveau) {
              await updateEcart(ecartId, {
                niveau_risque: actionData.nouveauNiveau as any,
                updated_at: now,
              });
              addHistoriqueEntry(ecartId, {
                type: 'reconciliation',
                date: now,
                acteur,
                role_acteur: roleActeur,
                description: `Niveau de risque aggravé → ${getNiveauLabel(actionData.nouveauNiveau)}`,
                details: { niveau_precedent: ecart.niveau_risque, nouveau_niveau: actionData.nouveauNiveau },
              });
              compteurAggraves++;
            }
            break;

          case 'amélioré':
            if (actionData.nouveauNiveau) {
              await updateEcart(ecartId, {
                niveau_risque: actionData.nouveauNiveau as any,
                updated_at: now,
              });
              addHistoriqueEntry(ecartId, {
                type: 'reconciliation',
                date: now,
                acteur,
                role_acteur: roleActeur,
                description: `Niveau de risque amélioré → ${getNiveauLabel(actionData.nouveauNiveau)}`,
                details: { niveau_precedent: ecart.niveau_risque, nouveau_niveau: actionData.nouveauNiveau },
              });
              compteurAmeliores++;
            }
            break;
        }
      }

      // Créer les nouveaux écarts issus des NS/NV
      for (const itemId of nouveauxEcarts) {
        const item = itemsNSNV.find(i => i.id === itemId);
        if (!item) continue;
        const newRef = `REC-${surveillanceId.slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`;
        // Vérifier si cet item est la cible d'une fusion
        const fusionDepuisId = Object.entries(ecartActions)
          .filter(([, a]) => a.action === 'fusionné' && a.fusionneVersId === itemId)
          .map(([id]) => id)[0];
        await addEcart({
          id: crypto.randomUUID(),
          aerodrome_id: aerodromeId || '',
          surveillance_id: surveillanceId,
          domaine: item.domaine || 'Général',
          reference: newRef,
          ref_reglementaire: '',
          libelle: item.description || `Non-conformité détectée : ${item.description}`,
          niveau_risque: item.resultat === 'NS' ? 'critique' : 'moyen',
          statut: 'pac_attendu',
          delai_pac: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          delai_regularisation: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
          inspecteur_ref_id: user?.id || '',
          fusion_depuis_id: fusionDepuisId || undefined,
          created_at: now,
          updated_at: now,
        } as any);
        compteurNouveaux++;
      }

      // ── Basculer tous les écarts actifs des anciennes surveillances vers N+1 ──
      // Principe : N+1 devient la référence unique. Tout écart actif d'une surveillance
      // antérieure est transféré (PAC, preuves, historique préservés).
      let archiveMessage = '';
      let compteurTransferes = 0;
      for (const ecart of aerodromeEcarts) {
        if (ecart.surveillance_id && ecart.surveillance_id !== surveillanceId && ecart.statut !== 'cloture') {
          const action = ecartActions[ecart.id];
          if (action && (action.action === 'résolu' || action.action === 'obsolète' || action.action === 'fusionné')) {
            continue;
          }
          await updateEcart(ecart.id, { surveillance_id: surveillanceId, updated_at: now });
          addHistoriqueEntry(ecart.id, {
            type: 'reconciliation', date: now, acteur, role_acteur: roleActeur,
            description: 'Écart transféré vers la nouvelle surveillance (bascule N→N+1)',
          });
          compteurTransferes++;
        }
      }

      // ── Archiver la surveillance N (la plus récente transmise du même aérodrome) ──
      if (previousSurveillance) {
        await updateSurveillance(previousSurveillance.id, { statut: 'archivee' } as any);

        // Créer l'entrée dans le registre (timeline complète du cycle de vie + archivage)
        const previousAerodrome = aerodromes.find(a => a.id === previousSurveillance.aerodrome_id);
        const entryData = registreUtils.toRegistreEntryFromSurveillance(previousSurveillance, previousAerodrome);
        addRegistreEntry({
          id: crypto.randomUUID(),
          ...entryData,
          timeline: [
            ...(entryData.timeline || []),
            {
              id: crypto.randomUUID(), etape: 'Archivée automatiquement',
              date: now, acteur: user?.prenom + ' ' + user?.nom || 'Système',
              acteur_role: 'inspecteur',
              details: 'Surveillance archivée lors de la réconciliation de la surveillance suivante',
            },
          ],
          created_at: now,
        });

        // Mettre à jour le planning lié
        if (previousSurveillance.planning_id) {
          updatePlanning(previousSurveillance.planning_id, { statut: 'realisee' } as any);
        }

        archiveMessage = `. Surveillance ${previousSurveillance.type.replace(/_/g, ' ')} archivée`;
      }

      if (compteurTransferes > 0) {
        archiveMessage += `, ${compteurTransferes} écart(s) actif(s) basculé(s) vers N+1`;
      }

      // Marquer la surveillance comme réconciliée
      updateSurveillance(surveillanceId, { statut: 'ecarts_signes' } as any);

      // Notification de succès
      const parties: string[] = [];
      if (compteurResolus > 0) parties.push(`${compteurResolus} résolu(s)`);
      if (compteurFusionnes > 0) parties.push(`${compteurFusionnes} fusionné(s)`);
      if (compteurObsoletes > 0) parties.push(`${compteurObsoletes} obsolète(s)`);
      if (compteurAggraves > 0) parties.push(`${compteurAggraves} aggravé(s)`);
      if (compteurAmeliores > 0) parties.push(`${compteurAmeliores} amélioré(s)`);
      if (compteurNouveaux > 0) parties.push(`${compteurNouveaux} nouveau(x) écart(s)`);

      addNotification({
        user_id: user?.id || '', type: 'success' as const,
        title: 'Réconciliation appliquée',
        message: parties.join(', ') + '.' + archiveMessage + ' Les exploitants sont notifiés.',
        canal: 'in_app' as const,
      });

      setValidated(true);
      setTimeout(() => router.push(`/surveillance/${surveillanceId}`), 1500);
    } catch (err) {
      addNotification({
        user_id: user?.id || '', type: 'danger' as const,
        title: 'Erreur de réconciliation',
        message: `Une erreur est survenue : ${err instanceof Error ? err.message : String(err)}`,
        canal: 'in_app' as const,
      });
    }
  };

  if (!surveillance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-danger" />
          </div>
          <p className="text-lg font-medium text-foreground mb-2">Surveillance non trouvée</p>
          <button onClick={() => router.push('/')} className="btn btn-primary">Retour à la liste</button>
        </div>
      </div>
    );
  }

  const hasSGS = (surveillance.portee || []).includes('SGS');
  const isSgsOnly = (surveillance.portee || []).length === 1 && hasSGS;

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role} data-module="reconciliation">
      {/* Header sticky */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => onBack ? onBack() : router.push(`/surveillance/${surveillanceId}`)}
                className="btn btn-secondary btn-sm gap-2">
                <ArrowLeft className="w-4 h-4" /> Retour
              </button>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center">
                  <Merge className="w-4 h-4 text-role-primary" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground">
                    Réconciliation — {aerodrome?.code_oaci} {aerodrome?.nom}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {surveillance.type} • {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge outline text-[10px]">{aerodromeEcarts.length} écart(s) aérodrome</span>
              <button onClick={() => setShowSynthesis(!showSynthesis)}
                className="btn btn-sm btn-primary gap-1.5">
                <Target className="w-3.5 h-3.5" /> Synthèse
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-5 space-y-5">
        {/* Cartes info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card border-l-4 border-l-primary">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Aérodrome</p>
              </div>
              <p className="font-bold text-sm">{aerodrome?.code_oaci} — {aerodrome?.nom}</p>
            </div>
          </div>
          <div className="card border-l-4 border-l-primary">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <ClipboardList className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Items NS/NV</p>
              </div>
              <p className="font-bold text-sm">{itemsNSNV.length} détecté(s)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Checklists standard{hasSGS ? ' + SGS' : ''}</p>
            </div>
          </div>
          <div className="card border-l-4 border-l-warning">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-warning" />
                <p className="text-xs text-muted-foreground font-medium">Écarts ouverts</p>
              </div>
              <p className="font-bold text-sm text-warning">
                {aerodromeEcarts.filter(e => e.statut !== 'cloture').length}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Sur {aerodromeEcarts.length} total</p>
            </div>
          </div>
          <div className="card border-l-4 border-l-success">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <p className="text-xs text-muted-foreground font-medium">Actions</p>
              </div>
              <p className="font-bold text-sm text-success">{reconciliationStats.totalActions + reconciliationStats.nouveaux}</p>
              <p className="text-xs text-muted-foreground mt-0.5">dont {reconciliationStats.nouveaux} nouveau(x)</p>
            </div>
          </div>
        </div>

        {/* Section 1 — Écarts existants */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-role-primary" />
              <h2 className="text-sm font-bold text-foreground">
                Écarts existants — Aérodrome {aerodrome?.code_oaci}
              </h2>
              <span className="badge outline text-[10px]">{aerodromeEcarts.length} total</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {Object.keys(ecartActions).length} traité(s)
              </span>
              <button onClick={() => router.push(`/surveillance/${surveillanceId}/ecarts`)}
                className="btn btn-sm btn-secondary gap-1 text-[10px]">
                <FileSignature className="w-3 h-3" /> Rédaction directe
              </button>
            </div>
          </div>

          {aerodromeEcarts.length === 0 ? (
            <div className="card p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">Aucun écart existant</p>
              <p className="text-xs text-muted-foreground mt-1">Tous les écarts de cet aérodrome sont clôturés.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/20 border-b border-border">
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Réf.</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Source</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Niveau</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Statut</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Libellé</th>
                    <th className="px-3 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {aerodromeEcarts.map((ecart) => {
                    const source = getEcartSource(ecart, surveillances);
                    const annee = getEcartAnnee(ecart);
                    const statutBadge = getStatutBadge(ecart.statut || 'ouvert', ecart.motif_cloture);
                    const currentAction = ecartActions[ecart.id]?.action;
                    const niveau = ecart.niveau_risque || 'moyen';
                    return (
                      <tr key={ecart.id} className={`hover:bg-muted/10 transition-colors ${currentAction && currentAction !== 'inchangé' ? 'bg-primary/5' : ''}`}>
                        <td className="px-3 py-2 font-mono text-[11px] font-medium">{ecart.reference || '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <source.config.icon className="w-3 h-3" />
                            <span className={`${source.config.badge} text-[9px] py-0`}>{source.config.label} {annee}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${getRiskLevelBgColor(niveau)}`}>
                            {getNiveauLabel(niveau)}
                          </span>
                          {ecart.cellule_risque_oaci && /^[1-5][A-E]$/.test(ecart.cellule_risque_oaci) && (
                            <span className={`inline-flex items-center justify-center rounded font-bold text-[8px] px-1 py-0.5 font-mono ml-1 ${getCellColor(ecart.cellule_risque_oaci)}`}>
                              {ecart.cellule_risque_oaci}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`${statutBadge.cls} text-[9px] py-0`}>{statutBadge.label}</span>
                        </td>
                        <td className="px-3 py-2 max-w-[220px]">
                          <p className="truncate text-[11px] text-muted-foreground" title={ecart.libelle}>{ecart.libelle}</p>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <select
                            value={currentAction || ''}
                            onChange={e => setEcartAction(ecart.id, e.target.value)}
                            className="h-7 text-[10px] px-1.5 rounded border border-border bg-background cursor-pointer min-w-[100px]"
                          >
                            <option value="">— Choisir —</option>
                            {ACTION_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          {currentAction === 'aggravé' && (
                            <div className="mt-1">
                              <select
                                value={ecartActions[ecart.id]?.nouveauNiveau || ''}
                                onChange={e => setEcartActions(prev => ({ ...prev, [ecart.id]: { ...prev[ecart.id], nouveauNiveau: e.target.value } }))}
                                className="h-6 text-[9px] px-1 rounded border border-danger/30 bg-danger/5 cursor-pointer"
                              >
                                <option value="">Nouveau niveau</option>
                                {niveau !== 'critique' && <option value="critique">→ Critique</option>}
                                {niveau !== 'critique' && niveau !== 'eleve' && <option value="eleve">→ Élevé</option>}
                                {niveau !== 'critique' && niveau !== 'eleve' && niveau !== 'moyen' && <option value="moyen">→ Moyen</option>}
                                <option value="faible">→ Faible</option>
                              </select>
                            </div>
                          )}
                          {currentAction === 'fusionné' && (
                            <div className="mt-1">
                              <select
                                value={ecartActions[ecart.id]?.fusionneVersId || ''}
                                onChange={e => setEcartActions(prev => ({ ...prev, [ecart.id]: { ...prev[ecart.id], fusionneVersId: e.target.value } }))}
                                className="h-6 text-[9px] px-1 rounded border border-primary/30 bg-primary/5 cursor-pointer max-w-[180px]"
                              >
                                <option value="">NS/NV de destination</option>
                                {itemsNSNV.map(item => (
                                  <option key={item.id} value={item.id}>{item.numero} — {item.description.substring(0, 50)}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 2 — Résultats des checklists */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-role-primary" />
            <h2 className="text-sm font-bold text-foreground">Résultats des checklists — Surveillance en cours</h2>
            <span className="badge outline text-[10px]">{itemsNSNV.length} NS/NV</span>
          </div>

          {/* Carte : Items NS/NV */}
          {itemsNSNV.length === 0 ? (
            <div className="card p-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">Aucun NS/NV détecté</p>
              <p className="text-xs text-muted-foreground">Tous les points de la checklist sont satisfaisants.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/20 border-b border-border">
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-12">#</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Description</th>
                    <th className="px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">Domaine</th>
                    <th className="px-3 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-20">Résultat</th>
                    <th className="px-3 py-2 text-center font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-40">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {itemsNSNV.map((item) => {
                    const estNouveau = nouveauxEcarts.includes(item.id);
                    const estIgnore = ignoresNSNV.includes(item.id);
                    return (
                      <tr key={item.id} className={`hover:bg-muted/10 transition-colors ${estNouveau ? 'bg-success/5' : estIgnore ? 'bg-muted/20' : ''}`}>
                        <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{item.numero}</td>
                        <td className="px-3 py-2 text-[11px]">{item.description}</td>
                        <td className="px-3 py-2">
                          <span className="badge outline text-[9px]">{item.sousDomaine || item.domaine}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {item.resultat === 'NS' ? (
                            <span className="badge danger text-[9px]">NS</span>
                          ) : (
                            <span className="badge warning text-[9px]">NV</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {estIgnore ? (
                            <span className="text-[10px] text-muted-foreground italic">Ignoré</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => toggleNouvelEcart(item.id)}
                                className={`btn btn-xs gap-1 ${estNouveau ? 'btn-success' : 'btn-secondary'}`}>
                                <FileText className="w-3 h-3" />
                                {estNouveau ? 'Créer écart' : 'Créer écart'}
                              </button>
                              <button onClick={() => toggleIgnoreNSNV(item.id)}
                                className="action-button hover:text-muted-foreground" title="Ignorer">
                                <X className="w-3 h-3" />
                              </button>
                              {/* Suggestion IA de doublon */}
                              {(() => {
                                const match = aerodromeEcarts.find(e =>
                                  e.libelle?.toLowerCase().includes(item.description.slice(0, 20).toLowerCase())
                                );
                                if (match) return (
                                  <span className="text-[8px] text-primary flex items-center gap-0.5 ml-1" title={`Similaire à ${match.reference}`}>
                                    <Sparkles className="w-2.5 h-2.5" /> fusion ?
                                  </span>
                                );
                                return null;
                              })()}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Section 3 — Synthèse (panneau coulissant) */}
        {showSynthesis && (
          <div className="card bg-role-primary-soft border-2 border-role-primary/20 transition-all">
            <div className="card-content p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-role-primary" />
                  <h3 className="text-sm font-bold text-foreground">Synthèse de la réconciliation</h3>
                </div>
                <button onClick={() => setShowSynthesis(false)} className="action-button">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <div className="card bg-success/10 border border-success/30 text-center p-2">
                  <CheckCircle2 className="w-5 h-5 text-success mx-auto mb-1" />
                  <p className="text-lg font-bold text-success">{reconciliationStats.resolus}</p>
                  <p className="text-[10px] text-muted-foreground">Résolus</p>
                </div>
                <div className="card bg-neutral/10 border border-neutral/30 text-center p-2">
                  <Archive className="w-5 h-5 text-neutral mx-auto mb-1" />
                  <p className="text-lg font-bold text-neutral">{reconciliationStats.obsoletes}</p>
                  <p className="text-[10px] text-muted-foreground">Obsolètes</p>
                </div>
                <div className="card bg-danger/10 border border-danger/30 text-center p-2">
                  <ArrowUp className="w-5 h-5 text-danger mx-auto mb-1" />
                  <p className="text-lg font-bold text-danger">{reconciliationStats.agreges}</p>
                  <p className="text-[10px] text-muted-foreground">Aggravés</p>
                </div>
                <div className="card bg-success/10 border border-success/30 text-center p-2">
                  <ArrowDown className="w-5 h-5 text-success mx-auto mb-1" />
                  <p className="text-lg font-bold text-success">{reconciliationStats.resumes}</p>
                  <p className="text-[10px] text-muted-foreground">Améliorés</p>
                </div>
                <div className="card bg-primary/10 border border-primary/30 text-center p-2">
                  <Merge className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-primary">{reconciliationStats.fusionnes}</p>
                  <p className="text-[10px] text-muted-foreground">Fusionnés</p>
                </div>
                <div className="card bg-primary/10 border border-primary/30 text-center p-2">
                  <FileText className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-primary">{reconciliationStats.nouveaux}</p>
                  <p className="text-[10px] text-muted-foreground">Nouveaux écarts</p>
                </div>
              </div>

              {/* Détail des actions */}
              <div className="space-y-1 text-xs">
                {Object.entries(ecartActions).map(([ecartId, act]) => {
                  const ecart = aerodromeEcarts.find(e => e.id === ecartId);
                  if (!ecart) return null;
                  return (
                    <div key={ecartId} className="flex items-center gap-2 py-1 px-2 rounded bg-background">
                      <span className="font-mono text-[10px] font-medium">{ecart.reference}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{ACTION_OPTIONS.find(o => o.value === act.action)?.label || act.action}</span>
                      {act.nouveauNiveau && <span className="badge danger text-[9px]">Niveau : {getNiveauLabel(act.nouveauNiveau)}</span>}
                    </div>
                  );
                })}
                {nouveauxEcarts.map(id => {
                  const item = itemsNSNV.find(i => i.id === id);
                  if (!item) return null;
                  return (
                    <div key={id} className="flex items-center gap-2 py-1 px-2 rounded bg-background">
                      <FileText className="w-3 h-3 text-success" />
                      <span className="font-mono text-[10px]">{item.numero}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium text-success">Nouvel écart à créer</span>
                      <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{item.description}</span>
                    </div>
                  );
                })}
                {(Object.keys(ecartActions).length === 0 && nouveauxEcarts.length === 0) && (
                  <p className="text-[11px] text-muted-foreground text-center py-2">
                    Aucune action définie pour le moment. Utilisez les tableaux ci-dessus pour réconcilier les écarts.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between py-4 border-t border-border">
          <div className="flex items-center gap-2">
            <button onClick={() => onBack ? onBack() : router.push(`/surveillance/${surveillanceId}`)}
              className="btn btn-secondary gap-2">
              <ArrowLeft className="w-4 h-4" /> Annuler
            </button>
            <button onClick={() => router.push(`/surveillance/${surveillanceId}/ecarts`)}
              className="btn btn-secondary gap-1 text-xs">
              <FileSignature className="w-3 h-3" /> Passer à la rédaction directe
            </button>
          </div>
          <button onClick={handleValidate}
            disabled={Object.keys(ecartActions).length === 0 && nouveauxEcarts.length === 0}
            className={`btn gap-2 ${validated ? 'btn-success' : 'btn-primary'}`}>
            {validated ? (
              <><CheckCircle2 className="w-4 h-4" /> Réconciliation validée</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Valider la réconciliation</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
