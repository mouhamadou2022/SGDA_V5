'use client'

import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { useAppStore } from '@/lib/store'
import { CheckCircle2, XCircle, AlertTriangle, X, User, Calendar, Clock, ArrowLeftRight, ShieldCheck, PenLine } from 'lucide-react'
import { getRiskLevelBgColor, getCellColor } from '@/lib/risque'

interface ValidationChefModalProps {
  isOpen: boolean
  onClose: () => void
  ecartId: string
}

function getDelaiColor(joursRestants: number, depasse: boolean): string {
  if (depasse || joursRestants < 0) return 'text-danger bg-danger/10 border-danger/30'
  if (joursRestants <= 3) return 'text-warning bg-warning/10 border-warning/30'
  return 'text-success bg-success/10 border-success/30'
}

function SignatureBlock({ userId, dateLabel, label }: { userId: string; dateLabel: string; label: string }) {
  const utilisateurs = useOptimizedStore(s => s.utilisateurs)
  const user = utilisateurs?.find((u: any) => u.id === userId)
  const nom = user?.nom || user?.prenom || userId?.substring(0, 8) || 'Inconnu'
  const prenom = user?.prenom || ''
  const initiales = ((prenom?.charAt(0) || '') + (nom?.charAt(0) || '')).toUpperCase() || '??'

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-gradient-to-r from-primary/5 to-transparent">
      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
        {initiales}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs text-muted-foreground uppercase">{label}</span>
        </div>
        <p className="text-sm font-semibold truncate">
          {prenom} {nom}
        </p>
        <p className="text-[10px] text-muted-foreground">{dateLabel}</p>
      </div>
    </div>
  )
}

