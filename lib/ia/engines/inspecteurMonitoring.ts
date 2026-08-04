// lib/ia/engines/inspecteurMonitoring.ts
// Suivi ML de l'Inspecteur Virtuel — acceptation/correction par capacité + maturité dans le temps
// Enregistre les retours utilisateur sur les suggestions IA (checklist, écarts, rapports, certification...)
// et calcule une maturité composite N1-N5 (échelle alignée sur getSgsMaturiteLabel).

import { iaStorage, mergeArrayById } from '@/lib/persistence/iaStorage'
import { getSgsMaturiteLabel } from '@/lib/utils'

export type CapaciteInspecteur = 'checklist' | 'ecart' | 'rapport' | 'certification' | 'evenement'
export type ActionInspecteur = 'acceptee' | 'corrigee' | 'rejetee'

export const CAPACITES_INSPECTEUR: CapaciteInspecteur[] = [
  'checklist',
  'ecart',
  'rapport',
  'certification',
  'evenement',
]

export interface InspecteurFeedbackRecord {
  id: string
  date: string
  capacite: CapaciteInspecteur
  action: ActionInspecteur
  aerodromeId?: string
  surveillanceId?: string
  confiance?: number
}

export interface CapaciteStats {
  total: number
  acceptees: number
  corrigees: number
  rejetees: number
  tauxAcceptation: number
  tauxCorrection: number
  tauxRejet: number
  confianceMoyenne: number
  maturite: number
  maturiteLabel: string
}

export interface MaturiteTemporelle {
  mois: string
  label: string
  score: number
  volume: number
}

export interface InspecteurMonitoringStats {
  totalFeedbacks: number
  maturiteGlobale: number
  maturiteGlobaleLabel: string
  parCapacite: Record<CapaciteInspecteur, CapaciteStats>
  serieTemporelle: MaturiteTemporelle[]
  derniersRetours: InspecteurFeedbackRecord[]
}

type SyncCallback = (record: InspecteurFeedbackRecord) => void

const VALEUR_ACTION: Record<ActionInspecteur, number> = {
  acceptee: 1,
  corrigee: 0.5,
  rejetee: 0,
}

class InspecteurMonitoringStore {
  private retours: InspecteurFeedbackRecord[] = []
  private storageKey = 'inspecteur_monitoring'
  private syncCallback: SyncCallback | null = null
  private ready = false
  private pendingQueue: Array<() => void> = []

  async initFromIDB(): Promise<void> {
    const stored = await iaStorage.get<InspecteurFeedbackRecord[]>('feedbacks', this.storageKey)
    if (stored) {
      this.retours = mergeArrayById(this.retours, stored)
    }
    this.ready = true
    const queue = this.pendingQueue
    this.pendingQueue = []
    queue.forEach(fn => fn())
  }

  private executerOuFile(fn: () => void) {
    if (this.ready) { fn() } else { this.pendingQueue.push(fn) }
  }

  onSync(callback: SyncCallback) {
    this.syncCallback = callback
  }

  private persist(): void {
    iaStorage.set('feedbacks', this.storageKey, this.retours.slice(-1000))
  }

  initFromSupabase(records: InspecteurFeedbackRecord[]) {
    if (!records || records.length === 0) return
    this.retours = mergeArrayById(this.retours, records)
    this.persist()
  }

  getAllRetours(): InspecteurFeedbackRecord[] {
    return [...this.retours]
  }

