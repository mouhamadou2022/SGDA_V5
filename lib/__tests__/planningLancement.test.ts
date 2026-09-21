// lib/__tests__/planningLancement.test.ts — Phase suivante
// Briques pures du lancement planning → surveillance
// (lib/planning-lancement.ts). Testées isolément (aucun store).

import {
  calculerPorteeLancement,
  buildNouvelleSurveillance,
  convertirDelegationsPlanning,
  resoudreTypeSurveillance,
  construireMessageExploitants,
  nomsEquipe,
  appliquerPredictionsPrefill,
  peutLancer,
} from '../planning-lancement'

const PLANNING = {
  id: 'p1',
  aerodrome_id: 'a1',
  type: 'certification',
  portee: ['SGS'],
  equipe_ids: ['insp-1'],
  chef_id: 'chef-1',
  date_debut: '2026-03-01T00:00:00.000Z',
  date_fin: '2026-03-03T00:00:00.000Z',
}

describe('calculerPorteeLancement', () => {
  test('certification : 9 domaines avec SGS, 8 sans', () => {
    expect(calculerPorteeLancement('certification', [], true)).toEqual(
      ['SGS', 'SLI', 'PHY', 'OLS', 'RA', 'ELEC', 'MFP', 'COP', 'OPS'])
    expect(calculerPorteeLancement('certification', [], false)).not.toContain('SGS')
  })
  test('homologation : SGS ajouté si applicable, portée sinon', () => {
    expect(calculerPorteeLancement('homologation', ['PHY'], true)).toEqual(['SGS', 'PHY'])
    expect(calculerPorteeLancement('homologation', ['PHY'], false)).toEqual(['PHY'])
    expect(calculerPorteeLancement('periodique', ['SGS'], true)).toEqual(['SGS'])
    expect(calculerPorteeLancement('periodique', undefined, true)).toEqual([])
  })
})

describe('buildNouvelleSurveillance', () => {
  test('champs repris + statut en_cours', () => {
    const s = buildNouvelleSurveillance(PLANNING as never, ['SGS'], '2026-03-01T00:00:00.000Z', '2026-03-03T00:00:00.000Z')
    expect(s).toMatchObject({
      aerodrome_id: 'a1', planning_id: 'p1', type: 'certification',
      chef_id: 'chef-1', statut: 'en_cours',
    })
  })
})

describe('convertirDelegationsPlanning', () => {
  const hierarchy = [{
    nom: 'SGS',
    items: [{ id: 'i1' }, { id: 'i2' }],
  }]
  test('mapping → Delegation[], vide ignoré, domaine en majuscules', () => {
    const planning = { ...PLANNING, delegations: { sgs: 'insp-1', phy: '' } }
    const res = convertirDelegationsPlanning(
      planning as never, 's1', 'chef-1', hierarchy as never, 'chef-1', 'now')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({
      surveillance_id: 's1', domaine: 'SGS', assigne_a: 'insp-1',
      statut: 'assigne', progression: 0,
    })
    expect(res[0].items_ids).toEqual(['i1', 'i2'])
  })
  test('sans mapping → vide', () => {
    expect(convertirDelegationsPlanning(
      PLANNING as never, 's1', 'chef-1', [], 'chef-1', 'now')).toEqual([])
  })
})

describe('resoudreTypeSurveillance', () => {
  test('mapping exhaustif, jamais de hardcode programmee', () => {
    expect(resoudreTypeSurveillance('inopine')).toBe('inopine')
    expect(resoudreTypeSurveillance('certification')).toBe('certification')
    expect(resoudreTypeSurveillance('suivi_ecarts')).toBe('suivi_ecarts')
    expect(resoudreTypeSurveillance('inconnu')).toBe('periodique')
  })
})

describe('divers', () => {
  test('construireMessageExploitants contient les champs', () => {
    const msg = construireMessageExploitants({
      typeLabel: 'périodique', domainesLabels: 'SGS', dateDebut: '01/03/2026',
      dateFin: '03/03/2026', equipeNoms: 'A B', aeroCode: 'GOOO',
    })
    expect(msg).toContain('GOOO')
    expect(msg).toContain('01/03/2026')
    expect(msg).toContain('A B')
  })
  test('nomsEquipe : repli id si inconnu', () => {
    const users = [{ id: 'u1', prenom: 'A', nom: 'B' }]
    expect(nomsEquipe(['u1', 'u2'], users as never)).toBe('A B, u2')
  })
  test('peutLancer : chef uniquement', () => {
    expect(peutLancer('c', 'c')).toBe(true)
    expect(peutLancer('x', 'c')).toBe(false)
    expect(peutLancer(undefined, 'c')).toBe(false)
  })
  test('appliquerPredictionsPrefill : hiérarchie vide → false, sans crash', () => {
    expect(appliquerPredictionsPrefill([], {
      aerodromeId: 'a1', typeSurv: 'periodique',
    })).toBe(false)
  })
})
