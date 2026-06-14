// components/modules/enquetes/EnqueteBuilder.tsx
'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Card } from '@/components/ui/card'
import { Enquete, QuestionEnquete } from '@/lib/store'
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, Save, Send, Star, Shield, Target, TrendingUp, X, AlertCircle, Calendar, ClipboardList } from 'lucide-react'

type QuestionType = 'choix_unique' | 'likert_5' | 'texte_libre' | 'oui_non' | 'note_10'

interface EnqueteBuilderProps {
  enquete: Enquete
  onSave: (enquete: Enquete) => void
  onClose?: () => void
}

function genId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function createQuestion(type: QuestionType): QuestionEnquete {
  return {
    id: genId(),
    type,
    texte: '',
    options: type === 'choix_unique' ? ['Option A', 'Option B'] : undefined,
    obligatoire: true,
    ordre: 0,
    impact_c1: false,
  }
}

const TYPE_LABELS: Record<QuestionType, string> = {
  choix_unique: 'QCM',
  likert_5: 'Likert 1-5',
  texte_libre: 'Texte libre',
  oui_non: 'Oui / Non',
  note_10: 'Note 1-10',
}

const IMPACT_LABELS: Record<string, string> = {
  amelioration_culture: '📚 Amélioration de la culture SGS',
  conformite_reglementaire: '📋 Évaluation de la conformité réglementaire',
  identification_risques: '⚠️ Identification des risques émergents',
  suivi_actions: '🔄 Suivi des actions correctives',
  retour_experience: '📖 Retour d\'expérience après incident',
}

const CRITICITE_CONFIG: Record<string, { label: string; color: string; badge: string }> = {
  basse: { label: 'Basse', color: 'text-success', badge: 'success' },
  moyenne: { label: 'Moyenne', color: 'text-warning', badge: 'warning' },
  haute: { label: 'Haute', color: 'text-danger', badge: 'danger' },
  critique: { label: 'Critique', color: 'text-danger', badge: 'danger animate-pulse' },
}

