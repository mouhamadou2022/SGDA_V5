// components/modules/surveillance/RapportAnnexes.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Eye,
  X,
  ChevronDown,
  ChevronRight,
  Users,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Printer,
  Copy,
  BarChart3,
  FolderTree,
  Target,
  Brain,
  Sparkles,
  Loader2,
  Shield,
  Calendar,
  MapPin,
  UserCheck,
  Clock,
} from 'lucide-react';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore, Ecart, ProfilRisque, type PresenceEntry } from '@/lib/store';
import { PresenceSheet } from './PresenceSheet';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

// ============================================================
// ANNEXE A-1 : FICHES DE PRÉSENCE
// ============================================================

function AnnexePresence({ surveillanceId, readOnly }: { surveillanceId: string; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [presences, setPresences] = useState<PresenceEntry[]>([]);
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const getFichesBySurveillance = useAppStore(s => s.getFichesBySurveillance);

  useEffect(() => {
    try {
      const fiches = getFichesBySurveillance?.(surveillanceId) || [];
      setPresences(fiches);
    } catch (e) {
      setPresences([]);
    }
  }, [surveillanceId]);

  const stats = {
    total: presences.length,
    anacim: presences.filter(p => p.structure === 'ANACIM').length,
    exploitant: presences.filter(p => p.structure === 'EXPLOITANT').length,
    signees: presences.filter(p => p.signature_url).length,
  };

  const handleCopyTable = () => {
    let csv = 'Nom,Structure,Fonction,Téléphone,Email,Signature\n';
    presences.forEach(p => {
      csv += `${p.prenom_nom},${p.structure},${p.fonction},${p.telephone},${p.email},${p.signature_url ? 'Signé' : 'Non signé'}\n`;
    });
    navigator.clipboard.writeText(csv);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Tableau copié',
      message: 'Le tableau des présences a été copié',
      canal: 'in_app',
    });
  };

  const handleExportPresences = () => {
    const csv = [
      ['Nom', 'Structure', 'Fonction', 'Téléphone', 'Email', 'Signature', 'Date signature'],
      ...presences.map(p => [
        p.prenom_nom,
        p.structure,
        p.fonction,
        p.telephone,
        p.email,
        p.signature_url ? 'Signé' : 'Non signé',
        p.signature_date ? new Date(p.signature_date).toLocaleDateString('fr-FR') : '',
      ]),
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presences_${surveillanceId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Export effectué',
      message: 'La liste des présences a été exportée',
      canal: 'in_app',
    });
  };

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <Users className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-1: Fiches de présence</span>
          <span className="badge outline text-xs">{stats.total} participant(s)</span>
          <span className="badge success text-[10px]">{stats.signees}/{stats.total} signé(s)</span>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyTable(); }}
                className="action-button"
                title="Copier le tableau"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleExportPresences(); }}
                className="action-button"
                title="Exporter CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-2 bg-primary-soft rounded-lg">
              <div className="text-lg font-bold text-primary">{stats.anacim}</div>
              <div className="text-xs text-muted-foreground">ANACIM</div>
            </div>
            <div className="text-center p-2 bg-warning-soft rounded-lg">
              <div className="text-lg font-bold text-warning">{stats.exploitant}</div>
              <div className="text-xs text-muted-foreground">Exploitant</div>
            </div>
            <div className="text-center p-2 bg-success-soft rounded-lg">
              <div className="text-lg font-bold text-success">{stats.signees}</div>
              <div className="text-xs text-muted-foreground">Signatures</div>
            </div>
          </div>

          {presences.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr className="border-b border-border">
                    <th>Nom complet</th>
                    <th>Structure</th>
                    <th>Fonction</th>
                    <th>Téléphone</th>
                    <th>Email</th>
                    <th>Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {presences.map(presence => (
                    <tr key={presence.id} className="border-b border-border hover:bg-role-primary-soft">
                      <td className="font-medium text-foreground">{presence.prenom_nom || '-'}</td>
                      <td>
                        <span className={`badge ${presence.structure === 'ANACIM' ? 'primary' : presence.structure === 'EXPLOITANT' ? 'warning' : 'neutral'}`}>
                          {presence.structure}
                        </span>
                      </td>
                      <td className="text-muted-foreground">{presence.fonction || '-'}</td>
                      <td className="text-muted-foreground">{presence.telephone || '-'}</td>
                      <td className="text-muted-foreground">{presence.email || '-'}</td>
                      <td>
                        {presence.signature_url ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 text-success" />
                            <span className="text-xs text-muted-foreground">
                              {new Date(presence.signature_date).toLocaleDateString('fr-FR')}
                            </span>
                            {!readOnly && (
                              <button
                                className="action-button"
                                onClick={() => window.open(presence.signature_url, '_blank')}
                                title="Voir signature"
                              >
                                <Eye className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-danger text-xs">Non signé</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Aucune fiche de présence disponible</p>
              <p className="text-xs mt-1">Utilisez le composant PresenceSheet pour ajouter des participants</p>
            </div>
          )}

          {!readOnly && (
            <div className="mt-4 pt-4 border-t border-border">
              <PresenceSheet
                surveillanceId={surveillanceId}
                readOnly={readOnly}
                userRole="inspector"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANNEXE A-2 : ÉCARTS CONSTATÉS (avec vérification de cohérence)
// ============================================================

function AnnexeEcarts({ surveillanceId, readOnly }: { surveillanceId: string; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [selectedEcart, setSelectedEcart] = useState<Ecart | null>(null);
  const [editedEcarts, setEditedEcarts] = useState<Ecart[]>([]);
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const ecarts = useOptimizedStore(s => s.ecarts);

  const realEcarts = useMemo(() => ecarts.filter(e => e.surveillance_id === surveillanceId), [ecarts, surveillanceId]);
  const displayedEcarts = editedEcarts.length > 0 ? editedEcarts : realEcarts;

  const stats = {
    total: displayedEcarts.length,
    critiques: displayedEcarts.filter(e => e.niveau_risque === 'critique').length,
    eleves: displayedEcarts.filter(e => e.niveau_risque === 'eleve').length,
    moyens: displayedEcarts.filter(e => e.niveau_risque === 'moyen').length,
    faibles: displayedEcarts.filter(e => e.niveau_risque === 'faible').length,
    clos: displayedEcarts.filter(e => e.statut === 'cloture').length,
  };

  const getNiveauBadge = (niveau: string) => {
    switch (niveau) {
      case 'critique': return 'badge danger animate-pulse';
      case 'eleve': return 'badge warning';
      case 'moyen': return 'badge primary';
      default: return 'badge neutral';
    }
  };

  const handleEditEcart = (index: number, field: string, value: string) => {
    const newEcarts = [...displayedEcarts];
    newEcarts[index] = { ...newEcarts[index], [field]: value };
    setEditedEcarts(newEcarts);
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Modification locale',
      message: 'Cette modification ne sera pas persistée dans le système',
      canal: 'in_app',
    });
  };

  const handleCopyTable = () => {
    let csv = 'Référence,Réf. réglementaire,Libellé,Niveau,Statut\n';
    displayedEcarts.forEach(e => {
      csv += `${e.reference},${e.ref_reglementaire},"${e.libelle}",${e.niveau_risque},${e.statut}\n`;
    });
    navigator.clipboard.writeText(csv);
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Tableau copié',
      message: 'Le tableau des écarts a été copié',
      canal: 'in_app',
    });
  };

  const handleExportEcarts = () => {
    const csv = [
      ['Référence', 'Réf. réglementaire', 'Libellé', 'Niveau', 'Statut', 'Créé le', 'Délai régularisation'],
      ...displayedEcarts.map(e => [
        e.reference,
        e.ref_reglementaire,
        e.libelle,
        e.niveau_risque,
        e.statut,
        new Date(e.created_at).toLocaleDateString('fr-FR'),
        e.delai_regularisation ? new Date(e.delai_regularisation).toLocaleDateString('fr-FR') : '',
      ]),
    ].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecarts_${surveillanceId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Export effectué',
      message: 'La liste des écarts a été exportée',
      canal: 'in_app',
    });
  };

  const handleReset = () => {
    setEditedEcarts([]);
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Réinitialisation',
      message: 'Les écarts ont été réinitialisés aux données réelles',
      canal: 'in_app',
    });
  };

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <AlertTriangle className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-2: Écarts constatés</span>
          <span className="badge outline text-xs">{stats.total} écart(s)</span>
          {stats.critiques > 0 && (
            <span className="badge danger animate-pulse text-[10px]">{stats.critiques} critique(s)</span>
          )}
          <span className="badge success text-[10px]">{stats.clos} clôturé(s)</span>
        </div>
        <div className="flex items-center gap-2">
          {editedEcarts.length > 0 && (
            <button onClick={handleReset} className="btn btn-sm px-3 py-1 btn-warning">
              Réinitialiser
            </button>
          )}
          {!readOnly && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopyTable(); }}
                className="action-button"
                title="Copier le tableau"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleExportEcarts(); }}
                className="action-button"
                title="Exporter CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="grid grid-cols-5 gap-2 mb-4">
            <div className="text-center p-2 bg-danger-soft rounded-lg">
              <div className="text-lg font-bold text-danger">{stats.critiques}</div>
              <div className="text-xs text-muted-foreground">Critique</div>
            </div>
            <div className="text-center p-2 bg-warning-soft rounded-lg">
              <div className="text-lg font-bold text-warning">{stats.eleves}</div>
              <div className="text-xs text-muted-foreground">Élevé</div>
            </div>
            <div className="text-center p-2 bg-primary-soft rounded-lg">
              <div className="text-lg font-bold text-primary">{stats.moyens}</div>
              <div className="text-xs text-muted-foreground">Moyen</div>
            </div>
            <div className="text-center p-2 bg-gray-100 rounded-lg">
              <div className="text-lg font-bold text-gray-600">{stats.faibles}</div>
              <div className="text-xs text-muted-foreground">Faible</div>
            </div>
            <div className="text-center p-2 bg-success-soft rounded-lg">
              <div className="text-lg font-bold text-success">{stats.clos}</div>
              <div className="text-xs text-muted-foreground">Clôturés</div>
            </div>
          </div>

          {displayedEcarts.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr className="border-b border-border">
                    <th>Référence</th>
                    <th>Réf. réglementaire</th>
                    <th>Libellé</th>
                    <th>Niveau</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedEcarts.map((ecart, idx) => (
                    <tr key={ecart.id} className="border-b border-border hover:bg-role-primary-soft">
                      <td className="code-oaci-badge text-xs">{ecart.reference}</td>
                      <td>
                        {readOnly ? (
                          <span className="text-sm">{ecart.ref_reglementaire}</span>
                        ) : (
                          <input
                            type="text"
                            value={ecart.ref_reglementaire}
                            onChange={(e) => handleEditEcart(idx, 'ref_reglementaire', e.target.value)}
                            className={`form-input text-sm w-full ${focusClass}`}
                          />
                        )}
                      </td>
                      <td>
                        {readOnly ? (
                          <span className="text-sm">{ecart.libelle}</span>
                        ) : (
                          <textarea
                            value={ecart.libelle}
                            onChange={(e) => handleEditEcart(idx, 'libelle', e.target.value)}
                            className={`form-textarea text-sm w-full ${focusClass}`}
                            rows={2}
                          />
                        )}
                      </td>
                      <td>
                        <span className={getNiveauBadge(ecart.niveau_risque)}>{ecart.niveau_risque}</span>
                      </td>
                      <td>
                        <span className={`badge ${ecart.statut === 'cloture' ? 'success' : 'warning'}`}>
                          {ecart.statut}
                        </span>
                       </td>
                      <td>
                        <button
                          onClick={() => setSelectedEcart(ecart)}
                          className="action-button"
                          title="Voir détails"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                       </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-success" />
              <p className="text-sm">Aucun écart constaté</p>
            </div>
          )}
        </div>
      )}

      {/* Modal détail écart */}
      {selectedEcart && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedEcart(null)}>
          <div className="bg-background rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Détail de l'écart</h2>
              <button className="modal-close" onClick={() => setSelectedEcart(null)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Référence</p>
                  <p className="code-oaci-badge text-sm">{selectedEcart.reference}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Niveau</p>
                  <span className={getNiveauBadge(selectedEcart.niveau_risque)}>{selectedEcart.niveau_risque}</span>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Référence réglementaire</p>
                  <p className="text-sm">{selectedEcart.ref_reglementaire}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Libellé</p>
                  <p className="text-sm">{selectedEcart.libelle}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Statut</p>
                  <p className="text-sm">{selectedEcart.statut}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Créé le</p>
                  <p className="text-sm">{new Date(selectedEcart.created_at).toLocaleDateString('fr-FR')}</p>
                </div>
                {selectedEcart.delai_regularisation && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Délai de régularisation</p>
                    <p className="text-sm">{new Date(selectedEcart.delai_regularisation).toLocaleDateString('fr-FR')}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedEcart(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANNEXE A-3 : PROFIL DE RISQUE (avec vérification de cohérence)
// ============================================================

function AnnexeProfilRisque({ aerodromeId, readOnly }: { aerodromeId: string; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [editedProfil, setEditedProfil] = useState<ProfilRisque | null>(null);
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const realProfil = profilsRisque[aerodromeId];
  const profil = editedProfil || realProfil;

  const getNiveauConfig = (score: number) => {
    if (score >= 80) return { label: 'Excellent', color: 'text-success', bg: 'bg-success-soft', badge: 'success' };
    if (score >= 60) return { label: 'Bon', color: 'text-primary', bg: 'bg-primary-soft', badge: 'primary' };
    if (score >= 30) return { label: 'Modéré', color: 'text-warning', bg: 'bg-warning-soft', badge: 'warning' };
    return { label: 'Critique', color: 'text-danger', bg: 'bg-danger-soft', badge: 'danger' };
  };

  const getTendanceIcon = () => {
    if (profil?.tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />;
    if (profil?.tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger animate-pulse" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const getProgressClass = (score: number) => {
    if (score >= 80) return 'progress-faible';
    if (score >= 60) return 'progress-moyen';
    if (score >= 30) return 'progress-eleve';
    return 'progress-critique';
  };

  const niveauConfig = profil ? getNiveauConfig(profil.score_global) : null;

  const handleEdit = (field: string, value: number) => {
    const newProfil = { ...profil, [field]: value };
    // Recalculer le score global
    newProfil.score_global = Math.round((newProfil.c1 + newProfil.c2 + newProfil.c3 + newProfil.c4 + newProfil.c5) / 5);
    setEditedProfil(newProfil);
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Modification locale',
      message: 'Cette modification ne sera pas persistée dans le système',
      canal: 'in_app',
    });
  };

  const handleReset = () => {
    setEditedProfil(null);
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Réinitialisation',
      message: 'Le profil a été réinitialisé aux données réelles',
      canal: 'in_app',
    });
  };

  if (!profil) {
    return (
      <div className="accordion mb-4">
        <button
          className="accordion-trigger w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-role-primary" />
            <span className="font-semibold text-foreground">Annexe A-3: Profil de risque</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="accordion-content text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Profil de risque non disponible</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <BarChart3 className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-3: Profil de risque</span>
          <span className={`badge ${niveauConfig?.badge}`}>{niveauConfig?.label}</span>
          <div className="flex items-center gap-1">
            {getTendanceIcon()}
            <span className={`text-xs capitalize ${profil.tendance === 'baisse' ? 'text-danger' : profil.tendance === 'hausse' ? 'text-success' : ''}`}>
              {profil.tendance}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editedProfil && (
            <button onClick={handleReset} className="btn btn-sm px-3 py-1 btn-warning">
              Réinitialiser
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-foreground">Score global</span>
            <span className={`text-2xl font-bold ${niveauConfig?.color}`}>{profil.score_global}/100</span>
          </div>
          <div className="progress h-2 mb-4">
            <div className={`progress-bar ${getProgressClass(profil.score_global)}`} style={{ width: `${profil.score_global}%` }} />
          </div>

          <div className="space-y-3 mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Détail des critères</p>
            {[
              { key: 'c1', label: 'C1 — Maturité SGS', value: profil.c1 },
              { key: 'c2', label: 'C2 — Efficacité PAC', value: profil.c2 },
              { key: 'c3', label: 'C3 — Conformité', value: profil.c3 },
              { key: 'c4', label: 'C4 — Charge critique', value: profil.c4 },
              { key: 'c5', label: 'C5 — Résilience', value: profil.c5 },
            ].map(crit => {
              const critConfig = getNiveauConfig(crit.value);
              return (
                <div key={crit.key} className="flex items-center gap-3">
                  <span className="text-xs font-mono w-8">{crit.key}</span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-foreground">{crit.label}</span>
                      <span className={`text-xs font-semibold ${critConfig.color}`}>{crit.value}/100</span>
                    </div>
                    <div className="progress h-1.5">
                      <div className={`progress-bar ${getProgressClass(crit.value)}`} style={{ width: `${crit.value}%` }} />
                    </div>
                  </div>
                  {!readOnly && (
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={crit.value}
                      onChange={(e) => handleEdit(crit.key, parseInt(e.target.value))}
                      className="w-24 accent-role-primary"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {profil.velocity_metrics && (
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border">
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Vitesse</p>
                <p className={`text-sm font-semibold ${profil.velocity_metrics.vitesse < 0 ? 'text-danger' : 'text-success'}`}>
                  {profil.velocity_metrics.vitesse > 0 ? '+' : ''}{profil.velocity_metrics.vitesse.toFixed(1)} pts/mois
                </p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Accélération</p>
                <p className="text-sm font-semibold">{profil.velocity_metrics.acceleration.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-muted-foreground">Volatilité</p>
                <p className="text-sm font-semibold">{profil.velocity_metrics.volatilite.toFixed(1)}%</p>
              </div>
            </div>
          )}

          <div className="mt-3 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground">Dernier calcul</p>
            <p className="text-sm">{new Date(profil.computed_at).toLocaleString('fr-FR')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ANNEXE A-4 : STRUCTURE DE LA CHECKLIST (arborescence complète)
// ============================================================

function AnnexeChecklistStructure({ surveillanceId, readOnly }: { surveillanceId: string; readOnly: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedDomaines, setExpandedDomaines] = useState<string[]>([]);
  const [expandedSousDomaines, setExpandedSousDomaines] = useState<Record<string, boolean>>({});
  const [editedItems, setEditedItems] = useState<Record<string, any>>({});
  const user = useOptimizedStore(s => s.user);
  const addNotification = useAppStore(s => s.addNotification);
  const checklistHierarchy = useAppStore(s => s.checklistHierarchy);

  const hierarchy = checklistHierarchy?.[surveillanceId] || [];

  const toggleDomaine = (domaineId: string) => {
    setExpandedDomaines(prev =>
      prev.includes(domaineId) ? prev.filter(id => id !== domaineId) : [...prev, domaineId]
    );
  };

  const toggleSousDomaine = (sousDomaineId: string) => {
    setExpandedSousDomaines(prev => ({
      ...prev,
      [sousDomaineId]: !prev[sousDomaineId],
    }));
  };

  const getStats = (domaine: any) => {
    let total = 0, sa = 0, ns = 0, nv = 0, na = 0;
    domaine.sousDomaines?.forEach((sd: any) => {
      sd.sousSousDomaines?.forEach((ssd: any) => {
        ssd.items?.forEach((item: any) => {
          total++;
          if (item.resultat === 'SA') sa++;
          else if (item.resultat === 'NS') ns++;
          else if (item.resultat === 'NA') na++;
          else nv++;
        });
      });
    });
    const taux = total > 0 ? Math.round((sa / (sa + ns + nv)) * 100) : 0;
    return { total, sa, ns, nv, na, taux };
  };

  const handleEditItem = (itemId: string, field: string, value: string) => {
    setEditedItems(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Modification locale',
      message: 'Cette modification ne sera pas persistée dans le système',
      canal: 'in_app',
    });
  };

  const handleReset = () => {
    setEditedItems({});
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Réinitialisation',
      message: 'La structure a été réinitialisée',
      canal: 'in_app',
    });
  };

  if (!hierarchy || hierarchy.length === 0) {
    return (
      <div className="accordion mb-4">
        <button
          className="accordion-trigger w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <FolderTree className="w-5 h-5 text-role-primary" />
            <span className="font-semibold text-foreground">Annexe A-4: Structure de la checklist</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="accordion-content text-center text-muted-foreground">
            <FolderTree className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune structure de checklist disponible</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="accordion mb-4">
      <div className="accordion-trigger">
        <div
          className="flex items-center gap-3 flex-1 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded(!expanded)}
        >
          <FolderTree className="w-5 h-5 text-role-primary" />
          <span className="font-semibold text-foreground">Annexe A-4: Structure de la checklist</span>
          <span className="badge outline text-xs">{hierarchy.length} domaine(s)</span>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(editedItems).length > 0 && (
            <button onClick={handleReset} className="btn btn-sm px-3 py-1 btn-warning">
              Réinitialiser
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 transition-transform cursor-pointer ${expanded ? 'rotate-180' : ''}`}
            onClick={() => setExpanded(!expanded)}
          />
        </div>
      </div>

      {expanded && (
        <div className="p-4 animate-fade-in">
          <div className="space-y-4">
            {hierarchy.map(domaine => {
              const stats = getStats(domaine);
              const isExpanded = expandedDomaines.includes(domaine.id);
              return (
                <div key={domaine.id} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    onClick={() => toggleDomaine(domaine.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Target className="w-4 h-4 text-role-primary" />
                      <span className="font-semibold text-sm">{domaine.nom}</span>
                      <span className="badge outline text-[10px]">{domaine.sousDomaines?.length || 0} sous-domaine(s)</span>
                      <span className={`badge ${stats.taux >= 70 ? 'success' : stats.taux >= 50 ? 'warning' : 'danger'} text-[10px]`}>
                        {stats.taux}%
                      </span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {isExpanded && (
                    <div className="p-3 space-y-3">
                      {domaine.sousDomaines?.map((sd: any) => {
                        const isSdExpanded = expandedSousDomaines[sd.id];
                        return (
                          <div key={sd.id} className="ml-4">
                            <button
                              className="flex items-center gap-2 w-full text-left"
                              onClick={() => toggleSousDomaine(sd.id)}
                            >
                              <ChevronRight className={`w-3 h-3 transition-transform ${isSdExpanded ? 'rotate-90' : ''}`} />
                              <span className="font-medium text-sm">{sd.nom}</span>
                              <span className="badge outline text-[10px]">{sd.sousSousDomaines?.length || 0} sous-sous-domaine(s)</span>
                            </button>
                            
                            {isSdExpanded && (
                              <div className="ml-6 mt-2 space-y-3">
                                {sd.sousSousDomaines?.map((ssd: any) => (
                                  <div key={ssd.id} className="border-l-2 border-border pl-3">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-sm font-medium">{ssd.nom}</span>
                                      <span className="badge neutral text-[10px]">{ssd.items?.length || 0} item(s)</span>
                                    </div>
                                    
                                    {ssd.items && ssd.items.length > 0 && (
                                      <div className="ml-4 space-y-1">
                                        {ssd.items.map((item: any) => {
                                          const editedItem = editedItems[item.id];
                                          const currentResultat = editedItem?.resultat || item.resultat || 'NV';
                                          return (
                                            <div key={item.id} className="text-xs text-muted-foreground flex items-center gap-2 py-1">
                                              <span className="code-oaci-badge text-[9px]">{item.numero}</span>
                                              <span className="truncate flex-1">{item.point_verification}</span>
                                              {readOnly ? (
                                                <span className={`badge ${currentResultat === 'SA' ? 'success' : currentResultat === 'NS' ? 'danger' : currentResultat === 'NA' ? 'neutral' : 'warning'} text-[8px]`}>
                                                  {currentResultat}
                                                </span>
                                              ) : (
                                                <select
                                                  value={currentResultat}
                                                  onChange={(e) => handleEditItem(item.id, 'resultat', e.target.value)}
                                                  className="form-select text-xs w-16 py-0.5"
                                                >
                                                  <option value="SA">SA</option>
                                                  <option value="NS">NS</option>
                                                  <option value="NA">NA</option>
                                                  <option value="NV">NV</option>
                                                </select>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {(!domaine.sousDomaines || domaine.sousDomaines.length === 0) && (
                        <div className="text-center text-xs text-muted-foreground py-2">
                          Aucun sous-domaine
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

interface RapportAnnexesProps {
  surveillanceId: string;
  onExport?: (format: string) => void;
  readOnly?: boolean;
  userRole?: string;
}

export function RapportAnnexes({
  surveillanceId,
  onExport,
  readOnly = false,
  userRole = 'inspector',
}: RapportAnnexesProps) {
  const surveillances = useAppStore(s => s.surveillances);
  const surveillance = surveillances.find(s => s.id === surveillanceId);
  const aerodromeId = surveillance?.aerodrome_id;

  const [expandedSections, setExpandedSections] = useState<string[]>(['A1', 'A2', 'A3', 'A4']);
  const [expandedAll, setExpandedAll] = useState(true);

  const toggleAll = () => {
    setExpandedAll(!expandedAll);
    if (!expandedAll) {
      setExpandedSections(['A1', 'A2', 'A3', 'A4']);
    } else {
      setExpandedSections([]);
    }
  };

  const handleExportZip = () => {
    if (onExport) {
      onExport('zip');
    } else {
      const data = {
        surveillanceId,
        exported_at: new Date().toISOString(),
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `annexes_${surveillanceId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-4" data-role={userRole}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-role-primary" />
          <h3 className="font-semibold text-foreground">Annexes du rapport</h3>
          <span className="badge outline text-xs">A-1, A-2, A-3, A-4</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleAll} className="btn btn-secondary btn-sm gap-1">
            {expandedAll ? 'Tout réduire' : 'Tout déployer'}
          </button>
          <button onClick={handleExportZip} className="btn btn-primary btn-sm gap-1">
            <Download className="w-4 h-4" />
            Exporter tout
          </button>
        </div>
      </div>

      {expandedSections.includes('A1') && (
        <AnnexePresence surveillanceId={surveillanceId} readOnly={readOnly} />
      )}

      {expandedSections.includes('A2') && (
        <AnnexeEcarts surveillanceId={surveillanceId} readOnly={readOnly} />
      )}

      {expandedSections.includes('A3') && aerodromeId && (
        <AnnexeProfilRisque aerodromeId={aerodromeId} readOnly={readOnly} />
      )}

      {expandedSections.includes('A4') && (
        <AnnexeChecklistStructure surveillanceId={surveillanceId} readOnly={readOnly} />
      )}

      {expandedSections.length === 0 && (
        <div className="card border-border">
          <div className="card-content py-8 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Aucune annexe sélectionnée</p>
            <p className="text-xs mt-1">Cliquez sur "Tout déployer" pour afficher les annexes</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default RapportAnnexes;