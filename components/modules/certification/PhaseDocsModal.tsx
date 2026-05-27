// components/modules/certification/PhaseDocsModal.tsx
'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, FileText, Shield, Scale, CheckCircle2, Eye, Trash2, Calendar, User, AlertCircle } from 'lucide-react';
import { FormShell } from '@/components/ui/FormShell';
import { useAppStore, type Aerodrome, type Certification, type Homologation } from '@/lib/store';

interface PhaseInfo {
  num: number;
  intitule: string;
}

const CERT_PHASES: PhaseInfo[] = [
  { num: 1, intitule: "Expression d'Intérêt" },
  { num: 2, intitule: 'Demande Formelle' },
  { num: 3, intitule: 'Vérification sur Site' },
  { num: 4, intitule: 'Délivrance du Certificat' },
  { num: 5, intitule: 'Publication Statut' },
];

const HOMO_PHASES: PhaseInfo[] = [
  { num: 1, intitule: "Demande d'Homologation" },
  { num: 2, intitule: 'Vérification Documentaire' },
  { num: 3, intitule: 'Décision & Notification' },
];

function getPhaseKey(num: number): `phase${1|2|3|4|5}` {
  return `phase${num}` as `phase${1|2|3|4|5}`
}

function getFichiers(
  certOrHomo: Certification | Homologation | undefined,
  phaseNum: number,
  type: 'certification' | 'homologation'
): { nom: string; url: string; date_upload: string }[] {
  if (!certOrHomo) return []
  const phaseKey = getPhaseKey(phaseNum)
  const phaseData = (certOrHomo.phases_data as any)[phaseKey]
  if (!phaseData) return []
  if (type === 'certification') {
    return (phaseData as any).inspecteur_fichiers || []
  }
  return (phaseData as any).inspecteur_fichiers || []
}

function setFichiers(
  certOrHomo: Certification | Homologation,
  phaseNum: number,
  fichiers: { nom: string; url: string; date_upload: string }[]
): any {
  const phaseKey = getPhaseKey(phaseNum)
  return {
    ...certOrHomo,
    phases_data: {
      ...certOrHomo.phases_data,
      [phaseKey]: {
        ...(certOrHomo.phases_data as any)[phaseKey],
        inspecteur_fichiers: fichiers,
      },
    },
  }
}

interface PhaseDocsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aerodrome: Aerodrome;
  type: 'certification' | 'homologation';
}

