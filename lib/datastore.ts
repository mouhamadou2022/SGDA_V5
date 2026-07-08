// lib/datastore.ts — SGDA V5
// Source unique de vérité pour tous les accès Supabase.
// ✅ R3 : 0 fetch() dans les composants — tout passe ici.
// ✅ R4 : Fichier unique, pas de doublon Supabase ailleurs.

import { supabase } from './supabase'
import { getOACIValue } from './risque/matrix'

function groupEquipeIds(plannings: Planning[], equipeRows: { planning_id: string; utilisateur_id: string }[]): Planning[] {
  const map = new Map<string, string[]>()
  for (const row of equipeRows) {
    if (!map.has(row.planning_id)) map.set(row.planning_id, [])
    map.get(row.planning_id)!.push(row.utilisateur_id)
  }
  return plannings.map(p => ({ ...p, equipe_ids: map.get(p.id) || [] }))
}

import type {
  Aerodrome,
  Surveillance,
  Ecart,
  Dossier,
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
  RegistreEntry,
} from './store'
import type { EngineFeedbackRecord } from './ia/engines/engineFeedback'

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
  dossiers: Dossier[]
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
  registreEntries: RegistreEntry[]
}

// ─────────────────────────────────────────────────────────────
// CHARGEMENT INITIAL (appelé une seule fois au montage de AppShell)
// ─────────────────────────────────────────────────────────────

function normalizeInspecteurCompetences(ins: any): Inspecteur {
  if (!ins || !Array.isArray(ins.competences)) return ins as Inspecteur
  // Rétrocompatibilité : les competences étaient stockées en string[]
  // Maintenant on stocke des objets { domaine, niveau, ... }
  ins.competences = ins.competences.map((c: any) =>
    typeof c === 'string' ? { id: crypto.randomUUID(), domaine: c, niveau: 1 } : c
  )
  return ins as Inspecteur
}

