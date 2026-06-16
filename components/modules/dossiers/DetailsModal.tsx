// components/modules/dossiers/DetailsModal.tsx
'use client'

import React, { useState, memo, useEffect } from 'react'
import { FolderOpen, User, Send, Clock, FileText, Download, CheckCircle2, Upload, X } from 'lucide-react'
import { FormShell } from '@/components/ui/FormShell'
import { useAppStore, type Dossier } from '@/lib/store'

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

interface AssignmentCardProps {
  assignment: any
  dossierId: string
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
}

const AssignmentCard = memo(function AssignmentCard({
  assignment: a, dossierId, userRole, user, utilisateurs,
  isAdmin, isInspector, canManage, canFeedback,
  onFeedback, onReassignStart, onReassignConfirm, onReassignCancel,
  reassignTarget, reassignMotif, setReassignTarget, setReassignMotif, isReassigning,
}: AssignmentCardProps) {
  const updateAssignment = useAppStore(s => s.updateAssignment)
  const accuserReceptionAssignment = useAppStore(s => s.accuserReceptionAssignment)

  const [localProgression, setLocalProgression] = useState<number>(a.progression)
  const [showAccuseId, setShowAccuseId] = useState(false)
  const [commentaireAccuse, setCommentaireAccuse] = useState('')
  const [preuvesFiles, setPreuvesFiles] = useState<File[]>([])
  const [preuveError, setPreuveError] = useState('')
  const [fbText, setFbText] = useState('')

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

  const handleSubmitPreuves = () => {
    if (preuvesFiles.length === 0) return
    const newPreuves = preuvesFiles.map(f => ({
      nom: f.name, url: URL.createObjectURL(f), taille: f.size, type: f.type, date_upload: new Date().toISOString(),
    }))
    updateAssignment(dossierId, a.id, {
      preuves: [...a.preuves, ...newPreuves],
      historique: [...a.historique, { date: new Date().toISOString(), action: `${preuvesFiles.length} preuve(s) soumise(s)`, details: preuvesFiles.map(f => f.name).join(', ') }],
    })
    setPreuvesFiles([])
  }

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

      {isOwn && a.statut !== 'termine' && a.statut !== 'valide' && (
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

      {canManage && a.statut !== 'termine' && a.statut !== 'valide' && (
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
              {d.fichiers.map((f, i) => (
                <div key={i} className="flex items-center gap-2 p-2 border border-border rounded-lg text-xs">
                  <FileText className="w-4 h-4 shrink-0 text-role-primary" />
                  <span className="flex-1 truncate">{f.nom}</span>
                  <span className="text-muted-foreground shrink-0">{(f.taille / 1024).toFixed(0)} Ko</span>
                  <a href={f.url} target="_blank" rel="noopener noreferrer"
                    className="btn btn-ghost btn-xs shrink-0 gap-1">
                    <Download className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
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
                    {canManage && ext.statut === 'en_attente' && d && (
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
