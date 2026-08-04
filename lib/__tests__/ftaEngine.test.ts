// lib/__tests__/ftaEngine.test.ts
import {
  TEMPLATES_FTA,
  getTemplatePourEvenement,
  getTemplateParId,
  creerArbreDepuisTemplate,
  marquerCausesDepuisEvenement,
  calculerProbabiliteSommet,
  calculerCoupesMinimales,
  calculerArbre,
  getCausesPresentes,
  getNiveauProbaArbre,
  type ArbreFTA,
} from '../risque/ftaEngine'

const evenement = { id: 'evt-1', aerodrome_id: 'a1', type: 'Incursion sur piste', description: 'Incursion d\'un véhicule', causes: ['coordination'] }

function arbreComplet(): ArbreFTA {
  return {
    id: 'fta-1',
    evenementId: 'evt-1',
    aerodromeId: 'a1',
    domaine: 'PHY',
    evenementLabel: 'Incursion',
    templateId: 'incursion-piste',
    sommetId: 's0',
    noeuds: [
      { id: 's0', label: 'Incursion de piste', type: 'sommet', porte: 'OU', probabilite: 0 },
      { id: 'i1', parentId: 's0', label: 'Coordination défaillante', type: 'intermediaire', porte: 'ET', probabilite: 0 },
      { id: 'b1', parentId: 'i1', label: 'Clairance erronée', type: 'cause', probabilite: 50, estPresent: null, causeRef: ['clairance'] },
      { id: 'b2', parentId: 'i1', label: 'Signalisation effacée', type: 'cause', probabilite: 50, estPresent: null, causeRef: ['signalisation'] },
      { id: 'b3', parentId: 's0', label: 'Procédure non respectée', type: 'cause', probabilite: 30, estPresent: null, causeRef: ['procédure'] },
    ],
    statut: 'en_cours',
    created_at: '',
    updated_at: '',
  }
}

describe('ftaEngine', () => {
  describe('templates', () => {
    it('retourne toujours un template (fallback générique)', () => {
      expect(TEMPLATES_FTA.length).toBeGreaterThan(5)
      expect(getTemplateParId('incursion-piste').libelle).toBe('Incursion de piste')
      expect(getTemplatePourEvenement({ type: 'inconnu' }).id).toBe('generique')
    })

    it('sélectionne le bon template selon le type', () => {
      expect(getTemplatePourEvenement({ type: 'Incursion sur piste' }).id).toBe('incursion-piste')
      expect(getTemplatePourEvenement({ type: 'Péril animalier' }).id).toBe('collision-animaliere')
      expect(getTemplatePourEvenement({ type: 'FOD' }).id).toBe('fod')
      expect(getTemplatePourEvenement({ type: 'Événement de balisage' }).id).toBe('panne-balisage')
    })
  })

  describe('creerArbreDepuisTemplate', () => {
    it('crée un arbre plat avec sommet et causes à null', () => {
      const arbre = creerArbreDepuisTemplate(evenement)
      expect(arbre.templateId).toBe('incursion-piste')
      expect(arbre.sommetId).toBe('s0')
      expect(arbre.noeuds.length).toBeGreaterThan(5)
      const sommet = arbre.noeuds.find((n) => n.type === 'sommet')!
      expect(sommet.type).toBe('sommet')
      expect(arbre.noeuds.filter((n) => n.type === 'cause').every((n) => n.estPresent === null)).toBe(true)
    })
  })

  describe('marquerCausesDepuisEvenement', () => {
    it('pré-remplit les causes dont les mots-clés matchent evenement.causes', () => {
      const marques = marquerCausesDepuisEvenement(arbreComplet().noeuds, { causes: ['clairance'] })
      const b1 = marques.find((n) => n.id === 'b1')!
      const b2 = marques.find((n) => n.id === 'b2')!
      expect(b1.estPresent).toBe(true)
      expect(b2.estPresent).toBe(false)
    })
  })

  describe('calculerProbabiliteSommet', () => {
    it('OU : 1 − ∏(1−p)', () => {
      const arbre = arbreComplet()
      // i1 = ET(50%,50%) = 25 % ; s0 = OU(25 %, 30 %) = 1 − (0.75 × 0.70) = 47.5 %
      expect(calculerProbabiliteSommet(arbre.noeuds, 's0')).toBe(47.5)
    })
  })

  describe('calculerCoupesMinimales', () => {
    it('calcule les combinaisons minimales ET/OU', () => {
      const arbre = arbreComplet()
      const coupes = calculerCoupesMinimales(arbre.noeuds, 's0')
      // OU(s0) = { ET(i1) => {b1,b2}, b3 } → 2 coupes
      expect(coupes.length).toBe(2)
      expect(coupes).toContainEqual(['b1', 'b2'])
      expect(coupes).toContainEqual(['b3'])
    })

    it('réduit les redondances sur une porte OU', () => {
      const noeuds = [
        { id: 's0', label: 'Sommet', type: 'sommet' as const, porte: 'OU' as const, probabilite: 0 },
        { id: 'b1', parentId: 's0', label: 'A', type: 'cause' as const, probabilite: 10 },
        { id: 'b2', parentId: 's0', label: 'A', type: 'cause' as const, probabilite: 10 },
      ]
      expect(calculerCoupesMinimales(noeuds, 's0')).toEqual([['b1'], ['b2']])
    })
  })

  describe('calculerArbre / getCausesPresentes', () => {
    it('annote les nœuds et retourne les causes présentes', () => {
      const arbre = arbreComplet()
      arbre.noeuds[2].estPresent = true // b1
      const calc = calculerArbre(arbre)
      expect(calc.probabiliteSommet).toBe(47.5)
      expect(calc.coupesMinimales.length).toBe(2)
      expect(getCausesPresentes(calc.noeuds).map((n) => n.id)).toEqual(['b1'])
    })
  })

  describe('getNiveauProbaArbre', () => {
    it('classifie la probabilité du sommet', () => {
      expect(getNiveauProbaArbre(40)).toBe('critique')
      expect(getNiveauProbaArbre(20)).toBe('eleve')
      expect(getNiveauProbaArbre(10)).toBe('moyen')
      expect(getNiveauProbaArbre(2)).toBe('faible')
    })
  })
})
