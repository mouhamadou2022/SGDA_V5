'use client'

import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Plane, TowerControl, ArrowRight, Sparkles, Brain, Loader2, Compass, ShieldCheck, Activity, TrendingUp, MapPin } from 'lucide-react'
import type { AuthUser } from '@/lib/auth'
import { useAerorisqText } from '@/lib/ia/client/aerorisqText'

interface Props {
  user: AuthUser
  onEnter?: () => void
}

interface DeptContent {
  titre: string
  description: string
  messages: string[]
}

const FALLBACK: Record<string, DeptContent> = {
  DNSA: {
    titre: 'Normes et Sécurité des Aérodromes',
    description: 'Supervisez la sécurité des aérodromes : certifications, inspections, homologations et gestion des risques.',
    messages: [
      'AERORISQ analyse en continu le profil de risque (C1-C5) de chaque aérodrome.',
      'Les surveillances sont planifiées dynamiquement selon le niveau de risque.',
      'Le réseau bayésien ajuste les pondérations en temps réel.',
    ],
  },
  DNA: {
    titre: 'Navigation Aérienne',
    description: 'Supervisez les services de navigation aérienne : ATM, CNS, MET, AIM, SAR, MAP, PANSOPS.',
    messages: [
      'Le même moteur d\'analyse de risque bayésien, calibré pour la DNA.',
      'Cycle planifier → inspecter → corriger → apprendre à l\'identique.',
      'Extension transparente : tous les modules réutilisés sans modification.',
    ],
  },
}

function parseDeptContent(aiText: string): Record<string, DeptContent> | null {
  try {
    const result: Record<string, DeptContent> = {}
    for (const dep of ['DNSA', 'DNA']) {
      const titleMatch = aiText.match(new RegExp(`\\[${dep}_TITLE\\]\\s*(.+?)\\s*\\[${dep}_DESC\\]`))
      const descMatch = aiText.match(new RegExp(`\\[${dep}_DESC\\]\\s*(.+?)\\s*\\[${dep}_MSG\\]`))
      const msgMatch = aiText.match(new RegExp(`\\[${dep}_MSG\\]\\s*([\\s\\S]+?)(?=\\[(?:${dep === 'DNSA' ? 'DNA' : 'END'})_|$)`))
      if (titleMatch && descMatch && msgMatch) {
        const messages = msgMatch[1].split('\n').map(l => l.trim().replace(/^[-\*]\s*/, '')).filter(Boolean)
        result[dep] = { titre: titleMatch[1].trim(), description: descMatch[1].trim(), messages }
      }
    }
    return result.DNSA && result.DNA ? result : null
  } catch { return null }
}

