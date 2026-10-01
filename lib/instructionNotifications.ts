// lib/instructionNotifications.ts
// Étape 1 unification workflow : quand l'exploitant soumet une demande
// (certification / homologation), les admins ANACIM sont notifiés pour
// assigner l'instruction — avant, personne n'était prévenu côté ANACIM.

'use client'

import { useAppStore } from './store'

/** Notifie tous les admins : nouvelle demande à instruire (assignation attendue). */
export function notifierAdminsDemande(
  type: 'certification' | 'homologation',
  reference: string,
  codeOaci: string,
  estRevision: boolean,
): void {
  try {
    const etat = useAppStore.getState()
    const admins = (etat.utilisateurs || []).filter(u => u.role === 'admin')
    for (const admin of admins) {
      etat.addNotification({
        user_id: admin.id,
        type: 'info',
        title: `Demande d'${type === 'certification' ? 'e certification' : "'homologation"} ${estRevision ? 'mise à jour' : 'reçue'}`,
        message: `${reference} (${codeOaci}) — à assigner pour instruction.`,
        canal: 'in_app',
      })
    }
  } catch {
    // Best-effort : la soumission ne doit jamais échouer pour une notif.
  }
}
