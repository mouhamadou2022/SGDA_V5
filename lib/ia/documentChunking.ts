// lib/ia/documentChunking.ts
// Découpage des documents longs en lots qui tiennent dans la fenêtre du modèle.
//
// Problème corrigé : plusieurs agents ne lisaient que le DÉBUT d'un document
// (`texte.substring(0, N)`), donc toute exigence située après les N premiers
// caractères était ignorée (réponses/synthèses/checklists incomplètes).
//
// Principe : on découpe TOUT le texte en lots (respectant les paragraphes et
// les phrases), puis :
//  - soit on sélectionne les lots les plus pertinents pour la question ;
//  - soit on parcourt tous les lots (map) avant de fusionner (reduce).
// Aucune fonction ici ne fait d'appel réseau : module pur, testable.

export interface LotDocument {
  /** Position du lot dans le document (0-based). */
  index: number
  texte: string
  /** Offset de début dans le texte source. */
  debut: number
  /** Offset de fin (exclu) dans le texte source. */
  fin: number
}

/** Taille minimale d'un lot : évite une avalanche de micro-lots. */
const TAILLE_MIN_LOT = 500

/** Séparateurs préférés, du plus structurant au plus fin. */
const SEPARATEURS = ['\n\n', '\n', '. ', ' ']

/**
 * Découpe un texte en lots d'au plus `maxChars` caractères.
 * La coupe se fait de préférence sur un paragraphe / une phrase / un mot,
 * jamais au milieu d'un mot quand un séparateur existe dans la seconde moitié
 * du lot. Les offsets permettent de reconstituer l'ordre du document.
 */
export function decouperEnLots(texte: string, maxChars = 12000): LotDocument[] {
  const source = (texte || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!source.trim()) return []

  const taille = Math.max(TAILLE_MIN_LOT, Math.floor(maxChars))
  const lots: LotDocument[] = []
  let debut = 0

  while (debut < source.length) {
    let fin = Math.min(source.length, debut + taille)

    if (fin < source.length) {
      const fenetre = source.slice(debut, fin)
      const seuil = Math.floor(taille * 0.5)
      let coupe = -1
      for (const sep of SEPARATEURS) {
        const pos = fenetre.lastIndexOf(sep)
        if (pos >= seuil) {
          coupe = pos + sep.length
          break
        }
      }
      if (coupe > 0) fin = debut + coupe
    }

    const morceau = source.slice(debut, fin)
    if (morceau.trim()) {
      lots.push({ index: lots.length, texte: morceau, debut, fin })
    }
    // Garde-fou : ne jamais boucler sur place.
    debut = fin > debut ? fin : debut + taille
  }

  return lots
}

