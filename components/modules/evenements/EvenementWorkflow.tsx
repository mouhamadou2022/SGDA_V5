// components/modules/evenements/EvenementWorkflow.tsx
'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAppStore, type EvenementSecurite } from '@/lib/store'
import { riskAgent } from '@/lib/ia/agents/riskAgent'
import { Card } from '@/components/ui/card'
import { X, CheckCircle2, AlertTriangle, FileText, User, Calendar, MapPin, Clock, ChevronDown, ChevronRight, AlertCircle, Sparkles, Loader2, Send, RotateCcw, MessageSquare } from 'lucide-react'

interface EvenementWorkflowProps {
  evenementId: string
  userRole: string
  onClose: () => void
}

const FALLBACK_EVT = {
  id: 'evt-demo',
  reference: 'EVT-2024-001',
  type: 'Incursion sur piste',
  gravite: 'ORANGE' as const,
  date: '2024-04-20',
  heure: '14:35',
  localisation: 'Piste 01/19 — Aérodrome GOBD',
  description: 'Sortie de piste d\'un aéronef léger lors d\'un atterrissage par vent traversier.',
  statut: 'recu' as const,
  aerodrome_id: 'GOBD',
}

const getBadgeGravite = (gravite: string) => {
  const styles: Record<string, string> = {
    'CRITIQUE': 'badge danger pulse', 'ORANGE': 'badge warning', 'JAUNE': 'badge warning', 'GRIS': 'badge neutral', 'BLEU': 'badge primary',
  }
  return styles[gravite] || 'badge neutral'
}

const getLabelGravite = (gravite: string) => {
  const labels: Record<string, string> = { 'CRITIQUE': 'Critique', 'ORANGE': 'Élevé', 'JAUNE': 'Moyen', 'BLEU': 'Faible', 'GRIS': 'Faible' }
  return labels[gravite] || gravite
}

const ETAPES = ['Réception', 'Analyse', 'Investigation / Impact', 'Écart', 'Rapport', 'Validation']

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }

