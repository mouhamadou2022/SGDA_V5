import { updateChecklistTemplate } from '../datastore/checklistTemplates'

const chaineSelect = (ligne: unknown) => ({
  select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: ligne, error: null }) }) }),
})

const fabriqueSupabase = (ligne: unknown, ecrit: { appele: boolean }) => ({
  from: () => ({
    ...chaineSelect(ligne),
    update: () => ({
      eq: () => ({ select: () => ({ single: () => { ecrit.appele = true; return Promise.resolve({ data: { id: 'x' }, error: null }) } }) }),
    }),
  }),
})

jest.mock('@/lib/supabase', () => ({
  get supabase() { return (global as Record<string, unknown>).__supabaseMock },
}))

describe('verrou optimiste templates', () => {
  test('sans attendu : écrit directement', async () => {
    const ecrit = { appele: false };
    (global as Record<string, unknown>).__supabaseMock = fabriqueSupabase(null, ecrit)
    const r = await updateChecklistTemplate('x', { nom: 'N' })
    expect(r.error).toBeNull()
    expect(ecrit.appele).toBe(true)
  })

  test('attendu identique : écrit', async () => {
    const ecrit = { appele: false };
    (global as Record<string, unknown>).__supabaseMock = fabriqueSupabase(
      { updated_at: '2026-01-01T00:00:00Z', updated_by: 'u1', metadonnees: {} }, ecrit)
    const r = await updateChecklistTemplate('x', { nom: 'N' }, '2026-01-01T00:00:00Z')
    expect(r.error).toBeNull()
    expect(ecrit.appele).toBe(true)
  })

  test('attendu dépassé : refuse avec auteur et date', async () => {
    const ecrit = { appele: false };
    (global as Record<string, unknown>).__supabaseMock = fabriqueSupabase(
      { updated_at: '2026-02-01T12:00:00Z', updated_by: 'u2', metadonnees: { updated_by_name: 'Awa Diallo' } }, ecrit)
    const r = await updateChecklistTemplate('x', { nom: 'N' }, '2026-01-01T00:00:00Z')
    expect(ecrit.appele).toBe(false)
    expect(r.error).toContain('Awa Diallo')
    expect(r.conflit).toMatchObject({ par: 'Awa Diallo' })
  })
})
