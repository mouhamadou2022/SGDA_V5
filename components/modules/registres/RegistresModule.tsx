// components/modules/registre/RegistreModule.tsx
// VERSION FINALE - Design inspiré de AerodromesModule
// Accordéons par année et par aérodrome/inspecteur/type
// Barre d'outils sur une seule ligne
// IA intégrée (assistant, analyse besoins formation)

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FormShell } from '@/components/ui/FormShell';
import { AccordionSection, AccordionGroup, AccordionSubGroup, AccordionSubItem } from '@/components/ui/AccordionSection';
import {
  Archive,
  Search,
  Grid3x3,
  List,
  Plus,
  Eye,
  Trash2,
  Download,
  Shield,
  Scale,
  AlertTriangle,
  Clock,
  MapPin,
  Globe,
  Brain,
  Loader2,
  Send,
  Sparkles,
  GraduationCap,
  AlertCircle,
  Calendar,
  User,
  FileText,
  History,
  Link2,
  PenSquare,
  CheckCircle,
  XCircle,
  FileCheck,
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Minus,
  ClipboardList,
  FileSignature,
  Building2,
  Phone,
  Mail,
  UserCheck,
  Printer,
} from 'lucide-react';
import { useAppStore, RegistreEntry, CertificationMetadata, HomologationMetadata } from '@/lib/store';
import type { TrainingNeedsAnalysisResult } from '@/lib/ia/agents/registreAgent';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { registreAgent } from '@/lib/ia/agents/registreAgent';
import { RegistreForm } from '@/components/forms/RegistreForm';
import { exportElementToPDF } from '@/lib/pdfGenerator';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

interface RegistreModuleProps {
  userRole?: string;
  user?: { role?: string; id?: string; prenom?: string; nom?: string };
}

type ViewMode = 'liste' | 'grille';
type TabType = 'dashboard' | 'certifications' | 'homologations' | 'surveillances' | 'ecarts' | 'evenements' | 'formations' | 'documents';

const TAB_CONFIG: { id: TabType; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard, description: 'Vue d\'ensemble du registre' },
  { id: 'certifications', label: 'Certifications', icon: Shield, description: 'Aérodromes internationaux certifiés' },
  { id: 'homologations', label: 'Homologations', icon: Scale, description: 'Aérodromes nationaux homologués' },
  { id: 'surveillances', label: 'Surveillances', icon: Eye, description: 'Rapports de surveillance archivés' },
  { id: 'ecarts', label: 'Écarts & PAC', icon: AlertTriangle, description: 'Non-conformités clôturées' },
  { id: 'evenements', label: 'Événements', icon: AlertCircle, description: 'Incidents et accidents clôturés' },
  { id: 'formations', label: 'Formations', icon: GraduationCap, description: 'Formations des inspecteurs' },
  { id: 'documents', label: 'Documents', icon: FileText, description: 'Décrets, notes, lettres officielles' },
];

// Types d'entrées pour les badges
const ENTRY_TYPE_LABELS: Record<string, { label: string; badgeClass: string }> = {
  certification: { label: 'Certification', badgeClass: 'badge success' },
  homologation: { label: 'Homologation', badgeClass: 'badge primary' },
  surveillance: { label: 'Surveillance', badgeClass: 'badge info' },
  evenement: { label: 'Événement', badgeClass: 'badge warning' },
  ecart: { label: 'Écart', badgeClass: 'badge danger' },
  formation: { label: 'Formation', badgeClass: 'badge teal' },
  document: { label: 'Document', badgeClass: 'badge neutral' },
};

// Badge de risque
const getRiskBadgeClass = (niveau: string, score?: number) => {
  switch(niveau) {
    case 'faible': return 'risk-badge faible';
    case 'moyen': return 'risk-badge moyen';
    case 'eleve': return 'risk-badge eleve';
    case 'critique': return 'risk-badge critique';
    default: return 'badge neutral';
  }
};

// Badge de gravité événement
const getGraviteBadgeClass = (gravite: string) => {
  switch(gravite) {
    case 'CRITIQUE': return 'badge danger';
    case 'ORANGE': return 'badge warning';
    case 'JAUNE': return 'badge warning';
    case 'BLEU': return 'badge info';
    case 'GRIS': return 'badge neutral';
    default: return 'badge primary';
  }
};

// ─── Helpers timeline + fichiers + PDF ──────────────────────────────────────

interface TimelineStep { id: string; etape: string; date: string; acteur: string; acteur_role: string; details?: string; fichiers?: { nom: string; url: string }[] }

function construireTimelineSurveillance(s: any): TimelineStep[] {
  const steps: TimelineStep[] = [{ id: '1', etape: 'Planification', date: s.created_at || s.date_debut, acteur: '—', acteur_role: 'Système', details: 'Surveillance planifiée' }]
  if (s.date_debut) steps.push({ id: '2', etape: 'Début surveillance', date: s.date_debut, acteur: '—', acteur_role: 'Système', details: `Début le ${new Date(s.date_debut).toLocaleDateString('fr-FR')}` })
  if (s.date_fin) steps.push({ id: '3', etape: 'Fin surveillance', date: s.date_fin, acteur: '—', acteur_role: 'Système', details: `Fin le ${new Date(s.date_fin).toLocaleDateString('fr-FR')}` })
  if (s.statut === 'transmise' || s.statut === 'archivee') steps.push({ id: '4', etape: `Transmise`, date: s.transmitted_at || s.updated_at, acteur: '—', acteur_role: 'Système', details: 'Transmise au portail exploitant' })
  steps.push({ id: '5', etape: 'Archivée', date: s.updated_at, acteur: '—', acteur_role: 'Système', details: 'Archivée dans le registre' })
  return steps
}

function construireTimelineEcart(e: any): TimelineStep[] {
  const steps: TimelineStep[] = [{ id: '1', etape: 'Création', date: e.created_at, acteur: '—', acteur_role: 'Système', details: e.libelle }]
  if (e.statut !== 'ouvert') steps.push({ id: '2', etape: 'PAC soumis', date: e.pac?.soumis_le || e.updated_at, acteur: e.pac?.soumis_par || '—', acteur_role: 'Exploitant', details: 'PAC soumis pour évaluation' })
  if (e.evaluation_pac) steps.push({ id: '3', etape: 'PAC évalué', date: e.evaluation_pac.evalue_le, acteur: e.evaluation_pac.evalue_par || '—', acteur_role: 'Inspecteur', details: `Note: ${e.evaluation_pac.note_globale}/10 — ${e.evaluation_pac.decision}` })
  if (e.cloture_le) steps.push({ id: '4', etape: 'Clôturé', date: e.cloture_le, acteur: '—', acteur_role: 'Système', details: 'Écart clôturé' })
  return steps
}

function construireTimelineEvenement(ev: any): TimelineStep[] {
  const steps: TimelineStep[] = [{ id: '1', etape: 'Déclaration', date: ev.created_at, acteur: '—', acteur_role: 'Système', details: ev.type }]
  if (ev.statut !== 'recu') steps.push({ id: '2', etape: 'En cours', date: ev.updated_at, acteur: '—', acteur_role: 'Système', details: 'Prise en charge' })
  if (ev.analyse_preliminaire) steps.push({ id: '3', etape: 'Analyse', date: ev.updated_at, acteur: '—', acteur_role: 'Inspecteur', details: ev.analyse_preliminaire.substring(0, 100) })
  if (ev.classification) steps.push({ id: '4', etape: 'Classification', date: ev.updated_at, acteur: '—', acteur_role: 'Inspecteur', details: ev.classification === 'incident_grave' ? 'Incident grave' : ev.classification })
  if (ev.date_cloture) steps.push({ id: '5', etape: 'Clôturé', date: ev.date_cloture, acteur: '—', acteur_role: 'Système', details: 'Événement clôturé' })
  return steps
}

function construireTimelineFormation(f: any): TimelineStep[] {
  const steps: TimelineStep[] = [{ id: '1', etape: 'Planifiée', date: f.created_at, acteur: '—', acteur_role: 'Système', details: f.titre }]
  if (f.date) steps.push({ id: '2', etape: 'Réalisée', date: f.date, acteur: '—', acteur_role: 'Système', details: `Le ${new Date(f.date).toLocaleDateString('fr-FR')}` })
  if (f.statut === 'terminee') steps.push({ id: '3', etape: 'Terminée', date: f.updated_at, acteur: '—', acteur_role: 'Système', details: 'Formation terminée' })
  return steps
}

function extraireFichiersSurveillance(s: any): { nom: string; url: string }[] {
  const fichiers: { nom: string; url: string }[] = []
  if (s.rapport_fichier_url) fichiers.push({ nom: s.rapport_fichier_nom || 'rapport.pdf', url: s.rapport_fichier_url })
  if (s.rapport_sig_url) fichiers.push({ nom: 'rapport_signe.pdf', url: s.rapport_sig_url })
  return fichiers
}

function extraireFichiersEcart(e: any): { nom: string; url: string }[] {
  const fichiers: { nom: string; url: string }[] = []
  if (e.pac?.fichiers) fichiers.push(...e.pac.fichiers)
  return fichiers
}

function extraireFichiersEvenement(ev: any): { nom: string; url: string }[] {
  const fichiers: { nom: string; url: string }[] = []
  if (ev.rapport_final_url) fichiers.push({ nom: 'rapport_final.pdf', url: ev.rapport_final_url })
  return fichiers
}

function extraireFichiersFormation(f: any): { nom: string; url: string }[] {
  return (f.documents || []).map((d: any) => ({ nom: d.nom, url: d.url }))
}

