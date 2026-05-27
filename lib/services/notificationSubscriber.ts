// lib/services/notificationSubscriber.ts
// Abonne le service de notification aux changements d'état du store Zustand
// Détecte automatiquement les changements de profil risque, certifications,
// homologations, etc. et déclenche les notifications appropriées.
'use client'

import { useAppStore, ProfilRisque, Certification, Homologation } from '@/lib/store'
import { notificationService } from './notificationService'

const NIVEAUX = ['faible', 'moyen', 'eleve', 'critique'] as const

let active = false

export function initNotificationSubscriber() {
  if (active) return
  active = true

  let prevProfils: Record<string, ProfilRisque> = {}
  let prevCerts: Certification[] = []
  let prevHoms: Homologation[] = []

  // Initialiser avec les références de l'état actuel
  const initial = useAppStore.getState()
  prevProfils = initial.profilsRisque
  prevCerts = initial.certifications || []
  prevHoms = initial.homologations || []

  useAppStore.subscribe((state) => {
    // ── Profil de risque ──────────────────────────────────
    if (state.profilsRisque !== prevProfils) {
      for (const [id, profil] of Object.entries(state.profilsRisque)) {
        const prev = prevProfils[id]
        if (!prev) continue
        if (profil.niveau === prev.niveau) continue

        const prevIdx = NIVEAUX.indexOf(prev.niveau)
        const newIdx = NIVEAUX.indexOf(profil.niveau)

        if (newIdx > prevIdx) {
          notificationService.notify('profil_risque_alerte', {
            aerodrome_id: id,
            niveau: profil.niveau,
            score: profil.score_global,
          })
        } else {
          notificationService.notify('profil_risque_ameliore', {
            aerodrome_id: id,
            score: profil.score_global,
          })
        }
      }
      prevProfils = state.profilsRisque  // stocker la référence, pas une copie
    }

    // ── Certifications ────────────────────────────────────
    const certs = state.certifications || []
    if (certs !== prevCerts) {
      for (const cert of certs) {
        const prev = prevCerts.find((c) => c.id === cert.id)
        if (!prev || prev.statut_global === cert.statut_global) continue

        notificationService.notify('certification_statut', {
          aerodrome_id: cert.aerodrome_id,
          statut: cert.statut_global,
          reference: cert.reference,
        })
      }
      prevCerts = state.certifications  // stocker la référence
    }

    // ── Homologations ─────────────────────────────────────
    const homs = state.homologations || []
    if (homs !== prevHoms) {
      for (const hom of homs) {
        const prev = prevHoms.find((h) => h.id === hom.id)
        if (!prev || prev.statut_global === hom.statut_global) continue

        notificationService.notify('homologation_statut', {
          aerodrome_id: hom.aerodrome_id,
          statut: hom.statut_global,
          reference: hom.reference,
        })
      }
      prevHoms = state.homologations  // stocker la référence
    }
  })
}
