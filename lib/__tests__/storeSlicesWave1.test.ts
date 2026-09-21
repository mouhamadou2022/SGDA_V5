// lib/__tests__/storeSlicesWave1.test.ts — Phase 2 (monolithe modulaire)
// Contrats des slices extraits en vague 1, testés ISOLÉS via zustand/vanilla.
// Même convention que exemptionsSlice.test.ts : les créateurs sont typés pour
// le AppStore complet, le cast documenté ci-dessous comble l'écart en test.

import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand'
import { createNotificationsSlice, type NotificationSlice } from '../store/notificationsSlice'
import { createDelegationsSlice, type DelegationSlice } from '../store/delegationsSlice'
import { createAlertesSlice, type AlerteSlice } from '../store/alertesSlice'
import { createPresenceSlice, type PresenceSlice } from '../store/presenceSlice'
import { createRiskIndexFeedbackSlice, type RiskIndexFeedbackSlice } from '../store/riskIndexFeedbackSlice'
import { createIaSuggestionsSlice, type IaSuggestionSlice } from '../store/iaSuggestionsSlice'
import { createSgsMemorySlice, type SgsMemorySlice } from '../store/sgsMemorySlice'
import {
  createSuggestionFeedbacksSlice,
  type SuggestionFeedbackSlice,
} from '../store/suggestionFeedbacksSlice'

function isolated<T>(creator: unknown) {
  return createStore<T>()(creator as StateCreator<T, [], [], T>)
}

describe('notificationsSlice — contrat d’abonnement notification:envoyer', () => {
  test('charge utile événement → notification complète (id + sent_at générés)', () => {
    const s = isolated<NotificationSlice>(createNotificationsSlice)
    s.setState({ getUtilisateur: () => undefined } as unknown as Partial<NotificationSlice>)
    // Même forme que le payload de l'événement (sans id ni sent_at).
    s.getState().addNotification({ user_id: 'u1', type: 'warning', message: 'm', canal: 'in_app' })
    const [notif] = s.getState().notifications
    expect(notif.id).toBeTruthy()
    expect(notif.sent_at).toBeTruthy()
    expect(notif.user_id).toBe('u1')
  })
})

describe('notificationsSlice', () => {
  test('add/set/read allongent et recomptent les non-lus', () => {
    const s = isolated<NotificationSlice>(createNotificationsSlice)
    // Double de test : addNotification lit get().getUtilisateur (slice
    // utilisateurs, absent du store isolé). Canal in_app → ni email ni SMS.
    s.setState({ getUtilisateur: () => undefined } as unknown as Partial<NotificationSlice>)
    s.getState().addNotification({ user_id: 'u1', type: 'info', message: 'm1', canal: 'in_app' })
    s.getState().addNotification({ user_id: 'u1', type: 'danger', message: 'm2', canal: 'in_app' })
    expect(s.getState().notifications).toHaveLength(2)
    expect(s.getState().unreadCount).toBe(2)
    // La plus récente en premier
    expect(s.getState().notifications[0].message).toBe('m2')
    const id = s.getState().notifications[0].id
    s.getState().markAsRead(id)
    expect(s.getState().unreadCount).toBe(1)
    s.getState().markAllAsRead()
    expect(s.getState().unreadCount).toBe(0)
    expect(s.getState().notifications.every(n => n.read_at)).toBe(true)
  })
})

describe('delegationsSlice', () => {
  test('CRUD + filtres par surveillance/inspecteur/domaine', () => {
    const s = isolated<DelegationSlice>(createDelegationsSlice)
    const base = {
      surveillance_id: 's1', aerodrome_id: 'a1', chef_id: 'c1', domaine: 'SGS',
      assigne_a: 'insp-1', assigne_par: 'c1', items_ids: [] as string[],
      progression: 0, statut: 'assigne' as const,
      assigne_le: '', derniere_activite: '', derniere_sync: '',
    }
    s.getState().addDelegation(base)
    s.getState().addDelegation({ ...base, domaine: 'PHY', assigne_a: 'insp-2' })
    expect(s.getState().getDelegationsBySurveillance('s1')).toHaveLength(2)
    expect(s.getState().getDelegationsByInspecteur('insp-2')).toHaveLength(1)
    expect(s.getState().getDelegationsByDomaine('s1', 'PHY')?.assigne_a).toBe('insp-2')
    expect(s.getState().getDelegationsByDomaine('s1', 'XXX')).toBeUndefined()
  })

  test('cleanupDelegations purge orphelines + doublons (surveillances stubbées)', () => {
    const s = isolated<DelegationSlice>(createDelegationsSlice)
    // Double de test : le slice lit get().surveillances (store composé en prod).
    s.setState({ surveillances: [{ id: 's1' }] } as unknown as Partial<DelegationSlice>)
    const base = {
      aerodrome_id: 'a1', chef_id: 'c1', assigne_a: 'insp-1', assigne_par: 'c1',
      items_ids: [] as string[], progression: 0, statut: 'assigne' as const,
      assigne_le: '', derniere_activite: '', derniere_sync: '',
    }
    s.getState().addDelegation({ ...base, surveillance_id: 's1', domaine: 'SGS' })
    s.getState().addDelegation({ ...base, surveillance_id: 's1', domaine: 'sgs' }) // doublon (casse)
    s.getState().addDelegation({ ...base, surveillance_id: 'sX', domaine: 'PHY' }) // orpheline
    s.getState().addDelegation({ ...base, surveillance_id: 's1', domaine: '' }) // domaine vide
    s.getState().cleanupDelegations()
    const kept = s.getState().delegations
    expect(kept).toHaveLength(1)
    expect(kept[0].domaine).toBe('SGS')
  })
})

