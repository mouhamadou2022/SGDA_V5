// components/modules/planning/PlanningDetailsModal.tsx
// Grande modale de consultation d'un planning : toutes les infos de la
// mission à venir + état de la préparation de la surveillance.
'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAppStore, Planning, Aerodrome, FicheBriefing } from '@/lib/store'
import { getDomaineLabel, expandDomaines } from '@/lib/domaines'
import { Card } from '@/components/ui/card'
import {
  X, Calendar, Star, Target, MapPin, ClipboardList, FileText,
  Clock, AlertTriangle, CheckCircle2, Send, PlayCircle, Sparkles,
  ArrowRight,
} from 'lucide-react'

interface Props {
  planning: Planning | null
  aerodrome?: Aerodrome
  surveillanceId?: string
  isLancee?: boolean
  userRole: string
  onClose: () => void
  onPrepare?: (planning: Planning) => void
}

const DECLENCHEUR_LABELS: Record<string, string> = {
  automatique: 'Automatique',
  manuel: 'Manuel',
  renouvellement: 'Renouvellement certification',
  evenement: 'Suite événement',
  demande_dg: 'Demande DG',
}

const TYPE_LABELS: Record<string, string> = {
  programmee: 'Programmée',
  periodique: 'Périodique',
  inopinee: 'Inopinée',
  inopine: 'Inopinée',
  speciale: 'Spéciale',
  suivi_ecarts: 'Suivi des écarts',
  mise_oeuvre_pac: 'Mise en œuvre PAC',
  certification: 'Certification',
  homologation: 'Homologation',
  audit_complet: 'Audit complet',
  urgence: 'Urgence',
  maintien: 'Maintien',
}

