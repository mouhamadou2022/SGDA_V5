// components/modules/plans-actions/RappelSection.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  BellRing,
  Clock,
  Calendar,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  History,
  Mail,
  Phone,
  MessageSquare,
  FileText,
  Trash2,
  Eye,
  Download,
  Users,
  UserCheck,
  Settings,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import { rappelEngine, RappelProgramme, RappelManuel, CanalRappel } from '@/lib/rappelEngine';
import { FileUploader } from '@/components/ui/FileUploader';

interface RappelSectionProps {
  ecartId: string;
  ecart: any;
  readOnly?: boolean;
  userRole: string;
  userId: string;
}

type DestinataireType = 'exploitant' | 'dg_operator' | 'focal_operator' | 'inspecteur' | 'chef_inspection';

const DESTINATAIRES: { value: DestinataireType; label: string; icon: React.ElementType }[] = [
  { value: 'exploitant', label: 'Point focal exploitant', icon: UserCheck },
  { value: 'dg_operator', label: 'Directeur Général exploitant', icon: Users },
  { value: 'focal_operator', label: 'Staff exploitant', icon: Users },
  { value: 'inspecteur', label: 'Inspecteur référent', icon: UserCheck },
  { value: 'chef_inspection', label: 'Chef d\'équipe inspection', icon: UserCheck },
];

const CANAUX: { value: CanalRappel; label: string; icon: React.ElementType }[] = [
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'sms', label: 'SMS', icon: Phone },
  { value: 'in_app', label: 'In-app', icon: MessageSquare },
];

