'use client'

import React, { useState, useEffect } from 'react'
import { TowerControl, Sparkles, ArrowRight, Globe, Radar, ShieldCheck, BarChart3, Bot, Brain, Loader2, Lightbulb, Target, Eye } from 'lucide-react'
import { useAerorisqText } from '@/lib/ia/client/aerorisqText'

interface Props {
  moduleKey: string
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe, Radar, ShieldCheck, BarChart3, Bot, Lightbulb, Target, Eye,
}

interface CardItem {
  icon: string
  title: string
  text: string
}

const FALLBACK_CARDS: CardItem[] = [
  { icon: 'Globe', title: 'Vision DNA — Navigation Aérienne', text: 'AERORISQ s\'apprête à superviser les fournisseurs de services de navigation aérienne (ATM, CNS, MET, AIM, SAR, MAP, PANSOPS) avec le même moteur d\'analyse de risque bayésien qui fait ses preuves sur les aérodromes DNSA.' },
  { icon: 'Radar', title: 'CNS/ATM et modules ASBU', text: 'Les systèmes de communication, navigation, surveillance et gestion du trafic aérien (CNS/ATM) ainsi que les blocs ASBU seront évalués selon le même référentiel de risque, conformément au Plan Mondial de Navigation Aérienne (Doc 9750 GANP).' },
  { icon: 'ShieldCheck', title: 'Surveillance continue', text: 'Le cycle planifier → inspecter → corriger → apprendre s\'applique à l\'ensemble des prestations DNA. Chaque fournisseur (ATS, CNS, MET, AIM) bénéficie d\'un suivi dynamique de sa conformité.' },
  { icon: 'BarChart3', title: 'Indicateurs temps réel', text: 'Le tableau de bord affichera le nombre de prestataires par domaine, leur niveau de risque agrégé C1-C5, le taux de conformité CNS/ATM, et la cartographie des écarts — exactement comme pour les aérodromes.' },
  { icon: 'Target', title: 'Prévision et tendances', text: 'Le réseau bayésien causal identifie les trajectoires de risque avant qu\'elles ne deviennent critiques. Alertes précoces et recommandations proactives pour anticiper les dérives.' },
  { icon: 'Eye', title: 'Interopérabilité mondiale', text: 'Aligné sur les normes OACI (Annexes, PANS, Doc 9750 GANP) et les exigences régionales AFI. AERORISQ prépare la convergence vers le système ATM mondial interconnecté.' },
]

const FALLBACK_BANNER = 'L\'Inspecteur Virtuel AERORISQ est un agent IA qui génère automatiquement les checklists de surveillance, détecte les anomalies dans les rapports d\'inspection, propose des actions correctives contextuelles, et ajuste le profil de risque C1-C5 en continu.'

interface ModuleMessages {
  title: string
  points: string[]
}

function parseCards(aiText: string): CardItem[] | null {
  try {
    const cards: CardItem[] = []
    const blocks = aiText.split(/\[CARD_\d+\]/).filter(Boolean)
    for (const block of blocks) {
      const titleMatch = block.match(/\[TITLE\]\s*(.+?)\s*\[TEXT\]/)
      const textMatch = block.match(/\[TEXT\]\s*([\s\S]+?)$/)
      if (titleMatch && textMatch && cards.length < 6) {
        cards.push({ icon: 'Lightbulb', title: titleMatch[1].trim(), text: textMatch[1].trim() })
      }
    }
    return cards.length >= 3 ? cards : null
  } catch { return null }
}

function parseBanner(aiText: string): string | null {
  const match = aiText.match(/\[BANNER\]\s*([\s\S]+?)$/)
  return match ? match[1].trim() : null
}

function parseModuleMessages(aiText: string): ModuleMessages | null {
  try {
    const titleMatch = aiText.match(/\[TITLE\]\s*(.+?)\s*\[POINTS\]/)
    const pointsMatch = aiText.match(/\[POINTS\]\s*([\s\S]+)$/)
    if (titleMatch && pointsMatch) {
      const points = pointsMatch[1].split('\n').map(l => l.trim().replace(/^[-\*]\s*/, '')).filter(Boolean)
      return { title: titleMatch[1].trim(), points }
    }
    return null
  } catch { return null }
}

