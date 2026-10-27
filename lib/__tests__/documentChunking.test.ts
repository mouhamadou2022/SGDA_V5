// lib/__tests__/documentChunking.test.ts
// Non-régression : les agents doivent lire TOUT le document, pas seulement
// ses premières parties (découpage + sélection + fusion).

import {
  decouperEnLots,
  estDemandeDocumentEntier,
  selectionnerLotsPertinents,
  motsClesRequete,
} from '../ia/documentChunking'

describe('decouperEnLots', () => {
  test('couvre tout le texte, dans l’ordre, sans perte', () => {
    const texte = Array.from({ length: 40 }, (_, i) => `Paragraphe ${i} : ${'x'.repeat(120)}`).join('\n\n')
    const lots = decouperEnLots(texte, 2000)
    expect(lots.length).toBeGreaterThan(1)
    expect(lots.map(l => l.texte).join('')).toBe(texte)
    expect(lots.map(l => l.index)).toEqual(lots.map((_, i) => i))
  })

  test('coupe sur un séparateur naturel plutôt qu’au milieu d’un mot', () => {
    const texte = 'Phrase une. '.repeat(500)
    const lots = decouperEnLots(texte, 1000)
    expect(lots.length).toBeGreaterThan(1)
    for (const lot of lots.slice(0, -1)) {
      expect(lot.texte.endsWith('. ') || lot.texte.endsWith('\n')).toBe(true)
    }
  })

  test('texte vide → aucun lot', () => {
    expect(decouperEnLots('', 1000)).toEqual([])
    expect(decouperEnLots('   \n ', 1000)).toEqual([])
  })
})

describe('selectionnerLotsPertinents', () => {
  test('trouve une exigence située à la FIN d’un long document', () => {
    const debut = 'Introduction générale sans rapport. '.repeat(600)
    const fin = 'La piste 18R doit disposer d’une RESA de 240 mètres.'
    const lots = decouperEnLots(debut + fin, 5000)
    const sel = selectionnerLotsPertinents(lots, 'Quelle est la longueur de la RESA de la piste 18R ?', 6000)
    expect(sel.texte).toContain('240 mètres')
    expect(sel.complet).toBe(false)
    expect(sel.lotsTotal).toBeGreaterThan(1)
  })

  test('sans mot-clé : échantillonne sur tout le document (jamais uniquement le début)', () => {
    const texte = Array.from({ length: 12 }, (_, i) => `Paragraphe ${i} ${'z'.repeat(700)}`).join('\n\n')
    const lots = decouperEnLots(texte, 2000)
    const sel = selectionnerLotsPertinents(lots, 'qqqq introuvable', 3000)
    expect(sel.texte).toContain('Paragraphe 0')
    expect(sel.texte).toMatch(/Paragraphe (6|7|8|9|10|11)/)
  })

  test('document plus petit que le budget : intégral, sans marqueur de coupe', () => {
    const lots = decouperEnLots('Petit document complet.', 5000)
    const sel = selectionnerLotsPertinents(lots, 'peu importe', 10000)
    expect(sel.complet).toBe(true)
    expect(sel.texte).toBe('Petit document complet.')
  })
})

describe('estDemandeDocumentEntier', () => {
  test('détecte les demandes globales', () => {
    expect(estDemandeDocumentEntier('Fais-moi une synthèse de ce document')).toBe(true)
    expect(estDemandeDocumentEntier('Résume tout le document')).toBe(true)
    expect(estDemandeDocumentEntier('Analyse complète du dossier')).toBe(true)
    expect(estDemandeDocumentEntier('Analyse ce document et liste les écarts')).toBe(true)
  })
  test('ne déclenche pas pour une question ciblée', () => {
    expect(estDemandeDocumentEntier('Quelle est la longueur de la RESA ?')).toBe(false)
    expect(estDemandeDocumentEntier('Que dit le chapitre 4 sur le balisage ?')).toBe(false)
  })
})

describe('motsClesRequete', () => {
  test('ignore accents, mots vides et doublons', () => {
    const mots = motsClesRequete('Quelle est la RÉSISTANCE de la piste ? piste')
    expect(mots).toContain('resistance')
    expect(mots).toContain('piste')
    expect(mots).not.toContain('quelle')
    expect(mots.filter(m => m === 'piste')).toHaveLength(1)
  })
})
