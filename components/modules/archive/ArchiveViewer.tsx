// components/modules/archive/ArchiveViewer.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Download,
  Eye,
  FileText,
  Calendar,
  User,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Shield,
  Scale,
  MapPin,
  FileSignature,
  BookOpen,
  Send,
  RefreshCw,
  ArchiveRestore,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface ArchiveViewerProps {
  item: any;
  type: 'certification' | 'homologation';
  onClose: () => void;
  onRestore?: () => void;
}

interface PhaseInfo {
  phase: number;
  title: string;
  date_reception?: string;
  date_cloture?: string;
  responsable?: string;
  documents?: Record<string, boolean>;
  details?: any;
}

export function ArchiveViewer({ item, type, onClose, onRestore }: ArchiveViewerProps) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const surveillances = useAppStore(s => s.surveillances);
  const exemptions = useAppStore(s => s.exemptions);
  const ecarts = useAppStore(s => s.ecarts);
  const [activeTab, setActiveTab] = useState<'infos' | 'timeline' | 'documents' | 'exemptions' | 'ecarts'>('infos');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const aerodrome = aerodromes?.find(a => a.id === item.aerodrome_id);
  const itemExemptions = exemptions?.filter((e: any) => e.parent_id === item.id) || [];
  const itemSurveillances = surveillances?.filter((s: any) => s.certification_id === item.id || s.homologation_id === item.id) || [];
  
  // Récupérer les écarts liés via les surveillances
  const itemEcarts = ecarts?.filter((e: any) => 
    itemSurveillances.some((s: any) => s.id === e.surveillance_id)
  ) || [];

  const getPhaseList = (): PhaseInfo[] => {
    if (type === 'certification') {
      return [
        { phase: 1, title: "Expression d'Intérêt", date_reception: item.phases_data?.phase1?.date_reception, date_cloture: item.phases_data?.phase1?.cloture_le, responsable: item.phases_data?.phase1?.responsable_nom, documents: item.phases_data?.phase1?.documents, details: item.phases_data?.phase1 },
        { phase: 2, title: "Demande Formelle", date_reception: item.phases_data?.phase2?.date_reception, date_cloture: item.phases_data?.phase2?.cloture_le, responsable: item.phases_data?.phase2?.responsable_nom, documents: item.phases_data?.phase2?.documents, details: item.phases_data?.phase2 },
        { phase: 3, title: "Vérification sur Site", date_reception: item.phases_data?.phase3?.date_verification, date_cloture: item.phases_data?.phase3?.cloture_le, responsable: item.phases_data?.phase3?.chef_nom, documents: item.phases_data?.phase3?.documents, details: item.phases_data?.phase3 },
        { phase: 4, title: "Délivrance du Certificat", date_reception: item.phases_data?.phase4?.date_delivrance, date_cloture: item.phases_data?.phase4?.cloture_le, details: item.phases_data?.phase4 },
        { phase: 5, title: "Publication Statut", date_reception: item.phases_data?.phase5?.date_publication_aip, date_cloture: item.phases_data?.phase5?.cloture_le, details: item.phases_data?.phase5 },
      ];
    } else {
      return [
        { phase: 1, title: "Demande Formelle", date_reception: item.phases_data?.phase1?.date_reception, date_cloture: item.phases_data?.phase1?.cloture_le, responsable: item.phases_data?.phase1?.responsable_nom, documents: item.phases_data?.phase1?.documents, details: item.phases_data?.phase1 },
        { phase: 2, title: "Vérification sur Site", date_reception: item.phases_data?.phase2?.date_verification, date_cloture: item.phases_data?.phase2?.cloture_le, responsable: item.phases_data?.phase2?.chef_nom, documents: item.phases_data?.phase2?.documents, details: item.phases_data?.phase2 },
        { phase: 3, title: "Délivrance Décision", date_reception: item.phases_data?.phase3?.date_delivrance, date_cloture: item.phases_data?.phase3?.cloture_le, details: item.phases_data?.phase3 },
      ];
    }
  };

  const getStatusBadge = () => {
    if (item.statut_global === 'certifie' || item.statut_global === 'homologue') {
      return <span className="badge success">Terminé</span>;
    }
    return <span className="badge neutral">Archivé</span>;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-FR');
  };

  const calculateDuration = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return null;
    return `${diffDays} jour${diffDays > 1 ? 's' : ''}`;
  };

  const getDocumentCount = (documents?: Record<string, boolean>) => {
    if (!documents) return { total: 0, uploaded: 0 };
    const total = Object.keys(documents).length;
    const uploaded = Object.values(documents).filter(Boolean).length;
    return { total, uploaded };
  };

  const phases = getPhaseList();

  const getPhaseIcon = (phase: number, isCompleted: boolean) => {
    if (isCompleted) return <CheckCircle2 className="h-5 w-5 text-success" />;
    return <Clock className="h-5 w-5 text-muted" />;
  };

  const renderInfosTab = () => (
    <div className="space-y-5">
      {/* Informations générales */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <FileText className="h-4 w-4 text-role-primary" />
            Informations générales
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Référence</p>
              <p className="font-mono font-semibold">{item.reference}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Statut</p>
              <div>{getStatusBadge()}</div>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Aérodrome</p>
              <p className="font-medium">{aerodrome?.nom} ({aerodrome?.code_oaci})</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Date création</p>
              <p>{formatDate(item.created_at)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Date clôture</p>
              <p>{formatDate(item.updated_at)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Durée totale</p>
              <p>{calculateDuration(item.created_at, item.updated_at) || '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Informations spécifiques au type */}
      {type === 'certification' && item.numero_cert && (
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Shield className="h-4 w-4 text-role-primary" />
              Certificat
            </div>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">N° certificat</p>
                <p className="font-mono">{item.numero_cert}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Date délivrance</p>
                <p>{formatDate(item.date_delivrance)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Date expiration</p>
                <p>{formatDate(item.date_expiration)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Validité restante</p>
                <p>{calculateDuration(new Date().toISOString(), item.date_expiration) || 'Expiré'}</p>
              </div>
            </div>
            {item.certificat_url && (
              <div className="mt-3 pt-3 border-t border-border">
                <a href={item.certificat_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm gap-2">
                  <FileSignature className="h-4 w-4" />
                  Voir le certificat signé
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {type === 'homologation' && item.numero_decision && (
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Scale className="h-4 w-4 text-role-primary" />
              Décision d'homologation
            </div>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">N° décision</p>
                <p className="font-mono">{item.numero_decision}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Date délivrance</p>
                <p>{formatDate(item.date_delivrance)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Nature décision</p>
                <p className="capitalize">{item.nature_decision || '—'}</p>
              </div>
            </div>
            {item.decision_url && (
              <div className="mt-3 pt-3 border-t border-border">
                <a href={item.decision_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm gap-2">
                  <FileSignature className="h-4 w-4" />
                  Voir la décision signée
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Intervenants */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Users className="h-4 w-4 text-role-primary" />
            Intervenants
          </div>
        </div>
        <div className="card-content">
          <div className="space-y-3">
            {phases.filter(p => p.responsable).map(phase => (
              <div key={phase.phase} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Phase {phase.phase}</span>
                <span className="font-medium">{phase.responsable}</span>
              </div>
            ))}
            {phases.filter(p => p.details?.equipe_ids?.length).map(phase => (
              <div key={`equipe-${phase.phase}`} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Équipe Phase {phase.phase}</span>
                <span className="font-medium">{phase.details.equipe_ids.length} inspecteur(s)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTimelineTab = () => (
    <div className="timeline">
      {phases.map((phase, idx) => {
        const isCompleted = !!phase.date_cloture;
        const duration = calculateDuration(phase.date_reception, phase.date_cloture);
        const Icon = getPhaseIcon(phase.phase, isCompleted);

        return (
          <div key={phase.phase} className="timeline-item animate-fade-up" style={{ animationDelay: `${idx * 0.1}s` }}>
            <div className={`timeline-dot ${isCompleted ? 'timeline-dot-success' : 'timeline-dot'}`}>
              {Icon}
            </div>
            <div className="timeline-content">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="timeline-title font-semibold">
                  Phase {phase.phase} — {phase.title}
                </div>
                {isCompleted ? (
                  <span className="badge success">Complétée</span>
                ) : (
                  <span className="badge neutral">Non démarrée</span>
                )}
              </div>

              {phase.date_reception && (
                <div className="flex items-center gap-4 mt-2 text-xs">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Début: {formatDate(phase.date_reception)}</span>
                  </div>
                  {phase.date_cloture && (
                    <div className="flex items-center gap-1 text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Fin: {formatDate(phase.date_cloture)}</span>
                    </div>
                  )}
                  {duration && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Durée: {duration}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Détails spécifiques par phase */}
              {phase.details && (
                <div className="mt-3 space-y-2 text-sm">
                  {phase.details.avis && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Avis:</span>
                      <span className={`badge ${
                        phase.details.avis === 'favorable' ? 'success' :
                        phase.details.avis === 'favorable_reserves' ? 'warning' : 'danger'
                      }`}>
                        {phase.details.avis === 'favorable' ? 'Favorable' :
                         phase.details.avis === 'favorable_reserves' ? 'Avec réserves' : 'Défavorable'}
                      </span>
                    </div>
                  )}
                  {phase.details.score_conformite !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Score conformité:</span>
                      <span className={`font-semibold ${
                        phase.details.score_conformite >= 80 ? 'text-success' :
                        phase.details.score_conformite >= 60 ? 'text-warning' : 'text-danger'
                      }`}>{phase.details.score_conformite}%</span>
                    </div>
                  )}
                  {phase.details.conclusion && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Conclusion:</span>
                      <span className="capitalize">{phase.details.conclusion.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                  {phase.details.conditions && (
                    <div className="mt-2 p-3 bg-role-primary-soft rounded-lg">
                      <p className="text-xs font-semibold text-role-primary">Conditions imposées</p>
                      <p className="text-sm">{phase.details.conditions}</p>
                    </div>
                  )}
                  {phase.details.notam && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">NOTAM:</span>
                      <code className="code-oaci-badge text-xs">{phase.details.notam}</code>
                    </div>
                  )}
                </div>
              )}

              {/* Documents de la phase */}
              {phase.documents && (
                <div className="mt-3 flex items-center gap-2">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {getDocumentCount(phase.documents).uploaded}/{getDocumentCount(phase.documents).total} documents
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderDocumentsTab = () => (
    <div className="space-y-5">
      {phases.map(phase => {
        const docs = phase.documents;
        if (!docs) return null;
        
        const docEntries = Object.entries(docs);
        if (docEntries.length === 0) return null;

        return (
          <div key={phase.phase} className="card">
            <div className="card-header">
              <div className="card-title flex items-center gap-2">
                <FileText className="h-4 w-4 text-role-primary" />
                Phase {phase.phase} — {phase.title}
              </div>
            </div>
            <div className="card-content">
              <div className="space-y-2">
                {docEntries.map(([docName, isUploaded]) => (
                  <div key={docName} className="flex items-center justify-between p-2 rounded-lg hover:bg-role-primary-soft">
                    <div className="flex items-center gap-2">
                      <FileText className={`h-4 w-4 ${isUploaded ? 'text-success' : 'text-muted'}`} />
                      <span className="text-sm">{docName}</span>
                    </div>
                    {isUploaded ? (
                      <span className="badge success text-xs">Uploadé</span>
                    ) : (
                      <span className="badge neutral text-xs">Non fourni</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Documents spéciaux */}
      {(type === 'certification' && item.certificat_url) && (
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-role-primary" />
              Certificat signé
            </div>
          </div>
          <div className="card-content">
            <a href={item.certificat_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg hover:bg-role-primary-soft/70">
              <span className="text-sm font-medium">Certificat_{item.reference}.pdf</span>
              <div className="flex gap-2">
                <Eye className="h-4 w-4 text-role-primary" />
                <Download className="h-4 w-4 text-role-primary" />
              </div>
            </a>
          </div>
        </div>
      )}

      {(type === 'homologation' && item.decision_url) && (
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-role-primary" />
              Décision signée
            </div>
          </div>
          <div className="card-content">
            <a href={item.decision_url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 bg-role-primary-soft rounded-lg hover:bg-role-primary-soft/70">
              <span className="text-sm font-medium">Decision_{item.reference}.pdf</span>
              <div className="flex gap-2">
                <Eye className="h-4 w-4 text-role-primary" />
                <Download className="h-4 w-4 text-role-primary" />
              </div>
            </a>
          </div>
        </div>
      )}
    </div>
  );

  const renderExemptionsTab = () => (
    <div className="space-y-4">
      {itemExemptions.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Aucune exemption associée à ce dossier</p>
        </div>
      ) : (
        itemExemptions.map((ex: any) => (
          <div key={ex.id} className="card">
            <div className="card-header">
              <div className="card-title flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-role-primary" />
                  <span className="font-mono font-semibold">{ex.reference}</span>
                </div>
                <span className={`badge ${
                  ex.statut === 'active' ? 'warning' :
                  ex.statut === 'expiree' ? 'danger' : 'success'
                }`}>
                  {ex.statut === 'active' ? 'Active' : ex.statut === 'expiree' ? 'Expirée' : 'Clôturée'}
                </span>
              </div>
            </div>
            <div className="card-content space-y-3">
              <p className="text-sm">{ex.description}</p>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Date début</p>
                  <p>{formatDate(ex.date_debut)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date fin</p>
                  <p>{formatDate(ex.date_fin)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Durée</p>
                  <p>{ex.duree_mois} mois</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Arrêté</p>
                  <p className="font-mono text-xs">{ex.numero_arrete || '—'}</p>
                </div>
              </div>

              {ex.mesures && ex.mesures.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-sm font-semibold mb-2">Mesures d'atténuation</p>
                  <div className="space-y-2">
                    {ex.mesures.map((mesure: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg">
                        <div className="flex items-center gap-2">
                          {mesure.statut === 'realisee' ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : mesure.statut === 'en_retard' ? (
                            <AlertCircle className="h-4 w-4 text-danger" />
                          ) : (
                            <Clock className="h-4 w-4 text-warning" />
                          )}
                          <span className="text-sm">{mesure.description}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Échéance: {formatDate(mesure.date_fin_prevue)}</span>
                          {mesure.date_fin_reelle && (
                            <span className="text-success">✓ Réalisée</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ex.etude_securite_url && (
                <div className="mt-3 pt-3 border-t border-border">
                  <a href={ex.etude_securite_url} target="_blank" rel="noopener noreferrer" className="text-role-primary text-sm hover:underline flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Étude de sécurité jointe
                  </a>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderEcartsTab = () => (
    <div className="space-y-4">
      {itemEcarts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Aucun écart constaté</p>
        </div>
      ) : (
        itemEcarts.map((ecart: any) => (
          <div key={ecart.id} className="card">
            <div className="card-header">
              <div className="card-title flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-danger" />
                  <span className="font-semibold">{ecart.reference}</span>
                </div>
                <span className={`badge ${
                  ecart.niveau_risque === 'critique' ? 'danger' :
                  ecart.niveau_risque === 'eleve' ? 'warning' : 'primary'
                }`}>
                  {ecart.niveau_risque}
                </span>
              </div>
            </div>
            <div className="card-content">
              <p className="text-sm">{ecart.libelle}</p>
              <div className="mt-2 text-xs text-muted-foreground">
                <span>Statut: {ecart.statut}</span>
                <span className="mx-2">•</span>
                <span>Délai PAC: {formatDate(ecart.delai_pac)}</span>
              </div>
              {ecart.plan_action && (
                <div className="mt-3 p-3 bg-role-primary-soft rounded-lg">
                  <p className="text-xs font-semibold text-role-primary">Plan d'action</p>
                  <p className="text-sm">{ecart.plan_action}</p>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );

  if (!mounted) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-5xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="border-t-4 border-t-role-primary rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="modal-header bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-role-primary-soft flex items-center justify-center">
                {type === 'certification' ? (
                  <Shield className="h-5 w-5 text-role-primary" />
                ) : (
                  <Scale className="h-5 w-5 text-role-primary" />
                )}
              </div>
              <div>
                <h2 className="text-xl font-semibold">
                  {item.reference} - {aerodrome?.nom}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {type === 'certification' ? 'Certification' : 'Homologation'} terminée le {formatDate(item.updated_at)}
                </p>
              </div>
            </div>
            <button className="modal-close" onClick={onClose}>
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-border px-6 pt-2">
            <div className="flex gap-1 overflow-x-auto">
              <button
                className={`tab px-4 py-2 font-medium transition-all ${activeTab === 'infos' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground'}`}
                onClick={() => setActiveTab('infos')}
              >
                <FileText className="h-4 w-4 inline mr-2" />
                Informations
              </button>
              <button
                className={`tab px-4 py-2 font-medium transition-all ${activeTab === 'timeline' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground'}`}
                onClick={() => setActiveTab('timeline')}
              >
                <Clock className="h-4 w-4 inline mr-2" />
                Timeline
              </button>
              <button
                className={`tab px-4 py-2 font-medium transition-all ${activeTab === 'documents' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground'}`}
                onClick={() => setActiveTab('documents')}
              >
                <FileText className="h-4 w-4 inline mr-2" />
                Documents
              </button>
              <button
                className={`tab px-4 py-2 font-medium transition-all ${activeTab === 'exemptions' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground'}`}
                onClick={() => setActiveTab('exemptions')}
              >
                <Shield className="h-4 w-4 inline mr-2" />
                Exemptions ({itemExemptions.length})
              </button>
              <button
                className={`tab px-4 py-2 font-medium transition-all ${activeTab === 'ecarts' ? 'active border-b-2 border-role-primary text-role-primary' : 'text-muted-foreground'}`}
                onClick={() => setActiveTab('ecarts')}
              >
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Écarts ({itemEcarts.length})
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="modal-body">
            {activeTab === 'infos' && renderInfosTab()}
            {activeTab === 'timeline' && renderTimelineTab()}
            {activeTab === 'documents' && renderDocumentsTab()}
            {activeTab === 'exemptions' && renderExemptionsTab()}
            {activeTab === 'ecarts' && renderEcartsTab()}
          </div>

          {/* Footer */}
          <div className="modal-footer flex justify-end gap-3">
            {onRestore && (
              <button onClick={onRestore} className="btn btn-secondary gap-2">
                <ArchiveRestore className="h-4 w-4" />
                Restaurer ce dossier
              </button>
            )}
            <button onClick={() => window.print()} className="btn btn-secondary gap-2">
              <Download className="h-4 w-4" />
              Exporter PDF
            </button>
            <button onClick={onClose} className="btn btn-primary">
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ArchiveViewer;