'use client'

import { useAppStore } from '@/lib/store'
import { FolderOpen, X, Plus, Edit3, CheckCircle2, Trash2, Clock, User, FileText } from 'lucide-react'
import { FormShell } from '@/components/ui/FormShell'

interface HistoriqueDossierModalProps {
  isOpen: boolean
  onClose: () => void
  dossierId: string
  userRole: string
}

export function HistoriqueDossierModal({ isOpen, onClose, dossierId, userRole }: HistoriqueDossierModalProps) {
  const dossiers = useAppStore(s => s.dossiers)
  const dossier = dossiers?.find(d => d.id === dossierId)

  const getIconeAction = (action: string) => {
    switch(action) {
      case 'Création du dossier': return <Plus className="w-4 h-4" />
      case 'Modification du dossier': return <Edit3 className="w-4 h-4" />
      case 'Dossier terminé': return <CheckCircle2 className="w-4 h-4" />
      case 'Suppression': return <Trash2 className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const getCouleurAction = (action: string): string => {
    if (action.includes('Création')) return 'timeline-dot-success'
    if (action.includes('Modification')) return 'timeline-dot-warning'
    if (action.includes('terminé')) return 'timeline-dot-success'
    if (action.includes('Suppression')) return 'timeline-dot-danger'
    return 'timeline-dot'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <FormShell
      open={isOpen && !!dossier}
      onClose={onClose}
      title={dossier ? `Historique — ${dossier.reference}` : 'Historique'}
      icon={FolderOpen}
      size="3xl"
      dataRole={userRole}
      footer={
        <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
      }
    >
      {dossier && dossier.historique && dossier.historique.length > 0 ? (
        <div className="timeline max-h-[60vh] overflow-y-auto pr-2">
          {dossier.historique
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map((item, index) => (
              <div key={index} className="timeline-item">
                <div className={getCouleurAction(item.action)}>
                  {getIconeAction(item.action)}
                </div>
                <div className="timeline-content">
                  <div className="timeline-date">{formatDate(item.date)}</div>
                  <div className="timeline-title">{item.action}</div>
                  <div className="flex items-center gap-2 mt-1 text-small text-muted-foreground">
                    <User className="w-3 h-3" />
                    <span>{item.utilisateur}</span>
                  </div>
                  {item.commentaire && (
                    <div className="mt-2 text-small bg-role-primary-soft p-3 rounded-xl">
                      {item.commentaire}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Clock className="w-12 h-12 mx-auto mb-2 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Aucun historique disponible</p>
        </div>
      )}
    </FormShell>
  )
}
