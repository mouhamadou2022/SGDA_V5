// lib/datastore/_shared.ts — Socle du hub datastore (source unique).
// Types + helpers purs partages par les domaines. Les acces Supabase
// vivent dans les fichiers de domaine ; le hub lib/datastore.ts re-exporte.

import type { Message, Delegation, ReponseEnquete, Ecart, Planning, Inspecteur } from '../store';
import { getOACIValue } from '../risque/matrix';

export interface DatastoreResult<T> {
  data: T | null
  error: string | null
}

export function groupEquipeIds(plannings: Planning[], equipeRows: { planning_id: string; utilisateur_id: string }[]): Planning[] {
  const map = new Map<string, string[]>()
  for (const row of equipeRows) {
    if (!map.has(row.planning_id)) map.set(row.planning_id, [])
    map.get(row.planning_id)!.push(row.utilisateur_id)
  }
  return plannings.map(p => ({ ...p, equipe_ids: map.get(p.id) || [] }))
}

export function marshalMessage(msg: Partial<Message>): any {
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

export function unmarshalMessage(data: any): Message {
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

export function marshalDelegation(d: Delegation): Record<string, unknown> {
  const { assigne_nom: _ignoré, ...colonnes } = d
  return colonnes as Record<string, unknown>
}

export function unmarshalDelegation(row: any): Delegation {
  return {
    ...row,
    items_ids: Array.isArray(row.items_ids) ? row.items_ids : [],
  } as Delegation
}

export function unmarshalReponseEnquete(row: any): ReponseEnquete {
  return {
    ...row,
    score_c1: row.score_c1 === null || row.score_c1 === undefined ? undefined : Number(row.score_c1),
  } as ReponseEnquete
}

export function normalizeInspecteurCompetences(ins: any): Inspecteur {
  if (!ins || !Array.isArray(ins.competences)) return ins as Inspecteur
  // Rétrocompatibilité : les competences étaient stockées en string[]
  // Maintenant on stocke des objets { domaine, niveau, ... }
  ins.competences = ins.competences.map((c: any) =>
    typeof c === 'string' ? { id: crypto.randomUUID(), domaine: c, niveau: 1 } : c
  )
  return ins as Inspecteur
}

// Reconstruit ou nettoie cellule_risque_oaci.
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
