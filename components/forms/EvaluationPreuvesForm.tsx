'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOptimizedStore } from '@/lib/performance/globalOptimizer';
import { useAppStore } from '@/lib/store';
import {
  FileText, CheckCircle2, XCircle, X, Eye, AlertTriangle, HelpCircle, Sparkles, Shield, AlertCircle, MinusCircle,
} from 'lucide-react';
import { learningEnginePAC } from '@/lib/learningEnginePAC';
import { ecartAgent } from '@/lib/ia/agents/ecartAgent';

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all";

interface Critere {
  id: string;
  label: string;
  description: string;
  bonExemple: string;
  mauvaisExemple: string;
  ponderation: number;
}

const CRITERES_PREUVES: Critere[] = [
  {
    id: 'completude',
    label: 'Complétude',
    description: 'Tous les livrables attendus sont-ils fournis ?',
    bonExemple: 'Facture + photo après travaux + rapport de test',
    mauvaisExemple: 'Facture uniquement, sans preuve de réalisation',
    ponderation: 0.25,
  },
  {
    id: 'qualite',
    label: 'Qualité',
    description: 'Les documents sont-ils lisibles ? Les photos identifiables ?',
    bonExemple: 'Photo datée avec légende, document PDF signé',
    mauvaisExemple: 'Photo floue sans date, document illisible',
    ponderation: 0.20,
  },
  {
    id: 'pertinence',
    label: 'Pertinence',
    description: 'Les preuves démontrent-elles réellement la réalisation des actions ?',
    bonExemple: 'Photo de l\'équipement après réparation',
    mauvaisExemple: 'Photo générique non liée à l\'action',
    ponderation: 0.25,
  },
  {
    id: 'tracabilite',
    label: 'Traçabilité',
    description: 'Les preuves sont-elles datées et signées ?',
    bonExemple: 'Document daté et signé par le responsable',
    mauvaisExemple: 'Document sans date ni signature',
    ponderation: 0.15,
  },
  {
    id: 'efficacite',
    label: 'Efficacité',
    description: 'L\'action a-t-elle réellement résolu l\'écart ?',
    bonExemple: 'Rapport de test confirmant le bon fonctionnement',
    mauvaisExemple: 'Preuve de réalisation mais problème persistant',
    ponderation: 0.15,
  },
];

