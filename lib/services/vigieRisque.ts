// lib/services/vigieRisque.ts
// Veille proactive : transforme le score risque en actions silencieuses
'use client'

import { useAppStore } from '@/lib/store'
import type { Aerodrome, Ecart, ProfilRisque, Surveillance, Utilisateur } from '@/lib/store'

function getCadreDirigeants(utilisateurs: Utilisateur[]): Utilisateur[] {
  return utilisateurs.filter(u => u.role === 'dg_anacim' || u.role === 'chef_sna' || u.role === 'admin' && !u.deleted_at)
}

function getInspecteursAerodrome(utilisateurs: Utilisateur[], ecarts: Ecart[]): Utilisateur[] {
  const inspecteurIds = new Set(ecarts.map(e => e.inspecteur_ref_id).filter(Boolean))
  return utilisateurs.filter(u => inspecteurIds.has(u.id) && !u.deleted_at)
}

export function declencherVigie() {
  const state = useAppStore.getState()
  const { profilsRisque, ecarts, surveillances, aerodromes, utilisateurs, addNotification } = state

  const dirigeants = getCadreDirigeants(utilisateurs)
  const now = new Date()

  const aerodromesList = aerodromes as Aerodrome[]
  for (const aero of aerodromesList) {
    if (aero.deleted_at) continue
    const profil: ProfilRisque | undefined = profilsRisque[aero.id]
    if (!profil) continue

    const ecartsAero: Ecart[] = ecarts.filter((e: Ecart) => e.aerodrome_id === aero.id && e.statut !== 'cloture')
    const inspecteurs: Utilisateur[] = getInspecteursAerodrome(utilisateurs, ecartsAero)
    const vitesse: number = profil.velocity_metrics?.vitesse ?? 0

    // ── Scénario 1 : Score critique → notifier TOUS les inspecteurs + chefs ──
    if (profil.score_global < 30 && ecartsAero.length > 0) {
      const nbCritiques: number = ecartsAero.filter((e: Ecart) => e.niveau_risque === 'critique').length
      const titre = `🔴 ALERTE : ${aero.code_oaci} risque critique`
      const message = `Score ${profil.score_global}/100 – ${ecartsAero.length} écart(s) dont ${nbCritiques} critique(s). Action requise.`

      for (const u of [...inspecteurs, ...dirigeants]) {
        addNotification({
          user_id: u.id, type: 'danger', title: titre, message,
          link: `/aerodromes/${aero.id}/details?tab=risque`, canal: 'in_app',
        })
      }
    }

    // ── Scénario 2 : Dégradation rapide (vélocité < -1.5) + score en baisse ──
    if (vitesse < -1.5 && profil.tendance === 'baisse') {
      const ecartsChauds: Ecart[] = ecartsAero.filter((e: Ecart) =>
        e.niveau_risque === 'critique' || e.niveau_risque === 'eleve'
      )
      if (ecartsChauds.length > 0) {
        const refs: string = ecartsChauds.slice(0, 3).map((e: Ecart) => e.reference).join(', ')
        const message = `${aero.code_oaci} : dégradation rapide (vélocité ${vitesse.toFixed(1)}). Écarts : ${refs}${ecartsChauds.length > 3 ? '...' : ''}`
        for (const u of [...inspecteurs, ...dirigeants]) {
          addNotification({
            user_id: u.id, type: 'warning',
            title: `⚠️ Dégradation : ${aero.code_oaci}`, message,
            link: `/aerodromes/${aero.id}/details?tab=risque`, canal: 'in_app',
          })
        }
      }
    }

    // ── Scénario 3 : Écart critique/élevé avec deadline PAC proche (< 7j) ──
    const pacImminents: Ecart[] = ecartsAero.filter((e: Ecart) => {
      if (!e.delai_pac || e.statut === 'pac_soumis' || e.statut === 'pac_accepte' || e.statut === 'cloture') return false
      if (e.niveau_risque !== 'critique' && e.niveau_risque !== 'eleve') return false
      const deadline = new Date(e.delai_pac)
      const joursRestants = Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
      return joursRestants >= 0 && joursRestants <= 7
    })
    for (const e of pacImminents) {
      const inspecteur = utilisateurs.find((u: Utilisateur) => u.id === e.inspecteur_ref_id)
      if (!inspecteur) continue
      const deadline = new Date(e.delai_pac!)
      const jours = Math.ceil((deadline.getTime() - now.getTime()) / 86400000)
      addNotification({
        user_id: inspecteur.id, type: 'danger',
        title: `⏰ PAC urgent : ${e.reference}`,
        message: `PAC à soumettre avant le ${deadline.toLocaleDateString('fr-FR')} (J-${jours}) – écart ${e.niveau_risque} sur ${aero.code_oaci}`,
        link: `/plans-actions/${e.id}`, canal: 'in_app',
      })
    }

    // ── Scénario 4 : Gap surveillance (> 12 mois) + score en baisse (> 15 pts) ──
    const dernieresSurv: Surveillance[] = surveillances
      .filter((s: Surveillance) => s.aerodrome_id === aero.id && (s.statut === 'transmise' || s.statut === 'archivee'))
      .sort((a: Surveillance, b: Surveillance) => new Date(b.date_fin).getTime() - new Date(a.date_fin).getTime())
    if (dernieresSurv.length > 0) {
      const derniere = new Date(dernieresSurv[0].date_fin)
      const moisDepuis = (now.getTime() - derniere.getTime()) / (30 * 86400000)
      if (moisDepuis > 12) {
        const historique = profil.historical_scores
        const baisse = historique && historique.length >= 2
          ? historique[historique.length - 1].score - historique[0].score
          : 0
        if (baisse > 15 || profil.score_global < 40) {
          for (const u of dirigeants) {
            addNotification({
              user_id: u.id, type: 'warning',
              title: `📋 Aucune surveillance depuis ${Math.round(moisDepuis)} mois : ${aero.code_oaci}`,
              message: `Dernière : ${derniere.toLocaleDateString('fr-FR')}. Score : ${profil.score_global}/100 (baisse ${baisse} pts). Suggestion : planifier inspection.`,
              link: `/planning?aerodrome=${aero.id}`, canal: 'in_app',
            })
          }
        }
      }
    }

    // ── Scénario 5 : Qualité des données faible ──
    if (profil.qualityScore !== undefined && profil.qualityScore < 40) {
      for (const u of dirigeants) {
        addNotification({
          user_id: u.id, type: 'warning',
          title: `📊 Fiabilité faible : ${aero.code_oaci}`,
          message: `QualityScore ${profil.qualityScore}/100 (${profil.qualite}). Données incomplètes ou obsolètes.`,
          link: `/aerodromes/${aero.id}/details?tab=risque`, canal: 'in_app',
        })
      }
    }
  }
}
