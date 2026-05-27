// lib/stylet.ts — SGDA V5
// Logique métier pour la saisie au stylet (checklist tactile).
// Gère les résultats SA/NS/NA/NV et leur encodage pour stockage.

export type ResultatChecklist = 'SA' | 'NS' | 'NA' | 'NV'

export const RESULTAT_CONFIG: Record<ResultatChecklist, { label: string; color: string; bgClass: string; textClass: string; borderClass: string }> = {
  SA: {
    label: 'Satisfaisant',
    color: '#16a34a',
    bgClass: 'bg-green-100',
    textClass: 'text-green-700',
    borderClass: 'border-green-400',
  },
  NS: {
    label: 'Non Satisfaisant',
    color: '#dc2626',
    bgClass: 'bg-red-100',
    textClass: 'text-red-700',
    borderClass: 'border-red-400',
  },
  NA: {
    label: 'Non Applicable',
    color: '#6b7280',
    bgClass: 'bg-gray-100',
    textClass: 'text-gray-600',
    borderClass: 'border-gray-300',
  },
  NV: {
    label: 'Non Vérifié',
    color: '#d97706',
    bgClass: 'bg-orange-100',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-400',
  },
}

// ─────────────────────────────────────────────────────────────
// CALCUL SCORE CHECKLIST
// ─────────────────────────────────────────────────────────────

export interface ChecklistStats {
  total: number
  sa: number
  ns: number
  na: number
  nv: number
  verifies: number
  score: number
  complet: boolean
}

export function computeChecklistStats(
  resultats: (ResultatChecklist | undefined | null)[],
): ChecklistStats {
  const total = resultats.length
  const sa = resultats.filter((r) => r === 'SA').length
  const ns = resultats.filter((r) => r === 'NS').length
  const na = resultats.filter((r) => r === 'NA').length
  const nv = resultats.filter((r) => r === 'NV').length
  const verifies = sa + ns

  const score = verifies > 0 ? Math.round((sa / verifies) * 100) : 0
  const complet = resultats.every((r) => r != null && r !== undefined)

  return { total, sa, ns, na, nv, verifies, score, complet }
}

// ─────────────────────────────────────────────────────────────
// CYCLE DE SAISIE AU STYLET (tap successif = cycle SA→NS→NA→NV→undefined)
// ─────────────────────────────────────────────────────────────

const CYCLE_ORDER: (ResultatChecklist | undefined)[] = ['SA', 'NS', 'NA', 'NV', undefined]

export function cycleResultat(current: ResultatChecklist | undefined | null): ResultatChecklist | undefined {
  const idx = CYCLE_ORDER.indexOf(current as ResultatChecklist | undefined)
  const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]
  return next
}

// ─────────────────────────────────────────────────────────────
// ENCODAGE POUR CANVAS (coordonnées → résultats)
// ─────────────────────────────────────────────────────────────

export interface CanvasPoint {
  x: number
  y: number
  pressure?: number
  timestamp: number
}

export interface CanvasStroke {
  points: CanvasPoint[]
  color: string
  width: number
  tool: 'pen' | 'highlighter' | 'eraser'
}

export function strokestoDataURL(strokes: CanvasStroke[], width: number, height: number): string {
  if (typeof document === 'undefined') return ''
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  strokes.forEach((stroke) => {
    if (stroke.points.length < 2) return
    ctx.beginPath()
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (stroke.tool === 'highlighter') {
      ctx.globalAlpha = 0.4
    } else if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
    } else {
      ctx.globalAlpha = 1
    }

    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y)
    }
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
  })

  return canvas.toDataURL('image/png')
}

// ─────────────────────────────────────────────────────────────
// RÉSUMÉ POUR RAPPORT
// ─────────────────────────────────────────────────────────────

export function buildChecklistSummaryHTML(
  stats: ChecklistStats,
  aerodromeCode: string,
  dateDebut: string,
): string {
  const { sa, ns, na, nv, total, score } = stats
  return `
    <table>
      <tr><th>Aérodrome</th><td>${aerodromeCode}</td></tr>
      <tr><th>Date</th><td>${new Date(dateDebut).toLocaleDateString('fr-FR')}</td></tr>
      <tr><th>Total items</th><td>${total}</td></tr>
      <tr><th>Satisfaisants (SA)</th><td>${sa}</td></tr>
      <tr><th>Non Satisfaisants (NS)</th><td>${ns}</td></tr>
      <tr><th>Non Applicables (NA)</th><td>${na}</td></tr>
      <tr><th>Non Vérifiés (NV)</th><td>${nv}</td></tr>
      <tr><th>Score de conformité</th><td>${score}%</td></tr>
    </table>
  `
}
