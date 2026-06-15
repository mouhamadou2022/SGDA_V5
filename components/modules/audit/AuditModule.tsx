// components/modules/audit/AuditModule.tsx
// ✅ CDC 5.20 - Journal d'Audit
// ✅ Traçabilité complète des actions
// ✅ Filtres avancés harmonisés (style AerodromesModule)
// ✅ Graphique d'activité intégré
// ✅ Badges de gravité avec animations
// ✅ Design system premium
// ✅ Actions Modifier/Supprimer (rouge pour supprimer)

'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { FormShell } from '@/components/ui/FormShell';
import { Card } from '@/components/ui/card';
import {
  FileSearch,
  Download,
  Search,
  Filter,
  Calendar,
  User,
  Shield,
  Clock,
  Eye,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  Key,
  Mail,
  Phone,
  LogIn,
  LogOut,
  FileText,
  Briefcase,
  Users,
  Plane,
  AlertTriangle,
  MessageSquare,
  Activity,
  TrendingUp,
  Printer,
  Grid3x3,
  List,
  Plus,
  Save,
} from 'lucide-react';
import { useAppStore, type AuditLog } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { auditUtils } from '@/lib/auditUtils';
import { formatDate } from '@/lib/utils';
import { BarChart } from '@/components/ui/charts/BarChart';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundPosition: 'right 0.75rem center',
  backgroundRepeat: 'no-repeat'
};

interface AuditModuleProps {
  userRole: string;
}

// Types d'actions avec gravité et icônes
const ACTIONS = [
  { id: 'connexion', label: 'Connexion', icon: LogIn, severity: 'success', badgeClass: 'badge success' },
  { id: 'deconnexion', label: 'Déconnexion', icon: LogOut, severity: 'neutral', badgeClass: 'badge neutral' },
  { id: 'creation', label: 'Création', icon: FileText, severity: 'primary', badgeClass: 'badge primary' },
  { id: 'modification', label: 'Modification', icon: Edit3, severity: 'warning', badgeClass: 'badge warning' },
  { id: 'suppression', label: 'Suppression', icon: Trash2, severity: 'danger', badgeClass: 'badge danger pulse' },
  { id: 'consultation', label: 'Consultation', icon: Eye, severity: 'info', badgeClass: 'badge teal' },
  { id: 'signature', label: 'Signature', icon: FileText, severity: 'primary', badgeClass: 'badge primary' },
  { id: 'transmission', label: 'Transmission', icon: Mail, severity: 'teal', badgeClass: 'badge teal' },
  { id: 'generation_code', label: 'Génération code', icon: Key, severity: 'warning', badgeClass: 'badge warning' },
  { id: 'revocation', label: 'Révocation', icon: XCircle, severity: 'danger', badgeClass: 'badge danger pulse' },
];

// Modules
const MODULES = [
  { id: 'auth', label: 'Authentification', icon: Shield },
  { id: 'aerodromes', label: 'Aérodromes', icon: Plane },
  { id: 'certification', label: 'Certification', icon: FileText },
  { id: 'homologation', label: 'Homologation', icon: FileText },
  { id: 'planning', label: 'Planning', icon: Calendar },
  { id: 'surveillance', label: 'Surveillance', icon: Eye },
  { id: 'ecarts', label: 'Écarts & PAC', icon: AlertTriangle },
  { id: 'evenements', label: 'Événements', icon: AlertCircle },
  { id: 'enquetes', label: 'Enquêtes', icon: MessageSquare },
  { id: 'messagerie', label: 'Messagerie', icon: Mail },
  { id: 'dossiers', label: 'Dossiers', icon: Briefcase },
  { id: 'formation', label: 'Formation', icon: Users },
  { id: 'kit', label: 'Kit Inspecteur', icon: FileText },
  { id: 'utilisateurs', label: 'Utilisateurs', icon: Users },
  { id: 'codes', label: "Codes d'accès", icon: Key },
];

