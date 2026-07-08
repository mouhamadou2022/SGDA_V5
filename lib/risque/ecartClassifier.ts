// lib/risque/ecartClassifier.ts
// Classification de texte pour écarts — version légère (keywords + Weighted TF)
// Sans @xenova/transformers. Upgrade possible vers transformers plus tard.
// 0 dépendance, 0 API, 100% local

interface ClassifierResult {
  domaine: string
  score: number
  keywords: string[]
}

// Lexique domaine ↔ mots-clés (extensible)
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  SGS: ['sgs', 'manuel', 'procédure', 'documentation', 'processus', 'qualité', 'conformité doc', 'système de gestion', 'manuel d\'aérodrome', 'organisation', 'gestion documentaire'],
  PHY: ['clôture', 'piste', 'balisage', 'aire de trafic', 'surface', 'revêtement', 'terrain', 'obstacle', 'périmètre', 'accès', 'porte', 'grille', 'signalisation horizontale'],
  OLS: ['obstacle', 'surface de dégagement', 'hauteur', 'cône', 'approche', 'décollage', 'montée', 'atterrissage', 'visibilité', 'tranche d\'approche'],
  ELEC: ['électricité', 'groupe électrogène', 'éclairage', 'balisage lumineux', 'papi', 'pli', 'alimentation', 'batterie', 'panneau solaire', 'câble', 'tableau électrique'],
  MFP: ['moyen de sauvetage', 'extincteur', 'sécurité incendie', 'ssli', 'sslia', 'lutte contre l\'incendie', 'véhicule incendie', 'équipement de secours', 'alarme'],
  SLI: ['sécurité', 'sûreté', 'contrôle d\'accès', 'vigile', 'surveillance', 'intrusion', 'vidéosurveillance', 'fouille', 'inspection filtrage'],
  RA: ['réglementation', 'textes', 'arrêté', 'décret', 'loi', 'annexe', 'conformité régle', 'norme', 'certificat', 'agrément'],
  COP: ['coordination', 'compte rendu', 'communication', 'notam', 'briefing', 'réunion', 'compte-rendu', 'transmission', 'message'],
  OPS: ['exploitation', 'horaire', 'personnel', 'formation', 'qualification', 'permis', 'licence', 'certificat médical', 'effectif', 'astreinte'],
}

const DOMAINES = Object.keys(DOMAIN_KEYWORDS)

/**
 * Nettoie et normalise un texte pour la classification.
 */
