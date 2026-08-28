'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { upsertEcartsRedaction, fetchEcartsRedactionBySurveillance } from '@/lib/datastore';
import { canEditSurveillanceContent } from '@/lib/config';
import { getSurveillanceEquipeIds, getSurveillanceChefId } from '@/lib/surveillanceTeam';
import SurveillanceEcartsRedaction, { QuestionNSNV, EcartRedaction } from '@/components/modules/surveillance/SurveillanceEcartsRedaction';
import {
  ArrowLeft,
  AlertTriangle,
  Wifi,
  WifiOff,
  MapPin,
  Eye,
  Calendar,
  Users,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  ChevronRight,
  FolderTree,
} from 'lucide-react';

/** Niveaux PAOE par ordre de gravité décroissante (absent = pire) */
function getConformiteColor(taux: number): string {
  if (taux >= 80) return 'text-success';
  if (taux >= 60) return 'text-primary';
  if (taux >= 40) return 'text-warning';
  return 'text-danger';
}

function getProgressBarColor(taux: number): string {
  if (taux >= 80) return 'bg-success';
  if (taux >= 60) return 'bg-primary';
  if (taux >= 40) return 'bg-warning';
  return 'bg-danger';
}

export default function EcartsPage() {
  const params = useParams();
  const router = useRouter();
  const surveillanceId = params.id as string;

  const surveillances = useAppStore(s => s.surveillances)
  const aerodromes = useAppStore(s => s.aerodromes)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const plannings = useAppStore(s => s.plannings)
  const user = useAppStore(s => s.user)
  const getItemsNSNVFromHierarchy = useAppStore(s => s.getItemsNSNVFromHierarchy)
  const getChecklistItemsFromHierarchy = useAppStore(s => s.getChecklistItemsFromHierarchy)
  const getEcartsBySurveillance = useAppStore(s => s.getEcartsBySurveillance);

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);

  const equipe = useMemo(() => {
    if (!surveillance) return [];
    const ids = getSurveillanceEquipeIds(surveillance, plannings);
    return utilisateurs.filter(u => ids.includes(u.id));
  }, [surveillance, utilisateurs, plannings]);

  const chefDeMission = useMemo(() => {
    if (!surveillance) return null;
    const chefId = getSurveillanceChefId(surveillance, plannings);
    if (!chefId) return null;
    return utilisateurs.find(u => u.id === chefId) || null;
  }, [surveillance, utilisateurs, plannings]);

  const itemsNSNV = useMemo<QuestionNSNV[]>(() => {
    const raw = getItemsNSNVFromHierarchy(surveillanceId) as any[];
    return raw
      .filter(item => item.domaine !== 'SGS')
      .map(item => ({
        id: item.id,
        numero: item.numero || item.reference_ras14 || item.categorie || item.id,
        reference_reglementaire: item.reference_ras14 || '',
        description: item.description || '',
        domaine: item.domaine || '',
        sousDomaine: item.sousDomaine || '',
        sousSousDomaine: item.sousSousDomaine || '',
        resultat: item.resultat as 'NS' | 'NV',
        observation: item.observation || '',
      }));
  }, [surveillanceId, getItemsNSNVFromHierarchy]);

  const setEcartsRedaction = useAppStore(s => s.setEcartsRedaction);
  const allEcartsRedaction = useAppStore(s => s.ecartsRedaction);

  const surveillanceEcarts = useMemo<EcartRedaction[]>(() =>
    getEcartsBySurveillance(surveillanceId).filter(e => (e as any).domaine !== 'SGS'),
    [surveillanceId, getEcartsBySurveillance, allEcartsRedaction]
  );

  const handleSaveEcarts = (ecarts: EcartRedaction[]) => {
    const otherEcarts = allEcartsRedaction.filter(e => e.surveillance_id !== surveillanceId);
    const enrichedEcarts = ecarts.map(e => ({
      ...e,
      surveillance_id: surveillanceId,
      aerodrome_id: surveillance?.aerodrome_id || '',
      created_by: e.created_by || user?.id || '',
      updated_by: user?.id || '',
    }));
    // Mise à jour store (instantanée)
    setEcartsRedaction([...otherEcarts, ...enrichedEcarts]);
    // Persistance Supabase — en arrière-plan pour survivre aux rechargements de page
    upsertEcartsRedaction(enrichedEcarts).catch(err =>
      console.error('[EcartsPage] upsertEcartsRedaction failed:', err)
    );
  };

  // Recharger les écarts rédigés depuis Supabase au chargement de la page
  // (le store Zustand démarre vide à chaque session → les brouillons étaient perdus)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const persisted = await fetchEcartsRedactionBySurveillance(surveillanceId);
        if (cancelled || persisted.length === 0) return;
        const domained = persisted.filter(e => (e as any).domaine !== 'SGS');
        if (domained.length === 0) return;
        const inStore = getEcartsBySurveillance(surveillanceId);
        const storeIds = new Set(inStore.map(e => e.id));
        const toAdd = domained.filter(e => !storeIds.has(e.id));
        if (toAdd.length > 0) {
          setEcartsRedaction([...inStore, ...toAdd]);
        }
      } catch (err) {
        console.error('[EcartsPage] chargement écarts persistant échoué:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [surveillanceId, getEcartsBySurveillance, setEcartsRedaction]);

  const statsNS = useMemo(() => itemsNSNV.filter(i => i.resultat === 'NS').length, [itemsNSNV]);
  const statsNV = useMemo(() => itemsNSNV.filter(i => i.resultat === 'NV').length, [itemsNSNV]);

  // Items complets de la checklist standard (SA/NS/NA/NV) → KPIs Satisfaisant / Non Applicable / Taux de conformité
  const checklistItemsComplets = useMemo(() => {
    const raw = getChecklistItemsFromHierarchy(surveillanceId) as any[];
    return raw.filter(item => item.domaine !== 'SGS');
  }, [surveillanceId, getChecklistItemsFromHierarchy]);

  const statsSA = useMemo(() => checklistItemsComplets.filter(i => i.resultat === 'SA').length, [checklistItemsComplets]);
  const statsNA = useMemo(() => checklistItemsComplets.filter(i => i.resultat === 'NA').length, [checklistItemsComplets]);

  const tauxConformite = useMemo(() => {
    const sa = statsSA;
    const ns = checklistItemsComplets.filter(i => i.resultat === 'NS').length;
    const verifies = sa + ns;
    return verifies > 0 ? Math.round((sa / verifies) * 100) : 0;
  }, [statsSA, checklistItemsComplets]);

  // Conformité par domaine (source : items de la checklist standard, hors SGS)
  const parDomaineConformite = useMemo(() => {
    const map = new Map<string, { sa: number; ns: number; nv: number; na: number }>();
    for (const i of checklistItemsComplets) {
      const d = i.domaine || 'Autre';
      const cur = map.get(d) || { sa: 0, ns: 0, nv: 0, na: 0 };
      if (i.resultat === 'SA') cur.sa++;
      else if (i.resultat === 'NS') cur.ns++;
      else if (i.resultat === 'NV') cur.nv++;
      else if (i.resultat === 'NA') cur.na++;
      map.set(d, cur);
    }
    return Array.from(map.entries())
      .map(([domaine, s]) => {
        const verifies = s.sa + s.ns;
        return {
          domaine,
          ...s,
          total: s.sa + s.ns + s.nv + s.na,
          taux: verifies > 0 ? Math.round((s.sa / verifies) * 100) : 0,
        };
      })
      .sort((a, b) => b.taux - a.taux);
  }, [checklistItemsComplets]);

  const itemsRedigesCount = useMemo(() => {
    const processed = new Set(surveillanceEcarts.flatMap(e => e.item_ids));
    return processed.size;
  }, [surveillanceEcarts]);
  const itemsRestants = itemsNSNV.length - itemsRedigesCount;
  const progression = itemsNSNV.length > 0 ? Math.round((itemsRedigesCount / itemsNSNV.length) * 100) : 100;

  if (!surveillance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-danger" />
          </div>
          <p className="text-lg font-medium text-foreground mb-2">Surveillance non trouvée</p>
          <button onClick={() => router.push('/')} className="btn btn-primary">
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  const hasSGS = (surveillance.portee || []).includes('SGS');
  const isSgsOnly = (surveillance.portee || []).length === 1 && hasSGS;

  const handleEcartsSignes = () => {
    // Pour une portée mixte SGS+autres, vérifier que les écarts SGS sont aussi signés
    if (hasSGS && !isSgsOnly) {
      const updated = useAppStore.getState().surveillances.find(s => s.id === surveillanceId);
      if (!updated?.sgs_ecarts_signes_le) {
        useAppStore.getState().addNotification({
          user_id: user?.id || '',
          type: 'warning' as const,
          title: 'Écarts SGS non signés',
          message: 'Vous devez d\'abord signer les écarts SGS avant de finaliser les écarts standard.',
          canal: 'in_app' as const,
        });
        return;
      }
    }
    useAppStore.getState().updateSurveillance(surveillanceId, { statut: 'ecarts_signes' });
    router.push(`/surveillance/${surveillanceId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role} data-module="ecarts-redaction">
      {/* Header sticky */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/surveillance/${surveillanceId}`)}
                className="btn btn-secondary btn-sm gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-danger/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-foreground">
                    Rédaction des écarts — {aerodrome?.code_oaci} {aerodrome?.nom}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {itemsNSNV.length} item(s) NS/NV détectés • {itemsRestants} restant(s)
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!navigator.onLine ? (
                <span className="badge warning flex items-center gap-1">
                  <WifiOff className="w-3 h-3" />
                  Hors ligne
                </span>
              ) : (
                <span className="badge success flex items-center gap-1">
                  <Wifi className="w-3 h-3" />
                  En ligne
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="container mx-auto px-6 py-5 space-y-5">
        {/* Cartes d'info surveillance */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Info Aérodrome */}
          <div className="card border-l-4 border-l-primary">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <MapPin className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Aérodrome</p>
              </div>
              <p className="font-bold text-sm">{aerodrome?.code_oaci} - {aerodrome?.nom}</p>
            </div>
          </div>

          {/* Info Surveillance */}
          <div className="card border-l-4 border-l-primary">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Type</p>
              </div>
              <p className="font-bold text-sm">{surveillance.type}</p>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')} →{' '}
                  {new Date(surveillance.date_fin).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>
          </div>

          {/* Équipe */}
          <div className="card border-l-4 border-l-primary">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-primary" />
                <p className="text-xs text-muted-foreground font-medium">Équipe</p>
              </div>
              {chefDeMission && (
                <p className="text-xs font-semibold text-foreground mb-1">
                  Chef : {chefDeMission.prenom} {chefDeMission.nom}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {equipe.map(membre => (
                  <span key={membre.id} className="badge outline text-[10px]">
                    {membre.prenom} {membre.nom}
                  </span>
                ))}
              </div>
              {equipe.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {getSurveillanceEquipeIds(surveillance, plannings).length > 0
                    ? `${getSurveillanceEquipeIds(surveillance, plannings).length} inspecteur(s) (introuvable dans la liste utilisateurs)`
                    : 'Aucun inspecteur affecté'}
                </p>
              )}
            </div>
          </div>

          {/* Progression */}
          <div className="card border-l-4 border-l-danger">
            <div className="card-content p-3">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-danger" />
                <p className="text-xs text-muted-foreground font-medium">Progression écarts</p>
              </div>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-bold ${getConformiteColor(progression)}`}>{progression}%</span>
                <Clock className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="progress h-1.5">
                <div className={`progress-bar ${getProgressBarColor(progression)}`} style={{ width: `${progression}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {itemsRedigesCount}/{itemsNSNV.length} items traités
              </p>
            </div>
          </div>
        </div>

        {/* Stats NS/NV + Écarts existants — masqué si écarts déjà signés/transmis */}
        {!['ecarts_signes', 'rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(surveillance.statut) && (
          <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Items NS */}
            <div className="card bg-danger/5 border-danger/30">
              <div className="card-content p-4 text-center">
                <XCircle className="w-8 h-8 text-danger mx-auto mb-2" />
                <p className="text-2xl font-bold text-danger">{statsNS}</p>
                <p className="text-xs text-muted-foreground mt-1">Non satisfaisant (NS)</p>
              </div>
            </div>

            {/* Items NV */}
            <div className="card bg-warning/5 border-warning/30">
              <div className="card-content p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-warning mx-auto mb-2" />
                <p className="text-2xl font-bold text-warning">{statsNV}</p>
                <p className="text-xs text-muted-foreground mt-1">Non vérifié (NV)</p>
              </div>
            </div>

            {/* Items SA */}
            <div className="card bg-success/5 border-success/30">
              <div className="card-content p-4 text-center">
                <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="text-2xl font-bold text-success">{statsSA}</p>
                <p className="text-xs text-muted-foreground mt-1">Satisfaisant (SA)</p>
              </div>
            </div>

            {/* Items NA */}
            <div className="card bg-neutral/5 border-neutral/30">
              <div className="card-content p-4 text-center">
                <Shield className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{statsNA}</p>
                <p className="text-xs text-muted-foreground mt-1">Non applicable (NA)</p>
              </div>
            </div>

            {/* Taux de conformité */}
            <div className={`card border-l-4 text-center ${getConformiteColor(tauxConformite).replace('text-', 'border-')}`}>
              <div className="card-content p-4 text-center">
                <Target className={`w-8 h-8 ${getConformiteColor(tauxConformite)} mx-auto mb-2`} />
                <p className={`text-2xl font-bold ${getConformiteColor(tauxConformite)}`}>{tauxConformite}%</p>
                <p className="text-xs text-muted-foreground mt-1">Taux de conformité</p>
                <div className="progress h-1.5 mt-2">
                  <div className={`progress-bar ${getProgressBarColor(tauxConformite)}`} style={{ width: `${tauxConformite}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Synthèse par domaine */}
          {parDomaineConformite.length > 0 && (
            <div className="card bg-success/5 border-success/30">
              <div className="card-content p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-success" />
                  <p className="text-sm font-semibold">Synthèse par domaine</p>
                  <span className="badge success text-[10px] ml-auto">{parDomaineConformite.length} domaine(s)</span>
                </div>
                <div className="space-y-2">
                  {parDomaineConformite.map((d) => (
                    <div
                      key={d.domaine}
                      className={`p-3 rounded-xl border ${d.taux >= 80 ? 'border-success/30 bg-success/5' : d.taux >= 60 ? 'border-primary/30 bg-primary/5' : d.taux >= 40 ? 'border-warning/30 bg-warning/5' : 'border-danger/30 bg-danger/5'}`}
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <FolderTree className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-semibold text-sm">{d.domaine}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-bold ${getConformiteColor(d.taux)}`}>{d.taux}%</span>
                          <span className="text-muted-foreground">
                            {d.sa} SA · {d.ns} NS · {d.nv} NV · {d.na} NA
                          </span>
                        </div>
                      </div>
                      <div className="progress h-1.5 mt-2">
                        <div className={`progress-bar ${getProgressBarColor(d.taux)}`} style={{ width: `${d.taux}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Bannière SGS pour surveillance mixte (SGS + autres domaines) */}
          {(surveillance.portee || []).includes('SGS') && (surveillance.portee || []).length > 1 && (
            <div className="alert alert-primary flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-role-primary flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Surveillance mixte — Domaine SGS inclus</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Les écarts physiques (NS/NV) sont traités ci-dessous. Les écarts SGS (PAOE) se traitent sur une page dédiée.
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push(`/surveillance/${surveillanceId}/ecarts/sgs`)}
                className="btn btn-primary btn-sm gap-1.5 flex-shrink-0"
              >
                <Shield className="w-4 h-4" />
                Écarts SGS
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
          </>
        )}

        {/* Composant de rédaction */}
        <SurveillanceEcartsRedaction
          surveillanceId={surveillanceId}
          aerodromeId={surveillance.aerodrome_id}
          itemsNSNV={itemsNSNV}
          ecartsExistants={surveillanceEcarts}
          onSave={handleSaveEcarts}
          onSigner={handleEcartsSignes}
          userRole={user?.role || 'inspector'}
          surveillanceType={surveillance?.type}
          aerodromeCode={aerodrome?.code_oaci}
          ecartPrefix="SDT"
          readOnly={['ecarts_signes', 'rapport_signe', 'lettre_signee', 'transmise', 'archivee'].includes(surveillance.statut) || !canEditSurveillanceContent(surveillance.chef_id, surveillance.equipe_ids || [], user?.id)}
        />
      </div>
    </div>
  );
}
