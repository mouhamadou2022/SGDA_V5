import type { Ecart, Surveillance } from '@/lib/store'

export interface ComplianceAnalysis {
  conformiteGlobale: number
  ecartsOuverts: number
  ecartsCritiques: number
  ecartsParDomaine: Record<string, { total: number; critiques: number; enRetard: number }>
  tendanceConformite: 'hausse' | 'baisse' | 'stable'
  tauxResolution: number
  pointsBloquants: string[]
}

const STATUTS_OUVERTS: Ecart['statut'][] = ['ouvert', 'pac_attendu', 'pac_soumis', 'pac_refuse', 'en_retard']
const STATUTS_FERMES: Ecart['statut'][] = ['cloture', 'preuves_evaluees']

export class ComplianceEngine {
  analyser(ecarts: Ecart[], surveillances: Surveillance[], aerodromeId: string): ComplianceAnalysis {
    const ecartsAero = ecarts.filter(e => e.aerodrome_id === aerodromeId)
    const ecartsOuverts = ecartsAero.filter(e => STATUTS_OUVERTS.includes(e.statut))
    const ecartsCritiques = ecartsOuverts.filter(e => e.niveau_risque === 'critique')
    const ecartsFermes = ecartsAero.filter(e => STATUTS_FERMES.includes(e.statut))

    const ecartsParDomaine: ComplianceAnalysis['ecartsParDomaine'] = {}
    for (const e of ecartsOuverts) {
      const d = e.domaine || 'inconnu'
      if (!ecartsParDomaine[d]) ecartsParDomaine[d] = { total: 0, critiques: 0, enRetard: 0 }
      ecartsParDomaine[d].total++
      if (e.niveau_risque === 'critique') ecartsParDomaine[d].critiques++
      if (e.statut === 'en_retard') ecartsParDomaine[d].enRetard++
    }

    const tauxResolution = ecartsAero.length > 0
      ? Math.round((ecartsFermes.length / ecartsAero.length) * 100)
      : 100

    const pointsBloquants: string[] = []
    for (const [domaine, data] of Object.entries(ecartsParDomaine)) {
      if (data.critiques >= 2) pointsBloquants.push(`${domaine}: ${data.critiques} ecarts critiques`)
      if (data.enRetard >= 3) pointsBloquants.push(`${domaine}: ${data.enRetard} ecarts en retard`)
    }

    const conformiteGlobale = Math.max(0, Math.min(100,
      ecartsAero.length > 0
        ? Math.round((ecartsFermes.length / ecartsAero.length) * 100)
        : 100
    ))

    // Tendance réelle : dates d'événement uniquement, jamais d'échéances
    const maintenant = Date.now()
    const trenteJours = 30 * 24 * 60 * 60 * 1000
    const recentsOuverts = ecartsOuverts.filter(e => {
      if (!e.date_detection) return false
      const t = new Date(e.date_detection).getTime()
      return !isNaN(t) && t > maintenant - trenteJours
    }).length
    const recentsFermes = ecartsFermes.filter(e => {
      if (!e.updated_at) return false
      const t = new Date(e.updated_at).getTime()
      return !isNaN(t) && t > maintenant - trenteJours
    }).length
    const tendanceConformite: ComplianceAnalysis['tendanceConformite'] =
      recentsOuverts > recentsFermes + 1 ? 'baisse' :
      recentsFermes > recentsOuverts + 1 ? 'hausse' : 'stable'

    return {
      conformiteGlobale,
      ecartsOuverts: ecartsOuverts.length,
      ecartsCritiques: ecartsCritiques.length,
      ecartsParDomaine,
      tendanceConformite,
      tauxResolution,
      pointsBloquants,
    }
  }
}

export const complianceEngine = new ComplianceEngine()
