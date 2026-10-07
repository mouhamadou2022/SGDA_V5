// components/forms/__tests__/AerodromeEnrichissement.test.ts
// Le formulaire délègue à la route serveur /api/ia/aerodromes-ourairports
// (matching testé dans lib/__tests__/ourAirports.test.ts) : ici on vérifie
// le requêtage (paramètres) et les replis (erreur réseau → null).
import { searchOurAirportsByName, detectCodeOaci, estValeurSaisie, fusionnerValeursSaisies, lignesDiagnosticEnrichissement, editeurPourChamp, normaliserValeurEditee } from '../AerodromeForm'

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

describe('estValeurSaisie', () => {
  it('0, vide, null, undefined, NaN = non renseigné', () => {
    expect(estValeurSaisie(0)).toBe(false)
    expect(estValeurSaisie('')).toBe(false)
    expect(estValeurSaisie('   ')).toBe(false)
    expect(estValeurSaisie(null)).toBe(false)
    expect(estValeurSaisie(undefined)).toBe(false)
    expect(estValeurSaisie(NaN)).toBe(false)
  })
  it('valeur réelle (dont altitude 87) = renseigné', () => {
    expect(estValeurSaisie(87)).toBe(true)
    expect(estValeurSaisie('GOBD')).toBe(true)
    expect(estValeurSaisie(['PAPI'])).toBe(true)
    expect(estValeurSaisie([])).toBe(false)
  })
})

describe('fusionnerValeursSaisies', () => {
  const fabriqueSuggestion = () => ({
    altitude: { value: 20, confidence: 80, source: 'training' },
    nom: { value: 'Deviné', confidence: 60, source: 'training' },
  }) as any
  it('la valeur saisie (altitude 87) écrase la suggestion (20), confiance 100, source saisie', () => {
    const s = fabriqueSuggestion()
    const proteges = fusionnerValeursSaisies(s, (c) => (c === 'altitude' ? 87 : ''))
    expect(s.altitude.value).toBe(87)
    expect(s.altitude.confidence).toBe(100)
    expect(s.altitude.source).toBe('saisie')
    expect(proteges.has('altitude')).toBe(true)
    // Champ non saisi : suggestion intacte, non protégée
    expect(s.nom.value).toBe('Deviné')
    expect(proteges.has('nom')).toBe(false)
  })
  it('0 = non saisi : la suggestion IA est conservée', () => {
    const s = fabriqueSuggestion()
    fusionnerValeursSaisies(s, () => 0)
    expect(s.altitude.value).toBe(20)
  })
})

describe('lignesDiagnosticEnrichissement', () => {

  it('vide total : 5 lignes, tout en echec sauf la recherche nommee', () => {
    const lignes = lignesDiagnosticEnrichissement({
      nomCherche: 'Piste de Kedougou', oaciDetecte: '', ourAirportsTrouve: false,
      regionTrouvee: false, llmRepondu: false, jsonExploitable: false,
    })
    expect(lignes).toHaveLength(5)
    expect(lignes.filter(l => l.ok)).toHaveLength(1)
    expect(lignes[0].label).toContain('Kedougou')
  })
  it('tout ok : 5 coches', () => {
    const lignes = lignesDiagnosticEnrichissement({
      nomCherche: 'GOBD', oaciDetecte: 'GOBD', ourAirportsTrouve: true,
      regionTrouvee: true, llmRepondu: true, jsonExploitable: true,
    })
    expect(lignes.filter(l => l.ok)).toHaveLength(5)
  })
})

describe('editeurPourChamp', () => {
  it('listes alignées sur le formulaire', () => {
    const region = editeurPourChamp('region')
    expect(region.kind).toBe('liste')
    if (region.kind === 'liste') expect(region.options.map(o => o.value)).toContain('Dakar')
    const statut = editeurPourChamp('statut_sgs')
    expect(statut.kind).toBe('liste')
    const installation = editeurPourChamp('heli_type_installation')
    expect(installation.kind).toBe('liste')
    if (installation.kind === 'liste') expect(installation.options.length).toBeGreaterThan(0)
  })
  it('nombres, booléens, texte par défaut', () => {
    expect(editeurPourChamp('altitude').kind).toBe('nombre')
    expect(editeurPourChamp('piste_longueur').kind).toBe('nombre')
    expect(editeurPourChamp('heli_gpu').kind).toBe('booleen')
    expect(editeurPourChamp('nom').kind).toBe('texte')
    expect(editeurPourChamp('champ_inconnu_xyz').kind).toBe('texte')
  })
  it('maturité SGS : liste 1-5 (jamais de texte libre)', () => {
    const m = editeurPourChamp('maturite_sgs_suggered')
    expect(m.kind).toBe('liste')
    if (m.kind === 'liste') expect(m.options.map(o => o.value)).toEqual(['1', '2', '3', '4', '5'])
  })
})

describe('normaliserValeurEditee', () => {
  it('nombres restent des nombres', () => {
    expect(normaliserValeurEditee('87', 20, 'altitude')).toBe(87)
    expect(normaliserValeurEditee('3.5', 0, 'piste_pcr')).toBe(3.5)
  })
  it('textes restent des chaînes (téléphones à zéro initial préservés)', () => {
    expect(normaliserValeurEditee('771234567', '', 'exploitant_telephone')).toBe('771234567')
    expect(normaliserValeurEditee('0331234567', '', 'exploitant_telephone')).toBe('0331234567')
  })
  it('booléens parsés, OACI en majuscules', () => {
    expect(normaliserValeurEditee('true', false, 'heli_gpu')).toBe(true)
    expect(normaliserValeurEditee('false', true, 'heli_avitaillement')).toBe(false)
    expect(normaliserValeurEditee('gobd', '', 'code_oaci')).toBe('GOBD')
  })
})
