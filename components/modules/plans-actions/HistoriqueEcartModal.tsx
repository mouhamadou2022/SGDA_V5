// components/modules/plans-actions/HistoriqueEcartModal.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import {
  History,
  X,
  Calendar,
  User,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Upload,
  Eye,
  Download,
  Bell,
  AlertCircle,
  Merge,
} from 'lucide-react';
import { getRiskLevelClass } from '@/lib/risque';

interface HistoriqueEcartModalProps {
  isOpen: boolean;
  onClose: () => void;
  ecartId: string;
  userRole: string;
}

interface TimelineStep {
  id: string;
  type: 'creation' | 'notification' | 'soumission_pac' | 'evaluation_pac' | 'soumission_preuves' | 'validation_preuves' | 'cloture' | 'reconciliation' | 'rappel' | 'retard';
  date: string;
  acteur: string;
  role_acteur: string;
  description: string;
  details?: any;
  fichiers?: { url: string; nom: string }[];
  icon: React.ElementType;
  color: string;
}

export function HistoriqueEcartModal({ isOpen, onClose, ecartId, userRole }: HistoriqueEcartModalProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const getHistoriqueEcart = useAppStore(s => s.getHistoriqueEcart);
  const addNotification = useAppStore(s => s.addNotification);
  const ecart = ecarts.find(e => e.id === ecartId);
  const historique = getHistoriqueEcart(ecartId);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!ecart || !isOpen) return null;

  // Construire la timeline depuis les données réelles de l'écart (source Supabase)
  // évite les entrées fantômes de l'IndexedDB qui pourraient être désynchronisées
  const derivedTimeline: TimelineStep[] = [];

  derivedTimeline.push({
    id: `creation-${ecart.id}`,
    type: 'creation',
    date: ecart.created_at,
    acteur: ecart.inspecteur_ref_id,
    role_acteur: 'inspector',
    description: `Écart constaté — référence ${ecart.reference}`,
    icon: FileText,
    color: 'bg-blue-100 text-blue-600',
  });

  if (ecart.pac) {
    derivedTimeline.push({
      id: `soumission-pac-${ecart.id}`,
      type: 'soumission_pac',
      date: ecart.pac.soumis_le,
      acteur: ecart.pac.soumis_par,
      role_acteur: 'focal_operator',
      description: `PAC version ${ecart.pac.version} — ${ecart.pac.actions.length} action(s) corrective(s)`,
      details: {
        actions: ecart.pac.actions,
        observations: ecart.pac.observations,
      },
      fichiers: (ecart.pac.fichiers || []).map(url => ({
        url,
        nom: url.split('/').pop() || url.split('\\').pop() || 'fichier',
      })),
      icon: Send,
      color: 'bg-green-100 text-green-600',
    });
  }

  if (ecart.evaluation_pac) {
    derivedTimeline.push({
      id: `eval-pac-${ecart.id}`,
      type: 'evaluation_pac',
      date: ecart.evaluation_pac.evalue_le,
      acteur: ecart.evaluation_pac.evalue_par,
      role_acteur: 'inspector',
      description: `PAC ${ecart.evaluation_pac.decision === 'accepte' ? 'accepté' : 'refusé'} — Note globale : ${ecart.evaluation_pac.note_globale}/5`,
      details: ecart.evaluation_pac,
      icon: ecart.evaluation_pac.decision === 'accepte' ? CheckCircle2 : XCircle,
      color: ecart.evaluation_pac.decision === 'accepte' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600',
    });
  }

  if (ecart.preuves) {
    derivedTimeline.push({
      id: `preuves-${ecart.id}`,
      type: 'soumission_preuves',
      date: ecart.preuves.soumis_le,
      acteur: ecart.preuves.soumis_par,
      role_acteur: 'focal_operator',
      description: `Soumission de ${ecart.preuves.fichiers.length} fichier(s) de preuves`,
      fichiers: (ecart.preuves.fichiers || []).map(f => ({
        url: f.url,
        nom: f.nom,
      })),
      icon: Upload,
      color: 'bg-cyan-100 text-cyan-600',
    });
  }

  if (ecart.validation_preuves) {
    derivedTimeline.push({
      id: `valid-preuves-${ecart.id}`,
      type: 'validation_preuves',
      date: ecart.validation_preuves.valide_le,
      acteur: ecart.validation_preuves.valide_par,
      role_acteur: 'inspector',
      description: `Preuves ${ecart.validation_preuves.decision === 'valide' ? 'validées' : 'refusées'}`,
      details: ecart.validation_preuves,
      icon: ecart.validation_preuves.decision === 'valide' ? CheckCircle2 : XCircle,
      color: ecart.validation_preuves.decision === 'valide' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600',
    });
  }

  if (ecart.statut === 'cloture' && ecart.cloture_le) {
    derivedTimeline.push({
      id: `cloture-${ecart.id}`,
      type: 'cloture',
      date: ecart.cloture_le,
      acteur: ecart.validation_preuves?.valide_par || ecart.inspecteur_ref_id,
      role_acteur: 'inspector',
      description: 'Écart validé et clôturé',
      icon: CheckCircle2,
      color: 'bg-emerald-100 text-emerald-600',
    });
  }

  // Ajouter les événements système (rappels, retards) depuis l'IndexedDB — ces
  // types ne sont pas stockés dans l'écart lui-même
  const systemEvents: TimelineStep[] = historique
    .filter(entry => entry.type === 'rappel' || entry.type === 'retard' || entry.type === 'reconciliation')
    .map(entry => ({
      id: entry.id,
      type: entry.type,
      date: entry.date,
      acteur: entry.acteur,
      role_acteur: entry.role_acteur,
      description: entry.description,
      details: entry.details,
      fichiers: (entry.fichiers || []).map(url => ({ url, nom: url.split('/').pop() || url.split('\\').pop() || 'fichier' })),
      icon: entry.type === 'rappel' ? Bell : entry.type === 'retard' ? AlertCircle : Merge,
      color: entry.type === 'rappel' ? 'bg-amber-100 text-amber-600' : entry.type === 'retard' ? 'bg-rose-100 text-rose-600' : 'bg-purple-100 text-purple-600',
    }));

  // Trier par date décroissante (les plus récents en premier)
  const sortedTimeline = [...derivedTimeline, ...systemEvents].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const getStatutBadge = (statut: string) => {
    const statuts: Record<string, { label: string; className: string }> = {
      'ouvert': { label: 'Ouvert', className: 'badge danger' },
      'pac_attendu': { label: 'PAC attendu', className: 'badge warning' },
      'pac_soumis': { label: 'PAC soumis', className: 'badge primary' },
      'pac_refuse': { label: 'PAC refusé', className: 'badge danger' },
      'pac_accepte': { label: 'PAC accepté', className: 'badge success' },
      'preuves_soumises': { label: 'Preuves soumises', className: 'badge primary' },
      'preuves_evaluees': { label: 'Preuves évaluées', className: 'badge warning' },
      'en_retard': { label: 'En retard', className: 'badge danger' },
      'cloture': { label: 'Clôturé', className: 'badge success' },
    };
    return statuts[statut] || { label: statut, className: 'badge neutral' };
  };

  const statutBadge = getStatutBadge(ecart.statut);

  const content = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-background rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
        <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
          <div className="modal-title flex items-center gap-2">
            <History className="w-5 h-5 text-role-primary" />
            Historique complet - {ecart.reference}
          </div>
          <button className="modal-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Informations de l'écart */}
          <Card className="bg-gradient-to-r from-role-primary/5 to-transparent">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="code-oaci-badge text-xs">{ecart.reference}</span>
                  <span className={statutBadge.className}>{statutBadge.label}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  Créé le {new Date(ecart.created_at).toLocaleDateString('fr-FR')}
                </div>
              </div>
              <p className="text-sm text-foreground">{ecart.libelle}</p>
              {ecart.niveau_risque && (
                <div className="mt-2">
                  <span className={getRiskLevelClass(ecart.niveau_risque)}>
                    {ecart.niveau_risque}
                  </span>
                </div>
              )}
          </Card>

          {/* Timeline visuelle */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-role-primary" />
              Chronologie des événements
            </h3>

            <div className="space-y-3">
              {sortedTimeline.map((entry, idx) => {
                const date = new Date(entry.date);
                const dateFormatted = date.toLocaleDateString('fr-FR');
                const timeFormatted = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                const isRappel = entry.type === 'rappel';
                const isRetard = entry.type === 'retard';

                return (
                  <div key={entry.id} className="pb-3 last:pb-0">

                    <div className="bg-white border border-border rounded-lg p-3 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between flex-wrap gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {entry.type === 'creation' ? 'Création de l\'écart' :
                               entry.type === 'notification' ? 'Notification envoyée' :
                               entry.type === 'soumission_pac' ? 'PAC soumis' :
                               entry.type === 'evaluation_pac' ? `PAC ${entry.details?.note_globale ? `évalué (${entry.details.note_globale}/5)` : 'évalué'}` :
                               entry.type === 'soumission_preuves' ? 'Preuves soumises' :
                               entry.type === 'validation_preuves' ? `Preuves ${entry.details?.decision === 'valide' ? 'validées' : 'refusées'}` :
                               entry.type === 'cloture' ? 'Écart clôturé' :
                               entry.type === 'rappel' ? 'Rappel automatique' :
                                entry.type === 'retard' ? 'Écart en retard - délai dépassé' :
                                entry.type === 'reconciliation' ? 'Réconciliation' :
                                entry.type}
                            </span>
                            {entry.type === 'evaluation_pac' && entry.details?.note_globale && (
                              <span className="badge primary text-[10px]">
                                Note: {entry.details.note_globale}/5
                              </span>
                            )}
                            {isRappel && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                                J-3
                              </span>
                            )}
                            {isRetard && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 animate-pulse">
                                ⚠️ Alerte
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {dateFormatted} à {timeFormatted}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {entry.acteur === 'system' ? 'Système' : entry.acteur}
                            </span>
                          </div>
                        </div>
                      </div>

                      <p className="text-sm mt-2">{entry.description}</p>

                      {entry.details?.actions?.length > 0 && entry.type === 'soumission_pac' && (
                        <div className="mt-3 space-y-2">
                          <div className="overflow-x-auto rounded border border-border">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/30">
                                  <th className="text-left p-2 font-medium">Action</th>
                                  <th className="text-left p-2 font-medium">Responsable</th>
                                  <th className="text-left p-2 font-medium">Date prévue</th>
                                  <th className="text-left p-2 font-medium">Livrables</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entry.details.actions.map((a: any, i: number) => (
                                  <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                                    <td className="p-2 max-w-[200px] truncate">{a.description}</td>
                                    <td className="p-2">{a.responsable}</td>
                                    <td className="p-2 whitespace-nowrap">{a.date_prevue ? new Date(a.date_prevue).toLocaleDateString('fr-FR') : '-'}</td>
                                    <td className="p-2">{(a.livrables || []).join(', ') || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {entry.details.observations && (
                            <div className="p-2 bg-background rounded border border-border text-xs">
                              <span className="font-medium text-muted-foreground">Observations: </span>
                              {entry.details.observations}
                            </div>
                          )}
                        </div>
                      )}

                      {entry.type === 'evaluation_pac' && entry.details && (
                        <div className="mt-2 p-2 bg-background rounded border border-border grid grid-cols-2 gap-2 text-sm">
                          <div>Pertinence: {entry.details.note_pertinence}/5</div>
                          <div>Exhaustivité: {entry.details.note_exhaustivite}/5</div>
                          <div>Précision: {entry.details.note_precision}/5</div>
                          <div>Spécificité: {entry.details.note_specificite}/5</div>
                          <div>Cohérence: {entry.details.note_coherence}/5</div>
                          <div>Réalisme: {entry.details.note_realisme ?? entry.details.note_tracabilite}/5</div>
                          {entry.details.commentaire_refus && (
                            <div className="col-span-2 p-2 bg-danger/10 rounded-lg text-danger-700">
                              <p className="text-xs font-medium">Commentaire:</p>
                              <p className="text-xs">{entry.details.commentaire_refus}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {entry.fichiers && entry.fichiers.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Fichiers joints:</p>
                          <div className="flex flex-col gap-1.5">
                            {entry.fichiers.map((f, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs bg-background p-1.5 rounded border border-border">
                                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="flex-1 truncate text-foreground">{f.nom}</span>
                                <a
                                  href={f.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm px-2 py-0.5 btn-ghost gap-1 text-[10px]"
                                >
                                  <Eye className="w-3 h-3" />
                                  Voir
                                </a>
                                <a
                                  href={f.url}
                                  download={f.nom}
                                  className="btn btn-sm px-2 py-0.5 btn-ghost gap-1 text-[10px]"
                                >
                                  <Download className="w-3 h-3" />
                                  Télécharger
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}

              {sortedTimeline.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun historique disponible</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions disponibles */}
          <Card title="Actions disponibles">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    addNotification({
                      user_id: userRole,
                      type: 'info',
                      title: 'Export demandé',
                      message: `L'export de l'historique est en cours de préparation`,
                      canal: 'in_app',
                    });
                  }}
                  className="btn btn-secondary btn-sm gap-1"
                >
                  <Download className="w-3 h-3" />
                  Exporter l'historique
                </button>
              </div>
        </Card>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}

export default HistoriqueEcartModal;