// lib/datastore.ts — SGDA V5
// Source unique de vérité pour tous les accès Supabase.
// ✅ R3 : 0 fetch() dans les composants — tout passe ici.
// ✅ R4 : Fichier unique, pas de doublon Supabase ailleurs.

import { supabase } from './supabase'
import type {
  Aerodrome,
  Surveillance,
  Ecart,
  Utilisateur,
  Planning,
  Certification,
  Homologation,
  ProfilRisque,
  Notification,
  ChecklistItem,
  CodeAcces,
  Inspecteur,
  Formation,
  EvenementSecurite,
  Competence,
  KitDocument,
  Message,
  ApiKey,
} from './store'

// ─────────────────────────────────────────────────────────────
// TYPES DATASTORE
// ─────────────────────────────────────────────────────────────

export interface DatastoreResult<T> {
  data: T | null
  error: string | null
}

export interface InitialData {
  aerodromes: Aerodrome[]
  surveillances: Surveillance[]
  ecarts: Ecart[]
  utilisateurs: Utilisateur[]
  plannings: Planning[]
  certifications: Certification[]
  homologations: Homologation[]
  profilsRisque: ProfilRisque[]
  notifications: Notification[]
  checklistItems: ChecklistItem[]
  codesAcces: CodeAcces[]
  formations: Formation[]
  inspecteurs: Inspecteur[]
  competences: Competence[]
  kitDocuments: KitDocument[]
  messages: Message[]
  apiKeys: ApiKey[]
}

// ─────────────────────────────────────────────────────────────
// CHARGEMENT INITIAL (appelé une seule fois au montage de AppShell)
// ─────────────────────────────────────────────────────────────

