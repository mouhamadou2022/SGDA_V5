// components/modules/surveillance/SurveillanceChecklistMaintien.tsx
// Checklist de maintien — revérifier les items précédemment SA + domaines à risque
// Moteur : profil de risque → domaines cibles → items des surveillances antérieures
'use client'

import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import { ChecklistStandardTable } from '@/components/modules/checklist/ChecklistStandardTable'
import type { DomaineChecklist, ChecklistItem, ProfilRisque } from '@/lib/store'
import { Shield, RefreshCw, Info, Sparkles, TrendingUp } from 'lucide-react'

interface Props {
  surveillanceId: string
  aerodromeId: string
  onSave?: (data: any) => void
  onComplete?: () => void
  readOnly?: boolean
  userRole?: string
  domainesAdditionnels?: string[]
  onDomainesChange?: (domaines: string[]) => void
}

const DOMAINES_DISPONIBLES = [
  { id: 'SLI', label: 'SLI' }, { id: 'PHY', label: 'PHY' },
  { id: 'OLS', label: 'OLS' }, { id: 'RA', label: 'RA' },
  { id: 'ELEC', label: 'ELEC' }, { id: 'MFP', label: 'MFP' },
  { id: 'COP', label: 'COP' }, { id: 'OPS', label: 'OPS' },
]

