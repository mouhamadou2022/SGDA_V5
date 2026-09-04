'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import SurveillanceRapport from '@/components/modules/surveillance/SurveillanceRapport';
import { canEditSurveillanceContent } from '@/lib/config';
import {
  ArrowLeft,
  FileText,
  Wifi,
  WifiOff,
  FileDown,
  Eye,
  PenLine,
  Sparkles,
  Upload,
  Loader2,
  AlertCircle,
  RefreshCw,
  X,
  AlertTriangle,
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

  const replaceFileRef = useRef<HTMLInputElement>(null)
  const [action, setAction] = useState<'idle' | 'generating' | 'uploading'>('idle')
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'warning' | 'danger';
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', variant: 'warning', onConfirm: () => {} });

  useEffect(() => {
    if (user?.role) {
      document.body.setAttribute('data-role', user.role);
      return () => { document.body.removeAttribute('data-role'); };
    }
  }, [user?.role]);

  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodrome = aerodromes.find(a => a.id === surveillance?.aerodrome_id);
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
  const isRedige = surveillance.rapport_type === 'redige' || (!surveillance.rapport_type && !!surveillance.rapport_sections);
  const canEdit = !isSigned && canEditSurveillanceContent(surveillance.chef_id, surveillance.equipe_ids || [], user?.id);
  const hasExistingRapport = isCharged || isRedige;

  const handleSave = (contenu: string) => {
    updateSurveillance(surveillanceId, { rapport_html: contenu });
  };

  const handleSigner = (signatureUrl: string) => {
    router.push(`/surveillance/${surveillanceId}`);
  };

  // Passer en mode rédaction IA (depuis mode charge)
  const handlePasserEnRedaction = () => {
    if (isCharged && surveillance.rapport_sections) {
      setConfirmDialog({
        open: true,
        title: 'Remplacer le rapport chargé ?',
        message: 'Un rapport chargé existe déjà. Si vous passez en mode rédaction AERORISQ, le rapport chargé sera remplacé par un rapport généré par l\'IA. Voulez-vous continuer ?',
        variant: 'danger',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, open: false }));
          setAction('generating');
          updateSurveillance(surveillanceId, {
            rapport_type: 'redige',
            rapport_fichier_url: undefined,
            rapport_fichier_nom: undefined,
          });
          setAction('idle');
        },
      });
    } else {
      setAction('generating');
      updateSurveillance(surveillanceId, { rapport_type: 'redige' });
      setAction('idle');
    }
  }

  // Remplacer le fichier chargé
  const handleReplaceCharged = () => {
    if (isCharged) {
      setConfirmDialog({
        open: true,
        title: 'Remplacer le fichier ?',
        message: 'Le fichier chargé existant sera remplacé. Cette action est irréversible. Continuer ?',
        variant: 'warning',
        onConfirm: () => {
          setConfirmDialog(prev => ({ ...prev, open: false }));
          replaceFileRef.current?.click();
        },
      });
    } else {
      replaceFileRef.current?.click();
    }
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
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Fichier chargé',
        message: `Le fichier "${file.name}" a été chargé avec succès.`,
        canal: 'in_app',
      });
    } catch {
      setActionError('Erreur lors du chargement du fichier')
    } finally {
      setAction('idle')
    }
  }

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

      {/* Contenu */}
      <div className="px-6 py-6">
        {/* Mode charge : header fichier + SurveillanceRapport directEdit */}
        {isCharged ? (
          <div className="space-y-4">
            {/* Barre d'infos du fichier chargé */}
            <div className="card">
              <div className="card-content p-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Eye className="h-4 w-4 text-role-primary" />
                  <span className="text-sm font-medium text-foreground">
                    {surveillance.rapport_fichier_nom || 'Fichier chargé'}
                  </span>
                  {estPDF && <span className="badge primary text-[10px]">PDF</span>}
                  {estImage && <span className="badge primary text-[10px]">Image</span>}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={surveillance.rapport_fichier_url}
                    download={surveillance.rapport_fichier_nom || 'rapport'}
                    className="btn btn-sm btn-secondary gap-1.5 text-xs"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Télécharger
                  </a>
                  {canEdit && (
                    <>
                      <button
                        onClick={handlePasserEnRedaction}
                        disabled={action !== 'idle'}
                        className="btn btn-sm btn-primary gap-1.5 text-xs"
                      >
                        {action === 'generating' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        Rédiger avec AERORISQ
                      </button>
                      <button
                        onClick={handleReplaceCharged}
                        disabled={action !== 'idle'}
                        className="btn btn-sm btn-secondary gap-1.5 text-xs"
                      >
                        {action === 'uploading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Remplacer
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {actionError && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-xs text-danger">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Le rapport éditable directement */}
            <SurveillanceRapport
              surveillanceId={surveillanceId}
              onSave={handleSave}
              onSigner={handleSigner}
              readOnly={isSigned || !canEdit}
              userRole={user?.role || 'inspector'}
              rapportType="charge"
            />
          </div>
        ) : (
          <SurveillanceRapport
            surveillanceId={surveillanceId}
            onSave={handleSave}
            onSigner={handleSigner}
            readOnly={isSigned || !canEditSurveillanceContent(surveillance.chef_id, surveillance.equipe_ids || [], user?.id)}
            userRole={user?.role || 'inspector'}
            rapportType="redige"
          />
        )}

        <input
          ref={replaceFileRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={handleReplaceFileSelected}
          className="hidden"
        />
      </div>

      {/* Modal de confirmation */}
      {confirmDialog.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
          <div className="bg-white rounded-2xl max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmDialog.variant === 'danger' ? 'bg-danger/10' : 'bg-warning/10'}`}>
                  <AlertTriangle className={`w-5 h-5 ${confirmDialog.variant === 'danger' ? 'text-danger' : 'text-warning'}`} />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{confirmDialog.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{confirmDialog.message}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className={`btn ${confirmDialog.variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
