// components/modules/utilisateurs/DemandesAccesPanel.tsx
// Gestion des demandes d'accès au système (bouton "Demander un accès"
// du dashboard Invité). Réservé aux rôles admin / dg_anacim.
// Consulte les demandes, les marque en traitement / traitées / rejetées,
// et permet de créer un compte pour le demandeur.

'use client'

import React, { useState, useCallback, useEffect } from 'react'
import {
  Inbox,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  Mail,
  Building2,
  FileText,
  Loader2,
  AlertCircle,
} from 'lucide-react'

interface DemandeAcces {
  id: string
  nom: string
  email: string
  structure?: string | null
  type_demande?: string
  message?: string | null
  statut: 'nouveau' | 'en_traitement' | 'traitee' | 'rejetee'
  note_traitement?: string | null
  traitee_le?: string | null
  created_at: string
}

const STATUT_LABELS: Record<DemandeAcces['statut'], string> = {
  nouveau: 'Nouvelle',
  en_traitement: 'En traitement',
  traitee: 'Traitée',
  rejetee: 'Rejetée',
}

const STATUT_CLASSES: Record<DemandeAcces['statut'], string> = {
  nouveau: 'badge danger',
  en_traitement: 'badge warning',
  traitee: 'badge success',
  rejetee: 'badge neutral',
}

export function DemandesAccesPanel() {
  const [demandes, setDemandes] = useState<DemandeAcces[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'toutes' | DemandeAcces['statut']>('toutes')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/demandes-acces', { method: 'GET', cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Impossible de charger les demandes.')
        setDemandes([])
        return
      }
      setDemandes(Array.isArray(body.demandes) ? body.demandes : [])
    } catch {
      setError('Connexion impossible. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const updateStatut = useCallback(async (id: string, statut: DemandeAcces['statut']) => {
    setUpdatingId(id)
    setError('')
    try {
      const res = await fetch('/api/auth/demandes-acces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, statut }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Impossible de mettre à jour la demande.')
        return
      }
      setDemandes(prev => prev.map(d => d.id === id ? { ...d, statut, traitee_le: new Date().toISOString() } : d))
    } catch {
      setError('Connexion impossible. Veuillez réessayer.')
    } finally {
      setUpdatingId(null)
    }
  }, [])

  const demandesFiltrees = filter === 'toutes' ? demandes : demandes.filter(d => d.statut === filter)
  const nbNouvelles = demandes.filter(d => d.statut === 'nouveau').length

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center shadow-role-glow">
            <Inbox className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              Demandes d&apos;accès
              {nbNouvelles > 0 && <span className="badge danger text-[10px]">{nbNouvelles} nouvelle{nbNouvelles > 1 ? 's' : ''}</span>}
            </h3>
            <p className="text-xs text-muted-foreground">
              Demandes soumises depuis le portail public — créez un compte pour les accepter.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="h-9 px-3 pr-8 rounded-lg border border-border bg-background text-sm text-foreground cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-role-primary/40"
          >
            <option value="toutes">Tous les statuts</option>
            <option value="nouveau">Nouvelles</option>
            <option value="en_traitement">En traitement</option>
            <option value="traitee">Traitées</option>
            <option value="rejetee">Rejetées</option>
          </select>
          <button onClick={load} disabled={loading} className="btn btn-ghost gap-2 text-sm disabled:opacity-50" title="Actualiser">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-sm text-danger flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-role-primary" />
          Chargement des demandes…
        </div>
      ) : demandesFiltrees.length === 0 ? (
        <div className="text-center py-10 rounded-xl bg-muted/20 border border-dashed border-border">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aucune demande d&apos;accès pour le moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {demandesFiltrees.map(d => (
            <div key={d.id} className="rounded-xl border border-border bg-background p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground text-sm">{d.nom}</p>
                    <span className={STATUT_CLASSES[d.statut]}>{STATUT_LABELS[d.statut]}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{d.email}</span>
                    {d.structure && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{d.structure}</span>}
                    {d.type_demande && <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{d.type_demande}</span>}
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(d.created_at).toLocaleString('fr-FR')}</span>
                  </div>
                  {d.message && (
                    <p className="text-xs text-foreground/80 bg-muted/30 rounded-lg p-2 mt-1">{d.message}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {updatingId === d.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-role-primary" />
                  ) : d.statut !== 'traitee' && d.statut !== 'rejetee' ? (
                    <>
                      <a
                        href={`mailto:${d.email}?subject=${encodeURIComponent('Votre demande d\u2019accès au système SGDA ANACIM')}&body=${encodeURIComponent('Bonjour ' + d.nom + ',\n\nSuite à votre demande d\u2019accès au système SGDA, veuillez trouver ci-joint les informations de connexion.\n\nCordialement,\nANACIM')}`}
                        className="btn btn-ghost gap-2 text-sm"
                        title="Contacter par email"
                      >
                        <Mail className="w-4 h-4" />
                        Contacter
                      </a>
                      <button
                        onClick={() => updateStatut(d.id, 'traitee')}
                        className="btn btn-success gap-2 text-sm"
                        title="Marquer comme traitée"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Traiter
                      </button>
                      <button
                        onClick={() => updateStatut(d.id, 'rejetee')}
                        className="btn btn-secondary gap-2 text-sm"
                        title="Rejeter la demande"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeter
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => updateStatut(d.id, 'nouveau')}
                      className="btn btn-ghost gap-2 text-sm"
                      title="Rouvrir la demande"
                    >
                      Rouvrir
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DemandesAccesPanel
