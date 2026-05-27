// app/api/ia/chat/route.ts
// Route API serveur pour l'assistant IA SGDA
// Multi-provider : Groq → OpenRouter → lightweight fallback
// Les données sensibles restent côté client — seul le contexte résumé est envoyé

import { NextResponse } from 'next/server'
import { CHAT_SYSTEM_PROMPT } from '@/lib/ia/prompts'
import { callWithFallback, isLLMConfigured } from '@/lib/ia/providers'

export interface ChatAPIRequest {
  message: string
  contexte?: {
    aerodrome?: {
      code_oaci: string
      nom: string
      categorie: string
      type: string
    }
    profil_risque?: {
      score_global: number
      niveau: string
      tendance: string
      c1: number; c2: number; c3: number; c4: number; c5: number
      alertes?: string[]
    }
    ecarts_actifs?: Array<{
      reference: string
      libelle: string
      niveau_risque: string
      statut: string
      jours_restants?: number
    }>
    surveillance_en_cours?: {
      type: string
      date: string
      statut: string
      taux_conformite?: number
    }
    historique?: Array<{ role: 'user' | 'assistant'; content: string }>
    module?: string
  }
}

function buildContextMessage(contexte: ChatAPIRequest['contexte']): string {
  if (!contexte) return ''

  const parts: string[] = []

  if (contexte.aerodrome) {
    const a = contexte.aerodrome
    parts.push(`AÉRODROME ACTUEL : ${a.code_oaci} — ${a.nom} (${a.categorie}, ${a.type})`)
  }

  if (contexte.profil_risque) {
    const p = contexte.profil_risque
    parts.push(
      `PROFIL DE RISQUE :
  - Score global : ${p.score_global}/100 — Niveau : ${p.niveau.toUpperCase()}
  - C1 (Maturité SGS) : ${p.c1}/100
  - C2 (Efficacité PAC) : ${p.c2}/100
  - C3 (Conformité) : ${p.c3}/100
  - C4 (Charge critique) : ${p.c4}/100
  - C5 (Résilience) : ${p.c5}/100
  ${p.alertes && p.alertes.length > 0 ? `- Alertes actives : ${p.alertes.join(', ')}` : ''}`
    )
  }

  if (contexte.ecarts_actifs && contexte.ecarts_actifs.length > 0) {
    const critiques = contexte.ecarts_actifs.filter(e => e.niveau_risque === 'critique')
    const enRetard = contexte.ecarts_actifs.filter(e => e.statut === 'en_retard')
    parts.push(
      `ÉCARTS ACTIFS : ${contexte.ecarts_actifs.length} total
  - Critiques : ${critiques.length}${critiques.length > 0 ? ' → ' + critiques.slice(0, 2).map(e => e.reference + ': ' + e.libelle.substring(0, 60)).join('; ') : ''}
  - En retard : ${enRetard.length}`
    )
  }

  if (contexte.surveillance_en_cours) {
    const s = contexte.surveillance_en_cours
    parts.push(
      `SURVEILLANCE EN COURS : ${s.type} du ${s.date} — ${s.statut}${s.taux_conformite != null ? ` — Conformité : ${s.taux_conformite}%` : ''}`
    )
  }

  if (contexte.module) {
    parts.push(`MODULE ACTIF : ${contexte.module}`)
  }

  return parts.length > 0 ? `[CONTEXTE SGDA]\n${parts.join('\n')}\n[FIN CONTEXTE]\n\n` : ''
}

export async function POST(request: Request) {
  try {
    const body: ChatAPIRequest = await request.json()

    if (!isLLMConfigured()) {
      return NextResponse.json(
        { error: 'Aucune clé API configurée', code: 'NO_API_KEY' },
        { status: 503 }
      )
    }

    const contextMessage = buildContextMessage(body.contexte)
    const userMessage = contextMessage + body.message

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ]

    if (body.contexte?.historique && body.contexte.historique.length > 0) {
      const recentHistory = body.contexte.historique.slice(-6)
      for (const msg of recentHistory) {
        messages.push({ role: msg.role, content: msg.content })
      }
    }

    messages.push({ role: 'user', content: userMessage })

    const result = await callWithFallback({
      messages,
      temperature: 0.4,
      max_tokens: 1024,
      top_p: 0.9,
    })

    return NextResponse.json({
      message: result.content,
      model: result.model,
      provider: result.provider,
      usage: result.usage,
    })
  } catch (error) {
    console.error('[IA Chat API]', error)
    return NextResponse.json(
      { error: (error as Error).message, code: 'ALL_PROVIDERS_FAILED' },
      { status: 503 }
    )
  }
}
