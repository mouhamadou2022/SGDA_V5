// components/ia/AerorisqAnalyse.tsx
// Composant AERORISQ — affiche les analyses des engines dans n'importe quel module

'use client'

import { useState, useEffect, useRef } from 'react'
import { Brain, Shield, AlertTriangle, UserCheck, Target, ChevronDown, ChevronRight, Loader2, FileText, Bell, Zap } from 'lucide-react'
import { useDecisionEngine } from '@/hooks/useDecisionEngine'
import { useAppStore } from '@/lib/store'
import { decisionEngine } from '@/lib/ia/decisionEngine'
import { Card } from '@/components/ui/card'
import { verifierDeclencheursAutomatiques, genererMessageNotification } from '@/lib/ia/autoTriggerEngine'

interface AerorisqAnalyseProps {
  aerodromeId: string | null
  compact?: boolean
}

function getUrgenceColor(urgence: string): string {
  switch (urgence) {
    case 'immediate': return 'text-danger'
    case '3_mois': return 'text-warning'
    case '6_mois': return 'text-info'
    default: return 'text-muted-foreground'
  }
}

function getUrgenceBadge(urgence: string): string {
  switch (urgence) {
    case 'immediate': return 'bg-danger text-white px-1.5 py-0.5 rounded text-[10px] font-bold'
    case '3_mois': return 'bg-warning text-white px-1.5 py-0.5 rounded text-[10px] font-bold'
    default: return 'bg-muted px-1.5 py-0.5 rounded text-[10px]'
  }
}