const NIVEAUX_SCORE = [
  { valeur: 0, label: 'Non évalué', color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-muted' },
  { valeur: 1, label: 'Insuffisant', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger' },
  { valeur: 2, label: 'Partiel', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning' },
  { valeur: 3, label: 'Satisfaisant', color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary' },
  { valeur: 4, label: 'Excellent', color: 'text-success', bg: 'bg-success/10', border: 'border-success' },
];

interface VerificationIA {
  conforme: boolean;
  niveauConfiance: number;
  elementsManquants: string[];
  preuvesSuffisantes: boolean;
}

interface EvaluationPreuvesFormProps {
  ecartId: string;
  actionId?: string;
  onSuccess: () => void;
  onCancel: () => void;
  userRole?: string;
}

export function EvaluationPreuvesForm({
  ecartId,
  actionId,
  onSuccess,
  onCancel,
  userRole = 'focal_operator'
}: EvaluationPreuvesFormProps) {
  const ecarts = useOptimizedStore(s => s.ecarts);
  const user = useOptimizedStore(s => s.user);
  const profilsRisque = useOptimizedStore(s => s.profilsRisque);
  const evaluerPreuves = useAppStore(s => s.evaluerPreuves);
  const addNotification = useAppStore(s => s.addNotification);
  const ecart = ecarts.find(e => e.id === ecartId);

  const [notes, setNotes] = useState<Record<string, number>>({
    completude: 0,
    qualite: 0,
    pertinence: 0,
    tracabilite: 0,
    efficacite: 0,
  });
  const [commentaire, setCommentaire] = useState('');
  const [decision, setDecision] = useState<'valide' | 'refuse' | 'reserve'>('valide');
  const [reserves, setReserves] = useState<string[]>([]);
  const [newReserve, setNewReserve] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [verificationIA, setVerificationIA] = useState<VerificationIA | null>(null);
  const [isVerifyingIA, setIsVerifyingIA] = useState(false);

  useEffect(() => {
    if (ecart) {
      runVerificationIA();
    }
  }, [ecartId]);

  const runVerificationIA = async () => {
    if (!ecart?.preuves?.fichiers?.length) return;
    setIsVerifyingIA(true);
    try {
      const result = await ecartAgent.verifyPreuves({
        ecartId,
        preuves: ecart.preuves,
      }, {});
      setVerificationIA({
        conforme: result.conforme,
        niveauConfiance: result.niveauConfiance,
        elementsManquants: result.elementsManquants,
        preuvesSuffisantes: result.preuvesSuffisantes,
      });
    } catch (e) {
      console.error('Erreur vérification IA:', e);
    } finally {
      setIsVerifyingIA(false);
    }
  };

  if (!ecart) {
    return (
      <div className="form-container text-center py-8" data-role={userRole}>
        <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-body text-muted-foreground">Écart non trouvé</p>
        <button type="button" onClick={onCancel} className="btn btn-secondary mt-4 gap-2">
          <X className="w-4 h-4" />Fermer
        </button>
      </div>
    );
  }

  const preuves = ecart.preuves?.fichiers || [];
  const nbFichiers = preuves.length;
  const minFichiersRequis = ecart.niveau_risque === 'critique' ? 3 : ecart.niveau_risque === 'eleve' ? 2 : 1;
  const fichiersSuffisants = nbFichiers >= minFichiersRequis;

  const scorePondere = Object.entries(notes).reduce((sum, [key, note]) => {
    const critere = CRITERES_PREUVES.find(c => c.id === key);
    return sum + (note || 0) * (critere?.ponderation || 0.2);
  }, 0);

  const scoreMax = 4;
  const scorePourcentage = Math.round((scorePondere / scoreMax) * 100);

  const tousNotes = Object.values(notes).every(v => v > 0);
  const scoreEleve = scorePondere >= 3.2;
  const scoreMoyen = scorePondere >= 2.0 && scorePondere < 3.2;

  useEffect(() => {
    if (!tousNotes) {
      setDecision('refuse');
    } else if (scoreEleve) {
      setDecision('valide');
    } else if (scoreMoyen) {
      setDecision('reserve');
    } else {
      setDecision('refuse');
    }
  }, [notes, tousNotes, scoreEleve, scoreMoyen]);

  const addReserve = () => {
    if (newReserve.trim()) {
      setReserves([...reserves, newReserve.trim()]);
      setNewReserve('');
    }
  };

  const removeReserve = (idx: number) => {
    setReserves(reserves.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (decision === 'refuse' && !commentaire.trim()) {
      alert('Veuillez fournir un commentaire expliquant le refus');
      return;
    }
    if (decision === 'reserve' && (reserves.length === 0 && !commentaire.trim())) {
      alert('Veuillez ajouter au moins une réserve ou un commentaire pour l\'acceptation avec réserves');
      return;
    }
    if (!fichiersSuffisants) {
      alert(`Minimum ${minFichiersRequis} fichier(s) requis pour un écart de niveau ${ecart.niveau_risque}. ${nbFichiers} fourni(s).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await evaluerPreuves(ecartId, {
        decision,
        commentaire: decision === 'reserve' ? `Réserves: ${reserves.join('; ')}${commentaire ? ` — ${commentaire}` : ''}` : commentaire,
        valide_par: user?.id || '',
        valide_le: new Date().toISOString(),
        notes_criteres: {
          completude: notes.completude || 0,
          qualite: notes.qualite || 0,
          pertinence: notes.pertinence || 0,
          tracabilite: notes.tracabilite || 0,
          efficacite: notes.efficacite || 0,
        },
        note_globale: Math.round(scorePondere * 10) / 10,
        verification_ia: verificationIA || undefined,
        reserves: decision === 'reserve' ? reserves : undefined,
      });

      addNotification({
        user_id: user?.id || '',
        type: decision === 'valide' ? 'success' : decision === 'reserve' ? 'warning' : 'danger',
        title: decision === 'valide' ? 'Preuves validées' : decision === 'reserve' ? 'Accepté avec réserves' : 'Preuves refusées',
        message: `Les preuves pour l'écart ${ecart.reference} ont été ${decision === 'valide' ? 'validées' : decision === 'reserve' ? 'acceptées avec réserves' : 'refusées'}`,
        canal: 'in_app',
      });

      setShowFeedback(true);
    } catch (error) {
      console.error('Erreur lors de l\'évaluation des preuves:', error);
      addNotification({
        user_id: user?.id || '',
        type: 'danger',
        title: 'Erreur',
        message: 'Une erreur est survenue lors de l\'évaluation',
        canal: 'in_app',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedback = (utilite: 'oui' | 'peu' | 'non') => {
    const contexte = profilsRisque[ecart.aerodrome_id];
    if (contexte) {
      learningEnginePAC.enregistrerFeedbackPreuves(
        ecartId,
        ecart.aerodrome_id,
        { score_global: contexte.score_global, nb_preuves: nbFichiers, delai_restant: 30 },
        [],
        Object.entries(notes).filter(([_, v]) => v >= 3).map(([k]) => k),
        false as any,
        (decision === 'reserve' ? 'refuse' : decision) as 'valide' | 'refuse',
        utilite,
        commentaire
      );
    }
    setShowFeedback(false);
    onSuccess();
  };

  return (
    <div className="form-container animate-fade-up" data-role={userRole} data-module="evaluation-preuves">
      <div className="space-y-5">
        {/* Informations écart */}
        <div className="card bg-muted/30 p-4 rounded-lg">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Référence écart</p>
              <p className="font-mono font-medium">{ecart.reference}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Niveau risque</p>
              <p className="font-medium capitalize">{ecart.niveau_risque}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Libellé</p>
              <p className="text-sm">{ecart.libelle}</p>
            </div>
          </div>
        </div>

        {/* Vérification IA */}
        {isVerifyingIA ? (
          <div className="card border-primary/30 bg-primary/5 p-4 rounded-lg flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-primary animate-pulse" />
            <div>
              <p className="text-sm font-medium">Vérification IA en cours...</p>
              <p className="text-xs text-muted-foreground">Analyse des preuves soumises</p>
            </div>
          </div>
        ) : verificationIA ? (
          <div className={`card p-4 rounded-lg border-2 ${verificationIA.conforme ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold">Vérification automatique IA</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${verificationIA.conforme ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                Confiance: {verificationIA.niveauConfiance}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1">
                {verificationIA.preuvesSuffisantes ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <XCircle className="w-3.5 h-3.5 text-danger" />}
                <span>Preuves suffisantes: {nbFichiers} fichier(s) (min: {minFichiersRequis})</span>
              </div>
              <div className="flex items-center gap-1">
                {verificationIA.conforme ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                <span>Conformité: {verificationIA.conforme ? 'OK' : 'Éléments manquants'}</span>
              </div>
            </div>
            {verificationIA.elementsManquants.length > 0 && (
              <div className="mt-2 p-2 bg-danger/5 rounded text-xs text-danger">
                <p className="font-medium mb-1">Éléments manquants détectés :</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {verificationIA.elementsManquants.map((el, i) => (
                    <li key={i}>{el}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {/* Alert fichiers insuffisants */}
        {!fichiersSuffisants && (
          <div className="alert alert-danger">
            <AlertTriangle className="alert-icon" />
            <div className="alert-content">
              <p className="alert-title">Nombre de fichiers insuffisant</p>
              <p className="alert-description">
                Pour un écart de niveau <strong>{ecart.niveau_risque}</strong>, minimum <strong>{minFichiersRequis}</strong> fichier(s) requis. {nbFichiers} fourni(s).
              </p>
            </div>
          </div>
        )}

        {/* Preuves soumises */}
        {preuves.length > 0 && (
          <div className="card border-border">
            <div className="card-header pb-2">
              <div className="card-title text-sm">Preuves soumises ({preuves.length})</div>
            </div>
            <div className="card-content">
              <div className="space-y-2">
                {preuves.map((preuve: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <div>
                        <span className="text-sm font-medium">{preuve.nom}</span>
                        {preuve.description && <p className="text-[10px] text-muted-foreground">{preuve.description}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => window.open(preuve.url, '_blank')}
                      className="action-button"
                      title="Voir le fichier"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Critères d'évaluation avec scoring 0-4 */}
        <div className="card border-border">
          <div className="card-header pb-2">
            <div className="card-title text-sm">Critères d'évaluation des preuves</div>
            <p className="text-xs text-muted-foreground mt-1">Notez chaque critère de 0 (non respecté) à 4 (excellent)</p>
          </div>
          <div className="card-content space-y-3">
            {CRITERES_PREUVES.map((critere) => {
              const noteActuelle = notes[critere.id] || 0;
              return (
                <div key={critere.id} className="p-3 rounded-lg border border-border bg-muted/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{critere.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Pondération: {Math.round(critere.ponderation * 100)}%
                      </span>
                    </div>
                    {noteActuelle > 0 && (
                      <span className={`text-sm font-bold ${NIVEAUX_SCORE[noteActuelle]?.color || ''}`}>
                        {noteActuelle}/4 — {NIVEAUX_SCORE[noteActuelle]?.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">{critere.description}</p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {NIVEAUX_SCORE.map((niveau) => (
                      <button
                        key={niveau.valeur}
                        type="button"
                        onClick={() => setNotes({ ...notes, [critere.id]: niveau.valeur })}
                        className={`py-1.5 px-1 rounded text-[10px] font-medium transition-all border ${
                          noteActuelle === niveau.valeur
                            ? `${niveau.bg} ${niveau.color} ${niveau.border} ring-1 ring-role-primary`
                            : 'bg-background border-border hover:bg-muted/50 text-muted-foreground'
                        }`}
                      >
                        {niveau.label}
                      </button>
                    ))}
                  </div>
                  {noteActuelle > 0 && noteActuelle <= 2 && (
                    <p className="text-[10px] text-danger mt-1">
                      ⚠️ {NIVEAUX_SCORE[noteActuelle]?.label} — {critere.mauvaisExemple}
                    </p>
                  )}
                  {noteActuelle >= 3 && (
                    <p className="text-[10px] text-success mt-1">
                      ✓ {NIVEAUX_SCORE[noteActuelle]?.label} — {critere.bonExemple}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Score pondéré */}
        {tousNotes && (
          <div className={`p-4 rounded-lg border-2 ${scoreEleve ? 'border-success/30 bg-success/5' : scoreMoyen ? 'border-warning/30 bg-warning/5' : 'border-danger/30 bg-danger/5'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {scoreEleve ? <CheckCircle2 className="w-6 h-6 text-success" /> : scoreMoyen ? <MinusCircle className="w-6 h-6 text-warning" /> : <XCircle className="w-6 h-6 text-danger" />}
                <div>
                  <p className="font-semibold">
                    Score pondéré: {scorePondere.toFixed(1)}/4.0 ({scorePourcentage}%)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scoreEleve ? 'Tous les critères sont satisfaits — validation recommandée' : scoreMoyen ? 'Certains critères partiels — acceptation avec réserves possible' : 'Critères insuffisants — refus recommandé'}
                  </p>
                </div>
              </div>
              <div className="progress w-40 h-3">
                <div
                  className={`progress-bar ${scoreEleve ? 'progress-faible' : scoreMoyen ? 'progress-moyen' : 'progress-critique'}`}
                  style={{ width: `${scorePourcentage}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Décision */}
        <div className="space-y-3">
          <span className="filter-label">Décision</span>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setDecision('valide')}
              disabled={!scoreEleve}
              className={`p-3 rounded-lg border-2 text-center transition-all ${
                decision === 'valide'
                  ? 'border-success bg-success/10'
                  : 'border-border hover:border-success/50 opacity-50'
              }`}
            >
              <CheckCircle2 className="w-5 h-5 mx-auto mb-1 text-success" />
              <p className="text-xs font-semibold text-success">Valider</p>
              <p className="text-[10px] text-muted-foreground">Score ≥ 80%</p>
            </button>
            <button
              type="button"
              onClick={() => setDecision('reserve')}
              disabled={!scoreMoyen && !tousNotes}
              className={`p-3 rounded-lg border-2 text-center transition-all ${
                decision === 'reserve'
                  ? 'border-warning bg-warning/10'
                  : 'border-border hover:border-warning/50'
              }`}
            >
              <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-warning" />
              <p className="text-xs font-semibold text-warning">Avec réserves</p>
              <p className="text-[10px] text-muted-foreground">Score 50-80%</p>
            </button>
            <button
              type="button"
              onClick={() => setDecision('refuse')}
              className={`p-3 rounded-lg border-2 text-center transition-all ${
                decision === 'refuse'
                  ? 'border-danger bg-danger/10'
                  : 'border-border hover:border-danger/50'
              }`}
            >
              <XCircle className="w-5 h-5 mx-auto mb-1 text-danger" />
              <p className="text-xs font-semibold text-danger">Refuser</p>
              <p className="text-[10px] text-muted-foreground">Score &lt; 50%</p>
            </button>
          </div>

          {/* Réserves */}
          {decision === 'reserve' && (
            <div className="space-y-2">
              <label className="filter-label">Réserves à corriger</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newReserve}
                  onChange={(e) => setNewReserve(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addReserve()}
                  placeholder="Ajouter une réserve..."
                  className={`flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm ${focusClass}`}
                />
                <button type="button" onClick={addReserve} className="btn btn-sm btn-primary">Ajouter</button>
              </div>
              {reserves.length > 0 && (
                <div className="space-y-1">
                  {reserves.map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-warning/5 rounded border border-warning/20">
                      <span className="text-sm">{r}</span>
                      <button type="button" onClick={() => removeReserve(i)} className="text-muted-foreground hover:text-danger">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Commentaire */}
          {(decision === 'refuse' || decision === 'reserve') && (
            <div className="form-field">
              <label className="filter-label">Commentaire (obligatoire)</label>
              <textarea
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder={decision === 'reserve' ? 'Précisez les corrections attendues...' : 'Expliquez les raisons du refus et les compléments attendus...'}
                rows={4}
                className={`form-textarea ${focusClass}`}
              />
            </div>
          )}
        </div>

        <hr className="border-border my-4" />

        {/* Footer */}
        <div className="form-actions">
          <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn btn-secondary gap-2">
            <X className="w-4 h-4" />Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !fichiersSuffisants || (decision === 'refuse' && !commentaire.trim()) || (decision === 'reserve' && reserves.length === 0 && !commentaire.trim())}
            className={`btn gap-2 ${
              decision === 'valide' ? 'btn-success' : decision === 'reserve' ? 'btn-warning' : 'btn-danger'
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? 'Évaluation en cours...' : (
              <>
                {decision === 'valide' ? <CheckCircle2 className="w-4 h-4" /> : decision === 'reserve' ? <AlertTriangle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {decision === 'valide' ? 'Valider les preuves' : decision === 'reserve' ? 'Accepter avec réserves' : 'Refuser les preuves'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal feedback */}
      {showFeedback && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background rounded-2xl max-w-md w-full border-t-4 border-t-role-primary">
            <div className="modal-header">
              <div className="modal-title flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-role-primary" />
                Votre avis nous intéresse
              </div>
              <button className="modal-close" onClick={() => setShowFeedback(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="modal-body p-5 space-y-4">
              <p className="text-sm">Cette suggestion du profil de risque vous a-t-elle été utile ?</p>
              <div className="flex gap-3">
                <button onClick={() => handleFeedback('oui')} className="btn btn-success flex-1">Oui</button>
                <button onClick={() => handleFeedback('peu')} className="btn btn-warning flex-1">Peu</button>
                <button onClick={() => handleFeedback('non')} className="btn btn-danger flex-1">Non</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