function normalize(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Classifie un texte d'écart dans un domaine parmi les 9 domaines BT.
 * Retourne le domaine le plus probable avec un score de confiance.
 * Fallback : scoreToLabel inverse.
 */
export function classifyEcartTexte(texte: string, fallbackDomaine?: string): ClassifierResult {
  const cleaned = normalize(texte || '')
  if (!cleaned) return { domaine: fallbackDomaine || 'SGS', score: 0, keywords: [] }

  const words = cleaned.split(' ')

  const scores: Record<string, { score: number; matches: string[] }> = {}
  DOMAINES.forEach(d => { scores[d] = { score: 0, matches: [] } })

  for (const word of words) {
    if (word.length < 3) continue
    for (const domaine of DOMAINES) {
      for (const kw of DOMAIN_KEYWORDS[domaine]) {
        const kwWords = normalize(kw).split(' ').filter(w => w.length >= 3)
        const kwFirst = kwWords[0] || ''
        // Mot entier uniquement (pas de sous-chaîne)
        if ((kwFirst.length >= 3 && word === kwFirst) || kwWords.includes(word)) {
          scores[domaine].score++
          scores[domaine].matches.push(word)
          break
        }
      }
    }
  }

  // Phrase entière plutôt que mots isolés
  for (const domaine of DOMAINES) {
    for (const kw of DOMAIN_KEYWORDS[domaine]) {
      if (cleaned.includes(normalize(kw))) {
        scores[domaine].score += 3
        scores[domaine].matches.push(kw)
      }
    }
  }

  // Trouver le meilleur domaine
  let best = fallbackDomaine || 'SGS'
  let bestScore = 0
  for (const domaine of DOMAINES) {
    if (scores[domaine].score > bestScore) {
      bestScore = scores[domaine].score
      best = domaine
    }
  }

  return {
    domaine: best,
    score: Math.min(1, bestScore / 10),
    keywords: [...new Set(scores[best].matches)].slice(0, 5),
  }
}

/**
 * Suggère un niveau de risque basé sur le texte.
 * Règles simples : mots "critique", "urgence", "immédiat" → critique, etc.
 */
export function suggestGraviteFromTexte(texte: string): { gravite: string; score: number } {
  const cleaned = normalize(texte || '')
  const critiqueWords = ['critique', 'urgence', 'immédiat', 'accident', 'blessé', 'danger immédiat', 'incendie', 'explosion', 'effondrement']
  const eleveWords = ['grave', 'élevé', 'majeur', 'important', 'non conformité majeure', 'délai dépassé', 'récurrent']
  const moyenWords = ['moyen', 'modéré', 'amélioration', 'non conformité', 'anomalie', 'correction']
  const faibleWords = ['faible', 'mineur', 'observation', 'suggestion', 'information']

  for (const w of critiqueWords) { if (cleaned.includes(w)) return { gravite: 'critique', score: 0.9 } }
  for (const w of eleveWords) { if (cleaned.includes(w)) return { gravite: 'eleve', score: 0.7 } }
  for (const w of moyenWords) { if (cleaned.includes(w)) return { gravite: 'moyen', score: 0.6 } }
  for (const w of faibleWords) { if (cleaned.includes(w)) return { gravite: 'faible', score: 0.5 } }

  return { gravite: 'moyen', score: 0.3 }
}

export type SousTypeCOP = 'supervision' | 'communication' | 'formation' | 'charge'

const COP_KEYWORDS: Record<SousTypeCOP, string[]> = {
  supervision: [
    'supervision', 'encadrement', 'contrôle', 'management', 'hiérarchie',
    'chef', 'direction', 'responsable', 'autorité', 'délégation',
    'validation', 'approbation', 'signature', 'visa',
  ],
  communication: [
    'communication', 'coordination', 'notam', 'briefing', 'compte rendu',
    'compte-rendu', 'transmission', 'information', 'alerte', 'message',
    'réunion', 'point', 'rapport', 'échange', 'feedback',
  ],
  formation: [
    'formation', 'qualification', 'compétence', 'habilitation', 'permis',
    'licence', 'certificat médical', 'entraînement', 'stage', 'session',
    'cursus', 'évaluation', 'examen', 'test', 'niveau',
  ],
  charge: [
    'charge', 'effectif', 'personnel', 'astreinte', 'horaire',
    'disponibilité', 'recrutement', 'turnover', 'absentéisme',
    'surcharge', 'temps de travail', 'repos', 'planning',
  ],
}

export function classifySousTypeCOP(texte: string, fallback?: SousTypeCOP): { sousType: SousTypeCOP; score: number } {
  const cleaned = normalize(texte || '')
  if (!cleaned) return { sousType: fallback ?? 'supervision', score: 0 }

  const scores: Record<string, number> = { supervision: 0, communication: 0, formation: 0, charge: 0 }
  const words = cleaned.split(' ')

  for (const word of words) {
    if (word.length < 3) continue
    for (const [sousType, keywords] of Object.entries(COP_KEYWORDS)) {
      for (const kw of keywords) {
        const kwNorm = normalize(kw)
        if (word === kwNorm || cleaned.includes(kwNorm)) {
          scores[sousType] += kwNorm.includes(' ') ? 3 : 1
          break
        }
      }
    }
  }

  let best = fallback ?? 'supervision'
  let bestScore = 0
  for (const [st, sc] of Object.entries(scores)) {
    if (sc > bestScore) { bestScore = sc; best = st as SousTypeCOP }
  }

  return {
    sousType: best as SousTypeCOP,
    score: bestScore > 0 ? Math.min(1, bestScore / 5) : 0.25,
  }
}
