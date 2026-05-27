// lib/__tests__/messagerieUtils.test.ts
import { messagerieUtils } from '../messagerieUtils'

describe('messagerieUtils', () => {
  describe('genererConversationId', () => {
    it('devrait générer un ID trié', () => {
      const participants = ['user2', 'user1', 'user3']
      expect(messagerieUtils.genererConversationId(participants))
        .toBe('user1_user2_user3')
    })
  })

  describe('peutEnvoyerMessage', () => {
    it('devrait permettre interne ANACIM', () => {
      expect(messagerieUtils.peutEnvoyerMessage('admin', 'inspector', 'interne')).toBe(true)
      expect(messagerieUtils.peutEnvoyerMessage('inspector', 'dg_anacim', 'interne')).toBe(true)
    })

    it('devrait refuser exploitant en interne', () => {
      expect(messagerieUtils.peutEnvoyerMessage('dg_operator', 'inspector', 'interne')).toBe(false)
    })

    it('devrait permettre ANACIM → exploitant', () => {
      expect(messagerieUtils.peutEnvoyerMessage('inspector', 'dg_operator', 'exploitant')).toBe(true)
    })

    it('devrait permettre exploitant → ANACIM', () => {
      expect(messagerieUtils.peutEnvoyerMessage('dg_operator', 'inspector', 'exploitant')).toBe(true)
    })
  })

  describe('getMessagesNonLus', () => {
    it('devrait compter les messages non lus', () => {
      const messages = [
        { to_id: 'user1', read_at: null },
        { to_id: 'user1', read_at: '2024-01-01' },
        { to_id: 'user2', read_at: null },
        { to_id: ['user1', 'user3'], read_by: ['user3'] }
      ] as any
      expect(messagerieUtils.getMessagesNonLus(messages, 'user1')).toBe(2)
    })
  })

  describe('formatTailleFichier', () => {
    it('devrait formater les octets', () => {
      expect(messagerieUtils.formatTailleFichier(500)).toBe('500 o')
      expect(messagerieUtils.formatTailleFichier(1500)).toBe('1.5 Ko')
      expect(messagerieUtils.formatTailleFichier(1500000)).toBe('1.4 Mo')
    })
  })

  describe('validerPiecesJointes', () => {
    it('devrait accepter les fichiers valides', () => {
      const fichiers = [
        { name: 'doc.pdf', size: 5 * 1024 * 1024, type: 'application/pdf' }
      ] as File[]
      const result = messagerieUtils.validerPiecesJointes(fichiers)
      expect(result.valide).toBe(true)
      expect(result.erreurs).toHaveLength(0)
    })

    it('devrait rejeter les fichiers trop gros', () => {
      const fichiers = [
        { name: 'doc.pdf', size: 15 * 1024 * 1024, type: 'application/pdf' }
      ] as File[]
      const result = messagerieUtils.validerPiecesJointes(fichiers)
      expect(result.valide).toBe(false)
      expect(result.erreurs[0]).toContain('dépasse la taille maximale')
    })
  })

  describe('getApercu', () => {
    it('devrait tronquer le texte long', () => {
      const longTexte = 'a'.repeat(150)
      expect(messagerieUtils.getApercu(longTexte, 10)).toBe('a'.repeat(10) + '...')
    })

    it('devrait garder le texte court', () => {
      expect(messagerieUtils.getApercu('court', 10)).toBe('court')
    })
  })
})