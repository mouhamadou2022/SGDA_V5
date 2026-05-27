// components/modules/formation/FormationSuggestions.tsx
'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Lightbulb } from 'lucide-react'

interface Suggestion {
  id: string
  titre: string
  raison: string
  priorite: 'CRITIQUE' | 'HAUTE' | 'NORMALE'
  organismes: string
  pris_en_compte: boolean
}

const SUGGESTIONS_BASE: Suggestion[] = [
  {
    id: 'sg-1',
    titre: 'Formation de base MET — Météorologie opérationnelle',
    raison: 'Compétence MET &lt; niveau 2 — renforcement urgent requis',
    priorite: 'CRITIQUE',
    organismes: 'ASECNA, Direction de la Météorologie Nationale',
    pris_en_compte: false,
  },
  {
    id: 'sg-2',
    titre: 'Formation de base AIS — Services information aéronautique',
    raison: 'Compétence AIS &lt; niveau 2 — fondamentaux manquants',
    priorite: 'CRITIQUE',
    organismes: 'ASECNA EAMAC Niamey, IATA Training',
    pris_en_compte: false,
  },
  {
    id: 'sg-3',
    titre: 'Recyclage PHY Génie Civil RAS-14',
    raison: 'Formation PHY expirée depuis 3 mois',
    priorite: 'HAUTE',
    organismes: 'École Polytechnique Dakar, Bureau Véritas',
    pris_en_compte: false,
  },
  {
    id: 'sg-4',
    titre: 'Formation pré-mission — SGS Système de Gestion de la Sécurité',
    raison: 'Mission planifiée sur AIBD sans compétence SGS suffisante',
    priorite: 'HAUTE',
    organismes: 'OACI Siège, Eurocontrol',
    pris_en_compte: false,
  },
  {
    id: 'sg-5',
    titre: 'Recyclage Certification SSLIA Cat 9',
    raison: 'Certification SSLIA expirée — missions de certification impossibles',
    priorite: 'HAUTE',
    organismes: 'ASECNA, ICAO AFCAC',
    pris_en_compte: false,
  },
  {
    id: 'sg-6',
    titre: 'Formation OPS — Opérations piste et sécurité',
    raison: 'Mission Saint-Louis planifiée, compétence OPS insuffisante',
    priorite: 'HAUTE',
    organismes: 'ACI Afrique, Aéroports de Paris Formation',
    pris_en_compte: false,
  },
  {
    id: 'sg-7',
    titre: 'Formation COM — Communication aéronautique avancée',
    raison: 'Compétence COM &lt; niveau 2 pour les missions internationales',
    priorite: 'NORMALE',
    organismes: 'ASECNA EAMAC, ICAO Language Proficiency',
    pris_en_compte: false,
  },
  {
    id: 'sg-8',
    titre: 'Formation ANI — Analyse incidents et enquêtes',
    raison: 'Poste d\'enquêteur désigné sans formation ANI validée',
    priorite: 'HAUTE',
    organismes: 'BEA France, OACI Formation enquêtes',
    pris_en_compte: false,
  },
]

const PRIORITE_COLORS: Record<string, string> = {
  CRITIQUE: 'badge danger',
  HAUTE: 'badge warning',
  NORMALE: 'badge primary',
}

interface Props {
  inspecteurId?: string
  userRole: string
}

export function FormationSuggestions({ inspecteurId, userRole }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(SUGGESTIONS_BASE)

  const marquer = (id: string) => {
    setSuggestions(prev =>
      prev.map(s => s.id === id ? { ...s, pris_en_compte: true } : s)
    )
  }

  return (
    <div className="space-y-3 animate-fade-up" data-role={userRole}>
      {suggestions.map(s => (
        <div
          key={s.id}
          className={`card p-4 transition-opacity ${s.pris_en_compte ? 'opacity-50' : ''}`}
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <Lightbulb className="h-5 w-5 text-warning" />
            </div>

            <div className="flex-1 min-w-0 space-y-1">
              <p className={`font-medium text-foreground ${s.pris_en_compte ? 'line-through' : ''}`}>{s.titre}</p>
              <p className="text-xs text-muted-foreground">{s.raison}</p>
              <p className="text-xs text-muted-foreground">Organismes: {s.organismes}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={PRIORITE_COLORS[s.priorite]}>
                  {s.priorite}
                </span>
                {s.pris_en_compte && (
                  <span className="badge success text-xs">Pris en compte</span>
                )}
              </div>
            </div>

            {!s.pris_en_compte && (
              <button className="btn btn-secondary btn-sm shrink-0" onClick={() => marquer(s.id)}>
                Ajouter au plan
              </button>
            )}
          </div>
        </div>
      ))}

      {suggestions.every(s => s.pris_en_compte) && (
        <div className="card p-4 border-success bg-success-soft text-center">
          <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
          <p className="text-success font-medium">Toutes les suggestions ont été traitées</p>
        </div>
      )}
    </div>
  )
}

export default FormationSuggestions