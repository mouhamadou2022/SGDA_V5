// components/modules/certification/AssignationInstruction.tsx
// Étape 2 unification workflow : équipe d'instruction désignée UNE SEULE FOIS
// par dossier (modifiable), partagée par les phases.
// - Internes : responsable + chef + équipe (comptes utilisateurs, notifiés).
// - Experts externes : membres sans compte (nom + spécialité + organisme).
// - Habilitations : chef titulaire/principal EXIGÉ (bloquant), habilitations
//   expirées et couverture spécialités en avertissements.
// Partagé certification ↔ homologation (boundary homologation→certification OK).

'use client'

import React, { useState } from 'react'
import { UserCheck, Plus, X } from 'lucide-react'
import { useAppStore } from '@/lib/store'
import { canManageRole } from '@/lib/config'
import {
  verifierEquipeInstruction,
  type ExpertExterne,
  type InstructionDossier,
} from '@/lib/instructionHabilitation'

interface Props {
  type: 'certification' | 'homologation'
  dossierId: string
  phase: 1 | 2
  current: InstructionDossier
  userRole: string
  currentUserId?: string
}

const ROLES_INSTRUCTION = ['inspecteur', 'chef_inspecteur', 'admin']

export function nomUtilisateur(u: { prenom?: string; nom?: string } | undefined): string {
  if (!u) return '—'
  return `${u.prenom || ''} ${u.nom || ''}`.trim() || '—'
}

/** Vrai si l'utilisateur courant peut instruire (membre de l'équipe ou admin). */
export function peutInstruire(current: InstructionDossier, userId: string | undefined, userRole: string): boolean {
  if (canManageRole(userRole)) return true
  if (!userId) return false
  // Non assigné = ouvert (transition) ; assigné = réservé à l'équipe interne.
  const designe = [current.responsable_id, ...(current.equipe_ids || []), current.chef_id].filter(Boolean)
  if (designe.length === 0) return true
  return designe.includes(userId)
}

