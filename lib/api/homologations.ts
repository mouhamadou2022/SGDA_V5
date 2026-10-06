// lib/api/homologations.ts
// Client-side wrapper pour l'API homologations (contourne RLS via service_role)
// Miroir de lib/api/certifications.ts.

import type { Homologation } from '@/lib/store'

export async function createHomologation(data: Partial<Homologation>): Promise<{ data?: Homologation; error?: string }> {
  try {
    const res = await fetch('/api/homologations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` }
    return { data: json.data as Homologation }
  } catch (err) {
    return { error: String(err) }
  }
}

export async function updateHomologation(id: string, data: Partial<Homologation>): Promise<{ data?: Homologation; error?: string }> {
  try {
    const res = await fetch('/api/homologations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` }
    return { data: json.data as Homologation }
  } catch (err) {
    return { error: String(err) }
  }
}
