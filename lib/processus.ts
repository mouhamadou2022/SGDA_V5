import type { Certification, Homologation, Surveillance, Ecart, Aerodrome } from '@/lib/store'

export interface ProcessusActif {
  processus_id: string
  processus_type: 'certification' | 'homologation'
  phase_actuelle: number
  phases_total: number
  phase_label: string
  aerodrome_id: string
  aerodrome_nom: string
  aerodrome_code_oaci: string
  surveillance_id: string | null
  surveillance_statut: string | null
  ecarts_count: number
  ecarts_clos: number
  progression: number
}

export function getProcessusActifs(
  certifications: Certification[],
  homologations: Homologation[],
  surveillances: Surveillance[],
  ecarts: Ecart[],
  aerodromes: Aerodrome[]
): ProcessusActif[] {
  const result: ProcessusActif[] = []

  for (const cert of certifications) {
    if (cert.statut_global !== 'en_cours') continue
    const aerodrome = aerodromes.find(a => a.id === cert.aerodrome_id)
    const phase = cert.phase_active
    const survId = phase === 3 ? cert.phases_data.phase3?.surveillance_id : null
    const surv = survId ? surveillances.find(s => s.id === survId) : null
    const ecartsSurv = surv ? ecarts.filter(e => e.surveillance_id === survId) : []
    result.push({
      processus_id: cert.id,
      processus_type: 'certification',
      phase_actuelle: phase,
      phases_total: 5,
      phase_label: `Phase ${phase}/5`,
      aerodrome_id: cert.aerodrome_id,
      aerodrome_nom: aerodrome?.nom ?? '',
      aerodrome_code_oaci: aerodrome?.code_oaci ?? '',
      surveillance_id: survId ?? null,
      surveillance_statut: surv?.statut ?? null,
      ecarts_count: ecartsSurv.length,
      ecarts_clos: ecartsSurv.filter(e => e.statut === 'cloture').length,
      progression: surv ? calcProgression(phase, surv, 5) : calcProgression(phase, null, 5),
    })
  }

  for (const homo of homologations) {
    if (homo.statut_global !== 'en_cours') continue
    const aerodrome = aerodromes.find(a => a.id === homo.aerodrome_id)
    const phase = homo.phase_active
    const survId = phase === 2 ? homo.phases_data.phase2?.surveillance_id : null
    const surv = survId ? surveillances.find(s => s.id === survId) : null
    const ecartsSurv = surv ? ecarts.filter(e => e.surveillance_id === survId) : []
    result.push({
      processus_id: homo.id,
      processus_type: 'homologation',
      phase_actuelle: phase,
      phases_total: 3,
      phase_label: `Phase ${phase}/3`,
      aerodrome_id: homo.aerodrome_id,
      aerodrome_nom: aerodrome?.nom ?? '',
      aerodrome_code_oaci: aerodrome?.code_oaci ?? '',
      surveillance_id: survId ?? null,
      surveillance_statut: surv?.statut ?? null,
      ecarts_count: ecartsSurv.length,
      ecarts_clos: ecartsSurv.filter(e => e.statut === 'cloture').length,
      progression: surv ? calcProgression(phase, surv, 3) : calcProgression(phase, null, 3),
    })
  }

  return result
}

function calcProgression(phaseActuelle: number, surv: Surveillance | null, phasesTotal: number = 5): number {
  const phaseWeight = 60
  const survWeight = 40
  const phaseProgress = phaseActuelle <= 1 ? 0 : ((phaseActuelle - 1) / phasesTotal) * phaseWeight
  if (!surv) return Math.round(phaseProgress)
  const statusWeights: Record<string, number> = {
    planifiee: 0,
    en_cours: 20,
    checklist_signee: 40,
    ecarts_signes: 60,
    rapport_signe: 70,
    lettre_signee: 80,
    transmise: 90,
    archivee: 100,
  }
  const survProgress = ((statusWeights[surv.statut] ?? 0) / 100) * survWeight
  return Math.round(phaseProgress + survProgress)
}
