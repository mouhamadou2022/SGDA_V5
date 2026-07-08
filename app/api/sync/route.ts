// app/api/sync/route.ts
// API endpoint pour flusher la file de synchronisation offline
// Reçoit : { items: SyncQueueItem[] }
// Pour chaque item : upsert ou delete dans Supabase selon store + operation

import { NextRequest, NextResponse } from 'next/server'

interface SyncItem {
  id: string
  store: string
  operation: 'create' | 'update' | 'delete'
  recordId: string
  payload: any
}

const STORE_TO_TABLE: Record<string, string> = {
  idb_checklists: 'checklist_items',
  idb_surveillances: 'surveillances',
  idb_ecarts: 'ecarts',
  idb_rapports: 'rapports',
  idb_pac: 'plan_action',
  idb_evenements: 'evenements_securite',
  idb_dossiers: 'dossiers',
  idb_messages: 'messages',
  idb_signatures: 'signatures',
  idb_delegations: 'delegations',
  idb_alertes: 'alertes_securite',
  idb_fiches_presence: 'fiches_presence',
  idb_risk_index_feedbacks: 'risk_index_feedbacks',
  idb_checklist_hierarchy: 'checklist_hierarchy',
  idb_checklist_templates: 'checklist_templates',
}

export async function POST(req: NextRequest) {
  try {
    const { items }: { items: SyncItem[] } = await req.json()
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ synced: 0, errors: [] })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Supabase non configuré' }, { status: 500 })
    }
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

    const results: { id: string; status: 'ok' | 'error'; error?: string }[] = []

    for (const item of items) {
      try {
        const table = STORE_TO_TABLE[item.store]
        if (!table) {
          results.push({ id: item.id, status: 'error', error: `Store inconnu: ${item.store}` })
          continue
        }

        if (item.operation === 'delete') {
          const { error } = await sb.from(table).delete().eq('id', item.recordId)
          if (error) throw error
        } else {
          const { error } = await sb.from(table).upsert({ id: item.recordId, ...item.payload })
          if (error) throw error
        }

        results.push({ id: item.id, status: 'ok' })
      } catch (err: any) {
        results.push({ id: item.id, status: 'error', error: err.message })
      }
    }

    const synced = results.filter((r) => r.status === 'ok').length
    const errors = results.filter((r) => r.status === 'error').map((r) => r.error!)
    return NextResponse.json({ synced, errors: errors.length > 0 ? errors : undefined })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
