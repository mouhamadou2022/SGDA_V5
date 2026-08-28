// components/modules/aerodromes/AdminInspecteurDashboard.tsx
'use client'

import React, { useState, useMemo } from 'react'
import {
  AlertOctagon, AlertTriangle, Brain, Building2, ChevronDown, ChevronRight, Clock,
  Gauge, History, Minus, Phone,
  Sparkles, Target, TrendingDown, TrendingUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import {
  useAppStore, Aerodrome, Certification, Homologation
} from '@/lib/store'
import { Card } from '@/components/ui/card'
import type { RiskAnalysisResult } from '@/lib/ia/agents/riskAgent'
import { getGraviteRisqueLabel } from '@/lib/evenementUtils'

interface Props {
  aerodrome: Aerodrome
  iaAnalysis: RiskAnalysisResult | null
  isLoadingIA: boolean
}

const SGS_LABELS: Record<number, string> = { 1: 'Absent', 2: 'Présent', 3: 'Approprié', 4: 'Opérationnel', 5: 'Efficace' }
const SGS_CLASSES: Record<number, string> = { 1: 'badge danger', 2: 'badge warning', 3: 'badge primary', 4: 'badge primary', 5: 'badge success' }

const getSgsNiveau = (score: number): number => {
  if (!score || score < 20) return 1
  if (score < 40) return 2
  if (score < 60) return 3
  if (score < 80) return 4
  return 5
}

const getTendanceIcon = (tendance?: string) => {
  switch (tendance) {
    case 'hausse': return <TrendingUp className="h-4 w-4 text-success" />
    case 'baisse': return <TrendingDown className="h-4 w-4 text-danger" />
    default: return <Minus className="h-4 w-4 text-muted-foreground" />
  }
}

function getCertifStatut(aerodrome: Aerodrome, certifications: Certification[], homologations: Homologation[]): { label: string; color: string; date?: string } {
  const certs = certifications.filter(c => c.aerodrome_id === aerodrome.id && c.statut_global !== 'archive')
  const homos = homologations.filter(h => h.aerodrome_id === aerodrome.id)

  if (aerodrome.type === 'international') {
    const active = certs.find(c => c.statut_global === 'certifie')
    if (active) return { label: 'Certifié', color: 'badge success', date: active.date_expiration }
    const ongoing = certs.find(c => c.statut_global === 'en_cours')
    if (ongoing) return { label: 'Certification en cours', color: 'badge warning' }
    return { label: 'Non certifié', color: 'badge neutral' }
  }
  const active = homos.find(h => true)
  if (active) return { label: 'Homologué', color: 'badge success' }
  const ongoing = homos.find(h => true)
  if (ongoing) return { label: 'Homologation en cours', color: 'badge warning' }
  return { label: 'Non homologué', color: 'badge neutral' }
}

function SectionToggle({ title, icon, defaultOpen, children, badge }: {
  title: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  return (
    <Card variant="role" headerGradient contentClassName="p-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-role-primary-soft/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-foreground">{title}</span>
          {badge}
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="p-4 pt-0 border-t border-border">{children}</div>}
    </Card>
  )
}

export default function AdminInspecteurDashboard({ aerodrome, iaAnalysis, isLoadingIA }: Props) {
  const ecarts = useAppStore(s => s.ecarts)
  const surveillances = useAppStore(s => s.surveillances)
  const certifications = useAppStore(s => s.certifications)
  const homologations = useAppStore(s => s.homologations)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const getProfilRisque = useAppStore(s => s.getProfilRisque)
  const profilRisque = getProfilRisque(aerodrome.id)
  const surveillancesAerodrome = surveillances.filter(s => s.aerodrome_id === aerodrome.id)
  const ecartsActifs = ecarts.filter(e => e.aerodrome_id === aerodrome.id && e.statut !== 'cloture')
  const ecartsRetard = ecartsActifs.filter(e => e.statut === 'en_retard' || (e.delai_pac && new Date(e.delai_pac) < new Date()))

  const personnelAerodrome = useMemo(() =>
    utilisateurs.filter(u => u.aerodrome_id === aerodrome.id && ['dg_operator', 'focal_operator', 'staff_operator'].includes(u.role)),
    [utilisateurs, aerodrome.id]
  )

  const predictions = iaAnalysis?.predictions
  const suggestions = iaAnalysis?.suggestions || []
  const proactiveAlert = iaAnalysis?.proactiveAlert
  const blackSwans = iaAnalysis?.blackSwans || []
  const survival = iaAnalysis?.survival
  const extremeValue = iaAnalysis?.extremeValue
  const hiddenMarkov = iaAnalysis?.hiddenMarkov
  const narrative = iaAnalysis?.aiAnalysis?.narrative
  const keyInsights = iaAnalysis?.aiAnalysis?.keyInsights
  const immediateActions = iaAnalysis?.aiAnalysis?.immediateActions
  const mediumTermActions = iaAnalysis?.aiAnalysis?.mediumTermActions

  const evenements = useAppStore(s => s.evenements)

  const realHistorique = useMemo(() => {
    const events: Array<{ id: string; date: string; action: string; details: string }> = []
    const maxEvents = 6
    surveillancesAerodrome.forEach(s => {
      events.push({ id: s.id, date: s.created_at, action: 'Surveillance', details: `${s.type} — ${(s as { objectifs?: string }).objectifs?.substring(0, 50) || ''}...` })
    })
    evenements.filter(e => e.aerodrome_id === aerodrome.id && ['critique', 'eleve', 'moyen'].includes(e.gravite || '')).forEach(e => {
      const label = getGraviteRisqueLabel(e.gravite)
      events.push({ id: e.id, date: e.date, action: `Événement ${label}`, details: `${e.type} — ${e.description?.substring(0, 50) || ''}...` })
    })
    ecarts.filter(e => e.aerodrome_id === aerodrome.id && ['critique', 'eleve'].includes(e.niveau_risque)).forEach(e => {
      events.push({ id: e.id, date: e.created_at, action: `Écart ${e.niveau_risque}`, details: e.libelle?.substring(0, 50) || '' })
    })
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, maxEvents)
  }, [aerodrome.id, surveillancesAerodrome, evenements, ecarts])

  const certifStatut = getCertifStatut(aerodrome, certifications, homologations)
  const sgsNiveau = getSgsNiveau(aerodrome.maturite_sgs)
  const sgsLabel = `${SGS_LABELS[sgsNiveau]} (N${sgsNiveau})`
  const sgsBadge = SGS_CLASSES[sgsNiveau]

  if (isLoadingIA && !iaAnalysis) {
    return (
      <div className="space-y-6 animate-fade-in py-8">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-muted-foreground">Analyse IA en cours...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in pb-8">

      {/* ── LIGNE 1 : 4 MINI-CARTES RÉSUMÉ ── */}
      <div className="grid grid-cols-4 gap-4">
        {profilRisque ? (
          <Card variant="level" levelColor={profilRisque.niveau === 'critique' ? 'danger' : profilRisque.niveau === 'eleve' ? 'warning' : profilRisque.niveau === 'moyen' ? 'teal' : 'success'} contentClassName="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Score risque</p>
            <p className={`text-3xl font-bold mt-1 ${profilRisque.niveau === 'critique' ? 'text-danger' : profilRisque.niveau === 'eleve' ? 'text-warning' : 'text-foreground'}`}>
              {profilRisque.score_global}%
            </p>
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className={`risk-badge ${profilRisque.niveau} text-[10px] px-1.5 py-0.5`}>
                {profilRisque.niveau}
              </span>
              {getTendanceIcon(profilRisque.tendance)}
            </div>
          </Card>
        ) : (
          <Card variant="level" levelColor="none" contentClassName="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Score risque</p>
            <p className="text-3xl font-bold mt-1 text-muted-foreground">N/A</p>
          </Card>
        )}

        <Card variant="level" levelColor="primary" contentClassName="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">SGS</p>
          <p className={`${sgsBadge} inline-block mt-1`}>{sgsLabel}</p>
          {aerodrome.statut_sgs === 'simplifie' && <p className="text-[10px] text-muted-foreground mt-0.5">Simplifié</p>}
          {aerodrome.statut_sgs === 'non_applicable' && <p className="text-[10px] text-muted-foreground mt-0.5">Non applicable</p>}
        </Card>

        <Card variant="level" levelColor={ecartsActifs.length > 0 ? (ecartsRetard.length > 0 ? 'danger' : 'warning') : 'success'} contentClassName="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Écarts actifs</p>
          <p className="text-3xl font-bold mt-1 text-foreground">{ecartsActifs.length}</p>
          {ecartsRetard.length > 0 && (
            <p className="text-[10px] text-danger mt-0.5">{ecartsRetard.length} PAC en retard</p>
          )}
        </Card>

        <Card variant="level" levelColor={certifStatut.color.includes('success') ? 'success' : certifStatut.color.includes('warning') ? 'warning' : 'none'} contentClassName="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Certification</p>
          <p className={`${certifStatut.color} inline-block mt-1`}>{certifStatut.label}</p>
          {certifStatut.date && (
            <p className="text-[10px] text-muted-foreground mt-0.5">Expire le {format(new Date(certifStatut.date), 'dd/MM/yyyy')}</p>
          )}
        </Card>
      </div>

      {/* ── ALERTES ── */}
      {((proactiveAlert && proactiveAlert.niveauUrgence !== 'info') || blackSwans.length > 0 || ecartsRetard.length > 0) && (
        <Card variant="alert" alertBg="danger" contentClassName="p-3 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertOctagon className="h-4 w-4 text-danger" />
            Alertes actives
            <span className="badge danger text-[10px]">{(proactiveAlert && proactiveAlert.niveauUrgence !== 'info' ? 1 : 0) + blackSwans.length + ecartsRetard.length}</span>
          </div>
          {ecartsRetard.length > 0 && (
            <p className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3 text-danger" />
              {ecartsRetard.length} PAC dépassée(s) — intervention requise
            </p>
          )}
          {proactiveAlert && proactiveAlert.niveauUrgence !== 'info' && (
            <p className="text-xs">{proactiveAlert.messageCourt} — {proactiveAlert.actionSuggerer}</p>
          )}
          {blackSwans.slice(0, 2).map((bs, i) => (
            <p key={i} className="text-xs">{bs.message}</p>
          ))}
        </Card>
      )}

      {/* ── AERORISQ — BLOC CENTRAL ── */}
      <Card variant="role" icon={<Brain className="h-5 w-5 text-role-primary" />} title="Analyse AERORISQ" headerGradient>
        {narrative ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground leading-relaxed">{narrative}</p>

            {keyInsights && keyInsights.length > 0 && (
              <SectionToggle title="Points clés" icon={<Sparkles className="h-4 w-4 text-role-primary" />} defaultOpen={true}>
                <ul className="space-y-1.5 mt-2">
                  {keyInsights.map((k, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-role-primary mt-0.5">•</span>
                      {k}
                    </li>
                  ))}
                </ul>
              </SectionToggle>
            )}

            {(immediateActions && immediateActions.length > 0) && (
              <SectionToggle title="Actions immédiates" icon={<AlertTriangle className="h-4 w-4 text-danger" />} defaultOpen={immediateActions.length > 0}>
                <ul className="space-y-1.5 mt-2">
                  {immediateActions.map((a, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-danger mt-0.5">⚠</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </SectionToggle>
            )}

            {mediumTermActions && mediumTermActions.length > 0 && (
              <SectionToggle title="Actions à moyen terme" icon={<Clock className="h-4 w-4 text-warning" />}>
                <ul className="space-y-1.5 mt-2">
                  {mediumTermActions.map((a, i) => (
                    <li key={i} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-warning mt-0.5">•</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </SectionToggle>
            )}

            {/* Prédictions */}
            {predictions && (
              <SectionToggle title="Prédictions" icon={<Target className="h-4 w-4 text-role-primary" />} defaultOpen={true}>
                <div className="grid grid-cols-3 gap-4 mt-2">
                  {[
                    { label: '3 mois', value: predictions.score3m, interval: predictions.intervals?.score3m },
                    { label: '6 mois', value: predictions.score6m, interval: predictions.intervals?.score6m },
                    { label: '12 mois', value: predictions.score12m, interval: predictions.intervals?.score12m },
                  ].map(p => (
                    <div key={p.label} className="text-center p-3 bg-role-primary-soft rounded-xl border border-role-primary-light">
                      <p className="text-xs text-muted-foreground">Dans {p.label}</p>
                      <p className="text-xl font-bold text-role-primary">{p.value}%</p>
                      {p.interval && (
                        <p className="text-[10px] text-muted-foreground">IC95%: [{p.interval[0]}–{p.interval[1]}]</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-center mt-2 text-muted-foreground">Confiance: {predictions.confidence}%</p>
              </SectionToggle>
            )}

            {/* Modèles avancés */}
            {(hiddenMarkov || survival || extremeValue) && (
              <SectionToggle title="Modèles avancés" icon={<Brain className="h-4 w-4 text-role-primary" />} defaultOpen={true}>
                <div className="space-y-2 mt-2">
                  {hiddenMarkov && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full ${hiddenMarkov.currentState === 'critical' ? 'bg-danger animate-pulse' : hiddenMarkov.currentState === 'degrading' ? 'bg-warning' : 'bg-success'}`} />
                      <span className="font-medium capitalize text-foreground">{hiddenMarkov.currentState}</span>
                      {hiddenMarkov.isTransitioning && <span className="badge warning text-[9px] animate-pulse">Transition</span>}
                      {hiddenMarkov.daysToCritical < 999 && <span className="text-xs text-muted-foreground">~{hiddenMarkov.daysToCritical}j avant critique</span>}
                    </div>
                  )}
                  {survival && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Hazard 90j: <strong className="text-danger">{survival.hazard90d}%</strong></span>
                      <span>Hazard 180j: <strong className="text-warning">{survival.hazard180d}%</strong></span>
                      <span>Médiane survie: <strong>{survival.medianDays}j</strong></span>
                    </div>
                  )}
                  {extremeValue && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Retour 1 an: <strong>{extremeValue.returnLevel1y}</strong></span>
                      {extremeValue.isHeavyTailed && <span className="badge danger text-[9px]">Queue lourde</span>}
                      <span>Risque extrême: <strong className="text-danger">{extremeValue.tailRisk}%</strong></span>
                    </div>
                  )}
                </div>
              </SectionToggle>
            )}

            {/* Recommandations */}
            {suggestions.length > 0 && (
              <SectionToggle title={`Recommandations (${suggestions.length})`} icon={<Sparkles className="h-4 w-4 text-role-primary" />}>
                <div className="space-y-2 mt-2">
                  {suggestions.slice(0, 5).map((s, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border-l-4 ${
                      s.priorite === 'critique' ? 'border-danger bg-danger/5' :
                      s.priorite === 'haute' ? 'border-warning bg-warning/5' :
                      'border-role-primary bg-role-primary-soft'
                    }`}>
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm text-foreground">{s.titre}</p>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          s.priorite === 'critique' ? 'bg-danger text-white' :
                          s.priorite === 'haute' ? 'bg-warning text-white' :
                          'bg-role-primary text-white'
                        }`}>{s.priorite}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                    </div>
                  ))}
                </div>
              </SectionToggle>
            )}

            {/* C1-C5 */}
            {profilRisque && (
              <SectionToggle title="Critères C1–C5" icon={<Gauge className="h-4 w-4 text-role-primary" />} defaultOpen={true}>
                <div className="space-y-2 mt-2">
                  {[
                    { key: 'c1', label: 'C1 — Maturité & Culture SGS', value: profilRisque.c1 },
                    { key: 'c2', label: 'C2 — Efficacité & Réactivité', value: profilRisque.c2 },
                    { key: 'c3', label: 'C3 — Conformité Technique', value: profilRisque.c3 },
                    { key: 'c4', label: 'C4 — Charge Critique Non Résolue', value: profilRisque.c4 },
                    { key: 'c5', label: 'C5 — Résilience & Historique Sécurité', value: profilRisque.c5 },
                  ].map(c => (
                    <div key={c.key}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="text-foreground">{c.label}</span>
                        <span className="font-medium text-foreground">{c.value || 0}/100</span>
                      </div>
                      <div className="progress h-1.5">
                        <div className="progress-bar" style={{ width: `${c.value || 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionToggle>
            )}

            {/* Signaux faibles / Black swans */}
            {blackSwans.length > 0 && (
              <SectionToggle title={`Signaux faibles (${blackSwans.length})`} icon={<AlertOctagon className="h-4 w-4 text-warning" />}>
                <div className="space-y-1.5 mt-2">
                  {blackSwans.map((bs, i) => (
                    <div key={i} className="p-2 bg-warning/10 rounded-lg text-xs text-foreground">{bs.message}</div>
                  ))}
                </div>
              </SectionToggle>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Analyse IA non disponible pour cet aérodrome</p>
          </div>
        )}
      </Card>

      {/* ── INFRASTRUCTURE & ÉQUIPEMENTS ── */}
      <Card variant="role" icon={<Building2 className="h-5 w-5 text-role-primary" />} title="Infrastructure & Équipements" headerGradient>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs text-role-primary uppercase font-semibold">Général</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium text-foreground">{aerodrome.type === 'international' ? 'International' : 'National'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Catégorie SSLIA</span><span className="font-medium text-foreground">{aerodrome.categorie_sslia || '-'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Région</span><span className="font-medium text-foreground">{aerodrome.region || '-'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Altitude</span><span className="font-medium text-foreground">{aerodrome.altitude || '-'} m</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Horaires</span><span className="font-medium text-foreground">{aerodrome.horaires === 'h24' ? 'H24' : aerodrome.horaires === 'jour' ? 'Jour uniquement' : '-'}</span></div>
              {aerodrome.aides_visuelles && aerodrome.aides_visuelles.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">Aides visuelles</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {aerodrome.aides_visuelles.map((a, i) => <span key={i} className="badge neutral text-[10px]">{a}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs text-role-primary uppercase font-semibold">Piste</p>
            {aerodrome.piste_principale && aerodrome.piste_principale.longueur > 0 ? (
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Longueur</span><span className="font-medium text-foreground">{aerodrome.piste_principale.longueur} m</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Largeur</span><span className="font-medium text-foreground">{aerodrome.piste_principale.largeur} m</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Revêtement</span><span className="font-medium text-foreground">{aerodrome.piste_principale.revetement}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Orientation</span><span className="font-medium text-foreground">{aerodrome.piste_principale.orientation}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Code réf.</span><span className="badge neutral text-[10px]">{aerodrome.piste_principale.code_reference}</span></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune donnée piste</p>
            )}
          </div>
        </div>
      </Card>

      {/* ── ACTIVITÉS RÉCENTES ── */}
      {realHistorique.length > 0 && (
        <Card variant="role" icon={<History className="h-5 w-5 text-role-primary" />} title="Activités récentes" headerGradient>
          <div className="timeline">
            {realHistorique.map(event => (
              <div key={event.id} className="timeline-item">
                <div className={`timeline-dot ${event.action.includes('Écart') ? 'timeline-dot-danger' : 'timeline-dot-success'}`} />
                <div className="timeline-content">
                  <div className="timeline-date text-muted-foreground">
                    {format(new Date(event.date), 'dd MMM yyyy', { locale: fr })}
                  </div>
                  <div className="timeline-title text-foreground">{event.action}</div>
                  <div className="timeline-description text-muted-foreground">{event.details}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── EXPLOITANT & CONTACTS (carte unique) ── */}
      {(aerodrome.exploitant_nom || aerodrome.exploitant_adresse || aerodrome.exploitant_telephone || personnelAerodrome.length > 0 || (aerodrome.contacts && aerodrome.contacts.length > 0)) && (
        <Card variant="role" title="Exploitant & contacts" headerGradient>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-xs text-role-primary uppercase font-semibold">Exploitant</p>
              {aerodrome.exploitant_nom && <p className="text-sm font-medium text-foreground">{aerodrome.exploitant_nom}</p>}
              {aerodrome.exploitant_adresse && <p className="text-xs text-muted-foreground">{aerodrome.exploitant_adresse}</p>}
              {aerodrome.exploitant_telephone && <p className="text-xs flex items-center gap-1 text-foreground"><Phone className="h-3 w-3 text-muted-foreground" />{aerodrome.exploitant_telephone}</p>}

              {aerodrome.contacts && aerodrome.contacts.length > 0 && (
                <div className="pt-2 border-t border-border space-y-2">
                  <p className="text-xs text-role-primary uppercase font-semibold">Contacts</p>
                  {aerodrome.contacts.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-role-primary flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                        {c.nom.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{c.nom}</p>
                        <p className="text-[10px] text-muted-foreground">{c.poste} · {c.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {personnelAerodrome.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs text-role-primary uppercase font-semibold">Personnel exploitant</p>
                <div className="space-y-2">
                  {personnelAerodrome.map(u => {
                    const roleLabel = u.role === 'dg_operator' ? 'DG Exploitant' : u.role === 'focal_operator' ? 'Point Focal' : 'Personnel'
                    return (
                      <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-role-primary-soft">
                        <div className="w-7 h-7 rounded-full bg-role-primary flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          {u.prenom?.[0]}{u.nom?.[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{u.prenom} {u.nom}</p>
                          <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

    </div>
  )
}
