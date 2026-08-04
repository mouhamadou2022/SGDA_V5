// components/modules/amdec/AmdecModule.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/lib/store'
import { ModuleHeader } from '@/components/layout/ModuleHeader'
import { Card } from '@/components/ui/card'
import { Role, NIVEAUX_RISQUE_ECART } from '@/lib/config'
import type { NiveauGravite } from '@/lib/risque/types'
import {
  CATALOGUE_AMDEC,
  calculeIPR,
  getIPRNiveau,
  getSystemesParDomaine,
  getMalusC3Details,
  IPR_LABELS,
  IPR_COULEURS,
  STATUT_LABELS,
  GRAVITE_LABEL,
  PROBABILITE_LABEL,
  DETECTION_LABEL,
  type AmdecAnalyse,
  type StatutAmdec,
} from '@/lib/risque/amdecEngine'
import {
  Settings2, ShieldAlert, Gauge, Plus, FileWarning,
  CheckCircle2, Pencil, Trash2, X, Activity, Wrench,
} from 'lucide-react'

interface AmdecModuleProps {
  user?: { role?: string; aerodrome_id?: string; id?: string; prenom?: string; nom?: string }
  userRole?: Role
  aerodromeId?: string
  embedded?: boolean
}

const GRAVITE_OPTIONS: NiveauGravite[] = ['A', 'B', 'C', 'D', 'E']

function addJours(date: Date, jours: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + jours)
  return d
}

