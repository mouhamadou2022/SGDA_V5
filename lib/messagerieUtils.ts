// lib/messagerieUtils.ts
import { Message } from './store'

export const messagerieUtils = {
  /**
   * Génère un ID de conversation basé sur les participants
   */
  genererConversationId(participants: string[]): string {
    return participants.sort().join('_')
  },

  /**
   * Vérifie si un utilisateur peut envoyer un message à un autre
   */
  peutEnvoyerMessage(expediteurRole: string, destinataireRole: string, canal: string): boolean {
    if (canal === 'interne') {
      // Interne: uniquement ANACIM
      const rolesANACIM = ['admin', 'inspector', 'dg_anacim']
      return rolesANACIM.includes(expediteurRole) && rolesANACIM.includes(destinataireRole)
    } else {
      // Exploitant: ANACIM ↔ Exploitants
      const rolesANACIM = ['admin', 'inspector', 'dg_anacim']
      const rolesExploitant = ['dg_operator', 'focal_operator', 'staff_operator']
      
      return (rolesANACIM.includes(expediteurRole) && rolesExploitant.includes(destinataireRole)) ||
             (rolesExploitant.includes(expediteurRole) && rolesANACIM.includes(destinataireRole))
    }
  },

  /**
   * Calcule le nombre de messages non lus pour un utilisateur
   */
  getMessagesNonLus(messages: Message[], userId: string): number {
    return messages.filter(msg => {
      const estDestinataire = Array.isArray(msg.to_id) 
        ? msg.to_id.includes(userId)
        : msg.to_id === userId
      
      const estNonLu = !msg.read_at && (
        Array.isArray(msg.to_id)
          ? !msg.read_by?.includes(userId)
          : true
      )

      return estDestinataire && estNonLu
    }).length
  },

  /**
   * Groupe les messages par conversation
   */
  grouperParConversation(messages: Message[], userId: string): Record<string, Message[]> {
    const conversations: Record<string, Message[]> = {}

    messages.forEach(msg => {
      const participants = [msg.from_id, ...(Array.isArray(msg.to_id) ? msg.to_id : [msg.to_id])]
      const convId = this.genererConversationId(participants)
      
      if (!conversations[convId]) {
        conversations[convId] = []
      }
      conversations[convId].push(msg)
    })

    // Trier par date
    Object.keys(conversations).forEach(key => {
      conversations[key].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    })

    return conversations
  },

  /**
   * Formate la taille des fichiers
   */
  formatTailleFichier(taille: number): string {
    if (taille < 1024) return `${taille} o`
    if (taille < 1024 * 1024) return `${(taille / 1024).toFixed(1)} Ko`
    return `${(taille / (1024 * 1024)).toFixed(1)} Mo`
  },

  /**
   * Valide les pièces jointes
   */
  validerPiecesJointes(fichiers: File[]): { valide: boolean; erreurs: string[] } {
    const erreurs: string[] = []
    const tailleMax = 10 * 1024 * 1024 // 10 Mo
    const typesAcceptes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png'
    ]

    fichiers.forEach(file => {
      if (file.size > tailleMax) {
        erreurs.push(`${file.name} dépasse la taille maximale de 10 Mo`)
      }
      if (!typesAcceptes.includes(file.type)) {
        erreurs.push(`${file.name}: type de fichier non accepté`)
      }
    })

    return {
      valide: erreurs.length === 0,
      erreurs
    }
  },

  /**
   * Génère un aperçu du message pour la liste
   */
  getApercu(body: string, maxLength: number = 100): string {
    const sansRetours = body.replace(/\n/g, ' ')
    return sansRetours.length > maxLength
      ? sansRetours.substring(0, maxLength) + '...'
      : sansRetours
  }
}