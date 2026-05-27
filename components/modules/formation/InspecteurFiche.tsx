// components/modules/formation/InspecteurFiche.tsx
'use client'

import { X, Mail, Phone, Award, Trash2, PenSquare } from 'lucide-react'
import { useState } from 'react'
import ConfirmationSuppressionAvancee from '../../modals/ConfirmationSuppressionAvancee'
import { useAppStore } from '../../../lib/store'

const DOMAINES_COMP = ['Exploitation', 'SLI', 'Génie Civil', 'Génie Élec.', 'Risque Anim.', 'Certification', 'Homologation']

const COULEURS_AVATAR = ['bg-primary', 'bg-success', 'bg-purple-500', 'bg-orange-500', 'bg-red-500', 'bg-teal-500', 'bg-indigo-500']

function cellColor(pct: number): string {
  if (pct >= 80) return 'bg-success text-white'
  if (pct >= 60) return 'bg-primary text-white'
  if (pct >= 40) return 'bg-warning text-white'
  if (pct >= 20) return 'bg-warning/70 text-foreground'
  return 'bg-muted text-muted-foreground'
}

const TYPE_LABELS: Record<string, string> = {
  inspecteur_principal: 'Inspecteur Principal',
  inspecteur_titulaire: 'Inspecteur Titulaire',
  cadre_technique: 'Cadre Technique',
}

interface Props {
  inspecteurId: string
  onClose: () => void
  onEdit?: () => void
  userRole?: string
}