const MODULE_LABELS: Record<string, string> = {
  aerodromes: 'Aérodromes / Prestataires',
  planning: 'Planning des Inspections',
  surveillance: 'Surveillance',
  'ecarts-pac': 'Écarts & PAC',
  'profil-risque': 'Profil de Risque',
  evenements: 'Événements de Sécurité',
  registres: 'Registres',
  dossiers: 'Dossiers',
}

export default function AerorisqDNAState({ moduleKey }: Props) {
  const isDashboard = moduleKey === 'admin-dashboard' || moduleKey === 'dashboard'

  const dashboardPrompt = `Tu es AERORISQ, assistant IA de supervision aérienne. Génère le contenu complet du portail DNA (Navigation Aérienne) en respectant EXACTEMENT ce format :

[CARD_1]
[TITLE]titre de la carte 1
[TEXT]texte de la carte 1 (2-3 phrases max, percutant)

[CARD_2]
[TITLE]titre de la carte 2
[TEXT]texte de la carte 2

... (6 cartes au total)

Thèmes des 6 cartes : 1) Vision DNA, 2) CNS/ATM et modules ASBU, 3) Surveillance continue, 4) Indicateurs temps réel, 5) Prévision et tendances, 6) Interopérabilité mondiale.

[BANNER]un paragraphe de présentation de l'Inspecteur Virtuel AERORISQ pour la DNA (2-3 phrases). Mentionne le recalibrage C1-C5 et l'adaptation sans modification du moteur.

Réponds UNIQUEMENT avec le format demandé, en français.`

  const modulePrompt = (label: string) => `Tu es AERORISQ, assistant IA. Génère le message pour le module "${label}" du département DNA (Navigation Aérienne) en respectant CE format :

[TITLE]titre du message pour ${label}
[POINTS]
- point 1 : explique pourquoi aucune donnée DNA n'est disponible (2 phrases max)
- point 2 : mentionne que seuls les aérodromes DNSA sont renseignés (1-2 phrases)
- point 3 : précise que l'extension DNA est prévue en Phase 2 (1-2 phrases)

Réponds UNIQUEMENT avec le format demandé, en français.`

  const prompt = isDashboard ? dashboardPrompt : modulePrompt(MODULE_LABELS[moduleKey] || moduleKey)
  const { result: aiRaw, isLoading } = useAerorisqText(prompt, moduleKey)

  const [cards, setCards] = useState<CardItem[]>(FALLBACK_CARDS)
  const [banner, setBanner] = useState<string>(FALLBACK_BANNER)
  const [moduleTitle, setModuleTitle] = useState<string | null>(null)
  const [modulePoints, setModulePoints] = useState<string[] | null>(null)

  useEffect(() => {
    if (!aiRaw) return
    if (isDashboard) {
      const parsed = parseCards(aiRaw)
      if (parsed) setCards(parsed)
      const b = parseBanner(aiRaw)
      if (b) setBanner(b)
    } else {
      const parsed = parseModuleMessages(aiRaw)
      if (parsed) {
        setModuleTitle(parsed.title)
        setModulePoints(parsed.points)
      }
    }
  }, [aiRaw, isDashboard])

  if (isDashboard) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-2xl bg-role-primary/10 flex items-center justify-center mx-auto mb-4">
              <TowerControl className="w-8 h-8 text-role-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Direction de la Navigation Aérienne
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Portail DNA — Supervision des services de navigation aérienne
            </p>
          </div>

          {/* Bannière Inspecteur Virtuel — en premier, le plus impactant */}
          {isLoading ? (
            <div className="rounded-xl border border-border bg-muted/30 p-6 mb-10 animate-pulse">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-xl bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/4" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-5/6" />
                </div>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-role-primary/30 bg-gradient-to-br from-role-primary/5 via-role-primary/[0.02] to-transparent p-6 mb-10">
              <div className="absolute top-0 right-0 w-40 h-40 bg-role-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
              <div className="flex items-start gap-5 relative">
                <div className="w-14 h-14 rounded-2xl bg-role-primary/15 flex items-center justify-center shrink-0 ring-2 ring-role-primary/20">
                  <Brain className="w-7 h-7 text-role-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground mb-2 flex items-center gap-2">
                    Inspecteur Virtuel
                    <span className="text-[10px] font-semibold bg-role-primary/10 text-role-primary px-2 py-0.5 rounded-full">IA</span>
                  </h3>
                  <p className="text-sm text-foreground/70 leading-relaxed max-w-2xl">{banner}</p>
                  <div className="flex flex-wrap gap-4 mt-3">
                    <div className="flex items-center gap-1.5 text-sm text-foreground/60">
                      <Bot className="w-3.5 h-3.5 text-role-primary" />
                      Génération de checklists
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-foreground/60">
                      <Sparkles className="w-3.5 h-3.5 text-role-primary" />
                      Analyse d&apos;écarts
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-foreground/60">
                      <Brain className="w-3.5 h-3.5 text-role-primary" />
                      Recalibrage C1-C5
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3 justify-end text-[10px] text-role-primary/60">
                    <Sparkles className="w-3 h-3" />
                    Généré par AERORISQ
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cartes vision AERORISQ */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="bg-card border border-border rounded-xl p-5 flex flex-col animate-pulse">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-3 bg-muted rounded w-full" />
                      <div className="h-3 bg-muted rounded w-5/6" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
              {cards.map((item, i) => {
                const Icon = ICON_MAP[item.icon] || Lightbulb
                return (
                  <div key={i} className="bg-card border border-border rounded-xl p-5 hover:border-role-primary/30 hover:shadow-md transition-all flex flex-col">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-role-primary/10 flex items-center justify-center shrink-0 ring-1 ring-role-primary/20">
                        <Icon className="w-5 h-5 text-role-primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-foreground mb-1.5">{item.title}</h3>
                        <p className="text-sm text-foreground/70 leading-relaxed">{item.text}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer statut */}
          <div className="text-center">
            <div className="inline-flex items-center gap-3 text-sm text-muted-foreground bg-muted/50 border border-border rounded-full px-5 py-2.5">
              <TowerControl className="w-4 h-4" />
              <span className="font-medium">DNA — Direction de la Navigation Aérienne</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span className="text-role-primary font-semibold">Déploiement Phase 2</span>
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span>Basculez sur DNSA pour explorer les fonctionnalités</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── Module empty state ── */
  const label = MODULE_LABELS[moduleKey] || moduleKey
  const displayTitle = moduleTitle || `Module ${label}`
  const displayPoints = modulePoints || [
    `Le module ${label} n'affiche pas encore de données pour la Navigation Aérienne. Actuellement, seuls les aérodromes DNSA sont renseignés dans le système.`,
    `L'extension DNA est prévue pour la prochaine phase de déploiement. Tous les modules fonctionneront à l'identique pour les fournisseurs de services de navigation aérienne.`,
  ]

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-role-primary/10 flex items-center justify-center mb-6 ring-1 ring-role-primary/20">
        <TowerControl className="w-8 h-8 text-role-primary" />
      </div>

      <h2 className="text-2xl font-bold text-foreground mb-4">{displayTitle}</h2>

      {isLoading ? (
        <div className="bg-muted/50 border border-border rounded-xl p-5 max-w-lg w-full animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-full" />
          <div className="h-4 bg-muted rounded w-5/6" />
          <div className="h-4 bg-muted rounded w-4/6" />
        </div>
      ) : (
        <div className="bg-gradient-to-br from-role-primary/[0.03] to-transparent border border-border rounded-xl p-6 max-w-lg w-full text-left space-y-4">
          {displayPoints.map((point, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-role-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3 h-3 text-role-primary" />
              </div>
              <span className="text-sm text-foreground/80 leading-relaxed">{point}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-2 justify-end text-[10px] text-role-primary/60 border-t border-border/50">
            <Sparkles className="w-3 h-3" />
            Généré par AERORISQ
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
        <TowerControl className="w-4 h-4" />
        <span className="font-medium">DNA — Direction de la Navigation Aérienne</span>
        <ArrowRight className="w-3.5 h-3.5" />
        <span className="text-role-primary font-semibold">Déploiement futur</span>
      </div>
    </div>
  )
}
