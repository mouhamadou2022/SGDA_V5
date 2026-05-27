'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import SurveillanceRapport from '@/components/modules/surveillance/SurveillanceRapport';
import { ArrowLeft, FileText, Wifi, WifiOff, FileDown, Eye } from 'lucide-react';

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
          <button onClick={() => router.push('/surveillance')} className="btn btn-primary">
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
            readOnly={isSigned}
            userRole={user?.role || 'inspector'}
          />
        )}
      </div>
    </div>
  );
}
