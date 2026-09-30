// syntheseNationaleIA : fallback déterministe (test isolé, sans IA).

import {
  fallbackSyntheseNationale,
  type ContexteNational,
} from '../ia/syntheseNationaleIA'

const base: ContexteNational = {
  scoreNational: 72,
  totalAerodromes: 10,
  critiques: 1,
  eleves: 2,
  nomsCritiques: ['GOOO'],
  nomsEleves: ['GOBD', 'GOOK'],
  certifsExpirantes: 2,
  certifies: 6,
  homologues: 2,
  pacRetard: 3,
  ecartsCritiquesOuverts: 1,
  surveillancesAn: 12,
  signaturesAttente: 1,
  tendance6m: 'baisse',
  prediction3m: 70,
  prediction6m: 68,
  probabiliteDegradation: 0.6,
  confiancePrediction: 0.75,
  regions: [
    { region: 'Dakar', scoreMoyen: 85, critiques: 0 },
    { region: 'Ziguinchor', scoreMoyen: 45, critiques: 1 },
  ],
}

describe('fallbackSyntheseNationale', () => {
  test('résumé : état + priorité + tendance, avec chiffres réels', () => {
    const s = fallbackSyntheseNationale(base)
    expect(s.resume).toContain('72/100')
    expect(s.resume).toContain('GOOO')
    expect(s.resume).toContain('dégradation')
    expect(s.fallbackIA).toBe(true)
  })
  test('priorités : critiques > PAC > certifs > calme', () => {
    expect(fallbackSyntheseNationale(base).pac).toContain('1 écart')
    expect(fallbackSyntheseNationale(base).alertes).toContain('GOOO')
    const calme = fallbackSyntheseNationale({
      ...base, critiques: 0, eleves: 0, pacRetard: 0, certifsExpirantes: 0,
      nomsCritiques: [], nomsEleves: [], signaturesAttente: 0, ecartsCritiquesOuverts: 0,
    })
    expect(calme.alertes).toContain('nominale')
    expect(calme.pac).toContain('à jour')
    expect(calme.missions).toContain('Aucun dossier')
  })
  test('écarts critiques sans site classé : message explicite', () => {
    const s = fallbackSyntheseNationale({
      ...base, critiques: 0, eleves: 0, nomsCritiques: [], nomsEleves: [],
      ecartsCritiquesOuverts: 2,
    })
    expect(s.alertes).toContain('2 écart(s) critique(s) ouvert(s)')
  })
  test('prévisions et régions chiffrées', () => {
    const s = fallbackSyntheseNationale(base)
    expect(s.previsions).toContain('68/100')
    expect(s.previsions).toContain('60 %')
    expect(s.regions).toContain('Dakar')
    expect(s.regions).toContain('Ziguinchor')
  })
  test('aucune division par zéro sans aérodromes', () => {
    const s = fallbackSyntheseNationale({ ...base, totalAerodromes: 0, certifies: 0, homologues: 0 })
    expect(s.conformite).toContain('0 % en règle')
  })
})
