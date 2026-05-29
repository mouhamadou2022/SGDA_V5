// lib/risque/predictions.ts
// Fonctions partagées de prédiction d'incidents
// Utilisées par : Profil de Risque (C5) + EvenementAnalytics

export interface SaisonStats {
  parMois: { mois: number; tot: number; critiques: number }[]
  moyenneCritiques: number
  ecartType: number
}

export interface PredictionMois {
  mois: string
  moisIndex: number
  critiques: number
  probabilite: number
  tendance: string
  saisons: string[]
  typeDominant: string
}

export interface IncidentPredictions {
  prediction3m: number    // probabilité 0-1
  prediction6m: number
  prediction12m: number
  details: PredictionMois[]
  saisonStats: SaisonStats
}

/**
 * Calcule les statistiques saisonnières sur 12 mois glissants
 */
export function computeSaisonStats(evenements: { date: string; gravite?: string }[]): SaisonStats {
  const now = new Date()
  const parMois: { mois: number; tot: number; critiques: number }[] = []
  for (let m = 0; m < 12; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
    const evts = evenements.filter(e => {
      const ed = new Date(e.date)
      return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear()
    })
    parMois.push({ mois: d.getMonth(), tot: evts.length, critiques: evts.filter(e => e.gravite === 'CRITIQUE').length })
  }
  const moyenne = parMois.reduce((s, m) => s + m.critiques, 0) / 12
  const ecart = Math.sqrt(parMois.reduce((s, m) => Math.pow(m.critiques - moyenne, 2) + s, 0) / 12)
  return { parMois, moyenneCritiques: Math.round(moyenne * 10) / 10, ecartType: Math.round(ecart * 10) / 10 }
}

/**
 * Calcule les prédictions d'incidents pour les 3, 6 et 12 prochains mois
 * Basé sur l'historique saisonnier et la tendance récente
 */
export function computeIncidentPredictions(
  evenements: { date: string; gravite?: string; type?: string }[],
  scoreC5?: number
): IncidentPredictions {
  const stats = computeSaisonStats(evenements)
  const now = new Date()
  const { parMois, moyenneCritiques, ecartType } = stats

  // Type le plus fréquent
  const typeFrequency: Record<string, number> = {}
  evenements.forEach(e => { const t = e.type || 'autre'; typeFrequency[t] = (typeFrequency[t] || 0) + 1 })
  const topType = Object.entries(typeFrequency).sort((a, b) => b[1] - a[1])[0]

  const getPrediction = (moisCible: number): PredictionMois => {
    const historique = parMois.find(m => m.mois === moisCible)?.critiques || 0
    const tendance = parMois.slice(0, 3).reduce((s, m) => s + m.critiques, 0) / 3
    const projetee = Math.round(historique * 0.6 + tendance * 0.4)

    const saisons: string[] = []
    if (historique > moyenneCritiques + ecartType) {
      saisons.push(`📈 Pic saisonnier (${historique} l'an dernier vs ${moyenneCritiques} en moyenne)`)
    }
    if (topType) {
      saisons.push(`📋 Type dominant : ${topType[0]?.replace(/_/g, ' ') || 'inconnu'} (${topType[1]} occ.)`)
    }

    let tendanceLabel = '→ Stable'
    if (projetee > moyenneCritiques + ecartType * 1.5) tendanceLabel = '⚠️ Hausse significative'
    else if (projetee > moyenneCritiques + ecartType) tendanceLabel = '⬆ Légère hausse'
    else if (projetee < moyenneCritiques - ecartType) tendanceLabel = '⬇ En baisse'

    // Probabilité normalisée (0-1)
    const proba = Math.min(projetee / (moyenneCritiques + ecartType + 0.5), 1)

    const MOIS_COMPLET = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

    return {
      mois: MOIS_COMPLET[moisCible],
      moisIndex: moisCible,
      critiques: Math.max(projetee, 0),
      probabilite: proba,
      tendance: tendanceLabel,
      saisons,
      typeDominant: topType?.[0] || 'inconnu',
    }
  }

  const moisProchain = (now.getMonth() + 1) % 12
  const m3 = getPrediction(moisProchain)
  const m6 = getPrediction((moisProchain + 3) % 12)
  const m12 = getPrediction((moisProchain + 9) % 12)

  // Ajuster avec le score C5 si disponible
  const c5Factor = scoreC5 !== undefined ? scoreC5 / 50 : 1

  return {
    prediction3m: Math.min(m3.probabilite * (2 - c5Factor), 0.95),
    prediction6m: Math.min(m6.probabilite * (2 - c5Factor), 0.95),
    prediction12m: Math.min(m12.probabilite * (2 - c5Factor), 0.95),
    details: [m3, m6, m12],
    saisonStats: stats,
  }
}
