// components/modules/dashboard/WelcomeBanner.tsx
'use client'
// ZÉRO @/components/ui/ import

import { useMemo } from 'react'
import { Bell, ClipboardList, Plane, Calendar, Sparkles } from 'lucide-react'
import { useAppStore } from '@/lib/store'

const CITATIONS = [
  'La sécurité aérienne commence par la rigueur de chacun.',
  "Un aérodrome sûr est le fruit d'une vigilance quotidienne.",
  "La prévention aujourd'hui, c'est la sécurité de demain.",
  'Ensemble, nous construisons un ciel plus sûr pour le Sénégal.',
  "L'excellence opérationnelle est notre engagement envers les passagers.",
  "Chaque inspection menée est une vie potentiellement sauvée.",
]

interface WelcomeBannerProps {
  user: {
    prenom: string
    nom: string
    role: string
    aerodrome_id?: string
    service?: string
  }
}

function getInitiales(prenom: string, nom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase()
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrateur', director: 'Directeur Général', inspecteur: 'Inspecteur',
    exploitant: 'Exploitant', guest: 'Visiteur', staff: 'Personnel ANACIM',
    dg: 'Directeur Général', dg_anacim: 'Directeur Général ANACIM',
    dg_operator: 'Directeur Exploitant', focal_operator: 'Point Focal Exploitant',
    staff_operator: 'Personnel Exploitant', inspector: 'Inspecteur',
  }
  return labels[role] ?? role
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export function WelcomeBanner({ user }: WelcomeBannerProps) {
  const aerodromes = useAppStore(s => s.aerodromes);
  const ecarts = useAppStore(s => s.ecarts);
  const notifications = useAppStore(s => s.notifications);
  const surveillances = useAppStore(s => s.surveillances);
  const now = new Date()

  const citation = useMemo(() => CITATIONS[now.getDate() % CITATIONS.length], [])

  const aerodromeNom = useMemo(() => {
    if (!user.aerodrome_id) return null
    return aerodromes.find(ae => ae.id === user.aerodrome_id)?.nom ?? null
  }, [aerodromes, user.aerodrome_id])

  const tachesEnAttente = useMemo(() => {
    let count = 0
    ecarts?.forEach(e => { if (['ouvert', 'pac_attendu', 'en_retard'].includes(e.statut)) count++ })
    surveillances?.forEach(s => { if (['planifiee', 'en_cours'].includes(s.statut)) count++ })
    return count
  }, [ecarts, surveillances])

  const alertesNonLues = useMemo(() => notifications?.filter(n => !n.read_at).length || 0, [notifications])

  const getGreeting = () => {
    const hour = now.getHours()
    if (hour < 12) return 'Bonjour'
    if (hour < 18) return 'Bon après-midi'
    return 'Bonsoir'
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-role-gradient shadow-role-glow animate-fade-in">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/10 blur-2xl" />
      </div>

      <div className="relative p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="shrink-0 relative">
            <div className="absolute inset-0 rounded-full bg-white/30 blur-md animate-pulse" />
            <div className="relative h-14 w-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-bold text-xl">
              {getInitiales(user.prenom, user.nom)}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {getGreeting()}, {user.prenom}&nbsp;!
                  </h2>
                  <span className="badge bg-white/20 text-white border-white/30">{getRoleLabel(user.role)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {aerodromeNom && (
                    <div className="flex items-center gap-1 text-blue-100 text-sm">
                      <Plane className="w-3.5 h-3.5" />
                      <span>{aerodromeNom}</span>
                    </div>
                  )}
                  {user.service && (
                    <div className="flex items-center gap-1 text-blue-100 text-sm">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{user.service}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-center gap-1 text-blue-100 text-xs">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDateFr(now)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-4">
              <div className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5 text-sm backdrop-blur-sm">
                <ClipboardList className="h-4 w-4 text-blue-200" />
                <span>
                  <span className="font-bold">{tachesEnAttente}</span>
                  <span className="text-blue-100 ml-1">tâche(s) en attente</span>
                </span>
              </div>

              <div className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5 text-sm backdrop-blur-sm relative">
                <Bell className="h-4 w-4 text-blue-200" />
                <span>
                  <span className="font-bold">{alertesNonLues}</span>
                  <span className="text-blue-100 ml-1">notification(s)</span>
                </span>
                {alertesNonLues > 0 && (
                  <span className="badge danger animate-pulse absolute -top-2 -right-2 h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-[10px]">
                    {alertesNonLues}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/20">
              <blockquote className="text-blue-100 text-sm italic flex items-start gap-2">
                <span className="text-xl leading-none opacity-50">"</span>
                <span>{citation}</span>
                <span className="text-xl leading-none opacity-50 self-end">"</span>
              </blockquote>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-white/0 via-white/30 to-white/0" />
    </div>
  )
}

export default WelcomeBanner
