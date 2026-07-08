// components/modules/planning/PreparationModal.tsx
// Modale de préparation de surveillance avec 4 onglets
// + envoi checklist aux exploitants (in-app + email)
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAppStore, Planning, Ecart, Utilisateur } from '@/lib/store'
import { toast } from '@/lib/toast'

const ROLE_EXPLOITANT = ['dg_operator', 'focal_operator', 'staff_operator']
import { Card } from '@/components/ui/card'
import { DOMAINES_SURVEILLANCE, getDomaineLabel, SPECIALITES_INSPECTEUR } from '@/lib/domaines'
import { getRiskLevelBgVariant, getRiskLevelClass } from '@/lib/risque'
import { useDecisionEngine } from '@/hooks/useDecisionEngine'
import AerorisqAnalyse from '@/components/ia/AerorisqAnalyse'
import {
  Calendar, CheckCircle2, ClipboardList, Clock, FileText, History, LayoutGrid,
  MapPin, PlayCircle, Send, Shield, Target, TrendingDown, TrendingUp, Users,
  UserCheck, X, AlertCircle, AlertTriangle, Save, Brain, ChevronRight, Loader2,
} from 'lucide-react'

interface Props {
  open: boolean
  planning: Planning | null
  onClose: () => void
  userRole: string
}

function formatNumber(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '0.00'
  return value.toFixed(digits)
}

