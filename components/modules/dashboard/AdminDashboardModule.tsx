// components/modules/dashboard/AdminDashboardModule.tsx
// ✅ Tableau de bord administrateur — vue système globale
// ✅ Design system premium - classes harmonisées
// ✅ Animations et personnalisation par rôle

'use client';

import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Shield,
  Users,
  Key,
  FileSearch,
  Plane,
  AlertTriangle,
  CheckCircle2,
  Eye,
  TrendingUp,
  Activity,
  Settings,
  Database,
  Clock,
  AlertCircle,
  UserCheck,
  Lock,
  BarChart3,
  Flame,
  MessageSquare,
  Calendar,
  Gauge,
  Plus,
  PenSquare,
  Trash2,
} from 'lucide-react';
import { useAppStore, type Utilisateur, type Aerodrome, type Ecart, type CodeAcces, type AuditLog, type ApiKey } from '@/lib/store';
import { FormShell } from '@/components/ui/FormShell';
import { ModuleHeader } from '@/components/layout/ModuleHeader';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

export function AdminDashboardModule() {
  const aerodromes = useAppStore(s => s.aerodromes)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const surveillances = useAppStore(s => s.surveillances)
  const ecarts = useAppStore(s => s.ecarts)
  const codesAcces = useAppStore(s => s.codesAcces)
  const auditLogs = useAppStore(s => s.auditLogs)
  const evenements = useAppStore(s => s.evenements)
  const notifications = useAppStore(s => s.notifications)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const setActiveModule = useAppStore(s => s.setActiveModule);

  const getMaturiteFromRisk = (aerodromeId: string): number => {
    const profil = profilsRisque?.[aerodromeId];
    if (!profil || profil.score_global == null) return 0;
    const score = profil.score_global;
    if (score >= 80) return 5;
    if (score >= 60) return 4;
    if (score >= 40) return 3;
    if (score >= 20) return 2;
    return 1;
  };

  const stats = useMemo(() => {
    const totalUsers = utilisateurs?.length || 0;
    const activeUsers = utilisateurs?.filter(u => u.statut !== 'inactif' && u.statut !== 'suspendu').length || 0;

    const roleCount: Record<string, number> = {};
    utilisateurs?.forEach(u => {
      roleCount[u.role] = (roleCount[u.role] || 0) + 1;
    });

    const aerodromesActifsListe = (aerodromes || []).filter(a => !a.deleted_at);
    const totalAerodromes = aerodromesActifsListe.length;
    const aeroActifs = aerodromesActifsListe.filter(a => a.statut === 'actif').length || 0;

    const ecartsOuverts = ecarts?.filter(e =>
      ['ouvert', 'pac_attendu', 'pac_soumis', 'en_retard'].includes(e.statut)
    ).length || 0;
    const ecartsCritiques = ecarts?.filter(e =>
      e.niveau_risque === 'critique' && e.statut !== 'cloture'
    ).length || 0;

    const codesActifs = codesAcces?.filter(c => c.statut === 'actif').length || 0;
    const codesExpires = codesAcces?.filter(c => c.statut === 'expire').length || 0;

    const auditAujourdhui = auditLogs?.filter(l => {
      const date = new Date(l.date);
      const now = new Date();
      return date.toDateString() === now.toDateString();
    }).length || 0;

    const surveillancesCeMois = surveillances?.filter(s => {
      const date = new Date(s.date_debut);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length || 0;

    const taux = aeroActifs > 0 ? Math.round((aeroActifs / totalAerodromes) * 100) : 0;

    return {
      totalUsers,
      activeUsers,
      roleCount,
      totalAerodromes,
      aeroActifs,
      ecartsOuverts,
      ecartsCritiques,
      codesActifs,
      codesExpires,
      auditAujourdhui,
      surveillancesCeMois,
      taux,
      notificationsNonLues: notifications?.filter(n => !n.read_at).length || 0,
    };
  }, [aerodromes, utilisateurs, surveillances, ecarts, codesAcces, auditLogs, evenements, notifications]);

  const roleLabelMap: Record<string, string> = {
    admin: 'Administrateurs',
    inspector: 'Inspecteurs',
    dg_anacim: 'DG ANACIM',
    dg_operator: 'DG Exploitants',
    focal_operator: 'Points Focaux',
    staff_operator: 'Personnel Exploitant',
    guest: 'Invités',
  };

  const roleColorMap: Record<string, string> = {
    admin: 'danger',
    inspector: 'warning',
    dg_anacim: 'success',
    dg_operator: 'primary',
    focal_operator: 'primary',
    staff_operator: 'neutral',
    guest: 'neutral',
  };

  const systemModules = [
    { id: 'aerodromes', label: 'Aérodromes', icon: Plane, count: stats.totalAerodromes, status: 'ok' },
    { id: 'surveillance', label: 'Surveillance', icon: Eye, count: stats.surveillancesCeMois, status: 'ok' },
    { id: 'plans-actions', label: 'Écarts & PAC', icon: Flame, count: stats.ecartsOuverts, status: stats.ecartsCritiques > 0 ? 'alert' : 'ok' },
    { id: 'utilisateurs', label: 'Utilisateurs', icon: Users, count: stats.totalUsers, status: 'ok' },
    { id: 'codes', label: "Codes d'accès", icon: Key, count: stats.codesActifs, status: stats.codesExpires > 0 ? 'warning' : 'ok' },
    { id: 'audit', label: 'Journal Audit', icon: FileSearch, count: stats.auditAujourdhui, status: 'ok' },
    { id: 'messagerie', label: 'Messagerie', icon: MessageSquare, count: stats.notificationsNonLues, status: stats.notificationsNonLues > 0 ? 'warning' : 'ok' },
    { id: 'evenements', label: 'Événements', icon: AlertTriangle, count: evenements?.length || 0, status: 'ok' },
  ];

  const recentAuditLogs = useMemo(() => {
    return [...(auditLogs || [])]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [auditLogs]);

  const now = new Date();

  return (
    <div className="space-y-6 animate-fade-in" data-module="admin-dashboard">

      {/* ==================== EN-TÊTE ==================== */}
      <ModuleHeader
        icon={<Shield />}
        title="Administration Système"
        description="Supervision globale — SGDA ANACIM"
        actions={<div className="flex items-center gap-3">
          <span className="badge outline px-3 py-1">
            {now.toLocaleDateString('fr-FR', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          {stats.ecartsCritiques > 0 && (
            <span className="badge danger pulse">
              {stats.ecartsCritiques} écart(s) critique(s)
            </span>
          )}
        </div>}
      />

      {/* ==================== KPIs PRINCIPAUX ==================== */}
      <div className="kpi-grid">
        {/* Utilisateurs */}
        <div className="kpi-card cursor-pointer hover:shadow-role-glow transition-all animate-fade-up" style={{ animationDelay: '0.05s' }} onClick={() => setActiveModule('utilisateurs')}>
          <div className="kpi-icon"><Users className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.totalUsers}</div>
            <div className="kpi-label">Utilisateurs</div>
            <div className="text-xs text-success mt-1">{stats.activeUsers} actifs</div>
          </div>
        </div>

        {/* Aérodromes */}
        <div className="kpi-card cursor-pointer hover:shadow-role-glow transition-all animate-fade-up" style={{ animationDelay: '0.1s' }} onClick={() => setActiveModule('aerodromes')}>
          <div className="kpi-icon"><Plane className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.totalAerodromes}</div>
            <div className="kpi-label">Aérodromes</div>
            <div className="text-xs text-primary mt-1">{stats.aeroActifs} actifs</div>
          </div>
        </div>

        {/* Écarts */}
        <div className="kpi-card cursor-pointer hover:shadow-role-glow transition-all animate-fade-up" style={{ animationDelay: '0.15s' }} onClick={() => setActiveModule('plans-actions')}>
          <div className="kpi-icon"><AlertCircle className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.ecartsOuverts}</div>
            <div className="kpi-label">Écarts ouverts</div>
            {stats.ecartsCritiques > 0 && (
              <div className="text-xs text-danger mt-1 flex items-center gap-1">
                <Flame className="w-3 h-3" />
                {stats.ecartsCritiques} critiques
              </div>
            )}
          </div>
        </div>

        {/* Codes d'accès */}
        <div className="kpi-card cursor-pointer hover:shadow-role-glow transition-all animate-fade-up" style={{ animationDelay: '0.2s' }} onClick={() => setActiveModule('codes')}>
          <div className="kpi-icon"><Key className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.codesActifs}</div>
            <div className="kpi-label">Codes actifs</div>
            {stats.codesExpires > 0 && (
              <div className="text-xs text-warning mt-1">{stats.codesExpires} expirés</div>
            )}
          </div>
        </div>

        {/* Audit */}
        <div className="kpi-card cursor-pointer hover:shadow-role-glow transition-all animate-fade-up" style={{ animationDelay: '0.25s' }} onClick={() => setActiveModule('audit')}>
          <div className="kpi-icon"><FileSearch className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.auditAujourdhui}</div>
            <div className="kpi-label">Événements audit</div>
            <div className="text-xs text-muted mt-1">aujourd'hui</div>
          </div>
        </div>

        {/* Surveillances */}
        <div className="kpi-card cursor-pointer hover:shadow-role-glow transition-all animate-fade-up" style={{ animationDelay: '0.3s' }} onClick={() => setActiveModule('surveillance')}>
          <div className="kpi-icon"><Eye className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.surveillancesCeMois}</div>
            <div className="kpi-label">Surveillances</div>
            <div className="text-xs text-muted mt-1">ce mois-ci</div>
          </div>
        </div>
      </div>

      {/* ==================== SECTION 2 COLONNES ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Répartition des rôles */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.35s' }}>
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-role-primary" />
              Répartition des utilisateurs
            </div>
          </div>
          <div className="card-content space-y-3">
            {Object.entries(stats.roleCount).map(([role, count]) => (
              <div key={role} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <span className={`badge ${roleColorMap[role] || 'neutral'}`}>
                    {roleLabelMap[role] || role}
                  </span>
                  <div className="flex-1">
                    <div className="progress h-2">
                      <div className="progress-bar" style={{ width: `${stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                <span className="text-small font-semibold text-role-primary w-6 text-right">{count}</span>
              </div>
            ))}
            {Object.keys(stats.roleCount).length === 0 && (
              <p className="text-muted text-sm text-center py-4">Aucun utilisateur enregistré</p>
            )}
            <button
              className="btn btn-secondary w-full mt-2"
              onClick={() => setActiveModule('utilisateurs')}
            >
              Gérer les utilisateurs
            </button>
          </div>
        </div>

        {/* Modules système */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.4s' }}>
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Database className="h-5 w-5 text-role-primary" />
              État des modules
            </div>
          </div>
          <div className="card-content">
            <div className="grid grid-cols-2 gap-2">
              {systemModules.map((mod) => {
                const Icon = mod.icon;
                const isAlert = mod.status === 'alert';
                const isWarning = mod.status === 'warning';
                return (
                  <button
                    key={mod.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-role-primary-soft hover:bg-role-primary-soft/80 transition-colors text-left w-full border border-transparent hover:border-role-primary/20 group"
                    onClick={() => setActiveModule(mod.id)}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isAlert ? 'bg-danger/10 text-danger' :
                      isWarning ? 'bg-warning/10 text-warning' :
                      'bg-role-primary/10 text-role-primary'
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-role-primary truncate">{mod.label}</div>
                      <div className="text-xs text-muted">
                        {mod.count > 0 ? `${mod.count} élément(s)` : 'Aucun'}
                      </div>
                    </div>
                    {(isAlert || isWarning) && (
                      <div className={`w-2 h-2 rounded-full ${isAlert ? 'bg-danger animate-pulse' : 'bg-warning'}`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CODES D'ACCÈS + AUDIT ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Codes d'accès récents */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.45s' }}>
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Lock className="h-5 w-5 text-role-primary" />
              Codes d'accès récents
            </div>
          </div>
          <div className="card-content">
            {!codesAcces || codesAcces.length === 0 ? (
              <div className="text-center py-8">
                <Key className="h-10 w-10 text-muted mx-auto mb-3 opacity-30" />
                <p className="text-muted text-sm">Aucun code d'accès généré</p>
                <button
                  className="btn btn-secondary btn-sm mt-3"
                  onClick={() => setActiveModule('codes')}
                >
                  Générer un code
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {codesAcces.slice(0, 6).map((code) => (
                  <div
                    key={code.id}
                    className="flex items-center justify-between p-3 bg-role-primary-soft rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      <span className="code-oaci-badge text-xs">
                        ****{code.code_partiel || '????'}
                      </span>
                      <span className="text-xs text-muted">{aerodromes?.find(a => a.id === code.aerodrome_id)?.code_oaci || code.aerodrome_id}</span>
                    </div>
                    <span className={`badge ${
                      code.statut === 'actif' ? 'success' :
                      code.statut === 'expire' ? 'warning' : 'neutral'
                    }`}>
                      {code.statut}
                    </span>
                  </div>
                ))}
                <button
                  className="btn btn-secondary w-full mt-2"
                  onClick={() => setActiveModule('codes')}
                >
                  Voir tous les codes
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Journal d'audit récent */}
        <div className="card animate-fade-up" style={{ animationDelay: '0.5s' }}>
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Activity className="h-5 w-5 text-role-primary" />
              Activité système récente
            </div>
          </div>
          <div className="card-content">
            {recentAuditLogs.length === 0 ? (
              <div className="text-center py-8">
                <FileSearch className="h-10 w-10 text-muted mx-auto mb-3 opacity-30" />
                <p className="text-muted text-sm">Aucune activité enregistrée</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 bg-role-primary-soft rounded-xl"
                  >
                    <div className="w-7 h-7 rounded-full bg-role-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Activity className="h-3.5 w-3.5 text-role-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-role-primary truncate">{log.action}</p>
                      <p className="text-xs text-muted">
                        {log.utilisateur_nom} •{' '}
                        {new Date(log.date).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-secondary w-full mt-2"
                  onClick={() => setActiveModule('audit')}
                >
                  Voir le journal complet
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== VUE D'ENSEMBLE DES AÉRODROMES ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.55s' }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Plane className="h-5 w-5 text-role-primary" />
            Vue d'ensemble des aérodromes
          </div>
        </div>
        <div className="card-content">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Code OACI</th>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Région</th>
                  <th>Maturité SGS</th>
                  <th>Statut</th>
                  <th>Écarts</th>
                </tr>
              </thead>
              <tbody>
                {(aerodromes || []).map((aero) => {
                  const nbEcarts = ecarts?.filter(
                    e => e.aerodrome_id === aero.id && e.statut !== 'cloture'
                  ).length || 0;
                  const nbCritiques = ecarts?.filter(
                    e =>
                      e.aerodrome_id === aero.id &&
                      e.niveau_risque === 'critique' &&
                      e.statut !== 'cloture'
                  ).length || 0;

                  return (
                    <tr
                      key={aero.id}
                      className="cursor-pointer hover:bg-role-primary-soft transition-colors"
                      onClick={() => setActiveModule('aerodromes')}
                    >
                      <td><span className="code-oaci-badge">{aero.code_oaci}</span></td>
                      <td className="text-small text-foreground">{aero.nom}</td>
                      <td>
                        <span className={`badge ${aero.type === 'international' ? 'primary' : 'neutral'}`}>
                          {aero.type}
                        </span>
                      </td>
                      <td className="text-small text-muted">{aero.region}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="progress w-16 h-2">
                            <div className="progress-bar" style={{ width: `${(getMaturiteFromRisk(aero.id) / 5) * 100}%` }} />
                          </div>
                          <span className="text-small text-foreground">{getMaturiteFromRisk(aero.id)}/5</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${aero.statut === 'actif' ? 'success' : 'warning'}`}>
                          {aero.statut}
                        </span>
                      </td>
                      <td>
                        {nbEcarts > 0 ? (
                          <div className="flex items-center gap-1">
                            <span className={`badge ${nbCritiques > 0 ? 'danger' : 'warning'}`}>
                              {nbEcarts}
                            </span>
                            {nbCritiques > 0 && (
                              <span className="text-xs text-danger flex items-center gap-0.5">
                                <Flame className="w-2.5 h-2.5" />
                                {nbCritiques}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="badge success">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ==================== CLÉS API ==================== */}
      <ApiKeysManager />

      {/* ==================== ACCÈS RAPIDES ADMIN ==================== */}
      <div className="card animate-fade-up" style={{ animationDelay: '0.6s' }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Settings className="h-5 w-5 text-role-primary" />
            Accès rapides — Administration
          </div>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { id: 'utilisateurs', label: 'Gérer les utilisateurs', icon: Users },
              { id: 'codes', label: "Codes d'accès", icon: Key },
              { id: 'audit', label: "Journal d'audit", icon: FileSearch },
              { id: 'planning', label: 'Planning général', icon: BarChart3 },
              { id: 'certification', label: 'Certifications', icon: CheckCircle2 },
              { id: 'homologation', label: 'Homologations', icon: Shield },
              { id: 'formation', label: 'Formation', icon: TrendingUp },
              { id: 'charge', label: 'Charge de travail', icon: Gauge },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-role-primary-soft hover:bg-role-primary/10 transition-colors border border-transparent hover:border-role-primary/20 text-center group"
                  onClick={() => setActiveModule(item.id)}
                >
                  <div className="w-10 h-10 bg-role-primary/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Icon className="h-5 w-5 text-role-primary" />
                  </div>
                  <span className="text-xs font-medium text-role-primary leading-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// COMPOSANT : GESTION DES CLÉS API
// ============================================================
function ApiKeysManager() {
  const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
  const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }
  const apiKeys = useAppStore(s => s.apiKeys)
  const addApiKey = useAppStore(s => s.addApiKey)
  const updateApiKey = useAppStore(s => s.updateApiKey)
  const deleteApiKey = useAppStore(s => s.deleteApiKey)
  const [showModal, setShowModal] = useState(false)
  const [editKey, setEditKey] = useState<ApiKey | null>(null)
  const [form, setForm] = useState({ service: 'groq', key_value: '', label: '', is_active: true })

  const services = [
    { value: 'groq', label: 'Groq (IA principale)' },
    { value: 'openrouter', label: 'OpenRouter (IA fallback)' },
    { value: 'resend', label: 'Resend (emails)' },
    { value: 'twilio_account_sid', label: 'Twilio Account SID' },
    { value: 'twilio_auth_token', label: 'Twilio Auth Token' },
    { value: 'twilio_auth_sid', label: 'Twilio Auth SID' },
    { value: 'twilio_phone', label: 'Twilio Phone Number' },
  ]

  const openAdd = () => { setEditKey(null); setForm({ service: 'groq', key_value: '', label: '', is_active: true }); setShowModal(true) }
  const openEdit = (k: ApiKey) => { setEditKey(k); setForm({ service: k.service, key_value: k.key_value, label: k.label || '', is_active: k.is_active }); setShowModal(true) }

  const handleSave = async () => {
    if (!form.key_value.trim()) return
    if (editKey) {
      await updateApiKey(editKey.id, { service: form.service, key_value: form.key_value, label: form.label, is_active: form.is_active })
    } else {
      await addApiKey({ service: form.service, key_value: form.key_value, label: form.label, is_active: form.is_active, fallback_order: apiKeys.filter(k => k.service === form.service).length })
    }
    setShowModal(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer cette clé API ?')) await deleteApiKey(id)
  }

  const getServiceLabel = (s: string) => services.find(x => x.value === s)?.label || s

  return (
    <div className="card animate-fade-up" style={{ animationDelay: '0.55s' }}>
      <div className="card-header">
        <div className="card-title flex items-center gap-2">
          <Key className="h-5 w-5 text-role-primary" />
          Clés API
        </div>
        <button className="btn btn-primary btn-sm gap-1" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" />Ajouter une clé
        </button>
      </div>
      <div className="card-content">
        {apiKeys.length === 0 ? (
          <div className="text-center py-8">
            <Key className="h-10 w-10 text-muted mx-auto mb-3 opacity-30" />
            <p className="text-muted text-sm">Aucune clé API enregistrée</p>
            <p className="text-xs text-muted-foreground mt-1">Les clés dans .env.local sont utilisées par défaut</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table table-compact">
              <thead>
                <tr><th>Service</th><th>Clé</th><th>Statut</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {apiKeys.map(k => (
                  <tr key={k.id}>
                    <td><span className="text-xs font-medium">{getServiceLabel(k.service)}</span></td>
                    <td><code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{k.key_value.substring(0, 12)}...</code></td>
                    <td><span className={`badge ${k.is_active ? 'success' : 'neutral'}`}>{k.is_active ? 'Actif' : 'Inactif'}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button className="action-button" title="Modifier" onClick={() => openEdit(k)}><PenSquare className="w-3.5 h-3.5" /></button>
                        <button className="action-button text-danger" title="Supprimer" onClick={() => handleDelete(k.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal ajout/modification */}
      {showModal && createPortal(
        <FormShell open={showModal} onClose={() => setShowModal(false)}
          title={editKey ? 'Modifier la clé API' : 'Ajouter une clé API'}
          icon={Key} size="md"
          footer={<div className="flex gap-2"><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button className="btn btn-primary" onClick={handleSave}>{editKey ? 'Enregistrer' : 'Ajouter'}</button></div>}
        >
          <div className="space-y-4">
            <div className="form-field">
              <label className="filter-label">Service</label>
              <select className={`form-select ${focusClass}`} style={selectStyle}
                value={form.service} onChange={e => setForm({ ...form, service: e.target.value })}>
                {services.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="filter-label">Clé API</label>
              <input className={`form-input ${focusClass}`} value={form.key_value}
                onChange={e => setForm({ ...form, key_value: e.target.value })}
                placeholder="sk-or-... ou gsk_... ou re_..." />
            </div>
            <div className="form-field">
              <label className="filter-label">Libellé (optionnel)</label>
              <input className={`form-input ${focusClass}`} value={form.label}
                onChange={e => setForm({ ...form, label: e.target.value })}
                placeholder="ex: Clé principale Groq" />
            </div>
            <label className="form-checkbox cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              <span className="text-sm">Clé active</span>
            </label>
          </div>
        </FormShell>, document.body
      )}
    </div>
  )
}
