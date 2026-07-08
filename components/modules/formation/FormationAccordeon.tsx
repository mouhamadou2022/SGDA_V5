// components/modules/formation/FormationAccordeon.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card'
import {
  GraduationCap,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Star,
  Plus,
  Download,
  Eye,
  Building2,
  X,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { AccordionSection, AccordionGroup } from '@/components/ui/AccordionSection';

interface FormationAccordeonProps {
  userRole: string;
}

const DOMAINES_LABELS: Record<string, string> = {
  exploitation: 'Exploitation (AGA)',
  sli: 'Sauvetage & Lutte Incendie',
  genie_civil: 'Génie Civil',
  genie_electrique: 'Génie Électrique',
  risque_animalier: 'Risque Animalier',
  certification: 'Certification',
  homologation: 'Homologation',
};

const TYPES_LABELS: Record<string, string> = {
  initiale: 'Initiale',
  continue: 'Continue',
  specialisee: 'Spécialisée',
  recyclage: 'Recyclage',
  certification: 'Certification',
};

const focusClass = "focus:outline-none focus:shadow-[0_0_0_2px_var(--role-primary)] focus:border-transparent transition-all"

function getValiditeStatut(dateStr?: string): 'valide' | 'expiree' | 'expire_bientot' | null {
  if (!dateStr) return null;
  const expire = new Date(dateStr);
  const now = new Date();
  const diff = (expire.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'expiree';
  if (diff <= 90) return 'expire_bientot';
  return 'valide';
}

function ValiditeBadge({ statut }: { statut: 'valide' | 'expiree' | 'expire_bientot' | null }) {
  if (!statut) return null;
  if (statut === 'valide') return (
    <span className="badge success inline-flex items-center gap-1">
      <CheckCircle2 className="w-3 h-3" /> Valide
    </span>
  );
  if (statut === 'expiree') return (
    <span className="badge danger inline-flex items-center gap-1">
      <AlertCircle className="w-3 h-3" /> Expirée
    </span>
  );
  return (
    <span className="badge warning inline-flex items-center gap-1">
      <AlertTriangle className="w-3 h-3" /> Expire bientôt
    </span>
  );
}


function getInitials(prenom: string, nom: string): string {
  return `${prenom?.[0] || ''}${nom?.[0] || ''}`.toUpperCase();
}

function getTypeLabel(type: string): string {
  return TYPES_LABELS[type] || type;
}

function getStatutBadge(statut: string) {
  const map: Record<string, string> = {
    planifiee: 'badge primary',
    en_cours: 'badge warning',
    terminee: 'badge success',
    annulee: 'badge danger',
  };
  const labels: Record<string, string> = {
    planifiee: 'Planifiée',
    en_cours: 'En cours',
    terminee: 'Terminée',
    annulee: 'Annulée',
  };
  return { cls: map[statut] || 'badge neutral', label: labels[statut] || statut };
}

export function FormationAccordeon({ userRole }: FormationAccordeonProps) {
  const formations = useAppStore(s => s.formations);
  const inspecteurs = useAppStore(s => s.inspecteurs);
  const getFormationsByInspecteur = useAppStore(s => s.getFormationsByInspecteur);
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedInspecteurId, setSelectedInspecteurId] = useState<string | null>(null);

  const listeInspecteurs = inspecteurs ?? [];

  const formationsParInspecteur = useMemo(() => {
    const result: Record<string, any[]> = {};
    listeInspecteurs.forEach((ins) => {
      result[ins.id] = getFormationsByInspecteur ? getFormationsByInspecteur(ins.id) : [];
    });
    return result;
  }, [listeInspecteurs, formations]);

  if (listeInspecteurs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground animate-fade-up" data-role={userRole}>
        Aucun inspecteur enregistré.
      </div>
    )
  }

  return (
    <AccordionGroup spacing="md" className="animate-fade-up" data-role={userRole} data-module="formation">
      {listeInspecteurs.map((ins) => {
        const formationsIns = formationsParInspecteur[ins.id] || [];
        const nbExpires = formationsIns.filter(
          (f) => getValiditeStatut(f.date_validite) === 'expiree'
        ).length;
        const nbExpireBientot = formationsIns.filter(
          (f) => getValiditeStatut(f.date_validite) === 'expire_bientot'
        ).length;

        return (
          <AccordionSection
            key={ins.id}
            icon={
              <div className="w-9 h-9 rounded-full bg-role-primary-soft flex items-center justify-center !text-white font-semibold text-sm shrink-0">
                {getInitials(ins.prenom, ins.nom)}
              </div>
            }
            title={`${ins.prenom} ${ins.nom}`}
            subtitle={`${ins.matricule} · ${ins.type === 'inspecteur_principal' ? 'Inspecteur Principal' :
              ins.type === 'inspecteur_titulaire' ? 'Inspecteur Titulaire' : 'Cadre Technique'}`}
            badges={
              <>
                <span className="badge outline">{formationsIns.length} formation(s)</span>
                {nbExpires > 0 && <span className="badge danger">{nbExpires} expirée(s)</span>}
                {nbExpireBientot > 0 && <span className="badge warning">{nbExpireBientot} à renouveler</span>}
                <span className={`badge ${ins.statut === 'en_service' ? 'success' : ins.statut === 'en_mission' ? 'primary' : 'neutral'}`}>
                  {ins.statut === 'en_service' ? 'En service' : ins.statut === 'en_mission' ? 'En mission' : ins.statut}
                </span>
              </>
            }
          >
            {formationsIns.length === 0 && (
              <p className="text-small text-muted-foreground italic py-2">
                Aucune formation enregistrée pour cet inspecteur.
              </p>
            )}

            {formationsIns.map((f) => {
              const validite = getValiditeStatut(f.date_validite);
              const { cls: statutCls, label: statutLabel } = getStatutBadge(f.statut);

              return (
                <Card key={f.id} className="border-border hover:shadow-role-glow transition-all">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-role-primary-soft shrink-0">
                        <GraduationCap className="w-4 h-4 text-role-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="code-oaci-badge text-xs">{f.reference}</span>
                          <span className={statutCls}>{statutLabel}</span>
                          <span className="badge outline text-xs">
                            {getTypeLabel(f.type)}
                          </span>
                          <ValiditeBadge statut={validite} />
                        </div>
                        <p className="font-medium text-foreground mb-2">{f.titre}</p>

                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {f.organisme}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(f.date).toLocaleDateString('fr-FR')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {f.duree_heures}h
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {f.lieu}
                          </span>
                          {f.date_validite && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Validité: {new Date(f.date_validite).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                          {f.evaluation && (
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3 fill-warning text-warning" />
                              {f.evaluation}/5
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {(f.domaines || []).map((d: string) => (
                            <span key={d} className="badge outline text-xs">
                              {DOMAINES_LABELS[d] || d}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <button className="action-button p-1" title="Voir">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="action-button p-1" title="Télécharger">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
              );
            })}

            {(userRole === 'dg' || userRole === 'inspecteur' || userRole === 'admin') && (
              <button className="btn btn-secondary w-full border-dashed gap-2">
                <Plus className="w-4 h-4" />
                Ajouter une formation
              </button>
            )}
          </AccordionSection>
        );
      })}
    </AccordionGroup>
  );
}

export default FormationAccordeon;