export default function PreparationModal({ open, planning, onClose, userRole }: Props) {
  const router = useRouter()

  const aerodromes = useAppStore(s => s.aerodromes)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const surveillances = useAppStore(s => s.surveillances)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const ecarts = useAppStore(s => s.ecarts)
  const user = useAppStore(s => s.user)
  const addNotification = useAppStore(s => s.addNotification)
  const updatePlanning = useAppStore(s => s.updatePlanning)

  const decisionData = useDecisionEngine(planning?.aerodrome_id ?? null)

  const [activeTab, setActiveTab] = useState<'profil' | 'historique' | 'aerorisq' | 'checklist' | 'delegation'>('profil')
  const [delegations, setDelegations] = useState<Record<string, string>>({})
  const [showTypeChoice, setShowTypeChoice] = useState(false)
  const [sendingChecklist, setSendingChecklist] = useState(false)

  // Charger les délégations depuis Supabase (via planning.delegations) ou localStorage
  useEffect(() => {
    if (planning?.id) {
      const fromSupabase = planning.delegations
      const raw = localStorage.getItem(`sgda_delegations_${planning.id}`)
      if (fromSupabase && Object.keys(fromSupabase).length > 0) {
        setDelegations(fromSupabase)
        // Sync localStorage pour compatibilité checklist
        localStorage.setItem(`sgda_delegations_${planning.id}`, JSON.stringify(fromSupabase))
      } else if (raw) {
        try { setDelegations(JSON.parse(raw)) } catch {}
      }
    }
  }, [planning?.id])

  const aerodromesActifs = useMemo(() => aerodromes.filter(a => !a.deleted_at), [aerodromes])

  const domainesList = useMemo(() => {
    if (!planning) return []
    if (planning.portee && planning.portee.length > 0) {
      return planning.portee.map(code => ({ code, label: getDomaineLabel(code) }))
    }
    return DOMAINES_SURVEILLANCE.filter(d => d.code !== 'AGA').map(d => ({ code: d.code, label: d.label }))
  }, [planning?.portee])

  const inspecteursDisponibles = useMemo(() => {
    return utilisateurs
      .filter(u => u.role === 'inspector' && u.statut !== 'inactif')
      .map(u => {
        const linkedInsp = u.inspecteur_id
          ? inspecteurs.find(i => i.id === u.inspecteur_id)
          : inspecteurs.find(i => i.email === u.email || (i.prenom === u.prenom && i.nom === u.nom))
        return { ...u, _insp: linkedInsp }
      })
  }, [utilisateurs, inspecteurs])

  if (!open || !planning) return null

  const aerodrome = aerodromesActifs.find(a => a.id === planning.aerodrome_id) || aerodromes.find(a => a.id === planning.aerodrome_id)
  const profil = profilsRisque[planning.aerodrome_id]

  const ecartsActifs = ecarts.filter(e => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture')
  const nbEcartsCritiques = ecartsActifs.filter(e => e.niveau_risque === 'critique').length

  const surveillancesPrecedentes = surveillances
    .filter(s => s.aerodrome_id === planning.aerodrome_id)
    .sort((a, b) => new Date(b.date_debut).getTime() - new Date(a.date_debut).getTime())
    .slice(0, 3)

  const detectChecklistType = (): 'standard' | 'suivi' | 'pac' | 'mixte' => {
    const aDesEcarts = ecartsActifs.length > 0
    const aDesPac = ecartsActifs.some(e => e.pac)
    if (aDesEcarts && aDesPac) return 'mixte'
    if (aDesPac) return 'pac'
    if (aDesEcarts) return 'suivi'
    return 'standard'
  }

  const isSgsPortee = (planning.portee || []).length === 1 && planning.portee?.[0] === 'SGS'
  const checklistType = detectChecklistType()

  const getTypeLabel = () => {
    if (isSgsPortee) return 'Évaluation SGS — Maturité PAOE (Annexe 19 OACI)'
    switch (checklistType) {
      case 'mixte': return 'Checklist MIXTE (Standard + Écarts + PAC)'
      case 'suivi': return 'Checklist SUIVI DES ÉCARTS'
      case 'pac': return 'Checklist MISE EN ŒUVRE PAC'
      default: return 'Checklist STANDARD'
    }
  }

  const getProfilColor = () => {
    if (!profil) return 'text-gray-500'
    if (profil.score_global < 30) return 'text-danger'
    if (profil.score_global < 60) return 'text-warning'
    return 'text-success'
  }

  const getTendanceIcon = () => {
    if (!profil) return null
    if (profil.tendance === 'hausse') return <TrendingUp className="w-4 h-4 text-success" />
    if (profil.tendance === 'baisse') return <TrendingDown className="w-4 h-4 text-danger" />
    return null
  }

  const getTypeIcon = () => {
    if (isSgsPortee) return <Shield className="w-5 h-5" />
    switch (checklistType) {
      case 'mixte': return <LayoutGrid className="w-5 h-5" />
      case 'suivi': return <AlertTriangle className="w-5 h-5" />
      case 'pac': return <CheckCircle2 className="w-5 h-5" />
      default: return <ClipboardList className="w-5 h-5" />
    }
  }

  const handleSaveDelegations = () => {
    const nbDelegations = Object.keys(delegations).filter(d => delegations[d]).length
    if (planning?.id) {
      localStorage.setItem(`sgda_delegations_${planning.id}`, JSON.stringify(delegations))
      updatePlanning(planning.id, { delegations })
    }
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Délégations enregistrées',
      message: `${nbDelegations} domaine(s) assigné(s) - La checklist s'ouvrira avec cette répartition`,
      canal: 'in_app',
    })
    toast('success', `Délégations enregistrées (${nbDelegations} domaine(s))`, 'Sauvegarde réussie')
  }

  const handlePrefillChecklist = () => {
    addNotification({
      user_id: user?.id || '',
      type: 'info',
      title: 'Pré-remplissage',
      message: 'La checklist sera pré-remplie avec les données historiques à l\'ouverture',
      canal: 'in_app',
    })
  }

  const handleNotifyOperator = async () => {
    if (sendingChecklist) return
    setSendingChecklist(true)
    try {
      const ops = (utilisateurs || []).filter((u: Utilisateur) =>
        u.aerodrome_id === planning.aerodrome_id &&
        (ROLE_EXPLOITANT.includes(u.role ?? '') || u.role === 'guest') &&
        u.statut !== 'inactif' && u.statut !== 'suspendu'
      )
      const checklistUrl = `${window.location.origin}/preparation-checklist/${planning.id}`
      ops.forEach((op: Utilisateur) => {
        addNotification({ user_id: op.id, type: 'info', title: `Checklist à préparer — ${aerodrome?.code_oaci || 'N/A'}`, message: `La checklist de surveillance est disponible. Ouvrez-la ici : ${checklistUrl}`, canal: 'in_app' })
        addNotification({ user_id: op.id, type: 'info', title: `Checklist à préparer — ${aerodrome?.code_oaci || 'N/A'}`, message: `La checklist de surveillance est disponible. Ouvrez-la ici : ${checklistUrl}`, canal: 'email' })
      })
      addNotification({
        user_id: user?.id || '', type: 'success', title: 'Checklist envoyée',
        message: ops.length > 0
          ? `Checklist envoyée à ${ops.length} exploitant(s) (in-app + email)`
          : `Aucun exploitant trouvé pour ${aerodrome?.code_oaci || 'cet aérodrome'}. Vérifiez les comptes utilisateurs.`,
        canal: 'in_app',
      })
      if (ops.length > 0) {
        toast('success', `Checklist envoyée à ${ops.length} exploitant(s)`, 'Envoi réussi')
      } else {
        toast('warning', `Aucun exploitant trouvé pour ${aerodrome?.code_oaci || 'cet aérodrome'}`, 'Attention')
      }

      // Lier le planning au processus cert/homo actif
      const store = useAppStore.getState()
      const relatedCert = store.certifications.find(c => c.aerodrome_id === planning.aerodrome_id && c.phase_active === 3)
      if (relatedCert) {
        const currentPhase3 = (relatedCert.phases_data as any)?.phase3 || {}
        store.updateCertification(relatedCert.id, {
          phases_data: { ...relatedCert.phases_data, phase3: { ...currentPhase3, planning_id: planning.id } },
          updated_at: new Date().toISOString(),
        } as any)
      }
      const relatedHomo = store.homologations.find(h => h.aerodrome_id === planning.aerodrome_id && h.phase_active === 2)
      if (relatedHomo) {
        const currentPhase2 = (relatedHomo.phases_data as any)?.phase2 || {}
        store.updateHomologation(relatedHomo.id, {
          phases_data: { ...relatedHomo.phases_data, phase2: { ...currentPhase2, planning_id: planning.id } },
          updated_at: new Date().toISOString(),
        } as any)
      }
    } catch (e) {
      console.error('Erreur envoi checklist:', e)
      addNotification({
        user_id: user?.id || '', type: 'danger', title: 'Erreur',
        message: 'Impossible d\'envoyer la checklist. Réessayez.',
        canal: 'in_app',
      })
      toast('error', 'Impossible d\'envoyer la checklist', 'Erreur')
    } finally {
      setSendingChecklist(false)
    }
  }

  const handleOpenChecklist = () => {
    const portee = planning.portee || []
    const isSgsOnly = portee.length === 1 && portee[0] === 'SGS'
    const hasSGS = portee.includes('SGS')
    const hasSuivi = ecartsActifs.length > 0
    const hasPAC = ecartsActifs.some((e: Ecart) => e.pac)

    const possibleTypes: { type: string; label: string }[] = []
    if (isSgsOnly) {
      possibleTypes.push({ type: 'sgs', label: 'Évaluation SGS (PAOE)' })
    } else {
      possibleTypes.push({ type: 'standard', label: 'Checklist Standard' })
      if (hasSGS) possibleTypes.push({ type: 'sgs', label: 'Évaluation SGS (PAOE)' })
    }
    if (hasSuivi) possibleTypes.push({ type: 'suivi', label: 'Suivi des écarts' })
    if (hasPAC) possibleTypes.push({ type: 'pac', label: 'Mise en œuvre PAC' })

    if (possibleTypes.length > 1 && !isSgsOnly && !isSgsPortee) {
      setShowTypeChoice(true)
      return
    }

    onClose()
    // Sauvegarder les délégations avant d'ouvrir la checklist
    if (Object.keys(delegations).filter(d => delegations[d]).length > 0) {
      localStorage.setItem(`sgda_delegations_${planning.id}`, JSON.stringify(delegations))
      updatePlanning(planning.id, { delegations })
    }
    const chosenType = possibleTypes[0]?.type || 'standard'
    if (chosenType === 'sgs') {
      router.push(`/preparation-checklist/${planning.id}?type=sgs`)
    } else {
      router.push(`/preparation-checklist/${planning.id}?type=${chosenType}`)
    }
  }

  return createPortal(
    <>
      <div className="modal-overlay" data-role={userRole} onClick={onClose}>
        <div className="modal-content max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">

            {/* Header */}
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title flex items-center gap-2">
                <FileText className="w-5 h-5 text-role-primary" />
                Préparation de la surveillance - {aerodrome?.code_oaci} {aerodrome?.nom}
              </div>
              <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
            </div>

            {/* Body */}
            <div className="modal-body p-5 space-y-5">

              {/* Informations générales */}
              <Card className="[&>div:last-child]:p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-role-primary" />
                    <div><p className="text-xs text-muted-foreground">Aérodrome</p><p className="font-medium text-sm">{aerodrome?.code_oaci} - {aerodrome?.nom}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-role-primary" />
                    <div><p className="text-xs text-muted-foreground">Période</p><p className="font-medium text-sm">{new Date(planning.date_debut).toLocaleDateString('fr-FR')} → {new Date(planning.date_fin).toLocaleDateString('fr-FR')}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-role-primary" />
                    <div><p className="text-xs text-muted-foreground">Équipe</p><p className="font-medium text-sm">{planning.equipe_ids?.length || 0} inspecteur(s)</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-role-primary" />
                    <div><p className="text-xs text-muted-foreground">Type</p><p className="font-medium text-sm capitalize">{planning.type?.replace(/_/g, ' ')}</p></div>
                  </div>
                </div>
              </Card>

              {/* Onglets */}
              <div className="tabs">
                <button onClick={() => setActiveTab('profil')} className={`tab ${activeTab === 'profil' ? 'active' : ''}`}><TrendingUp className="w-4 h-4 inline mr-2" />Profil de risque</button>
                <button onClick={() => setActiveTab('historique')} className={`tab ${activeTab === 'historique' ? 'active' : ''}`}><History className="w-4 h-4 inline mr-2" />Historique</button>
                <button onClick={() => setActiveTab('aerorisq')} className={`tab ${activeTab === 'aerorisq' ? 'active' : ''}`}><Brain className="w-4 h-4 inline mr-2" />AERORISQ</button>
                <button onClick={() => setActiveTab('checklist')} className={`tab ${activeTab === 'checklist' ? 'active' : ''}`}><ClipboardList className="w-4 h-4 inline mr-2" />Checklist</button>
                <button onClick={() => setActiveTab('delegation')} className={`tab ${activeTab === 'delegation' ? 'active' : ''}`}><UserCheck className="w-4 h-4 inline mr-2" />Délégation</button>
              </div>

              {/* ========== ONGLET PROFIL DE RISQUE ========== */}
              {activeTab === 'profil' && profil && (
                <div className="tab-content space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="[&>div:last-child]:p-3 [&>div:last-child]:text-center">
                      <p className="text-xs text-muted-foreground">Score global</p>
                      <p className={`text-3xl font-bold ${getProfilColor()}`}>{profil.score_global}/100</p>
                      {profil.niveau && <span className="badge mt-1">Niveau: {profil.niveau}</span>}
                    </Card>
                    <Card className="[&>div:last-child]:p-3 [&>div:last-child]:text-center">
                      <p className="text-xs text-muted-foreground">Tendance</p>
                      <div className="flex items-center justify-center gap-1 mt-1">{getTendanceIcon()}<span className="text-lg font-medium capitalize">{profil.tendance || 'stable'}</span></div>
                    </Card>
                  </div>
                  <Card title="Détail des critères">
                      {[
                        { label: 'C1 - Maturité SGS', value: profil.c1 },
                        { label: 'C2 - Efficacité PAC', value: profil.c2 },
                        { label: 'C3 - Conformité', value: profil.c3 },
                        { label: 'C4 - Charge critique', value: profil.c4 },
                        { label: 'C5 - Résilience', value: profil.c5 },
                      ].map(crit => (
                        <div key={crit.label}>
                          <div className="flex justify-between text-xs mb-1"><span>{crit.label}</span><span className="font-medium">{crit.value}/100</span></div>
                          <div className="progress h-1.5"><div className={`progress-bar ${crit.value < 40 ? 'bg-danger' : crit.value < 60 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${crit.value}%` }} /></div>
                        </div>
                      ))}
                  </Card>
                  {profil.velocity_metrics && (
                    <div className="grid grid-cols-3 gap-3">
                      <Card className="[&>div:last-child]:p-2 [&>div:last-child]:text-center">
                        <p className="text-xs text-muted-foreground">Vitesse</p>
                        <p className={`text-sm font-semibold ${profil.velocity_metrics.vitesse < 0 ? 'text-danger' : 'text-success'}`}>{profil.velocity_metrics.vitesse > 0 ? '+' : ''}{formatNumber(profil.velocity_metrics.vitesse, 1)} pts/mois</p>
                      </Card>
                      <Card className="[&>div:last-child]:p-2 [&>div:last-child]:text-center">
                        <p className="text-xs text-muted-foreground">Accélération</p>
                        <p className="text-sm font-semibold">{formatNumber(profil.velocity_metrics.acceleration, 1)}</p>
                      </Card>
                      <Card className="[&>div:last-child]:p-2 [&>div:last-child]:text-center">
                        <p className="text-xs text-muted-foreground">Volatilité</p>
                        <p className="text-sm font-semibold">{formatNumber(profil.velocity_metrics.volatilite, 1)}%</p>
                      </Card>
                    </div>
                  )}
                </div>
              )}

              {/* ========== ONGLET AERORISQ ========== */}
              {activeTab === 'aerorisq' && (
                <div className="tab-content space-y-4">
                  <AerorisqAnalyse aerodromeId={planning.aerodrome_id} />

                  {/* Points d'attention */}
                  <div className="p-3 rounded-lg border border-border bg-role-primary-soft/30">
                    <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-warning" /> Points d'attention AERORISQ
                    </p>
                    <div className="space-y-2">
                      {/* Sous-domaines à risque */}
                      {decisionData && (
                        <>
                          {decisionData.profil.domainesFaibles.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-warning mb-1">Sous-domaines à risque</p>
                              <div className="flex flex-wrap gap-1.5">
                                {decisionData.profil.domainesFaibles.map(d => (
                                  <span key={d.code} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning border border-warning/20">
                                    {d.code}: {d.valeur}/100
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {decisionData.recommandations.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-role-primary mb-1">Recommandations</p>
                              <ul className="space-y-1">
                                {decisionData.recommandations.slice(0, 4).map((r, i) => (
                                  <li key={i} className="text-xs flex items-start gap-1.5">
                                    <span className={`inline-block px-1 py-0.5 rounded text-[8px] font-bold text-white ${
                                      r.urgence === 'immediate' ? 'bg-danger' : r.urgence === '3_mois' ? 'bg-warning' : 'bg-muted'
                                    }`}>{r.urgence}</span>
                                    {r.action}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {decisionData.conformite.pointsBloquants.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-danger mb-1">Points bloquants</p>
                              <ul className="space-y-0.5">
                                {decisionData.conformite.pointsBloquants.map((pb, i) => (
                                  <li key={i} className="text-xs text-danger flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> {pb}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}

                      {/* Écarts actifs */}
                      {ecartsActifs.length > 0 && (
                        <div className="border-t border-border pt-2 mt-2">
                          <p className="text-xs font-semibold mb-1">{ecartsActifs.length} ecart(s) actif(s) dont {nbEcartsCritiques} critique(s)</p>
                          <div className="space-y-1 max-h-36 overflow-y-auto">
                            {ecartsActifs.map(ec => (
                              <div key={ec.id} className="flex items-center justify-between text-xs gap-2 p-1 rounded hover:bg-white/30">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getRiskLevelBgVariant(ec.niveau_risque)}`} />
                                  <span className="truncate">{ec.ref_reglementaire || 'Ecart'}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className={`badge text-[8px] ${getRiskLevelClass(ec.niveau_risque)}`}>{ec.niveau_risque}</span>
                                  {ec.pac && <span className="badge text-[8px] success">PAC</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PAC en cours */}
                      {ecartsActifs.filter(e => e.pac).length > 0 && (
                        <div className="border-t border-border pt-2">
                          <p className="text-xs font-semibold text-success mb-1">Plans d'action corrective (PAC) en cours</p>
                          {ecartsActifs.filter(e => e.pac).slice(0, 3).map(ec => (
                            <div key={ec.id} className="text-xs mb-1 p-1.5 rounded bg-success/5">
                              <p className="font-medium">{ec.ref_reglementaire || ec.reference}</p>
                              {ec.pac?.actions && ec.pac.actions.length > 0 && (
                                <p className="text-muted-foreground ml-2">{ec.pac.actions.length} action(s) planifiee(s) - echeance: {ec.delai_pac ? new Date(ec.delai_pac).toLocaleDateString('fr-FR') : 'N/A'}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ========== ONGLET HISTORIQUE ========== */}
              {activeTab === 'historique' && (
                <div className="tab-content space-y-3">
                  {surveillancesPrecedentes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground"><Clock className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Aucune surveillance antérieure</p></div>
                  ) : (
                    surveillancesPrecedentes.map(s => {
                      const ecartsSurv = ecarts.filter(e => e.surveillance_id === s.id && e.statut !== 'cloture')
                      const aUnRapport = !!(s.rapport_sig_url || s.rapport_fichier_url)
                      const aChecklistSignee = !!(s.signatures_checklist?.length && s.signatures_checklist.length >= 1)
                      const statutIcon = s.statut === 'rapport_signe' ? <CheckCircle2 className="w-3 h-3 text-success" /> :
                        s.statut === 'checklist_signee' ? <CheckCircle2 className="w-3 h-3 text-warning" /> :
                        <Clock className="w-3 h-3 text-muted-foreground" />
                      return (
                        <Card key={s.id} className="[&>div:last-child]:p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium capitalize">{s.type?.replace(/_/g, ' ')}</p>
                                {statutIcon}
                              </div>
                              <p className="text-xs text-muted-foreground">{new Date(s.date_debut).toLocaleDateString('fr-FR')} → {new Date(s.date_fin).toLocaleDateString('fr-FR')}</p>
                              {s.portee && s.portee.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {s.portee.map(d => <span key={d} className="code-oaci-badge text-[9px]">{d}</span>)}
                                </div>
                              )}
                            </div>
                            <span className={`badge flex items-center gap-1 ${s.statut === 'rapport_signe' ? 'success' : 'warning'}`}>{s.statut.replace(/_/g, ' ')}</span>
                          </div>

                          {/* Boutons consultation rapports et checklists */}
                          {(aUnRapport || aChecklistSignee) && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {s.rapport_sig_url && (
                                <a href={s.rapport_sig_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-role-primary-soft text-role-primary hover:bg-role-primary-soft/80 transition-colors">
                                  <FileText className="w-3 h-3" /> Rapport signé
                                </a>
                              )}
                              {s.rapport_fichier_url && !s.rapport_sig_url && (
                                <a href={s.rapport_fichier_url} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-role-primary-soft text-role-primary hover:bg-role-primary-soft/80 transition-colors">
                                  <FileText className="w-3 h-3" /> Rapport
                                </a>
                              )}
                              {s.rapport_signe_par && (
                                <span className="text-[9px] text-muted-foreground">
                                  Signé par {utilisateurs.find(u => u.id === s.rapport_signe_par)?.prenom || ''} {utilisateurs.find(u => u.id === s.rapport_signe_par)?.nom || ''}
                                  {s.rapport_signe_le && ` le ${new Date(s.rapport_signe_le).toLocaleDateString('fr-FR')}`}
                                </span>
                              )}
                              {s.rapport_html && (
                                <button type="button" onClick={() => {
                                  const w = window.open('', '_blank')
                                  if (w) {
                                    w.document.write(s.rapport_html || '')
                                    w.document.close()
                                  }
                                }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-warning/10 text-warning hover:bg-warning/20 transition-colors">
                                  <FileText className="w-3 h-3" /> Aperçu rapport
                                </button>
                              )}
                            </div>
                          )}

                          {s.progression !== undefined && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs mb-1"><span>Progression</span><span>{s.progression}%</span></div>
                              <div className="progress h-1"><div className="progress-bar" style={{ width: `${s.progression}%` }} /></div>
                            </div>
                          )}

                          {/* Écarts restants */}
                          {ecartsSurv.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-border">
                              <p className="text-xs text-muted-foreground mb-1">{ecartsSurv.length} ecart(s) restant(s) de cette mission</p>
                              <div className="space-y-0.5">
                                {ecartsSurv.slice(0, 3).map(ec => (
                                  <div key={ec.id} className="flex items-center gap-1.5 text-xs">
                                    <span className={`w-1.5 h-1.5 rounded-full ${getRiskLevelBgVariant(ec.niveau_risque)}`} />
                                    <span className="truncate">{ec.libelle}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      )
                    })
                  )}
                  {nbEcartsCritiques > 0 && (
                    <div className="alert alert-warning">
                      <AlertTriangle className="alert-icon" />
                      <div className="alert-content"><div className="alert-title">Écarts non résolus</div><div className="alert-description">{nbEcartsCritiques} ecart(s) critique(s) actif(s) - suivi prioritaire requis</div></div>
                    </div>
                  )}
                </div>
              )}

              {/* ========== ONGLET CHECKLIST ========== */}
              {activeTab === 'checklist' && (
                <div className="tab-content space-y-3">
                  <div className={`alert ${checklistType === 'mixte' ? 'alert-warning' : isSgsPortee ? 'alert-info border-purple-300 bg-purple-50' : 'alert-info'}`}>
                    <div className="flex items-start gap-3">
                      {getTypeIcon()}
                      <div className="flex-1">
                        <div className="alert-title">Type recommandé</div>
                        <div className="alert-description">{getTypeLabel()}</div>
                        {isSgsPortee && (
                          <div className="text-xs mt-2 space-y-0.5">
                            <p>• 4 Piliers PAOE : Politique, Assurance, Opérations, Expertise</p>
                            <p>• 5 niveaux de maturité (OACI Annexe 19 / Doc 9859)</p>
                            <p>• Génération automatique du score de maturité SGS</p>
                          </div>
                        )}
                        {checklistType === 'mixte' && !isSgsPortee && (
                          <div className="text-xs mt-2">• Items de suivi des écarts<br />• Items de mise en œuvre PAC</div>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isSgsPortee && (
                    <Card title="Aperçu des items à vérifier">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Items standards (checklist RAS-14)</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex items-center gap-2"><span className="badge success text-xs">SA</span><span>Items satisfaisants (prédiction)</span></div>
                            <div className="flex items-center gap-2"><span className="badge danger text-xs">NS</span><span>Non-conformités identifiées</span></div>
                            <div className="flex items-center gap-2"><span className="badge warning text-xs">NV</span><span>Points à vérifier sur site</span></div>
                          </div>
                        </div>
                        {(checklistType === 'suivi' || checklistType === 'mixte') && (
                          <div className="border-t border-border pt-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Écarts actifs ({ecartsActifs.length})</p>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {ecartsActifs.map(ec => (
                                <div key={ec.id} className="flex items-center justify-between text-sm gap-2 p-1.5 rounded hover:bg-gray-50">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getRiskLevelBgVariant(ec.niveau_risque)}`} />
                                    <span className="truncate">{ec.ref_reglementaire || ec.reference} — {ec.libelle || 'Écart'}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span className={`badge text-[10px] ${getRiskLevelClass(ec.niveau_risque)}`}>{ec.niveau_risque}</span>
                                    <span className={`badge text-[10px] ${
                                      ec.statut === 'en_retard' ? 'danger' :
                                      ec.statut === 'pac_attendu' ? 'warning' : 'outline'
                                    }`}>{ec.statut}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(checklistType === 'pac' || checklistType === 'mixte') && (
                          <div className="border-t border-border pt-2">
                            <p className="text-xs font-semibold text-muted-foreground mb-2">Items de mise en œuvre PAC</p>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-sm"><span>• Vérification des actions PAC</span><span className="badge warning">4 items</span></div>
                              <div className="flex items-center justify-between text-sm"><span>• Évaluation efficacité des mesures</span><span className="badge warning">2 items</span></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                  <div className="flex justify-end">
                    {!isSgsPortee && (
                      <button className="btn btn-secondary btn-sm gap-1" onClick={handlePrefillChecklist}><Brain className="w-3 h-3" />Pré-remplir avec l'historique</button>
                    )}
                  </div>
                </div>
              )}

              {/* ========== ONGLET DÉLÉGATION ========== */}
              {activeTab === 'delegation' && (
                <div className="tab-content space-y-3">
                  <p className="text-sm text-muted-foreground">Attribuez chaque domaine à un inspecteur pour une répartition claire des tâches.</p>
                  {domainesList.map(({ code, label }) => (
                    <Card key={code} className="[&>div:last-child]:p-3">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-2">
                          <span className="badge primary">{code}</span>
                          <span className="text-xs text-muted-foreground">{label}</span>
                          {delegations[code] && (
                            <span className="badge success text-xs flex items-center gap-1"><CheckCircle2 className="w-2 h-2" />Assigné</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <select className="form-select text-sm py-3" value={delegations[code] || ''} onChange={(e) => setDelegations(prev => ({ ...prev, [code]: e.target.value }))}>
                            <option value="">Non assigné</option>
                            {inspecteursDisponibles.map(insp => (
                              <option key={insp.id} value={insp.id}>{insp.prenom} {insp.nom} (
                                {(insp.specialites || []).map((s: string) => SPECIALITES_INSPECTEUR.find(sp => sp.code === s)?.label || s).join(', ')
                                || ((insp as any)._insp ? `${(insp as any)._insp.type?.replace(/_/g, ' ')} · ${(insp as any)._insp.domaine_principal?.toUpperCase()}` : undefined)
                                || insp.service || 'Inspecteur'}
                              )</option>
                            ))}
                          </select>
                          {delegations[code] && (
                            <button onClick={() => setDelegations(prev => ({ ...prev, [code]: '' }))} className="btn btn-sm px-3 py-1 btn-danger"><X className="w-3 h-3" /></button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">La délégation est optionnelle. Si vous ne déléguez pas, tous les inspecteurs pourront voir l'ensemble des domaines.</p>
                  {Object.keys(delegations).filter(d => delegations[d]).length > 0 && (
                    <Card variant="level" levelColor="success" className="bg-success/5 [&>div:last-child]:p-3">
                      <p className="text-xs font-semibold text-success mb-2">Résumé des délégations</p>
                      <div className="space-y-1">
                        {Object.entries(delegations).filter(([_, id]) => id).map(([code, id]) => {
                          const inspecteur = inspecteursDisponibles.find(i => i.id === id)
                          return <div key={code} className="flex items-center justify-between text-xs"><span className="font-medium">{code} - {getDomaineLabel(code)}</span><span className="text-gray-600">→ {inspecteur?.prenom} {inspecteur?.nom}</span></div>
                        })}
                      </div>
                    </Card>
                  )}
                  <div className="flex justify-end">
                    <button className="btn btn-primary btn-sm gap-1" onClick={handleSaveDelegations}><Save className="w-3 h-3" />Enregistrer les délégations</button>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div className="modal-footer border-t border-border flex justify-end gap-3">
              <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
              <button className="btn btn-secondary gap-2" onClick={handleNotifyOperator} disabled={sendingChecklist} title="Envoyer la checklist aux exploitants">
                {sendingChecklist ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sendingChecklist ? 'Envoi...' : 'Envoyer la checklist'}
              </button>
              <button className="btn btn-primary gap-2" onClick={handleOpenChecklist}>
                <PlayCircle className="w-4 h-4" />
                {isSgsPortee ? 'Ouvrir l\'évaluation SGS (PAOE)'
                  : planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0 ? 'Modifier la checklist' : 'Ouvrir la checklist pré-remplie'}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Modale choix type checklist */}
      {showTypeChoice && (
        <div className="modal-overlay" data-role={userRole} onClick={() => setShowTypeChoice(false)}>
          <div className="modal-content max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">
              <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent p-5">
                <div className="modal-title flex items-center gap-2"><ClipboardList className="w-5 h-5 text-role-primary" />Choisir le type de checklist</div>
                <button className="modal-close" onClick={() => setShowTypeChoice(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="modal-body py-5 px-5 space-y-4">
                <p className="text-sm text-muted-foreground">Plusieurs types de checklist sont disponibles pour cette surveillance. Sélectionnez celui à ouvrir :</p>
                {(() => {
                  const p = planning.portee || []
                  const isSgsOnly = p.length === 1 && p[0] === 'SGS'
                  const hasSGS = p.includes('SGS')
                  const ecartsA = ecartsActifs
                  const opts: { type: string; label: string; desc: string; icon: React.ElementType }[] = []
                  if (!isSgsOnly) opts.push({ type: 'standard', label: 'Checklist Standard', desc: 'Items standards RAS-14', icon: ClipboardList })
                  if (hasSGS) opts.push({ type: 'sgs', label: 'Évaluation SGS', desc: 'Maturité PAOE (Annexe 19 OACI)', icon: Shield })
                  if (ecartsA.length > 0) opts.push({ type: 'suivi', label: 'Suivi des écarts', desc: `${ecartsA.length} écart(s) actif(s)`, icon: AlertTriangle })
                  if (ecartsA.some((e: Ecart) => e.pac)) opts.push({ type: 'pac', label: 'Mise en œuvre PAC', desc: 'Plans d\'action corrective', icon: CheckCircle2 })
                  return opts
                })().map(opt => (
                  <button key={opt.type} type="button" className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-role-primary-soft/30 transition-all text-left" onClick={() => {
                    setShowTypeChoice(false)
                    onClose()
                    if (opt.type === 'sgs') {
                      router.push(`/preparation-checklist/${planning?.id}?type=sgs`)
                    } else {
                      router.push(`/preparation-checklist/${planning?.id}?type=${opt.type}`)
                    }
                  }}>
                    <div className="w-10 h-10 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><opt.icon className="w-5 h-5 text-role-primary" /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-foreground">{opt.label}</p><p className="text-xs text-muted-foreground">{opt.desc}</p></div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  )
}
