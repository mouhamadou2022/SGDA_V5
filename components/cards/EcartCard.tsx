// components/cards/EcartCard.tsx
'use client'

import { useState } from 'react'
import { Brain } from 'lucide-react';
import {
  AlertTriangle, AlertOctagon, AlertCircle, Flame, Info,
  Calendar, Clock, Eye, FileText, CheckCircle2, PenSquare,
  Users, Send, History, Download, ChevronDown,
  Bell,
} from 'lucide-react'
import { plansActionsUtils } from '@/lib/plansActionsUtils'
import type { DomaineCode } from '@/lib/domaines'
import { getDomaineLabel, getDomaineInfo, DOMAINES_SURVEILLANCE } from '@/lib/domaines'
import { getCellColor } from '@/lib/risque'

interface EcartCardProps {
  ecart: any
  aerodrome?: any
  onViewDetails: () => void
  onEvaluate?: () => void
  onSubmitPAC?: () => void
  onSubmitPreuves?: () => void
  onViewHistory?: () => void
  onRappel?: () => void
  onTimeline?: () => void
  onIaEvaluate?: (pacData: any) => void;
  onValidationChef?: () => void;
  userRole: string
  userId: string
  urgent?: boolean
  compact?: boolean
  prioriteDynamique?: 'critique' | 'haute' | 'normale' | 'basse'
  raisonPriorite?: string
  hideDomaine?: boolean
  evalDraft?: any | null
}

