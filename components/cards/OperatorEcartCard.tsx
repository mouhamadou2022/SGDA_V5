// components/cards/OperatorEcartCard.tsx
'use client'

import { AlertTriangle, Clock, Eye, Send, FileText } from 'lucide-react'

interface OperatorEcartCardProps {
  ecart: {
    id: string
    reference: string
    libelle: string
    niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible'
    statut: string
    delai_pac?: string
    aerodrome_code?: string
    date_creation: string
  }
  onViewDetails: () => void
  onSubmitPAC?: () => void
  onSubmitPreuves?: () => void
  userRole: string
  compact?: boolean
}

export function OperatorEcartCard({
  ecart,
  onViewDetails,
  onSubmitPAC,
  onSubmitPreuves,
  userRole,
  compact = false
}: OperatorEcartCardProps) {

  const niveauMap: Record<string, { label: string; cls: string }> = {
    critique: { label: 'Critique', cls: 'badge danger animate-pulse' },
    eleve:    { label: 'Élevé',    cls: 'badge warning' },
    moyen:    { label: 'Moyen',    cls: 'badge primary' },
    faible:   { label: 'Faible',   cls: 'badge success' },
  }

  const statutMap: Record<string, { label: string; cls: string }> = {
    ouvert:           { label: 'Ouvert',           cls: 'badge danger' },
    pac_attendu:      { label: 'PAC attendu',      cls: 'badge warning' },
    pac_soumis:       { label: 'PAC soumis',       cls: 'badge primary' },
    pac_refuse:       { label: 'PAC refusé',       cls: 'badge danger' },
    pac_accepte:      { label: 'PAC accepté',      cls: 'badge success' },
    preuves_soumises: { label: 'Preuves soumises', cls: 'badge primary' },
    cloture:          { label: 'Clôturé',          cls: 'badge success' },
  }

  const niveauBadge = niveauMap[ecart.niveau_risque] || { label: ecart.niveau_risque, cls: 'badge neutral' }
  const statutBadge = statutMap[ecart.statut] || { label: ecart.statut, cls: 'badge neutral' }
  const peutSoumettrePAC = ['ouvert', 'pac_refuse'].includes(ecart.statut)
  const peutSoumettrePreuves = ecart.statut === 'pac_accepte'
  const isOverdue = ecart.delai_pac && new Date(ecart.delai_pac) < new Date() && ecart.statut !== 'cloture'

  if (compact) {
    return (
      <div
        className={`card card-compact p-3 hover:shadow-lg transition-all duration-300 ${isOverdue ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-role-primary'}`}
        data-role={userRole}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="code-oaci-badge text-xs">{ecart.reference}</span>
          <span className={statutBadge.cls}>{statutBadge.label}</span>
        </div>
        <p className="text-sm font-medium line-clamp-1">{ecart.libelle}</p>
        {ecart.delai_pac && (
          <p className={`text-xs mt-1 ${isOverdue ? 'text-danger font-medium' : 'text-muted-foreground'}`}>
            Échéance: {new Date(ecart.delai_pac).toLocaleDateString('fr-FR')}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={`card hover:shadow-xl transition-all duration-300 ${isOverdue ? 'border-l-4 border-l-danger animate-pulse' : 'card-accent border-l-4 border-l-role-primary'}`}
      data-role={userRole}
    >
      <div className="card-content p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={niveauBadge.cls}>{niveauBadge.label}</span>
            <span className={statutBadge.cls}>{statutBadge.label}</span>
            <span className="code-oaci-badge">{ecart.reference}</span>
          </div>
          {ecart.aerodrome_code && (
            <span className="badge outline">{ecart.aerodrome_code}</span>
          )}
        </div>

        <h3 className="text-sm font-semibold mb-3 line-clamp-2">{ecart.libelle}</h3>

        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            <AlertTriangle className="w-3 h-3 text-role-primary" />
            <span>{new Date(ecart.date_creation).toLocaleDateString('fr-FR')}</span>
          </div>
          {ecart.delai_pac && (
            <div className={`flex items-center gap-1 ${isOverdue ? 'text-danger font-semibold' : 'text-muted-foreground'}`}>
              <Clock className="w-3 h-3 text-role-primary" />
              <span>{new Date(ecart.delai_pac).toLocaleDateString('fr-FR')}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button 
            className="action-button hover:text-role-primary hover:bg-role-primary/10 transition-all duration-200" 
            onClick={onViewDetails} 
            aria-label="Voir détails"
          >
            <Eye className="w-4 h-4" />
          </button>
          {peutSoumettrePAC && onSubmitPAC && (
            <button 
              className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
              onClick={onSubmitPAC} 
              aria-label="Soumettre PAC"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
          {peutSoumettrePreuves && onSubmitPreuves && (
            <button 
              className="action-button hover:text-primary hover:bg-primary/10 transition-all duration-200" 
              onClick={onSubmitPreuves} 
              aria-label="Soumettre preuves"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}