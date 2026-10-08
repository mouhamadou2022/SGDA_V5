// lib/autoEvaluation.ts — Score d'auto-évaluation exploitant (pur, testé).
// Honnêteté : SGS proportionnel (plus de bonus binaire 20/0), contributions
// repondérées selon les données disponibles, et null si aucune donnée
// (jamais de 100/100 « excellent » sur du vide).

export interface EntreesScoreAutoEval {
  tauxPac: number;
  pacTotal: number;
  tauxSurv: number;
  totalSurv: number;
  c1: number;
  sgsNonApplicable: boolean;
}

/** Score 0-100 ou null (données insuffisantes pour noter). */
export function calculerScoreAutoEval(e: EntreesScoreAutoEval): number | null {
  if (e.pacTotal <= 0 && e.totalSurv <= 0) return null;
  const parts: Array<[number, number]> = [];
  if (e.pacTotal > 0) parts.push([e.tauxPac, 0.5]);
  if (e.totalSurv > 0) parts.push([e.tauxSurv, 0.3]);
  // SGS exclu du score quand non applicable (comme le score officiel) ;
  // sinon proportionnel à C1 (plus de palier 20/0).
  if (!e.sgsNonApplicable) parts.push([Math.max(0, Math.min(100, e.c1)), 0.2]);
  const sommePoids = parts.reduce((s, [, w]) => s + w, 0);
  if (sommePoids <= 0) return null;
  return Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / sommePoids);
}