export function PhaseDocsModal({ open, onOpenChange, aerodrome, type }: PhaseDocsModalProps) {
  const certifications = useAppStore(s => s.certifications)
  const homologations = useAppStore(s => s.homologations)
  const addCertification = useAppStore(s => s.addCertification)
  const addHomologation = useAppStore(s => s.addHomologation)
  const updateCertification = useAppStore(s => s.updateCertification)
  const updateHomologation = useAppStore(s => s.updateHomologation)
  const addNotification = useAppStore(s => s.addNotification)
  const setActiveModule = useAppStore(s => s.setActiveModule)
  const setPendingRegistreSource = useAppStore(s => s.setPendingRegistreSource)
  const user = useAppStore(s => s.user)
  const [draftId, setDraftId] = useState<string | null>(null)

  // Créer un dossier draft si aucun n'existe
  const certOrHomo: Certification | Homologation | undefined = React.useMemo(() => {
    const existing = type === 'certification'
      ? certifications?.find(c => c.aerodrome_id === aerodrome.id)
      : homologations?.find(h => h.aerodrome_id === aerodrome.id)
    if (existing) return existing
    // Utiliser le draft créé en session si existant
    if (draftId) {
      if (type === 'certification') return certifications?.find(c => c.id === draftId)
      return homologations?.find(h => h.id === draftId)
    }
    return undefined
  }, [type, aerodrome.id, certifications, homologations, draftId])

  const ensureDossier = async (): Promise<Certification | Homologation | undefined> => {
    if (certOrHomo) return certOrHomo
    const now = new Date().toISOString()
    const ref = type === 'certification'
      ? `CERT-${aerodrome.code_oaci}-${Date.now()}`
      : `HOMO-${aerodrome.code_oaci}-${Date.now()}`
    if (type === 'certification') {
      const draft: Certification = {
        id: crypto.randomUUID(),
        aerodrome_id: aerodrome.id,
        reference: ref,
        phase_active: 1,
        phases_data: {},
        statut_global: 'en_cours',
        created_at: now,
        updated_at: now,
      }
      addCertification(draft)
      setDraftId(draft.id)
      return draft
    }
    const draft: Homologation = {
      id: crypto.randomUUID(),
      aerodrome_id: aerodrome.id,
      reference: ref,
      phase_active: 1,
      phases_data: {},
      statut_global: 'en_cours',
      created_at: now,
      updated_at: now,
    }
    addHomologation(draft)
    setDraftId(draft.id)
    return draft
  }

  const phases = type === 'certification' ? CERT_PHASES : HOMO_PHASES;

  const [activePhase, setActivePhase] = useState(phases[0]?.num || 1);
  const [activeTab, setActiveTab] = useState<'documents' | 'historique'>('documents');
  const [uploading, setUploading] = useState(false);

  const currentPhaseFichiers = getFichiers(certOrHomo, activePhase, type);
  const currentPhaseInfo = phases.find(p => p.num === activePhase);

  const handleUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length) return;
      const dossier = await ensureDossier()
      if (!dossier) return
      setUploading(true);
      const now = new Date().toISOString();
      const newDocs: { nom: string; url: string; date_upload: string }[] =
        Array.from(input.files).map(file => ({
          nom: file.name,
          url: URL.createObjectURL(file),
          date_upload: now,
        }));

      const existing = getFichiers(dossier, activePhase, type);
      const updated = [...existing, ...newDocs];

      try {
        if (type === 'certification') {
          await updateCertification(dossier.id, {
            phases_data: {
              ...(dossier as Certification).phases_data,
              [getPhaseKey(activePhase)]: {
                ...((dossier as Certification).phases_data as any)[getPhaseKey(activePhase)],
                inspecteur_fichiers: updated,
              },
            },
          } as any)
        } else {
          await updateHomologation(dossier.id, {
            phases_data: {
              ...(dossier as Homologation).phases_data,
              [getPhaseKey(activePhase)]: {
                ...((dossier as Homologation).phases_data as any)[getPhaseKey(activePhase)],
                inspecteur_fichiers: updated,
              },
            },
          } as any)
        }
        addNotification({
          user_id: user?.id || '',
          type: 'success',
          title: 'Documents ajoutés',
          message: `${newDocs.length} document(s) ajouté(s) à la phase ${activePhase}`,
          canal: 'in_app',
        });
      } catch (err) {
        console.error('[PhaseDocsModal] Erreur upload:', err)
      }
      setUploading(false);
    };
    input.click();
  };

  const handleDeleteDoc = async (docIdx: number) => {
    const dossier = await ensureDossier()
    if (!dossier) return;
    const existing = getFichiers(dossier, activePhase, type);
    const updated = existing.filter((_, i) => i !== docIdx);

    try {
      if (type === 'certification') {
        await updateCertification(dossier.id, {
          phases_data: {
            ...(dossier as Certification).phases_data,
            [getPhaseKey(activePhase)]: {
              ...((dossier as Certification).phases_data as any)[getPhaseKey(activePhase)],
              inspecteur_fichiers: updated,
            },
          },
        } as any)
      } else {
        await updateHomologation(dossier.id, {
          phases_data: {
            ...(dossier as Homologation).phases_data,
            [getPhaseKey(activePhase)]: {
              ...((dossier as Homologation).phases_data as any)[getPhaseKey(activePhase)],
              inspecteur_fichiers: updated,
            },
          },
        } as any)
      }
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Document supprimé',
        message: `Document retiré de la phase ${activePhase}`,
        canal: 'in_app',
      });
    } catch (err) {
      console.error('[PhaseDocsModal] Erreur suppression:', err)
    }
  };

  const getPhaseIcon = () => type === 'certification' ? Shield : Scale;

  const getPhaseStatus = () => {
    if (currentPhaseFichiers.length > 0) return { label: 'Documenté', variant: 'success' as const };
    return { label: 'Aucun document', variant: 'neutral' as const };
  };

  const getTotalDocumentsCount = () => {
    return phases.reduce((acc, p) => acc + getFichiers(certOrHomo, p.num, type).length, 0);
  };

  const allPhasesHaveDocs = () => {
    return phases.every(p => getFichiers(certOrHomo, p.num, type).length > 0);
  };

  const getLastUpdate = () => {
    const allDocs = phases.flatMap(p => getFichiers(certOrHomo, p.num, type));
    if (allDocs.length === 0) return null;
    const latest = new Date(Math.max(...allDocs.map(d => new Date(d.date_upload).getTime())));
    return latest.toLocaleDateString('fr-FR');
  };

  if (!open) return null;

  return createPortal(
    <FormShell
      open={open}
      onClose={() => onOpenChange(false)}
      title={`${type === 'certification' ? 'Preuves de certification' : "Preuves d'homologation"}`}
      subtitle={`${aerodrome.code_oaci} — ${aerodrome.nom}${!certOrHomo ? ' (aucun dossier trouvé)' : ''}`}
      icon={getPhaseIcon()}
      size="3xl"
      tabs={[
        { id: 'documents', label: 'Documents', icon: FileText },
        { id: 'historique', label: 'Historique', icon: Calendar },
      ]}
      activeTab={activeTab}
      onTabChange={(tabId) => setActiveTab(tabId as 'documents' | 'historique')}
      footer={
        <div className="flex items-center gap-2 w-full justify-between">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {getTotalDocumentsCount() > 0 && (
              <span>{getTotalDocumentsCount()} document{getTotalDocumentsCount() > 1 ? 's' : ''} chargé{getTotalDocumentsCount() > 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className="btn btn-secondary gap-2">
              <X className="w-4 h-4" /> Fermer
            </button>
            <button
              type="button"
              disabled={!allPhasesHaveDocs()}
              onClick={() => {
                const dossier = certOrHomo
                if (dossier) {
                  setPendingRegistreSource({ type, id: dossier.id, aerodrome_id: aerodrome.id })
                  setActiveModule('registres')
                  onOpenChange(false)
                }
              }}
              className={`btn gap-2 ${allPhasesHaveDocs() ? 'btn-primary' : 'btn-secondary opacity-50 cursor-not-allowed'}`}
            >
              Continuer vers le registre {allPhasesHaveDocs() ? '→' : `(${phases.filter(p => getFichiers(certOrHomo, p.num, type).length > 0).length}/${phases.length} phases)`}
            </button>
          </div>
        </div>
      }
    >
      <>
        <div className="border-b border-border mb-5">
          <div className="flex gap-1 overflow-x-auto">
            {phases.map(p => {
              const hasDocs = getFichiers(certOrHomo, p.num, type).length > 0;
              const isActive = activePhase === p.num;
              return (
                <button
                  key={p.num}
                  onClick={() => setActivePhase(p.num)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                    isActive
                      ? 'border-role-primary text-role-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {hasDocs ? (
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  Phase {p.num}
                  {hasDocs && (
                    <span className="badge success text-[10px] px-1.5 py-0.5">
                      {getFichiers(certOrHomo, p.num, type).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'documents' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3 p-4 bg-gradient-to-r from-role-primary-soft/10 to-transparent border border-role-primary/20 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="kpi-icon !w-10 !h-10 bg-role-primary-soft">
                  {type === 'certification' ? (
                    <Shield className="h-5 w-5 text-role-primary" />
                  ) : (
                    <Scale className="h-5 w-5 text-role-primary" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Phase {activePhase} — {currentPhaseInfo?.intitule}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {currentPhaseFichiers.length} document{currentPhaseFichiers.length > 1 ? 's' : ''} attaché{currentPhaseFichiers.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${getPhaseStatus().variant}`}>
                  {getPhaseStatus().label}
                </span>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="btn btn-primary gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Upload...' : 'Ajouter des documents'}
                </button>
              </div>
            </div>

            {currentPhaseFichiers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Aucun document pour cette phase</p>
                <p className="text-xs mt-1">Cliquez sur "Ajouter des documents" pour joindre des preuves</p>
              </div>
            ) : (
              <div className="grid gap-2">
                {currentPhaseFichiers.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl hover:shadow-sm transition-all">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-role-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-role-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{doc.nom}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(doc.date_upload).toLocaleDateString('fr-FR', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {user?.prenom} {user?.nom}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => window.open(doc.url, '_blank')}
                        className="action-button"
                        title="Voir le document"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(i)}
                        className="action-button hover:text-danger"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 bg-card border border-border rounded-xl">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">À propos de cette phase</p>
                  <p>
                    {type === 'certification'
                      ? `Pour la phase ${activePhase} (${currentPhaseInfo?.intitule}), joignez tous les documents justificatifs nécessaires à la certification.`
                      : `Pour la phase ${activePhase} (${currentPhaseInfo?.intitule}), joignez les pièces justificatives demandées pour l'homologation.`
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'historique' && (
          <div className="space-y-4">
            <div className="p-4 bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <Calendar className="w-5 h-5 text-role-primary" />
                <h3 className="text-sm font-semibold text-foreground">Historique des documents</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total documents</p>
                  <p className="text-2xl font-bold text-foreground">{getTotalDocumentsCount()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Dernière mise à jour</p>
                  <p className="text-2xl font-bold text-foreground">{getLastUpdate() || '—'}</p>
                </div>
              </div>
            </div>

            {getTotalDocumentsCount() === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Aucun historique disponible</p>
              </div>
            ) : (
              <div className="space-y-3">
                {phases.map(p => {
                  const docs = getFichiers(certOrHomo, p.num, type);
                  if (docs.length === 0) return null;
                  return (
                    <div key={p.num} className="border border-border rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 border-b border-border flex items-center justify-between">
                        <span className="text-sm font-medium">
                          Phase {p.num} — {p.intitule}
                        </span>
                        <span className="badge neutral text-[10px]">
                          {docs.length} document(s)
                        </span>
                      </div>
                      <div className="p-3 space-y-1.5">
                        {docs.map((doc, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm text-foreground">{doc.nom}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(doc.date_upload).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </>
    </FormShell>,
    document.body
  );
}
