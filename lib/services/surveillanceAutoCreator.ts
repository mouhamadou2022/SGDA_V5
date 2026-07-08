// lib/services/surveillanceAutoCreator.ts
// Propose des surveillances via iaSuggestions[] au lieu de les auto-créer
// L'inspecteur valide/ajuste/rejette depuis la modale "Suggestions IA"
'use client'

import { useAppStore, Planning, IaSuggestion } from '@/lib/store'
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
          const dejaSuggere = state.iaSuggestions.some(s =>
            s.aerodrome_id === aero.id && s.source === 'risque_critique'
          )
          const dejaPlanifie = state.plannings.some(p =>
            p.aerodrome_id === aero.id && p.statut === 'planifiee' &&
            (p.type === 'audit_complet' || p.type === 'maintien')
          )
          const dejaEnCours = state.surveillances.some(s =>
            s.aerodrome_id === aero.id && s.statut !== 'archivee' &&
            s.statut !== 'transmise'
          )
          if (!dejaSuggere && !dejaPlanifie && !dejaEnCours) {
            createSuggestion(aero.id, 'risque_critique')
          }
        }
      }

      // ── Déclencheur 2 : SGS absent (maturite_sgs == 0) ──
      const maturiteSgsActuelle = aero.maturite_sgs ?? 0
      const sgsNonApplicable = aero.statut_sgs === 'non_applicable'
      if (!sgsNonApplicable && (maturiteSgsActuelle === 0 || maturiteSgsActuelle == null)) {
        if (state.iaSuggestions.some(s => s.aerodrome_id === aero.id && s.source === 'sgs_absent')) continue
        if (state.plannings.some(p => p.aerodrome_id === aero.id && p.statut === 'planifiee' && p.type === 'audit_complet' && (p.portee || []).some(x => x === 'SGS'))) continue
        if (state.surveillances.some(s => s.aerodrome_id === aero.id && s.statut !== 'archivee' && s.type === 'audit_complet' && (s.portee || []).some(p => p === 'SGS'))) continue
        createSuggestion(aero.id, 'sgs_absent')
      }

      // ── Déclencheur 3 : SGS insuffisant (1-50) ──
      if (!sgsNonApplicable && maturiteSgsActuelle > 0 && maturiteSgsActuelle <= 50) {
        if (state.iaSuggestions.some(s => s.aerodrome_id === aero.id && s.source === 'sgs_faible')) continue
        if (state.plannings.some(p => p.aerodrome_id === aero.id && p.statut === 'planifiee' && (p.type === 'audit_complet' || p.type === 'maintien') && (p.portee || []).some(x => x === 'SGS'))) continue
        if (state.surveillances.some(s => s.aerodrome_id === aero.id && s.statut !== 'archivee' && (s.type === 'audit_complet' || s.type === 'maintien') && (s.portee || []).some(p => p === 'SGS'))) continue
        createSuggestion(aero.id, 'sgs_faible')
      }

      // ── Déclencheur 4 : Certification/Homologation fraîche → maintien ──
      const certsAero = (state.certifications || []).filter(c =>
        c.aerodrome_id === aero.id
      )
      const homoAero = (state.homologations || []).filter(h =>
        h.aerodrome_id === aero.id
      )
      const derniereCertif = certsAero.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
      const derniereHomo = homoAero.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
      const certifFraiche = derniereCertif && derniereCertif.statut_global === 'certifie' &&
        Date.now() - new Date(derniereCertif.updated_at).getTime() < 24 * 60 * 60 * 1000
      const homoFraiche = derniereHomo && derniereHomo.statut_global === 'homologue' &&
        Date.now() - new Date(derniereHomo.updated_at).getTime() < 24 * 60 * 60 * 1000
      if (certifFraiche || homoFraiche) {
        const source = certifFraiche ? 'certification_fraiche' as const : 'homologation_fraiche' as const
        if (state.iaSuggestions.some(s => s.aerodrome_id === aero.id && s.source === source)) continue
        if (state.plannings.some(p => p.aerodrome_id === aero.id && p.statut === 'planifiee' && p.type === 'maintien')) continue
        if (state.surveillances.some(s => s.aerodrome_id === aero.id && s.statut !== 'archivee' && s.type === 'maintien' && s.portee?.length >= 6)) continue
        createSuggestion(aero.id, source)
      }
    }

    prevProfils = state.profilsRisque
  })

  schedulePeriodicRecalculation()
}

function schedulePeriodicRecalculation() {
  if (periodicInterval) clearInterval(periodicInterval)

  setTimeout(() => recalculateAllRiskProfiles(), 30_000)

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

  try { verifierExpirationsCertifications() } catch { /* silencieux */ }

  const toRecalculate = aerodromes
    .filter(a => {
      const profil = store.profilsRisque?.[a.id]
      if (!profil) return true
      if (profil.score_global < 70) return true
      if (profil.computed_at && Date.now() - new Date(profil.computed_at).getTime() > 6 * 60 * 60 * 1000) return true
      return false
    })
    .slice(0, 5)

  if (toRecalculate.length === 0) return

  for (const aero of toRecalculate) {
    try {
      await store.recalculerProfilRisque(aero.id)
    } catch (e) {
      console.error(`[PeriodicRecalc] Erreur ${aero.code_oaci}:`, e)
    }
  }
}