export async function loadInitialData(userId: string, role: string): Promise<DatastoreResult<InitialData>> {
  try {
    const [
      aerodromesRes,
      surveillancesRes,
      ecartsRes,
      utilisateursRes,
      planningsRes,
      certificationsRes,
      homologationsRes,
      profilsRes,
      notificationsRes,
      codesAccesRes,
      formationsRes,
      inspecteursRes,
      competencesRes,
      kitDocumentsRes,
      messagesRes,
      apiKeysRes,
    ] = await Promise.all([
      supabase.from('aerodromes').select('*').order('nom'),
      supabase.from('surveillances').select('*').order('date_debut', { ascending: false }),
      supabase.from('ecarts').select('*').order('created_at', { ascending: false }),
      supabase.from('utilisateurs').select('*').order('nom'),
      supabase.from('plannings').select('*').order('date_debut', { ascending: false }),
      supabase.from('certifications').select('*'),
      supabase.from('homologations').select('*'),
      supabase.from('profils_risque').select('*'),
      supabase.from('notifications').select('*').eq('user_id', userId).order('sent_at', { ascending: false }).limit(50),
      supabase.from('codes_acces').select('*'),
      supabase.from('formations').select('*').order('date', { ascending: false }),
      supabase.from('inspecteurs').select('*').is('deleted_at', null).order('nom'),
      supabase.from('competences').select('*'),
      supabase.from('kit_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('*').or(`from_id.eq.${userId},to_id.eq.${userId}`).order('created_at', { ascending: false }).limit(200),
      supabase.from('api_keys').select('*').order('service').order('fallback_order'),
    ])

    const errors = [
      aerodromesRes.error,
      surveillancesRes.error,
      ecartsRes.error,
      utilisateursRes.error,
      planningsRes.error,
      certificationsRes.error,
      homologationsRes.error,
      profilsRes.error,
      notificationsRes.error,
      formationsRes.error,
      inspecteursRes.error,
      competencesRes.error,
      kitDocumentsRes.error,
      messagesRes?.error,
      apiKeysRes?.error,
    ].filter(Boolean)

    if (errors.length > 0) {
      console.error('[datastore] Erreurs chargement initial:', errors)
    }

    // Créer une fonction interne pour calculer les profils manquants
    const aerodromes = (aerodromesRes.data ?? []) as Aerodrome[];
    const profilsExistants = (profilsRes.data ?? []) as ProfilRisque[];
    const profilsMap = new Map(profilsExistants.map(p => [p.aerodrome_id, p]));
    const nouveauxProfils: ProfilRisque[] = [];

    for (const aero of aerodromes) {
      if (!profilsMap.has(aero.id)) {
        try {
          const { calculerProfilInitial } = await import('@/lib/risque/initialProfile');
          const result = calculerProfilInitial(aero as Aerodrome);
          
          // Sauvegarder dans Supabase
          await supabase.from('profils_risque').upsert(result.profil);
          
          nouveauxProfils.push(result.profil);
          console.log(`[Datastore] Profil calculé pour ${aero.code_oaci}`);
        } catch (err) {
          console.error(`[Datastore] Erreur calcul profil pour ${aero.code_oaci}:`, err);
        }
      }
    }

    return {
      data: {
        aerodromes: aerodromes,
        surveillances: (surveillancesRes.data ?? []) as Surveillance[],
        ecarts: (ecartsRes.data ?? []) as Ecart[],
        utilisateurs: (utilisateursRes.data ?? []) as Utilisateur[],
        plannings: (planningsRes.data ?? []) as Planning[],
        certifications: (certificationsRes.data ?? []) as Certification[],
        homologations: (homologationsRes.data ?? []) as Homologation[],
        profilsRisque: [...profilsExistants, ...nouveauxProfils],
        notifications: (notificationsRes.data ?? []) as Notification[],
        checklistItems: [],
        codesAcces: (codesAccesRes.data ?? []) as CodeAcces[],
        formations: (formationsRes.data ?? []) as Formation[],
        inspecteurs: (inspecteursRes.data ?? []) as Inspecteur[],
        competences: (competencesRes.data ?? []) as Competence[],
        kitDocuments: (kitDocumentsRes.data ?? []) as KitDocument[],
        messages: (messagesRes?.data ?? []).map(unmarshalMessage) as Message[],
        apiKeys: (apiKeysRes?.data ?? []) as ApiKey[],
      },
      error: null,
    }
  } catch (err) {
    return { data: null, error: String(err) }
  }
}

// ─────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────

function marshalMessage(msg: Partial<Message>): any {
  const out: any = {}
  // to_id : toujours une string simple (UUID) — la colonne est uuid en DB
  if (msg.to_id !== undefined) {
    out.to_id = typeof msg.to_id === 'string' ? msg.to_id : msg.to_id[0]
  }
  if (msg.cc_id !== undefined) out.cc_id = JSON.stringify(msg.cc_id)
  if (msg.read_by !== undefined) out.read_by = JSON.stringify(msg.read_by)
  if (msg.archived_by !== undefined) out.archived_by = JSON.stringify(msg.archived_by)
  if (msg.attachments !== undefined) out.attachments = JSON.stringify(msg.attachments)
  if (msg.canal !== undefined) out.canal = msg.canal
  if (msg.from_id !== undefined) out.from_id = msg.from_id
  if (msg.from_nom !== undefined) out.from_nom = msg.from_nom
  if (msg.from_role !== undefined) out.from_role = msg.from_role
  if (msg.aerodrome_id !== undefined) out.aerodrome_id = msg.aerodrome_id
  if (msg.subject !== undefined) out.subject = msg.subject
  if (msg.body !== undefined) out.body = msg.body
  if (msg.read_at !== undefined) out.read_at = msg.read_at
  if (msg.replied_to !== undefined) out.replied_to = msg.replied_to
  if (msg.conversation_id !== undefined) out.conversation_id = msg.conversation_id
  if (msg.id !== undefined) out.id = msg.id
  if (msg.created_at !== undefined) out.created_at = msg.created_at
  return out
}

function unmarshalMessage(data: any): Message {
  const parseJSON = (val: any): any => {
    if (typeof val === 'string') {
      try { return JSON.parse(val) } catch { return val }
    }
    return val
  }
  return {
    ...data,
    to_id: parseJSON(data.to_id),
    cc_id: data.cc_id ? parseJSON(data.cc_id) : undefined,
    read_by: data.read_by ? parseJSON(data.read_by) : undefined,
    archived_by: data.archived_by ? parseJSON(data.archived_by) : undefined,
    attachments: data.attachments ? parseJSON(data.attachments) : undefined,
  }
}

export async function fetchMessages(userId: string): Promise<DatastoreResult<Message[]>> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`from_id.eq.${userId},to_id.eq.${userId}`)
    .limit(200)
  // Charger aussi les messages où l'utilisateur est en CC
  const { data: ccData, error: ccError } = await supabase
    .from('messages')
    .select('*')
    .filter('cc_id', 'cs', `["${userId}"]`)
    .limit(200)
  const merged = [...(data ?? []), ...(ccData ?? [])]
  const seen = new Set<string>()
  const unique = merged.filter(m => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
  unique.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return { data: unique.map(unmarshalMessage) as Message[], error: error?.message ?? ccError?.message ?? null }
}