export function InspecteurFiche({ inspecteurId, onClose, onEdit, userRole = 'inspector' }: Props) {
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const deleteInspecteur = (useAppStore as any)((s: any) => s.deleteInspecteur) as (id: string) => void
  const formations = useAppStore(s => s.formations)
  const surveillances = useAppStore(s => s.surveillances)
  const ecarts = useAppStore(s => s.ecarts)
  const inspecteurs = useAppStore(s => s.inspecteurs)
  const aerodromes = useAppStore(s => s.aerodromes)

  const inspecteur = inspecteurs.find(i => i.id === inspecteurId)

  let h = 0
  for (let i = 0; i < inspecteurId.length; i++) h = (h * 31 + inspecteurId.charCodeAt(i)) & 0xffffffff
  const couleurAvatar = COULEURS_AVATAR[Math.abs(h) % COULEURS_AVATAR.length]
  const initiales = inspecteur ? `${inspecteur.prenom[0]}${inspecteur.nom[0]}` : '??'

  // Formations réelles liées à cet inspecteur
  const formationsLiees = formations.filter(f => f.participants?.includes(inspecteurId))

  // Surveillances récentes (missions)
  const missionsRecentes = surveillances
    .filter(s => s.equipe_ids?.includes(inspecteurId))
    .sort((a, b) => b.date_debut.localeCompare(a.date_debut))
    .slice(0, 5)
    .map(s => {
      const aero = aerodromes.find(a => a.id === s.aerodrome_id)
      return { aerodrome: aero ? `${aero.nom} (${aero.code_oaci})` : s.aerodrome_id, date: s.date_debut, type: s.type }
    })
  
  const handleDelete = () => {
    setIsDeleting(true)
    deleteInspecteur(inspecteurId)
    setShowDeleteModal(false)
    setIsDeleting(false)
    onClose()
  }

  const getCascadeItems = () => {
    const relatedFormations = formations.filter(f =>
      f.participants?.includes(inspecteurId) && f.statut !== 'terminee'
    )
    const archivedFormations = formations.filter(f =>
      f.participants?.includes(inspecteurId) && f.statut === 'terminee'
    )
    const relatedSurveillances = surveillances.filter(s =>
      s.equipe_ids?.includes(inspecteurId) && !['archivee', 'terminee'].includes(s.statut)
    )
    const relatedEcarts = ecarts.filter(e =>
      e.responsable_id === inspecteurId && !['resolu', 'archive'].includes(e.statut)
    )

    return [
      { type: 'Formations', count: relatedFormations.length, status: 'en_cours/planifiee', action: 'Retiré des participants' },
      { type: 'Formations', count: archivedFormations.length, status: 'terminée', kept: true },
      { type: 'Surveillances', count: relatedSurveillances.length, status: 'en_cours/planifiee', action: 'Retiré de l\'équipe' },
      { type: 'Écarts', count: relatedEcarts.length, status: 'ouvert/en_cours', action: 'Responsable supprimé' }
    ].filter(item => item.count > 0)
  }

  if (!inspecteur) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content max-w-md" onClick={e => e.stopPropagation()}>
          <div className="modal-body text-center py-8 text-muted-foreground">
            Inspecteur introuvable.
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      </div>
    )
  }

  // Calcul taux de charge : surveillances actives / max 5
  const survActives = surveillances.filter(s => s.equipe_ids?.includes(inspecteurId) && !['archivee', 'transmise'].includes(s.statut)).length
  const tauxCharge = Math.min(100, Math.round((survActives / 5) * 100))

  return (
    <div className="modal-overlay" data-role={userRole} onClick={onClose}>
      <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <Award className="w-5 h-5 text-role-primary" />
            Fiche Inspecteur
          </div>
          <div className="flex items-center gap-2">
            {onEdit && (
              <button
                className="btn btn-ghost hover:text-primary hover:bg-primary/10 transition-all duration-200"
                onClick={() => { onClose(); onEdit(); }}
                title="Modifier l'inspecteur"
              >
                <PenSquare className="w-4 h-4" />
              </button>
            )}
            <button
              className="btn btn-ghost hover:text-danger hover:bg-danger/10 transition-all duration-200"
              onClick={() => setShowDeleteModal(true)}
              title="Supprimer l'inspecteur"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button className="modal-close" onClick={onClose}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="modal-body space-y-5">
          {/* Avatar + Infos */}
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full ${couleurAvatar} flex items-center justify-center text-white text-xl font-bold`}>
              {initiales}
            </div>
            <div>
              <p className="heading-4">{inspecteur.prenom} {inspecteur.nom}</p>
              <span className="badge primary">{TYPE_LABELS[inspecteur.type] ?? inspecteur.type}</span>
              <p className="text-small text-muted-foreground mt-1 flex items-center gap-1"><Mail className="w-3 h-3" /> {inspecteur.email}</p>
              {inspecteur.telephone && (
                <p className="text-small text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> {inspecteur.telephone}</p>
              )}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Compétences */}
          <div>
            <p className="font-semibold mb-3 text-role-primary">Compétences</p>
            {inspecteur.competences && inspecteur.competences.length > 0 ? (
              <div className="space-y-2">
                {inspecteur.competences.map((c) => {
                  const niveauPct = c.niveau === 'inspecteur_principal' ? 100 : c.niveau === 'inspecteur_titulaire' ? 66 : 33
                  return (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="w-28 text-small font-medium truncate">{DOMAINES_COMP.find(d => d.toLowerCase().startsWith(c.domaine.slice(0, 4))) ?? c.domaine}</span>
                      <div className="progress flex-1 h-2">
                        <div className="progress-bar" style={{ width: `${niveauPct}%` }} />
                      </div>
                      <span className={`text-xs px-1 rounded ${cellColor(niveauPct)}`}>
                        {c.niveau === 'inspecteur_principal' ? 'IP' : c.niveau === 'inspecteur_titulaire' ? 'IT' : 'CT'}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-small text-muted-foreground italic">Aucune compétence enregistrée.</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Formations */}
          <div>
            <p className="font-semibold mb-3 text-role-primary">Formations ({formationsLiees.length})</p>
            {formationsLiees.length > 0 ? (
              <div className="space-y-2">
                {formationsLiees.slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-center justify-between text-small">
                    <span>{f.titre}</span>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${f.statut === 'terminee' ? 'success' : f.statut === 'annulee' ? 'danger' : 'primary'}`}>
                        {f.statut === 'terminee' ? 'Terminée' : f.statut === 'annulee' ? 'Annulée' : f.statut === 'en_cours' ? 'En cours' : 'Planifiée'}
                      </span>
                      <span className="text-muted-foreground">{new Date(f.date).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-small text-muted-foreground italic">Aucune formation enregistrée.</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Missions récentes */}
          <div>
            <p className="font-semibold mb-3 text-role-primary">Missions récentes</p>
            {missionsRecentes.length > 0 ? (
              <div className="space-y-2">
                {missionsRecentes.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-small">
                    <span className="font-medium">{m.aerodrome}</span>
                    <div className="flex items-center gap-2">
                      <span className="badge outline text-xs">{m.type}</span>
                      <span className="text-muted-foreground">{new Date(m.date).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-small text-muted-foreground italic">Aucune mission enregistrée.</p>
            )}
          </div>

          <div className="border-t border-border" />

          {/* Taux de charge */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-role-primary">Taux de charge</p>
              <span className={`font-bold text-sm ${tauxCharge > 80 ? 'text-danger' : tauxCharge > 50 ? 'text-warning' : 'text-success'}`}>
                {tauxCharge}%
              </span>
            </div>
            <div className={`progress h-3 ${tauxCharge > 80 ? 'progress-critique' : tauxCharge > 50 ? 'progress-eleve' : 'progress-moyen'}`}>
              <div className="progress-bar" style={{ width: `${tauxCharge}%` }} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>

        {/* Modale de suppression avec cascade */}
        <ConfirmationSuppressionAvancee
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          entity="inspecteur"
          entityName={`${inspecteur.prenom} ${inspecteur.nom}`}
          cascadeItems={getCascadeItems()}
          isLoading={isDeleting}
        />
      </div>
    </div>
  )
}

export default InspecteurFiche