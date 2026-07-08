// components/modules/audit/AuditModule.tsx
// Traçabilité complète des actions — journal append-only

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
  Shield,
  Clock,
  Eye,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Key,
  Mail,
  LogIn,
  LogOut,
  FileText,
  Briefcase,
  Users,
  Plane,
  MessageSquare,
  TrendingUp,
  Grid3x3,
  List,
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

const PAGE_SIZE = 50;

// Types d'actions (labels via auditUtils pour éviter la duplication)
const ACTIONS = [
  { id: 'connexion', icon: LogIn, severity: 'success', badgeClass: 'badge success' },
  { id: 'deconnexion', icon: LogOut, severity: 'neutral', badgeClass: 'badge neutral' },
  { id: 'creation', icon: FileText, severity: 'primary', badgeClass: 'badge primary' },
  { id: 'modification', icon: FileText, severity: 'warning', badgeClass: 'badge warning' },
  { id: 'suppression', icon: FileText, severity: 'danger', badgeClass: 'badge danger pulse' },
  { id: 'consultation', icon: Eye, severity: 'info', badgeClass: 'badge teal' },
  { id: 'signature', icon: FileText, severity: 'primary', badgeClass: 'badge primary' },
  { id: 'transmission', icon: Mail, severity: 'teal', badgeClass: 'badge teal' },
  { id: 'generation_code', icon: Key, severity: 'warning', badgeClass: 'badge warning' },
  { id: 'revocation', icon: XCircle, severity: 'danger', badgeClass: 'badge danger pulse' },
];

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
  const [activeTab, setActiveTab] = useState<'details' | 'raw'>('details');
  const [viewMode, setViewMode] = useState<'liste' | 'compact'>('liste');
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  const listeLogs = auditLogs ?? [];

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

  const paginatedLogs = useMemo(() => {
    return filteredLogs.slice(0, displayLimit);
  }, [filteredLogs, displayLimit]);

  const hasMore = displayLimit < filteredLogs.length;

  const handleLoadMore = useCallback(() => {
    setDisplayLimit(prev => prev + PAGE_SIZE);
  }, []);

  // Graphique d'activité (7 derniers jours)
  const showActivityChart = true;
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

  const stats = useMemo(() => ({
    total: listeLogs.length,
    parAction: listeLogs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    utilisateursActifs: new Set(listeLogs.map(l => l.utilisateur_id)).size,
    actionsCritiques: listeLogs.filter(l => l.action === 'suppression' || l.action === 'revocation').length,
  }), [listeLogs]);

  const getActionBadge = useCallback((action: string) => {
    const config = ACTIONS.find(a => a.id === action);
    return config?.badgeClass || 'badge neutral';
  }, []);

  const getActionIcon = useCallback((action: string) => {
    const config = ACTIONS.find(a => a.id === action);
    if (!config) return <FileText className="w-4 h-4" />;
    const Icon = config.icon;
    return <Icon className="w-4 h-4" />;
  }, []);

  const getActionLabel = useCallback((action: string) => {
    return auditUtils.formatAction(action);
  }, []);

  const getModuleIcon = useCallback((moduleId: string) => {
    const config = MODULES.find(m => m.id === moduleId);
    if (!config) return <FileText className="w-4 h-4" />;
    const Icon = config.icon;
    return <Icon className="w-4 h-4" />;
  }, []);

  const getModuleLabel = useCallback((moduleId: string) => {
    const config = MODULES.find(m => m.id === moduleId);
    return config?.label || auditUtils.formatModule(moduleId);
  }, []);

  const handleExportCSV = useCallback(() => {
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
  }, [filteredLogs, addNotification]);

  const handleOpenDetails = useCallback((log: AuditLog) => {
    setSelectedLog(log);
    setActiveTab('details');
    setShowDetails(true);
  }, []);

  const utilisateursList = useMemo(() => {
    const unique = new Map<string, { id: string; nom: string }>();
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

  // Vue liste
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
            <th className="text-right">Détails</th>
          </tr>
        </thead>
        <tbody>
          {paginatedLogs.map((log) => (
            <tr
              key={log.id}
              className="cursor-pointer hover:bg-role-primary-soft group transition-colors"
              onClick={() => handleOpenDetails(log)}
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
                <button
                  className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
                  onClick={(e) => { e.stopPropagation(); handleOpenDetails(log); }}
                  title="Voir détails"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {hasMore && (
        <div className="p-4 text-center border-t border-border">
          <button
            onClick={handleLoadMore}
            className="btn btn-ghost gap-2 text-sm"
          >
            Voir plus ({filteredLogs.length - paginatedLogs.length} restants)
          </button>
        </div>
      )}

      {filteredLogs.length > 0 && !hasMore && paginatedLogs.length > PAGE_SIZE && (
        <div className="p-3 text-center text-xs text-foreground border-t border-border">
          Affichage de tous les {filteredLogs.length} résultats
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

  // Vue compacte (cartes)
  const renderCompactView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {paginatedLogs.map((log) => (
        <Card
          key={log.id}
          variant="role"
          className="cursor-pointer hover:shadow-role-glow transition-all"
          onClick={() => handleOpenDetails(log)}
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
          <div className="flex justify-end mt-3 pt-2 border-t border-border">
            <button
              className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200"
              onClick={(e) => { e.stopPropagation(); handleOpenDetails(log); }}
              title="Voir détails"
            >
              <Eye className="w-3 h-3" />
            </button>
          </div>
        </Card>
      ))}

      {hasMore && (
        <div className="col-span-full text-center py-4">
          <button
            onClick={handleLoadMore}
            className="btn btn-ghost gap-2 text-sm"
          >
            Voir plus ({filteredLogs.length - paginatedLogs.length} restants)
          </button>
        </div>
      )}

      {filteredLogs.length === 0 && (
        <div className="col-span-full p-12 text-center text-foreground">
          <FileSearch className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-body text-foreground">Aucun log trouvé</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="audit">

      <ModuleHeader
        icon={<FileSearch />}
        title="Journal d'Audit"
        description={`Traçabilité complète des actions — ${stats.total} événements`}
        actions={
          <button onClick={handleExportCSV} className="btn btn-secondary gap-2 hover:bg-secondary/20 transition-all duration-200">
            <Download className="w-4 h-4" />
            CSV
          </button>
        }
      />

      {/* KPIs */}
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
            <div className="kpi-trend down pulse text-[10px] text-foreground">Actions à surveiller</div>
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

      {/* Filtres */}
      <Card className="border-primary/20 bg-primary-soft/30" icon={<Filter className="w-4 h-4 text-role-primary" />} title="Filtres & recherche">
        <div className="flex flex-wrap items-center gap-3">
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

          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.action}
            onChange={e => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="tous">Toutes actions</option>
            {ACTIONS.map(a => (
              <option key={a.id} value={a.id}>{auditUtils.formatAction(a.id)}</option>
            ))}
          </select>

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

          <input
            type="date"
            value={filters.dateDebut}
            onChange={e => setFilters({ ...filters, dateDebut: e.target.value })}
            className={`h-10 px-3 rounded-xl border border-border bg-background text-foreground text-sm ${focusClass}`}
          />

          <input
            type="date"
            value={filters.dateFin}
            onChange={e => setFilters({ ...filters, dateFin: e.target.value })}
            className={`h-10 px-3 rounded-xl border border-border bg-background text-foreground text-sm ${focusClass}`}
          />

          <div className="view-toggle">
            <button className={viewMode === 'liste' ? 'active' : ''} onClick={() => setViewMode('liste')} title="Vue détaillée">
              <List className="w-4 h-4" />
            </button>
            <button className={viewMode === 'compact' ? 'active' : ''} onClick={() => setViewMode('compact')} title="Vue compacte">
              <Grid3x3 className="w-4 h-4" />
            </button>
          </div>

          <button onClick={handleExportCSV} className="action-button hover:bg-primary/10 transition-all duration-200" title="Exporter CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </Card>

      {viewMode === 'liste' && renderListView()}
      {viewMode === 'compact' && renderCompactView()}

      {/* Modal Détails */}
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