export async function createMessage(payload: Omit<Message, 'id' | 'created_at'>): Promise<DatastoreResult<Message>> {
  try {
    const now = new Date().toISOString()
    const marshalled = marshalMessage(payload as Partial<Message>)
    // Utiliser l'ID fourni par le payload (même que l'optimistic update)
    if (!marshalled.id) marshalled.id = crypto.randomUUID()
    if (!marshalled.created_at) marshalled.created_at = now
    const { data, error } = await supabase
      .from('messages')
      .insert(marshalled)
      .select()
      .single()
    if (error) {
      console.error('[datastore/createMessage] Supabase error:', error)
      return { data: null, error: error?.message ?? null }
    }
    return { data: unmarshalMessage(data) as Message, error: null }
  } catch (err) {
    console.error('[datastore/createMessage] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function updateMessage(id: string, payload: Partial<Message>): Promise<DatastoreResult<Message>> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .update(marshalMessage(payload as any))
      .eq('id', id)
      .select()
      .single()
    if (error) {
      console.warn('[datastore/updateMessage] Supabase error:', error?.message || JSON.stringify(error))
      return { data: null, error: error?.message ?? JSON.stringify(error) }
    }
    return { data: unmarshalMessage(data) as Message, error: null }
  } catch (err) {
    console.warn('[datastore/updateMessage] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function deleteMessage(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('messages').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// AÉRODROMES
// ─────────────────────────────────────────────────────────────

export async function fetchAerodromes(): Promise<DatastoreResult<Aerodrome[]>> {
  const { data, error } = await supabase.from('aerodromes').select('*').order('nom')
  return { data: data as Aerodrome[] | null, error: error?.message ?? null }
}

export async function createAerodrome(payload: Omit<Aerodrome, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Aerodrome>> {
  const { data, error } = await supabase
    .from('aerodromes')
    .insert({ ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single()
  return { data: data as Aerodrome | null, error: error?.message ?? null }
}

export async function updateAerodrome(id: string, payload: Partial<Aerodrome>): Promise<DatastoreResult<Aerodrome>> {
  const { data, error } = await supabase
    .from('aerodromes')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Aerodrome | null, error: error?.message ?? null }
}

export async function deleteAerodrome(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('aerodromes').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// SURVEILLANCES
// ─────────────────────────────────────────────────────────────

export async function fetchSurveillances(): Promise<DatastoreResult<Surveillance[]>> {
  const { data, error } = await supabase
    .from('surveillances')
    .select('*')
    .order('date_debut', { ascending: false })
  return { data: data as Surveillance[] | null, error: error?.message ?? null }
}

export async function fetchSurveillanceById(id: string): Promise<DatastoreResult<Surveillance>> {
  const { data, error } = await supabase
    .from('surveillances')
    .select('*')
    .eq('id', id)
    .single()
  return { data: data as Surveillance | null, error: error?.message ?? null }
}

export async function createSurveillance(payload: Omit<Surveillance, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Surveillance>> {
  const now = new Date().toISOString()
  
  const { equipe_ids, sgs_evaluation_prepa, ...payloadSansSGS } = payload as any
  
  const { data, error } = await supabase
    .from('surveillances')
    .insert({ ...payloadSansSGS, created_at: now, updated_at: now })
    .select()
    .single()
  
  if (data && equipe_ids && equipe_ids.length > 0) {
    for (const userId of equipe_ids) {
      try {
        await supabase.from('surveillance_equipe').insert({
          surveillance_id: data.id,
          utilisateur_id: userId,
        })
      } catch { /* ignore */ }
    }
  }
  
  return { data: data as Surveillance | null, error: error?.message ?? null }
}

export async function updateSurveillance(id: string, payload: Partial<Surveillance>): Promise<DatastoreResult<Surveillance>> {
  const { equipe_ids, sgs_evaluation_prepa, ...payloadSansSGS } = payload as any
  
  const { data, error } = await supabase
    .from('surveillances')
    .update({ ...payloadSansSGS, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  
  // Mettre à jour les membres d'équipe dans la table junction
  if (data && equipe_ids !== undefined) {
    // Supprimer les anciens membres
    try { await supabase.from('surveillance_equipe').delete().eq('surveillance_id', id) } catch { /* ignore */ }
    // Insérer les nouveaux
    for (const userId of equipe_ids) {
      try {
        await supabase.from('surveillance_equipe').insert({
          surveillance_id: id,
          utilisateur_id: userId,
        })
      } catch { /* ignore */ }
    }
  }
  
  return { data: data as Surveillance | null, error: error?.message ?? null }
}

export async function deleteSurveillance(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('surveillances').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// ÉCARTS
// ─────────────────────────────────────────────────────────────

export async function fetchEcarts(surveillanceId?: string): Promise<DatastoreResult<Ecart[]>> {
  let query = supabase.from('ecarts').select('*').order('created_at', { ascending: false })
  if (surveillanceId) query = query.eq('surveillance_id', surveillanceId)
  const { data, error } = await query
  return { data: data as Ecart[] | null, error: error?.message ?? null }
}

export async function createEcart(payload: Omit<Ecart, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Ecart>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('ecarts')
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as Ecart | null, error: error?.message ?? null }
}

export async function updateEcart(id: string, payload: Partial<Ecart>): Promise<DatastoreResult<Ecart>> {
  const { data, error } = await supabase
    .from('ecarts')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    console.error('[datastore/updateEcart] Supabase error:', error)
  }
  return { data: data as Ecart | null, error: error?.message ?? null }
}

export async function upsertEcart(payload: Ecart): Promise<DatastoreResult<Ecart>> {
  const { data, error } = await supabase
    .from('ecarts')
    .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select()
    .single()
  if (error) {
    console.error('[datastore/upsertEcart] Supabase error message:', error.message)
    console.error('[datastore/upsertEcart] Supabase error details:', (error as any).details)
    console.error('[datastore/upsertEcart] Supabase error hint:', (error as any).hint)
    console.error('[datastore/upsertEcart] Supabase error code:', (error as any).code)
  }
  return { data: data as Ecart | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// ÉCARTS RÉDACTION (brouillons — persistance entre sessions)
// ─────────────────────────────────────────────────────────────

/**
 * Sauvegarde (upsert) les écarts rédaction d'une surveillance dans Supabase.
 * Appelé depuis les pages /ecarts et /ecarts/sgs après chaque modification.
 */
export async function upsertEcartsRedaction(ecarts: any[]): Promise<void> {
  if (!ecarts.length) return
  const { error } = await supabase
    .from('ecarts_redaction')
    .upsert(
      ecarts.map(e => ({ ...e, updated_at: new Date().toISOString() })),
      { onConflict: 'id', ignoreDuplicates: false }
    )
  if (error) console.error('[datastore] upsertEcartsRedaction error:', error.message)
}

/**
 * Charge les écarts rédaction d'une surveillance depuis Supabase.
 * Utilisé comme fallback dans passerEtapeSuivante si le store Zustand est vide.
 */
export async function fetchEcartsRedactionBySurveillance(surveillanceId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('ecarts_redaction')
    .select('*')
    .eq('surveillance_id', surveillanceId)
  if (error) console.error('[datastore] fetchEcartsRedactionBySurveillance error:', error.message)
  return data ?? []
}

// ─────────────────────────────────────────────────────────────
// CHECKLIST ITEMS
// ─────────────────────────────────────────────────────────────

export async function fetchChecklistItems(surveillanceId: string): Promise<DatastoreResult<ChecklistItem[]>> {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('surveillance_id', surveillanceId)
    .order('ordre')
  return { data: data as ChecklistItem[] | null, error: error?.message ?? null }
}

export async function upsertChecklistItem(item: ChecklistItem): Promise<DatastoreResult<ChecklistItem>> {
  const { data, error } = await supabase
    .from('checklist_items')
    .upsert({ ...item, last_modified: new Date().toISOString() })
    .select()
    .single()
  return { data: data as ChecklistItem | null, error: error?.message ?? null }
}

export async function batchUpsertChecklistItems(items: ChecklistItem[]): Promise<DatastoreResult<ChecklistItem[]>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('checklist_items')
    .upsert(items.map((i) => ({ ...i, last_modified: now })))
    .select()
  return { data: data as ChecklistItem[] | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// PLANNINGS
// ─────────────────────────────────────────────────────────────

export async function fetchPlannings(): Promise<DatastoreResult<Planning[]>> {
  const { data, error } = await supabase
    .from('plannings')
    .select('*')
    .order('date_debut', { ascending: false })
  return { data: data as Planning[] | null, error: error?.message ?? null }
}

export async function createPlanning(payload: Omit<Planning, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Planning>> {
  const now = new Date().toISOString()
  const { equipe_ids, ...restPayload } = payload as any
  const { data, error } = await supabase
    .from('plannings')
    .insert({ ...restPayload, created_at: now, updated_at: now })
    .select()
    .single()
  if (error || !data) return { data: null, error: error?.message ?? null }
  if (equipe_ids && equipe_ids.length > 0) {
    const rows = equipe_ids.map((uid: string) => ({ planning_id: data.id, utilisateur_id: uid }))
    await supabase.from('planning_equipe').insert(rows)
  }
  return { data: data as Planning | null, error: null }
}

export async function updatePlanning(id: string, payload: Partial<Planning>): Promise<DatastoreResult<Planning>> {
  const { equipe_ids, ...restPayload } = payload as any
  const { data, error } = await supabase
    .from('plannings')
    .update({ ...restPayload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) return { data: null, error: error?.message ?? null }
  if (equipe_ids !== undefined) {
    await supabase.from('planning_equipe').delete().eq('planning_id', id)
    if (equipe_ids.length > 0) {
      const rows = equipe_ids.map((uid: string) => ({ planning_id: id, utilisateur_id: uid }))
      await supabase.from('planning_equipe').insert(rows)
    }
  }
  return { data: data as Planning | null, error: null }
}

export async function deletePlanning(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('plannings').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// UTILISATEURS
// ─────────────────────────────────────────────────────────────

export async function fetchUtilisateurs(): Promise<DatastoreResult<Utilisateur[]>> {
  const { data, error } = await supabase.from('utilisateurs').select('*').order('nom')
  return { data: data as Utilisateur[] | null, error: error?.message ?? null }
}

export async function updateUtilisateur(id: string, payload: Partial<Utilisateur>): Promise<DatastoreResult<Utilisateur>> {
  const { data, error } = await supabase
    .from('utilisateurs')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Utilisateur | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────

export async function fetchNotifications(userId: string): Promise<DatastoreResult<Notification[]>> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('sent_at', { ascending: false })
    .limit(100)
  return { data: data as Notification[] | null, error: error?.message ?? null }
}

export async function markNotificationRead(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function sendNotification(payload: Omit<Notification, 'id' | 'sent_at' | 'read_at'>): Promise<DatastoreResult<Notification>> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({ ...payload, sent_at: new Date().toISOString() })
    .select()
    .single()
  return { data: data as Notification | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// PROFILS RISQUE
// ─────────────────────────────────────────────────────────────

export async function fetchProfilsRisque(): Promise<DatastoreResult<ProfilRisque[]>> {
  const { data, error } = await supabase.from('profils_risque').select('*')
  return { data: data as ProfilRisque[] | null, error: error?.message ?? null }
}

export async function upsertProfilRisque(profil: ProfilRisque): Promise<DatastoreResult<ProfilRisque>> {
  const { data, error } = await supabase
    .from('profils_risque')
    .upsert(profil)
    .select()
    .single()
  return { data: data as ProfilRisque | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// CERTIFICATIONS & HOMOLOGATIONS
// ─────────────────────────────────────────────────────────────

export async function fetchCertifications(): Promise<DatastoreResult<Certification[]>> {
  const { data, error } = await supabase.from('certifications').select('*')
  return { data: data as Certification[] | null, error: error?.message ?? null }
}

export async function updateCertification(id: string, payload: Partial<Certification>): Promise<DatastoreResult<Certification>> {
  const { data, error } = await supabase
    .from('certifications')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Certification | null, error: error?.message ?? null }
}

export async function fetchHomologations(): Promise<DatastoreResult<Homologation[]>> {
  const { data, error } = await supabase.from('homologations').select('*')
  return { data: data as Homologation[] | null, error: error?.message ?? null }
}

export async function updateHomologation(id: string, payload: Partial<Homologation>): Promise<DatastoreResult<Homologation>> {
  const { data, error } = await supabase
    .from('homologations')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Homologation | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// UPLOAD FICHIERS (Storage Supabase)
// ─────────────────────────────────────────────────────────────

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
): Promise<DatastoreResult<{ url: string }>> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
  if (error) return { data: null, error: error.message }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return { data: { url: data.publicUrl }, error: null }
}

export async function deleteFile(bucket: string, path: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// REALTIME SUBSCRIPTIONS
// ─────────────────────────────────────────────────────────────

export function subscribeToSurveillances(
  callback: (payload: { eventType: string; new: Surveillance; old: Surveillance }) => void,
) {
  return supabase
    .channel('surveillances_changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'surveillances' }, callback)
    .subscribe()
}

export function subscribeToEcarts(
  callback: (payload: { eventType: string; new: Ecart; old: Ecart }) => void,
) {
  return supabase
    .channel('ecarts_changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'ecarts' }, callback)
    .subscribe()
}

export function subscribeToNotifications(
  userId: string,
  callback: (payload: { eventType: string; new: Notification }) => void,
) {
  return supabase
    .channel(`notifications_${userId}`)
    .on(
      'postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      callback,
    )
    .subscribe()
}

// ─────────────────────────────────────────────────────────────
// INSPECTEURS
// ─────────────────────────────────────────────────────────────

export async function fetchInspecteurs(): Promise<DatastoreResult<Inspecteur[]>> {
  const { data, error } = await supabase.from('inspecteurs').select('*').order('nom')
  return { data: data as Inspecteur[] | null, error: error?.message ?? null }
}

export async function checkMatriculeExists(matricule: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('inspecteurs')
    .select('id')
    .eq('matricule', matricule.trim())
    .is('deleted_at', null)
    .maybeSingle()
  return !error && data !== null
}

export async function checkEmailExists(email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('inspecteurs')
    .select('id')
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()
  return !error && data !== null
}

export async function createInspecteur(payload: any): Promise<DatastoreResult<Inspecteur>> {
  const now = new Date().toISOString()
  
  // Nettoyer le payload pour n'envoyer que les colonnes valides
  const validColumns = [
    'matricule', 'prenom', 'nom', 'email', 'telephone',
    'type', 'service', 'domaine_principal', 'photo', 
    'statut', 'competences', 'created_at', 'deleted_at', 'deleted_by'
  ]
  
  const cleanPayload: any = { created_at: now }
  
  for (const key of validColumns) {
    if (payload[key] !== undefined) {
      // Pour competences, s'assurer que c'est un tableau de strings
      if (key === 'competences') {
        if (Array.isArray(payload[key])) {
          cleanPayload[key] = payload[key].map((item: any) => {
            if (typeof item === 'object' && item !== null) {
              // Si c'est un objet, extraire le domaine ou le texte
              return item.domaine || item.nom || JSON.stringify(item)
            }
            return String(item)
          })
        } else {
          cleanPayload[key] = []
        }
      } else {
        cleanPayload[key] = payload[key]
      }
    }
  }
  
  
  const { data, error } = await supabase
    .from('inspecteurs')
    .insert(cleanPayload)
    .select()
    .single()
    
  return { data: data as Inspecteur | null, error: error?.message ?? null }
}

export async function updateInspecteur(id: string, payload: Partial<Inspecteur>): Promise<DatastoreResult<Inspecteur>> {
  const { data, error } = await supabase
    .from('inspecteurs')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Inspecteur | null, error: error?.message ?? null }
}

export async function deleteInspecteur(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('inspecteurs').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// FORMATIONS
// ─────────────────────────────────────────────────────────────

export async function fetchFormations(): Promise<DatastoreResult<Formation[]>> {
  const { data, error } = await supabase.from('formations').select('*').order('date', { ascending: false })
  return { data: data as Formation[] | null, error: error?.message ?? null }
}

export async function createFormation(payload: Omit<Formation, 'id' | 'created_at'>): Promise<DatastoreResult<Formation>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('formations')
    .insert({ ...payload, created_at: now })
    .select()
    .single()
  return { data: data as Formation | null, error: error?.message ?? null }
}

export async function updateFormation(id: string, payload: Partial<Formation>): Promise<DatastoreResult<Formation>> {
  const { data, error } = await supabase
    .from('formations')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Formation | null, error: error?.message ?? null }
}

export async function deleteFormation(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('formations').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// EVENEMENTS
// ─────────────────────────────────────────────────────────────

export async function fetchEvenements(): Promise<DatastoreResult<EvenementSecurite[]>> {
  const { data, error } = await supabase.from('evenements_securite').select('*').order('date', { ascending: false })
  return { data: data as EvenementSecurite[] | null, error: error?.message ?? null }
}

export async function createEvenement(payload: Omit<EvenementSecurite, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<EvenementSecurite>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('evenements_securite')
    .insert({ ...payload, created_at: now, updated_at: now })
    .select()
    .single()
  return { data: data as EvenementSecurite | null, error: error?.message ?? null }
}

export async function updateEvenement(id: string, payload: Partial<EvenementSecurite>): Promise<DatastoreResult<EvenementSecurite>> {
  const { data, error } = await supabase
    .from('evenements_securite')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as EvenementSecurite | null, error: error?.message ?? null }
}

export async function deleteEvenement(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('evenements_securite').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// COMPETENCES
// ─────────────────────────────────────────────────────────────

export async function fetchCompetences(): Promise<DatastoreResult<Competence[]>> {
  const { data, error } = await supabase.from('competences').select('*')
  return { data: data as Competence[] | null, error: error?.message ?? null }
}

export async function createCompetence(payload: Omit<Competence, 'id'>): Promise<DatastoreResult<Competence>> {
  const { data, error } = await supabase
    .from('competences')
    .insert({ ...payload, id: crypto.randomUUID() })
    .select()
    .single()
  return { data: data as Competence | null, error: error?.message ?? null }
}

export async function getCompetencesByInspecteur(inspecteurId: string): Promise<DatastoreResult<Competence[]>> {
  const { data, error } = await supabase
    .from('competences')
    .select('*')
    .eq('inspecteur_id', inspecteurId)
  return { data: data as Competence[] | null, error: error?.message ?? null }
}

export async function updateCompetence(id: string, payload: Partial<Competence>): Promise<DatastoreResult<Competence>> {
  const { data, error } = await supabase
    .from('competences')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: data as Competence | null, error: error?.message ?? null }
}

export async function deleteCompetence(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('competences').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// UTILISATEURS (CRUD complet)
// ─────────────────────────────────────────────────────────────

export async function createUtilisateur(payload: Omit<Utilisateur, 'id'>): Promise<DatastoreResult<Utilisateur>> {
  const { data, error } = await supabase
    .from('utilisateurs')
    .insert({ ...payload, id: crypto.randomUUID() })
    .select()
    .single()
  return { data: data as Utilisateur | null, error: error?.message ?? null }
}

export async function deleteUtilisateur(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('utilisateurs').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// CODES ACCES (CRUD complet)
// ─────────────────────────────────────────────────────────────

export async function createCodeAcces(payload: CodeAcces): Promise<DatastoreResult<CodeAcces>> {
  const { data, error } = await supabase
    .from('codes_acces')
    .insert(payload)
    .select()
    .single()
  return { data: data as CodeAcces | null, error: error?.message ?? null }
}

export async function revokeCodeAcces(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('codes_acces')
    .update({ statut: 'revogue' })
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function deleteCodeAcces(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('codes_acces')
    .delete()
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// API KEYS
// ─────────────────────────────────────────────────────────────

export async function fetchApiKeys(): Promise<DatastoreResult<ApiKey[]>> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .order('service')
    .order('fallback_order')
  return { data: data as ApiKey[] | null, error: error?.message ?? null }
}

export async function createApiKey(payload: ApiKey): Promise<DatastoreResult<ApiKey>> {
  const { data, error } = await supabase
    .from('api_keys')
    .insert(payload)
    .select()
    .single()
  return { data: data as ApiKey | null, error: error?.message ?? null }
}

export async function updateApiKey(id: string, payload: Partial<ApiKey>): Promise<DatastoreResult<ApiKey>> {
  const { data, error } = await supabase
    .from('api_keys')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as ApiKey | null, error: error?.message ?? null }
}

export async function deleteApiKey(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('api_keys').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
