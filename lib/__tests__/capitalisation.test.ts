import {
  hacherTexte,
  paireEcartResolu,
  hashPreuve,
  estImageTranscrivable,
} from '../ia/capitalisation'

describe('capitalisation', () => {
  test('hash stable', () => {
    expect(hacherTexte('abc')).toBe(hacherTexte('abc'))
    expect(hacherTexte('abc')).not.toBe(hacherTexte('abd'))
  })

  test('paire écart résolu complète', () => {
    const p = paireEcartResolu({
      reference: 'ECA-2026-001',
      libelle: 'Fissures sur la piste',
      domaine: 'PHY',
      niveau_risque: 'moyen',
      pac: { actions: [{ description: 'Reboucher les fissures', responsable: 'Chef maintenance' }] },
      evaluation_notes: { pertinence: 4, realisme: 3 },
    })
    expect(p).not.toBeNull()
    expect(p!.module).toBe('ecart-resolu')
    expect(p!.texte).toContain('Fissures')
    expect(p!.texte).toContain('Reboucher')
    expect(p!.hash).toContain('ecart-resolu::')
  })

  test('sans PAC : inexploitable', () => {
    expect(paireEcartResolu({ libelle: 'X', pac: { actions: [] } })).toBeNull()
    expect(paireEcartResolu({ libelle: '', pac: null })).toBeNull()
  })

  test('images transcrivables', () => {
    expect(estImageTranscrivable('https://x.supabase.co/fissure.jpg')).toBe(true)
    expect(estImageTranscrivable('https://x/photo.PNG')).toBe(true)
    expect(estImageTranscrivable('https://x/doc.pdf')).toBe(false)
    expect(estImageTranscrivable('blob:http://localhost/abc')).toBe(false)
  })

  test('hash preuve', () => {
    expect(hashPreuve('https://x/a.jpg')).toBe(hashPreuve('https://x/a.jpg'))
  })
})
