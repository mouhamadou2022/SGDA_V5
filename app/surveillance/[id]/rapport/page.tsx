'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import SurveillanceRapport from '@/components/modules/surveillance/SurveillanceRapport';
import { canEditSurveillanceContent } from '@/lib/config';
import { ArrowLeft, FileText, Wifi, WifiOff, FileDown, Eye, CheckCircle2, AlertTriangle, ClipboardList } from 'lucide-react';

export default function RapportPage() {
  const params = useParams();
  const router = useRouter();
  const surveillanceId = params.id as string;

  const surveillances = useAppStore(s => s.surveillances)
  const aerodromes = useAppStore(s => s.aerodromes)
  const user = useAppStore(s => s.user)
  const ecarts = useAppStore(s => s.ecarts)
  const updateSurveillance = useAppStore(s => s.updateSurveillance);

  // ── data-role sur body pour les variables CSS de rôle (btn-primary, bg-role-gradient…) ──
  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);
  const ecartsData = ecarts.filter(e => e.surveillance_id === surveillanceId);
  const isSigned = surveillance?.statut === 'rapport_signe'
    || surveillance?.statut === 'lettre_signee'
    || surveillance?.statut === 'transmise'
    || surveillance?.statut === 'archivee';

  if (!surveillance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <FileText className="w-10 h-10 text-danger" />
          </div>
          <p className="text-lg font-medium text-foreground mb-2">Surveillance non trouvée</p>
          <button onClick={() => router.push('/')} className="btn btn-primary">
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  const isCharged = surveillance.rapport_type === 'charge' && !!surveillance.rapport_fichier_url;

  const handleSave = (contenu: string) => {
    updateSurveillance(surveillanceId, { rapport_html: contenu });
  };

  const handleSigner = (signatureUrl: string) => {
    router.push(`/surveillance/${surveillanceId}`);
  };

  const estPDF = surveillance.rapport_fichier_url?.startsWith('data:application/pdf');
  const estImage = surveillance.rapport_fichier_url?.startsWith('data:image/');

  // ── Encart d'avancement : étapes du workflow, écarts rédigés, preuves manquantes, verification_report ──
  const etapes = [
    { cle: 'checklist', label: 'Checklist évaluée', ok: !!surveillance.checklist_hierarchy?.length },
    { cle: 'ecarts', label: 'Écarts rédigés', ok: ecartsData.length > 0 },
    { cle: 'rapport', label: 'Rapport rédigé', ok: !!surveillance.rapport_html || isCharged },
  ];
  const etapesFaites = etapes.filter(e => e.ok).length;
  const etapesRestantes = etapes.filter(e => !e.ok);

  // Items de la checklist avec résultat renseigné (hors observation éventuelle)
  const itemsRenseignes = (surveillance.checklist_hierarchy || []).flatMap(d => [
    ...(d.items || []),
    ...(d.sousDomaines || []).flatMap(sd => [
      ...(sd.items || []),
      ...(sd.sousSousDomaines || []).flatMap(ssd => ssd.items || []),
    ]),
  ]);
  const itemsSansPreuve = itemsRenseignes.filter(i => (i.resultat === 'NS' || i.resultat === 'NV') && (!i.fichiers || i.fichiers.length === 0));
  const verification = surveillance.verification_report;

  return (
    <div className="min-h-screen bg-gray-50" data-role={user?.role} data-module="rapport">
      {/* Header */}
      <div className="bg-white border-b border-border sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/surveillance/${surveillanceId}`)}
                className="btn btn-secondary btn-sm gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center">
                  <FileText className="w-5 h-5 text-role-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">
                    Rapport de surveillance — {aerodrome?.code_oaci} {aerodrome?.nom}
                  </h1>
                  <p className="text-xs text-muted-foreground">
                    {surveillance.type?.replace(/_/g, ' ')} | {new Date(surveillance.date_debut).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isCharged && (
                <span className="badge success pulse flex items-center gap-1">
                  <FileDown className="w-3 h-3" />
                  Rapport chargé
                </span>
              )}
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

      {/* Contenu — plein écran avec espacement latéral */}
      <div className="px-6 py-6">
        {/* Encart d'avancement */}
        <div className="mb-4 card border-l-4 border-l-role-primary">
          <div className="card-header flex items-center justify-between flex-wrap gap-2">
            <div className="card-title text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-role-primary" />
              Avancement de la mission
            </div>
            <span className={`badge ${etapesFaites === etapes.length ? 'success' : 'warning'}`}>
              {etapesFaites}/{etapes.length} étapes
            </span>
          </div>
          <div className="card-content p-4 space-y-3">
            {etapesRestantes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {etapesRestantes.length} étape{etapesRestantes.length > 1 ? 's' : ''} restante{etapesRestantes.length > 1 ? 's' : ''} :{' '}
                {etapesRestantes.map(e => e.label).join(', ')}
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {etapes.map(e => (
                <div key={e.cle} className={`flex items-center gap-2 text-xs p-2 rounded-lg border ${e.ok ? 'border-success/40 bg-success/10' : 'border-border bg-muted/30'}`}>
                  {e.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />}
                  <span className={`font-medium ${e.ok ? 'text-success' : 'text-muted-foreground'}`}>{e.label}</span>
                  {!e.ok && <span className="ml-auto text-[9px] text-muted-foreground">restante</span>}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">Écarts rédigés</p>
                <p className="text-lg font-bold text-foreground">{ecartsData.length}</p>
              </div>
              <div className="p-3 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">Points NS/NV sans preuve</p>
                <p className={`text-lg font-bold ${itemsSansPreuve.length > 0 ? 'text-danger' : 'text-success'}`}>{itemsSansPreuve.length}</p>
              </div>
              <div className="p-3 rounded-lg border border-border">
                <p className="text-xs text-muted-foreground">Items renseignés</p>
                <p className="text-lg font-bold text-foreground">{itemsRenseignes.length}</p>
              </div>
            </div>

            {/* Rapport de vérification documentaire (couverture) */}
            {verification ? (
              <div className={`p-3 rounded-lg border ${verification.scoreCouverture >= 80 ? 'border-success/40 bg-success/10' : 'border-warning/40 bg-warning/10'}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-role-primary" />
                    Vérification documentaire — couverture {verification.scoreCouverture}%
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(verification.dateVerification).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <p className="text-xs text-foreground mt-1.5">{verification.synthese}</p>
                {verification.documents.some(d => d.aEvolue) && (
                  <p className="text-xs text-warning mt-1.5">
                    ⚠ {verification.documents.filter(d => d.aEvolue).length} document(s) ont évolué depuis la génération — une régénération de la checklist est recommandée.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {isCharged ? (
          <div className="space-y-4">
            <div className="card">
              <div className="card-header pb-2 flex items-center justify-between">
                <div className="card-title text-sm font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4 text-role-primary" />
                  Rapport chargé — {surveillance.rapport_fichier_nom || 'fichier'}
                </div>
                <a
                  href={surveillance.rapport_fichier_url}
                  download={surveillance.rapport_fichier_nom || 'rapport'}
                  className="btn btn-sm btn-primary gap-1.5"
                >
                  <FileDown className="h-4 w-4" />
                  Télécharger
                </a>
              </div>
              <div className="card-content p-0">
                {estPDF ? (
                  <iframe
                    src={surveillance.rapport_fichier_url}
                    className="w-full h-[80vh] rounded-b-xl"
                    title="Rapport de surveillance"
                  />
                ) : estImage ? (
                  <div className="p-4 flex justify-center bg-accent/30">
                    <img
                      src={surveillance.rapport_fichier_url}
                      alt="Rapport de surveillance"
                      className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-md"
                    />
                  </div>
                ) : (
                  <div className="p-12 text-center text-muted">
                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="font-medium">Aperçu non disponible</p>
                    <p className="text-sm mt-1">Téléchargez le fichier pour le consulter.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <SurveillanceRapport
            surveillanceId={surveillanceId}
            onSave={handleSave}
            onSigner={handleSigner}
            readOnly={isSigned || !canEditSurveillanceContent(surveillance.chef_id, surveillance.equipe_ids || [], user?.id)}
            userRole={user?.role || 'inspector'}
          />
        )}
      </div>
    </div>
  );
}
