'use client'

import { useState, useMemo } from 'react'
import {
  FolderOpen, CheckCircle2, Clock, AlertCircle, AlertTriangle,
  User, FileText, Upload, X, Send, MessageSquare, Plus, Eye, Download,
} from 'lucide-react'
import { useAppStore, type Dossier, type DossierAssignment } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { dossierUtils } from '@/lib/dossierUtils'

interface AssignmentExecutionViewProps {
  dossier: Dossier
  assignment: DossierAssignment
  userRole: string
  onClose: () => void
}

const PROGRESSION_STEPS = [0, 25, 50, 75, 100] as const
const LABEL_STATUT: Record<string, string> = {
  attribue: 'Attribué', accuse: 'Accusé réception', en_cours: 'En cours',
  en_validation: 'En validation', valide: 'Validé', termine: 'Terminé',
}
const BADGE_STATUT: Record<string, string> = {
  attribue: 'badge neutral', accuse: 'badge primary', en_cours: 'badge warning',
  en_validation: 'badge warning', valide: 'badge success', termine: 'badge success',
}

export function AssignmentExecutionView({ dossier, assignment, userRole, onClose }: AssignmentExecutionViewProps) {
  const updateAssignment = useAppStore(s => s.updateAssignment)
  const accuserReceptionAssignment = useAppStore(s => s.accuserReceptionAssignment)
  const addAssignmentFeedback = useAppStore(s => s.addAssignmentFeedback)
  const addAssignmentCollaborateur = useAppStore(s => s.addAssignmentCollaborateur)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const user = useAppStore(s => s.user)

  const [activeTab, setActiveTab] = useState<'travail' | 'feedbacks' | 'preuves'>('travail')
  const [commentaireAccuse, setCommentaireAccuse] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const [feedbackType, setFeedbackType] = useState<'info' | 'retour_travail'>('retour_travail')
  const [collabInspecteurId, setCollabInspecteurId] = useState('')
  const [collabMotif, setCollabMotif] = useState('')
  const [preuvesFiles, setPreuvesFiles] = useState<File[]>([])
  const [showAccuse, setShowAccuse] = useState(false)

  const delai = useMemo(() => {
    const { jours } = dossierUtils.getDelaiRestant(dossier.date_limite)
    const variant = jours < 0 ? 'danger' : jours < 3 ? 'danger' : jours < 7 ? 'warning' : 'success'
    return { jours, variant }
  }, [dossier.date_limite])

  const inspecteursDisponibles = utilisateurs?.filter((u: any) =>
    ['inspector', 'admin'].includes(u.role) && u.id !== assignment.inspecteur_id
  ) || []

  const handleAccuserReception = () => {
    accuserReceptionAssignment(dossier.id, assignment.id, commentaireAccuse)
    setShowAccuse(false)
    setCommentaireAccuse('')
  }

  const handleProgressionChange = (val: number) => {
    const statut = val === 100 ? 'termine' as const : (val > 0 ? 'en_cours' as const : assignment.statut)
    updateAssignment(dossier.id, assignment.id, {
      progression: val as 0 | 25 | 50 | 75 | 100,
      statut: val === 100 && assignment.statut !== 'termine' ? 'en_validation' : statut,
      historique: [...assignment.historique, {
        date: new Date().toISOString(),
        action: val === 100 ? 'Travail terminé, en attente de validation' : `Progression: ${val}%`,
        details: '',
      }],
    })
  }

  const handleSendFeedback = () => {
    if (!feedbackMsg.trim()) return
    addAssignmentFeedback(dossier.id, assignment.id, {
      auteur_id: user?.id || assignment.inspecteur_id,
      auteur_nom: user?.nom || assignment.inspecteur_nom,
      role: 'inspecteur',
      type: feedbackType,
      message: feedbackMsg,
    })
    setFeedbackMsg('')
  }

  const handleAjouterCollaborateur = () => {
    if (!collabInspecteurId || !collabMotif.trim()) return
    const u = utilisateurs?.find((u: any) => u.id === collabInspecteurId)
    if (!u) return
    addAssignmentCollaborateur(dossier.id, assignment.id, {
      inspecteur_id: collabInspecteurId,
      inspecteur_nom: `${u.prenom} ${u.nom}`,
      motif: collabMotif,
    })
    setCollabInspecteurId('')
    setCollabMotif('')
  }

  const handlePreuvesUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    setPreuvesFiles(prev => [...prev, ...Array.from(e.target.files!)])
  }

  const handleSubmitPreuves = () => {
    if (preuvesFiles.length === 0) return
    const newPreuves = preuvesFiles.map(f => ({
      nom: f.name,
      url: URL.createObjectURL(f),
      taille: f.size,
      type: f.type,
      date_upload: new Date().toISOString(),
    }))
    updateAssignment(dossier.id, assignment.id, {
      preuves: [...assignment.preuves, ...newPreuves],
      historique: [...assignment.historique, {
        date: new Date().toISOString(),
        action: `${preuvesFiles.length} preuve(s) soumise(s)`,
        details: preuvesFiles.map(f => f.name).join(', '),
      }],
    })
    setPreuvesFiles([])
  }

  const statutLabel = LABEL_STATUT[assignment.statut] || assignment.statut
  const statutBadge = BADGE_STATUT[assignment.statut] || 'badge neutral'

  return (
    <div className="flex flex-col h-full" data-role={userRole}>
      {/* En-tête */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-5 w-5 text-role-primary" />
          <div>
            <h2 className="heading-4 font-semibold">{dossier.reference}</h2>
            <p className="text-small text-muted-foreground">{dossier.titre}</p>
          </div>
          <span className={statutBadge}>{statutLabel}</span>
          {delai.jours < 7 && assignment.statut !== 'termine' && (
            <span className="badge danger animate-pulse">
              {delai.jours < 0 ? `Expiré (${Math.abs(delai.jours)}j)` : `Urgent: ${delai.jours}j`}
            </span>
          )}
        </div>
        <button onClick={onClose} className="btn btn-ghost p-2 rounded-full">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Barre progression */}
      <div className="px-4 py-3 bg-role-primary-soft/30 border-b border-border">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-role-primary uppercase">Progression</span>
          <span className="text-sm font-bold">{assignment.progression}%</span>
        </div>
        <div className="progress h-2">
          <div className="progress-bar" style={{ width: `${assignment.progression}%` }} />
        </div>
        <div className="flex justify-between gap-2 mt-2">
          {PROGRESSION_STEPS.map(val => (
            <button key={val} type="button"
              onClick={() => handleProgressionChange(val)}
              className={`flex-1 text-xs py-1.5 rounded font-medium transition-all ${
                assignment.progression === val ? 'btn-primary shadow-md' : 'btn-secondary'
              }`}
            >
              {val}%
            </button>
          ))}
        </div>
      </div>

      {/* Onglets */}
      <div className="tabs px-4 mt-3">
        <button className={`tab ${activeTab === 'travail' ? 'active' : ''}`} onClick={() => setActiveTab('travail')}>
          <FolderOpen className="w-4 h-4 mr-1 inline" />Travail
        </button>
        <button className={`tab ${activeTab === 'feedbacks' ? 'active' : ''}`} onClick={() => setActiveTab('feedbacks')}>
          <MessageSquare className="w-4 h-4 mr-1 inline" />Feedbacks
        </button>
        <button className={`tab ${activeTab === 'preuves' ? 'active' : ''}`} onClick={() => setActiveTab('preuves')}>
          <FileText className="w-4 h-4 mr-1 inline" />Preuves
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ─── Onglet Travail ─── */}
        {activeTab === 'travail' && (
          <>
            {/* Instructions du dossier */}
            <Card icon={<FileText className="w-4 h-4 text-role-primary" />} title="Instructions">
              <p className="text-body">{dossier.instructions || 'Aucune instruction particulière'}</p>
            </Card>

            {/* Accusé réception */}
            {assignment.statut === 'attribue' && !showAccuse && (
              <button onClick={() => setShowAccuse(true)} className="btn btn-primary w-full gap-2">
                <CheckCircle2 className="w-4 h-4" /> Accuser réception
              </button>
            )}
            {showAccuse && (
              <div className="space-y-2 p-3 bg-role-primary-soft rounded-lg">
                <p className="text-sm font-medium">Accuser réception du dossier</p>
                <textarea value={commentaireAccuse}
                  onChange={e => setCommentaireAccuse(e.target.value)}
                  placeholder="Commentaire (optionnel)..."
                  className="form-textarea text-sm" rows={2}
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowAccuse(false)} className="btn btn-secondary btn-sm">Annuler</button>
                  <button onClick={handleAccuserReception} className="btn btn-primary btn-sm">Confirmer</button>
                </div>
              </div>
            )}

            {/* Collaboration */}
            {assignment.statut !== 'attribue' && assignment.statut !== 'termine' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-role-primary uppercase">Collaboration</p>
                <div className="flex gap-2">
                  <select value={collabInspecteurId}
                    onChange={e => setCollabInspecteurId(e.target.value)}
                    className="form-select text-sm flex-1" style={{ backgroundPosition: 'right 0.5rem center' }}
                  >
                    <option value="">Solliciter un collègue...</option>
                    {inspecteursDisponibles.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>
                    ))}
                  </select>
                </div>
                {collabInspecteurId && (
                  <div className="flex gap-2">
                    <input value={collabMotif}
                      onChange={e => setCollabMotif(e.target.value)}
                      placeholder="Motif de la sollicitation..."
                      className="form-input text-sm flex-1"
                    />
                    <button onClick={handleAjouterCollaborateur} disabled={!collabMotif.trim()}
                      className="btn btn-primary btn-sm gap-1">
                      <Plus className="w-3 h-3" /> Inviter
                    </button>
                  </div>
                )}
                {assignment.collaborateurs.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {assignment.collaborateurs.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground bg-role-primary-soft/50 p-2 rounded-lg">
                        <User className="w-3 h-3" />
                        <span className="font-medium">{c.inspecteur_nom}</span>
                        <span>— {c.motif}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ─── Onglet Feedbacks ─── */}
        {activeTab === 'feedbacks' && (
          <>
            {/* Envoyer un feedback */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-role-primary uppercase">Nouveau feedback</p>
              <div className="flex gap-2">
                <select value={feedbackType}
                  onChange={e => setFeedbackType(e.target.value as any)}
                  className="form-select text-sm w-44" style={{ backgroundPosition: 'right 0.5rem center' }}
                >
                  <option value="retour_travail">Retour sur le travail</option>
                  <option value="info">Information</option>
                </select>
              </div>
              <textarea value={feedbackMsg}
                onChange={e => setFeedbackMsg(e.target.value)}
                placeholder="Votre message au chef..."
                className="form-textarea text-sm" rows={3}
              />
              <button onClick={handleSendFeedback} disabled={!feedbackMsg.trim()}
                className="btn btn-primary btn-sm gap-1">
                <Send className="w-3 h-3" /> Envoyer
              </button>
            </div>

            {/* Historique des feedbacks */}
            {assignment.feedbacks.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-xs font-semibold text-role-primary uppercase">Historique des échanges</p>
                {assignment.feedbacks.map((fb, i) => (
                  <div key={i} className={`p-3 rounded-lg text-sm ${
                    fb.role === 'chef' ? 'bg-primary-soft ml-4' : 'bg-role-primary-soft mr-4'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs">{fb.auteur_nom}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(fb.date).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p>{fb.message}</p>
                    <span className="text-[10px] text-muted-foreground capitalize">{fb.type.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ─── Onglet Preuves ─── */}
        {activeTab === 'preuves' && (
          <>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input type="file" multiple onChange={handlePreuvesUpload}
                className="hidden" id="preuves-files"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              />
              <label htmlFor="preuves-files" className="cursor-pointer flex flex-col items-center gap-3">
                <Upload className="w-8 h-8 text-muted-foreground" />
                <span className="text-sm font-medium">Ajouter des preuves de traitement</span>
              </label>
            </div>

            {preuvesFiles.length > 0 && (
              <div className="space-y-2">
                {preuvesFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-role-primary-soft rounded-lg">
                    <span className="text-sm">{f.name}</span>
                    <button onClick={() => setPreuvesFiles(prev => prev.filter((_, j) => j !== i))}
                      className="btn btn-ghost btn-xs text-danger">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button onClick={handleSubmitPreuves} className="btn btn-primary btn-sm w-full gap-1">
                  <Upload className="w-3 h-3" /> Soumettre {preuvesFiles.length} preuve(s)
                </button>
              </div>
            )}

            {/* Preuves déjà soumises */}
            {assignment.preuves.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-role-primary uppercase">Preuves soumises ({assignment.preuves.length})</p>
                {assignment.preuves.map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-success/5 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-success" />
                      <span className="text-sm">{p.nom}</span>
                    </div>
                    <a href={p.url} download={p.nom} className="action-button">
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
