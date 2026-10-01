// lib/instructionValidation.ts
// Étape 3 unification workflow : double regard du chef + retransmission formelle.
// - Un membre de l'équipe (non chef, non admin) ne DÉCIDE pas : il PROPOSE un
//   avis ; le chef valide (l'avis devient décision) ou retourne.
// - Le chef (ou l'admin, ou l'équipe sans chef désigné) décide directement.
// - Toute décision validée est RETRANSMISE à l'exploitant (notif + email
//   best-effort + traçabilité transmis_exploitant_le), miroir du pattern
//   planningsSlice (notification:envoyer + /api/notifications/email).

'use client'

import { useAppStore } from './store'
import { canManageRole } from './config'

export type AvisInstruction = 'favorable' | 'a_reviser' | 'defavorable'

export interface PropositionAvis {
  proposition_avis?: AvisInstruction
  propose_par?: string
  propose_le?: string
  valide_par?: string
  valide_le?: string
  transmis_exploitant_le?: string
}

/** Vrai si l'utilisateur doit passer par une proposition (chef désigné, non chef, non admin). */
export function doitProposer(
  chefId: string | undefined,
  userId: string | undefined,
  userRole: string,
): boolean {
  if (!chefId) return false
  if (canManageRole(userRole)) return false
  if (!userId) return true
  return userId !== chefId
}

function nomCourt(u: { prenom?: string; nom?: string } | undefined, defaut = 'Système'): string {
  if (!u) return defaut
  return `${u.prenom || ''} ${u.nom || ''}`.trim() || defaut
}

/** Notifie le chef qu'un avis attend sa validation. */
export function notifierChefProposition(
  chefId: string,
  reference: string,
  codeOaci: string,
  phase: number,
  avis: AvisInstruction,
  proposePar: string,
): void {
  try {
    useAppStore.getState().addNotification({
      user_id: chefId,
      type: 'warning',
      title: `Avis à valider — ${reference}`,
      message: `${proposePar} propose « ${avis} » (phase ${phase}, ${codeOaci}). À valider ou retourner.`,
      canal: 'in_app',
    })
  } catch { /* best-effort */ }
}

/** Notifie le proposant du sort de son avis (validé / retourné). */
export function notifierProposant(
  proposantId: string | undefined,
  reference: string,
  valide: boolean,
  commentaireChef?: string,
): void {
  if (!proposantId) return
  try {
    useAppStore.getState().addNotification({
      user_id: proposantId,
      type: valide ? 'success' : 'warning',
      title: valide ? `Avis validé — ${reference}` : `Avis retourné — ${reference}`,
      message: valide
        ? 'Le chef a validé votre avis — décision enregistrée et retransmise.'
        : `Le chef demande une reprise.${commentaireChef ? ` Motif : ${commentaireChef}` : ''}`,
      canal: 'in_app',
    })
  } catch { /* best-effort */ }
}

export interface CibleRetransmission {
  aerodrome_id: string
  reference: string
  type: 'certification' | 'homologation'
  phase: number
  decision: AvisInstruction
}

/**
 * Retransmission formelle d'une décision validée vers l'exploitant :
 * notification in-app + email (best-effort) aux opérateurs rattachés au site.
 * Retourne la date ISO de transmission (à stocker en transmis_exploitant_le).
 */
export function retransmettreDecision(cible: CibleRetransmission): string {
  const now = new Date().toISOString()
  try {
    const etat = useAppStore.getState()
    const aero = (etat.aerodromes || []).find(a => a.id === cible.aerodrome_id)
    const code = aero?.code_oaci || ''
    const exploitants = (etat.utilisateurs || []).filter(u =>
      u.aerodrome_id === cible.aerodrome_id &&
      ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? ''),
    )
    const titre = `Décision ${cible.type} — ${cible.reference}`
    const message = `Phase ${cible.phase} (${code}) : avis « ${cible.decision} ». Consultez votre portail exploitant.`
    for (const op of exploitants) {
      etat.addNotification({ user_id: op.id, type: 'info', title: titre, message, canal: 'in_app' })
      const emailTo = op.notification_email || op.email
      if (emailTo && op.notifications_email !== false) {
        fetch('/api/notifications/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emailTo,
            subject: `SGDA - ${titre}`,
            message: `Bonjour ${op.prenom || 'Exploitant'},\n\n${message}\n\nCordialement,\nANACIM - SGDA`,
          }),
        }).catch(() => {})
      }
    }
  } catch { /* best-effort : la décision reste valide même sans notif */ }
  return now
}
