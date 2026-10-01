import { listerOutils, trouverOutil, declarerOutil } from '../ia/pilote/outils'

describe('registre outils pilote', () => {
  test('noms uniques, descriptions renseignées', () => {
    const outils = listerOutils()
    expect(outils.length).toBeGreaterThanOrEqual(4)
    expect(new Set(outils.map(o => o.nom)).size).toBe(outils.length)
    for (const o of outils) expect(o.description.length).toBeGreaterThan(10)
  })

  test('écritures soumises à confirmation (brouillons uniquement)', () => {
    const ecritures = listerOutils().filter(o => o.ecriture).map(o => o.nom).sort()
    expect(ecritures).toEqual(['creer_ecart', 'proposer_surveillance'])
  })

  test('lectures : résumé, comparatif, recalcul, suivi', () => {
    for (const nom of ['resumer_activite', 'comparer_sites', 'recalculer_profil_risque', 'suivi_surveillances']) {
      const outil = trouverOutil(nom)
      expect(outil).toBeDefined()
      expect(outil!.ecriture).toBe(false)
    }
    expect(trouverOutil('comparer_sites')!.requis).toContain('sites')
    expect(trouverOutil('creer_ecart')!.requis).toEqual(
      expect.arrayContaining(['site', 'domaine', 'libelle', 'niveau_risque']),
    )
  })

  test('déclaration Ollama bien formée', () => {
    const outil = trouverOutil('proposer_surveillance')!
    const decl = declarerOutil(outil) as {
      type: string
      function: { name: string; parameters: { required: string[] } }
    }
    expect(decl.type).toBe('function')
    expect(decl.function.name).toBe('proposer_surveillance')
    expect(decl.function.parameters.required).toContain('site')
    expect(decl.function.parameters.required).toContain('date_debut')
    expect(trouverOutil('outil_inexistant')).toBeUndefined()
  })
})
