// components/modules/dossiers/DetailsModal.tsx
'use client'

import React, { useState, memo, useEffect } from 'react'
import { FolderOpen, User, Send, Clock, FileText, Download, CheckCircle2, Upload, X, Eye, Brain, ListChecks, Loader2, Trash2, ShieldCheck, RotateCcw } from 'lucide-react'
import { FormShell } from '@/components/ui/FormShell'
import { useAppStore, type Dossier, type DossierAnalyseResult } from '@/lib/store'
import { uploadPreuveFile, uploadDossierFile } from '@/lib/dossierFileUpload'
import { kitDocAgent } from '@/lib/ia/agents/kitDocAgent'

const CATEGORIES_DOSSIERS = [
  { id: 'reglementaire', label: 'Réglementaire' },
  { id: 'technique', label: 'Technique' },
  { id: 'operationnel', label: 'Opérationnel' },
  { id: 'surveillance', label: 'Surveillance' },
  { id: 'formation', label: 'Formation' },
  { id: 'financier', label: 'Financier' },
]

function getCouleurStatut(statut: string): string {
  const couleurs: Record<string, string> = {
    'en_cours': 'badge primary',
    'en_attente': 'badge warning',
    'termine': 'badge success',
    'archive': 'badge neutral'
  }
  return couleurs[statut] || 'badge neutral'
}

function getLibelleStatut(statut: string): string {
  const libelles: Record<string, string> = {
    'en_cours': 'En cours',
    'en_attente': 'En attente',
    'termine': 'Terminé',
    'archive': 'Archivé'
  }
  return libelles[statut] || statut
}

function getCouleurScore(score: number): string {
  if (score >= 75) return 'badge success'
  if (score >= 50) return 'badge warning'
  return 'badge danger'
}

function AnalyseResultPanel({ analyse }: { analyse: DossierAnalyseResult }) {
  return (
    <div className="space-y-2 p-2 bg-role-primary-soft/40 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-role-primary flex items-center gap-1">
          <Brain className="w-3.5 h-3.5" /> Avis IA — {analyse.nom_fichier}
        </p>
        <div className="flex items-center gap-2">
          <span className={`${getCouleurScore(analyse.score_global)} text-xs`}>{analyse.score_global}/100</span>
          <span className="text-[10px] text-muted-foreground">confiance {analyse.confiance}%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {analyse.criteres.map(c => (
          <div key={c.nom} className="bg-background rounded p-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium">{c.nom}</span>
              <span className={`text-[10px] font-bold ${c.satisfait ? 'text-success' : 'text-danger'}`}>{c.score}</span>
            </div>
            {c.commentaire && <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{c.commentaire}</p>}
          </div>
        ))}
      </div>
      {analyse.references_reglementaires.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-foreground">Références réglementaires détectées</p>
          <div className="flex flex-wrap gap-1">
            {analyse.references_reglementaires.map((r, i) => (
              <span key={i} className="badge outline text-[9px]">{r}</span>
            ))}
          </div>
        </div>
      )}
      {analyse.reserves.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-danger">Réserves</p>
          {analyse.reserves.map((r, i) => <p key={i} className="text-[10px] text-foreground">• {r}</p>)}
        </div>
      )}
      {analyse.recommandations.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-success">Recommandations</p>
          {analyse.recommandations.map((r, i) => <p key={i} className="text-[10px] text-foreground">• {r}</p>)}
        </div>
      )}
    </div>
  )
}

const RESULTATS = ['SA', 'NS', 'NA', 'NV'] as const
const RESULTATS_LABELS: Record<string, { label: string; cls: string }> = {
  SA: { label: 'Satisfaisant', cls: 'badge success' },
  NS: { label: 'Non satisfaisant', cls: 'badge danger' },
  NA: { label: 'Non applicable', cls: 'badge neutral' },
  NV: { label: 'Non vérifié', cls: 'badge warning' },
}

interface ChecklistTraitementSectionProps {
  dossier: Dossier
}