export default function SurveillanceChecklistMaintien({
  surveillanceId, aerodromeId, onSave, onComplete, readOnly = false, userRole = 'inspector',
  domainesAdditionnels = [], onDomainesChange,
}: Props) {
  const surveillances = useOptimizedStore(s => s.surveillances)
  const profilsRisque = useOptimizedStore(s => s.profilsRisque)
  const aerodromes = useOptimizedStore(s => s.aerodromes)
  const updateSurveillance = useAppStore(s => s.updateSurveillance)
  const [selectedDomaines, setSelectedDomaines] = useState<string[]>(domainesAdditionnels)
  const [showDomainSelector, setShowDomainSelector] = useState(false)

  const profil = profilsRisque?.[aerodromeId] as ProfilRisque | undefined
  const aerodrome = aerodromes?.find(a => a.id === aerodromeId)

  // Domaines ciblés par le profil de risque (ceux avec score dégradé)
  const domainesProfil = useMemo(() => {
    if (!profil) return []
    const cibles: string[] = []
    if ((profil.c1 ?? 100) < 60) cibles.push('SGS')
    if ((profil.c2 ?? 100) < 60) cibles.push('SLI', 'RA', 'COP')
    if ((profil.c3 ?? 100) < 60) cibles.push('PHY', 'OLS', 'ELEC', 'MFP')
    return [...new Set(cibles)]
  }, [profil])

  // Dernière surveillance terminée pour cet aérodrome
  const derniereSurveillance = useMemo(() => {
    return surveillances
      .filter(s => s.aerodrome_id === aerodromeId && s.id !== surveillanceId && s.checklist_hierarchy)
      .sort((a, b) => new Date(b.date_fin || b.created_at).getTime() - new Date(a.date_fin || a.created_at).getTime())[0]
  }, [surveillances, aerodromeId, surveillanceId])

  // Fusionner domaines profil + domaines ajoutés par l'inspecteur
  const domainesActifs = useMemo(() => {
    const tous = [...new Set([...domainesProfil, ...selectedDomaines])]
    return tous.length > 0 ? tous : ['SLI', 'PHY', 'OLS'] // fallback minimum
  }, [domainesProfil, selectedDomaines])

  // Générer la checklist maintien à partir des items SA de la dernière surveillance
  const maintienHierarchy = useMemo<DomaineChecklist[]>(() => {
    if (!derniereSurveillance?.checklist_hierarchy) {
      // Pas d'historique : checklist vide avec domaines du profil
      return domainesActifs.map(d => ({
        id: `maintien-${surveillanceId}-${d}`,
        nom: d,
        description: `Maintien — domaine ${d}`,
        items: [],
        sousDomaines: [],
        isExpanded: true,
        progression: 0,
        ordre: 0,
      } as unknown as DomaineChecklist))
    }

    // Filtrer la hiérarchie précédente : ne garder que les domaines ciblés + items SA
    const precedent = JSON.parse(JSON.stringify(derniereSurveillance.checklist_hierarchy)) as DomaineChecklist[]

    const filtrerItemsSA = (items: ChecklistItem[]): any[] =>
      items.filter(item => item.resultat === 'SA').map(item => ({
        ...item,
        resultat: undefined,
        prediction: 'SA' as ChecklistItem['prediction'],
        confiance: 70,
        observation: '',
      }))

    const filtrerDomaine = (domaine: DomaineChecklist): DomaineChecklist | null => {
      // Ne garder que les domaines dans domainesActifs
      const nomDomaine = domaine.nom?.toUpperCase() || ''
      const matchDirect = domainesActifs.some(d => d.toUpperCase() === nomDomaine || nomDomaine.includes(d))
      const matchSousDomaine = (domaine.sousDomaines || []).some(sd =>
        domainesActifs.some(d => (sd.nom || '').toUpperCase().includes(d))
      )

      if (!matchDirect && !matchSousDomaine) return null

      return {
        ...domaine,
        items: filtrerItemsSA(domaine.items || []),
        sousDomaines: (domaine.sousDomaines || []).map(sd => ({
          ...sd,
          items: filtrerItemsSA(sd.items || []),
          sousSousDomaines: (sd.sousSousDomaines || []).map(ssd => ({
            ...ssd,
            items: filtrerItemsSA(ssd.items || []),
          })),
        })),
        isExpanded: true,
        progression: 0,
      }
    }

    const filtres = precedent.map(filtrerDomaine).filter(Boolean) as DomaineChecklist[]

    // Ajouter les domaines du profil sans historique
    for (const d of domainesActifs) {
      if (!filtres.some(f => (f.nom || '').toUpperCase().includes(d.toUpperCase()))) {
        filtres.push({
          id: `maintien-${surveillanceId}-${d}`,
          nom: d,
          description: `Maintien — nouveau domaine ${d} (profil de risque)`,
          items: [],
          sousDomaines: [],
          isExpanded: true,
          progression: 0,
          ordre: filtres.length,
        } as unknown as DomaineChecklist)
      }
    }

    return filtres
  }, [derniereSurveillance, domainesActifs, surveillanceId])

  // Sauvegarde
  const handleUpdateItem = useCallback((updated: ChecklistItem) => {
    const surv = useAppStore.getState().surveillances.find(s => s.id === surveillanceId)
    const current = surv?.checklist_hierarchy || maintienHierarchy

    const updateInPlace = (domaines: DomaineChecklist[]): DomaineChecklist[] =>
      domaines.map(d => ({
        ...d,
        items: (d.items || []).map(i => i.id === updated.id ? { ...i, ...updated } : i),
        sousDomaines: (d.sousDomaines || []).map(sd => ({
          ...sd,
          items: (sd.items || []).map(i => i.id === updated.id ? { ...i, ...updated } : i),
          sousSousDomaines: (sd.sousSousDomaines || []).map(ssd => ({
            ...ssd,
            items: (ssd.items || []).map(i => i.id === updated.id ? { ...i, ...updated } : i),
          })),
        })),
      }))

    const updatedHierarchy = updateInPlace(current)
    useAppStore.getState().setChecklistHierarchy(surveillanceId, updatedHierarchy as any)
    updateSurveillance(surveillanceId, { checklist_hierarchy: updatedHierarchy as any })
    if (onSave) onSave(updatedHierarchy)
  }, [surveillanceId, maintienHierarchy, updateSurveillance, onSave])

  // Auto-save périodique
  useEffect(() => {
    if (readOnly) return
    const surv = useAppStore.getState().surveillances.find(s => s.id === surveillanceId)
    if (!surv?.checklist_hierarchy) {
      updateSurveillance(surveillanceId, { checklist_hierarchy: maintienHierarchy as any })
    }
    const interval = setInterval(() => {
      const s = useAppStore.getState().surveillances.find(sv => sv.id === surveillanceId)
      if (s?.checklist_hierarchy && onSave) onSave(s.checklist_hierarchy)
    }, 5000)
    return () => clearInterval(interval)
  }, [surveillanceId, readOnly])

  // Initialiser la hiérarchie si vide
  useEffect(() => {
    const surv = useAppStore.getState().surveillances.find(s => s.id === surveillanceId)
    if (!surv?.checklist_hierarchy || surv.checklist_hierarchy.length === 0) {
      updateSurveillance(surveillanceId, { checklist_hierarchy: maintienHierarchy as any })
    }
  }, [surveillanceId])

  const surv = useAppStore.getState().surveillances.find(s => s.id === surveillanceId)
  const hierarchy = surv?.checklist_hierarchy || maintienHierarchy
  const totalItems = useMemo(() => {
    let count = 0
    for (const d of hierarchy) {
      count += (d.items || []).length
      for (const sd of (d.sousDomaines || [])) {
        count += (sd.items || []).length
        for (const ssd of (sd.sousSousDomaines || [])) count += (ssd.items || []).length
      }
    }
    return count
  }, [hierarchy])

  const itemsSA = useMemo(() => {
    let count = 0
    for (const d of hierarchy) {
      count += (d.items || []).filter(i => i.resultat === 'SA').length
      for (const sd of (d.sousDomaines || [])) {
        count += (sd.items || []).filter(i => i.resultat === 'SA').length
        for (const ssd of (sd.sousSousDomaines || [])) count += (ssd.items || []).filter(i => i.resultat === 'SA').length
      }
    }
    return count
  }, [hierarchy])

  return (
    <div className="space-y-4" data-role={userRole}>
      {/* Bandeau info maintien */}
      <div className="card border-l-4 border-l-role-primary bg-role-primary/5">
        <div className="card-content p-4">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-role-primary mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">Maintien — revérification ciblée</p>
              <p className="text-xs text-muted-foreground mt-1">
                {derniereSurveillance
                  ? `Basé sur la dernière inspection du ${new Date(derniereSurveillance.date_debut).toLocaleDateString('fr-FR')}`
                  : 'Première inspection de maintien — pas d\'historique disponible'}
                {aerodrome?.code_oaci ? ` — ${aerodrome.code_oaci}` : ''}
              </p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  <Sparkles className="w-3 h-3 inline mr-1 text-role-primary" />
                  {totalItems} items à vérifier • {itemsSA} déjà conformes
                </span>
                {domainesProfil.length > 0 && (
                  <span className="text-xs text-warning flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Domaines du profil : {domainesProfil.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sélecteur de domaines additionnels */}
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowDomainSelector(!showDomainSelector)}
            className="btn btn-sm btn-secondary gap-1.5"
          >
            <Shield className="w-3.5 h-3.5" />
            {selectedDomaines.length > 0 ? `${selectedDomaines.length} domaine(s) ajouté(s)` : 'Ajouter des domaines'}
          </button>
          {showDomainSelector && (
            <div className="flex items-center gap-1.5 flex-wrap p-2 bg-role-primary-soft rounded-lg">
              {DOMAINES_DISPONIBLES.map(d => (
                <button
                  key={d.id}
                  onClick={() => {
                    const next = selectedDomaines.includes(d.id)
                      ? selectedDomaines.filter(x => x !== d.id)
                      : [...selectedDomaines, d.id]
                    setSelectedDomaines(next)
                    if (onDomainesChange) onDomainesChange(next)
                  }}
                  className={`badge text-[10px] cursor-pointer transition-colors ${selectedDomaines.includes(d.id) ? 'badge-primary' : 'badge-outline'}`}
                >
                  {selectedDomaines.includes(d.id) ? '✓ ' : '+ '}{d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tableau checklist standard (design inchangé) */}
      {hierarchy.length > 0 ? (
        <ChecklistStandardTable
          domaines={hierarchy as any}
          onUpdateItem={handleUpdateItem as any}
          readOnly={readOnly}
        />
      ) : (
        <div className="card">
          <div className="card-content py-12 text-center">
            <Info className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-muted-foreground">Aucun item à vérifier pour cette inspection de maintien</p>
            {!readOnly && <p className="text-xs text-muted-foreground mt-1">Ajoutez des domaines ou lancez une inspection standard</p>}
          </div>
        </div>
      )}
    </div>
  )
}
