// lib/api/evenements.ts
// Client-side wrapper pour l'API événements (contourne RLS via service_role)

import type { EvenementSecurite } from '@/lib/store'

export async function createEvenementAPI(data: Partial<EvenementSecurite>): Promise<{ data?: EvenementSecurite; error?: string }> {
  try {
    const res = await fetch('/api/evenements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` }
    return { data: json.data as EvenementSecurite }
  } catch (err) {
    return { error: String(err) }
  }
}

export async function updateEvenementAPI(id: string, data: Partial<EvenementSecurite>): Promise<{ data?: EvenementSecurite; error?: string }> {
  try {
    const res = await fetch('/api/evenements', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` }
    return { data: json.data as EvenementSecurite }
  } catch (err) {
    return { error: String(err) }
  }
}
