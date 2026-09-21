// components/modules/planning/planningDates.ts
// Helpers de dates extraits de PlanningModule (aucun JSX, purs, testables).
// Convertit une date ISO en valeur pour <input type="datetime-local">
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Début de la journée courante (heure locale) — garde « date de début ≥ aujourd'hui »
export function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}