function verifierExpirationsCertifications() {
  const store = useAppStore.getState()
  const sixMois = 180 * 24 * 60 * 60 * 1000
  const troisMois = 90 * 24 * 60 * 60 * 1000
  const unMois = 30 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const alreadyNotifiedKey = 'sgda_certif_expiry_notified'
  const notified: Record<string, number> = JSON.parse(sessionStorage.getItem(alreadyNotifiedKey) || '{}')

  const aerodromes = store.aerodromes?.filter(a => !a.deleted_at) || []
  const exploitants = store.utilisateurs?.filter(u =>
    ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role ?? '')
  ) || []

  for (const aero of aerodromes) {
    const certsAero = (store.certifications || []).filter(c =>
      c.aerodrome_id === aero.id && c.statut_global === 'certifie' && c.date_expiration
    )

    for (const cert of certsAero) {
      const expireAt = new Date(cert.date_expiration!).getTime()
      const remaining = expireAt - now
      if (remaining <= 0) continue

      const key = `cert_${cert.id}_${aero.id}`
      let seuil = 0
      let label = ''
      if (remaining <= unMois && remaining > 0) { seuil = unMois; label = '1 mois' }
      else if (remaining <= troisMois && remaining > unMois) { seuil = troisMois; label = '3 mois' }
      else if (remaining <= sixMois && remaining > troisMois) { seuil = sixMois; label = '6 mois' }
      else continue

      const lastNotified = notified[key] || 0
      if (now - lastNotified < seuil) continue

      const opsAero = exploitants.filter(u => u.aerodrome_id === aero.id)
      for (const op of opsAero) {
        store.addNotification({
          user_id: op.id,
          type: label === '1 mois' ? 'danger' : 'warning',
          title: `⏰ Certification — renouvellement dans ${label}`,
          message: `La certification de ${aero.code_oaci} (${cert.numero_cert || cert.reference}) expire le ${new Date(cert.date_expiration!).toLocaleDateString('fr-FR')}. Démarrez le processus de renouvellement.`,
          canal: 'in_app',
        })
      }
      store.addNotification({
        user_id: store.user?.id || '',
        type: 'info',
        title: `📋 Renouvellement certif — ${aero.code_oaci}`,
        message: `Certification ${cert.numero_cert || cert.reference} expire dans ${label} (${new Date(cert.date_expiration!).toLocaleDateString('fr-FR')}). Planifier une surveillance de renouvellement.`,
        canal: 'in_app',
      })
      notified[key] = now
    }
  }

  try { sessionStorage.setItem(alreadyNotifiedKey, JSON.stringify(notified)) } catch { /* silencieux */ }
}

function createSuggestion(aerodromeId: string, raison: IaSuggestion['source']) {
  const store = useAppStore.getState()
  const aerodrome = store.aerodromes.find(a => a.id === aerodromeId)
  if (!aerodrome) return

  const profil = store.profilsRisque?.[aerodromeId]
  const now = new Date().toISOString()

  let type: Planning['type'] = 'audit_complet'
  let portee: string[] = ['PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
  let priorite: Planning['priorite'] = 'critique'
  let confiance: number = 0.85
  let objectifs: string
  let raisonTexte: string

  if (raison === 'sgs_absent') {
    type = 'audit_complet'
    portee = ['SGS']
    priorite = 'critique'
    confiance = 0.95
    objectifs = `Audit SGS — aérodrome sans évaluation PAOE`
    raisonTexte = `Score SGS nul (${aerodrome.maturite_sgs ?? 'N/A'}/100) — l'aérodrome n'a pas d'évaluation PAOE validée. Une surveillance SGS est nécessaire pour évaluer le système de gestion de la sécurité.`
  } else if (raison === 'sgs_faible') {
    type = 'maintien'
    portee = ['SGS']
    priorite = 'haute'
    confiance = 0.75
    objectifs = `Surveillance SGS renforcée — score insuffisant`
    raisonTexte = `Score SGS (${aerodrome.maturite_sgs ?? 'inconnu'}/100) ≤ 50 — le système de gestion de la sécurité nécessite une surveillance renforcée pour identifier les lacunes et proposer des mesures correctives.`
  } else if (raison === 'certification_fraiche') {
    type = 'maintien'
    portee = ['PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
    priorite = 'moyenne'
    confiance = 0.90
    objectifs = `Surveillance de maintien post-certification`
    raisonTexte = `Certification obtenue récemment — une surveillance de maintien dans les 6 mois permet de vérifier la conformité continue et d'anticiper le renouvellement.`
  } else if (raison === 'homologation_fraiche') {
    type = 'maintien'
    portee = ['PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
    priorite = 'moyenne'
    confiance = 0.85
    objectifs = `Surveillance de maintien post-homologation`
    raisonTexte = `Homologation obtenue récemment — une surveillance de maintien dans les 6 mois permet de vérifier la conformité continue.`
  } else {
    portee = ['PHY', 'OLS', 'ELEC', 'MFP', 'SLI', 'RA', 'COP', 'OPS']
    confiance = 0.90
    objectifs = `Audit complet — score critique`
    raisonTexte = `Score de risque global ${profil?.score_global ?? '?'}/100 (critique < 30) — une surveillance d'audit complète est recommandée immédiatement pour évaluer tous les domaines.`
  }

  const equipe_ids: string[] = []
  const chef_id = ''
  const date_debut = now
  const daysAhead = raison === 'sgs_absent' ? 14 : (raison === 'certification_fraiche' || raison === 'homologation_fraiche' ? 180 : 7)
  const date_fin = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString()

  const suggestion: IaSuggestion = {
    id: crypto.randomUUID(),
    aerodrome_id: aerodromeId,
    type,
    portee,
    date_debut,
    date_fin,
    equipe_ids,
    chef_id,
    priorite,
    objectifs,
    raison: raisonTexte,
    confiance,
    source: raison,
    created_at: now,
  }

  store.addIaSuggestion(suggestion)
}
