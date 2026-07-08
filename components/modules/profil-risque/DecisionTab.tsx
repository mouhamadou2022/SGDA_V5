// components/modules/profil-risque/DecisionTab.tsx
// Vue DG — Data-Driven Decision Making. Masque les détails techniques ML.
// Score, niveau, tendance, alertes clés, écarts, recommandations actionnables.

'use client'

import { useMemo } from 'react'
import { ProfilRisque, EvenementSecurite, Ecart } from '@/lib/store'
import { getSgsMaturiteLabel } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { TrendingUp, TrendingDown, Minus, AlertTriangle, Shield, Target, Clock, BarChart3, CheckCircle2, Calendar } from 'lucide-react'
import { getRiskLevelBgVariant } from '@/lib/risque'
import { recommendationEngine } from '@/lib/ia/engines/recommendationEngine'
import RecommandationDuJourCard from './RecommandationDuJourCard'

interface Props {
  profil: ProfilRisque
  aerodromeCode: string
  aerodromeName: string
  nbEcartsCritiques: number
  userRole: string
  onRecalculate: () => void
  prochainesSurveillances?: any[]
  ecartsActifs?: any[]
  evenements?: EvenementSecurite[]
}

export default function DecisionTab({ profil, aerodromeCode, aerodromeName, nbEcartsCritiques, userRole, onRecalculate, prochainesSurveillances = [], ecartsActifs = [], evenements = [] }: Props) {
  const isDG = userRole === 'dg_anacim' || userRole === 'dg_operator' || userRole === 'focal_operator'

  const recommandationDuJour = useMemo(() => {
    try {
      return recommendationEngine.genererRecommandationDuJour(profil, ecartsActifs as Ecart[], evenements, aerodromeCode, aerodromeName)
    } catch {
      return null
    }
  }, [profil, ecartsActifs, evenements, aerodromeCode, aerodromeName])

  const getNiveauConfig = (score: number) => {
    if (score >= 80) return { label: 'Faible', color: 'text-success', bg: 'bg-success-soft', border: 'border-success/30', badge: 'badge success' }
    if (score >= 60) return { label: 'Moyen', color: 'text-primary', bg: 'bg-primary-soft', border: 'border-primary/30', badge: 'badge primary' }
    if (score >= 30) return { label: 'Élevé', color: 'text-warning', bg: 'bg-warning-soft', border: 'border-warning/30', badge: 'badge warning' }
    return { label: 'Critique', color: 'text-danger', bg: 'bg-danger-soft', border: 'border-danger/30', badge: 'badge danger' }
  }

  const config = getNiveauConfig(profil.score_global)

  // Construire les recommandations actionnables
  const recommandations: { id: string; label: string; icon: React.ElementType; priorite: 'critique' | 'haute' | 'moyenne' | 'basse'; action: string }[] = []
  
  if (isDG) {
    // Recommandations côté exploitant — actions qu'ils peuvent RÉELLEMENT faire
    if (nbEcartsCritiques > 0) recommandations.push({ id: 'pac', label: `${nbEcartsCritiques} PAC à soumettre`, icon: AlertTriangle, priorite: 'critique', action: 'Soumettre les plans d\'action corrective pour les écarts en attente' })
    if (profil.c2 < 40) recommandations.push({ id: 'preuves', label: 'Preuves à fournir', icon: CheckCircle2, priorite: 'haute', action: 'Rassembler et soumettre les preuves de mise en œuvre des PAC acceptés' })
    if (profil.score_global < 30) recommandations.push({ id: 'contact', label: 'Contacter votre inspecteur', icon: AlertTriangle, priorite: 'critique', action: 'Score critique — prenez contact avec l\'inspecteur ANACIM référent pour organiser une inspection' })
    if (profil.c3 < 50) recommandations.push({ id: 'preparer', label: 'Préparer les documents', icon: Shield, priorite: 'moyenne', action: 'Rassembler les registres, manuels et documents réglementaires avant la prochaine inspection' })
    if (profil.c5 < 50) recommandations.push({ id: 'incidents', label: 'Surveiller les incidents', icon: AlertTriangle, priorite: 'moyenne', action: 'Signaler tout incident de sécurité à l\'ANACIM et renforcer les mesures préventives' })
    if (profil.tendance === 'baisse') recommandations.push({ id: 'tendance', label: 'Votre score se dégrade', icon: TrendingDown, priorite: 'haute', action: 'Agissez avant que le score ne passe au niveau critique — les PAC en retard impactent directement votre évaluation' })
  } else {
    // Recommandations côté inspecteur
    if (profil.score_global < 30) recommandations.push({ id: 'score', label: 'Surveillance immédiate', icon: AlertTriangle, priorite: 'critique', action: 'Programmer une inspection complète dans les 7 jours' })
    if (profil.c1 < 40) recommandations.push({ id: 'sgs', label: 'Renforcer le SGS', icon: Shield, priorite: 'haute', action: 'Auditer les 4 piliers PAOE et identifier les lacunes de maturité' })
    if (profil.c2 < 40) recommandations.push({ id: 'pac', label: 'Accélérer les PAC', icon: Clock, priorite: 'haute', action: 'Vérifier l\'état d\'avancement des plans d\'action corrective' })
    if (profil.c3 < 50) recommandations.push({ id: 'conformite', label: 'Contrôler la conformité', icon: Target, priorite: 'moyenne', action: 'Inspecter les infrastructures critiques (piste, balisage, énergie)' })
    if (profil.c5 < 50) recommandations.push({ id: 'resilience', label: 'Améliorer la résilience', icon: Shield, priorite: 'moyenne', action: 'Analyser les incidents récents et renforcer les barrières de sécurité' })
    if (nbEcartsCritiques > 0) recommandations.push({ id: 'ecarts', label: `${nbEcartsCritiques} écart(s) critique(s)`, icon: AlertTriangle, priorite: 'critique', action: 'Traiter les écarts critiques avant la prochaine inspection' })
    if (profil.hmm_state?.isTransitioning) recommandations.push({ id: 'hmm', label: 'Transition silencieuse détectée', icon: TrendingDown, priorite: 'critique', action: `Agir avant J-${profil.hmm_state.daysToCritical} — l'aérodrome glisse vers un état critique` })
    if (profil.extreme_risk?.isHeavyTailed) recommandations.push({ id: 'evt', label: 'Risque extrême identifié', icon: AlertTriangle, priorite: 'haute', action: 'Préparer un plan d\'urgence — risque de queue lourde détecté' })
  }

  const prioriteOrder = { critique: 0, haute: 1, moyenne: 2, basse: 3 }
  recommandations.sort((a, b) => prioriteOrder[a.priorite] - prioriteOrder[b.priorite])

  const topRisks = recommandations.filter(r => r.priorite === 'critique' || r.priorite === 'haute')
  const otherRisks = recommandations.filter(r => r.priorite !== 'critique' && r.priorite !== 'haute')

  return (
    <div className="space-y-10">
      {/* Carte score principal */}
      <div className={`rounded-2xl border-2 ${config.border} ${config.bg} p-6`}>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="code-oaci-badge text-sm">{aerodromeCode}</span>
              <span className="text-sm text-foreground">{aerodromeName}</span>
            </div>
            <h1 className={`text-4xl font-bold ${config.color}`}>{profil.score_global}/100</h1>
            <span className={`badge ${config.badge} mt-1`}>Niveau {config.label}</span>
          </div>
          <div className="text-right text-sm">
            <div className="flex items-center gap-1.5 justify-end mb-1">
              <span className="text-foreground">Tendance :</span>
              {profil.tendance === 'hausse' ? <><TrendingUp className="w-4 h-4 text-success" /><span className="text-success">En amélioration</span></>
                : profil.tendance === 'baisse' ? <><TrendingDown className="w-4 h-4 text-danger" /><span className="text-danger font-semibold">En dégradation</span></>
                : <><Minus className="w-4 h-4 text-foreground" /><span className="text-foreground">Stable</span></>}
            </div>
            {profil.bayesian_black_swan && (
              <span className="badge danger animate-pulse text-xs">Black Swan détecté</span>
            )}
          </div>
        </div>

        {/* Radar simplifié */}
        <div className="mt-4 grid grid-cols-5 gap-2">
          {[
            { label: 'SGS', value: profil.c1 },
            { label: 'PAC', value: profil.c2 },
            { label: 'Conform.', value: profil.c3 },
            { label: 'Charge', value: profil.c4 },
            { label: 'Résilience', value: profil.c5 },
          ].map(c => (
            <div key={c.label} className="text-center">
              <div className="text-xs text-foreground mb-1">{c.label}</div>
              <div className="w-full bg-muted rounded-full h-2 mb-1">
                <div className={`h-2 rounded-full ${c.value < 40 ? 'bg-danger' : c.value < 60 ? 'bg-warning' : 'bg-success'}`}
                  style={{ width: `${c.value}%` }} />
              </div>
              <span className={`text-xs font-bold ${c.value < 40 ? 'text-danger' : c.value < 60 ? 'text-warning' : 'text-success'}`}>{c.value}{c.label === 'SGS' && <> <span className="text-xs text-foreground">({getSgsMaturiteLabel(c.value)})</span></>}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommandation du jour */}
      {recommandationDuJour && (
        <RecommandationDuJourCard recommandation={recommandationDuJour} />
      )}

      {/* Alertes immédiates */}
      {topRisks.length > 0 && (
        <Card variant="alert" alertBg="danger">
          <h3 className="text-sm font-bold text-danger mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />{isDG ? 'Actions recommandées' : 'Actions prioritaires'}
          </h3>
          <div className="space-y-3">
            {topRisks.map(r => (
              <div key={r.id} className="flex items-start gap-3 p-2 rounded-lg bg-background/70">
                <r.icon className={`w-4 h-4 mt-0.5 shrink-0 ${r.priorite === 'critique' ? 'text-danger' : 'text-warning'}`} />
                <div>
                  <p className="text-sm font-semibold text-foreground">{r.label}</p>
                  <p className="text-xs text-foreground">{r.action}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Autres recommandations */}
      {otherRisks.length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />Points de vigilance
          </h3>
          <div className="space-y-3">
            {otherRisks.map(r => (
              <div key={r.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
                <r.icon className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <p className="text-sm text-foreground">{r.label}</p>
                  <p className="text-xs text-foreground">{r.action}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Prédictions simplifiées */}
      <Card variant="role" title="Projection du risque" icon={<BarChart3 className="w-4 h-4" />}>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-foreground">3 mois</p>
            <p className={`text-lg font-bold ${profil.prediction_3m < 30 ? 'text-danger' : profil.prediction_3m < 60 ? 'text-warning' : 'text-success'}`}>
              {profil.prediction_3m}/100
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground">6 mois</p>
            <p className={`text-lg font-bold ${profil.prediction_6m < 30 ? 'text-danger' : profil.prediction_6m < 60 ? 'text-warning' : 'text-success'}`}>
              {profil.prediction_6m}/100
            </p>
          </div>
          <div>
            <p className="text-xs text-foreground">Scénario pire cas</p>
            <p className={`text-lg font-bold ${(profil.scenarios?.[3]?.scoreProjecte ?? profil.score_global) < 30 ? 'text-danger' : 'text-warning'}`}>
              {profil.scenarios?.[3]?.scoreProjecte ?? profil.score_global}/100
            </p>
          </div>
        </div>
        {profil.survival_metrics && (
          <div className="mt-3 pt-3 border-t border-border text-xs text-foreground text-center">
            Risque d'incident à 90 jours : {Math.round(profil.survival_metrics.hazard90d * 100)}%
            {profil.survival_metrics.hazard90d > 0.5 && <span className="text-danger font-semibold ml-1">— Inspection recommandée</span>}
          </div>
        )}
      </Card>

      {/* Écarts critiques */}
      {nbEcartsCritiques > 0 && (
        <div className="alert alert-danger">
          <AlertTriangle className="alert-icon" />
          <div className="alert-content">
            <div className="alert-title">{nbEcartsCritiques} écart(s) critique(s) non résolu(s)</div>
            <div className="alert-description">Ces écarts impactent directement le score de risque. Leur résolution est prioritaire.</div>
          </div>
        </div>
      )}

      {/* Rapport — admin only */}
      {userRole === 'admin' && (
        <div className="flex justify-end">
          <button className="btn btn-secondary gap-2 text-sm" onClick={onRecalculate}>
            <BarChart3 className="w-4 h-4" />Recalculer le profil
          </button>
        </div>
      )}

      {/* Prochaines surveillances (exploitant) */}
      {prochainesSurveillances.length > 0 && (
        <Card variant="role" title="Prochaines surveillances" icon={<Calendar className="w-4 h-4" />}>
          <div className="space-y-3">
            {prochainesSurveillances.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-foreground" />
                  <span className="capitalize text-foreground">{s.type?.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-xs text-foreground">
                  {s.date_debut ? new Date(s.date_debut).toLocaleDateString('fr-FR') : 'À planifier'}
                </span>
                <span className={`badge text-xs ${s.statut === 'en_cours' ? 'warning' : s.statut === 'realisee' ? 'success' : 'primary'}`}>
                  {s.statut === 'planifiee' ? 'Planifiée' : s.statut === 'en_cours' ? 'En cours' : 'Réalisée'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Écarts actifs (exploitant) */}
      {ecartsActifs.length > 0 && (
        <Card variant="role" title={`Écarts actifs (${ecartsActifs.length})`} icon={<AlertTriangle className="w-4 h-4" />}>
          <div className="space-y-3">
            {ecartsActifs.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${getRiskLevelBgVariant(e.niveau_risque)}`} />
                  <span className="text-foreground">{e.reference}</span>
                  <span className="text-xs text-foreground">{e.libelle?.substring(0, 50)}</span>
                </div>
                <span className={`badge text-xs ${e.statut === 'pac_attendu' ? 'warning' : e.statut === 'pac_accepte' ? 'primary' : e.statut === 'cloture' ? 'success' : 'outline'}`}>
                  {e.statut === 'pac_attendu' ? 'PAC requis' : e.statut === 'pac_accepte' ? 'PAC accepté' : e.statut}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
