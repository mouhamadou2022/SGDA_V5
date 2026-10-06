// components/forms/__tests__/AerodromeEnrichissement.test.ts
// Le formulaire délègue à la route serveur /api/ia/aerodromes-ourairports
// (matching testé dans lib/__tests__/ourAirports.test.ts) : ici on vérifie
// le requêtage (paramètres) et les replis (erreur réseau → null).
import { searchOurAirportsByName, detectCodeOaci } from '../AerodromeForm'

const MATCH_GOBD = {
  oaci: 'GOBD', type: 'large_airport', nom: 'Blaise Diagne Intl',
  municipality: 'Diass', region_iso: 'SN-DK',
  latitude: 14.67, longitude: -17.07, altitude: 87,
}

describe('detectCodeOaci', () => {
  it('détecte GO + toute l’Afrique de l’Ouest', () => {
    expect(detectCodeOaci('Aéroport GOBD')).toBe('GOBD')
    expect(detectCodeOaci('piste DXXX en travaux')).toBe('DXXX')
    expect(detectCodeOaci('sans code ici')).toBe('')
  })
})

describe('searchOurAirportsByName (via route serveur)', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ match: MATCH_GOBD }) })
  })
  it('appelle la route avec nom + coordonnées et renvoie le match', async () => {
    const r = await searchOurAirportsByName('diass', 14.67, -17.07)
    expect(r?.oaci).toBe('GOBD')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('/api/ia/aerodromes-ourairports?')
    expect(url).toContain('nom=diass')
    expect(url).toContain('lat=14.67')
  })
  it('réseau en erreur → null (pas de crash, message véridique ensuite)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('CORS'))
    await expect(searchOurAirportsByName('diass', 14.67, -17.07)).resolves.toBeNull()
  })
  it('route sans match → null', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ match: null }) })
    await expect(searchOurAirportsByName('xyz', 48.85, 2.35)).resolves.toBeNull()
  })
})
