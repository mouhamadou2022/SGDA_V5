// components/modules/dashboard/KpiSection.tsx
'use client'

import { useMemo } from 'react'
import { Plane, ShieldCheck, Eye, AlertTriangle, Zap, GraduationCap, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useAppStore } from '@/lib/store'

interface KpiCardProps {
  label: string
  valeur: number
  variation: number
  icone: React.ReactNode
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

function KpiCard({ label, valeur, variation, icone, variant = 'primary' }: KpiCardProps) {
  const variationPositive = variation > 0
  const variationNulle = variation === 0

  // Obtenir les classes CSS selon la variante
  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return {
          iconBg: 'bg-success/10',
          iconColor: 'text-success',
          valueColor: 'text-success',
        }
      case 'warning':
        return {
          iconBg: 'bg-warning/10',
          iconColor: 'text-warning',
          valueColor: 'text-warning',
        }
      case 'danger':
        return {
          iconBg: 'bg-danger/10',
          iconColor: 'text-danger',
          valueColor: 'text-danger',
        }
      case 'info':
        return {
          iconBg: 'bg-info/10',
          iconColor: 'text-info',
          valueColor: 'text-info',
        }
      default:
        return {
          iconBg: 'bg-role-primary-soft',
          iconColor: 'text-role-primary',
          valueColor: 'text-role-primary',
        }
    }
  }

  const variantClasses = getVariantClasses()

  return (
    <div className="kpi-card group animate-fade-up">
      <div className="flex items-start justify-between">
        <div className={`kpi-icon ${variantClasses.iconBg}`}>
          <div className={variantClasses.iconColor}>
            {icone}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium">
          {variationNulle ? (
            <Minus className="h-3 w-3 text-muted" />
          ) : variationPositive ? (
            <TrendingUp className="h-3 w-3 text-success" />
          ) : (
            <TrendingDown className="h-3 w-3 text-danger" />
          )}
          <span className={variationNulle ? 'text-muted' : variationPositive ? 'text-success' : 'text-danger'}>
            {variationNulle ? '=' : `${variationPositive ? '+' : ''}${variation}`}
          </span>
        </div>
      </div>
      <div className="mt-3">
        <div className={`kpi-value ${variantClasses.valueColor}`}>{valeur}</div>
        <div className="kpi-label">{label}</div>
      </div>
    </div>
  )
}

interface KpiSectionProps {
  userRole: string
}

export function KpiSection({ userRole }: KpiSectionProps) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const certifications = useAppStore(s => s.certifications);
  const surveillances = useAppStore(s => s.surveillances);
  const ecarts = useAppStore(s => s.ecarts);
  const evenements = useAppStore(s => s.evenements);

  const now = new Date()
  const moisActuel = now.getMonth()
  const anneeActuelle = now.getFullYear()

  const moisPrecedent = moisActuel === 0 ? 11 : moisActuel - 1
  const anneePrecedente = moisActuel === 0 ? anneeActuelle - 1 : anneeActuelle

  const kpis = useMemo(() => {
    const totalAerodromes = aerodromes?.length || 0

    const certificationsActives = certifications?.filter(
      (c) => c.statut_global === 'certifie'
    ).length || 0

    const surveillancesCeMois = surveillances?.filter((s) => {
      const d = new Date(s.date_debut)
      return d.getMonth() === moisActuel && d.getFullYear() === anneeActuelle
    }).length || 0

    const surveillancesMoisPrec = surveillances?.filter((s) => {
      const d = new Date(s.date_debut)
      return d.getMonth() === moisPrecedent && d.getFullYear() === anneePrecedente
    }).length || 0

    const ecartsOuverts = ecarts?.filter((e) =>
      ['ouvert', 'pac_attendu', 'pac_soumis', 'en_retard'].includes(e.statut)
    ).length || 0

    // Simulation pour la variation (à remplacer par vraies données)
    const ecartsOuvertsMoisPrec = Math.max(0, ecartsOuverts - Math.floor(Math.random() * 3))

    const evenementsEnCours = (evenements ?? []).filter((e) =>
      ['recu', 'en_cours', 'analyse'].includes(e.statut)
    ).length || 0

    const certExpirantes = certifications?.filter((c) => {
      if (!c.date_expiration) return false
      const exp = new Date(c.date_expiration)
      const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      return diff >= 0 && diff <= 60
    }).length || 0

    return [
      {
        label: 'Total Aérodromes',
        valeur: totalAerodromes,
        variation: 0,
        icone: <Plane className="h-5 w-5" />,
        variant: 'primary' as const,
      },
      {
        label: 'Certifications actives',
        valeur: certificationsActives,
        variation: 0,
        icone: <ShieldCheck className="h-5 w-5" />,
        variant: 'success' as const,
      },
      {
        label: 'Surveillances ce mois',
        valeur: surveillancesCeMois,
        variation: surveillancesCeMois - surveillancesMoisPrec,
        icone: <Eye className="h-5 w-5" />,
        variant: surveillancesCeMois >= surveillancesMoisPrec ? 'success' : 'warning',
      },
      {
        label: 'Écarts ouverts',
        valeur: ecartsOuverts,
        variation: ecartsOuverts - ecartsOuvertsMoisPrec,
        icone: <AlertTriangle className="h-5 w-5" />,
        variant: ecartsOuverts === 0 ? 'success' : ecartsOuverts <= 5 ? 'warning' : 'danger',
      },
      {
        label: 'Événements en cours',
        valeur: evenementsEnCours,
        variation: 0,
        icone: <Zap className="h-5 w-5" />,
        variant: evenementsEnCours === 0 ? 'success' : 'warning',
      },
      {
        label: 'Certifications à renouveler',
        valeur: certExpirantes,
        variation: 0,
        icone: <GraduationCap className="h-5 w-5" />,
        variant: certExpirantes === 0 ? 'success' : certExpirantes <= 2 ? 'warning' : 'danger',
      },
    ]
  }, [aerodromes, certifications, surveillances, ecarts, evenements, now])

  // Filtrer les KPIs selon le rôle
  const kpisVisibles = userRole === 'exploitant' ? kpis.slice(0, 4) : kpis

  return (
    <div className="kpi-grid">
      {kpisVisibles.map((kpi, idx) => (
        <KpiCard
          key={kpi.label}
          label={kpi.label}
          valeur={kpi.valeur}
          variation={kpi.variation}
          icone={kpi.icone}
          variant={kpi.variant as "success" | "primary" | "warning" | "danger" | "info" | undefined}
        />
      ))}
    </div>
  )
}

export default KpiSection
