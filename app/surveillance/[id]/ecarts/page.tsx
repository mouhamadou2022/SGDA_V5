'use client';

import React, { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { upsertEcartsRedaction } from '@/lib/datastore';
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
} from 'lucide-react';

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

function getNiveauRisqueBadge(niveau: string): string {
  switch (niveau) {
    case 'critique': return 'badge danger';
    case 'eleve': return 'badge warning';
    case 'moyen': return 'badge primary';
    case 'faible': return 'badge success';
    default: return 'badge neutral';
  }
}

export default function EcartsPage() {
  const params = useParams();
  const router = useRouter();
  const surveillanceId = params.id as string;

  const surveillances = useAppStore(s => s.surveillances)
  const aerodromes = useAppStore(s => s.aerodromes)
  const user = useAppStore(s => s.user)
  const getItemsNSNVFromHierarchy = useAppStore(s => s.getItemsNSNVFromHierarchy)
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

  const itemsNSNV = useMemo<QuestionNSNV[]>(() => {
    const raw = getItemsNSNVFromHierarchy(surveillanceId) as any[];
    return raw.map(item => ({
      id: item.id,
      numero: item.reference_ras14 || item.categorie || item.id,
      reference_reglementaire: item.reference_ras14 || '',
      description: item.description || '',
      domaine: item.domaine || '',
      sousDomaine: item.sousDomaine || '',
      sousSousDomaine: item.sousSousDomaine || '',
      resultat: item.resultat as 'NS' | 'NV',
    }));
  }, [surveillanceId, getItemsNSNVFromHierarchy]);

  const surveillanceEcarts = useMemo<EcartRedaction[]>(() => getEcartsBySurveillance(surveillanceId), [surveillanceId, getEcartsBySurveillance]);

  const setEcartsRedaction = useAppStore(s => s.setEcartsRedaction);
  const allEcartsRedaction = useAppStore(s => s.ecartsRedaction);

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

  const statsNS = useMemo(() => itemsNSNV.filter(i => i.resultat === 'NS').length, [itemsNSNV]);
  const statsNV = useMemo(() => itemsNSNV.filter(i => i.resultat === 'NV').length, [itemsNSNV]);
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

  const handleEcartsSignes = () => {
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
                  {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}
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
              <div className="flex -space-x-2 mb-1">
                {(surveillance.equipe_ids || []).map((id: string) => (
                  <div key={id} className="w-7 h-7 rounded-full bg-role-gradient flex items-center justify-center text-white text-[10px] font-bold border-2 border-white">
                    {id.slice(-2).toUpperCase()}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{(surveillance.equipe_ids || []).length} inspecteur(s)</p>
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

        {/* Stats NS/NV + Écarts existants */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Écarts rédigés */}
          <div className="card bg-success/5 border-success/30">
            <div className="card-content p-4 text-center">
              <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-2xl font-bold text-success">{surveillanceEcarts.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Écarts rédigés</p>
              {surveillanceEcarts.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center mt-2">
                  {surveillanceEcarts.slice(0, 3).map((e) => (
                    <span key={e.id} className={`badge ${getNiveauRisqueBadge(e.niveau)} text-[10px]`}>
                      {e.reference}
                    </span>
                  ))}
                  {surveillanceEcarts.length > 3 && (
                    <span className="badge outline text-[10px]">+{surveillanceEcarts.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* Composant de rédaction */}
        <SurveillanceEcartsRedaction
          surveillanceId={surveillanceId}
          aerodromeId={surveillance.aerodrome_id}
          itemsNSNV={itemsNSNV}
          ecartsExistants={surveillanceEcarts}
          onSave={handleSaveEcarts}
          onSigner={handleEcartsSignes}
          userRole={user?.role || 'inspector'}
        />
      </div>
    </div>
  );
}