export function AmdecModule({ user: userProp, userRole: userRoleProp, aerodromeId: aerodromeIdProp, embedded = false }: AmdecModuleProps) {
  const user = useAppStore((s) => s.user)
  const userRole = (userRoleProp ?? userProp?.role ?? user?.role ?? 'inspector') as Role
  const userAerodrome = aerodromeIdProp ?? userProp?.aerodrome_id ?? user?.aerodrome_id
  const aerodromes = useAppStore((s) => s.aerodromes)
  const amdecAnalyses = useAppStore((s) => s.amdecAnalyses)
  const ecarts = useAppStore((s) => s.ecarts)
  const initializeAmdecForAerodrome = useAppStore((s) => s.initializeAmdecForAerodrome)
  const updateAmdecAnalyse = useAppStore((s) => s.updateAmdecAnalyse)
  const deleteAmdecAnalyse = useAppStore((s) => s.deleteAmdecAnalyse)
  const addEcart = useAppStore((s) => s.addEcart)
  const lierEcartAmdec = useAppStore((s) => s.lierEcartAmdec)
  const addNotification = useAppStore((s) => s.addNotification)
  const recalculerProfilRisque = useAppStore((s) => s.recalculerProfilRisque)

  const [selectedAerodrome, setSelectedAerodrome] = useState<string>(userAerodrome || 'tous')
  const [editAnalyse, setEditAnalyse] = useState<AmdecAnalyse | null>(null)
  const [editForm, setEditForm] = useState<{ gravite: NiveauGravite; probabilite: number; detection_score: number }>({
    gravite: 'C', probabilite: 3, detection_score: 3,
  })
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Synchroniser la sélection si un aérodrome est imposé (opérateur)
  useEffect(() => {
    if (userAerodrome) setSelectedAerodrome(userAerodrome)
  }, [userAerodrome])

  const analyses = useMemo(() => {
    if (selectedAerodrome === 'tous') return amdecAnalyses
    return amdecAnalyses.filter((a) => a.aerodrome_id === selectedAerodrome)
  }, [amdecAnalyses, selectedAerodrome])

  const malus = useMemo(() => getMalusC3Details(analyses), [analyses])

  const stats = useMemo(() => {
    return {
      total: analyses.length,
      critiques: analyses.filter((a) => a.niveau === 'critique').length,
      eleves: analyses.filter((a) => a.niveau === 'eleve').length,
      moyens: analyses.filter((a) => a.niveau === 'moyen').length,
      corriges: analyses.filter((a) => a.statut === 'corrige').length,
      nonCorriges: analyses.filter((a) => a.statut !== 'corrige').length,
    }
  }, [analyses])

  const groupes = useMemo(() => {
    const parDomaine = new Map<string, Map<string, AmdecAnalyse[]>>()
    for (const a of analyses) {
      if (!parDomaine.has(a.domaine)) parDomaine.set(a.domaine, new Map())
      const systemes = parDomaine.get(a.domaine)!
      if (!systemes.has(a.systeme)) systemes.set(a.systeme, [])
      systemes.get(a.systeme)!.push(a)
    }
    return Array.from(parDomaine.entries()).map(([domaine, systemes]) => ({
      domaine,
      systemes: Array.from(systemes.entries()).map(([systeme, items]) => ({ systeme, items })),
    }))
  }, [analyses])

  const handleInit = async () => {
    if (selectedAerodrome === 'tous') return
    await initializeAmdecForAerodrome(selectedAerodrome)
    addNotification({ user_id: '', type: 'success', title: 'AMDEC initialisée', message: 'Analyse AMDEC créée à partir du catalogue pour l\'aérodrome sélectionné', canal: 'in_app' })
  }

  const openEdit = (a: AmdecAnalyse) => {
    setEditAnalyse(a)
    setEditForm({ gravite: a.gravite, probabilite: a.probabilite, detection_score: a.detection_score })
  }

  const handleSaveEdit = async () => {
    if (!editAnalyse) return
    await updateAmdecAnalyse(editAnalyse.id, editForm)
    setEditAnalyse(null)
  }

  const handleChangerStatut = async (a: AmdecAnalyse, statut: StatutAmdec) => {
    await updateAmdecAnalyse(a.id, { statut })
  }

  const createEcart = async (a: AmdecAnalyse) => {
    try {
      const now = new Date()
      const delais = NIVEAUX_RISQUE_ECART[a.niveau] ?? NIVEAUX_RISQUE_ECART.moyen
      const nbAmdec = ecarts.filter((e) => e.reference.includes('-AMD-')).length + 1
      const reference = `${now.getFullYear()}-AMD-${String(nbAmdec).padStart(2, '0')}`
      const newEcart = {
        id: crypto.randomUUID(),
        aerodrome_id: a.aerodrome_id,
        domaine: a.domaine,
        reference,
        ref_reglementaire: `${a.domaine} / AMDEC`,
        libelle: `[AMDEC] ${a.mode_defaillance} — ${a.equipement}`,
        niveau_risque: a.niveau,
        statut: 'ouvert' as const,
        delai_pac: addJours(now, delais.delai_pac).toISOString(),
        delai_regularisation: addJours(now, delais.delai_regularisation).toISOString(),
        inspecteur_ref_id: user?.id || '',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      }
      await addEcart(newEcart as any)
      await lierEcartAmdec(a.id, newEcart.id)
      await recalculerProfilRisque(a.aerodrome_id)
      addNotification({ user_id: '', type: 'success', title: 'Écart créé', message: `Écart ${reference} généré depuis l'analyse AMDEC`, canal: 'in_app' })
    } catch (err) {
      console.error('[AMDEC] Erreur création écart:', err)
      addNotification({ user_id: '', type: 'danger', title: 'Échec création écart', message: 'Impossible de créer l\'écart depuis l\'analyse AMDEC', canal: 'in_app' })
    }
  }

  const iprEdit = calculeIPR(editForm.gravite, editForm.probabilite, editForm.detection_score)
  const iprEditNiveau = getIPRNiveau(iprEdit)

  const selectStyle = {
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
    backgroundPosition: 'right 0.75rem center',
    backgroundRepeat: 'no-repeat'
  }

  return (
    <div className="space-y-6 animate-fade-up" data-role={userRole} data-module="amdec">
      {!embedded && (
        <ModuleHeader
          icon={<Settings2 className="w-6 h-6" />}
          title="AMDEC"
          description="Analyse des Modes de Défaillance et de leurs Effets et Criticité — IPR = Gravité × Probabilité × Détection"
          actions={
            <button
              onClick={handleInit}
              disabled={selectedAerodrome === 'tous'}
              className="btn btn-primary gap-2"
            >
              <Plus className="w-4 h-4" /> Initialiser depuis le catalogue
            </button>
          }
        />
      )}

      {/* Sélecteur aérodrome */}
      {!userAerodrome && !embedded && (
        <Card variant="role" size="sm">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-foreground">Aérodrome :</label>
            <select
              value={selectedAerodrome}
              onChange={(e) => setSelectedAerodrome(e.target.value)}
              className="appearance-none rounded-md border border-border bg-card px-3 py-2 pr-8 text-sm text-foreground"
              style={selectStyle}
            >
              <option value="tous">Tous les aérodromes</option>
              {aerodromes.map((a) => (
                <option key={a.id} value={a.id}>{a.nom}</option>
              ))}
            </select>
            <span className="text-sm text-foreground/50">{stats.total} mode(s) de défaillance référencé(s)</span>
          </div>
        </Card>
      )}

      {/* KPI */}
      {!embedded && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card variant="role" size="sm" title="Modes analysés" icon={<Settings2 className="w-4 h-4" />}>
          <div className="text-3xl font-bold text-foreground">{stats.total}</div>
          <div className="text-[13px] text-foreground/50">{stats.nonCorriges} non corrigés</div>
        </Card>
        <Card variant="level" size="sm" levelColor="danger" title="Critiques" icon={<ShieldAlert className="w-4 h-4" />}>
          <div className="text-3xl font-bold text-foreground">{stats.critiques}</div>
          <div className="text-[13px] text-foreground/50">IPR ≥ 60</div>
        </Card>
        <Card variant="level" size="sm" levelColor="warning" title="Élevés" icon={<Activity className="w-4 h-4" />}>
          <div className="text-3xl font-bold text-foreground">{stats.eleves}</div>
          <div className="text-[13px] text-foreground/50">IPR ≥ 40</div>
        </Card>
        <Card variant="level" size="sm" levelColor="primary" title="Moyens" icon={<Gauge className="w-4 h-4" />}>
          <div className="text-3xl font-bold text-foreground">{stats.moyens}</div>
          <div className="text-[13px] text-foreground/50">IPR ≥ 20</div>
        </Card>
        <Card variant="level" size="sm" levelColor="success" title="Corrigés" icon={<CheckCircle2 className="w-4 h-4" />}>
          <div className="text-3xl font-bold text-foreground">{stats.corriges}</div>
          <div className="text-[13px] text-foreground/50">mode(s) résolu(s)</div>
        </Card>
      </div>
      )}

      {/* Malus C3 */}
      {malus.malus > 0 && (
        <Card variant="alert" alertBg="warning" size="sm" title={`Impact sur la conformité technique (C3) : −${malus.malus} pts`} icon={<FileWarning className="w-4 h-4" />}>
          <p className="text-foreground">
            {malus.critiques} mode(s) critique(s) (−5 pts chacun) et {malus.eleves} mode(s) élevé(s) (−2 pts chacun)
            non corrigés dégradent le score C3 du profil de risque de l'aérodrome.
            Créez des écarts/PAC pour ces modes afin de restaurer la conformité technique.
          </p>
        </Card>
      )}

      {analyses.length === 0 && (
        <Card variant="role" size="sm">
          <div className="py-8 text-center">
            <Gauge className="w-10 h-10 mx-auto mb-3 text-foreground/30" />
            <p className="text-foreground font-medium mb-2">Aucune analyse AMDEC</p>
            <p className="text-sm text-foreground/50 mb-4">Cliquez sur « Initialiser depuis le catalogue » pour générer l'analyse des modes de défaillance de l'aérodrome sélectionné.</p>
            {((selectedAerodrome === 'tous' && userAerodrome) || (embedded && selectedAerodrome !== 'tous')) && (
              <button onClick={handleInit} className="btn btn-primary gap-2">
                <Plus className="w-4 h-4" /> Initialiser l'analyse
              </button>
            )}
          </div>
        </Card>
      )}

      {/* Tableau par domaine / système */}
      {groupes.map((groupe) => (
        <div key={groupe.domaine} className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{groupe.domaine}</h2>
          {groupe.systemes.map((sys) => {
            const iprMax = Math.max(...sys.items.map((i) => i.ipr))
            return (
              <Card
                key={sys.systeme}
                variant="level"
                levelColor={iprMax >= 60 ? 'danger' : iprMax >= 40 ? 'warning' : 'primary'}
                title={sys.systeme}
                subtitle={`${sys.items.length} mode(s) de défaillance — IPR max ${iprMax}`}
                icon={<Wrench className="w-4 h-4" />}
              >
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="px-2 py-2 font-medium text-foreground/60">Mode de défaillance</th>
                        <th className="px-2 py-2 font-medium text-foreground/60 hidden lg:table-cell">Effet</th>
                        <th className="px-2 py-2 font-medium text-foreground/60 hidden xl:table-cell">Cause</th>
                        <th className="px-2 py-2 font-medium text-foreground/60 hidden xl:table-cell">Détection</th>
                        <th className="px-2 py-2 font-medium text-foreground/60">G</th>
                        <th className="px-2 py-2 font-medium text-foreground/60">P</th>
                        <th className="px-2 py-2 font-medium text-foreground/60">D</th>
                        <th className="px-2 py-2 font-medium text-foreground/60 text-right">IPR</th>
                        <th className="px-2 py-2 font-medium text-foreground/60">Statut</th>
                        <th className="px-2 py-2 font-medium text-foreground/60 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sys.items.map((a) => (
                        <tr key={a.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                          <td className="px-2 py-2 text-foreground">
                            <div className="font-medium">{a.mode_defaillance}</div>
                            <div className="text-[12px] text-foreground/50">{a.equipement}</div>
                          </td>
                          <td className="px-2 py-2 text-foreground/80 hidden lg:table-cell">{a.effet}</td>
                          <td className="px-2 py-2 text-foreground/80 hidden xl:table-cell">{a.cause}</td>
                          <td className="px-2 py-2 text-foreground/80 hidden xl:table-cell">{a.detection}</td>
                          <td className="px-2 py-2 text-foreground" title={GRAVITE_LABEL[a.gravite]}>{a.gravite}</td>
                          <td className="px-2 py-2 text-foreground" title={PROBABILITE_LABEL[a.probabilite]}>{a.probabilite}</td>
                          <td className="px-2 py-2 text-foreground" title={DETECTION_LABEL[a.detection_score]}>{a.detection_score}</td>
                          <td className="px-2 py-2 text-right">
                            <span
                              className="inline-block min-w-[3rem] text-center font-bold rounded-md px-2 py-0.5 text-white"
                              style={{ backgroundColor: IPR_COULEURS[a.niveau] }}
                            >
                              {a.ipr}
                            </span>
                            <div className="text-[11px] text-foreground/50 mt-0.5">{IPR_LABELS[a.niveau]}</div>
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={a.statut}
                              onChange={(e) => handleChangerStatut(a, e.target.value as StatutAmdec)}
                              className="appearance-none rounded-md border border-border bg-card px-2 py-1 pr-6 text-xs text-foreground"
                              style={selectStyle}
                            >
                              {(Object.keys(STATUT_LABELS) as StatutAmdec[]).map((s) => (
                                <option key={s} value={s}>{STATUT_LABELS[s]}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-end gap-1.5">
                              {a.statut !== 'corrige' && (
                                <button
                                  onClick={() => createEcart(a)}
                                  disabled={!!a.ecart_id}
                                  title={a.ecart_id ? 'Écart déjà créé' : 'Créer un écart/PAC priorisé'}
                                  className="inline-flex items-center gap-1 rounded-md bg-danger/10 text-danger px-2 py-1 text-xs font-medium hover:bg-danger/20 disabled:opacity-40"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Écart
                                </button>
                              )}
                              <button
                                onClick={() => openEdit(a)}
                                title="Modifier les cotes (G/P/D)"
                                className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/30"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteAmdecAnalyse(a.id)}
                                title="Supprimer l'analyse"
                                className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-danger/10"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          })}
        </div>
      ))}

      {/* Modal édition IPR */}
      {editAnalyse && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditAnalyse(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-card border border-border p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Modifier la criticité</h3>
              <button onClick={() => setEditAnalyse(null)} className="text-foreground/50 hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-foreground/70 font-medium">{editAnalyse.mode_defaillance} — {editAnalyse.equipement}</p>

            <div className="grid grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-foreground/60">Gravité (OACI)</span>
                <select
                  value={editForm.gravite}
                  onChange={(e) => setEditForm({ ...editForm, gravite: e.target.value as NiveauGravite })}
                  className="w-full appearance-none rounded-md border border-border bg-card px-3 py-2 pr-7 text-sm text-foreground"
                  style={selectStyle}
                >
                  {GRAVITE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g} — {GRAVITE_LABEL[g]}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-foreground/60">Probabilité</span>
                <select
                  value={editForm.probabilite}
                  onChange={(e) => setEditForm({ ...editForm, probabilite: Number(e.target.value) })}
                  className="w-full appearance-none rounded-md border border-border bg-card px-3 py-2 pr-7 text-sm text-foreground"
                  style={selectStyle}
                >
                  {[1, 2, 3, 4, 5].map((p) => (
                    <option key={p} value={p}>{p} — {PROBABILITE_LABEL[p]}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-foreground/60">Détection</span>
                <select
                  value={editForm.detection_score}
                  onChange={(e) => setEditForm({ ...editForm, detection_score: Number(e.target.value) })}
                  className="w-full appearance-none rounded-md border border-border bg-card px-3 py-2 pr-7 text-sm text-foreground"
                  style={selectStyle}
                >
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>{d} — {DETECTION_LABEL[d]}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
              <span className="text-sm text-foreground/60">IPR = G × P × D</span>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block min-w-[3rem] text-center font-bold rounded-md px-3 py-1 text-white"
                  style={{ backgroundColor: IPR_COULEURS[iprEditNiveau] }}
                >
                  {iprEdit}
                </span>
                <span className="text-sm font-semibold text-foreground">{IPR_LABELS[iprEditNiveau]}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditAnalyse(null)} className="rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted/30">Annuler</button>
              <button onClick={handleSaveEdit} className="rounded-md bg-role-primary px-4 py-2 text-sm font-semibold text-foreground hover:opacity-90">Enregistrer</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