export function EnqueteBuilder({ enquete, onSave, onClose }: EnqueteBuilderProps) {
  const [questions, setQuestions] = useState<QuestionEnquete[]>(enquete.questions ?? [])
  const [preview, setPreview] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showPublishConfirm, setShowPublishConfirm] = useState(false)

  const addQuestion = (type: QuestionType) => {
    const q = createQuestion(type)
    setQuestions((prev) => [...prev, { ...q, ordre: prev.length }])
  }

  const updateQuestion = (id: string, patch: Partial<QuestionEnquete>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  const moveQuestion = (id: string, dir: -1 | 1) => {
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === id)
      if (idx < 0) return prev
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr.map((q, i) => ({ ...q, ordre: i }))
    })
  }

  const addOption = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, options: [...(q.options ?? []), `Option ${(q.options?.length ?? 0) + 1}`] } : q
      )
    )
  }

  const removeOption = (qId: string, optIdx: number) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId ? { ...q, options: q.options?.filter((_, i) => i !== optIdx) } : q
      )
    )
  }

  const updateOption = (qId: string, optIdx: number, val: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === qId
          ? { ...q, options: q.options?.map((o, i) => (i === optIdx ? val : o)) }
          : q
      )
    )
  }

  const handleSave = () => {
    setIsSaving(true)
    onSave({ ...enquete, questions, statut: 'brouillon' })
    setIsSaving(false)
  }

  const handlePublish = () => {
    setShowPublishConfirm(true)
  }

  const confirmPublish = () => {
    setIsSaving(true)
    onSave({ ...enquete, questions, statut: 'active' })
    setShowPublishConfirm(false)
    setIsSaving(false)
  }

  const criticiteInfo = CRITICITE_CONFIG[(enquete as any).criticite as string] || CRITICITE_CONFIG.moyenne
  const impactLabel = IMPACT_LABELS[(enquete as any).impact_securite as string] || (enquete as any).impact_securite

  const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

  // Modal de confirmation de publication
  const PublishConfirmModal = () => {
    if (!showPublishConfirm) return null
    return createPortal(
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowPublishConfirm(false)}>
        <div className="bg-background rounded-2xl max-w-md w-full border-t-4 border-t-role-primary" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Publier l'enquête</div>
            <button className="modal-close" onClick={() => setShowPublishConfirm(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="modal-body p-5 space-y-3">
            <p>L'enquête deviendra <strong>active</strong> et sera envoyée aux exploitants des aérodromes ciblés.</p>
            <div className="bg-warning/10 p-3 rounded-lg">
              <p className="text-sm text-warning">⚠️ Attention</p>
              <p className="text-xs text-muted-foreground mt-1">Une fois publiée, vous ne pourrez plus modifier les questions.</p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setShowPublishConfirm(false)}>Annuler</button>
            <button className="btn btn-primary" onClick={confirmPublish}>Confirmer la publication</button>
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // Aperçu
  if (preview) {
    const dateDebut = (enquete as any).date_debut ? new Date((enquete as any).date_debut).toLocaleDateString('fr-FR') : 'Non définie'
    const dateFin = enquete.deadline ? new Date(enquete.deadline).toLocaleDateString('fr-FR') : 'Non définie'

    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
        <div className="bg-background rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
          <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
            <div className="modal-title">Aperçu — Vue exploitant</div>
            <button className="modal-close" onClick={() => setPreview(false)}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* En-tête de l'enquête avec contexte sécurité */}
            <Card variant="role" heading={<h2 className="text-xl font-bold">{enquete.titre}</h2>} badge={<span className={`badge ${criticiteInfo.badge}`}>{criticiteInfo.label}</span>}>
              <div className="space-y-4">
                
                <p className="text-muted-foreground">{enquete.description}</p>
                
                {(enquete as any).contexte_securite && (
                  <div className="bg-primary/10 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-primary">
                      <Target className="w-4 h-4" />
                      <span className="text-sm font-medium">Contexte de sécurité</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{(enquete as any).contexte_securite}</p>
                  </div>
                )}

                {(enquete as any).impact_securite && (
                  <div className="bg-warning/10 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-warning">
                      <Shield className="w-4 h-4" />
                      <span className="text-sm font-medium">Impact sur la sécurité</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{impactLabel || (enquete as any).impact_securite}</p>
                  </div>
                )}
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Période: {dateDebut} → {dateFin}
                  </span>
                </div>

                <div className="bg-primary/10 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Impact sur le profil de risque</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Les réponses à cette enquête impacteront le score C1 (Maturité SGS) de votre profil de risque.
                    Répondez sincèrement pour une évaluation précise.
                  </p>
                </div>
              </div>
            </Card>

            {/* Questions */}
            <div className="space-y-4">
              {questions.map((q, idx) => (
                <Card key={q.id} variant="role">
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium text-muted-foreground">{idx + 1}.</span>
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {q.texte || '(Question sans texte)'}
                          {q.obligatoire && <span className="text-danger ml-1">*</span>}
                        </p>
                        {q.impact_c1 && q.type === 'likert_5' && (
                          <span className="badge warning mt-1 flex items-center gap-1 w-fit">
                            <Star className="w-3 h-3 fill-warning text-warning" />
                            Impacte le score C1
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="ml-6">
                      {q.type === 'choix_unique' && (
                        <div className="space-y-1">
                          {q.options?.map((opt, i) => (
                            <label key={i} className="form-radio text-sm">
                              <input type="radio" name={q.id} readOnly disabled />
                              {opt}
                            </label>
                          ))}
                        </div>
                      )}
                      {q.type === 'likert_5' && (
                        <div className="flex gap-2 flex-wrap">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <div key={v} className="flex flex-col items-center gap-1 text-sm">
                              <div className="w-10 h-10 rounded-lg bg-role-primary-soft flex items-center justify-center text-role-primary font-semibold">{v}</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {q.type === 'texte_libre' && (
                        <textarea className="form-textarea w-full" rows={2} placeholder="Votre réponse…" readOnly disabled />
                      )}
                      {q.type === 'oui_non' && (
                        <div className="flex gap-4">
                          {['Oui', 'Non'].map(v => (
                            <label key={v} className="form-radio text-sm">
                              <input type="radio" name={q.id} readOnly disabled />
                              {v}
                            </label>
                          ))}
                        </div>
                      )}
                      {q.type === 'note_10' && (
                        <div className="flex gap-1 flex-wrap">
                          {[1,2,3,4,5,6,7,8,9,10].map(v => (
                            <div key={v} className="w-8 h-8 rounded-lg bg-role-primary-soft flex items-center justify-center text-xs text-role-primary font-medium">{v}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {questions.length === 0 && (
              <Card className="text-center">
                <p>Aucune question dans cette enquête.</p>
              </Card>
            )}
          </div>

          <div className="modal-footer border-t border-border">
            <button className="btn btn-secondary" onClick={() => setPreview(false)}>
              Retour à l'édition
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-background rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border-t-4 border-t-role-primary flex flex-col">
        
        <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
          <div className="modal-title">
            <ClipboardList className="w-5 h-5 text-role-primary" />
            Construire le questionnaire
          </div>
          {onClose && (
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Résumé de l'enquête */}
          <Card variant="role" heading={<h3 className="font-semibold">{enquete.titre}</h3>} badge={<span className={`badge ${criticiteInfo.badge}`}>{criticiteInfo.label}</span>} className="bg-gradient-to-r from-role-primary/5 to-transparent">
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{enquete.description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {(enquete as any).date_debut ? new Date((enquete as any).date_debut).toLocaleDateString('fr-FR') : 'Date non définie'}
              </span>
              <span>→</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {enquete.deadline ? new Date(enquete.deadline).toLocaleDateString('fr-FR') : 'Date non définie'}
              </span>
            </div>
          </Card>

          {/* Boutons ajouter question */}
          <div className="flex flex-wrap gap-2">
            {(Object.entries(TYPE_LABELS) as [QuestionType, string][]).map(([type, label]) => (
              <button key={type} className="btn btn-secondary btn-sm gap-1" onClick={() => addQuestion(type)}>
                <Plus className="w-3 h-3" />
                {label}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <button className="btn btn-secondary btn-sm gap-1" onClick={() => setPreview(true)}>
                <Eye className="w-3 h-3" />
                Aperçu
              </button>
              <button className="btn btn-secondary btn-sm gap-1" onClick={handleSave} disabled={isSaving}>
                <Save className="w-3 h-3" />
                Sauvegarder
              </button>
              <button className="btn btn-primary btn-sm gap-1" onClick={handlePublish} disabled={isSaving}>
                <Send className="w-3 h-3" />
                Publier
              </button>
            </div>
          </div>

          {questions.length === 0 && (
            <Card className="text-center">
              <p>Aucune question. Cliquez sur "+ [type]" pour ajouter une question.</p>
            </Card>
          )}

          {/* Liste des questions */}
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <Card key={q.id}>
                <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="badge outline">{TYPE_LABELS[q.type as QuestionType] ?? q.type}</span>
                  <div className="flex gap-1 ml-auto">
                    <button className="action-button" onClick={() => moveQuestion(q.id, -1)} disabled={idx === 0}>
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button className="action-button" onClick={() => moveQuestion(q.id, 1)} disabled={idx === questions.length - 1}>
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button className="action-button text-danger" onClick={() => removeQuestion(q.id)}>
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  className={`form-input w-full ${focusClass}`}
                  placeholder="Texte de la question…"
                  value={q.texte}
                  onChange={(e) => updateQuestion(q.id, { texte: e.target.value })}
                />

                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 text-small cursor-pointer">
                    <input
                      type="checkbox"
                      checked={q.obligatoire}
                      onChange={(e) => updateQuestion(q.id, { obligatoire: e.target.checked })}
                      className="form-checkbox"
                    />
                    Obligatoire
                  </label>
                  {q.type === 'likert_5' && (
                    <label className="flex items-center gap-2 text-small cursor-pointer">
                      <input
                        type="checkbox"
                        checked={q.impact_c1}
                        onChange={(e) => updateQuestion(q.id, { impact_c1: e.target.checked })}
                        className="form-checkbox"
                      />
                      <Star className="w-3 h-3 text-warning" />
                      Impact C1 SGS
                    </label>
                  )}
                </div>

                {q.type === 'choix_unique' && (
                  <div className="space-y-2 pl-2">
                    {q.options?.map((opt, optIdx) => (
                      <div key={optIdx} className="flex gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
                          className={`form-input flex-1 ${focusClass}`}
                          placeholder={`Option ${optIdx + 1}`}
                        />
                        <button className="action-button text-danger" onClick={() => removeOption(q.id, optIdx)}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button className="btn btn-secondary btn-sm" onClick={() => addOption(q.id)}>
                      <Plus className="w-3 h-3" />
                      Ajouter une option
                    </button>
                  </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="modal-footer border-t border-border">
          <button className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>

      <PublishConfirmModal />
    </div>
  )
}

export default EnqueteBuilder;