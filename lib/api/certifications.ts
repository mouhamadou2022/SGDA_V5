// lib/api/certifications.ts
// Client-side wrapper pour l'API certifications (contourne RLS via service_role)

import type { Certification } from '@/lib/store'

export async function createCertification(data: Partial<Certification>): Promise<{ data?: Certification; error?: string }> {
  try {
    const res = await fetch('/api/certifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` }
    return { data: json.data as Certification }
  } catch (err) {
    return { error: String(err) }
  }
}

export async function updateCertification(id: string, data: Partial<Certification>): Promise<{ data?: Certification; error?: string }> {
  try {
    const res = await fetch('/api/certifications', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    })
    const json = await res.json()
    if (!res.ok) return { error: json.error || `HTTP ${res.status}` }
    return { data: json.data as Certification }
  } catch (err) {
    return { error: String(err) }
  }
}
