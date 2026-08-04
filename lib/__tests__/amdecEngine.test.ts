// lib/__tests__/amdecEngine.test.ts
import {
  calculeIPR,
  getIPRNiveau,
  calculeMalusC3,
  getMalusC3Details,
  analyseDepuisCatalogue,
  recalculerAnalyse,
  CATALOGUE_AMDEC,
  getSystemesParDomaine,
} from '../risque/amdecEngine'

describe('amdecEngine', () => {
  describe('calculeIPR', () => {
    it('calcule G×P×D avec la gravité OACI (A=5 … E=1)', () => {
      expect(calculeIPR('A', 5, 5)).toBe(125)
      expect(calculeIPR('A', 1, 1)).toBe(5)
      expect(calculeIPR('C', 3, 3)).toBe(27)
      expect(calculeIPR('E', 5, 5)).toBe(25)
    })

    it('borne la probabilité et la détection entre 1 et 5', () => {
      expect(calculeIPR('A', 9, 9)).toBe(125)
      expect(calculeIPR('A', 0, 0)).toBe(5)
    })
  })

  describe('getIPRNiveau', () => {
    it('classifie les seuils de criticité', () => {
      expect(getIPRNiveau(60)).toBe('critique')
      expect(getIPRNiveau(100)).toBe('critique')
      expect(getIPRNiveau(40)).toBe('eleve')
      expect(getIPRNiveau(59)).toBe('eleve')
      expect(getIPRNiveau(20)).toBe('moyen')
      expect(getIPRNiveau(39)).toBe('moyen')
      expect(getIPRNiveau(1)).toBe('faible')
      expect(getIPRNiveau(19)).toBe('faible')
    })
  })

  describe('calculeMalusC3', () => {
    const base = {
      id: 'x', aerodrome_id: 'a1', mode_id: 'm', domaine: 'SLI',
      systeme: 'S', equipement: 'E', mode_defaillance: 'M', effet: '',
      cause: '', detection: '', gravite: 'A' as const, probabilite: 3,
      detection_score: 3, ipr: 0, niveau: 'critique' as const,
      statut: 'analyse' as const, created_at: '', updated_at: '',
    }

    it('retourne 0 sans analyse', () => {
      expect(calculeMalusC3([])).toBe(0)
    })

    it('applique -5 par mode critique non corrigé, plafonné à 20', () => {
      const critiques = Array.from({ length: 5 }, (_, i) => ({ ...base, id: `c${i}` }))
      expect(calculeMalusC3(critiques)).toBe(20)
      const un = [{ ...base }]
      expect(calculeMalusC3(un)).toBe(5)
    })

    it('applique -2 par mode élevé', () => {
      const eleves = [{ ...base, niveau: 'eleve' as const }, { ...base, niveau: 'eleve' as const }]
      expect(calculeMalusC3(eleves)).toBe(4)
    })

    it('ignore les modes corrigés', () => {
      const corriges = [{ ...base, statut: 'corrige' as const }]
      expect(calculeMalusC3(corriges)).toBe(0)
    })
  })

  describe('getMalusC3Details', () => {
    it('détaille critiques et élevés', () => {
      const analyses = [
        { id: 'a', aerodrome_id: 'a1', mode_id: 'm', domaine: 'SLI', systeme: 'S', equipement: 'E', mode_defaillance: 'M', effet: '', cause: '', detection: '', gravite: 'A' as const, probabilite: 3, detection_score: 3, ipr: 100, niveau: 'critique' as const, statut: 'analyse' as const, created_at: '', updated_at: '' },
        { id: 'b', aerodrome_id: 'a1', mode_id: 'm', domaine: 'ELEC', systeme: 'S', equipement: 'E', mode_defaillance: 'M', effet: '', cause: '', detection: '', gravite: 'B' as const, probabilite: 4, detection_score: 3, ipr: 48, niveau: 'eleve' as const, statut: 'analyse' as const, created_at: '', updated_at: '' },
      ]
      expect(getMalusC3Details(analyses)).toEqual({ malus: 7, critiques: 1, eleves: 1 })
    })
  })

  describe('catalogue', () => {
    it('expose des modes de défaillance pour tous les domaines techniques', () => {
      expect(CATALOGUE_AMDEC.length).toBeGreaterThan(10)
      const domaines = new Set(CATALOGUE_AMDEC.map((m) => m.domaine))
      expect(domaines.has('SLI')).toBe(true)
      expect(domaines.has('ELEC')).toBe(true)
      expect(domaines.has('PHY')).toBe(true)
    })

    it('groupe par domaine puis système', () => {
      const groupes = getSystemesParDomaine()
      expect(Array.isArray(groupes)).toBe(true)
      expect(groupes[0].systemes.length).toBeGreaterThan(0)
    })
  })

  describe('analyseDepuisCatalogue / recalculerAnalyse', () => {
    it('crée une analyse avec IPR calculé depuis le catalogue', () => {
      const mode = CATALOGUE_AMDEC[0]
      const analyse = analyseDepuisCatalogue(mode, 'a1')
      expect(analyse.aerodrome_id).toBe('a1')
      expect(analyse.ipr).toBe(calculeIPR(mode.gravite, mode.probabilite, mode.detectionScore))
      expect(analyse.niveau).toBe(getIPRNiveau(analyse.ipr))
      expect(analyse.statut).toBe('a_analyser')
    })

    it('recalcule IPR et niveau après modification des cotes', () => {
      const mode = CATALOGUE_AMDEC[0]
      const analyse = analyseDepuisCatalogue(mode, 'a1')
      const resultat = recalculerAnalyse({ ...analyse, gravite: 'A', probabilite: 5, detection_score: 5 })
      expect(resultat.ipr).toBe(125)
      expect(resultat.niveau).toBe('critique')
    })
  })
})