export default function PlanningDetailsModal({ planning, aerodrome, surveillanceId, isLancee = false, userRole, onClose, onPrepare }: Props) {
  const router = useRouter()
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const profilsRisque = useAppStore(s => s.profilsRisque)
  const ecarts = useAppStore(s => s.ecarts)
  const surveillances = useAppStore(s => s.surveillances)

  if (!planning) return null

  const profil = profilsRisque?.[planning.aerodrome_id]
  const ecartsActifs = ecarts.filter(e => e.aerodrome_id === planning.aerodrome_id && e.statut !== 'cloture')
  const nbEcartsCritiques = ecartsActifs.filter(e => e.niveau_risque === 'critique').length
  const survLiee = (isLancee ? surveillances.find(s => s.id === surveillanceId) : undefined)
    || (planning.surveillance_id ? surveillances.find(s => s.id === planning.surveillance_id) : undefined)

  const chef = planning.chef_id ? utilisateurs.find(u => u.id === planning.chef_id) : null
  const getInitiales = (p: string, n: string) => `${p.charAt(0)}${n.charAt(0)}`.toUpperCase()

  // ── État de préparation de la surveillance ──
  const etats = [
    { cle: 'equipe', label: 'Équipe désignée', ok: !!planning.chef_id && (planning.equipe_ids?.length ?? 0) > 0, detail: planning.chef_id ? `${(planning.equipe_ids ?? []).length} inspecteur(s) — chef désigné` : 'Aucun chef désigné' },
    { cle: 'briefing', label: 'Fiche de briefing générée', ok: !!planning.briefing_fiche, detail: planning.briefing_fiche ? `Générée le ${new Date(planning.briefing_fiche.genere_le).toLocaleDateString('fr-FR')}` : 'Non générée' },
    { cle: 'checklist', label: 'Checklist préparée', ok: !!(planning.checklist_hierarchy && planning.checklist_hierarchy.length > 0), detail: planning.checklist_hierarchy?.length ? `${planning.checklist_hierarchy.length} domaine(s) préparé(s)` : 'Non préparée' },
    { cle: 'delegations', label: 'Délégations des domaines', ok: Object.keys(planning.delegations ?? {}).length > 0, detail: Object.keys(planning.delegations ?? {}).length > 0 ? `${Object.keys(planning.delegations ?? {}).length} domaine(s) réparti(s)` : 'Répartition non effectuée' },
    { cle: 'confirmation', label: 'Confirmation de l\'inspecteur', ok: !!planning.confirme_le, detail: planning.confirme_le ? `Confirmée le ${new Date(planning.confirme_le).toLocaleDateString('fr-FR')}` : 'Non confirmée' },
    { cle: 'lancement', label: 'Surveillance lancée', ok: isLancee, detail: isLancee ? 'Mission en cours' : 'Non lancée' },
  ]
  const etapesFaites = etats.filter(e => e.ok).length
  const progressionPrepa = Math.round((etapesFaites / etats.length) * 100)

  const joursRestants = (() => {
    const today = new Date()
    const debut = new Date(planning.date_debut)
    return Math.ceil((debut.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  })()

  const ajoursClass = joursRestants < 0 ? 'text-danger' : joursRestants <= 7 ? 'text-warning' : 'text-muted-foreground'
  const ajoursLabel = joursRestants < 0 ? 'Date dépassée' : joursRestants === 0 ? 'Aujourd\'hui' : `J-${joursRestants}`

  const briefing: FicheBriefing | null | undefined = planning.briefing_fiche
  // Léger utilitaire de formatage pour le champ "generer_le" (variante de clef historique)
  const formatDate = (v?: string) => (v ? new Date(v).toLocaleDateString('fr-FR') : '—')

  const getStatutBadge = (statut: string): { cls: string; label: string } => {
    const variants: Record<string, { cls: string; label: string }> = {
      planifiee: { cls: 'badge primary', label: 'Planifiée' },
      en_cours: { cls: 'badge warning', label: 'En cours' },
      realisee: { cls: 'badge success', label: 'Réalisée' },
      annulee: { cls: 'badge neutral', label: 'Annulée' },
      en_retard: { cls: 'badge danger animate-pulse', label: 'En retard' },
    }
    return variants[statut] || variants.planifiee
  }
  const getPrioriteBadge = (priorite: string): { cls: string; label: string } => {
    const variants: Record<string, { cls: string; label: string }> = {
      basse: { cls: 'badge neutral', label: 'Basse' },
      moyenne: { cls: 'badge teal', label: 'Moyenne' },
      haute: { cls: 'badge warning', label: 'Haute' },
      critique: { cls: 'badge danger animate-pulse', label: 'Critique' },
    }
    return variants[priorite] || variants.moyenne
  }
  const sb = getStatutBadge(planning.statut)
  const pb = getPrioriteBadge(planning.priorite)

  const getProfilTxt = () => {
    if (!profil) return { value: '—', variant: 'text-muted-foreground' }
    const v = profil.score_global
    if (v < 30) return { value: `${v}/100`, variant: 'text-danger' }
    if (v < 60) return { value: `${v}/100`, variant: 'text-warning' }
    return { value: `${v}/100`, variant: 'text-success' }
  }
  const profilTxt = getProfilTxt()

  return createPortal(
    <>
      <div className="modal-overlay" data-role={userRole} onClick={onClose}>
        <div className="modal-content max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="bg-background rounded-2xl overflow-hidden border-t-4 border-t-role-primary">

            {/* Header */}
            <div className="modal-header border-b border-border bg-gradient-to-r from-role-primary/10 to-transparent">
              <div className="modal-title flex items-center gap-2">
                <FileText className="w-5 h-5 text-role-primary" />
                Détails de la surveillance — {aerodrome?.code_oaci} {aerodrome?.nom}
              </div>
              <button className="modal-close" onClick={onClose}><X className="w-4 h-4" /></button>
            </div>

            {/* Body */}
            <div className="modal-body p-5 space-y-5">

              {/* Bloc identité */}
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <p className="text-lg font-bold text-foreground">
                    {TYPE_LABELS[planning.type] || planning.type.replace(/_/g, ' ')}
                    {planning.est_proposition && <span className="badge warning animate-pulse text-[10px] ml-2">Proposition N+1</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={sb.cls}>{sb.label}</span>
                    <span className={pb.cls}>{pb.label}</span>
                    <span className={`badge outline text-xs flex items-center gap-1 ${ajoursClass}`}>
                      <Clock className="w-3 h-3" />
                      {ajoursLabel}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Profil de risque</p>
                  <p className={`text-2xl font-bold ${profilTxt.variant}`}>{profilTxt.value}</p>
                  {profil?.niveau && <span className="badge text-xs">{profil.niveau}</span>}
                </div>
              </div>

              {/* Infos générales */}
              <Card className="[&>div:last-child]:p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-role-primary shrink-0" />
                    <div><p className="text-xs text-muted-foreground">Aérodrome</p><p className="font-medium text-sm">{aerodrome?.code_oaci} — {aerodrome?.nom}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-role-primary shrink-0" />
                    <div><p className="text-xs text-muted-foreground">Période</p><p className="font-medium text-sm">{new Date(planning.date_debut).toLocaleDateString('fr-FR')} → {new Date(planning.date_fin).toLocaleDateString('fr-FR')}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-role-primary shrink-0" />
                    <div><p className="text-xs text-muted-foreground">Déclencheur</p><p className="font-medium text-sm">{DECLENCHEUR_LABELS[planning.declencheur ?? ''] || planning.declencheur || 'Manuel'}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-role-primary shrink-0" />
                    <div><p className="text-xs text-muted-foreground">Année cible</p><p className="font-medium text-sm">{planning.annee_cible}</p></div>
                  </div>
                </div>
                {planning.objectifs && (
                  <div className="mt-4 p-3 rounded-lg bg-role-primary-soft/40 border border-role-primary/20">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Objectifs</p>
                    <p className="text-sm text-foreground">{planning.objectifs}</p>
                  </div>
                )}
              </Card>

              {/* Équipe */}
              <Card title="Équipe de surveillance">
                <div className="space-y-2">
                  {chef && (
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-full bg-role-gradient !text-white text-xs flex items-center justify-center font-bold shrink-0">
                        {getInitiales(chef.prenom, chef.nom)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{chef.prenom} {chef.nom}</p>
                        <p className="text-xs text-muted-foreground">Chef d&apos;équipe</p>
                      </div>
                      <Star className="w-4 h-4 text-warning shrink-0" />
                    </div>
                  )}
                  {(planning.equipe_ids ?? []).map(id => {
                    const insp = utilisateurs.find(u => u.id === id)
                    if (!insp || id === planning.chef_id) return null
                    return (
                      <div key={id} className="flex items-center gap-2 pl-1">
                        <span className="w-8 h-8 rounded-full bg-role-gradient !text-white text-xs flex items-center justify-center font-bold shrink-0">
                          {getInitiales(insp.prenom, insp.nom)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{insp.prenom} {insp.nom}</p>
                          <p className="text-xs text-muted-foreground">Inspecteur</p>
                        </div>
                      </div>
                    )
                  })}
                  {!chef && (planning.equipe_ids?.length ?? 0) === 0 && (
                    <p className="text-xs text-muted-foreground py-2">Aucune équipe désignée pour le moment.</p>
                  )}
                </div>
              </Card>

              {/* Domaines surveillés */}
              <Card title="Domaines surveillés">
                {planning.portee?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {planning.portee.map(code => {
                      const expanded = expandDomaines([code])
                      if (expanded.length > 1) {
                        return expanded.map(c => (
                          <span key={c} className="badge outline" title={getDomaineLabel(c)}>{c}</span>
                        ))
                      }
                      return <span key={code} className="badge outline" title={getDomaineLabel(code)}>{code}</span>
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Aucun domaine spécifié.</p>
                )}
              </Card>

              {/* État de la préparation */}
              <div>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-role-primary" />
                    État de la préparation de la surveillance
                  </p>
                  <span className={`badge ${progressionPrepa === 100 ? 'success' : 'warning'}`}>
                    {etapesFaites}/{etats.length} — {progressionPrepa}%
                  </span>
                </div>
                <div className="progress h-1.5 mb-3">
                  <div className={`progress-bar ${progressionPrepa === 100 ? 'bg-success' : progressionPrepa >= 50 ? 'bg-warning' : 'bg-role-primary'}`} style={{ width: `${progressionPrepa}%` }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {etats.map(etat => (
                    <div key={etat.cle} className={`flex items-start gap-2.5 p-2.5 rounded-lg border ${etat.ok ? 'border-success/40 bg-success/5' : 'border-border bg-muted/20'}`}>
                      {etat.ok
                        ? <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
                        : <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${etat.ok ? 'text-success' : 'text-foreground'}`}>{etat.label}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{etat.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Briefing */}
              {briefing && (
                <div className="p-4 rounded-xl border border-role-primary/30 bg-role-primary-soft/30">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-role-primary" />
                      Fiche de briefing — {briefing.reference}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      Confiance IA : {briefing.confiance}% · {formatDate(briefing.genere_le)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div><p className="font-medium text-muted-foreground mb-1">Objectifs</p><ul className="space-y-0.5">{briefing.objectifs?.map((o, i) => <li key={i} className="text-foreground">• {o}</li>)}</ul></div>
                    <div><p className="font-medium text-muted-foreground mb-1">Portée</p><div className="flex flex-wrap gap-1">{briefing.portee?.map((p, i) => <span key={i} className="code-oaci-badge text-[9px]">{p}</span>)}</div></div>
                    {briefing.points_attention?.length > 0 && (
                      <div><p className="font-medium text-warning mb-1">Points d&apos;attention</p><ul className="space-y-0.5">{briefing.points_attention.map((pa, i) => <li key={i} className="text-foreground">• {pa}</li>)}</ul></div>
                    )}
                    {briefing.recommandations?.length > 0 && (
                      <div><p className="font-medium text-role-primary mb-1">Recommandations</p><ul className="space-y-0.5">{briefing.recommandations.map((r, i) => <li key={i} className="text-foreground">• {r}</li>)}</ul></div>
                    )}
                  </div>
                </div>
              )}

              {/* Écarts actifs */}
              {ecartsActifs.length > 0 && (
                <div>
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-warning" />
                    {ecartsActifs.length} écart(s) actif(s) pour cet aérodrome {nbEcartsCritiques > 0 && <span className="badge danger text-[9px]">{nbEcartsCritiques} critique(s)</span>}
                  </p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {ecartsActifs.slice(0, 8).map(ec => (
                      <div key={ec.id} className="flex items-center gap-2 text-xs p-1.5 rounded-lg border border-border bg-background">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                        <span className="truncate flex-1">{ec.ref_reglementaire || ec.reference} — {ec.libelle || 'Écart'}</span>
                        {ec.pac && <span className="badge success text-[9px]">PAC</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Surveillance liée */}
              {survLiee && (
                <div className={`p-4 rounded-xl border ${survLiee.statut === 'rapport_signe' ? 'border-success/40 bg-success/5' : 'border-role-primary/30 bg-role-primary-soft/30'}`}>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
                    <Send className="w-4 h-4 text-role-primary" />
                    Surveillance liée — {survLiee.type?.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Statut : <span className="font-medium capitalize">{survLiee.statut?.replace(/_/g, ' ')}</span>
                    {survLiee.progression !== undefined && <span className="ml-2">Progression : {survLiee.progression}%</span>}
                  </p>
                  {survLiee.progression !== undefined && (
                    <div className="progress h-1.5"><div className="progress-bar" style={{ width: `${survLiee.progression}%` }} /></div>
                  )}
                  <button
                    className="btn btn-primary btn-sm gap-1.5 mt-3"
                    onClick={() => { onClose(); router.push(`/surveillance/${survLiee.id}`) }}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Ouvrir la surveillance
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="modal-footer border-t border-border flex justify-between gap-3 flex-wrap">
              <div className="flex gap-2">
                <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                {onPrepare && !isLancee && (
                  <button className="btn btn-secondary gap-2" onClick={() => { onClose(); onPrepare(planning) }}>
                    <PlayCircle className="w-4 h-4" />
                    Préparer la surveillance
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {planning.checklist_hierarchy?.length || isLancee ? (
                  <button className="btn btn-primary gap-2" onClick={() => {
                    onClose()
                    if (isLancee && survLiee) router.push(`/surveillance/${survLiee.id}`)
                    else router.push(`/preparation-checklist/${planning.id}`)
                  }}>
                    <ClipboardList className="w-4 h-4" />
                    {isLancee ? 'Ouvrir la surveillance' : 'Ouvrir la checklist de préparation'}
                  </button>
                ) : null}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>,
    document.body
  )
}