export default function AdminPortal({ user, onEnter }: Props) {
  const activeDepartement = useAppStore(s => s.activeDepartement)
  const setActiveDepartement = useAppStore(s => s.setActiveDepartement)
  const setActiveModule = useAppStore(s => s.setActiveModule)

  const welcomePrompt = `Tu es AERORISQ, l'assistant IA de la plateforme SGDA. Rédige un message d'accueil court et percutant (2-3 phrases) pour un administrateur qui vient de se connecter. Présente les deux départements disponibles : DNSA (aérodromes) et DNA (navigation aérienne). Mentionne que le moteur bayésien et l'Inspecteur Virtuel sont opérationnels. Inspire confiance. Réponds en français.`

  const contentPrompt = `Tu es AERORISQ. Génère le contenu des cartes du portail SGDA pour les deux départements en respectant EXACTEMENT ce format :

[DNSA_TITLE]titre DNSA
[DNSA_DESC]description DNSA (1 phrase)
[DNSA_MSG]
- message AERORISQ 1 pour DNSA
- message AERORISQ 2 pour DNSA
- message AERORISQ 3 pour DNSA

[DNA_TITLE]titre DNA
[DNA_DESC]description DNA (1 phrase)
[DNA_MSG]
- message AERORISQ 1 pour DNA
- message AERORISQ 2 pour DNA
- message AERORISQ 3 pour DNA

Chaque message doit être une phrase percutante sur les capacités AERORISQ. Réponds UNIQUEMENT avec le format demandé, en français.`

  const { result: welcomeMessage, isLoading: welcomeLoading } = useAerorisqText(welcomePrompt, 'admin-portal-welcome')
  const { result: contentRaw, isLoading: contentLoading } = useAerorisqText(contentPrompt, 'admin-portal-content')

  const [content, setContent] = useState<Record<string, DeptContent>>(FALLBACK)

  useEffect(() => {
    if (!contentRaw) return
    const parsed = parseDeptContent(contentRaw)
    if (parsed) setContent(parsed)
  }, [contentRaw])

  // ── Stats mockées pour l'ambiance ──
  const stats = [
    { label: 'AÉRODROMES', value: '14', icon: MapPin, trend: '+2' },
    { label: 'HOMOLOGUÉS', value: '12', icon: ShieldCheck, trend: '+1' },
    { label: 'SURVEILLANCE', value: '74%', icon: Activity, trend: '+5%' },
    { label: 'CONFORMITÉ', value: '87%', icon: TrendingUp, trend: '+3%' },
  ]

  const Card = ({ dep }: { dep: 'DNSA' | 'DNA' }) => {
    const data = content[dep]
    const isActive = activeDepartement === dep
    const IconComponent = dep === 'DNSA' ? Plane : TowerControl

    return (
      <div
        className={`relative rounded-2xl border p-8 cursor-pointer transition-all duration-300 ${
          isActive
            ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-transparent shadow-lg shadow-amber-500/10'
            : 'border-white/10 bg-white/[0.04] hover:border-amber-500/30 hover:bg-white/[0.06]'
        }`}
        onClick={() => handleEnter(dep)}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ring-1 ${
              isActive ? 'bg-amber-500/15 ring-amber-500/30' : 'bg-white/5 ring-white/10'
            }`}>
              <IconComponent className={`w-7 h-7 ${isActive ? 'text-amber-400' : 'text-white/60'}`} />
            </div>
            <h2 className={`text-2xl font-bold ${isActive ? 'text-white' : 'text-white/80'}`}>{dep}</h2>
            <p className={`text-sm mt-1 ${isActive ? 'text-amber-300/80' : 'text-white/40'}`}>{data.titre}</p>
          </div>
          {isActive && (
            <span className="bg-amber-500 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1 shadow-lg shadow-amber-500/30">
              Actif <ArrowRight className="w-3 h-3" />
            </span>
          )}
        </div>

        <p className={`text-sm mb-4 ${isActive ? 'text-white/60' : 'text-white/40'}`}>{data.description}</p>

        <div className="space-y-3 mb-6">
          {data.messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-3 rounded-lg p-3 ${
              isActive ? 'bg-amber-500/[0.06]' : 'bg-white/[0.03]'
            }`}>
              <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-white/30'}`} />
              <span className={`text-sm leading-relaxed ${isActive ? 'text-white/70' : 'text-white/50'}`}>{msg}</span>
            </div>
          ))}
          {!contentLoading && (
            <div className="flex items-center gap-1.5 justify-end text-[10px] text-amber-500/50 pt-1">
              <Sparkles className="w-3 h-3" />
              Généré par AERORISQ
            </div>
          )}
        </div>

        <button
          className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
            isActive
              ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 shadow-lg shadow-amber-500/25'
              : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80 border border-white/10'
          }`}
          onClick={(e) => { e.stopPropagation(); handleEnter(dep) }}
        >
          {isActive ? 'Accéder au module' : `Explorer ${dep}`}
        </button>
      </div>
    )
  }

  const handleEnter = (dep: 'DNSA' | 'DNA') => {
    setActiveDepartement(dep)
    setActiveModule('dashboard')
    onEnter?.()
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: '#0b1120' }}>
      {/* Grille radar */}
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(245, 158, 11, 0.06) 1px, transparent 1px)`,
        backgroundSize: '48px 48px'
      }} />

      {/* Cercles animés */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full border border-amber-500/10 animate-ping" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full border border-orange-500/10 animate-ping" style={{ animationDuration: '10s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-amber-500/5 animate-radar" />

      {/* Effets lumineux */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-amber-500/8 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-500/8 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />

      {/* Avion animé */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 opacity-5 animate-float pointer-events-none">
        <Plane className="w-32 h-32 text-amber-400" />
      </div>

      {/* Lignes de vol */}
      <svg className="absolute inset-0 w-full h-full opacity-5 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0,200 Q200,100 400,200 T800,150 T1200,250" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
        <path d="M0,400 Q300,300 600,400 T1000,350 T1400,450" fill="none" stroke="#f59e0b" strokeWidth="1" />
        <path d="M0,600 Q400,500 800,600 T1400,550" fill="none" stroke="#f59e0b" strokeWidth="0.5" />
      </svg>

      {/* Logo en haut à gauche */}
      <div className="absolute top-8 left-8 flex items-center gap-3 z-20 animate-slide-down">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/30 flex items-center justify-center">
          <Plane className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">SGDA</h1>
          <p className="text-white/30 text-[10px] tracking-wide">Supervision Aérienne</p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-1 flex items-center">
          <div className="container mx-auto px-8 lg:px-16 py-8">
            <div className="max-w-5xl mx-auto">
              {/* Header */}
              <div className="text-center mb-12">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Compass className="w-5 h-5 text-amber-400" />
                  <span className="text-white/30 text-[10px] uppercase tracking-wider font-mono">Portail Administrateur</span>
                </div>
                <h1 className="text-4xl lg:text-5xl font-bold text-white mb-3 tracking-tight">
                  Plateforme de <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500">Supervision</span> Aérienne
                </h1>
                <p className="text-white/40 text-sm max-w-lg mx-auto">
                  SGDA · AERORISQ — Sélectionnez un département pour accéder à son portail de gestion
                </p>

                {/* Message AERORISQ */}
                {welcomeLoading ? (
                  <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/40">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AERORISQ prépare votre portail...
                  </div>
                ) : welcomeMessage ? (
                  <div className="mt-6 max-w-xl mx-auto rounded-xl p-5 backdrop-blur-sm border border-amber-500/10" style={{ background: 'rgba(245,158,11,0.04)' }}>
                    <div className="flex items-start gap-3">
                      <Brain className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-sm text-white/70 leading-relaxed italic">
                        &ldquo;{welcomeMessage}&rdquo;
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-3 justify-end text-[10px] text-amber-500/50">
                      <Sparkles className="w-3 h-3" />
                      Généré par AERORISQ
                    </div>
                  </div>
                ) : null}

                {/* Sélecteur département */}
                <div className="mt-8 inline-flex items-center gap-2 p-1 rounded-xl backdrop-blur-sm border border-white/10" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <button
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      activeDepartement === 'DNSA'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                    onClick={() => setActiveDepartement('DNSA')}
                  >
                    <Plane className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    DNSA
                  </button>
                  <button
                    className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      activeDepartement === 'DNA'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25'
                        : 'text-white/50 hover:text-white/80'
                    }`}
                    onClick={() => setActiveDepartement('DNA')}
                  >
                    <TowerControl className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                    DNA
                  </button>
                </div>
              </div>

              {/* Cartes DNSA / DNA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card dep="DNSA" />
                <Card dep="DNA" />
              </div>

              {/* Stats */}
              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.map((s, i) => (
                  <div key={i} className="rounded-xl p-4 text-center backdrop-blur-sm border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <s.icon className="w-4 h-4 text-amber-400/60 mx-auto mb-2" />
                    <div className="text-xl font-bold text-white">{s.value}</div>
                    <div className="text-[10px] text-white/30 tracking-wider mt-1">{s.label}</div>
                    <div className="text-[10px] text-emerald-400/60 mt-0.5">{s.trend}</div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-10 text-center">
                <p className="text-xs text-white/30">
                  Connecté en tant que <strong className="text-white/60">{user.prenom} {user.nom}</strong> —{' '}
                  <span className="text-amber-400/80 font-semibold">Administrateur</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
