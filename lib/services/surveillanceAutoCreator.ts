// lib/services/surveillanceAutoCreator.ts
// Auto-crée une surveillance quand le profil de risque passe sous le seuil critique (score < 30)
// + recalcule périodiquement les profils de risque
// Suit les mêmes étapes que handleLancer dans PlanningModule.tsx
'use client'

import { useAppStore, Planning, Surveillance } from '@/lib/store'
import { riskEngine } from '@/lib/riskEngine'

let subscribed = false
let periodicInterval: ReturnType<typeof setInterval> | null = null

export function initSurveillanceAutoCreator() {
  if (subscribed) return
  subscribed = true

  const initial = useAppStore.getState()
  let prevProfils = initial.profilsRisque

  useAppStore.subscribe((state) => {
    if (state.profilsRisque === prevProfils) return

    const aerodromes = state.aerodromes?.filter(a => !a.deleted_at) || []

    for (const aero of aerodromes) {
      const profil = state.profilsRisque[aero.id]
      const prevProfil = prevProfils[aero.id]

      // ── Déclencheur 1 : Score global critique (< 30) ──
      if (profil && profil.score_global < 30) {
        if (!prevProfil || prevProfil.score_global >= 30) {
          const dejaSurveille = state.surveillances.some(s =>
            s.aerodrome_id === aero.id &&
            s.statut !== 'archivee' &&
            (s.type === 'audit_complet' || s.type === 'maintien') &&
            Date.now() - new Date(s.created_at).getTime() < 24 * 60 * 60 * 1000
          )
          if (!dejaSurveille) {
            autoCreateSurveillance(aero.id, 'risque_critique').catch(console.error)
            continue
          }
        }
      }

      // ── Déclencheur 2 : SGS absent (maturite_sgs == 0) ──
      const maturiteSgsActuelle = aero.maturite_sgs ?? 0
      const prevAero = prevProfils ? null : null // Pas besoin de comparer l'aéro précédent
      if (maturiteSgsActuelle === 0 || maturiteSgsActuelle == null) {
        const dejaSurveilleSGS = state.surveillances.some(s =>
          s.aerodrome_id === aero.id &&
          s.statut !== 'archivee' &&
          s.type === 'audit_complet' &&
          (s.portee || []).some(p => p === 'SGS') &&
          Date.now() - new Date(s.created_at).getTime() < 7 * 24 * 60 * 60 * 1000
        )
        if (!dejaSurveilleSGS) {
          autoCreateSurveillance(aero.id, 'sgs_absent').catch(console.error)
          continue
        }
      }

      // ── Déclencheur 3 : SGS insuffisant (N1-N3, score <= 50) ──
      if (maturiteSgsActuelle > 0 && maturiteSgsActuelle <= 50) {
        const dejaSurveilleSGSFaible = state.surveillances.some(s =>
          s.aerodrome_id === aero.id &&
          s.statut !== 'archivee' &&
          (s.type === 'audit_complet' || s.type === 'maintien') &&
          (s.portee || []).some(p => p === 'SGS') &&
          Date.now() - new Date(s.created_at).getTime() < 30 * 24 * 60 * 60 * 1000
        )
        if (!dejaSurveilleSGSFaible) {
          autoCreateSurveillance(aero.id, 'sgs_faible').catch(console.error)
          continue
        }
      }
    }

    prevProfils = state.profilsRisque
  })

  // Recalcul périodique en tâche de fond
  schedulePeriodicRecalculation()
}

function schedulePeriodicRecalculation() {
  if (periodicInterval) clearInterval(periodicInterval)

  // Premier recul après 30s (le temps que l'app soit chargée)
  setTimeout(() => recalculateAllRiskProfiles(), 30_000)

  // Puis toutes les 30 minutes
  periodicInterval = setInterval(() => recalculateAllRiskProfiles(), 30 * 60 * 1000)
}

export function stopPeriodicRecalculation() {
  if (periodicInterval) {
    clearInterval(periodicInterval)
    periodicInterval = null
  }
}

async function recalculateAllRiskProfiles() {
  const store = useAppStore.getState()
  const aerodromes = store.aerodromes?.filter(a => !a.deleted_at) || []
  if (aerodromes.length === 0) return

  const toRecalculate = aerodromes
    .filter(a => {
      const profil = store.profilsRisque?.[a.id]
      // Recalculer si : pas de profil, ou score < 70, ou dernier calcul > 6h
      if (!profil) return true
      if (profil.score_global < 70) return true
      if (profil.computed_at && Date.now() - new Date(profil.computed_at).getTime() > 6 * 60 * 60 * 1000) return true
      return false
    })
    .slice(0, 5) // max 5 par cycle pour éviter la surcharge

  if (toRecalculate.length === 0) return

  for (const aero of toRecalculate) {
    try {
      await store.recalculerProfilRisque(aero.id)
    } catch (e) {
      console.error(`[PeriodicRecalc] Erreur ${aero.code_oaci}:`, e)
    }
  }
}

