'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { fetchEcartsRedactionBySurveillance } from '@/lib/datastore'
import type { PAOELevel } from '@/types/checklist'

// Niveaux PAOE collectés pour les écarts SGS (aligné avec /ecarts/sgs).
const NIVEAUX_COLLECTES: PAOELevel[] = ['absent', 'present', 'approprie']

// UUID v4 déterministe — même construction que /ecarts/sgs (ids des items SGS).
function stringToUUID(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + ch
    hash |= 0
  }
  const h = Math.abs(hash).toString(16).padStart(8, '0')
  return `${h.slice(0,8)}-${h.slice(0,4)}-4${h.slice(1,4)}-${((parseInt(h.slice(0,2),16)&0x3f)|0x80).toString(16).padStart(2,'0')}${h.slice(2,4)}-${h.slice(0,12).padStart(12,'0')}`
}

// L'écart officiel ne porte pas les ids des items de la checklist : on les
// retrouve via le brouillon de rédaction (`ecarts_redaction.item_ids`) puis on
// résout chaque id vers la référence question depuis la surveillance :
// - items SGS (ex. SGS-1.2) : ids synthétiques reconstruits depuis
//   `sgs_evaluation_prepa` (même logique que RapportAnnexes) ;
// - items du référentiel (ex. QSC1.1, QSC02) : ids de la hiérarchie checklist.
// Le brouillon est mis en cache par surveillance pour éviter une requête par écart.
const brouillonsBySurveillance = new Map<string, any[]>()

interface EcartLike {
  id: string
  reference?: string
  surveillance_id?: string | null
}

interface ItemResolu {
  numero: string
  referenceReglementaire?: string
}

interface EcartSgsEvaluation {
  composantes?: {
    id: number
    label: string
    score: number
    niveauGlobal: PAOELevel
    elements: { elementId: string; label: string; niveauGlobal: PAOELevel }[]
  }[]
}

export function useEcartQuestionRefs(ecart: EcartLike | null | undefined): { refs: string[] } {
  const getChecklistItemsFromHierarchy = useAppStore(s => s.getChecklistItemsFromHierarchy)
  const surveillances = useAppStore(s => s.surveillances)
  const surveillanceId = ecart?.surveillance_id || null

  const [brouillons, setBrouillons] = useState<any[] | null>(() =>
    surveillanceId ? brouillonsBySurveillance.get(surveillanceId) ?? null : null
  )

  useEffect(() => {
    if (!surveillanceId) return
    const cached = brouillonsBySurveillance.get(surveillanceId)
    if (cached) {
      setBrouillons(cached)
      return
    }
    let alive = true
    fetchEcartsRedactionBySurveillance(surveillanceId)
      .then(rows => {
        brouillonsBySurveillance.set(surveillanceId, rows)
        if (alive) setBrouillons(rows)
      })
      .catch(() => {
        if (alive) setBrouillons([])
      })
    return () => {
      alive = false
    }
  }, [surveillanceId])

  return useMemo(() => {
    if (!ecart || !surveillanceId || !brouillons) return { refs: [] }
    const brouillon = brouillons.find(
      (b: any) => b?.id === ecart.id || (ecart.reference && b?.reference === ecart.reference)
    )
    if (!brouillon) return { refs: [] }
    const itemIds = (Array.isArray(brouillon.item_ids) ? brouillon.item_ids : []).filter(Boolean)
    if (!itemIds.length) return { refs: [] }

    // Items SGS (ids synthétiques stringToUUID(`sgs-...`)) + référentiel (hiérarchie).
    const surveillance = surveillances.find(s => s.id === surveillanceId)
    const evaluationSgs = (surveillance?.sgs_evaluation_prepa || null) as EcartSgsEvaluation | null

    const sgsById = new Map<string, ItemResolu>()
    if (evaluationSgs?.composantes) {
      for (const composante of evaluationSgs.composantes) {
        const compId = Number(composante.id)
        composante.elements.forEach((element, idx) => {
          if (!NIVEAUX_COLLECTES.includes(element.niveauGlobal)) return
          const itemId = stringToUUID(`sgs-${surveillanceId}-${compId}-${element.elementId}`)
          sgsById.set(itemId, { numero: `SGS-${compId}.${idx + 1}` })
        })
      }
    }

    const referentielItems = getChecklistItemsFromHierarchy(surveillanceId) as unknown as {
      id: string
      numero?: string
      reference_ras14?: string
    }[]
    const referentielById = new Map<string, ItemResolu>(
      referentielItems.map(i => [
        i.id,
        { numero: i.numero || i.reference_ras14 || '', referenceReglementaire: i.reference_ras14 },
      ])
    )

    const resolve = (id: string): string => {
      const it = sgsById.get(id) || referentielById.get(id)
      return it?.numero || ''
    }

    const refs: string[] = []
    for (const id of itemIds) {
      const ref = resolve(id)
      if (ref && !refs.includes(ref)) refs.push(ref)
    }
    return { refs }
  }, [brouillons, ecart, surveillanceId, surveillances, getChecklistItemsFromHierarchy])
}