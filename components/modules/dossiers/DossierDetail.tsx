'use client';

import React, { useMemo } from 'react';
import {
  X,
  FileText,
  Download,
  History,
  Bell,
  FolderOpen,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DossierDetailProps {
  dossierId: string;
  onClose: () => void;
}

interface DocumentDossier {
  id: string;
  nom: string;
  type: string;
  taille: string;
  dateUpload: string;
  uploadePar: string;
}

interface ActionHistorique {
  id: string;
  type: string;
  date: string;
  acteur: string;
  description: string;
  icon: React.ElementType;
  iconCls: string;
}

// ─── Données simulées ─────────────────────────────────────────────────────────

const DOCUMENTS_DEMO: DocumentDossier[] = [
  {
    id: 'd1',
    nom: 'Rapport_Surveillance_GOBD_2025.pdf',
    type: 'PDF',
    taille: '2.4 Mo',
    dateUpload: '2025-10-12',
    uploadePar: 'Mamadou Diallo',
  },
  {
    id: 'd2',
    nom: 'Checklist_Signee_SS211.pdf',
    type: 'PDF',
    taille: '1.1 Mo',
    dateUpload: '2025-10-12',
    uploadePar: 'Mamadou Diallo',
  },
  {
    id: 'd3',
    nom: 'PAC_Version2_GOBD.docx',
    type: 'DOCX',
    taille: '856 Ko',
    dateUpload: '2025-11-18',
    uploadePar: 'Oumar Seck',
  },
  {
    id: 'd4',
    nom: 'Preuves_Maintenance_SSLIA.zip',
    type: 'ZIP',
    taille: '12.8 Mo',
    dateUpload: '2025-12-02',
    uploadePar: 'Oumar Seck',
  },
  {
    id: 'd5',
    nom: 'Lettre_Notification_Inspecteur.pdf',
    type: 'PDF',
    taille: '320 Ko',
    dateUpload: '2025-10-14',
    uploadePar: 'Système SGDA',
  },
];

const HISTORIQUE_DEMO: ActionHistorique[] = [
  {
    id: 'h1',
    type: 'Création',
    date: '2025-10-10T09:15:00Z',
    acteur: 'Mamadou Diallo',
    description: 'Dossier créé suite à la surveillance terrain GOBD.',
    icon: FolderOpen,
    iconCls: 'text-role-primary',
  },
  {
    id: 'h2',
    type: 'Notification',
    date: '2025-10-14T11:30:00Z',
    acteur: 'Système SGDA',
    description: 'Notification email envoyée à l\'exploitant et au point focal.',
    icon: Bell,
    iconCls: 'text-muted',
  },
  {
    id: 'h3',
    type: 'Document ajouté',
    date: '2025-11-18T14:20:00Z',
    acteur: 'Oumar Seck',
    description: 'PAC version 2 soumis et annexé au dossier.',
    icon: FileText,
    iconCls: 'text-warning',
  },
  {
    id: 'h4',
    type: 'Évaluation',
    date: '2025-11-25T10:00:00Z',
    acteur: 'Mamadou Diallo',
    description: 'PAC évalué et accepté. Note globale : 4.3/5.',
    icon: CheckCircle2,
    iconCls: 'text-success',
  },
  {
    id: 'h5',
    type: 'Rappel',
    date: '2025-12-01T08:00:00Z',
    acteur: 'Système SGDA',
    description: 'Rappel automatique J-7 envoyé pour soumission des preuves.',
    icon: Clock,
    iconCls: 'text-warning',
  },
  {
    id: 'h6',
    type: 'Preuves soumises',
    date: '2025-12-02T16:45:00Z',
    acteur: 'Oumar Seck',
    description: 'Preuves de mise en œuvre soumises (rapport maintenance + photos).',
    icon: Send,
    iconCls: 'text-role-primary',
  },
];

const ICON_TYPE: Record<string, string> = {
  PDF: 'text-danger',
  DOCX: 'text-primary',
  ZIP: 'text-warning',
  XLSX: 'text-success',
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

// ─── Composant ────────────────────────────────────────────────────────────────

export function DossierDetail({ dossierId, onClose }: DossierDetailProps) {
  const dossiers = useAppStore((s) => s.dossiers);
  const aerodromes = useAppStore((s) => s.aerodromes);

  const dossier = useMemo(
    () => dossiers?.find((d) => d.id === dossierId) ?? null,
    [dossiers, dossierId]
  );

  const aerodrome = useMemo(
    () => aerodromes.find((a) => a.id === dossier?.aerodrome_id),
    [aerodromes, dossier]
  );

  const titre = dossier ? `Dossier — ${dossier.reference}` : `Dossier ${dossierId}`;

  return (
    <div className="flex flex-col h-full" data-role="inspector">
      {/* En-tête */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-5 w-5 text-role-primary" />
          <div>
            <h2 className="heading-4 font-semibold">{titre}</h2>
            {aerodrome && (
              <p className="text-small text-muted-foreground">
                {aerodrome.code_oaci} — {aerodrome.nom}
              </p>
            )}
          </div>
          {dossier && (
            <span className="badge neutral text-xs">
              {dossier.statut.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <button onClick={onClose} className="btn btn-ghost p-2 rounded-full">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Onglets */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="tabs mx-4 mt-3">
          <button className="tab active" data-state="active">Informations</button>
          <button className="tab">Documents ({DOCUMENTS_DEMO.length})</button>
          <button className="tab">Historique</button>
          <button className="tab">Notifications</button>
        </div>

        {/* ─── Infos générales ─── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 animate-fade-in">
          {dossier ? (
            <div className="grid grid-cols-2 gap-4 text-body">
              {[
                { label: 'Référence', value: dossier.reference },
                { label: 'Catégorie', value: dossier.categorie },
                { label: 'Service assigné', value: dossier.service_assigne.replace(/_/g, ' ') },
                { label: 'Statut', value: dossier.statut.replace(/_/g, ' ') },
                { label: 'Date instruction', value: dossier.date_instruction?.slice(0, 10) ?? '—' },
                { label: 'Date limite', value: dossier.date_limite?.slice(0, 10) ?? '—' },
                { label: 'Créé le', value: dossier.created_at.slice(0, 10) },
                { label: 'Mis à jour le', value: dossier.updated_at.slice(0, 10) },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{row.label}</p>
                  <p className="font-medium capitalize">{row.value}</p>
                </div>
              ))}
              <div className="col-span-2 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Titre</p>
                <p className="font-medium">{dossier.titre}</p>
              </div>
              {dossier.instructions && (
                <div className="col-span-2 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Instructions</p>
                  <p className="font-medium">{dossier.instructions}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-warning" />
              <p>Dossier introuvable — ID : {dossierId}</p>
              <p className="text-xs mt-1">Les informations détaillées ne sont pas disponibles.</p>
            </div>
          )}
        </div>

        {/* ─── Documents ─── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 hidden">
          {DOCUMENTS_DEMO.map((doc) => (
            <div
              key={doc.id}
              className="card card-compact"
            >
              <div className="flex items-center gap-3">
                <FileText className={`h-5 w-5 ${ICON_TYPE[doc.type] ?? 'text-muted'}`} />
                <div className="flex-1">
                  <p className="text-body font-medium">{doc.nom}</p>
                  <p className="text-small text-muted-foreground">
                    {doc.type} · {doc.taille} · Uploadé par {doc.uploadePar} le {doc.dateUpload}
                  </p>
                </div>
                <button className="btn btn-ghost p-2 rounded-full shrink-0">
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Historique ─── */}
        <div className="flex-1 overflow-y-auto p-4 hidden">
          <div className="timeline">
            {HISTORIQUE_DEMO.map((action) => {
              const Icone = action.icon;
              return (
                <div key={action.id} className="timeline-item">
                  <div className={`timeline-dot ${action.iconCls.includes('success') ? 'timeline-dot-success' : action.iconCls.includes('warning') ? 'timeline-dot-warning' : action.iconCls.includes('danger') ? 'timeline-dot-danger' : ''}`}>
                    <Icone className="h-3 w-3" />
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-date">
                      {formatDate(action.date)}
                    </div>
                    <div className="timeline-title">{action.type}</div>
                    <p className="text-small text-muted-foreground">{action.acteur}</p>
                    <p className="text-body">{action.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Notifications ─── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 hidden">
          {[
            { canal: 'Email', destinataire: 'oumar.seck@gobd.sn', date: '2025-10-14', objet: 'Notification écart — SURV-2025-087', statut: 'Envoyé' },
            { canal: 'SMS', destinataire: '+221 77 456 78 90', date: '2025-12-01', objet: 'Rappel délai PAC — J-7', statut: 'Envoyé' },
            { canal: 'In-App', destinataire: 'Mamadou Diallo', date: '2025-11-25', objet: 'PAC accepté — dossier mis à jour', statut: 'Lu' },
          ].map((notif, i) => (
            <div key={i} className="card card-compact">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-body font-medium">{notif.objet}</p>
                  <p className="text-small text-muted-foreground">
                    {notif.canal} → {notif.destinataire} · {notif.date}
                  </p>
                </div>
                <span className="badge outline text-xs shrink-0">{notif.statut}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DossierDetail;