describe('alertesSlice', () => {
  test('CRUD + filtre actives', () => {
    const s = isolated<AlerteSlice>(createAlertesSlice)
    const base = {
      surveillance_id: 's1', item_id: 'i1', item_numero: '1', item_description: 'd',
      domaine: 'SGS', niveau: 'critique' as const, message: 'm', declenchee_par: 'x',
      declencheur_nom: 'y', declenchee_le: '', statut: 'active' as const,
      preuves: [], notifie_chef: false, notifie_dg: false,
    }
    s.getState().addAlerteSecurite(base)
    s.getState().addAlerteSecurite({ ...base, statut: 'traitee' })
    expect(s.getState().getAlertesBySurveillance('s1')).toHaveLength(2)
    expect(s.getState().getAlertesActivesBySurveillance('s1')).toHaveLength(1)
  })
})

describe('presenceSlice', () => {
  test('CRUD + filtre signées', () => {
    const s = isolated<PresenceSlice>(createPresenceSlice)
    const base = {
      surveillance_id: 's1', prenom_nom: 'A B', structure: 'ANACIM' as const,
      fonction: 'f', telephone: '', email: '', signature_url: 'url', signature_date: '', ordre: 1,
    }
    s.getState().addFichePresence(base)
    s.getState().addFichePresence({ ...base, signature_url: '' })
    expect(s.getState().getFichesBySurveillance('s1')).toHaveLength(2)
    expect(s.getState().getFichesSigneesBySurveillance('s1')).toHaveLength(1)
  })
})

describe('riskIndexFeedbackSlice', () => {
  test('add + stats', () => {
    const s = isolated<RiskIndexFeedbackSlice>(createRiskIndexFeedbackSlice)
    const ctx = {
      score_global: 50, c1: 1, c2: 2, c3: 3, c4: 4, c5: 5,
      velocity: 0, nb_ecarts_critiques: 0, nb_nv: 0, nb_ns: 0,
    }
    const sys = { probabilite: 3 as const, gravite: 'C' as const, niveau: 'moyen' as const }
    s.getState().addRiskIndexFeedback({
      aerodrome_id: 'a1', date: '', contexte: ctx,
      suggestion_systeme: sys, choix_inspecteur: sys, ecart: 0,
    })
    expect(s.getState().getFeedbacksByAerodrome('a1')).toHaveLength(1)
    const stats = s.getState().getRiskIndexLearningStats()
    expect(stats.totalFeedbacks).toBe(1)
    expect(stats.adjustmentsCount).toBe(1)
  })
})

describe('iaSuggestionsSlice', () => {
  test('add/remove/clear/filtre', () => {
    const s = isolated<IaSuggestionSlice>(createIaSuggestionsSlice)
    const base = {
      id: 'sug-1', aerodrome_id: 'a1', type: 'periodique' as const, portee: ['SGS'],
      date_debut: '', date_fin: '', equipe_ids: [] as string[], chef_id: '',
      priorite: 'haute' as const, objectifs: '', raison: '', confiance: 80,
      source: 'risque_critique' as const, created_at: '',
    }
    s.getState().addIaSuggestion(base)
    expect(s.getState().getIaSuggestionsByAerodrome('a1')).toHaveLength(1)
    s.getState().removeIaSuggestion('sug-1')
    expect(s.getState().getIaSuggestionsByAerodrome('a1')).toHaveLength(0)
    s.getState().addIaSuggestion(base)
    s.getState().clearIaSuggestions()
    expect(s.getState().iaSuggestions).toHaveLength(0)
  })
})

describe('sgsMemorySlice', () => {
  test('set remplace le lot', () => {
    const s = isolated<SgsMemorySlice>(createSgsMemorySlice)
    s.getState().setSgsMemoryRecords([])
    expect(s.getState().sgsMemoryRecords).toEqual([])
  })
})

describe('suggestionFeedbacksSlice', () => {
  const mk = (pertinent: boolean, type = 'audit_complet') => ({
    aerodrome_id: 'a1', suggestion_type: 'audit_complet' as const,
    mission_type_suggeree: type, etait_pertinent: pertinent, date_suggestion: '',
  })
  test('accuracy + seuils ajustés', () => {
    const s = isolated<SuggestionFeedbackSlice>(createSuggestionFeedbacksSlice)
    for (let i = 0; i < 4; i++) s.getState().submitSuggestionFeedback(mk(false))
    s.getState().submitSuggestionFeedback(mk(true))
    const acc = s.getState().getSuggestionAccuracy('a1')
    expect(acc).toEqual({ total: 5, pertinents: 1, rate: 0.2 })
    // < 5 feedbacks → seuil inchangé
    expect(s.getState().getAdjustedThreshold('a2', 100, 'audit_complet')).toBe(100)
    // 4/5 négatif (0.8, non > 0.8) → ×0.85
    expect(s.getState().getAdjustedThreshold('a1', 100, 'audit_complet')).toBe(85)
    // 6/6 négatif (> 0.8) → ×0.75
    const s2 = isolated<SuggestionFeedbackSlice>(createSuggestionFeedbacksSlice)
    for (let i = 0; i < 6; i++) s2.getState().submitSuggestionFeedback(mk(false))
    expect(s2.getState().getAdjustedThreshold('a1', 100, 'audit_complet')).toBe(75)
  })
})