  enregistrer(record: Omit<InspecteurFeedbackRecord, 'id' | 'date'> & { date?: string }): InspecteurFeedbackRecord | null {
    const entry: InspecteurFeedbackRecord = {
      ...record,
      id: `iv-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: record.date ?? new Date().toISOString(),
    }
    this.executerOuFile(() => {
      this.retours.push(entry)
      this.persist()
      this.syncCallback?.(entry)
    })
    return entry
  }

  /** Vide les retours en mémoire et le stockage (utilisé par les tests et la réinitialisation). */
  reset(): void {
    this.retours = []
    iaStorage.remove('feedbacks', this.storageKey)
  }

  private calculerStatsCapacite(retours: InspecteurFeedbackRecord[]): CapaciteStats {
    const total = retours.length
    const acceptees = retours.filter(r => r.action === 'acceptee').length
    const corrigees = retours.filter(r => r.action === 'corrigee').length
    const rejetees = retours.filter(r => r.action === 'rejetee').length
    const confianceRecorded = retours.filter(r => typeof r.confiance === 'number')
    const confianceMoyenne = confianceRecorded.length > 0
      ? Math.round(confianceRecorded.reduce((s, r) => s + (r.confiance ?? 0), 0) / confianceRecorded.length)
      : 0

    const taux = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
    const tauxAcceptation = taux(acceptees)
    const tauxCorrection = taux(corrigees)
    const tauxRejet = taux(rejetees)

    // Maturité : couverture (volume) + qualité (acceptation/correction)
    const volumeFactor = Math.min(1, total / 10)
    const qualite = total > 0
      ? (acceptees * VALEUR_ACTION.acceptee + corrigees * VALEUR_ACTION.corrigee) / total
      : 0
    const maturite = Math.round(volumeFactor * 0.3 * 100 + qualite * 0.7 * 100)

    return {
      total,
      acceptees,
      corrigees,
      rejetees,
      tauxAcceptation,
      tauxCorrection,
      tauxRejet,
      confianceMoyenne,
      maturite,
      maturiteLabel: getSgsMaturiteLabel(maturite),
    }
  }

  /** Moyenne des maturités par capacité (capacités sans feedback ignorées). */
  calculerMaturiteGlobale(retours?: InspecteurFeedbackRecord[]): number {
    const source = retours ?? this.retours
    const avecDonnees = CAPACITES_INSPECTEUR
      .map(c => this.calculerStatsCapacite(source.filter(r => r.capacite === c)))
      .filter(s => s.total > 0)
    if (avecDonnees.length === 0) return 0
    return Math.round(avecDonnees.reduce((s, c) => s + c.maturite, 0) / avecDonnees.length)
  }

  /** Série temporelle : maturité par mois, calculée sur les retours cumulés jusqu'à la fin du mois. */
  getSerieTemporelle(retours?: InspecteurFeedbackRecord[]): MaturiteTemporelle[] {
    const source = retours ?? this.retours
    if (source.length === 0) return []

    const parMois: Map<string, InspecteurFeedbackRecord[]> = new Map()
    for (const r of source) {
      const mois = r.date.slice(0, 7)
      const bucket = parMois.get(mois) ?? []
      bucket.push(r)
      parMois.set(mois, bucket)
    }

    const moisKeys = [...parMois.keys()].sort()
    const serie: MaturiteTemporelle[] = []
    const cumules: InspecteurFeedbackRecord[] = []

    for (const mois of moisKeys) {
      cumules.push(...(parMois.get(mois) ?? []))
      const score = this.calculerMaturiteGlobale(cumules)
      serie.push({ mois, label: getSgsMaturiteLabel(score), score, volume: parMois.get(mois)?.length ?? 0 })
    }

    return serie
  }

  getStats(): InspecteurMonitoringStats {
    const parCapacite = {} as Record<CapaciteInspecteur, CapaciteStats>
    for (const c of CAPACITES_INSPECTEUR) {
      parCapacite[c] = this.calculerStatsCapacite(this.retours.filter(r => r.capacite === c))
    }

    const maturiteGlobale = this.calculerMaturiteGlobale()

    return {
      totalFeedbacks: this.retours.length,
      maturiteGlobale,
      maturiteGlobaleLabel: getSgsMaturiteLabel(maturiteGlobale),
      parCapacite,
      serieTemporelle: this.getSerieTemporelle(),
      derniersRetours: this.retours.slice(-10).reverse(),
    }
  }
}

export const inspecteurMonitoring = new InspecteurMonitoringStore()
