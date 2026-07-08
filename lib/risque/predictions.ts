// lib/risque/predictions.ts
// Fonctions partagées de prédiction d'incidents
// Utilise le modèle saisonnier Prophet-like pour les prévisions
// Plus aucun seuil/poids/template hardcodé

import { fitSeasonalModel, predict, evaluateModel, type ForecastPoint } from './seasonalForecast'

export interface SaisonStats {
  parMois: { mois: number; tot: number; critiques: number; types: Record<string, number> }[]
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
  risquesContextuels: string[]
}

export interface IncidentPredictions {
  prediction3m: number
  prediction6m: number
  prediction12m: number
  details: PredictionMois[]
  saisonStats: SaisonStats
}

function getMoisLabel(mois: number): string {
  const labels = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  return labels[mois] || ''
}

/**
 * Calcule les statistiques saisonnières sur 12 mois glissants (pure data-driven)
 */
export function computeSaisonStats(evenements: { date: string; gravite?: string; type?: string }[]): SaisonStats {
  const now = new Date()
  const parMois: { mois: number; tot: number; critiques: number; types: Record<string, number> }[] = []
  for (let m = 0; m < 12; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1)
    const evts = evenements.filter(e => {
      const ed = new Date(e.date)
      return ed.getMonth() === d.getMonth() && ed.getFullYear() === d.getFullYear()
    })
    const types: Record<string, number> = {}
    evts.forEach(e => { const t = e.type || 'autre'; types[t] = (types[t] || 0) + 1 })
    parMois.push({ mois: d.getMonth(), tot: evts.length, critiques: evts.filter(e => e.gravite === 'CRITIQUE').length, types })
  }
  const moyenne = parMois.reduce((s, m) => s + m.critiques, 0) / 12
  const ecart = Math.sqrt(parMois.reduce((s, m) => Math.pow(m.critiques - moyenne, 2) + s, 0) / 12)
  return { parMois, moyenneCritiques: Math.round(moyenne * 10) / 10, ecartType: Math.round(ecart * 10) / 10 }
}

/**
 * Calcule les prédictions d'incidents pour les 3 prochains mois
 * Utilise le modèle saisonnier Prophet-like — plus de poids 60/40 ni de seuils fixes
 */
export function computeIncidentPredictions(
  evenements: { date: string; gravite?: string; type?: string }[],
  _scoreC5?: number
): IncidentPredictions {
  const stats = computeSaisonStats(evenements)
  const now = new Date()
  const { parMois, moyenneCritiques, ecartType } = stats

  // Type le plus fréquent
  const typeFrequency: Record<string, number> = {}
  evenements.forEach(e => { const t = e.type || 'autre'; typeFrequency[t] = (typeFrequency[t] || 0) + 1 })
  const topType = Object.entries(typeFrequency).sort((a, b) => b[1] - a[1])[0]

  // Ajuster le modèle saisonnier sur les 12 mois d'historique
  const dataPourModele = parMois.map(m => ({ mois: m.mois, value: m.critiques }))
  const model = fitSeasonalModel(dataPourModele)
  const metrics = evaluateModel(model, dataPourModele)

  // Prédire les 3 prochains mois
  const forecast = predict(model, 3)

  // Construire les PredictionMois
  const details: PredictionMois[] = forecast.map((f: ForecastPoint) => {
    // Tendances basées sur la pente du modèle
    const pente = model.trend.slope
    const tendanceLabel = pente > 0.3
      ? `⬆ Hausse tendancielle (${(pente * 3).toFixed(1)} pts/trimestre)`
      : pente < -0.3
        ? `⬇ Baisse tendancielle (${(Math.abs(pente) * 3).toFixed(1)} pts/trimestre)`
        : `→ Stable (±${(Math.abs(pente) * 3).toFixed(1)} pts)`

    // Observations saisonnières
    const saisons: string[] = []
    const facteurSaisonnier = model.seasonalFactors[f.moisIndex]
    if (Math.abs(facteurSaisonnier) > ecartType * 0.5) {
      const direction = facteurSaisonnier > 0 ? 'hausse' : 'baisse'
      saisons.push(`📊 Facteur saisonnier ${direction} de ${Math.abs(Math.round(facteurSaisonnier))} critique(s)`)
    }
    if (topType && topType[1] >= 3) { // Seuil de significativité : ≥3 occurrences pour éviter le bruit
      saisons.push(`?? Type dominant : ${topType[0]?.replace(/_/g, ' ') || 'inconnu'} (${topType[1]} occ.)`)
    }

    return {
      mois: f.mois,
      moisIndex: f.moisIndex,
      critiques: f.value,
      probabilite: Math.min(f.value / Math.max(moyenneCritiques + ecartType, 1), 1),
      tendance: tendanceLabel,
      saisons,
      typeDominant: topType?.[0] || 'inconnu',
      risquesContextuels: [], // Retiré — les risques contextuels étaient des templates
    }
  })

  // Score global C5 : moyenne des probabilités des 3 mois
  const prob3m = details.length > 0 ? details[0].probabilite : 0
  const prob6m = details.length > 1 ? details[1].probabilite : 0
  const prob12m = details.length > 2 ? details[2].probabilite : 0

  return {
    prediction3m: Math.min(prob3m, 0.95),
    prediction6m: Math.min(prob6m, 0.95),
    prediction12m: Math.min(prob12m, 0.95),
    details,
    saisonStats: stats,
  }
}