function TimelineSection({ steps }: { steps: TimelineStep[] }) {
  if (!steps.length) return null
  return (
    <div>
      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2"><History className="w-4 h-4 text-role-primary" />Chronologie</h4>
      <div className="timeline">
        {steps.map((step, idx) => (
          <div key={step.id} className="timeline-item">
            <div className={`timeline-dot ${idx === steps.length - 1 ? 'timeline-dot-success' : 'timeline-dot-primary'}`} />
            <div className="timeline-content">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-medium text-sm">{step.etape}</span>
                <span className="text-xs text-muted-foreground">{new Date(step.date).toLocaleDateString('fr-FR')}</span>
              </div>
              {step.details && <p className="text-xs text-muted-foreground mt-1">{step.details}</p>}
              {step.fichiers?.length ? <div className="flex gap-2 mt-2">{step.fichiers.map((f, i) => <button key={i} onClick={() => window.open(f.url, '_blank')} className="text-xs text-primary hover:underline">📎 {f.nom}</button>)}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FichiersSection({ fichiers }: { fichiers: { nom: string; url: string }[] }) {
  if (!fichiers.length) return null
  return (
    <div>
      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-role-primary" />Documents joints</h4>
      <div className="space-y-2">
        {fichiers.map((f, idx) => (
          <div key={idx} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg">
            <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-role-primary" /><span className="text-sm">{f.nom}</span></div>
            <button onClick={() => window.open(f.url, '_blank')} className="action-button hover:scale-105"><Download className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExportPDFButton({ elementId, filename }: { elementId: string; filename: string }) {
  const [exporting, setExporting] = useState(false)
  return (
    <button className="btn btn-sm btn-secondary gap-1.5" onClick={async () => {
      setExporting(true)
      await exportElementToPDF(elementId, filename)
      setExporting(false)
    }} disabled={exporting}>
      {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
      {exporting ? 'Export...' : 'Exporter PDF'}
    </button>
  )
}

// ============================================================
// SOUS-ONGLET: DASHBOARD (Tableau de bord)
// ============================================================
function DashboardTab() {
  const registreEntries = useAppStore((s) => s.registreEntries);
  const certifications = useAppStore((s) => s.certifications);
  const homologations = useAppStore((s) => s.homologations);
  const surveillances = useAppStore((s) => s.surveillances);
  const ecarts = useAppStore((s) => s.ecarts);
  const evenements = useAppStore((s) => s.evenements);
  const formations = useAppStore((s) => s.formations);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const [selectedEntry, setSelectedEntry] = useState<RegistreEntry | null>(null);
  
  const stats = useMemo(() => ({
    total: registreEntries?.length || 0,
    certifications: certifications?.filter(c => c.statut_global === 'certifie').length || 0,
    homologations: homologations?.filter(h => h.statut_global === 'homologue').length || 0,
    surveillances: surveillances?.filter(s => s.statut === 'transmise' || s.statut === 'archivee').length || 0,
    ecarts: ecarts?.filter(e => e.statut === 'cloture').length || 0,
    evenements: evenements?.filter(e => e.statut === 'cloture').length || 0,
    formations: formations?.filter(f => f.statut === 'terminee').length || 0,
    documents: registreEntries?.filter(e => e.type === 'document').length || 0,
  }), [registreEntries, certifications, homologations, surveillances, ecarts, evenements, formations]);
  
  // Entrées par mois pour le graphique (tendance)
  const entriesByMonth = useMemo(() => {
    const months: Record<string, number> = {};
    const last6Months = [];
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months[key] = 0;
      last6Months.push(key);
    }
    (registreEntries || []).forEach(entry => {
      const month = entry.date_entree.slice(0, 7);
      if (months[month] !== undefined) months[month]++;
    });
    return last6Months.map(m => ({ month: m, count: months[m] || 0 }));
  }, [registreEntries]);
  
  // Dernières entrées
  const recentEntries = useMemo(() => {
    return [...(registreEntries || [])]
      .sort((a, b) => new Date(b.date_entree).getTime() - new Date(a.date_entree).getTime())
      .slice(0, 5);
  }, [registreEntries]);
  
  const maxCount = Math.max(...entriesByMonth.map(e => e.count), 1);
  
  return (<>
    <div className="space-y-6">
      {/* Graphique tendance */}
      <div className="card border-border">
        <div className="card-header">
          <div className="card-title text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-role-primary" />
            Évolution des entrées (6 derniers mois)
          </div>
        </div>
        <div className="card-content">
          <div className="flex items-end gap-2 h-32">
            {entriesByMonth.map((item, idx) => {
              const height = (item.count / maxCount) * 100;
              const monthName = new Date(item.month + '-01').toLocaleDateString('fr-FR', { month: 'short' });
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full bg-role-primary-soft rounded-t-lg transition-all duration-300 hover:bg-role-primary" style={{ height: `${height}%`, minHeight: '4px' }} />
                  <span className="text-xs text-muted-foreground">{monthName}</span>
                  <span className="text-xs font-medium">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Dernières entrées */}
      <div className="card border-border">
        <div className="card-header">
          <div className="card-title text-base flex items-center gap-2">
            <Clock className="w-4 h-4 text-role-primary" />
            Dernières entrées
          </div>
        </div>
        <div className="card-content">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr className="border-b border-border">
                  <th>Référence</th>
                  <th>Titre</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map(entry => {
                  const typeInfo = ENTRY_TYPE_LABELS[entry.type] || ENTRY_TYPE_LABELS.document;
                  return (
                    <tr key={entry.id} className="border-b border-border hover:bg-role-primary-soft">
                      <td className="code-oaci-badge text-xs">{entry.reference}</td>
                      <td className="text-foreground">{entry.titre}</td>
                      <td><span className={typeInfo.badgeClass}>{typeInfo.label}</span></td>
                      <td className="text-muted-foreground">{new Date(entry.date_entree).toLocaleDateString('fr-FR')}</td>
                      <td className="text-right">
                        <button className="action-button hover:scale-105 transition-all duration-200" title="Voir détails" onClick={() => setSelectedEntry(entry)}>
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    {/* Modal détail entrée */}
    <FormShell
      open={!!selectedEntry}
      onClose={() => setSelectedEntry(null)}
      title={selectedEntry ? `Détail — ${selectedEntry.titre}` : ''}
      icon={History}
      size="3xl"
      footer={<button className="btn btn-secondary" onClick={() => setSelectedEntry(null)}>Fermer</button>}
    >
      {selectedEntry && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="code-oaci-badge">{selectedEntry.reference}</span>
            <span className={ENTRY_TYPE_LABELS[selectedEntry.type]?.badgeClass || 'badge neutral'}>
              {ENTRY_TYPE_LABELS[selectedEntry.type]?.label || selectedEntry.type}
            </span>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(selectedEntry.date_entree).toLocaleDateString('fr-FR')}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-base text-foreground">{selectedEntry.titre}</h3>
            <p className="text-sm text-muted-foreground mt-1">{selectedEntry.description}</p>
          </div>
          {selectedEntry.timeline && selectedEntry.timeline.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-role-primary" />Chronologie
              </h4>
              <div className="space-y-3">
                {selectedEntry.timeline.map((step, idx) => (
                  <div key={step.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mt-1 ${idx === selectedEntry.timeline.length - 1 ? 'bg-success' : 'bg-role-primary'}`} />
                      {idx < selectedEntry.timeline.length - 1 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                    </div>
                    <div className="pb-3 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm">{step.etape}</span>
                        <span className="text-xs text-muted-foreground">{new Date(step.date).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Par : {step.acteur} ({step.acteur_role})</p>
                      {step.details && <p className="text-sm mt-1">{step.details}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedEntry.fichiers && selectedEntry.fichiers.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-role-primary" />Documents joints
              </h4>
              <div className="space-y-2">
                {selectedEntry.fichiers.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg">
                    <span className="text-sm flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-role-primary" />{f.nom}</span>
                    <button onClick={() => window.open(f.url, '_blank')} className="action-button">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </FormShell>
  </>
  );
}

// ============================================================
// SOUS-ONGLET: CERTIFICATIONS (par année puis aérodrome)
// ============================================================
function CertificationsTab({ onEdit }: { onEdit?: (entry: any) => void }) {
  const allCertifications = useAppStore((s) => s.certifications);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const registreEntries = useAppStore((s) => s.registreEntries);
  const deleteRegistreEntry = useAppStore((s) => s.deleteRegistreEntry);
  const [selectedCert, setSelectedCert] = useState<any | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const groupedData = useMemo(() => {
    const byYear: Record<string, any[]> = {};
    const certMap = new Map(allCertifications?.map(c => [c.id, c]) || [])
    const certRegistreEntries = registreEntries?.filter(e => e.type === 'certification') || []
    certRegistreEntries.forEach(entry => {
      const sourceCert = certMap.get(entry.source_id || '')
      const year = entry.date_entree?.slice(0, 4) || new Date().getFullYear().toString()
      if (!byYear[year]) byYear[year] = []
      const aerodrome = aerodromes.find(a => a.id === entry.aerodrome_id)
      byYear[year].push({ ...sourceCert, aerodrome, registreEntry: entry, id: entry.id })
    })
    return Object.entries(byYear).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [allCertifications, registreEntries, aerodromes]);

  const handleDeleteCert = (entryId: string) => {
    deleteRegistreEntry(entryId)
    setConfirmDeleteId(null)
  }
  
  const getStatutBadge = (statut: string) => {
    switch(statut) {
      case 'certifie': return 'badge success';
      case 'expire': return 'badge danger';
      case 'suspendu': return 'badge warning';
      default: return 'badge primary';
    }
  };
  
  const getStatutLabel = (statut: string) => {
    switch(statut) {
      case 'certifie': return 'Certifié';
      case 'expire': return 'Expiré';
      case 'suspendu': return 'Suspendu';
      default: return 'En cours';
    }
  };
  
  const getJoursRestants = (dateExpiration: string | undefined) => {
    if (!dateExpiration) return null;
    const jours = Math.floor((new Date(dateExpiration).getTime() - Date.now()) / 86400000);
    return jours;
  };
  
  return (<>
    <AccordionGroup spacing="md">
      {groupedData.map(([year, certs]) => {
        const aerodromeGroups: Record<string, any[]> = {};
        certs.forEach(cert => {
          const key = cert.aerodrome?.id || 'inconnu';
          if (!aerodromeGroups[key]) aerodromeGroups[key] = [];
          aerodromeGroups[key].push(cert);
        });
        
        return (
          <AccordionSection
            key={year}
            icon={<Calendar className="w-5 h-5 text-role-primary" />}
            title={`Année ${year}`}
            badges={<span className="badge outline">{certs.length} certification(s)</span>}
          >
            <AccordionSubGroup>
              {Object.entries(aerodromeGroups).map(([aerodromeId, aerodromeCerts]) => {
                const aerodrome = aerodromes.find(a => a.id === aerodromeId);
                
                return (
                  <AccordionSubItem
                    key={aerodromeId}
                    itemKey={aerodromeId}
                    title={`${aerodrome?.nom} (${aerodrome?.code_oaci})`}
                    badges={<span className="badge outline">{aerodromeCerts.length}</span>}
                  >
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>N° Certificat</th>
                            <th>Délivrance</th>
                            <th>Expiration</th>
                            <th>Statut</th>
                            <th className="text-right">Jours restants</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aerodromeCerts.map((cert) => {
                            const meta = cert.registreEntry?.metadata as CertificationMetadata | undefined
                            const numCert = cert.registreEntry?.metadata?.numero_certificat || cert.numero_cert || '-'
                            const dateDelivrance = cert.registreEntry?.metadata?.date_delivrance || cert.date_delivrance?.slice(0, 10) || '-'
                            const statut = cert.registreEntry?.metadata?.statut_officiel || cert.statut_global || 'en_cours'
                            const dateExpiration = cert.date_expiration?.slice(0, 10)
                            const joursRestants = getJoursRestants(cert.date_expiration);
                            return (
                              <tr key={cert.id} className="border-b border-border hover:bg-role-primary-soft">
                                <td className="font-mono text-xs">{numCert}</td>
                                <td>{dateDelivrance.slice(0, 10)}</td>
                                <td>{dateExpiration || '-'}</td>
                                <td>
                                  <span className={getStatutBadge(statut)}>
                                    {statut === 'revoque' ? 'Révoqué' : statut === 'suspendu' ? 'Suspendu' : statut === 'annule' ? 'Annulé' : getStatutLabel(statut)}
                                  </span>
                                  {meta?.restriction && (
                                    <span className="ml-1 badge warning" title={meta.restriction}>⚠</span>
                                  )}
                                </td>
                                <td className="text-right">
                                  {joursRestants !== null && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${joursRestants < 0 ? 'badge danger' : joursRestants < 60 ? 'badge warning' : 'badge success'}`}>
                                      {joursRestants < 0 ? 'Expiré' : `${joursRestants} j`}
                                    </span>
                                  )}
                                </td>
                                <td className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <button className="action-button hover:scale-105 transition-all duration-200" title="Voir détails" onClick={() => setSelectedCert({ ...cert, aerodrome })}>
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      className="action-button hover:scale-105 transition-all duration-200 text-role-primary"
                                      title="Modifier"
                                      onClick={() => onEdit?.(cert.registreEntry || cert)}
                                    >
                                      <PenSquare className="w-4 h-4" />
                                    </button>
                                    {confirmDeleteId === cert.id ? (
                                      <div className="flex items-center gap-1">
                                        <button className="action-button text-danger" title="Confirmer" onClick={() => handleDeleteCert(cert.id)}>
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                        <button className="action-button text-muted-foreground" title="Annuler" onClick={() => setConfirmDeleteId(null)}>
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button className="action-button hover:scale-105 transition-all duration-200 text-danger" title="Supprimer" onClick={() => setConfirmDeleteId(cert.id)}>
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </AccordionSubItem>
                );
              })}
            </AccordionSubGroup>
          </AccordionSection>
        );
      })}
      
      {groupedData.length === 0 && (
        <div className="card">
          <div className="card-content py-12 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucune certification enregistrée</p>
          </div>
        </div>
      )}
    </AccordionGroup>

    {/* Modal détails certification */}
    <FormShell
      open={!!selectedCert}
      onClose={() => setSelectedCert(null)}
      title={selectedCert ? `Certification — ${selectedCert.aerodrome?.nom || 'Aérodrome inconnu'}` : ''}
      icon={Shield}
      size="2xl"
      footer={<button className="btn btn-secondary" onClick={() => setSelectedCert(null)}>Fermer</button>}
    >
      {selectedCert && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Aérodrome</p>
              <p className="font-semibold text-sm">{selectedCert.aerodrome?.nom || '—'}</p>
              <p className="text-xs text-muted-foreground">{selectedCert.aerodrome?.code_oaci || ''}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">N° Certificat</p>
              <p className="font-semibold text-sm font-mono">{selectedCert.registreEntry?.metadata?.numero_certificat || selectedCert.numero_cert || '—'}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Date de délivrance</p>
              <p className="font-semibold text-sm">{(selectedCert.registreEntry?.metadata?.date_delivrance || selectedCert.date_delivrance || '—').slice(0, 10)}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Date d'expiration</p>
              <p className="font-semibold text-sm">{selectedCert.date_expiration?.slice(0, 10) || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Statut :</span>
            <span className={getStatutBadge(selectedCert.registreEntry?.metadata?.statut_officiel || selectedCert.statut_global)}>
              {(() => {
                const s = selectedCert.registreEntry?.metadata?.statut_officiel || selectedCert.statut_global
                if (s === 'revoque') return 'Révoqué'
                if (s === 'suspendu') return 'Suspendu'
                if (s === 'annule') return 'Annulé'
                return getStatutLabel(s)
              })()}
            </span>
            {(() => {
              const j = selectedCert.date_expiration
                ? Math.floor((new Date(selectedCert.date_expiration).getTime() - Date.now()) / 86400000)
                : null;
              if (j === null) return null;
              return (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${j < 0 ? 'badge danger' : j < 60 ? 'badge warning' : 'badge success'}`}>
                  {j < 0 ? 'Expiré' : `${j} jour(s) restant(s)`}
                </span>
              );
            })()}
          </div>
          {(() => {
            const meta = selectedCert.registreEntry?.metadata as CertificationMetadata | undefined
            if (!meta) return null
            return (<>
              {meta.reference_aip && (
                <div className="p-3 bg-role-primary-soft rounded-xl">
                  <p className="text-xs text-muted-foreground mb-1">Référence AIP</p>
                  <p className="font-semibold text-sm">{meta.reference_aip}</p>
                </div>
              )}
              {meta.restriction && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs text-amber-700 font-semibold mb-1">Restriction</p>
                  <p className="text-sm text-amber-800">{meta.restriction}</p>
                </div>
              )}
              {meta.exemption?.numero && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <p className="text-xs text-purple-700 font-semibold mb-1">Exemption {meta.exemption.numero}</p>
                  <p className="text-sm text-purple-800">{meta.exemption.type} — {meta.exemption.date?.slice(0, 10)}</p>
                </div>
              )}
            </>)
          })()}
        </div>
      )}
    </FormShell>
  </>);
}

// ============================================================
// SOUS-ONGLET: HOMOLOGATIONS
// ============================================================
function HomologationsTab({ onEdit }: { onEdit?: (entry: any) => void }) {
  const allHomologations = useAppStore((s) => s.homologations);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const registreEntries = useAppStore((s) => s.registreEntries);
  const deleteRegistreEntry = useAppStore((s) => s.deleteRegistreEntry);
  const [selectedHomo, setSelectedHomo] = useState<any | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  const groupedData = useMemo(() => {
    const byYear: Record<string, any[]> = {};
    const homoMap = new Map(allHomologations?.map(h => [h.id, h]) || [])
    const homoRegistreEntries = registreEntries?.filter(e => e.type === 'homologation') || []
    homoRegistreEntries.forEach(entry => {
      const sourceHomo = homoMap.get(entry.source_id || '')
      const year = entry.date_entree?.slice(0, 4) || new Date().getFullYear().toString()
      if (!byYear[year]) byYear[year] = []
      const aerodrome = aerodromes.find(a => a.id === entry.aerodrome_id)
      byYear[year].push({ ...sourceHomo, aerodrome, registreEntry: entry, id: entry.id })
    })
    return Object.entries(byYear).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [allHomologations, registreEntries, aerodromes]);

  const handleDeleteHomo = (entryId: string) => {
    deleteRegistreEntry(entryId)
    setConfirmDeleteId(null)
  }
  
  const getStatutBadge = (statut: string) => {
    switch(statut) {
      case 'homologue': return 'badge success';
      case 'expire': return 'badge danger';
      case 'suspendu': return 'badge warning';
      default: return 'badge primary';
    }
  };
  
  const getStatutLabel = (statut: string) => {
    switch(statut) {
      case 'homologue': return 'Homologué';
      case 'expire': return 'Expiré';
      case 'suspendu': return 'Suspendu';
      default: return 'En cours';
    }
  };
  
  return (<>
    <AccordionGroup spacing="md">
      {groupedData.map(([year, homos]) => {
        const aerodromeGroups: Record<string, any[]> = {};
        homos.forEach(homo => {
          const key = homo.aerodrome?.id || 'inconnu';
          if (!aerodromeGroups[key]) aerodromeGroups[key] = [];
          aerodromeGroups[key].push(homo);
        });
        
        return (
          <AccordionSection
            key={year}
            icon={<Calendar className="w-5 h-5 text-role-primary" />}
            title={`Année ${year}`}
            badges={<span className="badge outline">{homos.length} homologation(s)</span>}
          >
            <AccordionSubGroup>
              {Object.entries(aerodromeGroups).map(([aerodromeId, aerodromeHomos]) => {
                const aerodrome = aerodromes.find(a => a.id === aerodromeId);
                
                return (
                  <AccordionSubItem
                    key={aerodromeId}
                    itemKey={aerodromeId}
                    title={`${aerodrome?.nom} (${aerodrome?.code_oaci})`}
                    badges={<span className="badge outline">{aerodromeHomos.length}</span>}
                  >
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>N° Décision</th>
                            <th>Délivrance</th>
                            <th>Expiration</th>
                            <th>Statut</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aerodromeHomos.map(homo => {
                            const meta = homo.registreEntry?.metadata as HomologationMetadata | undefined
                            const numDecision = meta?.numero_decision || homo.numero_decision || '-'
                            const dateDelivrance = meta?.date_delivrance || homo.date_delivrance?.slice(0, 10) || '-'
                            const statut = meta?.statut_officiel || homo.statut_global || 'en_cours'
                            return (
                            <tr key={homo.id} className="border-b border-border hover:bg-role-primary-soft">
                              <td className="font-mono text-xs">{numDecision}</td>
                              <td>{dateDelivrance.slice(0, 10)}</td>
                              <td>{homo.date_expiration?.slice(0, 10) || '-'}</td>
                              <td>
                                <span className={getStatutBadge(statut === 'revoque' || statut === 'annule' ? 'expire' : statut)}>
                                  {statut === 'revoque' ? 'Révoqué' : statut === 'suspendu' ? 'Suspendu' : statut === 'annule' ? 'Annulé' : getStatutLabel(statut)}
                                </span>
                                {meta?.restriction && (
                                  <span className="ml-1 badge warning" title={meta.restriction}>⚠</span>
                                )}
                              </td>
                              <td className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button className="action-button hover:scale-105 transition-all duration-200" title="Voir détails" onClick={() => setSelectedHomo({ ...homo, aerodrome })}>
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    className="action-button hover:scale-105 transition-all duration-200 text-role-primary"
                                    title="Modifier"
                                    onClick={() => onEdit?.(homo.registreEntry || homo)}
                                  >
                                    <PenSquare className="w-4 h-4" />
                                  </button>
                                  {confirmDeleteId === homo.id ? (
                                    <div className="flex items-center gap-1">
                                      <button className="action-button text-danger" title="Confirmer" onClick={() => handleDeleteHomo(homo.id)}>
                                        <CheckCircle className="w-4 h-4" />
                                      </button>
                                      <button className="action-button text-muted-foreground" title="Annuler" onClick={() => setConfirmDeleteId(null)}>
                                        <XCircle className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button className="action-button hover:scale-105 transition-all duration-200 text-danger" title="Supprimer" onClick={() => setConfirmDeleteId(homo.id)}>
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )})}
                        </tbody>
                      </table>
                    </div>
                  </AccordionSubItem>
                );
              })}
            </AccordionSubGroup>
          </AccordionSection>
        );
      })}
      
      {groupedData.length === 0 && (
        <div className="card">
          <div className="card-content py-12 text-center text-muted-foreground">
            <Scale className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucune homologation enregistrée</p>
          </div>
        </div>
      )}
    </AccordionGroup>

    {/* Modal détails homologation */}
    <FormShell
      open={!!selectedHomo}
      onClose={() => setSelectedHomo(null)}
      title={selectedHomo ? `Homologation — ${selectedHomo.aerodrome?.nom || 'Aérodrome inconnu'}` : ''}
      icon={Scale}
      size="2xl"
      footer={<button className="btn btn-secondary" onClick={() => setSelectedHomo(null)}>Fermer</button>}
    >
      {selectedHomo && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Aérodrome</p>
              <p className="font-semibold text-sm">{selectedHomo.aerodrome?.nom || '—'}</p>
              <p className="text-xs text-muted-foreground">{selectedHomo.aerodrome?.code_oaci || ''}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">N° Décision</p>
              <p className="font-semibold text-sm font-mono">{selectedHomo.registreEntry?.metadata?.numero_decision || selectedHomo.numero_decision || '—'}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Date de délivrance</p>
              <p className="font-semibold text-sm">{(selectedHomo.registreEntry?.metadata?.date_delivrance || selectedHomo.date_delivrance || '—').slice(0, 10)}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Date d'expiration</p>
              <p className="font-semibold text-sm">{selectedHomo.date_expiration?.slice(0, 10) || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-muted-foreground">Statut :</span>
            <span className={getStatutBadge(
              (selectedHomo.registreEntry?.metadata?.statut_officiel === 'revoque' || selectedHomo.registreEntry?.metadata?.statut_officiel === 'annule') ? 'expire' :
              selectedHomo.registreEntry?.metadata?.statut_officiel === 'suspendu' ? 'suspendu' :
              selectedHomo.statut_global
            )}>
              {(() => {
                const s = selectedHomo.registreEntry?.metadata?.statut_officiel || selectedHomo.statut_global
                if (s === 'revoque') return 'Révoqué'
                if (s === 'suspendu') return 'Suspendu'
                if (s === 'annule') return 'Annulé'
                return getStatutLabel(s)
              })()}
            </span>
          </div>
          {(() => {
            const meta = selectedHomo.registreEntry?.metadata as HomologationMetadata | undefined
            if (!meta) return null
            return (<>
              {meta.restriction && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-xs text-amber-700 font-semibold mb-1">Restriction</p>
                  <p className="text-sm text-amber-800">{meta.restriction}</p>
                </div>
              )}
              {meta.exemption?.numero && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl">
                  <p className="text-xs text-purple-700 font-semibold mb-1">Exemption {meta.exemption.numero}</p>
                  <p className="text-sm text-purple-800">{meta.exemption.type} — {meta.exemption.date?.slice(0, 10)}</p>
                </div>
              )}
            </>)
          })()}
        </div>
      )}
    </FormShell>
  </>);
}

// ============================================================
// SOUS-ONGLET: SURVEILLANCES
// ============================================================
function SurveillancesTab() {
  const surveillances = useAppStore((s) => s.surveillances);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const [selectedSurv, setSelectedSurv] = useState<any | null>(null);
  const [modalMode, setModalMode] = useState<'checklist' | 'rapport' | 'details' | null>(null);

  const archivedSurveillances = useMemo(() => {
    return surveillances.filter(s => s.statut === 'transmise' || s.statut === 'archivee');
  }, [surveillances]);
  
  const groupedData = useMemo(() => {
    const byYear: Record<string, any[]> = {};
    archivedSurveillances.forEach(surv => {
      const year = surv.date_debut?.slice(0, 4) || new Date(surv.created_at).getFullYear().toString();
      if (!byYear[year]) byYear[year] = [];
      const aerodrome = aerodromes.find(a => a.id === surv.aerodrome_id);
      byYear[year].push({ ...surv, aerodrome });
    });
    return Object.entries(byYear).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [archivedSurveillances, aerodromes]);
  
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      programmee: 'Programmée',
      inopinee: 'Inopinée',
      speciale: 'Spéciale',
      suivi_ecarts: 'Suivi écarts',
      mise_oeuvre_pac: 'Mise œuvre PAC',
      certification: 'Certification',
      homologation: 'Homologation',
      audit_complet: 'Audit complet',
      urgence: 'Urgence',
    };
    return labels[type] || type;
  };
  
  const getStatutBadge = (statut: string) => {
    if (statut === 'transmise') return 'badge primary';
    if (statut === 'archivee') return 'badge neutral';
    return 'badge warning';
  };
  
  return (<>
    <AccordionGroup spacing="md">
      {groupedData.map(([year, survs]) => {
        const aerodromeGroups: Record<string, any[]> = {};
        survs.forEach(surv => {
          const key = surv.aerodrome?.id || 'inconnu';
          if (!aerodromeGroups[key]) aerodromeGroups[key] = [];
          aerodromeGroups[key].push(surv);
        });
        
        return (
          <AccordionSection
            key={year}
            icon={<Calendar className="w-5 h-5 text-role-primary" />}
            title={`Année ${year}`}
            badges={<span className="badge outline">{survs.length} surveillance(s)</span>}
          >
            <AccordionSubGroup>
              {Object.entries(aerodromeGroups).map(([aerodromeId, aerodromeSurvs]) => {
                const aerodrome = aerodromes.find(a => a.id === aerodromeId);
                
                return (
                  <AccordionSubItem
                    key={aerodromeId}
                    itemKey={aerodromeId}
                    title={`${aerodrome?.nom} (${aerodrome?.code_oaci})`}
                    badges={<span className="badge outline">{aerodromeSurvs.length}</span>}
                  >
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>Référence</th>
                            <th>Type</th>
                            <th>Période</th>
                            <th>Équipe</th>
                            <th>Statut</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aerodromeSurvs.map(surv => (
                            <tr key={surv.id} className="border-b border-border hover:bg-role-primary-soft">
                              <td className="font-mono text-xs">{surv.id.slice(-6)}</td>
                              <td>{getTypeLabel(surv.type)}</td>
                              <td className="text-small">
                                {surv.date_debut ? new Date(surv.date_debut).toLocaleDateString('fr-FR') : '-'} → {surv.date_fin ? new Date(surv.date_fin).toLocaleDateString('fr-FR') : '-'}
                              </td>
                              <td className="text-small">{surv.equipe_ids?.length || 0} inspecteur(s)</td>
                              <td><span className={getStatutBadge(surv.statut)}>{surv.statut}</span></td>
                              <td className="text-right">
                                <div className="flex justify-end gap-2">
                                  <button className="action-button hover:scale-105 transition-all duration-200" title="Voir checklist" onClick={() => { setSelectedSurv({ ...surv, aerodrome }); setModalMode('checklist'); }}>
                                    <ClipboardList className="w-4 h-4" />
                                  </button>
                                  <button className="action-button hover:scale-105 transition-all duration-200" title="Voir rapport" onClick={() => { setSelectedSurv({ ...surv, aerodrome }); setModalMode('rapport'); }}>
                                    <FileText className="w-4 h-4" />
                                  </button>
                                  <button className="action-button hover:scale-105 transition-all duration-200" title="Détails" onClick={() => { setSelectedSurv({ ...surv, aerodrome }); setModalMode('details'); }}>
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AccordionSubItem>
                );
              })}
            </AccordionSubGroup>
          </AccordionSection>
        );
      })}
      
      {groupedData.length === 0 && (
        <div className="card">
          <div className="card-content py-12 text-center text-muted-foreground">
            <Eye className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucune surveillance archivée</p>
          </div>
        </div>
      )}
    </AccordionGroup>

    {/* Modal surveillance */}
    <FormShell
      open={!!selectedSurv && !!modalMode}
      onClose={() => { setSelectedSurv(null); setModalMode(null); }}
      title={
        modalMode === 'checklist' ? 'Checklist de surveillance'
        : modalMode === 'rapport' ? 'Rapport de surveillance'
        : 'Détails de la surveillance'
      }
      icon={modalMode === 'checklist' ? ClipboardList : modalMode === 'rapport' ? FileText : Eye}
      size={modalMode === 'rapport' ? '4xl' : '2xl'}
      footer={<button className="btn btn-secondary" onClick={() => { setSelectedSurv(null); setModalMode(null); }}>Fermer</button>}
    >
      {selectedSurv && modalMode === 'details' && (
        <div id="registre-detail-surveillance" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Aérodrome</p>
              <p className="font-semibold text-sm">{selectedSurv.aerodrome?.nom || '—'} ({selectedSurv.aerodrome?.code_oaci || '—'})</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Type</p>
              <p className="font-semibold text-sm">{getTypeLabel(selectedSurv.type)}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Période</p>
              <p className="font-semibold text-sm">
                {selectedSurv.date_debut ? new Date(selectedSurv.date_debut).toLocaleDateString('fr-FR') : '—'}
                {' → '}
                {selectedSurv.date_fin ? new Date(selectedSurv.date_fin).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Équipe</p>
              <p className="font-semibold text-sm">{selectedSurv.equipe_ids?.length || 0} inspecteur(s)</p>
            </div>
          </div>
          {selectedSurv.score_global !== undefined && (
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Score global</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-role-gradient rounded-full" style={{ width: `${selectedSurv.score_global}%` }} />
                </div>
                <span className="font-bold text-role-primary">{selectedSurv.score_global}%</span>
              </div>
            </div>
          )}
          {selectedSurv.observations && (
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Observations</p>
              <p className="text-sm">{selectedSurv.observations}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Statut :</span>
            <span className={getStatutBadge(selectedSurv.statut)}>{selectedSurv.statut}</span>
          </div>
          <TimelineSection steps={construireTimelineSurveillance(selectedSurv)} />
          <FichiersSection fichiers={extraireFichiersSurveillance(selectedSurv)} />
          <div className="flex justify-end"><ExportPDFButton elementId="registre-detail-surveillance" filename={`surveillance-${selectedSurv.id || selectedSurv.reference}.pdf`} /></div>
        </div>
      )}
      {selectedSurv && modalMode === 'rapport' && (
        <div className="space-y-4">
          {selectedSurv.rapport_html ? (
            <div className="border border-border rounded-xl p-4 bg-background prose prose-sm max-w-none max-h-[60vh] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: selectedSurv.rapport_html }} />
          ) : selectedSurv.rapport_fichier_url ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-3 text-role-primary opacity-60" />
              <p className="text-sm font-medium mb-3">Rapport disponible en fichier</p>
              <a href={selectedSurv.rapport_fichier_url} target="_blank" rel="noreferrer" download>
                <button className="btn btn-primary gap-2">
                  <Download className="w-4 h-4" />
                  Télécharger {selectedSurv.rapport_fichier_nom || 'le rapport'}
                </button>
              </a>
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Rapport non disponible</p>
              <p className="text-xs mt-1">Aucun rapport HTML ni fichier n'a été attaché à cette surveillance.</p>
            </div>
          )}
        </div>
      )}
      {selectedSurv && modalMode === 'checklist' && (
        <div className="space-y-4">
          {selectedSurv.checklist_hierarchy && selectedSurv.checklist_hierarchy.length > 0 ? (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {selectedSurv.checklist_hierarchy.map((domaine: any, di: number) => (
                <div key={di} className="border border-border rounded-xl overflow-hidden">
                  <div className="p-3 bg-role-primary-soft flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-role-primary" />
                    <span className="font-semibold text-sm">{domaine.libelle || `Domaine ${di + 1}`}</span>
                    <span className="badge outline ml-auto">{domaine.items?.length || 0} item(s)</span>
                  </div>
                  {domaine.items && domaine.items.map((item: any, ii: number) => (
                    <div key={ii} className={`px-4 py-2 border-t border-border flex items-start justify-between gap-3 ${item.statut === 'conforme' ? 'bg-success/5' : item.statut === 'non_conforme' ? 'bg-danger/5' : ''}`}>
                      <p className="text-sm flex-1">{item.libelle || item.question}</p>
                      {item.statut && (
                        <span className={`badge text-[10px] shrink-0 ${item.statut === 'conforme' ? 'success' : item.statut === 'non_conforme' ? 'danger' : 'neutral'}`}>
                          {item.statut === 'conforme' ? '✓ Conforme' : item.statut === 'non_conforme' ? '✗ Non conforme' : item.statut}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Checklist non disponible</p>
              <p className="text-xs mt-1">Les données de checklist n'ont pas été archivées avec cette surveillance.</p>
            </div>
          )}
        </div>
      )}
    </FormShell>
  </>);
}

// ============================================================
// SOUS-ONGLET: ÉCARTS & PAC
// ============================================================
function EcartsTab() {
  const ecarts = useAppStore((s) => s.ecarts);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const [selectedEcart, setSelectedEcart] = useState<any | null>(null);
  
  const closedEcarts = useMemo(() => {
    return ecarts.filter(e => e.statut === 'cloture');
  }, [ecarts]);
  
  const groupedData = useMemo(() => {
    const byYear: Record<string, any[]> = {};
    closedEcarts.forEach(ecart => {
      const year = ecart.cloture_le?.slice(0, 4) || new Date(ecart.updated_at).getFullYear().toString();
      if (!byYear[year]) byYear[year] = [];
      const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id);
      byYear[year].push({ ...ecart, aerodrome });
    });
    return Object.entries(byYear).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [closedEcarts, aerodromes]);
  
  const getNiveauBadge = (niveau: string) => {
    switch(niveau) {
      case 'critique': return 'badge danger';
      case 'eleve': return 'badge warning';
      case 'moyen': return 'badge primary';
      default: return 'badge neutral';
    }
  };
  
  const getDecisionBadge = (decision: string) => {
    return decision === 'accepte' ? 'badge success' : 'badge danger';
  };
  
  return (<>
    <AccordionGroup spacing="md">
      {groupedData.map(([year, ecartsList]) => {
        const aerodromeGroups: Record<string, any[]> = {};
        ecartsList.forEach(ecart => {
          const key = ecart.aerodrome?.id || 'inconnu';
          if (!aerodromeGroups[key]) aerodromeGroups[key] = [];
          aerodromeGroups[key].push(ecart);
        });
        
        return (
          <AccordionSection
            key={year}
            icon={<Calendar className="w-5 h-5 text-role-primary" />}
            title={`Année ${year}`}
            badges={<span className="badge outline">{ecartsList.length} écart(s)</span>}
          >
            <AccordionSubGroup>
              {Object.entries(aerodromeGroups).map(([aerodromeId, aerodromeEcarts]) => {
                const aerodrome = aerodromes.find(a => a.id === aerodromeId);
                
                return (
                  <AccordionSubItem
                    key={aerodromeId}
                    itemKey={aerodromeId}
                    title={`${aerodrome?.nom} (${aerodrome?.code_oaci})`}
                    badges={<span className="badge outline">{aerodromeEcarts.length}</span>}
                  >
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>Référence</th>
                            <th>Niveau</th>
                            <th>Libellé</th>
                            <th>Clôture</th>
                            <th>Décision PAC</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aerodromeEcarts.map(ecart => (
                            <tr key={ecart.id} className="border-b border-border hover:bg-role-primary-soft">
                              <td className="font-mono text-xs">{ecart.reference}</td>
                              <td><span className={getNiveauBadge(ecart.niveau_risque)}>{ecart.niveau_risque}</span></td>
                              <td className="max-w-md truncate">{ecart.libelle}</td>
                              <td className="text-small">{ecart.cloture_le?.slice(0, 10) || '-'}</td>
                              <td>
                                {ecart.evaluation_pac && (
                                  <span className={getDecisionBadge(ecart.evaluation_pac.decision)}>
                                    {ecart.evaluation_pac.decision === 'accepte' ? 'Accepté' : 'Refusé'}
                                  </span>
                                )}
                              </td>
                              <td className="text-right">
                                <button className="action-button hover:scale-105 transition-all duration-200" title="Voir timeline" onClick={() => setSelectedEcart({ ...ecart, aerodrome })}>
                                  <History className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AccordionSubItem>
                );
              })}
            </AccordionSubGroup>
          </AccordionSection>
        );
      })}
      
      {groupedData.length === 0 && (
        <div className="card">
          <div className="card-content py-12 text-center text-muted-foreground">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucun écart clôturé</p>
          </div>
        </div>
      )}
    </AccordionGroup>

    {/* Modal timeline PAC écart */}
    <FormShell
      open={!!selectedEcart}
      onClose={() => setSelectedEcart(null)}
      title={selectedEcart ? `Timeline PAC — ${selectedEcart.reference}` : ''}
      icon={History}
      size="3xl"
      footer={<button className="btn btn-secondary" onClick={() => setSelectedEcart(null)}>Fermer</button>}
    >
      {selectedEcart && (
        <div id="registre-detail-ecart" className="space-y-5">
          {/* Résumé écart */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-role-primary-soft rounded-xl col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Libellé</p>
              <p className="font-semibold text-sm">{selectedEcart.libelle}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Référence réglementaire</p>
              <p className="font-medium text-sm">{selectedEcart.ref_reglementaire || '—'}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Niveau de risque</p>
              <span className={getNiveauBadge(selectedEcart.niveau_risque)}>{selectedEcart.niveau_risque}</span>
            </div>
          </div>

          {/* PAC soumis */}
          {selectedEcart.pac && (
            <div>
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2 text-role-primary">
                <FileText className="w-4 h-4" />Plan d'Actions Correctives (PAC)
              </h4>
              <div className="space-y-2">
                {selectedEcart.pac.actions?.map((action: any, i: number) => (
                  <div key={i} className="p-3 border border-border rounded-lg bg-background">
                    <p className="text-sm font-medium">{action.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{action.responsable}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{action.date_prevue}</span>
                    </div>
                    {action.livrables?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {action.livrables.map((l: string, li: number) => (
                          <span key={li} className="badge outline text-[10px]">{l}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Soumis par {selectedEcart.pac.soumis_par} le {selectedEcart.pac.soumis_le?.slice(0, 10)}
              </p>
            </div>
          )}

          {/* Évaluation PAC */}
          {selectedEcart.evaluation_pac && (
            <div className="border-l-4 border-l-role-primary p-4 bg-role-primary-soft rounded-r-xl">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-role-primary" />Évaluation du PAC
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <span>Note globale : <strong>{selectedEcart.evaluation_pac.note_globale}/10</strong></span>
                <span>Décision : <span className={selectedEcart.evaluation_pac.decision === 'accepte' ? 'badge success' : 'badge danger'}>{selectedEcart.evaluation_pac.decision === 'accepte' ? 'Accepté' : 'Refusé'}</span></span>
              </div>
              {selectedEcart.evaluation_pac.commentaire_refus && (
                <p className="text-sm text-muted-foreground">{selectedEcart.evaluation_pac.commentaire_refus}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Évalué par {selectedEcart.evaluation_pac.evalue_par} le {selectedEcart.evaluation_pac.evalue_le?.slice(0, 10)}
              </p>
            </div>
          )}

          {/* Clôture */}
          {selectedEcart.cloture_le && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-success" />
              <span className="text-muted-foreground">Clôturé le</span>
              <strong>{selectedEcart.cloture_le.slice(0, 10)}</strong>
            </div>
          )}
          <TimelineSection steps={construireTimelineEcart(selectedEcart)} />
          <FichiersSection fichiers={extraireFichiersEcart(selectedEcart)} />
          <div className="flex justify-end"><ExportPDFButton elementId="registre-detail-ecart" filename={`ecart-${selectedEcart.reference || selectedEcart.id}.pdf`} /></div>
        </div>
      )}
    </FormShell>
  </>);
}

// ============================================================
// SOUS-ONGLET: ÉVÉNEMENTS
// ============================================================
function EvenementsTab() {
  const evenements = useAppStore((s) => s.evenements);
  const aerodromes = useAppStore((s) => s.aerodromes);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  
  const closedEvenements = useMemo(() => {
    return evenements?.filter(e => e.statut === 'cloture') || [];
  }, [evenements]);
  
  const groupedData = useMemo(() => {
    const byYear: Record<string, any[]> = {};
    closedEvenements.forEach(event => {
      const year = event.date?.slice(0, 4) || new Date(event.created_at).getFullYear().toString();
      if (!byYear[year]) byYear[year] = [];
      const aerodrome = aerodromes.find(a => a.id === event.aerodrome_id);
      byYear[year].push({ ...event, aerodrome });
    });
    return Object.entries(byYear).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [closedEvenements, aerodromes]);
  
  return (<>
    <AccordionGroup spacing="md">
      {groupedData.map(([year, events]) => {
        const aerodromeGroups: Record<string, any[]> = {};
        events.forEach(event => {
          const key = event.aerodrome?.id || 'inconnu';
          if (!aerodromeGroups[key]) aerodromeGroups[key] = [];
          aerodromeGroups[key].push(event);
        });
        
        return (
          <AccordionSection
            key={year}
            icon={<Calendar className="w-5 h-5 text-role-primary" />}
            title={`Année ${year}`}
            badges={<span className="badge outline">{events.length} événement(s)</span>}
          >
            <AccordionSubGroup>
              {Object.entries(aerodromeGroups).map(([aerodromeId, aerodromeEvents]) => {
                const aerodrome = aerodromes.find(a => a.id === aerodromeId);
                
                return (
                  <AccordionSubItem
                    key={aerodromeId}
                    itemKey={aerodromeId}
                    title={`${aerodrome?.nom} (${aerodrome?.code_oaci})`}
                    badges={<span className="badge outline">{aerodromeEvents.length}</span>}
                  >
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>Référence</th>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Gravité</th>
                            <th>Statut</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aerodromeEvents.map(event => (
                            <tr key={event.id} className="border-b border-border hover:bg-role-primary-soft">
                              <td className="font-mono text-xs">{event.reference}</td>
                              <td className="text-small">{event.date || '-'}</td>
                              <td>{event.type}</td>
                              <td><span className={getGraviteBadgeClass(event.gravite)}>{event.gravite}</span></td>
                              <td><span className="badge success">Clôturé</span></td>
                              <td className="text-right">
                                <button className="action-button hover:scale-105 transition-all duration-200" title="Voir rapport" onClick={() => setSelectedEvent({ ...event, aerodrome })}>
                                  <FileText className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AccordionSubItem>
                );
              })}
            </AccordionSubGroup>
          </AccordionSection>
        );
      })}
      
      {groupedData.length === 0 && (
        <div className="card">
          <div className="card-content py-12 text-center text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucun événement clôturé</p>
          </div>
        </div>
      )}
    </AccordionGroup>

    {/* Modal détails événement */}
    <FormShell
      open={!!selectedEvent}
      onClose={() => setSelectedEvent(null)}
      title={selectedEvent ? `Événement — ${selectedEvent.reference}` : ''}
      icon={AlertCircle}
      size="3xl"
      footer={<button className="btn btn-secondary" onClick={() => setSelectedEvent(null)}>Fermer</button>}
    >
      {selectedEvent && (
        <div id="registre-detail-evenement" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={getGraviteBadgeClass(selectedEvent.gravite)}>{selectedEvent.gravite}</span>
            <span className="badge success">Clôturé</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" />{selectedEvent.aerodrome?.nom || selectedEvent.aerodrome_id}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Date / Heure</p>
              <p className="font-semibold text-sm">{selectedEvent.date} {selectedEvent.heure ? `à ${selectedEvent.heure}` : ''}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Type</p>
              <p className="font-semibold text-sm">{selectedEvent.type}</p>
            </div>
            {selectedEvent.localisation && (
              <div className="p-3 bg-role-primary-soft rounded-xl col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Localisation</p>
                <p className="font-semibold text-sm">{selectedEvent.localisation}</p>
              </div>
            )}
          </div>
          <div className="p-3 bg-muted/30 rounded-xl">
            <p className="text-xs text-muted-foreground mb-2">Description</p>
            <p className="text-sm">{selectedEvent.description}</p>
          </div>
          {selectedEvent.actions_immediates && (
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl">
              <p className="text-xs text-muted-foreground mb-2 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />Actions immédiates
              </p>
              <p className="text-sm">{selectedEvent.actions_immediates}</p>
            </div>
          )}
          {selectedEvent.aeronef && (
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-2">Aéronef impliqué</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <span><strong>Immat. :</strong> {selectedEvent.aeronef.immatriculation}</span>
                <span><strong>Type :</strong> {selectedEvent.aeronef.type}</span>
                <span><strong>Exploitant :</strong> {selectedEvent.aeronef.exploitant}</span>
              </div>
            </div>
          )}
          {selectedEvent.rapport_final_url && (
            <div className="flex justify-end">
              <a href={selectedEvent.rapport_final_url} target="_blank" rel="noreferrer" download>
                <button className="btn btn-primary gap-2">
                  <Download className="w-4 h-4" />Rapport final
                </button>
              </a>
            </div>
          )}
          <TimelineSection steps={construireTimelineEvenement(selectedEvent)} />
          <FichiersSection fichiers={extraireFichiersEvenement(selectedEvent)} />
          <div className="flex justify-end"><ExportPDFButton elementId="registre-detail-evenement" filename={`evenement-${selectedEvent.reference || selectedEvent.id}.pdf`} /></div>
        </div>
      )}
    </FormShell>
  </>);
}

// ============================================================
// SOUS-ONGLET: FORMATIONS
// ============================================================
function FormationsTab() {
  const formations = useAppStore((s) => s.formations);
  const utilisateurs = useAppStore((s) => s.utilisateurs);
  const [selectedFormation, setSelectedFormation] = useState<any | null>(null);
  
  const completedFormations = useMemo(() => {
    return formations?.filter(f => f.statut === 'terminee') || [];
  }, [formations]);
  
  const groupedData = useMemo(() => {
    const byYear: Record<string, any[]> = {};
    completedFormations.forEach(formation => {
      const year = formation.date?.slice(0, 4) || new Date(formation.created_at).getFullYear().toString();
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(formation);
    });
    return Object.entries(byYear).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [completedFormations]);
  
  const getInspectorName = (participantIds: string[]) => {
    if (!participantIds || participantIds.length === 0) return 'Inconnu';
    const inspector = utilisateurs?.find(u => u.id === participantIds[0]);
    return inspector ? `${inspector.prenom} ${inspector.nom}` : 'Inconnu';
  };
  
  const getDocumentsCount = (documents: any[]) => {
    if (!documents) return 0;
    return documents.length;
  };
  
  const getNoteMoyenne = (evaluation: Record<string, number> | undefined) => {
    if (!evaluation || Object.keys(evaluation).length === 0) return null;
    const values = Object.values(evaluation);
    const sum = values.reduce((acc, v) => acc + v, 0);
    return (sum / values.length).toFixed(1);
  };
  
  return (<>
    <AccordionGroup spacing="md">
      {groupedData.map(([year, formationsList]) => {
        const inspectorGroups: Record<string, any[]> = {};
        formationsList.forEach(formation => {
          const inspectorId = formation.participants?.[0] || 'inconnu';
          if (!inspectorGroups[inspectorId]) inspectorGroups[inspectorId] = [];
          inspectorGroups[inspectorId].push(formation);
        });
        
        return (
          <AccordionSection
            key={year}
            icon={<Calendar className="w-5 h-5 text-role-primary" />}
            title={`Année ${year}`}
            badges={<span className="badge outline">{formationsList.length} formation(s)</span>}
          >
            <AccordionSubGroup>
              {Object.entries(inspectorGroups).map(([inspectorId, inspectorFormations]) => {
                const inspectorName = getInspectorName([inspectorId]);
                
                return (
                  <AccordionSubItem
                    key={inspectorId}
                    itemKey={inspectorId}
                    title={inspectorName}
                    badges={<span className="badge outline">{inspectorFormations.length}</span>}
                  >
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>Formation</th>
                            <th>Date</th>
                            <th>Durée</th>
                            <th>Note</th>
                            <th>Documents</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspectorFormations.map(formation => (
                            <tr key={formation.id} className="border-b border-border hover:bg-role-primary-soft">
                              <td className="font-medium">{formation.titre}</td>
                              <td className="text-small">{formation.date ? new Date(formation.date).toLocaleDateString('fr-FR') : '-'}</td>
                              <td>{formation.duree_heures}h</td>
                              <td>{getNoteMoyenne(formation.evaluation) ? `${getNoteMoyenne(formation.evaluation)}/5` : '-'}</td>
                              <td>{getDocumentsCount(formation.documents)} fichier(s)</td>
                              <td className="text-right">
                                <button className="action-button hover:scale-105 transition-all duration-200" title="Voir attestation" onClick={() => setSelectedFormation(formation)}>
                                  <FileText className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AccordionSubItem>
                );
              })}
            </AccordionSubGroup>
          </AccordionSection>
        );
      })}
      
      {groupedData.length === 0 && (
        <div className="card">
          <div className="card-content py-12 text-center text-muted-foreground">
            <GraduationCap className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucune formation terminée</p>
          </div>
        </div>
      )}
    </AccordionGroup>

    {/* Modal formation */}
    <FormShell
      open={!!selectedFormation}
      onClose={() => setSelectedFormation(null)}
      title={selectedFormation ? selectedFormation.titre : ''}
      icon={GraduationCap}
      size="3xl"
      footer={<button className="btn btn-secondary" onClick={() => setSelectedFormation(null)}>Fermer</button>}
    >
      {selectedFormation && (
        <div id="registre-detail-formation" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Type</p>
              <p className="font-semibold text-sm capitalize">{selectedFormation.type}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Date</p>
              <p className="font-semibold text-sm">
                {selectedFormation.date ? new Date(selectedFormation.date).toLocaleDateString('fr-FR') : '—'}
              </p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Durée</p>
              <p className="font-semibold text-sm">{selectedFormation.duree_heures}h</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Lieu</p>
              <p className="font-semibold text-sm">{selectedFormation.lieu || '—'}</p>
            </div>
            <div className="p-3 bg-role-primary-soft rounded-xl col-span-2">
              <p className="text-xs text-muted-foreground mb-1">Formateur</p>
              <p className="font-semibold text-sm">{selectedFormation.formateur || '—'}</p>
            </div>
          </div>
          {selectedFormation.objectifs && (
            <div className="p-3 bg-muted/30 rounded-xl">
              <p className="text-xs text-muted-foreground mb-1">Objectifs</p>
              <p className="text-sm">{selectedFormation.objectifs}</p>
            </div>
          )}
          {selectedFormation.evaluation && Object.keys(selectedFormation.evaluation).length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Évaluations</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(selectedFormation.evaluation).map(([k, v]: [string, any]) => (
                  <div key={k} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg text-sm">
                    <span className="text-muted-foreground capitalize">{k}</span>
                    <span className="font-bold text-role-primary">{v}/5</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {selectedFormation.documents && selectedFormation.documents.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-role-primary" />Documents / Attestations
              </p>
              <div className="space-y-2">
                {selectedFormation.documents.map((doc: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-role-primary-soft rounded-xl">
                    <span className="text-sm flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-role-primary" />{doc.nom}
                    </span>
                    <a href={doc.url} target="_blank" rel="noreferrer" download>
                      <button className="btn btn-sm btn-primary gap-1.5 px-3 py-1.5">
                        <Download className="w-3.5 h-3.5" />Télécharger
                      </button>
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(!selectedFormation.documents || selectedFormation.documents.length === 0) && (
            <div className="text-center py-6 text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucun document joint à cette formation</p>
            </div>
          )}
          <TimelineSection steps={construireTimelineFormation(selectedFormation)} />
          <div className="flex justify-end"><ExportPDFButton elementId="registre-detail-formation" filename={`formation-${selectedFormation.id || selectedFormation.titre}.pdf`} /></div>
        </div>
      )}
    </FormShell>
  </>);
}

// ============================================================
// SOUS-ONGLET: DOCUMENTS
// ============================================================
function DocumentsTab({ viewMode, searchTerm, selectedYear, onViewDetails }: { 
  viewMode: ViewMode; 
  searchTerm: string; 
  selectedYear: string;
  onViewDetails: (entry: RegistreEntry) => void;
}) {
  const registreEntries = useAppStore((s) => s.registreEntries);
  
  const documentEntries = useMemo(() => {
    let entries = (registreEntries || []).filter(e => e.type === 'document');
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      entries = entries.filter(e =>
        e.titre.toLowerCase().includes(term) ||
        e.description.toLowerCase().includes(term) ||
        e.reference.toLowerCase().includes(term)
      );
    }
    
    if (selectedYear !== 'all') {
      entries = entries.filter(e => e.date_entree.startsWith(selectedYear));
    }
    
    return entries;
  }, [registreEntries, searchTerm, selectedYear]);
  
  const groupedData = useMemo(() => {
    const byYear: Record<string, any[]> = {};
    documentEntries.forEach(entry => {
      const year = entry.date_entree.slice(0, 4);
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(entry);
    });
    return Object.entries(byYear).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [documentEntries]);
  
  const getDocumentType = (entry: RegistreEntry): string => {
    const titre = entry.titre.toLowerCase();
    if (titre.includes('décret') || titre.includes('decret')) return 'Décrets';
    if (titre.includes('note')) return 'Notes de service';
    if (titre.includes('lettre')) return 'Lettres officielles';
    if (titre.includes('circulaire')) return 'Circulaires';
    if (titre.includes('rapport')) return 'Rapports';
    return 'Autres documents';
  };
  
  const getDocumentTypeIcon = (type: string) => {
    switch(type) {
      case 'Décrets': return <FileCheck className="w-4 h-4" />;
      case 'Notes de service': return <FileText className="w-4 h-4" />;
      case 'Lettres officielles': return <Mail className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };
  
  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {documentEntries.map(entry => {
        const typeInfo = ENTRY_TYPE_LABELS[entry.type] || ENTRY_TYPE_LABELS.document;
        return (
          <div
            key={entry.id}
            className="card cursor-pointer hover:shadow-role-glow transition-all duration-300"
            onClick={() => onViewDetails(entry)}
          >
            <div className="card-header flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-role-primary-soft flex items-center justify-center">
                  <FileText className="w-4 h-4 text-role-primary" />
                </div>
                <span className="code-oaci-badge text-xs">{entry.reference}</span>
              </div>
              <span className={typeInfo.badgeClass}>{typeInfo.label}</span>
            </div>
            <div className="card-content">
              <h4 className="heading-4 font-semibold mb-2 line-clamp-2">{entry.titre}</h4>
              <p className="text-small text-muted line-clamp-3">{entry.description}</p>
              <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3 text-role-primary" />
                {new Date(entry.date_entree).toLocaleDateString('fr-FR')}
              </div>
              {entry.fichiers && entry.fichiers.length > 0 && (
                <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                  <FileText className="w-3 h-3" />
                  {entry.fichiers.length} fichier(s)
                </div>
              )}
            </div>
            <div className="card-footer flex justify-between items-center">
              <span className="text-small text-role-primary hover:underline cursor-pointer">
                Voir détails
              </span>
              <button className="action-button hover:scale-105 transition-all duration-200" onClick={(e) => { e.stopPropagation(); onViewDetails(entry); }}>
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
  
  const renderListView = () => (
    <AccordionGroup spacing="md">
      {groupedData.map(([year, entries]) => {
        const typeGroups: Record<string, any[]> = {};
        entries.forEach(entry => {
          const docType = getDocumentType(entry);
          if (!typeGroups[docType]) typeGroups[docType] = [];
          typeGroups[docType].push(entry);
        });
        
        return (
          <AccordionSection
            key={year}
            icon={<Calendar className="w-5 h-5 text-role-primary" />}
            title={`Année ${year}`}
            badges={<span className="badge outline">{entries.length} document(s)</span>}
          >
            <AccordionSubGroup>
              {Object.entries(typeGroups).map(([docType, typeEntries]) => {
                return (
                  <AccordionSubItem
                    key={docType}
                    itemKey={docType}
                    title={docType}
                    badges={<span className="badge outline">{typeEntries.length}</span>}
                  >
                    <div className="table-container">
                      <table className="table">
                        <thead>
                          <tr className="border-b border-border">
                            <th>Référence</th>
                            <th>Titre</th>
                            <th>Date</th>
                            <th>Fichiers</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {typeEntries.map(entry => {
                            const typeInfo = ENTRY_TYPE_LABELS[entry.type] || ENTRY_TYPE_LABELS.document;
                            return (
                              <tr key={entry.id} className="border-b border-border hover:bg-role-primary-soft">
                                <td className="code-oaci-badge text-xs">{entry.reference}</td>
                                <td className="text-foreground">{entry.titre}</td>
                                <td className="text-small">{new Date(entry.date_entree).toLocaleDateString('fr-FR')}</td>
                                <td>
                                  {entry.fichiers && entry.fichiers.length > 0 && (
                                    <span className="flex items-center gap-1 text-xs text-primary">
                                      <FileText className="w-3 h-3" />
                                      {entry.fichiers.length}
                                    </span>
                                  )}
                                </td>
                                <td className="text-right">
                                  <button className="action-button hover:scale-105 transition-all duration-200" onClick={() => onViewDetails(entry)}>
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </AccordionSubItem>
                );
              })}
            </AccordionSubGroup>
          </AccordionSection>
        );
      })}
      
      {groupedData.length === 0 && (
        <div className="card">
          <div className="card-content py-12 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Aucun document trouvé</p>
          </div>
        </div>
      )}
    </AccordionGroup>
  );
  
  return viewMode === 'liste' ? renderListView() : renderGridView();
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
export default function RegistreModule({ userRole: userRoleProp, user: userProp }: RegistreModuleProps) {
  const registreEntries = useAppStore((s) => s.registreEntries);
  const addRegistreEntry = useAppStore((s) => s.addRegistreEntry);
  const addNotification = useAppStore((s) => s.addNotification);
  const storeUser = useAppStore((s) => s.user);
  const user = storeUser ?? userProp;
  const userRole = userRoleProp ?? userProp?.role ?? storeUser?.role ?? 'inspector';
  const regulationAnalyses = useAppStore((s) => s.regulationAnalyses);
  const formationSuggestions = useAppStore((s) => s.formationSuggestions);
  
  const pendingRegistreSource = useAppStore((s) => s.pendingRegistreSource);
  const setPendingRegistreSource = useAppStore((s) => s.setPendingRegistreSource);
  const certifications = useAppStore((s) => s.certifications);
  const homologations = useAppStore((s) => s.homologations);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('liste');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedAerodrome, setSelectedAerodrome] = useState<string>('all');
  const [showFormModal, setShowFormModal] = useState(false);
  const [formSourceData, setFormSourceData] = useState<any>(null);

  // Navigation depuis PhaseDocsModal
  useEffect(() => {
    if (!pendingRegistreSource) return
    const { type, id, aerodrome_id } = pendingRegistreSource
    setActiveTab(type === 'certification' ? 'certifications' : 'homologations')
    const source = type === 'certification'
      ? certifications?.find(c => c.id === id)
      : homologations?.find(h => h.id === id)
    if (source) {
      setFormSourceData(source)
      setShowFormModal(true)
    }
    setPendingRegistreSource(null)
  }, [pendingRegistreSource, certifications, homologations, setPendingRegistreSource])

  const [selectedEntry, setSelectedEntry] = useState<RegistreEntry | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [iaCommand, setIaCommand] = useState('');
  const [iaResponse, setIaResponse] = useState<string | null>(null);
  const [isIaProcessing, setIsIaProcessing] = useState(false);
  const [trainingNeeds, setTrainingNeeds] = useState<TrainingNeedsAnalysisResult | null>(null);
  const [isAnalyzingNeeds, setIsAnalyzingNeeds] = useState(false);
  const [showTrainingNeeds, setShowTrainingNeeds] = useState(false);
  const aerodromes = useAppStore((s) => s.aerodromes);
  
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    (registreEntries || []).forEach(entry => years.add(entry.date_entree.slice(0, 4)));
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [registreEntries]);
  
  const pendingRegulationAlerts = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return (regulationAnalyses || []).filter(a => 
      new Date(a.date_analyse) > thirtyDaysAgo && a.impact !== 'aucun'
    );
  }, [regulationAnalyses]);
  
  const activeFormationSuggestions = useMemo(() => {
    return (formationSuggestions || []).filter(s => s.status === 'suggested');
  }, [formationSuggestions]);
  
  const stats = useMemo(() => ({
    total: registreEntries?.length || 0,
    certifications: registreEntries?.filter(e => e.type === 'certification').length || 0,
    homologations: registreEntries?.filter(e => e.type === 'homologation').length || 0,
    surveillances: registreEntries?.filter(e => e.type === 'surveillance').length || 0,
    ecarts: registreEntries?.filter(e => e.type === 'ecart').length || 0,
    evenements: registreEntries?.filter(e => e.type === 'evenement').length || 0,
    formations: registreEntries?.filter(e => e.type === 'formation').length || 0,
    documents: registreEntries?.filter(e => e.type === 'document').length || 0,
  }), [registreEntries]);
  
  const handleIACommand = async () => {
    if (!iaCommand.trim()) return;
    setIsIaProcessing(true);
    setIaResponse(null);
    try {
      const result = await registreAgent.executeCommand(iaCommand);
      if (result.success) {
        setIaResponse(result.message);
        addNotification({
          user_id: user?.id || '',
          type: 'success',
          title: 'Commande IA exécutée',
          message: result.message,
          canal: 'in_app',
        });
      } else {
        setIaResponse(`❌ ${result.message}`);
      }
    } catch (error) {
      setIaResponse(`❌ Erreur: ${error instanceof Error ? error.message : 'Commande non reconnue'}`);
    } finally {
      setIsIaProcessing(false);
      setIaCommand('');
    }
  };
  
  const handleTrainingNeedsAnalysis = async () => {
    setIsAnalyzingNeeds(true);
    try {
      const result = await registreAgent.analyzeTrainingNeeds({});
      setTrainingNeeds(result);
      setShowTrainingNeeds(true);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Analyse des besoins en formation',
        message: result.synthese,
        canal: 'in_app',
      });
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur IA',
        message: error instanceof Error ? error.message : 'Analyse impossible',
        canal: 'in_app',
      });
    } finally {
      setIsAnalyzingNeeds(false);
    }
  };
  
  const handleManualAdd = async (formData: any) => {
    try {
      const newEntry: RegistreEntry = {
        id: `reg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        type: 'document',
        reference: formData.reference,
        titre: formData.titre,
        description: formData.description,
        date_entree: formData.date_entree,
        aerodrome_id: formData.aerodrome_id || undefined,
        fichiers: formData.fichiers || [],
        timeline: [],
        statut: 'valide',
        auto_generated: false,
        source_id: undefined,
        source_type: undefined,
        created_at: new Date().toISOString(),
        created_by: user?.id || 'unknown',
      };
      
      addRegistreEntry(newEntry);
      setShowFormModal(false);
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Document ajouté',
        message: `${formData.titre} a été ajouté au registre`,
        canal: 'in_app',
      });
    } catch (error) {
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: "Impossible d'ajouter l'entrée",
        canal: 'in_app',
      });
    }
  };
  
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardTab />;
      case 'certifications':
        return <CertificationsTab
          onEdit={(entry) => { setFormSourceData(entry); setShowFormModal(true); }}
        />;
      case 'homologations':
        return <HomologationsTab
          onEdit={(entry) => { setFormSourceData(entry); setShowFormModal(true); }}
        />;
      case 'surveillances':
        return <SurveillancesTab />;
      case 'ecarts':
        return <EcartsTab />;
      case 'evenements':
        return <EvenementsTab />;
      case 'formations':
        return <FormationsTab />;
      case 'documents':
        return (
          <DocumentsTab
            viewMode={viewMode}
            searchTerm={searchTerm}
            selectedYear={selectedYear}
            onViewDetails={(entry) => { setSelectedEntry(entry); setShowDetailModal(true); }}
          />
        );
      default:
        return null;
    }
  };
  
  const showFilters = activeTab !== 'dashboard';
  const showYearFilter = activeTab !== 'dashboard' && activeTab !== 'certifications' && activeTab !== 'homologations';
  const showAerodromeFilter = ['certifications', 'homologations', 'surveillances', 'ecarts', 'evenements'].includes(activeTab);
  
  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="registre">
      
      {/* En-tête */}
      <ModuleHeader
        icon={<Archive className="h-6 w-6" />}
        title="Registre officiel"
        description="Traçabilité des certifications, homologations, surveillances et documents"
        actions={<button onClick={() => setShowFormModal(true)} className="btn btn-primary gap-2">
          <Plus className="w-4 h-4" />
          Ajouter un document
        </button>}
      />
      
      {/* Intelligence réglementaire */}
      {(pendingRegulationAlerts.length > 0 || activeFormationSuggestions.length > 0) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-role-primary" />
              <h3 className="font-semibold text-foreground">Intelligence réglementaire</h3>
              <span className="badge danger animate-pulse">Nouveau</span>
            </div>
            <button
              onClick={handleTrainingNeedsAnalysis}
              disabled={isAnalyzingNeeds}
              className="btn btn-secondary btn-sm gap-2"
            >
              {isAnalyzingNeeds ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
              Analyser les besoins
            </button>
          </div>
          
          {pendingRegulationAlerts.length > 0 && (
            <div className="card border-danger">
              <div className="card-header bg-danger/10">
                <div className="card-title text-base flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-danger" />
                  Évolutions réglementaires
                  <span className="badge danger">{pendingRegulationAlerts.length}</span>
                </div>
              </div>
              <div className="card-content space-y-3">
                {pendingRegulationAlerts.map(alert => (
                  <div key={alert.id} className={`border-l-4 ${alert.impact === 'majeur' ? 'border-danger' : 'border-warning'} p-3 bg-gray-50 rounded-r-lg`}>
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div>
                        <span className="font-medium text-sm">{alert.documentTitre}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">Version: {alert.version}</p>
                      </div>
                      <span className={`badge ${alert.impact === 'majeur' ? 'danger' : 'warning'} text-[10px]`}>
                        {alert.impact === 'majeur' ? 'Impact majeur' : 'Impact modéré'}
                      </span>
                    </div>
                    <p className="text-sm mt-2">{alert.impact_description}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Délai: {alert.delai_mise_conformite} jours</span>
                      <button className="text-primary hover:underline">Voir le document</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeFormationSuggestions.length > 0 && (
            <div className="card border-primary">
              <div className="card-header bg-primary/10">
                <div className="card-title text-base flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  Formations recommandées
                  <span className="badge primary">{activeFormationSuggestions.length}</span>
                </div>
              </div>
              <div className="card-content space-y-2">
                {activeFormationSuggestions.slice(0, 3).map(suggestion => (
                  <div key={suggestion.id} className="flex items-center justify-between p-2 border-b border-border last:border-0">
                    <div>
                      <span className="text-sm font-medium">{suggestion.titre}</span>
                      <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${suggestion.priorite === 'haute' ? 'danger' : 'neutral'} text-[10px]`}>
                        {suggestion.priorite}
                      </span>
                      <button className="btn btn-xs btn-primary">S'inscrire</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Assistant IA */}
      <div className="card border-primary/20 bg-primary-soft/30">
        <div className="card-content p-3">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-role-primary" />
            <span className="text-sm font-medium">🤖 Assistant Registre</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={iaCommand}
              onChange={(e) => setIaCommand(e.target.value)}
              placeholder="Ex: statistiques, tendances, analyse besoins formation..."
              className={`flex-1 form-input text-sm ${focusClass}`}
              onKeyDown={(e) => e.key === 'Enter' && handleIACommand()}
            />
            <button onClick={handleIACommand} disabled={isIaProcessing || !iaCommand.trim()} className="btn btn-primary gap-2">
              {isIaProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Exécuter
            </button>
          </div>
          {iaResponse && (
            <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-role-primary mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">{iaResponse}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Barre d'outils - UNE SEULE LIGNE */}
      {showFilters && (
        <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
          <div className="flex flex-wrap items-center gap-3">
            {/* Recherche */}
            {activeTab === 'documents' && (
              <div className="flex-1 min-w-[200px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rechercher dans les documents..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground text-sm ${focusClass}`}
                />
              </div>
            )}
            
            {/* Filtre année */}
            {showYearFilter && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                <option value="all">Toutes années</option>
                {availableYears.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            )}
            
            {/* Filtre aérodrome */}
            {showAerodromeFilter && (
              <select
                value={selectedAerodrome}
                onChange={(e) => setSelectedAerodrome(e.target.value)}
                className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
                style={selectStyle}
              >
                <option value="all">Tous aérodromes</option>
                {aerodromes?.map(a => <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>)}
              </select>
            )}
            
            {/* Vue liste/grille */}
            {activeTab === 'documents' && (
              <div className="view-toggle">
                <button className={viewMode === 'liste' ? 'active' : ''} onClick={() => setViewMode('liste')} title="Vue liste">
                  <List className="w-4 h-4" />
                </button>
                <button className={viewMode === 'grille' ? 'active' : ''} onClick={() => setViewMode('grille')} title="Vue grille">
                  <Grid3x3 className="w-4 h-4" />
                </button>
              </div>
            )}
            
            {/* Export CSV */}
            <button className="action-button hover:scale-105 transition-all duration-200" title="Exporter">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Sous-onglets — même design que CertificationModule */}
      <div className="tabs-container border-b border-border">
        <div className="tabs flex gap-1 overflow-x-auto">
          {TAB_CONFIG.map(tab => {
            const Icon = tab.icon;
            let count = 0;
            switch (tab.id) {
              case 'dashboard':      count = stats.total;          break;
              case 'certifications': count = stats.certifications;  break;
              case 'homologations':  count = stats.homologations;   break;
              case 'surveillances':  count = stats.surveillances;   break;
              case 'ecarts':         count = stats.ecarts;          break;
              case 'evenements':     count = stats.evenements;      break;
              case 'formations':     count = stats.formations;      break;
              case 'documents':      count = stats.documents;       break;
            }
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab px-4 py-2 font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'active border-b-2 border-role-primary text-role-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {tab.label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id
                      ? 'bg-role-primary/15 text-role-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Contenu */}
      {renderTabContent()}
      
      {/* Modal d'ajout/modification */}
      <FormShell
        open={showFormModal}
        onClose={() => { setShowFormModal(false); }}
        title={formSourceData?.id && formSourceData?.metadata ? 'Modifier l\'entrée au registre' : 'Nouvelle entrée au registre'}
        icon={Archive}
        size="4xl"
        dataRole={userRole}
      >
        <RegistreForm
          mode={formSourceData?.id && formSourceData?.metadata ? 'modification' : 'creation'}
          registreId={formSourceData?.id && formSourceData?.metadata ? formSourceData.id : undefined}
          aerodromeId={formSourceData?.aerodrome_id}
          typeRegistre={formSourceData ? (formSourceData.source_type === 'certification' || formSourceData.statut_global === 'certifie' ? 'certifications' : 'homologations') : undefined}
          sourceData={formSourceData}
          onSuccess={() => { setShowFormModal(false); setFormSourceData(null); setPendingRegistreSource(null); }}
          onCancel={() => { setShowFormModal(false); setFormSourceData(null); setPendingRegistreSource(null); }}
          userRole={userRole}
        />
      </FormShell>

      {/* Modal de détails */}
      <FormShell
        open={showDetailModal && !!selectedEntry}
        onClose={() => setShowDetailModal(false)}
        title={selectedEntry ? `Détail - ${selectedEntry.titre}` : 'Détail'}
        icon={History}
        size="3xl"
        dataRole={userRole}
        footer={
          <button className="btn btn-secondary" onClick={() => setShowDetailModal(false)}>Fermer</button>
        }
      >
        {selectedEntry && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <span className="code-oaci-badge">{selectedEntry.reference}</span>
                <span className={ENTRY_TYPE_LABELS[selectedEntry.type]?.badgeClass || 'badge neutral'}>
                  {ENTRY_TYPE_LABELS[selectedEntry.type]?.label || selectedEntry.type}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="w-4 h-4 text-role-primary" />
                {new Date(selectedEntry.date_entree).toLocaleDateString('fr-FR')}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground">{selectedEntry.titre}</h3>
              <p className="text-sm text-muted-foreground mt-1">{selectedEntry.description}</p>
            </div>

            {selectedEntry.timeline && selectedEntry.timeline.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <History className="w-4 h-4 text-role-primary" />
                  Chronologie
                </h4>
                <div className="timeline">
                  {selectedEntry.timeline.map((step, idx) => (
                    <div key={step.id} className="timeline-item">
                      <div className={`timeline-dot ${idx === selectedEntry.timeline!.length - 1 ? 'timeline-dot-success' : 'timeline-dot-primary'}`} />
                      <div className="timeline-content">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="font-medium text-sm">{step.etape}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(step.date).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Par: {step.acteur} ({step.acteur_role})
                        </p>
                        {step.details && <p className="text-sm mt-1">{step.details}</p>}
                        {step.fichiers && step.fichiers.length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {step.fichiers.map((f, i) => (
                              <button key={i} onClick={() => window.open(f.url, '_blank')} className="text-xs text-primary hover:underline">
                                📎 {f.nom}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedEntry.fichiers && selectedEntry.fichiers.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-role-primary" />
                  Documents joints
                </h4>
                <div className="space-y-2">
                  {selectedEntry.fichiers.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-role-primary" />
                        <span className="text-sm">{f.nom}</span>
                      </div>
                      <button onClick={() => window.open(f.url, '_blank')} className="action-button hover:scale-105 transition-all duration-200">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </FormShell>
    </div>
  );
}