function DelaiBadge({ deadline, evalueLe, label }: { deadline?: string; evalueLe?: string; label: string }) {
  const delai = useMemo(() => {
    if (!deadline || !evalueLe) return null
    const dead = new Date(deadline)
    const evalue = new Date(evalueLe)
    const joursRestants = Math.ceil((dead.getTime() - evalue.getTime()) / (1000 * 60 * 60 * 24))
    const depasse = joursRestants < 0
    const joursPris = Math.ceil((evalue.getTime() - (dead.getTime() - (deadline ? parseInt(deadline) : 0))) / (1000 * 60 * 60 * 24))
    return { joursRestants, depasse, joursPris }
  }, [deadline, evalueLe])

  if (!delai) return null

  const color = getDelaiColor(delai.joursRestants, delai.depasse)

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded border ${color}`}>
      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
      <div className="text-xs">
        <p className="font-semibold">{label}</p>
        <p>
          {delai.depasse
            ? `Dépassé de ${Math.abs(delai.joursRestants)}j`
            : `${delai.joursRestants}j restant${delai.joursRestants > 1 ? 's' : ''}`}
          {' · '}
          {delai.joursRestants >= 0 ? 'Dans les temps' : 'En retard'}
        </p>
      </div>
    </div>
  )
}

function SignatureLine({ userId, dateStr, label }: { userId: string; dateStr: string; label: string }) {
  const utilisateurs = useOptimizedStore(s => s.utilisateurs)
  const user = utilisateurs?.find((u: any) => u.id === userId)
  const nom = user?.nom || userId?.substring(0, 8) || 'Inconnu'
  const prenom = user?.prenom || ''
  const initiales = ((prenom?.charAt(0) || '') + (nom?.charAt(0) || '')).toUpperCase() || '??'

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary flex-shrink-0">
        {initiales}
      </div>
      <span className="font-medium">{prenom} {nom}</span>
      <span className="text-muted-foreground">·</span>
      <PenLine className="w-3 h-3 text-muted-foreground" />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-muted-foreground">·</span>
      <Calendar className="w-3 h-3 text-muted-foreground" />
      <span className="text-muted-foreground">{new Date(dateStr).toLocaleDateString('fr-FR')}</span>
    </div>
  )
}

export function ValidationChefModal({ isOpen, onClose, ecartId }: ValidationChefModalProps) {
  const ecarts = useOptimizedStore(s => s.ecarts)
  const user = useOptimizedStore(s => s.user)
  const ecart = ecarts.find(e => e.id === ecartId)
  const validerEvaluationChef = useAppStore(s => s.validerEvaluationChef)
  const addNotification = useAppStore(s => s.addNotification)

  const [action, setAction] = useState<'approuve' | 'revision' | null>(null)
  const [commentaire, setCommentaire] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!ecart || !isOpen) return null

  const isPAC = ecart.validation_chef?.type === 'evaluation_pac'
  const isPreuves = ecart.validation_chef?.type === 'validation_preuves'
  const evaluation = ecart.evaluation_pac
  const validation = ecart.validation_preuves

  const handleSubmit = async () => {
    if (!action) return
    if (action === 'revision' && !commentaire.trim()) {
      alert('Veuillez fournir un commentaire expliquant la demande de révision')
      return
    }
    setIsSubmitting(true)
    try {
      await validerEvaluationChef(ecartId, action, commentaire.trim() || undefined)
      addNotification({
        user_id: user?.id || '',
        type: action === 'approuve' ? 'success' : 'warning',
        title: action === 'approuve' ? 'Validation enregistrée' : 'Révision demandée',
        message: action === 'approuve'
          ? `L'évaluation pour l'écart ${ecart.reference} a été approuvée`
          : `Une révision a été demandée pour l'écart ${ecart.reference}`,
        canal: 'in_app'
      })
      onClose()
    } catch (err) {
      console.error(err)
      addNotification({ user_id: user?.id || '', type: 'danger', title: 'Erreur', message: 'Erreur lors de la validation', canal: 'in_app' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-background rounded-2xl w-full max-w-3xl max-h-[95vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
        <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
          <div className="modal-title flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-role-primary" />
            Validation chef — {ecart.reference}
          </div>
          <button type="button" className="action-button" onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="modal-body overflow-y-auto space-y-4">
          {/* Infos écart */}
          <div className="p-4 rounded-lg border border-border bg-muted/20">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Référence</p>
                <p className="font-mono font-medium">{ecart.reference}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Niveau risque</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${getRiskLevelBgColor(ecart.niveau_risque)}`}>
                  {ecart.niveau_risque === 'eleve' ? 'Élevé' : ecart.niveau_risque.charAt(0).toUpperCase() + ecart.niveau_risque.slice(1)}
                </span>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Type</p>
                <p className="font-medium">{isPAC ? 'Évaluation PAC' : 'Validation preuves'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase">Statut</p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                  <AlertTriangle className="w-3 h-3" /> En attente
                </span>
              </div>
            </div>
            <p className="text-sm mt-2">{ecart.libelle}</p>
          </div>

          {/* Évaluation PAC */}
          {isPAC && evaluation && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-role-primary">Évaluation de l'inspecteur</h4>

              {/* Délai inspecteur */}
              <DelaiBadge deadline={evaluation.deadline} evalueLe={evaluation.evalue_le} label="Délai d'évaluation PAC" />

              {/* Signature inspecteur */}
              <SignatureBlock userId={evaluation.evalue_par} dateLabel={new Date(evaluation.evalue_le).toLocaleString('fr-FR')} label="Évalué par" />

              {/* Grille des notes */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { label: 'Pertinence', note: evaluation.note_pertinence },
                  { label: 'Exhaustivité', note: evaluation.note_exhaustivite },
                  { label: 'Précision', note: evaluation.note_precision },
                  { label: 'Spécificité', note: evaluation.note_specificite },
                  { label: 'Réalisme', note: evaluation.note_realisme },
                  { label: 'Cohérence', note: evaluation.note_coherence },
                ].map(c => (
                  <div key={c.label} className="p-2 rounded border border-border text-center">
                    <p className="text-[10px] text-muted-foreground">{c.label}</p>
                    <p className="text-lg font-bold">{c.note ?? '—'}/4</p>
                  </div>
                ))}
              </div>

              {/* Note globale + décision */}
              <div className="p-3 rounded border-2 border-primary/30 bg-primary/5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Note globale</p>
                  <p className="text-xl font-bold">{evaluation.note_globale ?? '—'}/4</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Décision inspecteur</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                    evaluation.decision === 'accepte' ? 'bg-success/20 text-success' :
                    evaluation.decision === 'reserve' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                  }`}>
                    {evaluation.decision === 'accepte' ? 'Accepté' :
                     evaluation.decision === 'reserve' ? 'Réserves' : 'Refusé'}
                  </span>
                </div>
              </div>

              {evaluation.commentaire_refus && (
                <div className="p-2 rounded bg-muted/20 border border-border text-sm">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Commentaire</p>
                  <p>{evaluation.commentaire_refus}</p>
                </div>
              )}

              {/* Risque résiduel cible */}
              {evaluation.risque_residuel_cible_niveau && (
                <div className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-border text-xs">
                  <span className="text-muted-foreground">Risque résiduel cible:</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold ${getRiskLevelBgColor(evaluation.risque_residuel_cible_niveau)}`}>
                    {evaluation.risque_residuel_cible_niveau === 'eleve' ? 'Élevé' : evaluation.risque_residuel_cible_niveau.charAt(0).toUpperCase() + evaluation.risque_residuel_cible_niveau.slice(1)}
                  </span>
                  {evaluation.risque_residuel_cible_cellule && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-mono font-bold ${getCellColor(evaluation.risque_residuel_cible_cellule)}`}>
                      {evaluation.risque_residuel_cible_cellule}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Validation preuves */}
          {isPreuves && validation && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-role-primary">Validation de l'inspecteur</h4>

              {/* Délai inspecteur */}
              <DelaiBadge deadline={validation.deadline} evalueLe={validation.valide_le} label="Délai de validation preuves" />

              {/* Signature inspecteur */}
              <SignatureBlock userId={validation.valide_par} dateLabel={new Date(validation.valide_le).toLocaleString('fr-FR')} label="Validé par" />

              {/* Grille des notes */}
              {validation.notes_criteres && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {[
                    { label: 'Complétude', note: validation.notes_criteres.completude },
                    { label: 'Qualité', note: validation.notes_criteres.qualite },
                    { label: 'Pertinence', note: validation.notes_criteres.pertinence },
                    { label: 'Traçabilité', note: validation.notes_criteres.tracabilite },
                    { label: 'Efficacité', note: validation.notes_criteres.efficacite },
                  ].map(c => c.note !== undefined && (
                    <div key={c.label} className="p-2 rounded border border-border text-center">
                      <p className="text-[10px] text-muted-foreground">{c.label}</p>
                      <p className="text-lg font-bold">{c.note}/4</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Note globale + décision */}
              <div className="p-3 rounded border-2 border-primary/30 bg-primary/5 flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Note globale</p>
                  <p className="text-xl font-bold">{validation.note_globale ?? '—'}/4</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Décision inspecteur</p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                    validation.decision === 'valide' ? 'bg-success/20 text-success' :
                    validation.decision === 'reserve' ? 'bg-warning/20 text-warning' : 'bg-danger/20 text-danger'
                  }`}>
                    {validation.decision === 'valide' ? 'Validé' :
                     validation.decision === 'reserve' ? 'Réserves' : 'Refusé'}
                  </span>
                </div>
              </div>

              {validation.commentaire && (
                <div className="p-2 rounded bg-muted/20 border border-border text-sm">
                  <p className="text-[10px] text-muted-foreground uppercase mb-1">Commentaire</p>
                  <p>{validation.commentaire}</p>
                </div>
              )}
              {validation.reserves && validation.reserves.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Réserves</p>
                  {validation.reserves.map((r, i) => (
                    <div key={i} className="py-1 px-2 rounded border border-warning/30 bg-warning/5 text-sm">{r}</div>
                  ))}
                </div>
              )}
              {validation.verification_ia && (
                <div className="p-2 rounded bg-primary/5 border border-primary/20 text-xs">
                  <p className="font-semibold mb-1">Vérification IA</p>
                  <p>Conforme: {validation.verification_ia.conforme ? '✓' : '✗'} — Confiance: {validation.verification_ia.niveauConfiance}%</p>
                  {validation.verification_ia.elementsManquants.length > 0 && (
                    <p className="text-danger mt-1">Éléments manquants: {validation.verification_ia.elementsManquants.join(', ')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <hr className="border-border" />

          {/* Actions chef */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Votre décision</p>

            {action === 'revision' && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">Motif de la révision</label>
                <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
                  placeholder="Expliquez à l'inspecteur ce qui doit être revu..."
                  rows={3} className="form-textarea w-full mt-1" />
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setAction('approuve'); setCommentaire(''); }}
                className={`flex-1 p-3 rounded border-2 text-center transition-all ${
                  action === 'approuve' ? 'border-success bg-success/10' : 'border-border hover:border-success/50'
                }`}>
                <CheckCircle2 className={`w-5 h-5 mx-auto mb-1 ${action === 'approuve' ? 'text-success' : 'text-muted-foreground'}`} />
                <p className="text-xs font-semibold">Approuver</p>
                <p className="text-[10px] text-muted-foreground">Valider la décision de l'inspecteur</p>
              </button>
              <button onClick={() => setAction('revision')}
                className={`flex-1 p-3 rounded border-2 text-center transition-all ${
                  action === 'revision' ? 'border-warning bg-warning/10' : 'border-border hover:border-warning/50'
                }`}>
                <XCircle className={`w-5 h-5 mx-auto mb-1 ${action === 'revision' ? 'text-warning' : 'text-muted-foreground'}`} />
                <p className="text-xs font-semibold">Révision</p>
                <p className="text-[10px] text-muted-foreground">Demander une révision à l'inspecteur</p>
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer border-t border-border flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary">Annuler</button>
          <button type="button" onClick={handleSubmit}
            disabled={!action || isSubmitting || (action === 'revision' && !commentaire.trim())}
            className={`btn ${action === 'approuve' ? 'btn-success' : 'btn-warning'}`}>
            {isSubmitting ? 'En cours...' : action === 'approuve' ? 'Approuver' : 'Demander la révision'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
