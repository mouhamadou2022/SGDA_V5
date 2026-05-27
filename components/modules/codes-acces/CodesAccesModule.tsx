// components/modules/codes-acces/CodesAccesModule.tsx
// ✅ CDC 5.18 - Codes d'Accès Exploitant
// ✅ Design system premium - classes harmonisées
// ✅ Vue liste uniquement (pas de grille/carte pour ce module)
// ✅ Filtres standardisés avec view-toggle pour les statuts

'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { FormShell } from '@/components/ui/FormShell';
import {
  Key,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  Building,
  Clock,
  Eye,
  EyeOff,
  Search,
  Plus,
  Download,
  History,
  Shield,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { useAppStore, type CodeAcces } from '@/lib/store';
import { ModuleHeader } from '@/components/layout/ModuleHeader';
import { codeAccesUtils } from '@/lib/codeAccesUtils';
import { CodeAccesForm } from '@/components/forms/CodeAccesForm';
import { formatDate } from '@/lib/utils';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' };

interface CodesAccesModuleProps {
  userRole: string;
}

const STATUTS = [
  { id: 'tous', label: 'Tous', color: 'neutral' },
  { id: 'actif', label: 'Actifs', color: 'success', icon: CheckCircle2 },
  { id: 'expire', label: 'Expirés', color: 'warning', icon: AlertCircle },
  { id: 'revogue', label: 'Révoqués', color: 'danger', icon: XCircle },
];

export default function CodesAccesModule({ userRole }: CodesAccesModuleProps) {
  const codesAcces = useAppStore(s => s.codesAcces)
  const aerodromes = useAppStore(s => s.aerodromes)
  const revoquerCode = useAppStore(s => s.revoquerCode);
  const deleteCodeAcces = useAppStore(s => s.deleteCodeAcces);
  const addNotification = useAppStore(s => s.addNotification);
  const user = useAppStore(s => s.user);

  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    aerodrome: 'tous',
    statut: 'tous',
  });
   const [showForm, setShowForm] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
  const [selectedCode, setSelectedCode] = useState<CodeAcces | null>(null);
  const [showCode, setShowCode] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedSuccess, setCopiedSuccess] = useState(false);


  const listeCodesAcces = codesAcces ?? [];

  // Auto-suppression des codes expirés au montage du module
  useEffect(() => {
    const now = new Date();
    const expiredCodes = listeCodesAcces.filter(c => 
      c.expires_at && new Date(c.expires_at) < now && c.statut === 'actif'
    );
    
    if (expiredCodes.length > 0) {
      expiredCodes.forEach(async (code) => {
        const aerodrome = aerodromes.find(a => a.id === code.aerodrome_id);
        addNotification?.({
          user_id: user?.id || '',
          type: 'warning',
          title: 'Code expiré supprimé',
          message: `Code ${code.code_partiel} (${aerodrome?.code_oaci || 'N/A'}) supprimé automatiquement car expiré depuis le ${new Date(code.expires_at!).toLocaleDateString('fr-FR')}.`,
          canal: 'in_app',
        });
        await deleteCodeAcces(code.id);
      });
    }
  }, []);

  // Filtrer les codes
  const filteredCodes = useMemo(() => {
    return listeCodesAcces.filter(code => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches =
          code.code_partiel.toLowerCase().includes(term) ||
          code.description?.toLowerCase().includes(term) ||
          aerodromes.find(a => a.id === code.aerodrome_id)?.code_oaci.toLowerCase().includes(term);
        if (!matches) return false;
      }

      if (filters.aerodrome !== 'tous' && code.aerodrome_id !== filters.aerodrome) return false;
      if (filters.statut !== 'tous' && code.statut !== filters.statut) return false;

      return true;
    });
  }, [listeCodesAcces, searchTerm, filters, aerodromes]);

  // Statistiques
  const stats = useMemo(() => {
    return {
      total: listeCodesAcces.length,
      actifs: listeCodesAcces.filter(c => c.statut === 'actif').length,
      expires: listeCodesAcces.filter(c => c.statut === 'expire').length,
      revogues: listeCodesAcces.filter(c => c.statut === 'revogue').length,
      connexions: listeCodesAcces.reduce((acc, c) => acc + (c.nb_connexions || 0), 0),
    };
  }, [listeCodesAcces]);

  const getStatutBadge = (statut: string, estExpire?: boolean) => {
    if (estExpire && statut === 'actif') {
      return <span className="badge warning">Expiré</span>;
    }
    const colorMap: Record<string, string> = {
      actif: 'success',
      expire: 'warning',
      revogue: 'danger',
    };
    const labelMap: Record<string, string> = {
      actif: 'Actif',
      expire: 'Expiré',
      revogue: 'Révoqué',
    };
    if (statut === 'tous') return null;
    return <span className={`badge ${colorMap[statut]}`}>{labelMap[statut]}</span>;
  };

  const getAerodromeName = (aerodromeId: string) => {
    const aerodrome = aerodromes?.find(a => a.id === aerodromeId);
    return aerodrome ? `${aerodrome.code_oaci} - ${aerodrome.nom}` : 'Inconnu';
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setCopiedSuccess(true);
    setTimeout(() => {
      setCopiedId(null);
      setCopiedSuccess(false);
    }, 2000);
  };

  const handleRevoke = async (id: string) => {
    setSelectedCode(listeCodesAcces.find(c => c.id === id) as CodeAcces | undefined ?? null);
    setShowRevokeModal(true);
  };

  const confirmRevoke = async () => {
    if (selectedCode) {
      await revoquerCode(selectedCode.id);
      setShowRevokeModal(false);
      setSelectedCode(null);
    }
  };

  const handleDelete = async (code: CodeAcces) => {
    if (window.confirm(`Supprimer définitivement le code ${code.code_partiel} ? Cette action est irréversible.`)) {
      const aerodrome = aerodromes.find(a => a.id === code.aerodrome_id);
      addNotification?.({
        user_id: user?.id || '',
        type: 'info',
        title: 'Code supprimé',
        message: `Code ${code.code_partiel} (${aerodrome?.code_oaci || 'N/A'}) supprimé manuellement.`,
        canal: 'in_app',
      });
      await deleteCodeAcces(code.id);
    }
  };

  const toggleShowCode = (id: string) => {
    setShowCode(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleExportCSV = () => {
    const headers = ['Code', 'Aérodrome', 'Description', 'Créé le', 'Expire le', 'Dernière connexion', 'Connexions', 'Statut'];
    const rows = filteredCodes.map(code => [
      code.code_partiel,
      getAerodromeName(code.aerodrome_id),
      code.description || '',
      new Date(code.created_at).toLocaleDateString('fr-FR'),
      code.expires_at ? new Date(code.expires_at).toLocaleDateString('fr-FR') : 'Jamais',
      code.last_login ? new Date(code.last_login).toLocaleDateString('fr-FR') : 'Jamais',
      code.nb_connexions,
      code.statut,
    ]);
    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codes_acces_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="codes-acces">

      {/* En-tête */}
      <ModuleHeader
        icon={<Key />}
        title="Codes d'Accès Exploitant"
        description={`Gestion des codes d'accès au portail — ${stats.total} codes`}
        actions={<div className="flex items-center gap-2">
          <button onClick={() => setShowForm(true)} className="btn btn-primary gap-2">
            <Plus className="w-4 h-4" />
            Générer un code
          </button>
        </div>}
      />

      {/* Alerte codes expirés */}
      {(() => {
        const now = new Date();
        const expiredActifs = listeCodesAcces.filter(c => c.expires_at && new Date(c.expires_at) < now && c.statut === 'actif');
        if (expiredActifs.length === 0) return null;
        return (
          <div className="card border-warning">
            <div className="card-content p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning-soft flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {expiredActifs.length} code(s) expiré(s) détecté(s)
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ces codes seront supprimés automatiquement. Ils apparaissent encore ici car le module vient d'être chargé.
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {expiredActifs.slice(0, 5).map(c => {
                      const aero = aerodromes.find(a => a.id === c.aerodrome_id);
                      return (
                        <span key={c.id} className="badge warning text-[10px]">
                          {c.code_partiel} ({aero?.code_oaci})
                        </span>
                      );
                    })}
                    {expiredActifs.length > 5 && (
                      <span className="badge neutral text-[10px]">+{expiredActifs.length - 5} autres</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* KPIs - 5 cartes */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon bg-role-primary-soft">
            <Key className="w-5 h-5 text-role-primary" />
          </div>
          <div className="kpi-label">Total codes</div>
          <div className="kpi-value">{stats.total}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-success-soft">
            <CheckCircle2 className="w-5 h-5 text-success" />
          </div>
          <div className="kpi-label text-success">Actifs</div>
          <div className="kpi-value text-success">{stats.actifs}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-warning-soft">
            <AlertCircle className="w-5 h-5 text-warning" />
          </div>
          <div className="kpi-label text-warning">Expirés</div>
          <div className="kpi-value text-warning">{stats.expires}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-danger-soft">
            <XCircle className="w-5 h-5 text-danger" />
          </div>
          <div className="kpi-label text-danger">Révoqués</div>
          <div className="kpi-value text-danger">{stats.revogues}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon bg-info-soft">
            <History className="w-5 h-5 text-info" />
          </div>
          <div className="kpi-label">Connexions</div>
          <div className="kpi-value">{stats.connexions}</div>
        </div>
      </div>

      {/* Barre d'outils - Style harmonisé */}
      <div className="filters-panel p-4 bg-background border border-border rounded-xl shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Recherche */}
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un code (aérodrome, description...)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground ${focusClass}`}
            />
          </div>

          {/* Filtre Aérodrome */}
          <select
            className={`h-10 px-3 pr-8 rounded-xl border border-border bg-background text-foreground text-sm cursor-pointer appearance-none ${focusClass}`}
            style={selectStyle}
            value={filters.aerodrome}
            onChange={(e) => setFilters({...filters, aerodrome: e.target.value})}
          >
            <option value="tous">Tous les aérodromes</option>
            {aerodromes?.map(a => (
              <option key={a.id} value={a.id}>{a.code_oaci} - {a.nom}</option>
            ))}
          </select>

          {/* Filtre Statut - Style view-toggle */}
          <div className="view-toggle">
            {STATUTS.map((statut) => {
              const Icon = statut.icon;
              return (
                <button
                  key={statut.id}
                  onClick={() => setFilters({...filters, statut: statut.id})}
                  className={filters.statut === statut.id ? 'active' : ''}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  <span>{statut.label}</span>
                </button>
              );
            })}
          </div>

          {/* Bouton Export */}
          <button onClick={handleExportCSV} className="action-button gap-2" title="Exporter en CSV">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exporter</span>
          </button>
        </div>
      </div>

      {/* Tableau des codes */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Aérodrome</th>
              <th>Description</th>
              <th>Créé le</th>
              <th>Expire le</th>
              <th>Dernière connexion</th>
              <th>Connexions</th>
              <th>Statut</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCodes.map((code) => {
              const estExpire = !!(code.expires_at && new Date(code.expires_at) < new Date());
              const afficherCode = showCode[code.id];
              const isCopied = copiedId === code.id;

              return (
                <tr key={code.id} className="hover:bg-role-primary-soft transition-colors">
                  <td>
                    <div className="flex items-center gap-2">
                      <code className="code-oaci-badge text-xs">
                        {afficherCode ? code.code : code.code_partiel}
                      </code>
                      <button
                        onClick={() => toggleShowCode(code.id)}
                        className="action-button !p-1"
                        title={afficherCode ? 'Masquer le code' : 'Afficher le code'}
                      >
                        {afficherCode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleCopyCode(code.code, code.id)}
                        className="action-button !p-1"
                        title={isCopied ? 'Copié !' : 'Copier le code'}
                      >
                        {isCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-muted" />
                      <span className="font-medium text-small text-foreground">{getAerodromeName(code.aerodrome_id)}</span>
                    </div>
                  </td>
                  <td>
                    <span className="text-small text-muted">{code.description || '-'}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted" />
                      <span className="text-small text-foreground">{new Date(code.created_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </td>
                  <td>
                    {code.expires_at ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-muted" />
                        <span className={`text-small ${estExpire ? 'text-danger font-medium' : 'text-foreground'}`}>
                          {new Date(code.expires_at).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    ) : (
                      <span className="text-small text-muted">Jamais</span>
                    )}
                  </td>
                  <td>
                    {code.last_login ? (
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-muted" />
                        <span className="text-small text-foreground">{new Date(code.last_login).toLocaleDateString('fr-FR')}</span>
                      </div>
                    ) : (
                      <span className="text-small text-muted">Jamais</span>
                    )}
                  </td>
                  <td>
                    <span className="badge outline">{code.nb_connexions}</span>
                  </td>
                  <td>
                    {getStatutBadge(code.statut, estExpire)}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      {code.statut === 'actif' && !estExpire && (
                        <button
                          onClick={() => handleRevoke(code.id)}
                          className="action-button hover:text-danger"
                          title="Révoquer le code"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {(code.statut === 'expire' || code.statut === 'revogue' || estExpire) && (
                        <button
                          onClick={() => handleDelete(code)}
                          className="action-button hover:text-danger hover:bg-danger/10"
                          title="Supprimer définitivement"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button className="action-button" title="Historique d'utilisation">
                        <History className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredCodes.length === 0 && (
          <div className="card-content py-12 text-center">
            <Key className="w-12 h-12 text-muted mx-auto mb-4 opacity-30" />
            <p className="text-muted">Aucun code d'accès trouvé</p>
            <button onClick={() => setShowForm(true)} className="btn btn-primary mt-4 gap-2">
              <Plus className="w-4 h-4" />
              Générer un code
            </button>
          </div>
        )}
      </div>

      {/* Modal Génération de code */}
      <FormShell
        open={showForm}
        onClose={() => { setShowForm(false); }}
        title="Générer un code d'accès"
        icon={Key}
        size="2xl"
        dataRole={userRole}
      >
        <CodeAccesForm
          mode="generation"
          onSuccess={() => { setShowForm(false); }}
          onCancel={() => { setShowForm(false); }}
          userRole={userRole}
        />
      </FormShell>

      {/* Modal Confirmation Révocation */}
      <FormShell
        open={showRevokeModal}
        onClose={() => setShowRevokeModal(false)}
        title="Révoquer le code d'accès"
        icon={XCircle}
        size="md"
        dataRole={userRole}
        footer={
          <>
            <button onClick={() => setShowRevokeModal(false)} className="btn btn-secondary">
              Annuler
            </button>
            <button onClick={confirmRevoke} className="btn btn-danger gap-2">
              <XCircle className="w-4 h-4" />
              Confirmer la révocation
            </button>
          </>
        }
      >
        {selectedCode && (
          <div className="space-y-4">
            <div className="alert alert-error">
              <AlertCircle className="alert-icon" />
              <div className="alert-content">
                <p className="alert-title">Êtes-vous sûr de vouloir révoquer ce code d'accès ?</p>
                <p className="alert-description">Cette action est irréversible. L'exploitant sera immédiatement déconnecté.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/30 border border-border space-y-2">
              <div className="flex justify-between text-small">
                <span className="text-muted">Code</span>
                <code className="code-oaci-badge text-xs">{selectedCode.code_partiel}</code>
              </div>
              <div className="flex justify-between text-small">
                <span className="text-muted">Aérodrome</span>
                <span className="text-foreground">{getAerodromeName(selectedCode.aerodrome_id)}</span>
              </div>
              {selectedCode.last_login && (
                <div className="flex justify-between text-small">
                  <span className="text-muted">Dernière connexion</span>
                  <span className="text-foreground">{new Date(selectedCode.last_login).toLocaleDateString('fr-FR')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </FormShell>

      {/* Toast de copie succès */}
      {copiedSuccess && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-right">
          <div className="bg-success text-white rounded-xl shadow-role-glow px-4 py-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-small">Code copié dans le presse-papier</span>
          </div>
        </div>
      )}
    </div>
  );
}