function ChecklistTraitementSection({ dossier }: ChecklistTraitementSectionProps) {
  const setChecklistTraitement = useAppStore(s => s.setChecklistTraitement)
  const mettreAJourItemChecklist = useAppStore(s => s.mettreAJourItemChecklist)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const items = dossier.checklist_traitement || []

  const handleGenerate = async () => {
    setLoading(true)
    setError('')
    try {
      const generated = await kitDocAgent.genererChecklistTraitement({
        titre: dossier.titre,
        categorie: dossier.categorie,
        instructions: dossier.instructions,
        aerodromeId: dossier.aerodrome_id,
      })
      if (generated.length > 0) {
        await setChecklistTraitement(dossier.id, generated)
      } else {
        setError('La génération IA n\'a retourné aucun item — réessayez.')
      }
    } catch (e) {
      setError('Erreur lors de la génération de la checklist.')
      console.error('Erreur génération checklist traitement:', e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-role-primary uppercase flex items-center gap-1">
          <ListChecks className="w-3.5 h-3.5" /> Checklist de traitement
          {dossier.checklist_generee_le && (
            <span className="text-[10px] text-muted-foreground font-normal normal-case">
              générée le {new Date(dossier.checklist_generee_le).toLocaleDateString('fr-FR')}
            </span>
          )}
        </p>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn btn-primary btn-xs gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
          {items.length > 0 ? 'Régénérer' : 'Générer par IA'}
        </button>
      </div>
      {error && <p className="text-[10px] text-danger">{error}</p>}
      {items.length > 0 && (
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {items.map(item => (
            <div key={item.id} className="border border-border rounded-lg p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold flex items-center gap-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{item.numero}</span>
                  {item.point_verification}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {RESULTATS.map(r => (
                  <button
                    key={r}
                    onClick={() => mettreAJourItemChecklist(dossier.id, item.id, r)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-all ${
                      (item.resultat || item.prediction) === r ? RESULTATS_LABELS[r].cls : 'btn-secondary'
                    }`}
                    title={RESULTATS_LABELS[r].label}
                  >
                    {r}
                  </button>
                ))}
                {!item.resultat && (
                  <span className="text-[9px] text-muted-foreground ml-auto">prédiction IA : {item.prediction} ({item.confiance}%)</span>
                )}
              </div>
              {item.reference_reglementaire && (
                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <FileText className="w-2.5 h-2.5" /> {item.reference_reglementaire}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface FormulairesSectionProps {
  dossier: Dossier
  canManage: boolean
}

function FormulairesSection({ dossier, canManage }: FormulairesSectionProps) {
  const ajouterFormulaireDossier = useAppStore(s => s.ajouterFormulaireDossier)
  const retirerFormulaireDossier = useAppStore(s => s.retirerFormulaireDossier)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    setFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    setError('')
    try {
      const uploaded = await Promise.all(files.map(async f => ({
        nom: f.name,
        url: await uploadDossierFile(f, dossier.id),
        taille: f.size,
        type: f.type,
      })))
      for (const u of uploaded) {
        await ajouterFormulaireDossier(dossier.id, u)
      }
      setFiles([])
    } catch (e) {
      setError('Erreur lors de l\'upload des formulaires.')
      console.error('Erreur upload formulaire:', e)
    } finally {
      setUploading(false)
    }
  }

  const formulaires = dossier.formulaires || []

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-role-primary uppercase flex items-center gap-1">
        <Upload className="w-3.5 h-3.5" /> Formulaires ({formulaires.length})
      </p>
      {formulaires.length > 0 && (
        <div className="space-y-1">
          {formulaires.map(f => (
            <div key={f.id} className="flex items-center gap-2 p-2 border border-border rounded-lg text-xs">
              <FileText className="w-3.5 h-3.5 text-role-primary shrink-0" />
              <span className="flex-1 truncate">{f.nom}</span>
              <span className="text-muted-foreground shrink-0 text-[10px]">{new Date(f.date_upload).toLocaleDateString('fr-FR')}</span>
              <a href={f.url} download={f.nom} className="btn btn-ghost btn-xs p-0 shrink-0" title="Télécharger"><Download className="w-3 h-3" /></a>
              {canManage && (
                <button onClick={() => retirerFormulaireDossier(dossier.id, f.id)} className="btn btn-ghost btn-xs p-0 text-danger shrink-0" title="Retirer"><Trash2 className="w-3 h-3" /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="border border-dashed border-border rounded-lg p-2">
        <input type="file" multiple onChange={handleFiles} className="hidden" id={`formulaires-${dossier.id}`}
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
        <label htmlFor={`formulaires-${dossier.id}`} className="cursor-pointer flex items-center gap-2 text-xs text-muted-foreground">
          <Upload className="w-4 h-4" /> Ajouter des formulaires (checklist signée, avis, rapport…)
        </label>
        {files.length > 0 && (
          <div className="space-y-1 mt-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-role-primary-soft rounded px-2 py-1 text-[10px]">
                <span className="truncate flex-1">{f.name}</span>
                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="btn btn-ghost btn-xs text-danger p-0"><X className="w-3 h-3" /></button>
              </div>
            ))}
            <button onClick={handleUpload} disabled={uploading} className="btn btn-primary btn-xs w-full gap-1">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Associer {files.length} fichier(s)
            </button>
          </div>
        )}
        {error && <p className="text-[10px] text-danger mt-1">{error}</p>}
      </div>
    </div>
  )
}

interface AssignmentCardProps {
  assignment: any
  dossierId: string
  dossierStatut: string
  userRole: string
  user: { id: string; nom?: string } | null
  utilisateurs: { id: string; role: string; prenom: string; nom: string }[]
  isAdmin: boolean
  isInspector: boolean
  canManage: boolean
  canFeedback: boolean
  onFeedback: (assignmentId: string, message: string) => void
  onReassignStart: (assignmentId: string) => void
  onReassignConfirm: () => void
  onReassignCancel: () => void
  reassignTarget: { id: string; nom: string } | null
  reassignMotif: string
  setReassignTarget: (t: { id: string; nom: string } | null) => void
  setReassignMotif: (m: string) => void
  isReassigning: boolean
  onEvaluer: (assignmentId: string, decision: 'valide' | 'retour', commentaire: string) => void
}

const AssignmentCard = memo(function AssignmentCard({
  assignment: a, dossierId, dossierStatut, userRole, user, utilisateurs,
  isAdmin, isInspector, canManage, canFeedback,
  onFeedback, onReassignStart, onReassignConfirm, onReassignCancel,
  reassignTarget, reassignMotif, setReassignTarget, setReassignMotif, isReassigning,
  onEvaluer,
}: AssignmentCardProps) {
  const updateAssignment = useAppStore(s => s.updateAssignment)
  const accuserReceptionAssignment = useAppStore(s => s.accuserReceptionAssignment)

  const [localProgression, setLocalProgression] = useState<number>(a.progression)
  const [showAccuseId, setShowAccuseId] = useState(false)
  const [commentaireAccuse, setCommentaireAccuse] = useState('')
  const [preuvesFiles, setPreuvesFiles] = useState<File[]>([])
  const [preuveError, setPreuveError] = useState('')
  const [fbText, setFbText] = useState('')
  const [evalComment, setEvalComment] = useState('')

  const isOwn = user?.id === a.inspecteur_id && userRole === 'inspector'

  useEffect(() => { setLocalProgression(a.progression) }, [a.progression])

  const handleAccuserReception = () => {
    accuserReceptionAssignment(dossierId, a.id, commentaireAccuse)
    setShowAccuseId(false)
    setCommentaireAccuse('')
  }

  const handleProgressionChange = (val: number) => {
    if (val === 100 && preuvesFiles.length === 0) {
      setPreuveError('Veuillez joindre au moins un fichier comme preuve')
      return
    }
    setPreuveError('')
    setLocalProgression(val)
    const statut = val === 100 ? 'termine' as const : (val > 0 ? 'en_cours' as const : a.statut)
    updateAssignment(dossierId, a.id, {
      progression: val as 0 | 25 | 50 | 75 | 100,
      statut: val === 100 && a.statut !== 'termine' ? 'en_validation' : statut,
      historique: [...a.historique, {
        date: new Date().toISOString(),
        action: val === 100 ? 'Travail terminé, en attente de validation' : `Progression: ${val}%`,
        details: '',
      }],
    })
  }

  const handlePreuvesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    setPreuvesFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }

  const handleRemovePreuve = (index: number) => {
    setPreuvesFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmitPreuves = async () => {
    if (preuvesFiles.length === 0) return
    const newPreuves = await Promise.all(preuvesFiles.map(async f => ({
      nom: f.name,
      url: await uploadPreuveFile(f, dossierId, a.id),
      taille: f.size,
      type: f.type,
      date_upload: new Date().toISOString(),
    })))
    updateAssignment(dossierId, a.id, {
      preuves: [...a.preuves, ...newPreuves],
      historique: [...a.historique, { date: new Date().toISOString(), action: `${preuvesFiles.length} preuve(s) soumise(s)`, details: preuvesFiles.map(f => f.name).join(', ') }],
    })
    setPreuvesFiles([])
  }

  const isTerminated = dossierStatut === 'termine' || dossierStatut === 'archive'

  return (
    <div key={a.id} className="border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-role-primary text-white flex items-center justify-center text-[10px] font-bold">
            {String(a.inspecteur_nom).split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
          </div>
          <span className="font-medium text-sm">{a.inspecteur_nom}</span>
        </div>
        <span className={`${a.statut === 'termine' || a.statut === 'valide' ? 'badge success' : a.statut === 'accuse' || a.statut === 'en_cours' ? 'badge primary' : 'badge neutral'} text-xs`}>
          {a.statut.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className="progress flex-1 h-1.5">
          <div className="progress-bar" style={{ width: `${localProgression}%` }} />
        </div>
        <span className="text-xs font-medium">{localProgression}%</span>
      </div>

      {isOwn && a.statut === 'attribue' && (
        showAccuseId ? (
          <div className="space-y-1 p-2 bg-role-primary-soft rounded-lg">
            <p className="text-xs font-medium">Accuser réception du dossier</p>
            <textarea value={commentaireAccuse}
              onChange={e => setCommentaireAccuse(e.target.value)}
              placeholder="Commentaire (optionnel)..." className="form-textarea text-xs" rows={2} />
            <div className="flex gap-1">
              <button onClick={() => { setShowAccuseId(false); setCommentaireAccuse('') }} className="btn btn-ghost btn-xs">Annuler</button>
              <button onClick={handleAccuserReception} className="btn btn-primary btn-xs">Confirmer</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAccuseId(true)} className="btn btn-primary btn-xs w-full gap-1">
            <CheckCircle2 className="w-3 h-3" /> Accuser réception
          </button>
        )
      )}

      {isOwn && a.statut !== 'termine' && a.statut !== 'valide' && !isTerminated && (
        <div className="space-y-1">
          <div className="flex justify-between gap-1">
            {[0, 25, 50, 75, 100].map(val => (
              <button key={val} type="button"
                onClick={() => handleProgressionChange(val)}
                className={`flex-1 text-[10px] py-1 rounded font-medium transition-all ${
                  localProgression === val ? 'btn-primary shadow-md' : 'btn-secondary'
                }`}
              >
                {val}%
              </button>
            ))}
          </div>
          {preuveError && <p className="text-[10px] text-danger">{preuveError}</p>}
          {localProgression === 100 && (
            <>
              {a.preuves.length === 0 && preuvesFiles.length === 0 ? (
                <div className="border border-dashed border-border rounded-lg p-2">
                  <input type="file" multiple onChange={handlePreuvesUpload}
                    className="hidden" id={`preuves-${a.id}`}
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" />
                  <label htmlFor={`preuves-${a.id}`} className="cursor-pointer flex items-center gap-2 text-xs text-muted-foreground">
                    <Upload className="w-4 h-4" /> Ajouter des fichiers
                  </label>
                </div>
              ) : null}
              {preuvesFiles.length > 0 && (
                <div className="space-y-1">
                  {preuvesFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between bg-role-primary-soft rounded px-2 py-1 text-[10px]">
                      <span className="truncate flex-1">{f.name}</span>
                      <button onClick={() => handleRemovePreuve(i)} className="btn btn-ghost btn-xs text-danger p-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button onClick={handleSubmitPreuves} className="btn btn-primary btn-xs w-full gap-1">
                    <Upload className="w-3 h-3" /> Soumettre {preuvesFiles.length} fichier(s)
                  </button>
                </div>
              )}
              {a.preuves.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-success">Preuves ({a.preuves.length})</p>
                  {a.preuves.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-1 text-[10px]">
                      <FileText className="w-3 h-3 text-success shrink-0" />
                      <span className="flex-1 truncate">{p.nom}</span>
                      <a href={p.url} download={p.nom} className="btn btn-ghost btn-xs p-0">
                        <Download className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {canFeedback && (
        <div className="flex gap-1">
          <input value={fbText}
            onChange={e => setFbText(e.target.value)}
            placeholder={`Feedback pour ${a.inspecteur_nom}...`}
            className="form-input text-xs flex-1" />
          <button onClick={() => { if (fbText.trim()) { onFeedback(a.id, fbText); setFbText('') } }}
            disabled={!fbText.trim()}
            className="btn btn-primary btn-xs gap-1">
            <Send className="w-3 h-3" /> Envoyer
          </button>
        </div>
      )}

      {canManage && a.statut === 'en_validation' && a.progression === 100 && !isTerminated && (
        <div className="space-y-1 p-2 bg-success-soft/50 rounded-lg border border-success/30">
          <p className="text-xs font-semibold flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-success" /> Évaluation du travail inspecteur
          </p>
          <textarea value={evalComment}
            onChange={e => setEvalComment(e.target.value)}
            placeholder="Avis du chef (optionnel)..."
            className="form-textarea text-xs" rows={2} />
          <div className="flex gap-1">
            <button onClick={() => { onEvaluer(a.id, 'valide', evalComment); setEvalComment('') }}
              className="btn btn-success btn-xs flex-1 gap-1">
              <CheckCircle2 className="w-3 h-3" /> Valider
            </button>
            <button onClick={() => { onEvaluer(a.id, 'retour', evalComment); setEvalComment('') }}
              className="btn btn-warning btn-xs flex-1 gap-1">
              <RotateCcw className="w-3 h-3" /> Retourner
            </button>
          </div>
        </div>
      )}

      {canManage && a.statut !== 'termine' && a.statut !== 'valide' && !isTerminated && (
        <div className="pt-1">
          {isReassigning ? (
            <div className="flex gap-1 items-center">
              <select value={reassignTarget?.id || ''}
                onChange={e => {
                  const u = utilisateurs?.find(u => u.id === e.target.value)
                  setReassignTarget(u ? { id: u.id, nom: `${u.prenom} ${u.nom}` } : null)
                }}
                className="form-select text-xs flex-1" style={{ backgroundPosition: 'right 0.4rem center' }}>
                <option value="">Nouvel inspecteur...</option>
                {utilisateurs?.filter(u => ['inspector', 'admin'].includes(u.role) && u.id !== a.inspecteur_id).map(u => (
                  <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                ))}
              </select>
              <input value={reassignMotif}
                onChange={e => setReassignMotif(e.target.value)}
                placeholder="Motif..." className="form-input text-xs flex-1" />
              <button onClick={onReassignConfirm} disabled={!reassignTarget || !reassignMotif.trim()}
                className="btn btn-warning btn-xs gap-1">
                <User className="w-3 h-3" /> Réassigner
              </button>
              <button onClick={onReassignCancel} className="btn btn-ghost btn-xs">Annuler</button>
            </div>
          ) : (
            <button onClick={() => onReassignStart(a.id)}
              className="btn btn-ghost btn-xs text-warning gap-1">
              <User className="w-3 h-3" /> Réassigner
            </button>
          )}
        </div>
      )}

      {(canManage || isInspector) && a.feedbacks.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-border">
          {a.feedbacks.map((fb: any, i: number) => (
            <div key={i} className={`text-xs p-2 rounded-lg ${fb.role === 'chef' ? 'bg-primary-soft' : 'bg-role-primary-soft/50'}`}>
              <span className="font-semibold">{fb.auteur_nom}</span>
              <span className="text-muted-foreground"> — {fb.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

interface DetailsModalProps {
  dossier: Dossier | null
  open: boolean
  onClose: () => void
  userRole: string
  user: { id: string; nom?: string } | null
  utilisateurs: { id: string; role: string; prenom: string; nom: string }[]
  onRequestExtend: () => void
  onTraiterExtension?: (dossierId: string, extensionIndex: number, statut: 'approuve' | 'refuse') => void
  onAddFeedback: (dossierId: string, assignmentId: string, feedback: {
    auteur_id: string
    auteur_nom: string
    role: 'chef'
    type: 'info'
    message: string
  }) => void
  onReassign: (dossierId: string, assignmentId: string, newInspectorId: string, newInspectorNom: string, motif: string) => void
}

export default function DetailsModal({
  dossier: d,
  open,
  onClose,
  userRole,
  user,
  utilisateurs,
  onRequestExtend,
  onTraiterExtension,
  onAddFeedback,
  onReassign,
}: DetailsModalProps) {
  const [reassignTarget, setReassignTarget] = useState<{ id: string; nom: string } | null>(null)
  const [reassignMotif, setReassignMotif] = useState('')
  const [reassignDossierId, setReassignDossierId] = useState('')
  const [reassignAssignmentId, setReassignAssignmentId] = useState('')
  const [analysingFile, setAnalysingFile] = useState<string | null>(null)
  const enregistrerAnalyseIA = useAppStore(s => s.enregistrerAnalyseIA)
  const evaluerTravailInspecteur = useAppStore(s => s.evaluerTravailInspecteur)

  const handleAnalyserFichier = async (f: { nom: string; url: string }) => {
    if (!d || analysingFile) return
    setAnalysingFile(f.nom)
    try {
      const analyse = await kitDocAgent.analyserDocumentDossier({
        nomFichier: f.nom,
        titre: d.titre,
        categorie: d.categorie,
        instructions: d.instructions,
        fichierUrl: f.url,
        aerodromeId: d.aerodrome_id,
      })
      await enregistrerAnalyseIA(d.id, f.nom, analyse)
    } catch (e) {
      console.error('Erreur analyse IA document:', e)
    } finally {
      setAnalysingFile(null)
    }
  }

  const handleEvaluer = (assignmentId: string, decision: 'valide' | 'retour', commentaire: string) => {
    if (!d) return
    evaluerTravailInspecteur(d.id, assignmentId, decision, commentaire)
  }

  const handleReassign = () => {
    if (!reassignTarget || !reassignMotif.trim() || !reassignDossierId || !reassignAssignmentId) return
    onReassign(reassignDossierId, reassignAssignmentId, reassignTarget.id, reassignTarget.nom, reassignMotif)
    setReassignTarget(null)
    setReassignMotif('')
    setReassignDossierId('')
    setReassignAssignmentId('')
  }

  const handleFeedback = (assignmentId: string, message: string) => {
    if (!d || !message.trim()) return
    onAddFeedback(d.id, assignmentId, {
      auteur_id: user?.id || '',
      auteur_nom: user?.nom || 'Chef',
      role: 'chef',
      type: 'info',
      message,
    })
  }

  const isAdmin = userRole === 'admin'
  const isInspector = userRole === 'inspector'
  const canManage = isAdmin
  const canFeedback = isAdmin
  const canRequestExtend = isInspector

  return (
    <FormShell
      open={open}
      onClose={onClose}
      title={`Détails — ${d?.reference || ''}`}
      icon={FolderOpen}
      size="4xl"
      dataRole={userRole}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
      }
    >
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Référence', value: d?.reference },
            { label: 'Catégorie', value: CATEGORIES_DOSSIERS.find(c => c.id === d?.categorie)?.label },
            { label: 'Date création', value: d?.created_at && new Date(d.created_at).toLocaleDateString('fr-FR') },
            { label: 'Date limite', value: d?.date_limite && new Date(d.date_limite).toLocaleDateString('fr-FR') },
          ].map(row => (
            <div key={row.label}>
              <p className="text-xs text-muted-foreground">{row.label}</p>
              <p className="font-medium">{row.value || '—'}</p>
            </div>
          ))}
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Titre</p>
            <p className="font-medium">{d?.titre}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Statut</p>
            <span className={getCouleurStatut(d?.statut || '')}>{getLibelleStatut(d?.statut || '')}</span>
          </div>
        </div>

        {d?.instructions && (
          <div>
            <p className="text-xs font-semibold text-role-primary uppercase mb-1">Instructions</p>
            <p className="text-sm bg-role-primary-soft/30 p-3 rounded-lg">{d.instructions}</p>
          </div>
        )}

        {d?.fichiers && d.fichiers.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-role-primary uppercase flex items-center gap-1 mb-2">
              <FileText className="w-3 h-3" /> Fichiers joints ({d.fichiers.length})
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {d.fichiers.map((f, i) => {
                const analyse = d.analyses_ia?.[f.nom]
                return (
                  <div key={i} className="border border-border rounded-lg p-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <FileText className="w-4 h-4 shrink-0 text-role-primary" />
                      <span className="flex-1 truncate">{f.nom}</span>
                      <span className="text-muted-foreground shrink-0">{(f.taille / 1024).toFixed(0)} Ko</span>
                      <a href={f.url} target="_blank" rel="noopener noreferrer"
                        className="btn btn-ghost btn-xs shrink-0" title="Visualiser">
                        <Eye className="w-3 h-3" />
                      </a>
                      <a href={f.url} download={f.nom}
                        className="btn btn-ghost btn-xs shrink-0" title="Télécharger">
                        <Download className="w-3 h-3" />
                      </a>
                    </div>
                    <button
                      onClick={() => handleAnalyserFichier(f)}
                      disabled={!!analysingFile}
                      className="btn btn-ghost btn-xs gap-1 border border-border w-full"
                      title="Évaluer le document par l'agent AERORISQ (score, critères, réserves)"
                    >
                      {analysingFile === f.nom
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Brain className="w-3 h-3 text-role-primary" />}
                      {analysingFile === f.nom ? 'Analyse en cours...' : 'Analyser par IA'}
                    </button>
                    {analyse && <AnalyseResultPanel analyse={analyse} />}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {d && (
          <ChecklistTraitementSection dossier={d} />
        )}

        {d && (
          <FormulairesSection dossier={d} canManage={canManage} />
        )}

        {d?.assignments && d.assignments.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-role-primary uppercase flex items-center gap-1">
              <User className="w-3 h-3" /> Assignations ({d.assignments.length})
            </p>
            {d.assignments.map(a => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                dossierId={d.id}
                dossierStatut={d.statut}
                userRole={userRole}
                user={user}
                utilisateurs={utilisateurs}
                isAdmin={isAdmin}
                isInspector={isInspector}
                canManage={canManage}
                canFeedback={canFeedback}
                onFeedback={handleFeedback}
                onReassignStart={(aid) => { setReassignAssignmentId(aid); setReassignDossierId(d.id) }}
                onReassignConfirm={handleReassign}
                onReassignCancel={() => { setReassignAssignmentId(''); setReassignDossierId('') }}
                reassignTarget={reassignTarget}
                reassignMotif={reassignMotif}
                setReassignTarget={setReassignTarget}
                setReassignMotif={setReassignMotif}
                isReassigning={reassignAssignmentId === a.id && reassignDossierId === d.id}
                onEvaluer={handleEvaluer}
              />
            ))}
          </div>
        )}

        {canRequestExtend && d && d.statut !== 'termine' && d.statut !== 'archive' && (
          <div className="pt-2">
            <button onClick={onRequestExtend}
              className="btn btn-sm gap-1.5" style={{ background: '#f59e0b', color: 'white' }}>
              <Clock className="w-3.5 h-3.5" />
              Demander une extension de délai
            </button>
          </div>
        )}
        {d?.extensions && d.extensions.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-role-primary uppercase">Extensions de délai</p>
            {d.extensions.map((ext, i) => {
              const statutLabel = ext.statut === 'approuve' ? 'Approuvée' : ext.statut === 'refuse' ? 'Refusée' : 'En attente'
              const statutClass = ext.statut === 'approuve' ? 'badge success' : ext.statut === 'refuse' ? 'badge danger' : 'badge warning'
              return (
                <div key={i} className="flex items-center justify-between p-2 bg-warning/10 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <span>+{ext.jours} jours — {ext.motif}</span>
                    <span className={statutClass}>{statutLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{new Date(ext.date).toLocaleDateString('fr-FR')}</span>
                    {canManage && ext.statut === 'en_attente' && d && d.statut !== 'termine' && d.statut !== 'archive' && (
                      <div className="flex gap-1">
                        <button onClick={() => onTraiterExtension?.(d.id, i, 'approuve')}
                          className="btn btn-success btn-xs gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Approuver
                        </button>
                        <button onClick={() => onTraiterExtension?.(d.id, i, 'refuse')}
                          className="btn btn-danger btn-xs gap-1">
                          <X className="w-3 h-3" /> Refuser
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </FormShell>
  )
}