async function autoCreateSurveillance(aerodromeId: string, raison: 'risque_critique' | 'sgs_absent' | 'sgs_faible' = 'risque_critique') {
  const store = useAppStore.getState()
  const aerodrome = store.aerodromes.find(a => a.id === aerodromeId)
  if (!aerodrome) return

  const profil = store.profilsRisque?.[aerodromeId]
  const now = new Date().toISOString()

  // Déterminer le type et la portée selon la raison
  let type: Surveillance['type'] = 'audit_complet'
  let portee: string[] = ['PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
  let priorite: Planning['priorite'] = 'critique'
  let objectifs: string

  if (raison === 'sgs_absent') {
    type = 'audit_complet'
    portee = ['SGS']
    priorite = 'critique'
    objectifs = `[AUTO] SGS absent — aérodrome sans évaluation PAOE. Audit SGS prioritaire généré automatiquement.`
  } else if (raison === 'sgs_faible') {
    type = 'maintien'
    portee = ['SGS']
    priorite = 'haute'
    objectifs = `[AUTO] SGS insuffisant (score ${aerodrome.maturite_sgs ?? 'inconnu'}/100 ≤ 50) — surveillance SGS renforcée automatique.`
  } else {
    portee = ['PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
    objectifs = `[AUTO] Score critique (${profil?.score_global ?? '?'}/100) — surveillance d'urgence créée automatiquement par le profil de risque`
  }

  // 1. Créer le planning
  const planningId = crypto.randomUUID()
  const planning: Planning = {
    id: planningId,
    aerodrome_id: aerodromeId,
    type,
    date_debut: now,
    date_fin: new Date(Date.now() + (raison === 'sgs_absent' ? 14 : 7) * 24 * 60 * 60 * 1000).toISOString(),
    portee,
    equipe_ids: [],
    chef_id: '',
    statut: 'planifiee',
    priorite,
    objectifs,
    est_proposition: true,
    annee_cible: new Date().getFullYear(),
    created_at: now,
    updated_at: now,
  }
  try { await store.addPlanning(planning) } catch { return }

  // 2. Créer la surveillance liée au planning
  const surveillanceData: Omit<Surveillance, 'id' | 'created_at' | 'updated_at'> = {
    aerodrome_id: aerodromeId,
    planning_id: planningId,
    type: 'audit_complet',
    portee: planning.portee || [],
    equipe_ids: [],
    chef_id: '',
    date_debut: now,
    date_fin: planning.date_fin,
    statut: 'en_cours',
  }
  let surveillance: Surveillance
  try { surveillance = await store.addSurveillance(surveillanceData) } catch { return }

  // 3. Màj planning avec l'ID surveillance
  store.updatePlanning(planningId, { surveillance_id: surveillance.id, updated_at: now, est_proposition: false })

  // 4. Générer la checklist via kitDocAgent
  try {
    const { kitDocAgent, toDomaineChecklistArray } = await import('@/lib/ia/agents/kitDocAgent')
    const master = store.findMasterChecklistForPortee(planning.portee || [])
    if (master) {
      const snapshot = JSON.parse(JSON.stringify(master.checklist))
      const filtered = kitDocAgent.filterChecklistByAerodrome(snapshot, aerodrome)
      const enriched = kitDocAgent.applyRiskProfileToChecklist(filtered, {
        entite_id: aerodromeId,
        type_entite: aerodrome.type_entite ?? 'aerodrome',
        type_surveillance: 'maintien',
        portee: planning.portee || [],
        profil_risque: profil,
      })
      store.setChecklistHierarchy(surveillance.id, enriched)
      store.updateSurveillance(surveillance.id, { checklist_hierarchy: enriched })
    } else {
      const result = kitDocAgent.generateChecklist({
        surveillance_id: surveillance.id,
        entite_id: aerodromeId,
        type_entite: aerodrome.type_entite ?? 'aerodrome',
        type_surveillance: 'maintien',
        portee: planning.portee || [],
        profil_risque: profil,
      })
      const resultFiltered = kitDocAgent.filterChecklistByAerodrome(result.domaines as any[], aerodrome)
      const finalResult = { ...result, domaines: resultFiltered }
      kitDocAgent.injectIntoStore(surveillance.id, finalResult)
      store.updateSurveillance(surveillance.id, { checklist_hierarchy: toDomaineChecklistArray(finalResult) })
    }
  } catch (e) {
    console.error('[SurveillanceAutoCreator] Erreur génération checklist:', e)
  }

  // 5. Notification
  const label = raison === 'sgs_absent' ? 'SGS absent' : raison === 'sgs_faible' ? 'SGS insuffisant' : 'Score critique'
  store.addNotification({
    user_id: store.user?.id || '',
    type: 'danger',
    title: raison === 'risque_critique' ? 'Surveillance critique auto-créée' : 'Surveillance SGS auto-créée',
    message: `⚠️ ${aerodrome.code_oaci} — ${label}. Une surveillance ${type === 'audit_complet' ? 'd\'audit' : 'de maintien'} a été générée automatiquement.`,
    canal: 'in_app',
    link: `/surveillance/${surveillance.id}`,
  })
}
