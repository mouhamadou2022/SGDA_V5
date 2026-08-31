'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import SurveillanceRapport from '@/components/modules/surveillance/SurveillanceRapport';
import { canEditSurveillanceContent } from '@/lib/config';
import { importRapportFromFile } from '@/lib/services/rapportImportService';
import {
  ArrowLeft,
  FileText,
  Wifi,
  WifiOff,
  FileDown,
  Eye,
  Sparkles,
  Upload,
  Loader2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export default function RapportPage() {
  const params = useParams();
  const router = useRouter();
  const surveillanceId = params.id as string;

  const surveillances = useAppStore(s => s.surveillances)
  const aerodromes = useAppStore(s => s.aerodromes)
  const user = useAppStore(s => s.user)
  const ecarts = useAppStore(s => s.ecarts)
  const updateSurveillance = useAppStore(s => s.updateSurveillance);
  const addNotification = useAppStore(s => s.addNotification);

  const importFileRef = useRef<HTMLInputElement>(null)
  const replaceFileRef = useRef<HTMLInputElement>(null)
  const [action, setAction] = useState<'idle' | 'generating' | 'importing' | 'uploading'>('idle')
  const [actionError, setActionError] = useState<string | null>(null)

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
  const canEdit = !isSigned && canEditSurveillanceContent(surveillance.chef_id, surveillance.equipe_ids || [], user?.id);

  const handleSave = (contenu: string) => {
    updateSurveillance(surveillanceId, { rapport_html: contenu });
  };

  const handleSigner = (signatureUrl: string) => {
    router.push(`/surveillance/${surveillanceId}`);
  };

  // Bascule un rapport « chargé » (lecture seule) vers la rédaction : l'éditeur
  // se charge et régénère (ou reprend) les sections avec AERORISQ.
  const handlePasserEnRedaction = () => {
    setAction('generating')
    setActionError(null)
    updateSurveillance(surveillanceId, { rapport_type: 'redige' })
    setAction('idle')
  }

  // Import d'un .docx pour le modifier dans l'éditeur (même pipeline que le modal).
  const handleImportDocx = () => {
    importFileRef.current?.click()
  }

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.name.match(/\.docx$/i)) {
      setActionError('Seuls les fichiers .docx sont supportés pour l\'import éditable.')
      return
    }
    try {
      setAction('importing')
      setActionError(null)
      const result = await importRapportFromFile(file)
      updateSurveillance(surveillanceId, {
        rapport_sections: JSON.stringify(result.sections),
        rapport_type: 'redige',
        rapport_fichier_nom: file.name,
        rapport_html: result.rawHtml || '<p>Rapport importé et prêt à être modifié.</p>',
      })
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Rapport importé',
        message: 'Le document a été parsé et est prêt à être édité.',
        canal: 'in_app',
      })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erreur lors du parsage du document')
    } finally {
      setAction('idle')
    }
  }

  // Rechargement d'un fichier PDF / Word / image en lecture seule.
  const handleReplaceCharged = () => {
    replaceFileRef.current?.click()
  }

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
    ]
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|jpg|jpeg|png)$/i)) {
      setActionError('Format non supporté. Utilisez PDF, Word (.doc/.docx) ou une image (JPEG/PNG).')
      return
    }
    try {
      setAction('uploading')
      setActionError(null)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Erreur de lecture du fichier'))
        reader.readAsDataURL(file)
      })
      updateSurveillance(surveillanceId, {
        rapport_fichier_url: base64,
        rapport_fichier_nom: file.name,
        rapport_type: 'charge',
        rapport_html: `<p>Rapport chargé : ${file.name}</p>`,
      })
    } catch {
      setActionError('Erreur lors du chargement du fichier')
    } finally {
      setAction('idle')
    }
  }

  const estPDF = surveillance.rapport_fichier_url?.startsWith('data:application/pdf');
  const estImage = surveillance.rapport_fichier_url?.startsWith('data:image/');
  const estWord = surveillance.rapport_fichier_nom?.match(/\.(doc|docx)$/i);

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
              <div className="card-header pb-2 flex items-center justify-between flex-wrap gap-2">
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
                    <p className="text-sm mt-1">
                      {estWord
                        ? 'Ce document est au format Word (.doc/.docx) : téléchargez-le pour le consulter, ou importez-le dans l\'éditeur pour le modifier.'
                        : 'Téléchargez le fichier pour le consulter.'}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions — sortir du mode « chargé » : rédiger avec l'IA, importer un
                Word éditable, ou remplacer le fichier (les 3 options du modal). */}
            {canEdit && (
              <div className="card">
                <div className="card-content p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    Vous pouvez aussi modifier ce rapport :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handlePasserEnRedaction}
                      disabled={action !== 'idle'}
                      className="btn btn-primary gap-2 text-sm"
                    >
                      {action === 'generating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      Rédiger avec AERORISQ
                    </button>
                    <button
                      onClick={handleImportDocx}
                      disabled={action !== 'idle'}
                      className="btn btn-secondary gap-2 text-sm"
                    >
                      {action === 'importing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      Importer un Word (.docx) à éditer
                    </button>
                    <button
                      onClick={handleReplaceCharged}
                      disabled={action !== 'idle'}
                      className="btn btn-secondary gap-2 text-sm"
                    >
                      {action === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Remplacer le fichier chargé
                    </button>
                  </div>
                  {actionError && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{actionError}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
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

        <input
          ref={importFileRef}
          type="file"
          accept=".docx"
          onChange={handleImportFileSelected}
          className="hidden"
        />
        <input
          ref={replaceFileRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleReplaceFileSelected}
          className="hidden"
        />
      </div>
    </div>
  );
}