export function EcartCard({
  ecart,
  aerodrome,
  onViewDetails,
  onEvaluate,
  onSubmitPAC,
  onSubmitPreuves,
  onViewHistory,
  onRappel,
  onTimeline,
  onIaEvaluate,
  onValidationChef,
  userRole,
  userId,
  urgent = false,
  compact = false,
  prioriteDynamique,
  raisonPriorite,
  hideDomaine = false,
  evalDraft,
}: EcartCardProps) {
  const [showMenu, setShowMenu] = useState(false)

  const getIconeNiveau = (niveau: string) => {
    switch (niveau) {
      case 'critique': return <Flame className="w-4 h-4 text-danger" />
      case 'eleve': return <AlertOctagon className="w-4 h-4 text-warning" />
      case 'moyen': return <AlertCircle className="w-4 h-4 text-role-primary" />
      case 'faible': return <Info className="w-4 h-4 text-success" />
      default: return <AlertTriangle className="w-4 h-4 text-role-primary" />
    }
  }

  const getBadgeNiveau = (niveau: string): { label: string; cls: string } => {
    const variants: Record<string, { label: string; cls: string }> = {
      critique: { label: 'Critique', cls: 'badge danger animate-pulse' },
      eleve: { label: 'Élevé', cls: 'badge warning' },
      moyen: { label: 'Moyen', cls: 'badge primary' },
      faible: { label: 'Faible', cls: 'badge success' },
    }
    return variants[niveau] || { label: niveau, cls: 'badge neutral' }
  }

  const getBadgeStatut = (statut: string): { label: string; cls: string } => {
    const variants: Record<string, { label: string; cls: string }> = {
      ouvert: { label: 'Ouvert', cls: 'badge danger' },
      pac_attendu: { label: 'PAC attendu', cls: 'badge warning' },
      pac_soumis: { label: 'PAC soumis', cls: 'badge primary' },
      pac_refuse: { label: 'PAC refusé', cls: 'badge danger' },
      pac_accepte: { label: 'PAC accepté', cls: 'badge success' },
      preuves_soumises: { label: 'Preuves soumises', cls: 'badge primary' },
      preuves_evaluees: { label: 'Preuves évaluées', cls: 'badge warning' },
      en_attente_validation_chef: { label: 'Attente validation chef', cls: 'badge warning animate-pulse' },
      en_retard: { label: 'En retard', cls: 'badge danger animate-pulse' },
      cloture: { label: 'Clôturé', cls: 'badge success' },
    }
    return variants[statut] || { label: statut, cls: 'badge neutral' }
  }

  const getBorderColor = (niveau: string, urgent: boolean, statut: string) => {
    if (urgent || niveau === 'critique') return 'border-l-danger'
    if (niveau === 'eleve') return 'border-l-warning'
    if (statut === 'cloture') return 'border-l-success'
    return 'border-l-role-primary'
  }

  const isValidOACI = (cellule: string | undefined | null): cellule is string => typeof cellule === 'string' && /^[1-5][A-E]$/.test(cellule);

  const niveauBadge = getBadgeNiveau(ecart.niveau_risque)
  const statutBadge = getBadgeStatut(ecart.statut)
  const borderColor = getBorderColor(ecart.niveau_risque, urgent, ecart.statut)
  const NiveauIcon = getIconeNiveau(ecart.niveau_risque)
  const domaineLabel = ecart.domaine || '';
  const domaineCode = DOMAINES_SURVEILLANCE.find((d: any) => d.code === domaineLabel)?.code ||
                     DOMAINES_SURVEILLANCE.find((d: any) => d.label === domaineLabel)?.code || undefined;
  const domaineInfo = domaineCode ? getDomaineInfo(domaineCode) : null

  const { jours, depasse } = plansActionsUtils.getDelaiRestant(ecart)
  const delaiCls = `badge ${depasse ? 'danger animate-pulse' : jours <= 7 ? 'warning' : 'success'} text-[10px]`

  const peutEvaluer = (userRole === 'inspector' || userRole === 'admin') &&
    ['pac_soumis', 'preuves_soumises'].includes(ecart.statut)
  const peutSoumettrePAC = (userRole === 'focal_operator' || userRole === 'dg_operator') &&
    ['ouvert', 'pac_refuse'].includes(ecart.statut)
  const peutSoumettrePreuves = (userRole === 'focal_operator' || userRole === 'dg_operator') &&
    ['pac_accepte', 'preuves_evaluees'].includes(ecart.statut)

  const getPrioriteDynamiqueBadge = () => {
    if (!prioriteDynamique) return null
    switch (prioriteDynamique) {
      case 'critique': return <span className="badge danger text-[9px] animate-pulse ml-1">Priorité critique</span>
      case 'haute': return <span className="badge warning text-[9px] ml-1">Priorité haute</span>
      default: return null
    }
  }

  if (compact) {
    return (
      <div
        className={`card p-3 hover:shadow-lg transition-all duration-300 border-l-4 ${borderColor}`}
        data-role={userRole}
      >
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className={`${niveauBadge.cls} flex items-center gap-1 text-[10px]`}>{NiveauIcon}</span>
            {isValidOACI(ecart.cellule_risque_oaci) && (
              <span
                className={`inline-flex items-center justify-center rounded font-bold text-[10px] px-1.5 py-0.5 font-mono ${getCellColor(ecart.cellule_risque_oaci)}`}
                title={`Matrice OACI : ${ecart.cellule_risque_oaci}${ecart.justification_risque_ia ? ' — ' + ecart.justification_risque_ia.slice(0, 80) + '…' : ''}`}
              >
                {ecart.cellule_risque_oaci}
              </span>
            )}
            <span className="code-oaci-badge text-xs">{ecart.reference}</span>
            {ecart.evaluation_pac && (
              <span className={`badge text-[9px] ${ecart.evaluation_pac.decision === 'accepte' ? 'success' : ecart.evaluation_pac.decision === 'reserve' ? 'warning' : 'danger'}`}>
                PAC {ecart.evaluation_pac.decision === 'accepte' ? '✓' : ecart.evaluation_pac.decision === 'reserve' ? '⚠' : '✗'}
              </span>
            )}
            {ecart.validation_preuves && (
              <span className={`badge text-[9px] ${ecart.validation_preuves.decision === 'valide' ? 'success' : ecart.validation_preuves.decision === 'reserve' ? 'warning' : 'danger'}`}>
                Preuves {ecart.validation_preuves.decision === 'valide' ? '✓' : ecart.validation_preuves.decision === 'reserve' ? '⚠' : '✗'}
              </span>
            )}
            {!hideDomaine && domaineCode && domaineInfo && (
              <span className="badge teal text-[9px]">{domaineCode}</span>
            )}
            {getPrioriteDynamiqueBadge()}
          </div>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-sm font-medium mb-2 line-clamp-2">{ecart.libelle}</p>
        <div className="flex items-center justify-between mt-2">
          <span className={delaiCls}>
            <Clock className="w-3 h-3 inline mr-1" />{jours}j
          </span>
          <div className="flex items-center gap-1">
            {ecart.statut === 'en_attente_validation_chef' && onValidationChef && (
              <button className="action-button hover:text-amber-600 hover:bg-amber-50 transition-all duration-200" onClick={onValidationChef} title="Valider l'évaluation">
                <CheckCircle2 className="w-3 h-3 text-amber-600" />
              </button>
            )}
            {onRappel && (
              <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onRappel} title="Envoyer un rappel">
                <Bell className="w-3 h-3" />
              </button>
            )}
            <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onViewDetails} title="Voir">
              <Eye className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`card hover:shadow-xl transition-all duration-300 border-l-4 ${borderColor}`}
      data-role={userRole}
    >
      <div className="card-content">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* En-tête badges */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`${niveauBadge.cls} flex items-center gap-1`}>
                {NiveauIcon}
                {ecart.niveau_risque.toUpperCase()}
              </span>
              {isValidOACI(ecart.cellule_risque_oaci) && (
                <span
                  className={`inline-flex items-center justify-center rounded font-bold text-xs px-2 py-0.5 font-mono tracking-wide ${getCellColor(ecart.cellule_risque_oaci)}`}
                  title={ecart.justification_risque_ia ?? `Indice OACI : ${ecart.cellule_risque_oaci}`}
                >
                  {ecart.cellule_risque_oaci}
                </span>
              )}
              <span className={statutBadge.cls}>{statutBadge.label}</span>
              {ecart.evaluation_pac && (
                <span className={`badge text-xs ${ecart.evaluation_pac.decision === 'accepte' ? 'success' : ecart.evaluation_pac.decision === 'reserve' ? 'warning' : 'danger'}`}>
                  PAC {ecart.evaluation_pac.decision === 'accepte' ? '✓' : ecart.evaluation_pac.decision === 'reserve' ? '⚠' : '✗'}
                </span>
              )}
              {ecart.validation_preuves && (
                <span className={`badge text-xs ${ecart.validation_preuves.decision === 'valide' ? 'success' : ecart.validation_preuves.decision === 'reserve' ? 'warning' : 'danger'}`}>
                  Preuves {ecart.validation_preuves.decision === 'valide' ? '✓' : ecart.validation_preuves.decision === 'reserve' ? '⚠' : '✗'}
                </span>
              )}
              <span className="code-oaci-badge text-xs">{ecart.reference}</span>
              {!hideDomaine && domaineCode && (
                <span className="badge teal">{domaineCode}</span>
              )}
            {getPrioriteDynamiqueBadge()}
              {evalDraft && (
                <span className="badge warning text-[9px] animate-pulse">Brouillon évaluation</span>
              )}
              {raisonPriorite && (
                <span className="text-[9px] text-muted-foreground" title={raisonPriorite}>
                  {raisonPriorite.substring(0, 30)}...
                </span>
              )}
            </div>

            {/* Titre */}
            <p className="text-sm font-semibold mb-1">{ecart.libelle}</p>
            <p className="text-xs text-muted-foreground mb-3">{ecart.ref_reglementaire}</p>

            {/* Délais */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="w-3 h-3 text-role-primary" />
                <span className="text-muted-foreground">Création:</span>
                <span className="font-medium">{new Date(ecart.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-3 h-3 text-role-primary" />
                <span className="text-muted-foreground">Échéance:</span>
                <span className={`font-medium ${depasse ? 'text-danger' : jours <= 7 ? 'text-warning' : 'text-success'}`}>
                  {new Date(ecart.delai_pac).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>

            {/* Progression de l'écart */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Progression</span>
                <span className="font-medium">{ecart.progression || 0}%</span>
              </div>
              <div className="progress h-1.5">
                <div className="progress-bar transition-all duration-500" style={{ width: `${ecart.progression || 0}%` }} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                {aerodrome && (
                  <span className="badge outline">{aerodrome.code_oaci}</span>
                )}
                {ecart.pac && (
                  <span className="badge outline">PAC v{ecart.pac.version}</span>
                )}
              </div>

              <div className="flex items-center gap-1 relative">
                <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onViewDetails} title="Voir">
                  <Eye className="w-4 h-4" />
                </button>
                {onIaEvaluate && ecart.pac && (
                  <button
                    type="button"
                    onClick={() => onIaEvaluate(ecart.pac)}
                    className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200"
                    title="Évaluer avec IA"
                  >
                    <Brain className="w-4 h-4" />
                  </button>
                )}
                {onRappel && (
                  <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onRappel} title="Envoyer un rappel">
                    <Bell className="w-4 h-4" />
                  </button>
                )}
                {onTimeline && (
                  <button className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" onClick={onTimeline} title="Voir la timeline">
                    <History className="w-4 h-4" />
                  </button>
                )}
                {peutEvaluer && onEvaluate && (
                  <button className={`action-button transition-all duration-200 ${evalDraft ? 'hover:text-warning hover:bg-warning/10' : 'hover:text-success hover:bg-success/10'}`} onClick={onEvaluate} title={evalDraft ? 'Modifier le brouillon' : 'Évaluer'}>
                    {evalDraft ? <PenSquare className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </button>
                )}
                {peutSoumettrePAC && onSubmitPAC && (
                  <button className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" onClick={onSubmitPAC} title="Soumettre PAC">
                    <Send className="w-4 h-4" />
                  </button>
                )}
                {peutSoumettrePreuves && onSubmitPreuves && (
                  <button className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" onClick={onSubmitPreuves} title="Soumettre preuves">
                    <FileText className="w-4 h-4" />
                  </button>
                )}
                {ecart.statut === 'en_attente_validation_chef' && onValidationChef && (
                  <button className="action-button hover:text-amber-600 hover:bg-amber-50 transition-all duration-200" onClick={onValidationChef} title="Valider l'évaluation">
                    <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  </button>
                )}
                {onViewHistory && (
                  <div className="relative inline-block">
                    <button className="action-button hover:bg-role-primary/10 transition-all duration-200" onClick={() => setShowMenu(v => !v)} title="Plus">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    {showMenu && (
                      <div
                        className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
                        onMouseLeave={() => setShowMenu(false)}
                      >
                        <button className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-role-primary-soft flex items-center gap-2" onClick={() => { onViewHistory(); setShowMenu(false) }}>
                          <History className="w-4 h-4" />
                          Voir historique
                        </button>
                        {ecart.pac && (
                          <button className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-role-primary-soft flex items-center gap-2" onClick={() => setShowMenu(false)}>
                            <Download className="w-4 h-4" />
                            Télécharger PAC
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