/** Normalise pour la recherche : minuscules, sans accents. */
export function normaliserTexte(texte: string): string {
  return (texte || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const MOTS_VIDES = new Set([
  'avec', 'dans', 'pour', 'cette', 'ces', 'les', 'des', 'une', 'aux', 'que',
  'qui', 'quoi', 'dont', 'est', 'sont', 'sur', 'par', 'pas', 'plus', 'tout',
  'tous', 'toute', 'toutes', 'document', 'documents', 'fichier', 'analyse',
  'analyser', 'peux', 'peut', 'faire', 'donne', 'donner', 'resume', 'synthese',
  'selon', 'quel', 'quelle', 'quels', 'quelles', 'comment', 'pourquoi',
])

/** Mots significatifs d'une requête (>= 4 lettres, hors mots vides). */
export function motsClesRequete(requete: string): string[] {
  const mots = normaliserTexte(requete)
    .split(/[^a-z0-9]+/)
    .filter(m => m.length >= 4 && !MOTS_VIDES.has(m))
  return [...new Set(mots)]
}

/**
 * Vrai si la demande porte sur le document dans son ensemble (synthèse,
 * résumé, analyse complète…) : dans ce cas il faut parcourir tous les lots,
 * pas seulement les plus « pertinents ».
 */
export function estDemandeDocumentEntier(question: string): boolean {
  const q = normaliserTexte(question)
  const marqueurs = [
    'tout le document', 'tous les documents', 'document entier', 'documents entiers',
    'en entier', 'integral', 'integralement', 'de bout en bout',
    'synthese', 'resume', 'resumer', 'analyse complete', 'analyse globale',
    'analyse ce document', 'analyse le document', 'analyse les documents',
    'analyse l ensemble', "l'ensemble du document", 'ensemble du document',
    'globalement', 'de maniere globale', 'vue d ensemble',
  ]
  return marqueurs.some(m => q.includes(m))
}

export interface SelectionLots {
  texte: string
  lotsLus: number
  lotsTotal: number
  /** Tous les lots sont présents dans `texte`. */
  complet: boolean
}

/**
 * Sélectionne, dans TOUT le document, les lots les plus pertinents pour la
 * requête, jusqu'à `budgetChars`. Les lots retenus sont remis dans l'ordre du
 * document. Si la requête ne correspond à aucun lot, on échantillonne des lots
 * répartis sur l'ensemble du document (jamais uniquement le début).
 */
export function selectionnerLotsPertinents(
  lots: LotDocument[],
  requete: string,
  budgetChars = 12000,
): SelectionLots {
  if (lots.length === 0) return { texte: '', lotsLus: 0, lotsTotal: 0, complet: true }

  const budget = Math.max(1000, Math.floor(budgetChars))
  const totalDocument = lots.reduce((s, l) => s + l.texte.length, 0)
  if (totalDocument <= budget) {
    return {
      texte: lots.map(l => l.texte).join(''),
      lotsLus: lots.length,
      lotsTotal: lots.length,
      complet: true,
    }
  }

  const mots = motsClesRequete(requete)
  const scores = lots.map(lot => {
    const bas = normaliserTexte(lot.texte)
    let score = 0
    for (const mot of mots) {
      let pos = bas.indexOf(mot)
      while (pos !== -1) {
        score++
        pos = bas.indexOf(mot, pos + mot.length)
      }
    }
    return { lot, score }
  })

  const retenus = new Set<number>()
  let total = 0
  const meilleurScore = scores.reduce((max, s) => Math.max(max, s.score), 0)

  if (meilleurScore > 0) {
    const classes = [...scores].sort((a, b) => b.score - a.score || a.lot.index - b.lot.index)
    for (const { lot, score } of classes) {
      if (total >= budget) break
      if (score === 0 && retenus.size > 0) break
      retenus.add(lot.index)
      total += lot.texte.length
    }
  } else {
    // Aucun mot-clé trouvé : échantillonner des lots répartis sur TOUT le
    // document (début, milieu, fin), jamais uniquement le début.
    const tailleMoyenne = Math.max(1, Math.round(totalDocument / lots.length))
    const nbMax = Math.max(1, Math.ceil(budget / tailleMoyenne))
    if (nbMax >= lots.length) {
      lots.forEach(l => retenus.add(l.index))
    } else {
      for (let k = 0; k < nbMax; k++) {
        const idx = nbMax === 1 ? 0 : Math.round((k * (lots.length - 1)) / (nbMax - 1))
        retenus.add(lots[idx].index)
      }
    }
    total = [...retenus].reduce((s, i) => s + lots[i].texte.length, 0)
  }

  const choisis = lots
    .filter(l => retenus.has(l.index))
    .sort((a, b) => a.index - b.index)

  let texte = choisis
    .map(l => `[... partie ${l.index + 1}/${lots.length} du document ...]\n${l.texte}`)
    .join('\n\n')

  if (texte.length > budget) {
    texte = texte.slice(0, budget) + '\n[… fin de l’extrait sélectionné …]'
  }

  return {
    texte,
    lotsLus: choisis.length,
    lotsTotal: lots.length,
    complet: choisis.length === lots.length,
  }
}
