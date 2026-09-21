// lib/store/messagerieSlice.ts — Phase 2 (monolithe modulaire)
// Tranche Messagerie extraite du store monolithique, comportement identique.
// Appel inter-slice via get() (store composé) : addNotification.

import type { StateCreator } from 'zustand'
import type { AppStore } from '../store'
import { storeEvents } from './eventBus'
import * as datastore from '../datastore'

// ─────────────────────────────────────────────────────────────
// Types (source unique — réexportés par lib/store.ts)
// ─────────────────────────────────────────────────────────────

export interface Message {
  id: string
  conversation_id?: string
  canal: 'interne' | 'exploitant'
  from_id: string
  from_nom: string
  from_role: string
  to_id: string | string[]
  cc_id?: string[]
  aerodrome_id?: string
  subject: string
  body: string
  attachments?: {
    nom: string
    url: string
    taille: number
    type: string
  }[]
  read_at?: string
  read_by?: string[]
  archived_by?: string[]
  replied_to?: string
  created_at: string
}

export interface Conversation {
  id: string
  participants: string[]
  dernier_message: string
  non_lus: number
  updated_at: string
}

// ─────────────────────────────────────────────────────────────
// Interface publique du slice
// ─────────────────────────────────────────────────────────────

export interface MessagerieSlice {
  messages: Message[]
  conversations: Conversation[]
  messagesNonLus: number
  setMessages: (messages: Message[]) => void
  envoyerMessage: (message: Omit<Message, 'id' | 'created_at'>) => void
  marquerCommeLu: (messageId: string) => void
  supprimerMessage: (messageId: string, userId: string) => void
  archiverMessage: (messageId: string, userId: string) => void
  marquerCommeNonLu: (messageId: string, userId: string) => void
  getConversations: (userId: string) => Conversation[]
  getMessagesConversation: (conversationId: string) => Message[]
  getMessagesNonLus: (userId: string) => number
}

// ─────────────────────────────────────────────────────────────
// Créateur (composé dans lib/store.ts via ...createMessagerieSlice)
// ─────────────────────────────────────────────────────────────

export const createMessagerieSlice: StateCreator<AppStore, [], [], MessagerieSlice> = (set, get) => ({
  messages: [],
  conversations: [],
  messagesNonLus: 0,

  setMessages: (messages) => set({ messages }),

  envoyerMessage: (message) => {
    const newMsg = { ...message, id: crypto.randomUUID(), created_at: new Date().toISOString() } as Message
    set((state) => ({ messages: [...state.messages, newMsg] }))
    // Fire-and-forget Supabase (ne bloque PAS l'UI)
    datastore.createMessage(newMsg).then(result => {
      if (result.error) {
        console.error('[store/envoyerMessage] Erreur Supabase:', result.error)
        return
      }
      set((state) => ({
        messages: state.messages.map(m => m.id === newMsg.id ? result.data as Message : m)
      }))
      // Si message exploitant, notifier les destinataires
      if (message.canal === 'exploitant') {
        const toIds = typeof message.to_id === 'string' ? [message.to_id] : message.to_id
        for (const uid of [...toIds, ...(message.cc_id || [])]) {
          if (uid && uid !== message.from_id) {
            storeEvents.emit('notification:envoyer', {
              user_id: uid,
              type: 'info',
              title: `Nouveau message: ${message.subject}`,
              message: `De ${message.from_nom}: ${message.body.substring(0, 100)}`,
              canal: 'in_app',
              link: '/?module=messagerie',
            })
          }
        }
      }
    }).catch(err => console.error('[store/envoyerMessage] Exception:', err))
  },

  marquerCommeLu: (messageId) => {
    set((state) => ({
      messages: state.messages.map(m => m.id === messageId ? { ...m, read_at: new Date().toISOString() } : m)
    }))
    datastore.updateMessage(messageId, { read_at: new Date().toISOString() } as any).catch(err =>
      console.error('[store/marquerCommeLu] Erreur Supabase:', err)
    )
  },

  supprimerMessage: (messageId) => {
    set((state) => ({ messages: state.messages.filter(m => m.id !== messageId) }))
    datastore.deleteMessage(messageId).catch(err =>
      console.error('[store/supprimerMessage] Erreur Supabase:', err)
    )
  },

  archiverMessage: (messageId, userId) => {
    set((state) => ({
      messages: state.messages.map(m => {
        if (m.id !== messageId) return m
        const archived = m.archived_by || []
        return archived.includes(userId) ? m : { ...m, archived_by: [...archived, userId] }
      })
    }))
    const msg = get().messages.find(m => m.id === messageId)
    const archived_by = [...(msg?.archived_by || []), userId]
    datastore.updateMessage(messageId, { archived_by } as any).catch(err =>
      console.error('[store/archiverMessage] Erreur Supabase:', err)
    )
  },

  marquerCommeNonLu: (messageId, _userId) => {
    set((state) => ({
      messages: state.messages.map(m => m.id === messageId ? { ...m, read_at: undefined } : m)
    }))
    datastore.updateMessage(messageId, { read_at: undefined as any } as any).catch(err =>
      console.error('[store/marquerCommeNonLu] Erreur Supabase:', err)
    )
  },

  getConversations: (userId) => {
    const msgs = get().messages
    const convMap = new Map<string, Conversation>()
    for (const msg of msgs) {
      const convId = msg.conversation_id || msg.id
      const existing = convMap.get(convId)
      const toParticipants = typeof msg.to_id === 'string' ? [msg.to_id] : msg.to_id
      const participants = [msg.from_id, ...toParticipants, ...(msg.cc_id || [])]
      if (!existing) {
        convMap.set(convId, {
          id: convId,
          participants,
          dernier_message: msg.body,
          non_lus: (participants.includes(userId) && !msg.read_at) ? 1 : 0,
          updated_at: msg.created_at,
        })
      } else {
        if (new Date(msg.created_at) > new Date(existing.updated_at)) {
          existing.dernier_message = msg.body
          existing.updated_at = msg.created_at
        }
        if (participants.includes(userId) && !msg.read_at) {
          existing.non_lus += 1
        }
        existing.participants = [...new Set([...existing.participants, ...participants])]
      }
    }
    return Array.from(convMap.values()).filter(c => c.participants.includes(userId))
  },

  getMessagesConversation: (conversationId) => get().messages.filter(m => m.conversation_id === conversationId),

  getMessagesNonLus: (userId) => get().messages.filter(m => {
    const toId = m.to_id
    const isRecipient = toId === userId || (Array.isArray(toId) && toId.includes(userId))
    const isCC = m.cc_id?.includes(userId)
    return (isRecipient || isCC) && !m.read_at
  }).length,
})