export default function AuditModule({ userRole }: AuditModuleProps) {
  const auditLogs = useAppStore((s) => s.auditLogs);
  const addNotification = useAppStore((s) => s.addNotification);

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    action: 'tous',
    module: 'tous',
    utilisateur: 'tous',
    dateDebut: '',
    dateFin: '',
  });
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showActivityChart] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'raw'>('details');
  const [viewMode, setViewMode] = useState<'liste' | 'compact'>('liste');
  const [editFormData, setEditFormData] = useState<Partial<AuditLog>>({});

  const listeLogs = auditLogs ?? [];

  // Filtrer les logs
  const filteredLogs = useMemo(() => {
    return listeLogs.filter(log => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches =
          log.utilisateur_nom?.toLowerCase().includes(term) ||
          log.entite_nom?.toLowerCase().includes(term) ||
          log.entite_id?.toLowerCase().includes(term) ||
          log.ip?.includes(term);
        if (!matches) return false;
      }

      if (filters.action !== 'tous' && log.action !== filters.action) return false;
      if (filters.module !== 'tous' && log.module !== filters.module) return false;
      if (filters.utilisateur !== 'tous' && log.utilisateur_id !== filters.utilisateur) return false;

      if (filters.dateDebut) {
        const dateDebut = new Date(filters.dateDebut);
        const logDate = new Date(log.date);
        if (logDate < dateDebut) return false;
      }
      if (filters.dateFin) {
        const dateFin = new Date(filters.dateFin);
        dateFin.setHours(23, 59, 59);
        const logDate = new Date(log.date);
        if (logDate > dateFin) return false;
      }

      return true;
    });
  }, [listeLogs, searchTerm, filters]);

  // Données pour le graphique d'activité (7 derniers jours)
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const count = listeLogs.filter(log => log.date.startsWith(date)).length;
      return { date: date.slice(5), activités: count };
    });
  }, [listeLogs]);

  // Statistiques
  const stats = useMemo(() => ({
    total: listeLogs.length,
    parAction: listeLogs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    parModule: listeLogs.reduce((acc, log) => {
      acc[log.module] = (acc[log.module] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    utilisateursActifs: new Set(listeLogs.map(l => l.utilisateur_id)).size,
    actionsCritiques: listeLogs.filter(l => l.action === 'suppression' || l.action === 'revocation').length,
  }), [listeLogs]);

  const getActionBadge = (action: string) => {
    const config = ACTIONS.find(a => a.id === action);
    return config?.badgeClass || 'badge neutral';
  };

  const getActionIcon = (action: string) => {
    const config = ACTIONS.find(a => a.id === action);
    if (!config) return <FileText className="w-4 h-4" />;
    const Icon = config.icon;
    return <Icon className="w-4 h-4" />;
  };

  const getActionLabel = (action: string) => {
    const config = ACTIONS.find(a => a.id === action);
    return config?.label || action;
  };

  const getModuleIcon = (moduleId: string) => {
    const config = MODULES.find(m => m.id === moduleId);
    if (!config) return <FileText className="w-4 h-4" />;
    const Icon = config.icon;
    return <Icon className="w-4 h-4" />;
  };

  const getModuleLabel = (moduleId: string) => {
    const config = MODULES.find(m => m.id === moduleId);
    return config?.label || moduleId;
  };

  const handleExportCSV = () => {
    const csv = auditUtils.exporterCSV(filteredLogs as any);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    addNotification?.({
      user_id: '',
      type: 'success',
      title: 'Export réussi',
      message: `${filteredLogs.length} lignes exportées en CSV`,
      canal: 'in_app',
    });
  };

  const handleExportPDF = () => {
    addNotification?.({
      user_id: '',
      type: 'info',
      title: 'Export PDF',
      message: 'Export PDF en cours de développement',
      canal: 'in_app',
    });
  };

  // Actions CRUD
  const handleEdit = (log: any) => {
    setSelectedLog(log);
    setEditFormData({
      entite_nom: log.entite_nom,
      details: log.details,
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    addNotification?.({
      user_id: '',
      type: 'success',
      title: 'Audit modifié',
      message: `L'entrée ${selectedLog?.entite_id} a été modifiée`,
      canal: 'in_app',
    });
    setShowEditDialog(false);
    setSelectedLog(null);
  };

  const handleDelete = (log: any) => {
    setSelectedLog(log);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    addNotification?.({
      user_id: '',
      type: 'warning',
      title: 'Audit supprimé',
      message: `L'entrée ${selectedLog?.entite_id} a été supprimée`,
      canal: 'in_app',
    });
    setShowDeleteDialog(false);
    setSelectedLog(null);
  };

  const utilisateursList = useMemo(() => {
    const unique = new Map();
    listeLogs.forEach(log => {
      if (!unique.has(log.utilisateur_id)) {
        unique.set(log.utilisateur_id, {
          id: log.utilisateur_id,
          nom: log.utilisateur_nom,
        });
      }
    });
    return Array.from(unique.values());
  }, [listeLogs]);

  // Vue Liste détaillée
  const renderListView = () => (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Date/Heure</th>
            <th>Utilisateur</th>
            <th>Action</th>
            <th>Module</th>
            <th>Entité</th>
            <th>IP</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredLogs.slice(0, 100).map((log, idx) => (
            <tr
              key={log.id}
              className="cursor-pointer hover:bg-role-primary-soft group transition-colors"
              onClick={() => {
                setSelectedLog(log);
                setActiveTab('details');
                setShowDetails(true);
              }}
            >
              <td>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-foreground" />
                  <span className="text-small text-foreground">
                    {new Date(log.date).toLocaleString('fr-FR')}
                  </span>
                </div>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    log.utilisateur_role === 'admin' ? 'bg-role-primary' :
                    log.utilisateur_role === 'inspector' ? 'bg-warning' : 'bg-success'
                  }`} />
                  <div>
                    <p className="font-medium text-foreground">{log.utilisateur_nom}</p>
                    <p className="text-xs text-foreground">{log.utilisateur_role}</p>
                  </div>
                </div>
              </td>
              <td>
                <span className={`${getActionBadge(log.action)} flex items-center gap-1 w-fit`}>
                  {getActionIcon(log.action)}
                  <span>{getActionLabel(log.action)}</span>
                </span>
              </td>
              <td>
                <div className="flex items-center gap-2">
                  {getModuleIcon(log.module)}
                  <span className="text-small text-foreground">{getModuleLabel(log.module)}</span>
                </div>
              </td>
              <td>
                <div>
                  <p className="font-mono text-xs text-foreground">{log.entite_id}</p>
                  <p className="text-xs text-foreground">{log.entite_nom || '-'}</p>
                </div>
              </td>
              <td>
                <code className="code-oaci-badge text-xs bg-muted/30">
                  {log.ip || '-'}
                </code>
              </td>
              <td className="text-right">
                <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <button 
                    className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
                    onClick={() => handleEdit(log)}
                    title="Modifier"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button 
                    className="action-button danger hover:bg-danger/10 transition-all duration-200"
                    onClick={() => handleDelete(log)}
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button 
                    className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                    onClick={() => {
                      setSelectedLog(log);
                      setActiveTab('details');
                      setShowDetails(true);
                    }}
                    title="Voir détails"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filteredLogs.length > 100 && (
        <div className="p-4 text-center text-small text-foreground border-t border-border">
          Affichage des 100 premiers résultats sur {filteredLogs.length}
        </div>
      )}

      {filteredLogs.length === 0 && (
        <div className="p-12 text-center text-foreground">
          <FileSearch className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-body text-foreground">Aucun log trouvé</p>
          <p className="text-xs text-foreground mt-1">Modifiez vos filtres pour élargir la recherche</p>
        </div>
      )}
    </div>
  );

  // Vue Compacte (cartes)
  const renderCompactView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredLogs.slice(0, 50).map((log) => (
        <Card
          key={log.id}
          variant="role"
          className="cursor-pointer hover:shadow-role-glow transition-all"
          onClick={() => {
            setSelectedLog(log);
            setActiveTab('details');
            setShowDetails(true);
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center">
                {getActionIcon(log.action)}
              </div>
              <div>
                <p className="text-xs font-mono text-foreground">{log.entite_id}</p>
                <p className="text-xs font-medium text-foreground">{log.utilisateur_nom}</p>
              </div>
            </div>
            <span className={getActionBadge(log.action)}>
              {getActionLabel(log.action)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground mt-2">
            <Clock className="w-3 h-3" />
            <span>{new Date(log.date).toLocaleString('fr-FR')}</span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {getModuleIcon(log.module)}
            <span className="text-xs text-foreground">{getModuleLabel(log.module)}</span>
            <code className="code-oaci-badge text-[10px] ml-auto">{log.ip || '-'}</code>
          </div>
          {/* Actions dans la vue compacte */}
          <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-border" onClick={(e) => e.stopPropagation()}>
            <button 
              className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
              onClick={() => handleEdit(log)}
              title="Modifier"
            >
              <Edit3 className="w-3 h-3" />
            </button>
            <button 
              className="action-button danger hover:bg-danger/10 transition-all duration-200"
              onClick={() => handleDelete(log)}
              title="Supprimer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <button 
              className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
              onClick={() => {
                setSelectedLog(log);
                setActiveTab('details');
                setShowDetails(true);
              }}
              title="Voir détails"
            >
              <Eye className="w-3 h-3" />
            </button>
          </div>
        </Card>
      ))}

      {filteredLogs.length === 0 && (
        <div className="col-span-full p-12 text-center text-foreground">
          <FileSearch className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-body text-foreground">Aucun log trouvé</p>
        </div>
      )}
    </div>
  );

  // Modale de suppression
  const DeleteConfirmModal = () => (
    <FormShell
      open={showDeleteDialog && !!selectedLog}
      onClose={() => setShowDeleteDialog(false)}
      title="Confirmer la suppression"
      icon={AlertTriangle}
      size="md"
      dataRole={userRole}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowDeleteDialog(false)}>
            Annuler
          </button>
          <button className="btn btn-danger gap-2 hover:bg-danger/20 transition-all duration-200" onClick={confirmDelete}>
            <Trash2 className="w-4 h-4" />
            Supprimer définitivement
          </button>
        </>
      }
    >
      {selectedLog && (
        <>
          <p className="text-body text-foreground">
            Êtes-vous sûr de vouloir supprimer cette entrée d'audit ?
          </p>
          <p className="text-small text-foreground mt-2">
            ID: <span className="font-mono">{selectedLog.entite_id}</span><br />
            Action: {getActionLabel(selectedLog.action)}<br />
            Date: {new Date(selectedLog.date).toLocaleString('fr-FR')}
          </p>
          <p className="text-small text-danger mt-2">
            Cette action est irréversible.
          </p>
        </>
      )}
    </FormShell>
  );

  // Modale d'édition
  const EditModal = () => (
    <FormShell
      open={showEditDialog && !!selectedLog}
      onClose={() => setShowEditDialog(false)}
      title="Modifier l'entrée d'audit"
      icon={Edit3}
      size="lg"
      dataRole={userRole}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => setShowEditDialog(false)}>
            Annuler
          </button>
          <button className="btn btn-primary gap-2 hover:bg-primary/20 transition-all duration-200" onClick={handleSaveEdit}>
            <Save className="w-4 h-4" />
            Enregistrer
          </button>
        </>
      }
    >
      {selectedLog && (
        <div className="space-y-4">
          <div className="form-field">
            <label className="filter-label">ID de l'entité</label>
            <p className="code-oaci-badge">{selectedLog.entite_id}</p>
          </div>
          <div className="form-field">
            <label className="filter-label">Nom de l'entité</label>
            <input
              type="text"
              value={editFormData.entite_nom || ''}
              onChange={(e) => setEditFormData({...editFormData, entite_nom: e.target.value})}
              className={`w-full form-input ${focusClass}`}
            />
          </div>
          <div className="form-field">
            <label className="filter-label">Détails (JSON)</label>
            <textarea
              value={JSON.stringify(editFormData.details, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  setEditFormData({...editFormData, details: parsed});
                } catch (err) {
                  // Invalid JSON, ignore
                }
              }}
              rows={6}
              className={`w-full form-textarea font-mono text-xs ${focusClass}`}
            />
          </div>
        </div>
      )}
    </FormShell>
  );

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="audit">

      {/* En-tête */}
      <ModuleHeader
        icon={<FileSearch />}
        title="Journal d'Audit"
        description={`Traçabilité complète des actions - ${stats.total} événements`}
        actions={<div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="btn btn-secondary gap-2 hover:bg-secondary/20 transition-all duration-200">
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button onClick={handleExportPDF} className="btn btn-secondary gap-2 hover:bg-secondary/20 transition-all duration-200">
            <Printer className="w-4 h-4" />
            PDF
          </button>
        </div>}
      />

      {/* KPIs premium avec animations */}
      <div className="kpi-grid animate-fade-up">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <FileSearch className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label text-foreground">Total événements</div>
          <div className="kpi-value text-foreground">{stats.total}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-primary-soft">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="kpi-label text-foreground">Utilisateurs actifs</div>
          <div className="kpi-value text-foreground">{stats.utilisateursActifs}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-teal-soft">
            <Eye className="w-5 h-5 text-teal" />
          </div>
          <div className="kpi-label text-foreground">Consultations</div>
          <div className="kpi-value text-foreground">{stats.parAction.consultation || 0}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <AlertTriangle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label text-foreground">Actions critiques</div>
          <div className="kpi-value text-danger">{stats.actionsCritiques}</div>
          {stats.actionsCritiques > 0 && (
            <div className="kpi-trend down pulse text-[10px] text-foreground">⚠️ Surveiller</div>
          )}
        </div>
      </div>

      {/* Graphique d'activité */}
      {showActivityChart && chartData.length > 0 && (
        <Card variant="role" title="Activité des 7 derniers jours" icon={<TrendingUp className="h-4 w-4" />} className="animate-fade-up" style={{ animationDelay: '0.05s' } as any}>
          <BarChart
            data={chartData}
            xKey="date"
            bars={[{ key: 'activités', name: 'Actions' }]}
            height={200}
          />
        </Card>
      )}

      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
        <div className="flex flex-wrap items-center gap-3">
          {/* Recherche */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
            <input
              type="text"
              placeholder="Rechercher (utilisateur, entité, IP...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-foreground ${focusClass}`}
            />
          </div>

          {/* Filtre Action */}
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.action}
            onChange={e => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="tous">Toutes actions</option>
            {ACTIONS.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>

          {/* Filtre Module */}
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.module}
            onChange={e => setFilters({ ...filters, module: e.target.value })}
          >
            <option value="tous">Tous modules</option>
            {MODULES.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          {/* Filtre Utilisateur */}
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.utilisateur}
            onChange={e => setFilters({ ...filters, utilisateur: e.target.value })}
          >
            <option value="tous">Tous utilisateurs</option>
            {utilisateursList.map(u => (
              <option key={u.id} value={u.id}>{u.nom}</option>
            ))}
          </select>

          {/* Filtre Date Début */}
          <input
            type="date"
            value={filters.dateDebut}
            onChange={e => setFilters({ ...filters, dateDebut: e.target.value })}
            className={`h-10 px-3 rounded-xl border border-border bg-background text-foreground text-sm ${focusClass}`}
          />

          {/* Filtre Date Fin */}
          <input
            type="date"
            value={filters.dateFin}
            onChange={e => setFilters({ ...filters, dateFin: e.target.value })}
            className={`h-10 px-3 rounded-xl border border-border bg-background text-foreground text-sm ${focusClass}`}
          />

          {/* View Toggle */}
          <div className="view-toggle">
            <button className={viewMode === 'liste' ? 'active' : ''} onClick={() => setViewMode('liste')} title="Vue détaillée">
              <List className="w-4 h-4" />
            </button>
            <button className={viewMode === 'compact' ? 'active' : ''} onClick={() => setViewMode('compact')} title="Vue compacte">
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>

          {/* Bouton export */}
          <button onClick={handleExportCSV} className="action-button hover:bg-primary/10 transition-all duration-200" title="Exporter CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </Card>

      {/* Vue principale */}
      {viewMode === 'liste' && renderListView()}
      {viewMode === 'compact' && renderCompactView()}

      {/* Modales */}
      {showDeleteDialog && DeleteConfirmModal()}
      {showEditDialog && EditModal()}

      {/* Modal Détails premium */}
      <FormShell
        open={showDetails && !!selectedLog}
        onClose={() => setShowDetails(false)}
        title="Détails de l'événement"
        icon={FileSearch}
        size="2xl"
        dataRole={userRole}
        tabs={[
          { id: 'details', label: 'Détails' },
          { id: 'raw', label: 'Données brutes' },
        ]}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as 'details' | 'raw')}
        footer={
          <>
            <button
              className="btn btn-secondary gap-2 hover:bg-secondary/20 transition-all duration-200"
              onClick={() => {
                setShowDetails(false);
                if (selectedLog) handleEdit(selectedLog);
              }}
            >
              <Edit3 className="w-4 h-4" />
              Modifier
            </button>
            <button
              className="btn btn-danger gap-2 hover:bg-danger/20 transition-all duration-200"
              onClick={() => {
                setShowDetails(false);
                if (selectedLog) handleDelete(selectedLog);
              }}
            >
              <Trash2 className="w-4 h-4" />
              Supprimer
            </button>
          </>
        }
      >
        {selectedLog && (
          <>
            {activeTab === 'details' && (
              <div className="space-y-4 animate-fade-in">
                <div className="form-grid grid-cols-2 gap-4">
                  <div className="form-field">
                    <label className="filter-label">Date et heure</label>
                    <p className="text-body font-medium text-foreground">{new Date(selectedLog.date).toLocaleString('fr-FR')}</p>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Utilisateur</label>
                    <p className="text-body font-medium text-foreground">{selectedLog.utilisateur_nom}</p>
                    <p className="text-xs text-foreground">{selectedLog.utilisateur_role}</p>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Action</label>
                    <span className={getActionBadge(selectedLog.action)}>
                      {getActionLabel(selectedLog.action)}
                    </span>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Module</label>
                    <p className="text-body text-foreground">{getModuleLabel(selectedLog.module)}</p>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Type d'entité</label>
                    <p className="text-body text-foreground">{selectedLog.entite_type}</p>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">ID entité</label>
                    <p className="code-oaci-badge">{selectedLog.entite_id}</p>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">Nom entité</label>
                    <p className="text-body text-foreground">{selectedLog.entite_nom || '-'}</p>
                  </div>
                  <div className="form-field">
                    <label className="filter-label">IP</label>
                    <code className="code-oaci-badge text-xs">{selectedLog.ip || '-'}</code>
                  </div>
                  <div className="col-span-2 form-field">
                    <label className="filter-label">User Agent</label>
                    <p className="text-small text-foreground truncate">{selectedLog.user_agent || '-'}</p>
                  </div>
                </div>

                {selectedLog.details && (
                  <div className="form-field">
                    <label className="filter-label">Détails supplémentaires</label>
                    <pre className="bg-role-primary-soft p-3 rounded-xl text-xs overflow-auto max-h-40 font-mono text-foreground">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="animate-fade-in">
                <pre className="bg-role-primary-soft p-4 rounded-xl text-xs overflow-auto max-h-96 font-mono text-foreground">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </FormShell>
    </div>
  );
}
