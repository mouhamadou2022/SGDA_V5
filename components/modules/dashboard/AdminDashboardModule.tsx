// components/modules/dashboard/AdminDashboardModule.tsx
// Tableau de bord administrateur — vue système globale
// Design system premium - classes harmonisées

'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCard } from './AlertCard';
import {
  Users,
  Plane,
  AlertCircle,
  Eye,
  Key,
  FileSearch,
  BarChart3,
  CheckCircle2,
  Shield,
  TrendingUp,
  Gauge,
  Plus,
  PenSquare,
  Trash2,
  Flame,
} from 'lucide-react';
import { useAppStore, type ApiKey } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { FormShell } from '@/components/ui/FormShell';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

export default function AdminDashboardModule({ user: _user }: { user: any }) {
  const user = useAppStore(s => s.user);
  const utilisateurs = useAppStore(s => s.utilisateurs);
  const aerodromes = useAppStore(s => s.aerodromes);
  const ecarts = useAppStore(s => s.ecarts);
  const surveillances = useAppStore(s => s.surveillances);
  const codesAcces = useAppStore(s => s.codesAcces);
  const setActiveModule = useAppStore(s => s.setActiveModule);

  const stats = useMemo(() => {
    const totalUsers = utilisateurs?.length || 0;
    const activeUsers = utilisateurs?.filter(u => u.statut !== 'inactif' && u.statut !== 'suspendu').length || 0;
    const totalAerodromes = (aerodromes || []).filter(a => !a.deleted_at).length;
    const ecartsOuverts = ecarts?.filter(e =>
      ['ouvert', 'pac_attendu', 'pac_soumis', 'en_retard'].includes(e.statut)
    ).length || 0;
    const ecartsCritiques = ecarts?.filter(e =>
      e.niveau_risque === 'critique' && e.statut !== 'cloture'
    ).length || 0;
    const surveillancesCeMois = surveillances?.filter(s => {
      const date = new Date(s.date_debut);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length || 0;
    const codesActifs = codesAcces?.filter(c => c.statut === 'actif').length || 0;

    return { totalUsers, activeUsers, totalAerodromes, ecartsOuverts, ecartsCritiques, surveillancesCeMois, codesActifs };
  }, [utilisateurs, aerodromes, ecarts, surveillances, codesAcces]);

  return (
    <div className="space-y-6 animate-fade-in" data-module="admin-dashboard">

      {/* ==================== ALERTES ==================== */}
      <AlertCard
        role={user?.role || 'admin'}
        onAction={(action) => setActiveModule?.(action)}
      />

      {/* ==================== KPIs ==================== */}
      <div className="kpi-grid">
        <div className="kpi-card cursor-pointer animate-fade-up" style={{ animationDelay: '0.05s' }} onClick={() => setActiveModule('utilisateurs')}>
          <div className="kpi-icon"><Users className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.totalUsers}</div>
            <div className="kpi-label">Utilisateurs</div>
            <div className="text-xs text-success mt-1">{stats.activeUsers} actifs</div>
          </div>
        </div>

        <div className="kpi-card cursor-pointer animate-fade-up" style={{ animationDelay: '0.1s' }} onClick={() => setActiveModule('aerodromes')}>
          <div className="kpi-icon"><Plane className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.totalAerodromes}</div>
            <div className="kpi-label">Aérodromes</div>
            <div className="text-xs text-primary mt-1">actifs</div>
          </div>
        </div>

        <div className="kpi-card cursor-pointer animate-fade-up" style={{ animationDelay: '0.15s' }} onClick={() => setActiveModule('plans-actions')}>
          <div className="kpi-icon"><AlertCircle className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.ecartsOuverts}</div>
            <div className="kpi-label">Écarts ouverts</div>
            {stats.ecartsCritiques > 0 && (
              <div className="text-xs text-danger mt-1 flex items-center gap-1">
                <Flame className="w-3 h-3" />{stats.ecartsCritiques} critiques
              </div>
            )}
          </div>
        </div>

        <div className="kpi-card cursor-pointer animate-fade-up" style={{ animationDelay: '0.2s' }} onClick={() => setActiveModule('surveillance')}>
          <div className="kpi-icon"><Eye className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.surveillancesCeMois}</div>
            <div className="kpi-label">Surveillances</div>
            <div className="text-xs text-muted mt-1">ce mois</div>
          </div>
        </div>

        <div className="kpi-card cursor-pointer animate-fade-up" style={{ animationDelay: '0.25s' }} onClick={() => setActiveModule('codes')}>
          <div className="kpi-icon"><Key className="h-5 w-5" /></div>
          <div className="kpi-content">
            <div className="kpi-value">{stats.codesActifs}</div>
            <div className="kpi-label">Codes actifs</div>
          </div>
        </div>
      </div>

      {/* ==================== ACTIONS RAPIDES ==================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-up" style={{ animationDelay: '0.27s' }}>
        {([
          { id: 'utilisateurs', label: 'Gérer les utilisateurs', desc: 'Comptes et permissions', icon: Users },
          { id: 'codes', label: "Codes d'accès", desc: 'Génération et révocation', icon: Key },
          { id: 'audit', label: "Journal d'audit", desc: 'Traçabilité des actions', icon: FileSearch },
          { id: 'planning', label: 'Planning général', desc: 'Vue d\'ensemble', icon: BarChart3 },
          { id: 'certification', label: 'Certifications', desc: 'Suivi des dossiers', icon: CheckCircle2 },
          { id: 'homologation', label: 'Homologations', desc: 'Gestion des phases', icon: Shield },
          { id: 'formation', label: 'Formation', desc: 'Planification', icon: TrendingUp },
          { id: 'charge', label: 'Charge de travail', desc: 'Répartition des missions', icon: Gauge },
        ] as const).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-role-primary-soft transition-colors text-left group"
              onClick={() => setActiveModule(item.id)}
            >
              <div className="p-2 rounded-lg bg-role-primary-soft group-hover:scale-110 transition-transform">
                <Icon className="h-5 w-5 text-role-primary" />
              </div>
              <div>
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ==================== CLÉS API ==================== */}
      <ApiKeysManager />
    </div>
  );
}