export function AssignationInstruction({ type, dossierId, phase, current, userRole, currentUserId }: Props) {
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const assignerCert = useAppStore(s => s.assignerInstructionCertification)
  const assignerHomo = useAppStore(s => s.assignerInstructionHomologation)
  const canAssign = canManageRole(userRole)

  const inspecteurs = (utilisateurs || []).filter(u => ROLES_INSTRUCTION.includes(u.role))
  const [responsable, setResponsable] = useState(current.responsable_id || '')
  const [chef, setChef] = useState(current.chef_id || '')
  const [equipe, setEquipe] = useState<string[]>(current.equipe_ids || [])
  const [externes, setExternes] = useState<ExpertExterne[]>(current.externes || [])
  const [nomExterne, setNomExterne] = useState('')
  const [specExterne, setSpecExterne] = useState('')

  // Resynchroniser quand on ouvre un autre dossier.
  const cleDossier = `${type}-${dossierId}`
  const [dernierDossier, setDernierDossier] = useState(cleDossier)
  if (dernierDossier !== cleDossier) {
    setDernierDossier(cleDossier)
    setResponsable(current.responsable_id || '')
    setChef(current.chef_id || '')
    setEquipe(current.equipe_ids || [])
    setExternes(current.externes || [])
  }

  const toggleMembre = (id: string) =>
    setEquipe(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const ajouterExterne = () => {
    const nom = nomExterne.trim()
    if (!nom) return
    setExternes(prev => [...prev, {
      id: `ext-${Date.now().toString(36)}`,
      nom,
      specialite: specExterne.trim() || undefined,
    }])
    setNomExterne('')
    setSpecExterne('')
  }

  // Vérification habilitations en direct sur la sélection courante.
  const membresSelectionnes = inspecteurs.filter(u =>
    u.id === responsable || u.id === chef || equipe.includes(u.id))
  const verification = verifierEquipeInstruction(membresSelectionnes, chef || undefined, externes.length)
  const peutAssigner = canAssign && verification.blocages.length === 0 &&
    (responsable !== '' || chef !== '' || equipe.length > 0 || externes.length > 0)

  const assigner = () => {
    if (!peutAssigner) return
    const payload = {
      responsable_id: responsable || undefined,
      equipe_ids: equipe,
      chef_id: chef || undefined,
      externes,
    }
    if (type === 'certification') assignerCert(dossierId, phase, payload)
    else assignerHomo(dossierId, payload)
  }

  const nomDe = (id?: string) => nomUtilisateur(inspecteurs.find(u => u.id === id))
  const assignee = (current.responsable_id || '') !== '' || (current.equipe_ids || []).length > 0 ||
    (current.chef_id || '') !== '' || (current.externes || []).length > 0

  return (
    <div className="p-3 rounded-xl border border-border bg-card">
      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5" /> Équipe d’instruction du dossier
        {assignee ? (
          <span className="badge success text-[10px] ml-auto">Désignée</span>
        ) : (
          <span className="badge warning text-[10px] ml-auto">À désigner (une fois)</span>
        )}
      </p>

      {canAssign ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-muted-foreground">Inspecteur responsable</span>
              <select
                value={responsable}
                onChange={e => setResponsable(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
              >
                <option value="">— Choisir —</option>
                {inspecteurs.map(u => (
                  <option key={u.id} value={u.id}>{nomUtilisateur(u)} ({u.role})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-muted-foreground">Chef d’équipe (titulaire/principal exigé)</span>
              <select
                value={chef}
                onChange={e => setChef(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
              >
                <option value="">— Choisir —</option>
                {inspecteurs.map(u => (
                  <option key={u.id} value={u.id}>{nomUtilisateur(u)} ({u.role})</option>
                ))}
              </select>
            </label>
          </div>
          {inspecteurs.length > 0 && (
            <div>
              <span className="text-[11px] text-muted-foreground">Équipe interne (optionnel)</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {inspecteurs.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMembre(u.id)}
                    title={`${nomUtilisateur(u)} — ${u.role}${(u.specialites || []).length > 0 ? ` — ${(u.specialites || []).join(', ')}` : ''}`}
                    className={`px-2 py-1 rounded-full border text-[11px] transition-colors ${
                      equipe.includes(u.id)
                        ? 'bg-role-primary text-white border-role-primary'
                        : 'border-border text-foreground/70 hover:border-role-primary/40'
                    }`}
                  >
                    {nomUtilisateur(u)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="text-[11px] text-muted-foreground">Experts externes (sans compte — membres à part entière)</span>
            <div className="mt-1 flex gap-1.5">
              <input
                value={nomExterne}
                onChange={e => setNomExterne(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterExterne() } }}
                placeholder="Nom de l’expert"
                className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
              />
              <input
                value={specExterne}
                onChange={e => setSpecExterne(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterExterne() } }}
                placeholder="Spécialité (optionnel)"
                className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
              />
              <button type="button" onClick={ajouterExterne} className="btn btn-sm btn-secondary gap-1">
                <Plus className="w-3.5 h-3.5" /> Ajouter
              </button>
            </div>
            {externes.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {externes.map(x => (
                  <span key={x.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-warning/40 bg-warning/10 text-[11px]">
                    {x.nom}{x.specialite ? ` (${x.specialite})` : ''}
                    <button type="button" onClick={() => setExternes(prev => prev.filter(e => e.id !== x.id))} title="Retirer">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {verification.blocages.length > 0 && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-[11px] text-foreground">
              {verification.blocages.map((b, i) => <p key={i}>⛔ {b}</p>)}
            </div>
          )}
          {verification.avertissements.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-2 text-[11px] text-foreground">
              {verification.avertissements.map((b, i) => <p key={i}>⚠ {b}</p>)}
            </div>
          )}

          <button
            type="button"
            onClick={assigner}
            disabled={!peutAssigner}
            title={verification.blocages.length > 0 ? verification.blocages[0] : 'Désigner ou modifier l’équipe (une seule fois par dossier)'}
            className="btn btn-sm btn-primary gap-1.5 disabled:opacity-50"
          >
            <UserCheck className="w-3.5 h-3.5" /> {assignee ? 'Modifier l’équipe' : 'Désigner l’équipe'}
          </button>
          {current.assigne_le && (
            <p className="text-[11px] text-muted-foreground">
              Équipe en place depuis le {new Date(current.assigne_le).toLocaleDateString('fr-FR')}
              {current.assigne_par ? ` (${current.assigne_par})` : ''}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-foreground">
          {assignee ? (
            <>Instruit par <strong>{nomDe(current.responsable_id)}</strong>
              {current.chef_id ? <> · chef : <strong>{nomDe(current.chef_id)}</strong></> : null}
              {(current.equipe_ids || []).length > 0 ? <> · équipe : {(current.equipe_ids || []).map(nomDe).join(', ')}</> : null}
              {(current.externes || []).length > 0 ? <> · experts : {(current.externes || []).map(x => x.nom).join(', ')}</> : null}.</>
          ) : (
            'En attente de désignation par l’administrateur.'
          )}
        </p>
      )}
    </div>
  )
}

export default AssignationInstruction
