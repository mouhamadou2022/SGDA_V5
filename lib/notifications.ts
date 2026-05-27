// lib/notifications.ts - Système de notifications pour suppressions en cascade

import { useAppStore } from './store'
const get = () => useAppStore.getState()

export interface CascadeResult {
  type: string
  count: number
  status?: string
  kept?: boolean
}

async function sendEmail(notification: { to: string; subject: string; html: string }): Promise<void> {
  try {
    const res = await fetch('/api/notifications/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: notification.to, subject: notification.subject, message: notification.html }),
    })
    if (!res.ok) console.error('[notifications.ts] Échec envoi email:', await res.text())
  } catch (err) {
    console.error('[notifications.ts] Erreur envoi email:', err)
  }
}

/**
 * Notifie les administrateurs d'une suppression en cascade
 */
export async function notifyDeletionCascade(
  entityType: 'aerodrome' | 'inspecteur',
  entityName: string,
  cascadeResults: CascadeResult[],
  deletedBy: string
): Promise<void> {
  const state = get()
  
  // 1. Récupérer les admins
  const admins = state.utilisateurs.filter(u => 
    ['dg_anacim', 'admin'].includes(u.role)
  )
  
  // 2. Créer le contenu de l'email
  const itemsToDelete = cascadeResults.filter(r => !r.kept)
  const itemsKept = cascadeResults.filter(r => r.kept)
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">⚠️ Suppression en cascade</h2>
      <p>Un <strong>${entityType}</strong> a été supprimé avec cascade.</p>
      
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Élément supprimé :</strong> ${entityName}</p>
        <p><strong>Supprimé par :</strong> ${deletedBy}</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
      </div>
      
      ${itemsToDelete.length > 0 ? `
        <h3 style="color: #dc2626;">Éléments supprimés en cascade :</h3>
        <ul>
          ${itemsToDelete.map(item => `
            <li>${item.type} (${item.status || 'N/A'}) : ${item.count} élément(s)</li>
          `).join('')}
        </ul>
      ` : ''}
      
      ${itemsKept.length > 0 ? `
        <h3 style="color: #16a34a;">Éléments conservés (archivés/terminés) :</h3>
        <ul>
          ${itemsKept.map(item => `
            <li>${item.type} (${item.status || 'N/A'}) : ${item.count} élément(s)</li>
          `).join('')}
        </ul>
      ` : ''}
      
      <p style="margin-top: 30px; font-size: 12px; color: #666;">
        Ceci est une notification automatique du système SGDA.
      </p>
    </div>
  `
  
  // 3. Envoyer aux admins
  for (const admin of admins) {
    if (!admin.email) continue;
    await sendEmail({
      to: admin.email,
      subject: `[SGDA] Suppression ${entityType} - ${entityName}`,
      html
    })
  }
  
  // 4. Créer notification in-app + email pour chaque admin
  for (const admin of admins) {
    state.addNotification({
      user_id: admin.id,
      type: 'warning',
      title: `Suppression ${entityType}`,
      message: `${entityName} supprimé avec cascade par ${deletedBy}`,
      link: '/historique',
      canal: 'email_sms'
    })
  }
}

/**
 * Notifie un inspecteur de la suppression d'une formation
 */
export async function notifyFormationDeleted(
  formationTitle: string,
  inspecteurId: string
): Promise<void> {
  const state = get()
  const inspecteur = state.inspecteurs.find(i => i.id === inspecteurId)
  
  if (!inspecteur) return
  
  await sendEmail({
    to: inspecteur.email,
    subject: `[SGDA] Formation annulée - ${formationTitle}`,
    html: `
      <p>Bonjour ${inspecteur.prenom},</p>
      <p>La formation <strong>${formationTitle}</strong> a été supprimée.</p>
      <p>Vos compétences associées seront mises à jour.</p>
    `
  })
  
  state.addNotification({
    user_id: inspecteurId,
    type: 'info',
    title: 'Formation supprimée',
    message: `La formation ${formationTitle} a été supprimée`,
    canal: 'email_sms'
  })
}

/**
 * Notifie l'équipe d'une surveillance supprimée
 */
export async function notifySurveillanceDeleted(
  surveillanceDate: string,
  equipeIds: string[]
): Promise<void> {
  const state = get()
  
  for (const userId of equipeIds) {
    const user = state.utilisateurs.find(u => u.id === userId)
    if (!user?.email) continue
    
    await sendEmail({
      to: user.email,
      subject: `[SGDA] Surveillance annulée - ${surveillanceDate}`,
      html: `
        <p>Bonjour ${user.prenom},</p>
        <p>La surveillance prévue le <strong>${surveillanceDate}</strong> a été supprimée.</p>
        <p>Vos plannings ont été mis à jour.</p>
      `
    })
    
    state.addNotification({
      user_id: userId,
      type: 'warning',
      title: 'Surveillance annulée',
      message: `Surveillance du ${surveillanceDate} supprimée`,
      canal: 'email_sms'
    })
  }
}

/**
 * Notifie le DG et le point focal de la suppression d'un aérodrome
 */
export async function notifyAerodromeDeleted(
  aerodromeNom: string,
  aerodromeCodeOaci: string,
  deletedBy: string
): Promise<void> {
  const state = get()
  
  // Récupérer les utilisateurs liés à cet aérodrome (DG, focal)
  const aerodromeUsers = state.utilisateurs.filter(u =>
    ['dg_operator', 'focal_operator'].includes(u.role) &&
    u.aerodrome_id &&
    u.email
  )
  
  // Aussi notifier les admins
  const admins = state.utilisateurs.filter(u =>
    ['admin', 'dg_anacim'].includes(u.role) && u.email
  )
  
  const allRecipients = [...new Map([...aerodromeUsers, ...admins].map(u => [u.email, u])).values()]
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">⚠️ Aérodrome supprimé</h2>
      <p>L'aérodrome <strong>${aerodromeNom}</strong> (${aerodromeCodeOaci}) a été supprimé du système SGDA.</p>
      
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Aérodrome :</strong> ${aerodromeNom} (${aerodromeCodeOaci})</p>
        <p><strong>Supprimé par :</strong> ${deletedBy}</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
      </div>
      
      <h3 style="color: #dc2626;">Éléments supprimés en cascade :</h3>
      <ul>
        <li>Surveillances associées</li>
        <li>Certifications et homologations</li>
        <li>Écarts et plans d'action</li>
        <li>Plannings</li>
        <li>Codes d'accès révoqués</li>
        <li>Profils de risque</li>
      </ul>
      
      <p style="margin-top: 30px; font-size: 12px; color: #666;">
        Ceci est une notification automatique du système SGDA.
      </p>
    </div>
  `
  
  for (const user of allRecipients) {
    if (!user.email) continue;
    await sendEmail({
      to: user.email,
      subject: `[SGDA] Aérodrome supprimé - ${aerodromeNom} (${aerodromeCodeOaci})`,
      html
    })
    
    state.addNotification({
      user_id: user.id,
      type: 'warning',
      title: 'Aérodrome supprimé',
      message: `L'aérodrome ${aerodromeNom} (${aerodromeCodeOaci}) a été supprimé`,
      link: '/aerodromes',
      canal: 'email_sms'
    })
  }
}

/**
 * Notifie un inspecteur de la suppression de son compte
 */
export async function notifyInspecteurDeleted(
  inspecteurPrenom: string,
  inspecteurNom: string,
  inspecteurEmail: string,
  deletedBy: string
): Promise<void> {
  if (!inspecteurEmail) return
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">⚠️ Compte inspecteur supprimé</h2>
      <p>Bonjour ${inspecteurPrenom},</p>
      <p>Votre compte inspecteur <strong>${inspecteurPrenom} ${inspecteurNom}</strong> a été supprimé du système SGDA.</p>
      
      <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Supprimé par :</strong> ${deletedBy}</p>
        <p><strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}</p>
      </div>
      
      <p>Vos participations aux formations et surveillances en cours ont été annulées.</p>
      
      <p style="margin-top: 30px; font-size: 12px; color: #666;">
        Ceci est une notification automatique du système SGDA.
      </p>
    </div>
  `
  
  await sendEmail({
    to: inspecteurEmail,
    subject: '[SGDA] Votre compte inspecteur a été supprimé',
    html
  })
}
