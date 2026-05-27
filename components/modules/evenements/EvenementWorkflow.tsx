// components/modules/evenements/EvenementWorkflow.tsx
'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAppStore, type EvenementSecurite } from '@/lib/store'
import { riskAgent } from '@/lib/ia/agents/riskAgent'
import { X, CheckCircle2, AlertTriangle, FileText, User, Calendar, MapPin, Clock, ChevronDown, ChevronRight, AlertCircle, Sparkles, Loader2, TrendingUp, TrendingDown } from 'lucide-react'

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

const ETAPES = ['Réception', 'Analyse', 'Investigation / Impact', 'Écart', 'Rapport', 'Clôture']

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"
const selectStyle = { backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat' }

function EvenementWorkflow({ evenementId, userRole, onClose }: EvenementWorkflowProps) {
  const evenements = useAppStore((s) => s.evenements)
  const updateEvenement = useAppStore((s) => s.updateEvenement)
  const assignerInspecteur = useAppStore((s) => s.assignerInspecteur)
  const creerEcartLie = useAppStore((s) => s.creerEcartLie)
  const getProfilRisque = useAppStore((s) => s.getProfilRisque)
  const addNotification = useAppStore((s) => s.addNotification)
  const addRegistreEntry = useAppStore((s) => s.addRegistreEntry)
  const user = useAppStore((s) => s.user)
  const utilisateurs = useAppStore((s) => s.utilisateurs)
  const inspecteurs = useAppStore((s) => s.inspecteurs)
  const evt = (evenements?.find((e) => e.id === evenementId) ?? FALLBACK_EVT) as EvenementSecurite
  const profilAerodrome = getProfilRisque(evt.aerodrome_id || '')

  const listeInspecteurs = inspecteurs.length > 0
    ? inspecteurs.map(i => ({ id: i.id, nom: `${i.prenom} ${i.nom}` }))
    : utilisateurs.filter(u => ['inspector', 'admin'].includes(u.role)).map(u => ({ id: u.id, nom: `${u.prenom} ${u.nom}` }))

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
  const [isClotureEnCours, setIsClotureEnCours] = useState(false)

  // Charger suggestion IA au démarrage
  useEffect(() => {
    if (profilAerodrome && etape === 0 && !iaSuggestion) {
      setIaLoading(true)
      riskAgent.analyzeRisk({ aerodromeId: evt.aerodrome_id || '', includeSuggestions: true, includePredictions: false, includeBlackSwan: false }, {} as any)
        .then(analysis => {
          if (analysis?.suggestions?.[0]) setIaSuggestion(analysis.suggestions[0].description)
        })
        .catch(() => {})
        .finally(() => setIaLoading(false))
    }
  }, [profilAerodrome, etape, evt.aerodrome_id, iaSuggestion])

  // Persister les données à chaque étape
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

  const isAccidentGrave = classification === 'accident' || classification === 'incident_grave'

  const canGoNext = useCallback(() => {
    if (etape === 0) return true
    if (etape === 1) return analysePreliminaire.trim().length > 0
    if (etape === 2 && isAccidentGrave) return rapportInvestigation.trim().length > 0
    if (etape === 2 && !isAccidentGrave) return true
    if (etape === 3 && isAccidentGrave) return ecartCreated || aucunEcart
    if (etape === 3 && !isAccidentGrave) return true
    if (etape === 4 && isAccidentGrave) return rapportFinal.trim().length > 0
    if (etape === 4 && !isAccidentGrave) return true
    return true
  }, [etape, analysePreliminaire, isAccidentGrave, rapportInvestigation, ecartCreated, aucunEcart, rapportFinal])

  const handleNext = useCallback(async () => {
    if (!canGoNext()) return
    await persisterDonnees()
    const nextEtape = etape + 1
    // Skip investigation/ecart/rapport steps if incident simple
    if (!isAccidentGrave && (etape === 1)) { setEtape(5); return }
    let nouveauStatut: EvenementSecurite['statut'] | undefined
    if (etape === 0) nouveauStatut = 'en_cours'
    else if (etape === 1) nouveauStatut = 'analyse'
    else if (etape === 2 && isAccidentGrave) nouveauStatut = 'en_cours'
    else if (etape === 3 && isAccidentGrave) nouveauStatut = 'ecart_cree'
    else if (etape === 4 && isAccidentGrave) nouveauStatut = 'rapport_redige'
    if (evt.id !== FALLBACK_EVT.id && nouveauStatut) {
      try { await updateEvenement(evt.id, { statut: nouveauStatut }) }
      catch (err) { console.error('[Workflow] Échec maj statut:', err); return }
    }
    setEtape(nextEtape)
  }, [etape, canGoNext, persisterDonnees, isAccidentGrave, evt.id, updateEvenement])

  const handlePrev = useCallback(() => {
    if (etape === 0) { onClose(); return }
    setEtape((p) => p - 1)
  }, [etape, onClose])

  const handleCloture = useCallback(async () => {
    if (evt.id === FALLBACK_EVT.id) { onClose(); return }
    setIsClotureEnCours(true)
    try {
      await persisterDonnees()
      await updateEvenement(evt.id, { statut: 'cloture', date_cloture: new Date().toISOString() })
      // Archiver dans le registre
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
      // Notifier les exploitants
      const operateurs = utilisateurs.filter(u =>
        ['focal_operator', 'dg_operator', 'staff_operator'].includes(u.role) &&
        u.aerodrome_id === evt.aerodrome_id
      )
      operateurs.forEach(op => {
        addNotification({
          user_id: op.id,
          type: 'info',
          title: `Événement clôturé — ${evt.reference}`,
          message: `L'événement ${evt.type} (${classification === 'incident_grave' ? 'incident grave' : classification}) à ${aerodrome?.code_oaci || evt.aerodrome_id} a été traité et clôturé.${ecartCreated ? ' Un écart a été créé — PAC requis.' : ''}${recommandations ? ' Des recommandations ont été émises.' : ''}`,
          canal: 'in_app',
          link: '/?module=operator-evenements',
        })
      })
      onClose()
    } catch (err) {
      console.error('[Workflow] Échec clôture:', err)
    } finally {
      setIsClotureEnCours(false)
    }
  }, [evt.id, updateEvenement, persisterDonnees, onClose, classification, ecartCreated, recommandations, evt.type, addNotification, addRegistreEntry, utilisateurs, analysePreliminaire, evt.description, rapportFinal, rapportInvestigation, user?.id, evt.aerodrome_id])

  const handleAddCause = () => {
    if (nouvelCause.trim()) { setCauses((prev) => [...prev, nouvelCause.trim()]); setNouvelCause('') }
  }

  const handleRemoveCause = (idx: number) => setCauses((prev) => prev.filter((_, i) => i !== idx))

  const toggleStep = (step: string) => {
    setExpandedSteps((prev) => prev.includes(step) ? prev.filter(s => s !== step) : [...prev, step])
  }

  // Génération IA du rapport d'investigation
  const [iaGenerating, setIaGenerating] = useState<'investigation' | 'rapport' | null>(null)
  const generateWithIA = async (type: 'investigation' | 'rapport') => {
    setIaGenerating(type)
    try {
      const prompt = type === 'investigation'
        ? `Rédige un rapport d'investigation pour un événement de sécurité aérienne.
Type: ${evt.type}
Gravité: ${evt.gravite}
Description: ${evt.description}
Classification: ${classification === 'incident_grave' ? 'incident grave' : classification}
Analyse préliminaire: ${analysePreliminaire}
Causes identifiées: ${causes.join(', ') || 'À déterminer'}
Facteurs contributifs: ${Object.entries(facteursContributifs).filter(([, v]) => v).map(([k]) => k).join(', ') || 'À déterminer'}
Actions immédiates: ${evt.actions_immediates}

Structure le rapport avec: 1. Résumé de l'événement 2. Analyse des causes 3. Facteurs contributifs 4. Conclusions 5. Recommandations`
        : `Rédige un rapport final de sécurité aérienne pour clôturer un événement.
Type: ${evt.type}
Gravité: ${evt.gravite}
Classification: ${classification === 'incident_grave' ? 'incident grave' : classification}
Analyse: ${analysePreliminaire}
Rapport d'investigation: ${rapportInvestigation}
Causes: ${causes.join(', ') || 'Non identifiées'}
Recommandations: ${recommandations || 'Non spécifiées'}

Structure le rapport avec: 1. Récapitulatif 2. Analyse 3. Causes et facteurs 4. Mesures prises 5. Recommandations 6. Conclusion`
      const response = await fetch('/api/ia/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const data = await response.json()
      if (data?.content) {
        if (type === 'investigation') setRapportInvestigation(data.content)
        else setRapportFinal(data.content)
      }
    } catch (err) {
      console.error('[Workflow] Erreur génération IA:', err)
    } finally {
      setIaGenerating(null)
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

  const nomEtape = (idx: number) => {
    const base = ETAPES[idx]
    if (idx === 2) return isAccidentGrave ? 'Investigation' : 'Analyse impact'
    if (idx === 3) return isAccidentGrave ? 'Écart lié' : 'Recommandations'
    if (idx === 4) return isAccidentGrave ? 'Rapport final' : 'Finaliser'
    return base
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
        <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
      </div>

      {/* Stepper */}
      <div className="px-6 pt-4 pb-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {ETAPES.map((label, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <button onClick={() => idx < etape && setEtape(idx)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${idx === etape ? 'bg-role-gradient text-white shadow-role-glow scale-105' : idx < etape ? 'bg-success text-white cursor-pointer hover:brightness-110' : 'bg-background text-foreground/70 border border-border cursor-default'}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${idx === etape ? 'bg-white/25 text-white' : idx < etape ? 'bg-white/30 text-white' : 'bg-muted-foreground/30 text-foreground/60'}`}>{idx < etape ? '✓' : idx + 1}</span>
                {nomEtape(idx)}
              </button>
              {idx < ETAPES.length - 1 && <div className={`h-0.5 w-5 rounded-full ${idx < etape ? 'bg-success' : 'bg-border'}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="modal-body space-y-4">
        {/* ÉTAPE 0 — Réception + IA */}
        {etape === 0 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Réception & Qualification</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="card p-4 border-l-4 border-l-role-primary">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">RÉFÉRENCE</p><p className="code-oaci-badge mt-1">{evt.reference}</p></div>
                </div>
              </div>
              <div className="card p-4 border-l-4 border-l-role-primary">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><Calendar className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">DATE / HEURE</p><p className="font-medium mt-1">{evt.date} à {evt.heure}</p></div>
                </div>
              </div>
              <div className="card p-4 border-l-4 border-l-role-primary">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><AlertTriangle className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">TYPE</p><p className="font-medium mt-1">{evt.type}</p></div>
                </div>
              </div>
              <div className="card p-4 border-l-4 border-l-role-primary">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><AlertCircle className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">GRAVITÉ</p><div className="mt-1"><span className={getBadgeGravite(evt.gravite)}>{getLabelGravite(evt.gravite)}</span></div></div>
                </div>
              </div>
              <div className="card p-4 border-l-4 border-l-role-primary col-span-2">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">LOCALISATION</p><p className="font-medium mt-1">{evt.localisation}</p></div>
                </div>
              </div>
              <div className="card p-4 border-l-4 border-l-role-primary col-span-2">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-role-primary-soft flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-role-primary" /></div>
                  <div><p className="text-xs text-muted-foreground font-medium">DESCRIPTION</p><p className="text-small mt-1">{evt.description}</p></div>
                </div>
              </div>
            </div>

            {/* Analyse IA du profil de risque */}
            {profilAerodrome && (
              <div className="card p-4 border-l-4 border-l-role-primary bg-gradient-to-r from-role-primary/5 to-transparent">
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
              </div>
            )}

            {/* Assignation inspecteur */}
            {(userRole === 'admin' || userRole === 'inspector') && (
              <div className="card p-4 space-y-3 border-l-4 border-l-role-primary bg-role-primary-soft">
                <p className="font-semibold text-role-primary text-sm flex items-center gap-2"><User className="w-4 h-4" />Assigner un inspecteur</p>
                <div className="flex gap-2">
                  <select className={`w-full py-3 pl-4 pr-10 rounded-xl border-2 border-role-primary/40 bg-background text-foreground font-medium appearance-none ${focusClass}`} style={selectStyle} value={inspecteurId} onChange={(e) => setInspecteurId(e.target.value)}>
                    <option value="">Sélectionner un inspecteur…</option>
                    {listeInspecteurs.map((ins) => (<option key={ins.id} value={ins.id}>{ins.nom}</option>))}
                  </select>
                  <button className="btn btn-primary px-5" disabled={!inspecteurId} onClick={() => assignerInspecteur(evenementId, inspecteurId)}>Assigner</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ÉTAPE 1 — Analyse + Classification */}
        {etape === 1 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Analyse préliminaire</h3>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Analyse <span className="text-danger">*</span></label>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Analyse préliminaire de l'événement…" value={analysePreliminaire} onChange={(e) => setAnalysePreliminaire(e.target.value)} rows={4} />
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Classification</label>
              <div className="space-y-2 mt-1">
                {(['accident', 'incident', 'incident_grave'] as const).map((c) => (
                  <label key={c} className="form-radio cursor-pointer">
                    <input type="radio" name="classification" value={c} checked={classification === c} onChange={() => setClassification(c)} />
                    <span className="text-small capitalize">{c === 'incident_grave' ? 'incident grave' : c}</span>
                  </label>
                ))}
              </div>
            </div>
            {classification === 'incident' && (
              <div className="card p-4 border-l-4 border-l-role-primary bg-role-primary-soft">
                <p className="text-xs font-semibold text-role-primary uppercase mb-2">Impact sur la sécurité</p>
                <div className="flex gap-4">
                  {(['moyen', 'faible'] as const).map((imp) => (
                    <label key={imp} className="form-radio cursor-pointer">
                      <input type="radio" name="impact" value={imp} checked={impactSecurite === imp} onChange={() => setImpactSecurite(imp)} />
                      <span className="text-small capitalize">{imp}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">ℹ️ Pour un incident simple, l'impact guide le besoin de recommandations et de suivi.</p>
              </div>
            )}
            {isAccidentGrave && (
              <div className="card p-4 border-l-4 border-l-danger bg-danger/5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-danger" />
                  <p className="text-sm font-medium text-danger">Classification {classification === 'accident' ? 'accident' : 'incident grave'} — investigation, écarts et rapport final obligatoires</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ÉTAPE 2 — Investigation (accident) / Analyse impact (incident) */}
        {etape === 2 && isAccidentGrave && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Investigation</h3>
            <div className="form-field">
              <div className="flex items-center justify-between">
                <label className="text-role-primary text-xs uppercase font-semibold">Rapport d'investigation <span className="text-danger">*</span></label>
                <button type="button" className="btn btn-sm btn-ghost gap-1 text-xs" onClick={() => generateWithIA('investigation')} disabled={iaGenerating === 'investigation' || !analysePreliminaire}>
                  {iaGenerating === 'investigation' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {iaGenerating === 'investigation' ? 'Génération...' : 'Générer avec IA'}
                </button>
              </div>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Conclusions de l'investigation…" value={rapportInvestigation} onChange={(e) => setRapportInvestigation(e.target.value)} rows={4} />
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Causes profondes</label>
              <div className="flex gap-2">
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
        {etape === 2 && !isAccidentGrave && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Recommandations à l'exploitant</h3>
            <div className="card p-4 border-l-4 border-l-success bg-success/5">
              <p className="text-small">Incident simple — pas d'investigation approfondie requise.</p>
              <p className="text-small mt-1">Impact sécurité: <strong>{impactSecurite === 'moyen' ? 'Moyen' : 'Faible'}</strong></p>
            </div>
            <div className="form-field">
              <label className="text-role-primary text-xs uppercase font-semibold">Recommandations</label>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Recommandations à transmettre à l'exploitant…" value={recommandations} onChange={(e) => setRecommandations(e.target.value)} rows={4} />
            </div>
          </div>
        )}

        {/* ÉTAPE 3 — Écart lié (accident) / Skip (incident) */}
        {etape === 3 && isAccidentGrave && (
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
              <div className="card p-4 border-l-4 border-l-success bg-gradient-to-r from-success/5 to-transparent">
                <p className="font-medium text-success flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />Écart créé</p>
                <p className="text-small text-muted-foreground mt-1">Un PAC sera requis de l'exploitant.</p>
              </div>
            )}
            {aucunEcart && !ecartCreated && (
              <div className="card p-4 border-l-4 border-l-role-primary">
                <p className="font-medium">Aucun écart créé</p>
                <button className="btn btn-secondary mt-2" onClick={() => setAucunEcart(false)}>← Revenir</button>
              </div>
            )}
          </div>
        )}
        {etape === 3 && !isAccidentGrave && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Finalisation</h3>
            <div className="card p-4 border-l-4 border-l-success bg-success/5">
              <p className="font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" />Incident simple traité par recommandations</p>
              {recommandations && <p className="text-small mt-2">{recommandations}</p>}
            </div>
          </div>
        )}

        {/* ÉTAPE 4 — Rapport final (accident) / Skip (incident) */}
        {etape === 4 && isAccidentGrave && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Rapport final</h3>
            <div className="form-field">
              <div className="flex items-center justify-between">
                <label className="text-role-primary text-xs uppercase font-semibold">Rapport <span className="text-danger">*</span></label>
                <button type="button" className="btn btn-sm btn-ghost gap-1 text-xs" onClick={() => generateWithIA('rapport')} disabled={iaGenerating === 'rapport' || !analysePreliminaire}>
                  {iaGenerating === 'rapport' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {iaGenerating === 'rapport' ? 'Génération...' : 'Générer avec IA'}
                </button>
              </div>
              <textarea className={`form-textarea w-full bg-gradient-to-r from-background to-role-primary/5 border-border text-foreground py-3 px-4 rounded-xl ${focusClass}`} placeholder="Rapport final complet…" value={rapportFinal} onChange={(e) => setRapportFinal(e.target.value)} rows={8} />
            </div>
            {recommandations && (
              <div className="card p-4 border-l-4 border-l-role-primary bg-role-primary/5">
                <p className="text-xs font-semibold text-role-primary uppercase mb-1">Recommandations</p>
                <p className="text-small">{recommandations}</p>
              </div>
            )}
          </div>
        )}
        {etape === 4 && !isAccidentGrave && (
          <div className="animate-fade-in text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
            <p className="font-medium">Toutes les étapes sont complétées.</p>
            <p className="text-sm text-muted-foreground mt-1">Passez à la clôture pour finaliser l'événement.</p>
          </div>
        )}

        {/* ÉTAPE 5 — Clôture */}
        {etape === 5 && (
          <div className="space-y-4 animate-fade-in">
            <h3 className="heading-4 text-role-primary">Clôture</h3>
            <div className="card border-border"><div className="flex items-center justify-between p-4 cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step1')}>
              <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-success-soft flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-success" /></div><span className="font-medium">Réception</span></div>
              {expandedSteps.includes('step1') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>{expandedSteps.includes('step1') && <div className="p-4 border-t border-border space-y-2"><p className="text-small"><span className="font-medium text-muted-foreground">Type:</span> {evt.type}</p><p className="text-small"><span className="font-medium text-muted-foreground">Gravité:</span> <span className={getBadgeGravite(evt.gravite)}>{getLabelGravite(evt.gravite)}</span></p></div>}</div>

            <div className="card border-border"><div className="flex items-center justify-between p-4 cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step2')}>
              <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-success-soft flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-success" /></div><span className="font-medium">Analyse</span></div>
              {expandedSteps.includes('step2') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>{expandedSteps.includes('step2') && <div className="p-4 border-t border-border space-y-2"><p className="text-small"><span className="font-medium text-muted-foreground">Classification:</span> {classification === 'incident_grave' ? 'incident grave' : classification}{!isAccidentGrave && ` — Impact ${impactSecurite}`}</p><p className="text-small"><span className="font-medium text-muted-foreground">Analyse:</span> {analysePreliminaire || '—'}</p></div>}</div>

            {isAccidentGrave && <div className="card border-border"><div className="flex items-center justify-between p-4 cursor-pointer hover:bg-role-primary-soft transition-colors" onClick={() => toggleStep('step3')}>
              <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-success-soft flex items-center justify-center"><CheckCircle2 className="w-4 h-4 text-success" /></div><span className="font-medium">Investigation</span></div>
              {expandedSteps.includes('step3') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </div>{expandedSteps.includes('step3') && <div className="p-4 border-t border-border space-y-2"><p className="text-small">{rapportInvestigation || '—'}</p>{causes.length > 0 && <><p className="text-small font-medium text-muted-foreground">Causes:</p><ul className="list-disc pl-4 text-small">{causes.map((c, i) => <li key={i}>{c}</li>)}</ul></>}</div>}</div>}

            {!isAccidentGrave && recommandations && <div className="card border-border"><div className="p-4"><p className="text-xs font-medium text-muted-foreground uppercase mb-1">Recommandations</p><p className="text-small">{recommandations}</p></div></div>}

            <div className="card bg-warning-soft/20 border border-warning-soft/30 p-4">
              <p className="text-xs font-semibold uppercase flex items-center gap-2"><Sparkles className="w-3 h-3" />Impact sur le profil de risque</p>
              <p className="text-xs text-muted-foreground mt-1">La clôture de cet événement mettra à jour le score C5 (résilience) et les prédictions d'incidents du profil de risque {evt.aerodrome_id}. L'IA bayésienne ajustera ses priors.</p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={handlePrev}>{etape === 0 ? 'Annuler' : '← Précédent'}</button>
        {etape === 5 ? (
          <button className="btn btn-success gap-2" onClick={handleCloture} disabled={isClotureEnCours}>
            {isClotureEnCours ? <><Loader2 className="w-4 h-4 animate-spin" />Clôture...</> : <><CheckCircle2 className="w-4 h-4" />Clôturer</>}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={handleNext} disabled={!canGoNext()}>Suivant →</button>
        )}
      </div>
    </div>
  )
}

export { EvenementWorkflow }
export default EvenementWorkflow