function EvenementWorkflow({ evenementId, userRole, onClose }: EvenementWorkflowProps) {
  const evenements = useAppStore((s) => s.evenements)
  const updateEvenement = useAppStore((s) => s.updateEvenement)
  const assignerInspecteur = useAppStore((s) => s.assignerInspecteur)
  const accepterAssignation = useAppStore((s) => s.accepterAssignation)
  const refuserAssignation = useAppStore((s) => s.refuserAssignation)
  const soumettreValidation = useAppStore((s) => s.soumettreValidation)
  const validerCloture = useAppStore((s) => s.validerCloture)
  const retournerInspecteur = useAppStore((s) => s.retournerInspecteur)
  const demanderComplement = useAppStore((s) => s.demanderComplement)
  const repondreComplement = useAppStore((s) => s.repondreComplement)
  const relancerOperateur = useAppStore((s) => s.relancerOperateur)
  const creerEcartLie = useAppStore((s) => s.creerEcartLie)
  const getProfilRisque = useAppStore((s) => s.getProfilRisque)
  const addNotification = useAppStore((s) => s.addNotification)
  const addRegistreEntry = useAppStore((s) => s.addRegistreEntry)
  const user = useAppStore((s) => s.user)
  const utilisateurs = useAppStore((s) => s.utilisateurs)
  const evt = (evenements?.find((e) => e.id === evenementId) ?? FALLBACK_EVT) as EvenementSecurite
  const profilAerodrome = getProfilRisque(evt.aerodrome_id || '')

  const listeInspecteurs = utilisateurs
    .filter(u => ['inspector', 'admin'].includes(u.role) && u.statut !== 'inactif')
    .map(u => ({ id: u.id, nom: `${u.prenom} ${u.nom}` }))

  const isAdmin = userRole === 'admin'
  const isInspector = userRole === 'inspector'
  const isOperator = !isAdmin && !isInspector
  const isMonEvenement = evt.inspecteur_id === user?.id
  const peutEditer = (isInspector && isMonEvenement && evt.statut !== 'cloture' && evt.statut !== 'soumis_validation') ||
                     (isAdmin && evt.statut === 'recu' && !evt.inspecteur_id)

  const [etape, setEtape] = useState(0)
  const [inspecteurId, setInspecteurId] = useState(evt.inspecteur_id || '')
  const [analysePreliminaire, setAnalysePreliminaire] = useState(evt.analyse_preliminaire || '')
  const [recommandations, setRecommandations] = useState(evt.recommandations || '')
  const [classification, setClassification] = useState<'accident' | 'incident' | 'incident_grave'>((evt as any).classification || 'incident')
  const [impactSecurite, setImpactSecurite] = useState<'moyen' | 'faible'>((evt as any).impact_securite || 'moyen')
  const [ecartCreated, setEcartCreated] = useState(!!evt.ecart_ids?.length)
  const [ecartLibelle, setEcartLibelle] = useState('')
  const [aucunEcart, setAucunEcart] = useState(false)
  const [rapportInvestigation, setRapportInvestigation] = useState(evt.rapport_investigation || '')
  const [causes, setCauses] = useState<string[]>(evt.causes || [])
  const [nouvelCause, setNouvelCause] = useState('')
  const [facteursContributifs, setFacteursContributifs] = useState(evt.facteurs_contributifs || { humain: false, technique: false, environnemental: false, organisationnel: false })
  const [rapportFinal, setRapportFinal] = useState(evt.rapport_final_contenu || '')
  const [expandedSteps, setExpandedSteps] = useState<string[]>([])
  const [iaLoading, setIaLoading] = useState(false)
  const [iaSuggestion, setIaSuggestion] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [motifRefus, setMotifRefus] = useState('')
  const [showRefusForm, setShowRefusForm] = useState(false)
  const [demandeComplement, setDemandeComplement] = useState('')
  const [reponseOperateur, setReponseOperateur] = useState('')
  const [commentaireRetour, setCommentaireRetour] = useState('')

  // Déterminer l'étape active selon le statut
  useEffect(() => {
    if (isAdmin && (evt.statut === 'cloture' || evt.statut === 'soumis_validation')) {
      setEtape(5)
    } else if (isInspector && isMonEvenement) {
      if (evt.statut === 'recu' || evt.statut === 'assigne') setEtape(0)
      else if (evt.statut === 'accepte' || evt.statut === 'attente_operateur') setEtape(1)
      else if (evt.statut === 'en_cours' || evt.statut === 'analyse') setEtape(2)
      else if (evt.statut === 'ecart_cree') setEtape(3)
      else if (evt.statut === 'rapport_redige') setEtape(4)
      else if (evt.statut === 'soumis_validation' || evt.statut === 'cloture') setEtape(5)
      else if (evt.statut === 'retourne') setEtape(Math.max(1, etape))
    } else if (isOperator && evt.statut === 'attente_operateur') {
      setEtape(1)
    } else if (isInspector && !isMonEvenement && evt.statut === 'assigne') {
      setEtape(0)
    }
  }, [evt.statut, isAdmin, isInspector, isMonEvenement, isOperator])

  const inspecteurNom = evt.inspecteur_id
    ? utilisateurs.find(u => u.id === evt.inspecteur_id)
    : null

  const isAccidentGrave = classification === 'accident' || classification === 'incident_grave'

  const handleRefresh = useCallback(() => {
    useAppStore.getState().setEvenements([...useAppStore.getState().evenements])
  }, [])

  const handleAssigner = useCallback(async () => {
    if (!inspecteurId) return
    await assignerInspecteur(evenementId, inspecteurId)
    addNotification({
      user_id: user?.id || '',
      type: 'success',
      title: 'Événement assigné',
      message: `Assigné à ${listeInspecteurs.find(i => i.id === inspecteurId)?.nom || ''}`,
      canal: 'in_app',
    })
  }, [inspecteurId, evenementId, assignerInspecteur, addNotification, user?.id, listeInspecteurs])

  const handleAccepter = useCallback(async () => {
    setIsLoading(true)
    await accepterAssignation(evenementId)
    setIsLoading(false)
  }, [evenementId, accepterAssignation])

  const handleRefuser = useCallback(async () => {
    if (!motifRefus.trim()) return
    setIsLoading(true)
    await refuserAssignation(evenementId, motifRefus)
    setIsLoading(false)
    setShowRefusForm(false)
    onClose()
  }, [evenementId, motifRefus, refuserAssignation, onClose])

  const handleDemanderComplement = useCallback(async () => {
    if (!demandeComplement.trim()) return
    setIsLoading(true)
    await demanderComplement(evenementId, demandeComplement)
    setIsLoading(false)
    setDemandeComplement('')
  }, [evenementId, demandeComplement, demanderComplement])

  const handleRepondreComplement = useCallback(async () => {
    if (!reponseOperateur.trim()) return
    setIsLoading(true)
    await repondreComplement(evenementId, reponseOperateur)
    setIsLoading(false)
    setReponseOperateur('')
  }, [evenementId, reponseOperateur, repondreComplement])

  const handleSoumettreValidation = useCallback(async () => {
    setIsLoading(true)
    await persisterDonnees()
    await soumettreValidation(evenementId)
    setIsLoading(false)
  }, [evenementId, soumettreValidation])

  const handleValiderCloture = useCallback(async () => {
    setIsLoading(true)
    await persisterDonnees()
    await validerCloture(evenementId)
    await archiverRegistre()
    setIsLoading(false)
  }, [evenementId, validerCloture])

  const handleRetourner = useCallback(async () => {
    if (!commentaireRetour.trim()) return
    setIsLoading(true)
    await retournerInspecteur(evenementId, commentaireRetour)
    setIsLoading(false)
  }, [evenementId, commentaireRetour, retournerInspecteur])

  const archiverRegistre = useCallback(async () => {
    if (evt.id === FALLBACK_EVT.id) return
    const aerodrome = useAppStore.getState().aerodromes.find(a => a.id === evt.aerodrome_id)
    const fichiers: { nom: string; url: string }[] = []
    if (rapportFinal) {
      const blob = new Blob([rapportFinal], { type: 'text/plain;charset=utf-8' })
      fichiers.push({ nom: `rapport_${evt.reference}.txt`, url: URL.createObjectURL(blob) })
    }
    if (rapportInvestigation) {
      const blob = new Blob([rapportInvestigation], { type: 'text/plain;charset=utf-8' })
      fichiers.push({ nom: `investigation_${evt.reference}.txt`, url: URL.createObjectURL(blob) })
    }
    addRegistreEntry({
      id: crypto.randomUUID(),
      type: 'evenement',
      reference: evt.reference,
      titre: `${evt.type} — ${classification === 'incident_grave' ? 'incident grave' : classification}`,
      description: analysePreliminaire || evt.description,
      date_entree: new Date().toISOString(),
      aerodrome_id: evt.aerodrome_id,
      fichiers,
      timeline: [],
      statut: 'valide',
      auto_generated: true,
      source_id: evt.id,
      source_type: 'evenement',
      created_at: new Date().toISOString(),
      created_by: user?.id || '',
    })
  }, [evt, classification, analysePreliminaire, rapportFinal, rapportInvestigation, addRegistreEntry, user?.id])

  const persisterDonnees = useCallback(async () => {
    if (evt.id === FALLBACK_EVT.id) return
    await updateEvenement(evt.id, {
      classification: classification as any,
      analyse_preliminaire: analysePreliminaire,
      recommandations,
      causes,
      facteurs_contributifs: facteursContributifs,
      rapport_investigation: rapportInvestigation,
      rapport_final_contenu: rapportFinal,
      impact_securite: impactSecurite,
    })
  }, [evt.id, updateEvenement, classification, analysePreliminaire, recommandations, causes, facteursContributifs, rapportInvestigation, rapportFinal, impactSecurite])

  const handleNext = useCallback(async () => {
    await persisterDonnees()
    const nextEtape = etape + 1
    if (!isAccidentGrave && etape === 1) { setEtape(5); return }
    let nouveauStatut: EvenementSecurite['statut'] | undefined
    if (etape === 1) nouveauStatut = 'analyse'
    else if (etape === 2 && isAccidentGrave) nouveauStatut = 'en_cours'
    else if (etape === 3 && isAccidentGrave) nouveauStatut = 'ecart_cree'
    else if (etape === 4 && isAccidentGrave) nouveauStatut = 'rapport_redige'
    if (evt.id !== FALLBACK_EVT.id && nouveauStatut) {
      try { await updateEvenement(evt.id, { statut: nouveauStatut }) }
      catch (err) { console.error('[Workflow] Échec maj statut:', err); return }
    }
    setEtape(nextEtape)
  }, [etape, persisterDonnees, isAccidentGrave, evt.id, updateEvenement])

  // IA suggestion
  useEffect(() => {
    if (profilAerodrome && etape === 0 && !iaSuggestion) {
      setIaLoading(true)
      riskAgent.analyzeRisk({ aerodromeId: evt.aerodrome_id || '', includeSuggestions: true, includePredictions: false, includeBlackSwan: false })
        .then(analysis => {
          if (analysis?.suggestions?.[0]) setIaSuggestion(analysis.suggestions[0].description)
        })
        .catch(() => {})
        .finally(() => setIaLoading(false))
    }
  }, [profilAerodrome, etape, evt.aerodrome_id, iaSuggestion])

  const handleAddCause = () => {
    if (nouvelCause.trim()) { setCauses((prev) => [...prev, nouvelCause.trim()]); setNouvelCause('') }
  }

  const handleRemoveCause = (idx: number) => setCauses((prev) => prev.filter((_, i) => i !== idx))

  const toggleStep = (step: string) => {
    setExpandedSteps((prev) => prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step])
  }

  const [iaCausesLoading, setIaCausesLoading] = useState(false)

  const handleIaCauses = async () => {
    if (!evt.description) return
    setIaCausesLoading(true)
    try {
      const res = await fetch('/api/ai/evenement-causes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: evt.description,
          analyse_preliminaire: analysePreliminaire,
          type: evt.type,
          gravite: evt.gravite,
        }),
      })
      const data = await res.json()
      if (data?.causes?.length) setCauses(data.causes)
      if (data?.facteurs_contributifs) setFacteursContributifs(data.facteurs_contributifs)
    } catch (err) {
      console.error('Erreur suggestion causes IA:', err)
    } finally {
      setIaCausesLoading(false)
    }
  }

  const handleCreerEcart = () => {
    creerEcartLie(evt.id, {
      aerodrome_id: evt.aerodrome_id || '',
      libelle: ecartLibelle.trim() || evt.description,
      niveau_risque: evt.gravite === 'CRITIQUE' ? 'critique' : evt.gravite === 'ORANGE' ? 'eleve' : 'moyen',
      ref_reglementaire: `Événement ${evt.reference}`,
      inspecteur_ref_id: user?.id || inspecteurId,
    })
    setEcartCreated(true)
  }

  const statutLabel = (s: string) => {
    const labels: Record<string, string> = {
      recu: 'Reçu', assigne: 'Assigné', accepte: 'Accepté', refuse: 'Refusé',
      attente_operateur: 'Attente exploitant', en_cours: 'En cours',
      analyse: 'Analyse', ecart_cree: 'Écarts créés',
      rapport_redige: 'Rapport rédigé', soumis_validation: 'Soumis validation',
      retourne: 'Retourné', cloture: 'Clôturé'
    }
    return labels[s] || s
  }

  const nomEtape = (idx: number) => {
    const base = ETAPES[idx]
    if (idx === 2) return isAccidentGrave ? 'Investigation' : 'Analyse impact'
    if (idx === 3) return isAccidentGrave ? 'Écart lié' : 'Recommandations'
    if (idx === 4) return isAccidentGrave ? 'Rapport final' : 'Finaliser'
    return base
  }

  const renderStepper = () => {
    const affichees = ETAPES.map((label, idx) => {
      if (isAdmin && idx >= 1 && idx <= 4 && evt.statut !== 'soumis_validation' && evt.statut !== 'cloture' && evt.statut !== 'retourne') return null
      if (isOperator && idx !== 1) return null
      if (isInspector && idx === 0 && isMonEvenement && evt.statut !== 'assigne' && evt.statut !== 'recu') return null
      return idx
    }).filter(i => i !== null) as number[]

    return (
      <div className="px-6 pt-4 pb-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {affichees.map((idx, ai) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${idx === etape ? 'bg-role-gradient text-white shadow-role-glow scale-105' : idx < etape ? 'bg-success text-white' : 'bg-background text-foreground/70 border border-border'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${idx === etape ? 'bg-white/25 text-white' : idx < etape ? 'bg-white/30 text-white' : 'bg-muted-foreground/30 text-foreground/60'}`}>{idx < etape ? '✓' : ai + 1}</span>
                {nomEtape(idx)}
              </span>
              {ai < affichees.length - 1 && <div className={`h-0.5 w-5 rounded-full ${idx < etape || affichees[ai + 1] <= etape ? 'bg-success' : 'bg-border'}`} />}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background rounded-2xl overflow-hidden shadow-2xl border border-border border-t-4 border-t-role-primary" data-role={userRole}>
      <div className="modal-header border-b border-border bg-role-primary-soft">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-role-gradient flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="modal-title text-base">Workflow événement</div>
            <div className="text-xs text-muted-foreground">{evt.reference} — {evt.type}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge">{statutLabel(evt.statut)}</span>
          {(isAdmin || isInspector) && (
            <button className="btn btn-sm btn-ghost" onClick={handleRefresh} title="Rafraîchir">
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          {evt.statut === 'attente_operateur' && (
            <span className="badge warning animate-pulse text-xs">En attente exploitant</span>
          )}
          <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
      </div>

      {renderStepper()}

      <div className="modal-body space-y-4">

        {/* ────── ADMIN ÉTAPE 0 : Assignation ────── */}
        {etape === 0 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Réception & Qualification</h3>
            <div className="grid grid-cols-2 gap-4">
              <Card variant="role" size="sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">RÉFÉRENCE</p><p className="code-oaci-badge mt-1">{evt.reference}</p></div>
                </div>
              </Card>
              <Card variant="role" size="sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><Calendar className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">DATE / HEURE</p><p className="font-medium mt-1">{evt.date} à {evt.heure}</p></div>
                </div>
              </Card>
              <Card variant="role" size="sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><AlertTriangle className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">TYPE</p><p className="font-medium mt-1">{evt.type}</p></div>
                </div>
              </Card>
              <Card variant="role" size="sm">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><AlertCircle className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">GRAVITÉ</p><div className="mt-1"><span className={getBadgeGravite(evt.gravite)}>{getLabelGravite(evt.gravite)}</span></div></div>
                </div>
              </Card>
              <Card variant="role" size="sm" className="col-span-2">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">LOCALISATION</p><p className="font-medium mt-1">{evt.localisation}</p></div>
                </div>
              </Card>
              <Card variant="role" size="sm" className="col-span-2">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">DESCRIPTION</p><p className="text-small mt-1">{evt.description}</p></div>
                </div>
              </Card>
            </div>

            {profilAerodrome && (
              <Card variant="role" size="sm" className="bg-gradient-to-r from-role-primary/5 to-transparent">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><Sparkles className="w-4 h-4 text-role-primary" /></div>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-role-primary uppercase">Profil de risque — {evt.aerodrome_id}</p>
                    <div className="flex gap-4 mt-2 text-small">
                      <span>Score global: <strong>{profilAerodrome.score_global}</strong>/100</span>
                      <span>C5 (Résilience): <strong>{profilAerodrome.c5}</strong>/100</span>
                    </div>
                    {iaLoading && <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Analyse IA…</div>}
                    {iaSuggestion && <p className="text-xs text-muted-foreground mt-2">💡 {iaSuggestion}</p>}
                  </div>
                </div>
              </Card>
            )}

            {/* ADMIN : Assignation */}
            {isAdmin && !evt.inspecteur_id && (
              <Card variant="role" size="sm" className="space-y-3 bg-role-primary-soft">
                <p className="font-semibold text-role-primary text-sm flex items-center gap-2"><User className="w-4 h-4" />Assigner un inspecteur</p>
                <div className="flex gap-2">
                  <select className={`w-full py-3 pl-4 pr-10 rounded-xl border-2 border-role-primary/40 bg-background text-foreground font-medium appearance-none ${focusClass}`} style={selectStyle} value={inspecteurId} onChange={(e) => setInspecteurId(e.target.value)}>
                    <option value="">Sélectionner un inspecteur…</option>
                    {listeInspecteurs.map((ins) => (<option key={ins.id} value={ins.id}>{ins.nom}</option>))}
                  </select>
                  <button className="btn btn-primary px-5" disabled={!inspecteurId} onClick={handleAssigner}>Assigner</button>
                </div>
              </Card>
            )}

            {/* ADMIN : Inspecteur déjà assigné */}
            {isAdmin && evt.inspecteur_id && (
              <Card variant="level" levelColor="warning" size="sm" className="bg-warning-soft/20">
                <p className="font-medium flex items-center gap-2"><User className="w-4 h-4 text-warning" />Assigné à <strong>{inspecteurNom?.prenom} {inspecteurNom?.nom}</strong></p>
                <p className="text-xs text-muted-foreground mt-1">Statut : {statutLabel(evt.statut)}</p>
                {evt.date_assignation && <p className="text-xs text-muted-foreground">Le {new Date(evt.date_assignation).toLocaleString('fr-FR')}</p>}
              </Card>
            )}

            {/* ADMIN : Timeline de suivi temps réel */}
            {isAdmin && evt.inspecteur_id && (
              <Card size="sm" className="space-y-2">
                <p className="text-xs font-semibold text-role-primary uppercase flex items-center gap-1"><Clock className="w-3 h-3" />Suivi en temps réel</p>
                <div className="space-y-1.5">
                  {evt.date_assignation && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">{new Date(evt.date_assignation).toLocaleString('fr-FR')}</span>
                      <span className="text-foreground">Assigné à {inspecteurNom?.prenom} {inspecteurNom?.nom}</span>
                    </div>
                  )}
                  {evt.date_acceptation && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">{new Date(evt.date_acceptation).toLocaleString('fr-FR')}</span>
                      <span className="text-success font-medium">Accepté par l'inspecteur</span>
                    </div>
                  )}
                  {(evt.statut === 'analyse' || evt.statut === 'en_cours' || evt.statut === 'ecart_cree' || evt.statut === 'rapport_redige') && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">En cours</span>
                      <span className="text-role-primary font-medium">Analyse en cours ({statutLabel(evt.statut)})</span>
                    </div>
                  )}
                  {evt.statut === 'attente_operateur' && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">En attente</span>
                      <span className="text-warning font-medium">Demande de complément envoyée à l'exploitant</span>
                    </div>
                  )}
                  {evt.reponse_operateur && evt.date_reponse_operateur && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">{new Date(evt.date_reponse_operateur).toLocaleString('fr-FR')}</span>
                      <span className="text-success font-medium">Réponse exploitant reçue</span>
                    </div>
                  )}
                  {evt.statut === 'soumis_validation' && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">Soumis</span>
                      <span className="text-primary font-medium">Soumis pour validation</span>
                    </div>
                  )}
                  {evt.statut === 'cloture' && evt.date_cloture && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-muted-foreground w-32 shrink-0">{new Date(evt.date_cloture).toLocaleString('fr-FR')}</span>
                      <span className="text-success font-medium">Clôturé</span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* INSPECTEUR : Accepter/Refuser */}
            {isInspector && !isMonEvenement && evt.statut === 'assigne' && (
              <Card variant="level" levelColor="primary" size="sm" className="bg-role-primary-soft">
                <p className="font-semibold text-role-primary text-sm mb-3 flex items-center gap-2"><User className="w-4 h-4" />Un événement vous est assigné</p>
                {!showRefusForm ? (
                  <div className="flex gap-3">
                    <button className="btn btn-success gap-2" onClick={handleAccepter} disabled={isLoading}>
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Accepter
                    </button>
                    <button className="btn btn-danger gap-2" onClick={() => setShowRefusForm(true)} disabled={isLoading}>
                      <X className="w-4 h-4" />Refuser
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <textarea className={`form-textarea w-full bg-background text-foreground py-2 px-3 rounded-xl text-sm ${focusClass}`} placeholder="Motif du refus…" value={motifRefus} onChange={(e) => setMotifRefus(e.target.value)} rows={3} />
                    <div className="flex gap-2">
                      <button className="btn btn-danger gap-2" onClick={handleRefuser} disabled={isLoading || !motifRefus.trim()}>
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}Confirmer le refus
                      </button>
                      <button className="btn btn-secondary" onClick={() => setShowRefusForm(false)}>Annuler</button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* INSPECTEUR : Assigné à moi */}
            {isInspector && isMonEvenement && (
              <Card variant="level" levelColor="success" size="sm" className="bg-success/5">
                <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" />Événement assigné à vous</p>
                <p className="text-xs text-muted-foreground mt-1">Cliquez sur Suivant pour commencer l'analyse.</p>
              </Card>
            )}

            {evt.date_assignation && (
              <div className="text-xs text-muted-foreground">Assigné le {new Date(evt.date_assignation).toLocaleString('fr-FR')}</div>
            )}

            {evt.motif_refus && (
              <Card variant="level" levelColor="danger" size="sm" className="bg-danger/5">
                <p className="font-medium text-danger text-xs">Motif du refus précédent :</p>
                <p className="text-sm mt-1">{evt.motif_refus}</p>
              </Card>
            )}
          </div>
        )}

        {/* ────── ÉTAPE 1 : Analyse (Inspecteur) ────── */}
        {etape === 1 && isInspector && isMonEvenement && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Analyse préliminaire</h3>
            {evt.statut === 'attente_operateur' && (
              <Card variant="level" levelColor="warning" size="sm" className="bg-warning-soft/20">
                <p className="font-medium text-warning flex items-center gap-2"><Clock className="w-4 h-4" />En attente de réponse de l'exploitant</p>
                <p className="text-xs text-muted-foreground mt-1">Votre demande : {evt.demande_complement}</p>
                <button className="btn btn-sm btn-warning gap-1 mt-2" onClick={() => relancerOperateur(evenementId)} disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}Rappeler l'exploitant
                </button>
              </Card>
            )}
            {evt.reponse_operateur && (
              <Card variant="level" levelColor="success" size="sm" className="bg-success/5">
                <p className="font-medium text-success flex items-center gap-2"><MessageSquare className="w-4 h-4" />Réponse de l'exploitant</p>
                <p className="text-sm mt-1">{evt.reponse_operateur}</p>
                {evt.date_reponse_operateur && <p className="text-xs text-muted-foreground mt-1">Reçu le {new Date(evt.date_reponse_operateur).toLocaleString('fr-FR')}</p>}
              </Card>
            )}
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Analyse <span className="text-danger">*</span></label>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Analyse préliminaire de l'événement…" value={analysePreliminaire} onChange={(e) => setAnalysePreliminaire(e.target.value)} rows={4} />
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Classification <span className="text-danger">*</span></label>
              <div className="space-y-2 mt-1">
                {(['accident', 'incident', 'incident_grave'] as const).map((c) => (
                  <label key={c} className="form-radio cursor-pointer">
                    <input type="radio" name="classification" value={c} checked={classification === c} onChange={() => setClassification(c)} />
                    <span className="text-small capitalize">{c === 'incident_grave' ? 'incident grave' : c}</span>
                  </label>
                ))}
              </div>
            </div>
            {isAccidentGrave && (
              <Card variant="level" levelColor="danger" size="sm" className="bg-danger/5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                  <p className="text-sm font-medium text-danger">Investigation, écarts et rapport final obligatoires</p>
                </div>
              </Card>
            )}

            {/* Demande de compléments à l'exploitant */}
            <Card variant="level" levelColor="primary" size="sm" className="bg-role-primary-soft space-y-3">
              <p className="text-xs font-semibold text-role-primary uppercase flex items-center gap-2"><MessageSquare className="w-4 h-4" />Demander un complément d'information à l'exploitant</p>
              {evt.statut !== 'attente_operateur' ? (
                <div className="flex gap-2">
                  <input type="text" className={`flex-1 py-2 px-3 rounded-xl border border-border bg-background text-foreground text-sm ${focusClass}`} placeholder="Votre question…" value={demandeComplement} onChange={(e) => setDemandeComplement(e.target.value)} />
                  <button className="btn btn-primary" disabled={!demandeComplement.trim() || isLoading} onClick={handleDemanderComplement}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Envoyer
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Question envoyée. En attente de réponse.</p>
                </div>
              )}
            </Card>

            {/* Recommandations */}
            {classification === 'incident' && (
              <>
                <div className="form-field">
                  <label className="text-role-primary text-xs uppercase font-semibold">Impact sur la sécurité</label>
                  <div className="flex gap-4 mt-1">
                    {(['moyen', 'faible'] as const).map((imp) => (
                      <label key={imp} className="form-radio cursor-pointer">
                        <input type="radio" name="impact" value={imp} checked={impactSecurite === imp} onChange={() => setImpactSecurite(imp)} />
                        <span className="text-small capitalize">{imp}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-field">
                  <label className="text-role-primary text-xs uppercase font-semibold">Recommandations</label>
                  <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Recommandations à transmettre à l'exploitant…" value={recommandations} onChange={(e) => setRecommandations(e.target.value)} rows={4} />
                </div>
              </>
            )}
          </div>
        )}

        {/* ────── ÉTAPE 1 : Exploitant répond ────── */}
        {etape === 1 && isOperator && evt.statut === 'attente_operateur' && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Information complémentaire requise</h3>
            <Card variant="level" levelColor="warning" size="sm">
              <p className="text-sm font-medium">Question de l'inspecteur :</p>
              <p className="mt-2 text-small">{evt.demande_complement}</p>
            </Card>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Votre réponse</label>
              <textarea className={`form-textarea w-full bg-background text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Réponse à l'inspecteur…" value={reponseOperateur} onChange={(e) => setReponseOperateur(e.target.value)} rows={4} />
            </div>
            <button className="btn btn-primary gap-2" disabled={!reponseOperateur.trim() || isLoading} onClick={handleRepondreComplement}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Envoyer la réponse
            </button>
          </div>
        )}

        {/* ────── ÉTAPE 1 : Admin voir analyse ────── */}
        {etape === 1 && isAdmin && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Analyse en cours</h3>
            <Card variant="role" size="sm">
              <p className="text-xs font-medium text-muted-foreground uppercase">Analyse préliminaire</p>
              <p className="mt-1 text-small">{evt.analyse_preliminaire || 'En attente…'}</p>
            </Card>
            {evt.classification && (
              <Card variant="role" size="sm">
                <p className="text-xs font-medium text-muted-foreground uppercase">Classification</p>
                <p className="mt-1 text-small capitalize">{evt.classification === 'incident_grave' ? 'incident grave' : evt.classification}</p>
              </Card>
            )}
            {evt.demande_complement && (
              <Card variant="role" size="sm">
                <p className="text-xs font-medium text-muted-foreground uppercase">Demande de complément envoyée</p>
                <p className="mt-1 text-small">{evt.demande_complement}</p>
                {evt.reponse_operateur && (
                  <><p className="text-xs font-medium text-muted-foreground uppercase mt-2">Réponse exploitant</p><p className="mt-1 text-small">{evt.reponse_operateur}</p></>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ────── ÉTAPE 2 : Investigation ────── */}
        {etape === 2 && isAccidentGrave && isInspector && isMonEvenement && (
          <div className="space-y-4 animate-fade-in">{/* …investigation content same as before… */}
            <h3 className="heading-4 text-role-primary">Investigation</h3>
            <div className="form-field">
              <div className="flex items-center justify-between">
                <label className="text-role-primary text-xs uppercase font-semibold">Rapport d'investigation <span className="text-danger">*</span></label>
              </div>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Conclusions de l'investigation…" value={rapportInvestigation} onChange={(e) => setRapportInvestigation(e.target.value)} rows={4} />
            </div>
            <div className="form-field">
              <div className="flex items-center justify-between">
                <label className="text-role-primary text-xs uppercase font-semibold">Causes profondes</label>
                <button type="button" onClick={handleIaCauses} disabled={iaCausesLoading || !analysePreliminaire} className="btn btn-sm btn-ghost gap-1 text-xs">
                  {iaCausesLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {iaCausesLoading ? 'Analyse...' : 'Suggérer causes IA'}
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <input type="text" placeholder="Ajouter une cause…" value={nouvelCause} onChange={(e) => setNouvelCause(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddCause()} className={`flex-1 py-3 px-4 rounded-xl border border-border bg-background text-foreground ${focusClass}`} />
                <button className="btn btn-secondary" onClick={handleAddCause}>Ajouter</button>
              </div>
              {causes.map((c, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-xl border border-border p-3 mt-2 bg-gradient-to-r from-background to-role-primary/5">
                  <span className="flex-1 text-small">{c}</span>
                  <button className="action-button text-danger" onClick={() => handleRemoveCause(idx)}><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Facteurs contributifs</label>
              <div className="space-y-2 mt-1">{(['humain', 'technique', 'environnemental', 'organisationnel'] as const).map((f) => (
                <label key={f} className="form-checkbox cursor-pointer"><input type="checkbox" checked={facteursContributifs[f]} onChange={(e) => setFacteursContributifs((prev: typeof facteursContributifs) => ({ ...prev, [f]: e.target.checked }))} /><span className="text-small capitalize">{f}</span></label>
              ))}</div>
            </div>
          </div>
        )}
        {etape === 2 && isInspector && isMonEvenement && !isAccidentGrave && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Recommandations à l'exploitant</h3>
            <Card variant="level" levelColor="success" size="sm" className="bg-success/5">
              <p className="text-small">Incident simple — pas d'investigation approfondie requise.</p>
              <p className="text-small mt-1">Impact sécurité: <strong>{impactSecurite === 'moyen' ? 'Moyen' : 'Faible'}</strong></p>
            </Card>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Recommandations</label>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Recommandations à transmettre à l'exploitant…" value={recommandations} onChange={(e) => setRecommandations(e.target.value)} rows={4} />
            </div>
          </div>
        )}

        {/* ────── ÉTAPE 3 : Écart lié ────── */}
        {etape === 3 && isAccidentGrave && isInspector && isMonEvenement && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Écart lié</h3>
            {!ecartCreated && !aucunEcart && (
              <div className="space-y-4">
                <p className="text-small text-muted-foreground">Pour un {classification}, la création d'un écart réglementaire est recommandée.</p>
                <div className="form-field">
                  <label className="text-role-primary text-xs uppercase font-semibold">Libellé de l'écart</label>
                  <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Décrivez l'écart…" value={ecartLibelle} onChange={(e) => setEcartLibelle(e.target.value)} rows={3} />
                </div>
                <div className="flex gap-3 flex-wrap">
                  <button className="btn btn-primary gap-2" onClick={handleCreerEcart}><AlertTriangle className="w-4 h-4" />Créer un écart lié</button>
                  <button className="btn btn-secondary gap-2" onClick={() => setAucunEcart(true)}><CheckCircle2 className="w-4 h-4" />Aucun écart requis</button>
                </div>
              </div>
            )}
            {ecartCreated && (
              <Card variant="level" levelColor="success" size="sm" className="bg-gradient-to-r from-success/5 to-transparent">
                <p className="font-medium text-success flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Écart créé</p>
                <p className="text-small text-muted-foreground mt-1">Un PAC sera requis de l'exploitant.</p>
              </Card>
            )}
            {aucunEcart && !ecartCreated && (
              <Card variant="role" size="sm">
                <p className="font-medium">Aucun écart créé</p>
                <button className="btn btn-secondary mt-2" onClick={() => setAucunEcart(false)}>← Revenir</button>
              </Card>
            )}
          </div>
        )}

        {/* ────── ÉTAPE 4 : Rapport final ────── */}
        {etape === 4 && isAccidentGrave && isInspector && isMonEvenement && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Rapport final</h3>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Rapport <span className="text-danger">*</span></label>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Rapport final complet…" value={rapportFinal} onChange={(e) => setRapportFinal(e.target.value)} rows={8} />
            </div>
            {recommandations && (
              <Card variant="role" size="sm" className="bg-role-primary/5">
                <p className="text-xs font-semibold text-role-primary uppercase mb-1">Recommandations</p>
                <p className="text-small">{recommandations}</p>
              </Card>
            )}
          </div>
        )}

        {/* ────── ÉTAPE 5 : Validation ────── */}
        {etape === 5 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">
              {isAdmin ? 'Validation' : 'Soumission pour validation'}
            </h3>

            {/* INSPECTEUR : Soumettre */}
            {isInspector && isMonEvenement && evt.statut !== 'soumis_validation' && evt.statut !== 'cloture' && (
              <div className="space-y-4">
                <Card heading={<div className="flex items-center justify-between cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step1')}>
                  <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-success-soft flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-success" /></div><span className="font-medium">Réception</span></div>
                  {expandedSteps.includes('step1') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>}>{expandedSteps.includes('step1') && <div className="space-y-2"><p className="text-small"><span className="font-medium text-muted-foreground">Type:</span> {evt.type}</p><p className="text-small"><span className="font-medium text-muted-foreground">Gravité:</span> <span className={getBadgeGravite(evt.gravite)}>{getLabelGravite(evt.gravite)}</span></p></div>}</Card>

                <Card heading={<div className="flex items-center justify-between cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step2')}>
                  <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-success-soft flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-success" /></div><span className="font-medium">Analyse</span></div>
                  {expandedSteps.includes('step2') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>}>{expandedSteps.includes('step2') && <div className="space-y-2"><p className="text-small"><span className="font-medium text-muted-foreground">Classification:</span> {classification === 'incident_grave' ? 'incident grave' : classification}{!isAccidentGrave && ` — Impact ${impactSecurite}`}</p><p className="text-small"><span className="font-medium text-muted-foreground">Analyse:</span> {analysePreliminaire || '—'}</p></div>}</Card>

                {isAccidentGrave && <Card heading={<div className="flex items-center justify-between cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step3')}>
                  <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-success-soft flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-success" /></div><span className="font-medium">Investigation</span></div>
                  {expandedSteps.includes('step3') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>}>{expandedSteps.includes('step3') && <div className="space-y-2"><p className="text-small">{rapportInvestigation || '—'}</p>{causes.length > 0 && <><p className="text-small font-medium text-muted-foreground">Causes:</p><ul className="list-disc pl-4 text-small">{causes.map((c, i) => <li key={i}>{c}</li>)}</ul></>}</div>}</Card>}

                {!isAccidentGrave && recommandations && <Card size="sm"><p className="text-xs font-medium text-muted-foreground uppercase mb-1">Recommandations</p><p className="text-small">{recommandations}</p></Card>}

                <button className="btn btn-primary gap-2 w-full" onClick={handleSoumettreValidation} disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Soumettre pour validation
                </button>
              </div>
            )}

            {/* ADMIN : Valider ou retourner */}
            {isAdmin && (evt.statut === 'soumis_validation' || evt.statut === 'cloture') && (
              <div className="space-y-4">
                <Card className="bg-success-soft/10" size="sm">
                  <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" />Événement soumis pour validation par l'inspecteur</p>
                </Card>

                <div className="space-y-3">
                  <Card heading={<div className="flex items-center justify-between cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step1')}>
                    <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center"><FileText className="w-4 h-4 text-role-primary" /></div><span className="font-medium">Analyse</span></div>
                    {expandedSteps.includes('step1') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>}>{expandedSteps.includes('step1') && <p className="text-small">{analysePreliminaire || evt.analyse_preliminaire || '—'}</p>}</Card>

                  {isAccidentGrave && <Card heading={<div className="flex items-center justify-between cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step2')}>
                    <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center"><FileText className="w-4 h-4 text-role-primary" /></div><span className="font-medium">Investigation</span></div>
                    {expandedSteps.includes('step2') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>}>{expandedSteps.includes('step2') && <p className="text-small">{evt.rapport_investigation || rapportInvestigation || '—'}</p>}</Card>}

                  {isAccidentGrave && <Card heading={<div className="flex items-center justify-between cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step3')}>
                    <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-role-primary-soft flex items-center justify-center"><FileText className="w-4 h-4 text-role-primary" /></div><span className="font-medium">Rapport final</span></div>
                    {expandedSteps.includes('step3') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>}>{expandedSteps.includes('step3') && <p className="text-small">{evt.rapport_final_contenu || rapportFinal || '—'}</p>}</Card>}

                  {evt.recommandations && <Card size="sm"><p className="text-xs font-medium text-muted-foreground uppercase mb-1">Recommandations</p><p className="text-small">{evt.recommandations}</p></Card>}
                </div>

                <div className="flex gap-3">
                  <button className="btn btn-success gap-2 flex-1" onClick={handleValiderCloture} disabled={isLoading}>
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Valider et clôturer
                  </button>
                  <div className="flex-1">
                    <textarea className={`w-full py-2 px-3 rounded-xl border border-border bg-background text-foreground text-sm ${focusClass}`} placeholder="Motif du retour…" value={commentaireRetour} onChange={(e) => setCommentaireRetour(e.target.value)} rows={2} />
                    <button className="btn btn-warning gap-2 mt-2 w-full" onClick={handleRetourner} disabled={isLoading || !commentaireRetour.trim()}>
                      Retourner à l'inspecteur
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* INSPECTEUR : Après soumission */}
            {isInspector && isMonEvenement && evt.statut === 'soumis_validation' && (
              <Card variant="level" levelColor="success" size="sm" className="bg-success/5">
                <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" />Soumis pour validation</p>
                <p className="text-xs text-muted-foreground mt-1">En attente de validation par l'administrateur.</p>
              </Card>
            )}

            {evt.validation_admin_commentaire && (
              <Card variant="level" levelColor="warning" size="sm" className="bg-warning-soft/20">
                <p className="font-medium text-warning text-xs">Commentaire de l'administrateur :</p>
                <p className="text-sm mt-1">{evt.validation_admin_commentaire}</p>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose}>Fermer</button>

        {/* Inspecteur : navigation entre étapes */}
        {isInspector && isMonEvenement && evt.statut !== 'soumis_validation' && evt.statut !== 'cloture' && (
          <div className="flex gap-2">
            {etape > 0 && etape < 5 && (
              <button className="btn btn-secondary" onClick={() => setEtape(p => p - 1)}>← Précédent</button>
            )}
            {etape < 5 && (
              <button className="btn btn-primary" onClick={handleNext}>Suivant →</button>
            )}
          </div>
        )}

        {/* Inspecteur : étape 1, peut clôturer directement si incident simple impact faible */}
        {isInspector && isMonEvenement && etape === 1 && classification === 'incident' && impactSecurite === 'faible' && analysePreliminaire.trim().length > 0 && (
          <button className="btn btn-success gap-2" onClick={handleSoumettreValidation} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Recommandations & soumettre
          </button>
        )}
      </div>
    </div>
  )
}

export { EvenementWorkflow }
export default EvenementWorkflow