export default function AerorisqAnalyse({ aerodromeId, compact = false }: AerorisqAnalyseProps) {
  const [expanded, setExpanded] = useState(false)
  const [autoDeclenche, setAutoDeclenche] = useState(false)
  const [notificationEnvoyee, setNotificationEnvoyee] = useState(false)
  const analysis = useDecisionEngine(aerodromeId)
  const aerodrome = useAppStore(s => aerodromeId ? s.aerodromes.find(a => a.id === aerodromeId) : null)
  const utilisateurs = useAppStore(s => s.utilisateurs)
  const addNotification = useAppStore(s => s.addNotification)
  const addSurveillance = useAppStore(s => s.addSurveillance)
  const hasTriggered = useRef(false)

  // Auto-déclenchement : une seule fois par analyse
  useEffect(() => {
    if (!analysis || !aerodrome || hasTriggered.current) return
    const result = verifierDeclencheursAutomatiques(analysis, aerodrome, utilisateurs)
    if (!result) return

    hasTriggered.current = true
    setAutoDeclenche(true)

    // Notification in-app + email aux inspecteurs concernés
    const msg = genererMessageNotification(aerodrome, result)
    const inspecteurs = utilisateurs.filter(u => u.role === 'inspector' && u.statut === 'actif')
    for (const ins of inspecteurs) {
      addNotification({
        user_id: ins.id,
        title: msg.titre,
        message: msg.message,
        canal: 'email_sms',
        type: 'danger',
        link: `/aerodromes/${aerodrome.id}`,
      })
    }
    setNotificationEnvoyee(true)

    // Création automatique de la surveillance d'urgence
    if (result.surveillancePreRemplie) {
      const s = result.surveillancePreRemplie
      addSurveillance({
        aerodrome_id: aerodrome.id,
        type: s.type,
        portee: s.portee,
        equipe_ids: s.equipe_ids,
        chef_id: s.equipe_ids[0] || '',
        date_debut: new Date(Date.now() + 86400000).toISOString(), // demain
        date_fin: new Date(Date.now() + 7 * 86400000).toISOString(), // +7 jours
        statut: 'planifiee',
        justification_declenchement: s.justification,
        observations: 'Créée automatiquement par AERORISQ (mode autonome)',
      })
    }
  }, [analysis, aerodrome, utilisateurs, addNotification, addSurveillance])

  if (!analysis) return null

  const { profil, conformite, certificat, recommandations, declencheurs, portee } = analysis

  const telechargerRapport = () => {
    const html = decisionEngine.genererRapport(analysis, {
      aerodrome: { nom: aerodrome?.nom || 'Inconnu', code_oaci: aerodrome?.code_oaci || '' },
      typeSurveillance: 'Analyse AERORISQ',
      equipeNom: analysis.equipe.chefPropose || analysis.equipe.inspecteurs.map(i => `${i.prenom} ${i.nom}`).join(', ') || 'Non renseignée',
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rapport_${aerodrome?.code_oaci || 'aerodrome'}_${new Date().toISOString().slice(0, 10)}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const declencheursUrgents = declencheurs.filter(d => d.urgence === 'elevee')
  const alerteActive = declencheursUrgents.length > 0 || certificat.action === 'retirer'

  return (
    <Card role={alerteActive ? 'alert' : 'role'} alertBg="danger">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 gap-2"
      >
        <div className="flex items-center gap-2">
          {alerteActive
            ? <AlertTriangle className="w-4 h-4 text-danger" />
            : <Brain className="w-4 h-4 text-role-primary" />}
          <span className="text-sm font-semibold text-foreground">
            AERORISQ
            {alerteActive && <span className="ml-2 text-[10px] text-danger">Alerte active</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {profil.niveau} · {conformite.conformiteGlobale}%
          </span>
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </div>
      </button>

      {/* Bannière auto-déclenchement */}
      {autoDeclenche && (
        <div className="mx-3 mb-2 p-2.5 rounded-lg bg-danger-soft border border-danger/30 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-danger" />
            <span className="font-semibold text-danger">Déclenchement automatique AERORISQ</span>
          </div>
          <p className="text-foreground">Une alerte a été envoyée aux inspecteurs concernés.</p>
          {notificationEnvoyee && (
            <p className="text-muted-foreground flex items-center gap-1">
              <Bell className="h-3 w-3" /> Notification email + in-app envoyée
            </p>
          )}
        </div>
      )}

      {expanded && (
        <div className="px-3 pb-3 space-y-3 text-xs">
          {/* Profil de risque */}
          <div className="p-2 bg-role-primary-soft rounded">
            <p className="font-semibold flex items-center gap-1"><Shield className="w-3 h-3" /> Profil</p>
            <p>Score: {profil.score}/100 · {profil.niveau} · Tendance: {profil.tendance}</p>
            {profil.domainesFaibles.length > 0 && (
              <p className="text-warning">{profil.domainesFaibles.map(d => `${d.code}=${d.valeur}`).join(', ')}</p>
            )}
          </div>

          {/* Certificat */}
          <div className="p-2 bg-role-primary-soft rounded">
            <p className="font-semibold flex items-center gap-1"><Target className="w-3 h-3" /> Certificat</p>
            <p>{certificat.action} — {certificat.justification}</p>
            {certificat.conditions?.map((c, i) => (
              <p key={i} className="text-warning ml-2">- {c}</p>
            ))}
          </div>

          {/* Déclencheurs */}
          {declencheurs.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Declencheurs</p>
              {declencheurs.map((d, i) => (
                <p key={i} className={`${d.urgence === 'elevee' ? 'text-danger' : 'text-muted-foreground'}`}>
                  {d.type}: {d.description}
                </p>
              ))}
            </div>
          )}

          {/* Recommandations */}
          {recommandations.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Recommandations</p>
              {recommandations.slice(0, compact ? 3 : 5).map((r, i) => (
                <div key={i} className="flex items-start gap-2 mb-1">
                  <span className={getUrgenceBadge(r.urgence)}>{r.urgence}</span>
                  <span>{r.action}</span>
                </div>
              ))}
            </div>
          )}

          {/* Portée suggérée */}
          {portee.domaines.length > 0 && (
            <div className="p-2 bg-role-primary-soft rounded">
              <p className="font-semibold">Portee suggeree: {portee.domaines.join(', ')}</p>
              {portee.objectifs.slice(0, 3).map((o, i) => (
                <p key={i} className="ml-2">- {o}</p>
              ))}
            </div>
          )}

          {/* Télécharger le rapport */}
          <button
            type="button"
            onClick={telechargerRapport}
            className="w-full flex items-center justify-center gap-2 p-2 text-xs font-medium text-role-primary border border-role-primary/30 rounded-lg hover:bg-role-primary-soft transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Télécharger le rapport d'inspection (HTML)
          </button>

          {/* Statut du learning */}
          <p className="text-[9px] text-muted-foreground text-right">
            AERORISQ v1 · Engine feedback actif
          </p>
        </div>
      )}
    </Card>
  )
}