export async function loadInitialData(userId: string, role: string): Promise<DatastoreResult<InitialData>> {
  try {
    const [
      aerodromesRes,
      surveillancesRes,
      ecartsRes,
      dossiersRes,
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
      planningEquipeRes,
      registreEntriesRes,
    ] = await Promise.all([
      supabase.from('aerodromes').select('*').order('nom'),
      supabase.from('surveillances').select('*').order('date_debut', { ascending: false }),
      supabase.from('ecarts').select('*').order('created_at', { ascending: false }),
      supabase.from('dossiers').select('*').order('created_at', { ascending: false }),
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
      supabase.from('planning_equipe').select('*'),
      supabase.from('registre_entries').select('*').order('date_entree', { ascending: false }),
    ])

    const planningsData = (planningsRes.data ?? []) as Planning[]
    const equipeRows = (planningEquipeRes?.data ?? []) as { planning_id: string; utilisateur_id: string }[]
    const planningsAvecEquipe = groupEquipeIds(planningsData, equipeRows)

    const errors = [
      aerodromesRes.error,
      surveillancesRes.error,
      ecartsRes.error,
      dossiersRes.error,
      utilisateursRes.error,
      planningsRes.error,
      certificationsRes.error,
      homologationsRes.error,
      profilsRes.error,
      notificationsRes.error,
      codesAccesRes?.error,
      formationsRes.error,
      inspecteursRes.error,
      competencesRes.error,
      kitDocumentsRes.error,
      messagesRes?.error,
      apiKeysRes?.error,
      registreEntriesRes?.error,
    ].filter(Boolean)

    if (errors.length > 0) {
      console.error('[datastore] Erreurs chargement initial:', errors)
    }

    // Créer une fonction interne pour calculer les profils manquants
    const aerodromes = (aerodromesRes.data ?? []) as Aerodrome[];
    const profilsExistants = (profilsRes.data ?? []) as ProfilRisque[];
    const profilsMap = new Map(profilsExistants.map(p => [p.aerodrome_id, p]));
    const nouveauxProfils: ProfilRisque[] = [];

    // Importer une seule fois hors de la boucle
    const { calculerProfilInitial } = await import('@/lib/risque/initialProfile');
    const upsertPromises = aerodromes
      .filter(a => !profilsMap.has(a.id))
      .map(async (aero) => {
        try {
          const result = calculerProfilInitial(aero as Aerodrome);
          await supabase.from('profils_risque').upsert(result.profil);
          console.log(`[Datastore] Profil calculé pour ${aero.code_oaci}`);
          return result.profil;
        } catch (err) {
          console.error(`[Datastore] Erreur calcul profil pour ${aero.code_oaci}:`, err);
          return null;
        }
      });
    const resolved = await Promise.all(upsertPromises);
    nouveauxProfils.push(...resolved.filter(Boolean) as ProfilRisque[]);

    return {
      data: {
        aerodromes: aerodromes,
        surveillances: (surveillancesRes.data ?? []) as Surveillance[],
        ecarts: ((ecartsRes.data ?? []) as Ecart[]).map(sanitizeEcart),
        dossiers: (dossiersRes.data ?? []) as Dossier[],
        utilisateurs: (utilisateursRes.data ?? []) as Utilisateur[],
        plannings: planningsAvecEquipe,
        certifications: (certificationsRes.data ?? []) as Certification[],
        homologations: (homologationsRes.data ?? []) as Homologation[],
        profilsRisque: [...profilsExistants, ...nouveauxProfils],
        notifications: (notificationsRes.data ?? []) as Notification[],
        checklistItems: [],
        codesAcces: (codesAccesRes.data ?? []) as CodeAcces[],
        formations: (formationsRes.data ?? []) as Formation[],
        inspecteurs: ((inspecteursRes.data ?? []) as any[]).map(ins => {
          const normalise = normalizeInspecteurCompetences(ins)
          // Si l'inspecteur n'a pas de compétences dans le JSONB (Path B),
          // les récupérer depuis la table competences séparée
          if ((!normalise.competences || normalise.competences.length === 0) && competencesRes.data) {
            const comps = (competencesRes.data as any[]).filter(c => c.inspecteur_id === ins.id)
            if (comps.length > 0) normalise.competences = comps
          }
          return normalise
        }),
        competences: [], // fusionné dans inspecteurs, plus besoin séparément
        kitDocuments: (kitDocumentsRes.data ?? []) as KitDocument[],
        messages: (messagesRes?.data ?? []).map(unmarshalMessage) as Message[],
        apiKeys: (apiKeysRes?.data ?? []) as ApiKey[],
        registreEntries: (registreEntriesRes?.data ?? []) as RegistreEntry[],
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
  
  let { data, error } = await supabase
    .from('surveillances')
    .insert({ ...payloadSansSGS, created_at: now, updated_at: now })
    .select()
    .single()

  // Sécurité : si le planning_id référence un planning inexistant en Supabase
  // (possible avec des bundles JS obsolètes), on réessaie sans planning_id.
  const isPlanningFkError = (err: unknown) =>
    typeof err === 'string' && err.toLowerCase().includes('surveillances_planning_id_fkey')
  if (error && isPlanningFkError(error.message) && 'planning_id' in payloadSansSGS) {
    const { planning_id: _, ...payloadSansPlanning } = payloadSansSGS
    const retry = await supabase
      .from('surveillances')
      .insert({ ...payloadSansPlanning, created_at: now, updated_at: now })
      .select()
      .single()
    data = retry.data
    error = retry.error
  }
  
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

// Reconstruit ou nettoie cellule_risque_oaci — corrige "NaNE", "-", etc.
export function sanitizeEcart(ecart: Ecart): Ecart {
  if (!ecart.cellule_risque_oaci) return ecart;
  if (/^[1-5][A-E]$/.test(ecart.cellule_risque_oaci)) return ecart;
  const meilleur = getOACIValue(ecart);
  if (meilleur) {
    console.warn(`[datastore] Reconstruit cellule_risque_oaci "${ecart.cellule_risque_oaci}" → "${meilleur}" pour ecart ${ecart.id}`);
    return { ...ecart, cellule_risque_oaci: meilleur };
  }
  console.warn(`[datastore] cellule_risque_oaci invalide "${ecart.cellule_risque_oaci}" pour ecart ${ecart.id}, impossible de reconstruire`);
  return { ...ecart, cellule_risque_oaci: undefined };
}

// ─────────────────────────────────────────────────────────────
// ÉCARTS
// ─────────────────────────────────────────────────────────────

export async function fetchEcarts(surveillanceId?: string): Promise<DatastoreResult<Ecart[]>> {
  let query = supabase.from('ecarts').select('*').order('created_at', { ascending: false })
  if (surveillanceId) query = query.eq('surveillance_id', surveillanceId)
  const { data, error } = await query
  return { data: ((data ?? []) as Ecart[]).map(sanitizeEcart) as Ecart[] | null, error: error?.message ?? null }
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

// Colonnes réelles de la table Supabase `ecarts_redaction` (doit rester aligné
// avec l'interface EcartRedaction dans store.ts). Tout champ hors de cette liste
// est rejeté par Supabase ("Could not find the 'X' column ... in the schema cache")
// car ces brouillons ne portent pas les champs propres à l'écart final (ex: delai_pac).
const ECARTS_REDACTION_COLUMNS = [
  'id', 'reference', 'ref_reglementaire', 'libelle', 'niveau', 'item_ids',
  'surveillance_id', 'aerodrome_id', 'created_at', 'created_by', 'updated_at', 'updated_by',
  'domaine', 'cellule_risque_oaci', 'probabilite_risque', 'gravite_risque',
  'justification_risque_ia', 'cellule_ia_suggeree',
] as const

function toEcartRedactionRow(e: Record<string, any>): Record<string, any> {
  const row: Record<string, any> = {}
  for (const col of ECARTS_REDACTION_COLUMNS) {
    if (e[col] !== undefined) row[col] = e[col]
  }
  return row
}

/**
 * Sauvegarde (upsert) les écarts rédaction d'une surveillance dans Supabase.
 * Appelé depuis les pages /ecarts et /ecarts/sgs après chaque modification.
 */
export async function upsertEcartsRedaction(ecarts: any[]): Promise<void> {
  if (!ecarts.length) return
  const { error } = await supabase
    .from('ecarts_redaction')
    .upsert(
      ecarts.map(e => toEcartRedactionRow({ ...e, updated_at: new Date().toISOString() })),
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
  const [planningsRes, equipeRes] = await Promise.all([
    supabase.from('plannings').select('*').order('date_debut', { ascending: false }),
    supabase.from('planning_equipe').select('*'),
  ])
  if (planningsRes.error) return { data: null, error: planningsRes.error.message }
  const data = groupEquipeIds(planningsRes.data as Planning[], (equipeRes.data ?? []) as any[])
  return { data, error: null }
}

export async function createPlanning(payload: Omit<Planning, 'id' | 'created_at' | 'updated_at'>): Promise<DatastoreResult<Planning>> {
  const now = new Date().toISOString()
  const { equipe_ids, id: _ignoredId, ...restPayload } = payload as any
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
  return { data: { ...data, equipe_ids: equipe_ids || [] } as Planning | null, error: null }
}

export async function updatePlanning(id: string, payload: Partial<Planning>): Promise<DatastoreResult<Planning>> {
  if (!id || !id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    console.error('[datastore] updatePlanning called with invalid id:', id)
    return { data: null, error: 'ID de planning invalide' }
  }
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
  return { data: { ...data, equipe_ids: equipe_ids ?? [] } as Planning | null, error: null }
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
// KIT DOCUMENTS
// ─────────────────────────────────────────────────────────────

export async function createKitDocument(doc: Omit<KitDocument, 'created_at' | 'updated_at'> & { created_at?: string; updated_at?: string }): Promise<DatastoreResult<KitDocument>> {
  const now = new Date().toISOString()
  const payload = { ...doc, created_at: doc.created_at || now, updated_at: doc.updated_at || now }
  const { data, error } = await supabase
    .from('kit_documents')
    .insert(payload)
    .select()
    .single()
  return { data: data as KitDocument | null, error: error?.message ?? null }
}

export async function updateKitDocument(id: string, data: Partial<KitDocument>): Promise<DatastoreResult<KitDocument>> {
  const payload = { ...data, updated_at: new Date().toISOString() }
  const { data: result, error } = await supabase
    .from('kit_documents')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data: result as KitDocument | null, error: error?.message ?? null }
}

export async function deleteKitDocument(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase
    .from('kit_documents')
    .delete()
    .eq('id', id)
  return { data: null, error: error?.message ?? null }
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
// IA FEEDBACK — Apprentissage continu AERORISQ
// ─────────────────────────────────────────────────────────────

export async function fetchIAFeedbacks(aerodromeId?: string): Promise<DatastoreResult<EngineFeedbackRecord[]>> {
  let query = supabase.from('ia_feedback').select('*').order('created_at', { ascending: false }).limit(200)
  if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
  const { data, error } = await query
  return { data: data as EngineFeedbackRecord[] | null, error: error?.message ?? null }
}

export async function createIAFeedback(payload: Omit<EngineFeedbackRecord, 'id' | 'date'>): Promise<DatastoreResult<EngineFeedbackRecord>> {
  const { data, error } = await supabase
    .from('ia_feedback')
    .insert({
      engine_type: payload.engineType,
      aerodrome_id: payload.aerodromeId,
      planning_id: payload.contexte?.planningId || null,
      surveillance_id: payload.contexte?.surveillanceId || null,
      decision_type: payload.decision.type,
      decision_data: JSON.parse(JSON.stringify(payload.decision.donnees)),
      vote: payload.vote,
      commentaire: payload.commentaire || null,
      user_id: null,
    })
    .select()
    .single()
  return { data: data as EngineFeedbackRecord | null, error: error?.message ?? null }
}

export async function syncIAFeedbacks(feedbacks: EngineFeedbackRecord[]): Promise<DatastoreResult<number>> {
  const rows = feedbacks.map(f => ({
    engine_type: f.engineType,
    aerodrome_id: f.aerodromeId,
    planning_id: f.contexte?.planningId || null,
    surveillance_id: f.contexte?.surveillanceId || null,
    decision_type: f.decision.type,
    decision_data: JSON.parse(JSON.stringify(f.decision.donnees)),
    vote: f.vote,
    commentaire: f.commentaire || null,
    synced_at: new Date().toISOString(),
  }))
  const { error, count } = await supabase.from('ia_feedback').upsert(rows, { ignoreDuplicates: true })
  return { data: count ?? 0, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// IA THRESHOLDS — Seuils dynamiques persistés
// ─────────────────────────────────────────────────────────────

export interface ThresholdRow {
  id: string
  parametre: string
  valeur: number
  engine: string
  raison?: string
  actif: boolean
}

export async function fetchThresholds(): Promise<DatastoreResult<ThresholdRow[]>> {
  const { data, error } = await supabase.from('ia_thresholds').select('*').eq('actif', true)
  return { data: data as ThresholdRow[] | null, error: error?.message ?? null }
}

export async function upsertThreshold(parametre: string, valeur: number, engine: string, raison?: string): Promise<DatastoreResult<ThresholdRow>> {
  const { data, error } = await supabase
    .from('ia_thresholds')
    .upsert({ parametre, valeur, engine, raison: raison || null, actif: true }, { onConflict: 'parametre' })
    .select()
    .single()
  return { data: data as ThresholdRow | null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// IA DECISIONS — Historique des décisions AERORISQ
// ─────────────────────────────────────────────────────────────

export interface DecisionRow {
  id: string
  aerodrome_id: string
  type: string
  date_decision: string
  recommendation_action?: string
  recommendation_type?: string
  recommendation_urgence?: string
  certificat_action?: string
  declencheur_type?: string
  suggestion_type?: string
  suggestion_confiance?: number
  status: string
  effectiveness: string
  applied_at?: string
  commentaire?: string
  confiance?: number
}

export async function fetchDecisions(aerodromeId?: string): Promise<DatastoreResult<DecisionRow[]>> {
  let query = supabase.from('ia_decisions').select('*').order('created_at', { ascending: false }).limit(100)
  if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
  const { data, error } = await query
  return { data: data as DecisionRow[] | null, error: error?.message ?? null }
}

export async function createDecision(payload: {
  aerodrome_id: string
  type: string
  recommendation_action?: string
  recommendation_type?: string
  recommendation_urgence?: string
  certificat_action?: string
  declencheur_type?: string
  suggestion_type?: string
  suggestion_confiance?: number
  confiance?: number
}): Promise<DatastoreResult<DecisionRow>> {
  const { data, error } = await supabase
    .from('ia_decisions')
    .insert({ ...payload, status: 'pending', effectiveness: 'non_evalue', date_decision: new Date().toISOString() })
    .select()
    .single()
  return { data: data as DecisionRow | null, error: error?.message ?? null }
}

export async function updateDecisionStatus(id: string, status: string, effectiveness?: string, commentaire?: string): Promise<DatastoreResult<null>> {
  const upd: Record<string, any> = { status }
  if (status === 'applied') upd.applied_at = new Date().toISOString()
  if (effectiveness) upd.effectiveness = effectiveness
  if (commentaire) upd.commentaire = commentaire
  const { error } = await supabase.from('ia_decisions').update(upd).eq('id', id)
  return { data: null, error: error?.message ?? null }
}

// ─────────────────────────────────────────────────────────────
// IA MODEL STATE — Poids des modèles ML persistés
// ─────────────────────────────────────────────────────────────

export interface ModelStateRow {
  id: string
  model_name: string
  aerodrome_id?: string
  version: number
  weights: Record<string, number>
  biases: Record<string, number>
  total_feedbacks: number
  accuracy_history: number[]
  learning_rate: number
  model_data: Record<string, unknown>
}

export async function fetchModelState(modelName: string, aerodromeId?: string): Promise<DatastoreResult<ModelStateRow>> {
  let query = supabase.from('ia_model_state').select('*').eq('model_name', modelName)
  if (aerodromeId) query = query.eq('aerodrome_id', aerodromeId)
  const { data, error } = await query.maybeSingle()
  return { data: data as ModelStateRow | null, error: error?.message ?? null }
}

export async function upsertModelState(payload: {
  model_name: string
  aerodrome_id?: string
  version: number
  weights: Record<string, number>
  biases: Record<string, number>
  total_feedbacks: number
  accuracy_history: number[]
  learning_rate: number
  model_data?: Record<string, unknown>
}): Promise<DatastoreResult<ModelStateRow>> {
  const { data, error } = await supabase
    .from('ia_model_state')
    .upsert({
      model_name: payload.model_name,
      aerodrome_id: payload.aerodrome_id || null,
      version: payload.version,
      weights: payload.weights,
      biases: payload.biases,
      total_feedbacks: payload.total_feedbacks,
      accuracy_history: payload.accuracy_history,
      learning_rate: payload.learning_rate,
      model_data: payload.model_data || {},
    }, { onConflict: 'model_name,aerodrome_id' })
    .select()
    .single()
  return { data: data as ModelStateRow | null, error: error?.message ?? null }
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

export async function createCertification(payload: Certification): Promise<DatastoreResult<Certification>> {
  try {
    const allowedCols = [
      'id', 'aerodrome_id', 'reference', 'phase_active', 'phases_data',
      'statut_global', 'numero_cert', 'date_delivrance', 'date_expiration',
      'lettre_signee_url', 'type_certification', 'archived_at', 'exemptions_ids',
      'created_at',
    ]
    const clean: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowedCols) {
      if ((payload as any)[key] !== undefined) {
        clean[key] = (payload as any)[key]
      }
    }
    if (!clean.created_at) clean.created_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('certifications')
      .insert(clean)
      .select()
      .single()
    if (error) {
      console.error('[datastore/createCertification] Supabase error:', JSON.stringify(error))
      if ((error as any).details) console.error('[datastore/createCertification] details:', (error as any).details)
      if ((error as any).code) console.error('[datastore/createCertification] code:', (error as any).code)
    }
    return { data: data as Certification | null, error: error?.message ?? JSON.stringify(error) ?? null }
  } catch (err) {
    console.error('[datastore/createCertification] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function updateCertification(id: string, payload: Partial<Certification>): Promise<DatastoreResult<Certification>> {
  try {
    // Ne transmettre que les colonnes connues de la table certifications
    const allowedCols = [
      'id', 'aerodrome_id', 'reference', 'phase_active', 'phases_data',
      'statut_global', 'numero_cert', 'date_delivrance', 'date_expiration',
      'lettre_signee_url', 'type_certification', 'archived_at', 'exemptions_ids',
    ]
    // Éviter d'écraser created_at
    const clean: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowedCols) {
      if ((payload as any)[key] !== undefined) {
        clean[key] = (payload as any)[key]
      }
    }

    const { data, error } = await supabase
      .from('certifications')
      .update(clean)
      .eq('id', id)
      .select()
      .single()
    if (error) {
      console.error('[datastore/updateCertification] Supabase error:', JSON.stringify(error))
      if ((error as any).details) console.error('[datastore/updateCertification] details:', (error as any).details)
      if ((error as any).hint) console.error('[datastore/updateCertification] hint:', (error as any).hint)
      if ((error as any).code) console.error('[datastore/updateCertification] code:', (error as any).code)
    }
    return { data: data as Certification | null, error: error?.message ?? JSON.stringify(error) ?? null }
  } catch (err) {
    console.error('[datastore/updateCertification] Exception:', err)
    return { data: null, error: String(err) }
  }
}

export async function deleteCertification(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('certifications').delete().eq('id', id)
  if (error) console.error('[datastore/deleteCertification] Supabase error:', error)
  return { data: null, error: error?.message ?? null }
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
// REGISTRE ENTRIES (Archivage)
// ─────────────────────────────────────────────────────────────

export async function saveRegistreEntry(entry: RegistreEntry): Promise<DatastoreResult<RegistreEntry>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('registre_entries')
    .upsert({
      id: entry.id,
      type: entry.type,
      reference: entry.reference,
      titre: entry.titre,
      description: entry.description,
      date_entree: entry.date_entree,
      aerodrome_id: entry.aerodrome_id || null,
      fichiers: JSON.parse(JSON.stringify(entry.fichiers)),
      timeline: JSON.parse(JSON.stringify(entry.timeline)),
      statut: entry.statut,
      auto_generated: entry.auto_generated,
      source_id: entry.source_id || null,
      source_type: entry.source_type || null,
      metadata: entry.metadata || null,
      ia_analysis: entry.ia_analysis || null,
      created_by: entry.created_by,
      updated_at: now,
    }, { onConflict: 'id' })
    .select()
    .single()
  return { data: data as RegistreEntry | null, error: error?.message ?? null }
}

export async function deleteRegistreEntryFromDB(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('registre_entries').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}

export async function getRegistreEntriesFromDB(): Promise<DatastoreResult<RegistreEntry[]>> {
  const { data, error } = await supabase
    .from('registre_entries')
    .select('*')
    .order('date_entree', { ascending: false })
  return { data: data as RegistreEntry[] | null, error: error?.message ?? null }
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

export function subscribeToCertifications(
  callback: (payload: { eventType: string; new: Certification; old: Certification }) => void,
) {
  return supabase
    .channel('certifications_changes')
    .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'certifications' }, callback)
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

export function subscribeToMessages(
  userId: string,
  callback: (payload: { eventType: string; new: any }) => void,
) {
  return supabase
    .channel(`messages_${userId}`)
    .on(
      'postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `to_id=eq.${userId}` },
      callback,
    )
    .subscribe()
}

// ─────────────────────────────────────────────────────────────
// INSPECTEURS
// ─────────────────────────────────────────────────────────────

export async function fetchInspecteurs(): Promise<DatastoreResult<Inspecteur[]>> {
  const { data, error } = await supabase.from('inspecteurs').select('*').order('nom')
  return { data: (data as any[])?.map(normalizeInspecteurCompetences) ?? null, error: error?.message ?? null }
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
    'id', 'matricule', 'prenom', 'nom', 'email', 'telephone',
    'type', 'service', 'domaine_principal', 'photo', 
    'statut', 'competences', 'created_at', 'deleted_at', 'deleted_by'
  ]
  
  const cleanPayload: any = { created_at: now }
  
  for (const key of validColumns) {
    if (payload[key] !== undefined) {
      // competences : colonne jsonb → stocker les objets complets
      if (key === 'competences') {
        cleanPayload[key] = Array.isArray(payload[key]) ? payload[key] : []
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

// ─────────────────────────────────────────────────────────────
// DOSSIERS
// ─────────────────────────────────────────────────────────────

export async function createDossier(payload: Partial<Dossier> & { titre: string; reference: string; statut: string }): Promise<DatastoreResult<Dossier>> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('dossiers')
    .insert({ ...payload, created_at: payload.created_at || now, updated_at: now })
    .select()
    .single()
  return { data: data as Dossier | null, error: error?.message ?? null }
}

export async function updateDossier(id: string, payload: Partial<Dossier>): Promise<DatastoreResult<Dossier>> {
  const { data, error } = await supabase
    .from('dossiers')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  return { data: data as Dossier | null, error: error?.message ?? null }
}

export async function deleteDossier(id: string): Promise<DatastoreResult<null>> {
  const { error } = await supabase.from('dossiers').delete().eq('id', id)
  return { data: null, error: error?.message ?? null }
}
