// components/modules/profil-risque/BulletinMensuelButton.tsx
// Bouton "Bulletin mensuel" du module Profil de Risque : génère le bulletin PDF
// (téléchargement) ou l'envoie par email aux inspecteurs / administrateurs.

'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Download, Send, Loader2, X } from 'lucide-react'
import { useAppStore, type Utilisateur } from '@/lib/store'
import { exporterBulletinMensuel, envoyerBulletinMensuelParEmail } from '@/lib/services/bulletinMensuel'

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const ROLE_ADMINS = ['admin', 'dg_anacim']
const ROLE_INSPECTEUR = 'inspector'

function emailDe(u: Utilisateur): string {
  return (u.notification_email || u.email || '').trim()
}

export function BulletinMensuelButton() {
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const addNotification = useAppStore(s => s.addNotification)
  const user = useAppStore(s => s.user)

  const [open, setOpen] = useState(false)
  const [mois, setMois] = useState(() => new Date().getMonth() + 1)
  const [annee, setAnnee] = useState(() => new Date().getFullYear())
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<'download' | 'email' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const inspecteurs = useMemo(
    () => utilisateurs.filter(u => u.role === ROLE_INSPECTEUR && !u.deleted_at && !!emailDe(u)),
    [utilisateurs],
  )
  const admins = useMemo(
    () => utilisateurs.filter(u => ROLE_ADMINS.includes(u.role) && !u.deleted_at && !!emailDe(u)),
    [utilisateurs],
  )

  const nbSelectionnes = Object.values(selected).filter(Boolean).length

  const toggleGroupe = (group: Utilisateur[], on: boolean) => {
    const next = { ...selected }
    for (const u of group) next[u.id] = on
    setSelected(next)
  }

  const reselectionnerTous = () => {
    const next: Record<string, boolean> = {}
    for (const u of [...inspecteurs, ...admins]) next[u.id] = true
    setSelected(next)
  }

  const handleOpen = () => {
    if (Object.keys(selected).length === 0) reselectionnerTous()
    setOpen(true)
    setErreur(null)
  }

  const handleDownload = async () => {
    setBusy('download')
    setErreur(null)
    try {
      await exporterBulletinMensuel(mois, annee, user ? `${user.prenom} ${user.nom}`.trim() : undefined)
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Bulletin téléchargé',
        message: `Bulletin mensuel ${MOIS_LABELS[mois - 1]} ${annee} exporté en PDF.`,
        canal: 'in_app',
      })
      setOpen(false)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur lors de l\'export PDF')
    } finally {
      setBusy(null)
    }
  }

  const handleEmail = async () => {
    const destinataires = [...inspecteurs, ...admins]
      .filter(u => selected[u.id])
      .map(emailDe)
    if (destinataires.length === 0) {
      setErreur('Sélectionnez au moins un destinataire.')
      return
    }
    setBusy('email')
    setErreur(null)
    try {
      const result = await envoyerBulletinMensuelParEmail({
        mois, annee,
        destinataires,
        redacteur: user ? `${user.prenom} ${user.nom}`.trim() : undefined,
      })
      addNotification({
        user_id: user?.id || '',
        type: 'success',
        title: 'Bulletin envoyé',
        message: `Bulletin mensuel ${MOIS_LABELS[mois - 1]} ${annee} envoyé à ${result.envoye} destinataire(s).`,
        canal: 'in_app',
      })
      setOpen(false)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur lors de l\'envoi par email')
    } finally {
      setBusy(null)
    }
  }

  const selectMois = (
    <div className="form-field">
      <select
        value={mois}
        onChange={e => setMois(Number(e.target.value))}
      >
        {MOIS_LABELS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
    </div>
  )

  const selectAnnee = (
    <div className="form-field">
      <input
        type="number"
        min={2020}
        max={2100}
        value={annee}
        onChange={e => setAnnee(Number(e.target.value))}
      />
    </div>
  )

  const rowDestinataire = (u: Utilisateur) => (
    <label
      key={u.id}
      className="flex items-center gap-2.5 p-2 rounded-lg border border-border hover:bg-muted/20 cursor-pointer"
    >
      <input
        type="checkbox"
        checked={!!selected[u.id]}
        onChange={e => setSelected(prev => ({ ...prev, [u.id]: e.target.checked }))}
        className="form-checkbox"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate">
          {[u.prenom, u.nom].filter(Boolean).join(' ') || u.email}
        </p>
        <p className="text-[10px] text-foreground/60 truncate">{emailDe(u)}</p>
      </div>
    </label>
  )

  const modal = (
    <div className="modal-overlay" onClick={() => !busy && setOpen(false)}>
      <div className="form-shell-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="form-shell-inner">
          <div className="form-shell-header">
            <div className="form-shell-title">
              <span className="form-shell-icon-wrap">
                <FileText className="w-5 h-5 text-white" />
              </span>
              <div>
                <span className="form-shell-title-text">Bulletin mensuel de sécurité</span>
                <span className="form-shell-subtitle">Export PDF ou envoi par email</span>
              </div>
            </div>
            <button className="modal-close" onClick={() => !busy && setOpen(false)} aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="form-shell-body space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Mois</label>
                {selectMois}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Année</label>
                {selectAnnee}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-foreground">
                  Destinataires ({nbSelectionnes} sélectionné{nbSelectionnes > 1 ? 's' : ''})
                </p>
                <button
                  type="button"
                  onClick={reselectionnerTous}
                  className="text-[11px] text-role-primary hover:underline"
                >
                  Tout sélectionner
                </button>
              </div>

              {inspecteurs.length === 0 && admins.length === 0 && (
                <p className="text-xs text-foreground/60 p-3 rounded-lg bg-muted/20">
                  Aucun destinataire avec adresse email dans le système.
                </p>
              )}

              {admins.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">
                      Administration ({admins.length})
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => toggleGroupe(admins, true)} className="text-[11px] text-role-primary hover:underline">Tous</button>
                      <button type="button" onClick={() => toggleGroupe(admins, false)} className="text-[11px] text-foreground/50 hover:underline">Aucun</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {admins.map(rowDestinataire)}
                  </div>
                </div>
              )}

              {inspecteurs.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wide">
                      Inspecteurs ({inspecteurs.length})
                    </p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => toggleGroupe(inspecteurs, true)} className="text-[11px] text-role-primary hover:underline">Tous</button>
                      <button type="button" onClick={() => toggleGroupe(inspecteurs, false)} className="text-[11px] text-foreground/50 hover:underline">Aucun</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {inspecteurs.map(rowDestinataire)}
                  </div>
                </div>
              )}
            </div>

            {erreur && (
              <p className="text-xs text-danger bg-danger-soft/40 border border-danger/20 rounded-lg p-2.5">
                {erreur}
              </p>
            )}
          </div>

          <div className="form-shell-footer">
            <button onClick={() => setOpen(false)} className="btn btn-secondary" disabled={!!busy}>Fermer</button>
            <button onClick={handleDownload} className="btn btn-primary gap-1.5" disabled={!!busy}>
              {busy === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {busy === 'download' ? 'Génération...' : 'Télécharger PDF'}
            </button>
            <button onClick={handleEmail} className="btn btn-secondary gap-1.5 text-role-primary border-role-primary/30" disabled={!!busy}>
              {busy === 'email' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {busy === 'email' ? 'Envoi...' : 'Envoyer par email'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <button
        onClick={handleOpen}
        className="btn btn-sm btn-secondary gap-1.5"
        title="Générer et envoyer le bulletin mensuel de sécurité"
      >
        <FileText className="w-3.5 h-3.5 text-role-primary" />
        Bulletin mensuel
      </button>
      {open && createPortal(modal, document.body)}
    </>
  )
}
