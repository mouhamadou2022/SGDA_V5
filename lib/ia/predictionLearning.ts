// lib/ia/predictionLearning.ts
// Apprentissage en arrière-plan sur les PRÉDICTIONS du profil de risque.
// Principe : chaque calcul enregistre ses prédictions 3m/6m (table
// prediction_suivi) ; quand l'horizon est atteint, on compare au score réel
// (score_history) et on publie la précision (MAE, biais) dans ia_thresholds.
// La CORRECTION (appliquer le biais aux futures prédictions) est volontairement
// désactivée avant la démo DG : on mesure d'abord, on corrige ensuite.

export const MOIS_MS = 30 * 86400000

export interface PredictionEnregistree {
  id: string
  aerodrome_id: string
  predicted_at: string
  pred_3m: number
  pred_6m: number
  verifie_3m?: boolean
  verifie_6m?: boolean
}

export interface VerificationPrediction {
  id: string
  horizon: '3m' | '6m'
  predit: number
  reel: number
  /** réel - prédit : > 0 = le modèle sous-estime le score (pessimiste). */
  erreur: number
}

/**
 * Vérifie les prédictions dont l'horizon est atteint : pour chaque prédiction,
 * le score réel = point de score_history le plus proche de la date cible
 * (tolérance 15 jours). Pure et testée.
 */
export function verifierPredictions(
  predictions: PredictionEnregistree[],
  historique: Array<{ date: string; score: number }>,
  maintenant = Date.now(),
): VerificationPrediction[] {
  const points = [...historique]
    .map(h => ({ t: new Date(h.date).getTime(), score: h.score }))
    .filter(h => Number.isFinite(h.t) && Number.isFinite(h.score))
    .sort((a, b) => a.t - b.t)
  const resultat: VerificationPrediction[] = []
  for (const p of predictions) {
    const t0 = new Date(p.predicted_at).getTime()
    if (!Number.isFinite(t0)) continue
    const horizons = [
      { h: '3m' as const, pred: p.pred_3m, deja: p.verifie_3m, cible: t0 + 3 * MOIS_MS },
      { h: '6m' as const, pred: p.pred_6m, deja: p.verifie_6m, cible: t0 + 6 * MOIS_MS },
    ]
    for (const { h, pred, deja, cible } of horizons) {
      if (deja || !Number.isFinite(pred) || cible > maintenant) continue
      let meilleur: { t: number; score: number } | null = null
      for (const pt of points) {
        if (Math.abs(pt.t - cible) <= 15 * 86400000) {
          if (!meilleur || Math.abs(pt.t - cible) < Math.abs(meilleur.t - cible)) meilleur = pt
        }
      }
      if (meilleur) {
        resultat.push({ id: p.id, horizon: h, predit: Math.round(pred), reel: Math.round(meilleur.score), erreur: Math.round(meilleur.score - pred) })
      }
    }
  }
  return resultat
}

export interface MetriquesHorizon {
  horizon: '3m' | '6m'
  n: number
  /** Erreur absolue moyenne : précision brute. */
  mae: number
  /** Erreur signée moyenne : biais (< 0 = modèle optimiste, > 0 = pessimiste). */
  biais: number
}

/** Agrège les vérifications en métriques publiables (ia_thresholds). */
export function agregerMetriques(verifications: VerificationPrediction[]): MetriquesHorizon[] {
  return (['3m', '6m'] as const).map(horizon => {
    const errs = verifications.filter(v => v.horizon === horizon).map(v => v.erreur)
    if (errs.length === 0) return { horizon, n: 0, mae: 0, biais: 0 }
    const mae = errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length
    const biais = errs.reduce((s, e) => s + e, 0) / errs.length
    return { horizon, n: errs.length, mae: Math.round(mae * 10) / 10, biais: Math.round(biais * 10) / 10 }
  })
}

// ── Plan d'apprentissage : fréquences par boucle (source unique ops) ──

export interface BoucleApprentissage {
  /** Identifiant stable (route cron). */
  job: string
  /** Route déclenchable (cron-job.org, UptimeRobot…). */
  route: string
  frequence: string
  objet: string
}

/** Fréquences recommandées — à câbler côté service cron externe. */
export const PLAN_APPRENTISSAGE: BoucleApprentissage[] = [
  { job: 'recalculate-risk', route: '/api/cron/recalculate-risk', frequence: 'quotidienne', objet: 'Recalcul profils + enregistrement prédictions 3m/6m' },
  { job: 'aerorisq-train-langage-clair', route: '/api/cron/aerorisq-train-langage-clair', frequence: 'quotidienne', objet: 'Few-shot langage clair (votes 👍)' },
  { job: 'evaluer-predictions', route: '/api/cron/evaluer-predictions', frequence: 'hebdomadaire', objet: 'Vérification prédictions vs réel → MAE/biais (ia_thresholds)' },
  { job: 'evaluate-decisions', route: '/api/cron/evaluate-decisions', frequence: 'hebdomadaire', objet: 'Outcomes décisions → recalibrage poids C1-C5' },
  { job: 'rebuild-bayes-cpts', route: '/api/cron/rebuild-bayes-cpts', frequence: 'mensuelle', objet: 'Tables bayésiennes depuis les données' },
  { job: 'capitaliser-historique', route: '/api/cron/capitaliser-historique', frequence: 'hebdomadaire', objet: 'Écarts clôturés + rapports transmis + preuves images → dataset' },
]