// ============================================================
// COMPOSANT : GESTION DES CLÉS API
// ============================================================
function ApiKeysManager() {
  const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };
  const apiKeys = useAppStore(s => s.apiKeys);
  const addApiKey = useAppStore(s => s.addApiKey);
  const updateApiKey = useAppStore(s => s.updateApiKey);
  const deleteApiKey = useAppStore(s => s.deleteApiKey);
  const [showModal, setShowModal] = useState(false);
  const [editKey, setEditKey] = useState<ApiKey | null>(null);
  const [form, setForm] = useState({ service: 'groq', key_value: '', label: '', is_active: true });

  const services = [
    { value: 'groq', label: 'Groq (IA principale)' },
    { value: 'openrouter', label: 'OpenRouter (IA fallback)' },
    { value: 'resend', label: 'Resend (emails)' },
    { value: 'twilio_account_sid', label: 'Twilio Account SID' },
    { value: 'twilio_auth_token', label: 'Twilio Auth Token' },
    { value: 'twilio_auth_sid', label: 'Twilio Auth SID' },
    { value: 'twilio_phone', label: 'Twilio Phone Number' },
  ];

  const openAdd = () => { setEditKey(null); setForm({ service: 'groq', key_value: '', label: '', is_active: true }); setShowModal(true); };
  const openEdit = (k: ApiKey) => { setEditKey(k); setForm({ service: k.service, key_value: k.key_value, label: k.label || '', is_active: k.is_active }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.key_value.trim()) return;
    if (editKey) {
      await updateApiKey(editKey.id, { service: form.service, key_value: form.key_value, label: form.label, is_active: form.is_active });
    } else {
      await addApiKey({ service: form.service, key_value: form.key_value, label: form.label, is_active: form.is_active, fallback_order: apiKeys.filter(k => k.service === form.service).length });
    }
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Supprimer cette clé API ?')) await deleteApiKey(id);
  };

  const getServiceLabel = (s: string) => services.find(x => x.value === s)?.label || s;

  return (
    <Card
      variant="role"
      title="Clés API"
      icon={<Key className="h-5 w-5 text-role-primary" />}
      badge={
        <button className="btn btn-primary btn-sm gap-1" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" />Ajouter
        </button>
      }
      className="animate-fade-up"
      style={{ animationDelay: '0.35s' } as any}
    >
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
    </Card>
  );
}