function EnvoiRappelModal({
  isOpen,
  onClose,
  ecartId,
  ecart,
  onSuccess,
  userId,
  userNom,
}: {
  isOpen: boolean;
  onClose: () => void;
  ecartId: string;
  ecart: any;
  onSuccess: () => void;
  userId: string;
  userNom: string;
}) {
  const [destinataires, setDestinataires] = useState<DestinataireType[]>(['exploitant']);
  const [message, setMessage] = useState('');
  const [canaux, setCanaux] = useState<CanalRappel[]>(['email', 'in_app']);
  const [fichiers, setFichiers] = useState<{ id: string; nom: string; url: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingIA, setIsGeneratingIA] = useState(false);
  const addNotification = useAppStore(s => s.addNotification);

  const getMessageParDefaut = () => {
    const delaiPAC = ecart?.delai_pac ? new Date(ecart.delai_pac).toLocaleDateString('fr-FR') : 'non définie';
    return `Bonjour,

Le délai de soumission du Plan d'Actions Correctives (PAC) pour l'écart ${ecart?.reference} expire le ${delaiPAC}.

Merci de bien vouloir régulariser votre situation dans les meilleurs délais.

Cordialement,
L'équipe ANACIM`;
  };

  useEffect(() => {
    if (!message) {
      setMessage(getMessageParDefaut());
    }
  }, [ecart]);

  const handleSubmit = async () => {
    if (destinataires.length === 0) {
      addNotification({
        user_id: userId,
        type: 'warning',
        title: 'Destinataire requis',
        message: 'Veuillez sélectionner au moins un destinataire',
        canal: 'in_app',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const rappel = rappelEngine.enregistrerRappelManuel(
        ecartId,
        userId,
        userNom,
        destinataires,
        message,
        fichiers.map(f => ({ nom: f.nom, url: f.url })),
        canaux
      );

      addNotification({
        user_id: userId,
        type: 'success',
        title: 'Rappel envoyé',
        message: `Un rappel a été envoyé à ${destinataires.length} destinataire(s)`,
        canal: 'in_app',
      });

      onSuccess();
      onClose();
    } catch (error) {
      addNotification({
        user_id: userId,
        type: 'danger',
        title: 'Erreur',
        message: 'Une erreur est survenue lors de l\'envoi du rappel',
        canal: 'in_app',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddFile = (file: { nom: string; url: string }) => {
    setFichiers(prev => [...prev, {
      id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      nom: file.nom,
      url: file.url,
    }]);
  };

  const handleRemoveFile = (fileId: string) => {
    setFichiers(prev => prev.filter(f => f.id !== fileId));
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl border-t-4 border-t-role-primary" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title flex items-center gap-2">
            <Send className="w-5 h-5 text-role-primary" />
            Envoyer un rappel
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body py-4 space-y-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Écart concerné</p>
            <p className="text-sm font-medium">{ecart?.reference} - {ecart?.libelle?.substring(0, 100)}</p>
          </div>

          <div className="form-field">
            <label className="filter-label">Destinataires *</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {DESTINATAIRES.map(dest => {
                const Icon = dest.icon;
                const isSelected = destinataires.includes(dest.value);
                return (
                  <button
                    key={dest.value}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setDestinataires(prev => prev.filter(d => d !== dest.value));
                      } else {
                        setDestinataires(prev => [...prev, dest.value]);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                      isSelected
                        ? 'bg-role-gradient text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {dest.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-field">
            <label className="filter-label">Canaux de communication</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CANAUX.map(canal => {
                const Icon = canal.icon;
                const isSelected = canaux.includes(canal.value);
                return (
                  <button
                    key={canal.value}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setCanaux(prev => prev.filter(c => c !== canal.value));
                      } else {
                        setCanaux(prev => [...prev, canal.value]);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                      isSelected
                        ? 'bg-role-gradient text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {canal.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-field">
            <label className="filter-label">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="form-textarea w-full"
              placeholder="Votre message..."
            />
            <button
              type="button"
              onClick={async () => {
                setIsGeneratingIA(true)
                try {
                  const { assistantAgent } = await import('@/lib/ia/agents/assistantAgent')
                  const delaiPAC = ecart?.delai_pac ? new Date(ecart.delai_pac).toLocaleDateString('fr-FR') : 'non définie'
                  const nbRappels = rappelEngine.getRappelsManuels(ecartId).length + 1
                  const storeUser = useAppStore.getState().user
                  const resp = await assistantAgent.chat({
                    message: `Rédige un rappel professionnel pour un exploitant d'aérodrome concernant l'écart "${ecart?.reference}: ${ecart?.libelle?.substring(0, 80) || ''}" de niveau ${ecart?.niveau_risque}. Délai PAC: ${delaiPAC}. Rappel n°${nbRappels}. Format: email professionnel avec objet. Ton: ferme mais courtois. Langue: français. Signé: ANACIM - SGDA.`,
                    userRole: storeUser?.role || 'inspector',
                    contexte: { aerodromeId: ecart?.aerodrome_id },
                  })
                  if (resp?.message) setMessage(resp.message)
                  else setMessage(getMessageParDefaut())
                } catch {
                  setMessage(getMessageParDefaut())
                } finally {
                  setIsGeneratingIA(false)
                }
              }}
              disabled={isGeneratingIA}
              className={`btn btn-sm gap-1.5 mt-1.5 ${isGeneratingIA ? 'btn-secondary' : 'btn-outline'}`}
            >
              {isGeneratingIA ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Génération...</> : <><Sparkles className="w-3.5 h-3.5" />Générer avec IA</>}
            </button>
          </div>

          <div className="form-field">
            <label className="filter-label">Pièces jointes (optionnel)</label>
            <FileUploader onUpload={handleAddFile} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
            {fichiers.length > 0 && (
              <div className="space-y-1 mt-2">
                {fichiers.map(f => (
                  <div key={f.id} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="text-sm">{f.nom}</span>
                    </div>
                    <button onClick={() => handleRemoveFile(f.id)} className="action-button text-danger">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary gap-2"
            onClick={handleSubmit}
            disabled={isSubmitting || destinataires.length === 0}
          >
            {isSubmitting ? 'Envoi...' : <><Send className="w-4 h-4" />Envoyer le rappel</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ConfigRappelModal({
  isOpen,
  onClose,
  type,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  type: 'pac' | 'preuves';
  onSave: () => void;
}) {
  const [config, setConfig] = useState(rappelEngine.getRappelConfig(type));
  const addNotification = useAppStore(s => s.addNotification);
  const user = useOptimizedStore(s => s.user);

  const handleSave = () => {
    if (config) {
      rappelEngine.updateRappelConfig(config);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Configuration sauvegardée',
        message: `Les paramètres de rappel pour ${type === 'pac' ? 'les PAC' : 'les preuves'} ont été mis à jour`,
        canal: 'in_app',
      });
      onSave();
      onClose();
    }
  };

  if (!isOpen || !config) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md border-t-4 border-t-role-primary" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title flex items-center gap-2">
            <Settings className="w-5 h-5 text-role-primary" />
            Configuration des rappels - {type === 'pac' ? 'PAC' : 'Preuves'}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="modal-body py-4 space-y-4">
          <div className="form-field">
            <label className="filter-label">Jours avant échéance</label>
            <div className="flex gap-2">
              {config.delais_jours.map((jour, idx) => (
                <input
                  key={idx}
                  type="number"
                  value={jour}
                  onChange={(e) => {
                    const newDelais = [...config.delais_jours];
                    newDelais[idx] = parseInt(e.target.value) || 0;
                    setConfig({ ...config, delais_jours: newDelais });
                  }}
                  className="form-input w-20 text-center"
                  min={1}
                />
              ))}
            </div>
            <p className="field-description">Rappels envoyés à J-X, J-Y, J-Z avant l'échéance</p>
          </div>

          <div className="form-field">
            <label className="filter-label flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.relances_apres_echeance}
                onChange={(e) => setConfig({ ...config, relances_apres_echeance: e.target.checked })}
                className="form-checkbox"
              />
              Activer les relances après échéance
            </label>
          </div>

          {config.relances_apres_echeance && (
            <>
              <div className="form-field">
                <label className="filter-label">Intervalle entre relances (jours)</label>
                <input
                  type="number"
                  value={config.intervalle_relance_jours}
                  onChange={(e) => setConfig({ ...config, intervalle_relance_jours: parseInt(e.target.value) || 7 })}
                  className="form-input w-32"
                  min={1}
                />
              </div>

              <div className="form-field">
                <label className="filter-label">Nombre max de relances</label>
                <input
                  type="number"
                  value={config.max_relances}
                  onChange={(e) => setConfig({ ...config, max_relances: parseInt(e.target.value) || 3 })}
                  className="form-input w-32"
                  min={1}
                  max={10}
                />
              </div>

              <div className="form-field">
                <label className="filter-label flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.escalade_automatique}
                    onChange={(e) => setConfig({ ...config, escalade_automatique: e.target.checked })}
                    className="form-checkbox"
                  />
                  Activer l'escalade automatique
                </label>
                {config.escalade_automatique && (
                  <div className="mt-2">
                    <label className="filter-label">Jours avant escalade</label>
                    <input
                      type="number"
                      value={config.escalade_apres_jours}
                      onChange={(e) => setConfig({ ...config, escalade_apres_jours: parseInt(e.target.value) || 15 })}
                      className="form-input w-32"
                      min={1}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          <div className="form-field">
            <label className="filter-label">Canaux de communication</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CANAUX.map(canal => {
                const Icon = canal.icon;
                const isSelected = config.canaux.includes(canal.value);
                return (
                  <button
                    key={canal.value}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setConfig({ ...config, canaux: config.canaux.filter(c => c !== canal.value) });
                      } else {
                        setConfig({ ...config, canaux: [...config.canaux, canal.value] });
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                      isSelected
                        ? 'bg-role-gradient text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {canal.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave}>Sauvegarder</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function RappelSection({ ecartId, ecart, readOnly = false, userRole, userId }: RappelSectionProps) {
  const [showEnvoiModal, setShowEnvoiModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configType, setConfigType] = useState<'pac' | 'preuves'>('pac');
  const [refresh, setRefresh] = useState(0);
  const utilisateurs = useOptimizedStore(s => s.utilisateurs);
  const addNotification = useAppStore(s => s.addNotification);

  const rappelsProgrammes = useMemo(() => rappelEngine.getRappelsProgrammes(ecartId), [ecartId, refresh]);
  const rappelsManuels = useMemo(() => rappelEngine.getRappelsManuels(ecartId), [ecartId, refresh]);

  const handleRefresh = () => {
    setRefresh(prev => prev + 1);
  };

  const getDestinataireLabel = (dest: string) => {
    const d = DESTINATAIRES.find(d => d.value === dest);
    return d?.label || dest;
  };

  const isAdmin = userRole === 'admin' || userRole === 'inspector';

  return (
    <div className="space-y-4" data-role={userRole}>
      {/* En-tête avec boutons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Gestion des rappels</span>
          <span className="badge neutral text-[10px]">
            {rappelsProgrammes.filter(r => r.statut === 'programme').length} programmé(s)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button
                onClick={() => { setConfigType('pac'); setShowConfigModal(true); }}
                className="action-button"
                title="Configurer les rappels PAC"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setConfigType('preuves'); setShowConfigModal(true); }}
                className="action-button"
                title="Configurer les rappels preuves"
              >
                <Settings className="w-4 h-4" />
              </button>
            </>
          )}
          {!readOnly && (
            <button
              onClick={() => setShowEnvoiModal(true)}
              className="btn btn-primary btn-sm gap-1"
            >
              <Bell className="w-4 h-4" />
              Envoyer un rappel
            </button>
          )}
        </div>
      </div>

      {/* Rappels programmés */}
      {rappelsProgrammes.length > 0 && (
        <div className="card border-border">
          <div className="card-header pb-2">
            <div className="card-title text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-role-primary" />
              Rappels automatiques programmés
            </div>
          </div>
          <div className="card-content">
            <div className="space-y-2">
              {rappelsProgrammes.map(rappel => {
                const dateDeclenchement = new Date(rappel.date_declenchement);
                const estDepasse = dateDeclenchement < new Date();
                const niveauClass = rappel.niveau_urgence === 'danger' ? 'text-danger' : rappel.niveau_urgence === 'warning' ? 'text-warning' : 'text-muted-foreground';
                const niveauBg = rappel.niveau_urgence === 'danger' ? 'bg-danger/10' : rappel.niveau_urgence === 'warning' ? 'bg-warning/10' : 'bg-gray-100';
                
                return (
                  <div key={rappel.id} className={`flex items-center justify-between p-2 ${niveauBg} rounded-lg`}>
                    <div className="flex items-center gap-3">
                      {estDepasse ? (
                        <AlertTriangle className="w-4 h-4 text-danger" />
                      ) : (
                        <Bell className="w-4 h-4 text-muted-foreground" />
                      )}
                      <div>
                        <p className="text-sm">
                          {rappel.type === 'pac' ? 'Rappel PAC' : 'Rappel preuves'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Date prévue: {dateDeclenchement.toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${rappel.statut === 'envoye' ? 'success' : rappel.statut === 'annule' ? 'neutral' : 'warning'} text-[10px]`}>
                        {rappel.statut === 'programme' ? 'Programmé' : rappel.statut === 'envoye' ? 'Envoyé' : 'Annulé'}
                      </span>
                      {rappel.statut === 'programme' && !readOnly && (
                        <button
                          onClick={() => {
                            rappelEngine.annulerRappel(rappel.id);
                            handleRefresh();
                            addNotification({
                              user_id: userId,
                              type: 'info',
                              title: 'Rappel annulé',
                              message: 'Le rappel programmé a été annulé',
                              canal: 'in_app',
                            });
                          }}
                          className="action-button text-danger"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Historique des rappels manuels */}
      {rappelsManuels.length > 0 && (
        <div className="card border-border">
          <div className="card-header pb-2">
            <div className="card-title text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-role-primary" />
              Historique des rappels
            </div>
          </div>
          <div className="card-content">
            <div className="space-y-2">
              {rappelsManuels.slice(0, 5).map(rappel => (
                <div key={rappel.id} className="flex items-start gap-3 p-2 border-b border-border last:border-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium">{new Date(rappel.date_envoi).toLocaleDateString('fr-FR')}</span>
                      <span className="badge primary text-[10px]">Manuel</span>
                      <span className="text-xs text-muted-foreground">par {rappel.expediteur_nom}</span>
                    </div>
                    <p className="text-sm mt-1 line-clamp-2">{rappel.message}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1">
                        {rappel.destinataires.map(dest => (
                          <span key={dest} className="badge neutral text-[8px]">{getDestinataireLabel(dest)}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1">
                        {rappel.canaux.map(canal => {
                          const Icon = CANAUX.find(c => c.value === canal)?.icon || Mail;
                          return <Icon key={canal} className="w-3 h-3 text-muted-foreground" />;
                        })}
                      </div>
                      {rappel.fichiers.length > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <FileText className="w-3 h-3" />
                          {rappel.fichiers.length} fichier(s)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      {showEnvoiModal && (
        <EnvoiRappelModal
          isOpen={showEnvoiModal}
          onClose={() => setShowEnvoiModal(false)}
          ecartId={ecartId}
          ecart={ecart}
          onSuccess={handleRefresh}
          userId={userId}
          userNom={utilisateurs.find(u => u.id === userId)?.nom || 'Inspecteur'}
        />
      )}

      {showConfigModal && (
        <ConfigRappelModal
          isOpen={showConfigModal}
          onClose={() => setShowConfigModal(false)}
          type={configType}
          onSave={handleRefresh}
        />
      )}
    </div>
  );
}

export default RappelSection;