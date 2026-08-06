// app/api/aerorisq/assistant/route.ts
// Assistant public AERORISQ pour le portail "Invité".
// Deux actions :
//  - action: 'chat'      → répond à une question du visiteur (supervision,
//                          certification, homologation, surveillance, risque)
//  - action: 'quiz'      → génère une question à choix multiples (éducatif)
// Reçoit/retourne du texte ou JSON selon l'action. IA multi-provider avec
// fallback local (pas de blocage si aucune clé configurée).
//
// Anti-hallucination : la route charge d'abord les VRAIES données des modules
// métier (certification, homologation, surveillance, écarts, aérodromes) via
// service-role et les injecte dans le contexte IA. Les réponses sont donc
// ancrées sur les faits, jamais inventées. Le contexte est agrégé et
// anonymisé (aucune donnée sensible brute).

import { NextResponse } from 'next/server'
import { callWithFallback, isLLMConfigured } from '@/lib/ia/providers'
import {
  chargerContextePublic,
  formaterContextePublic,
  fallbackChat,
  PHASES_CERTIFICATION,
  PHASES_HOMOLOGATION,
  TYPE_INSPECTIONS,
  type ContextePublic,
} from '@/lib/aerorisq/contextPublic'

export const dynamic = 'force-dynamic'

const CHAT_SYSTEM_PROMPT = `Tu es AERORISQ, l'assistant d'intelligence artificielle de l'ANACIM (Agence Nationale de l'Aviation Civile et de la Météorologie du Sénégal).
Un visiteur consulte le portail public et te pose une question sur la supervision de la sécurité des aérodromes.

Tu réponds sur :
- La supervision et la surveillance continue des aérodromes du Sénégal
- Le processus de certification (5 phases) et d'homologation (3 phases) des aérodromes
- L'analyse de risque et l'approche fondée sur le risque
- Le rôle de l'ANACIM et de l'application SGDA / AERORISQ
- Les références réglementaires générales (Annexe 14 OACI, Doc 9859 SGS, RAS 14)

CONTEXTE FACTUEL (données réelles des modules, agrégées et anonymisées) — tu DOIS t'y appuyer, ne jamais inventer de chiffres :
"""
{{CONTEXTE}}
"""

RÈGLES :
- Ton accessible et pédagogique : ton public n'est pas spécialiste
- Réponse concise (3 à 8 phrases) ou liste à puces courte si utile
- En français
- Utilise UNIQUEMENT les chiffres du contexte factuel ci-dessus ; si une information n'y figure pas, réponds de façon générale sans inventer
- Ne révèle JAMAIS de données sensibles, de scores internes par aérodrome, de noms d'aérodromes en situation critique, ni d'informations confidentielles
- Si la question sort de ton domaine ou est hors sujet, redirige poliment vers le contact ANACIM
- Pas d'emojis, pas de markdown lourd`

const QUIZ_SYSTEM_PROMPT = `Tu es AERORISQ, assistant d'intelligence artificielle de l'ANACIM (Sénégal).
Tu génères des questions de quiz éducatives pour les visiteurs du portail public sur la supervision de la sécurité des aérodromes.

Thèmes possibles :
- Supervision et surveillance des aérodromes
- Certification des aérodromes (processus en 5 phases) et homologation (3 phases)
- Approche fondée sur le risque (scores, niveaux)
- Rôle de l'ANACIM et de l'application SGDA / AERORISQ
- Réglementation générale (Annexe 14 OACI, Doc 9859 SGS, RAS 14)
- SSLIA / sauvetage et lutte contre l'incendie (notions générales)

RÉFÉRENTIEL EXACT à respecter (ne t'en écarte jamais, ne change pas le nombre de phases) :
- Certification : ${PHASES_CERTIFICATION.map((p) => `${p.numero}. ${p.nom}`).join(' → ')}
- Homologation : ${PHASES_HOMOLOGATION.map((p) => `${p.numero}. ${p.nom}`).join(' → ')}
- Types de surveillance : ${TYPE_INSPECTIONS.join(', ')}

RÈGLES :
- Une seule question, claire et pédagogique, accessible au grand public (pas trop technique)
- 4 options de réponse dont une seule correcte
- Une explication courte et didactique de la bonne réponse
- En français
- Réponds UNIQUEMENT en JSON valide, sans texte autour, au format exact :
{
  "question": "le texte de la question ?",
  "options": ["option 1", "option 2", "option 3", "option 4"],
  "correct_index": 0,
  "explication": "l'explication de la bonne réponse"
}`

// Fallback local quand l'IA n'est pas configurée ou en cas d'erreur
const FALLBACK_QUIZ = {
  question: 'Combien de phases compte le processus de certification d\u2019un aérodrome selon l\u2019ANACIM ?',
  options: ['3 phases', '5 phases', '7 phases', '2 phases'],
  correct_index: 1,
  explication: 'Le processus de certification se déroule en 5 phases : Expression d\u2019Intérêt, Demande Formelle, Vérification sur Site, Délivrance du Certificat et Publication Statut.',
}

const FALLBACK_QUIZ_HOMOLOGATION = {
  question: 'Combien de phases compte le processus d\u2019homologation d\u2019un aérodrome selon l\u2019ANACIM ?',
  options: ['3 phases', '5 phases', '7 phases', '2 phases'],
  correct_index: 0,
  explication: 'Contrairement à la certification (5 phases), le processus d\u2019homologation compte 3 phases : Demande Formelle, Vérification sur Site et Délivrance Décision.',
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const action = body.action === 'quiz' ? 'quiz' : 'chat'

    const contexte: ContextePublic = await chargerContextePublic()

    if (action === 'chat') {
      const message = typeof body.message === 'string' ? body.message.trim() : ''
      if (!message) {
        return NextResponse.json({ error: 'Message requis' }, { status: 400 })
      }

      if (!isLLMConfigured()) {
        return NextResponse.json({ reply: fallbackChat(message, contexte), iaDisponible: false })
      }

      const contexteTexte = formaterContextePublic(contexte)
      const systemPrompt = CHAT_SYSTEM_PROMPT.replace('{{CONTEXTE}}', contexteTexte)

      try {
        const { content: raw } = await callWithFallback({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          temperature: 0.4,
          max_tokens: 600,
        })
        return NextResponse.json({ reply: (raw || '').trim() || fallbackChat(message, contexte), iaDisponible: true })
      } catch (err) {
        console.error('[aerorisq/assistant] chat IA échoué, fallback local:', err)
        return NextResponse.json({ reply: fallbackChat(message, contexte), iaDisponible: false })
      }
    }

    // action === 'quiz'
    // Alterne entre certification (5 phases) et homologation (3 phases) en mode local
    const quizLocal = body.theme === 'homologation' ? FALLBACK_QUIZ_HOMOLOGATION : FALLBACK_QUIZ

    if (!isLLMConfigured()) {
      return NextResponse.json({ quiz: quizLocal, iaDisponible: false })
    }

    try {
      const { content: raw } = await callWithFallback({
        messages: [
          { role: 'system', content: QUIZ_SYSTEM_PROMPT },
          { role: 'user', content: `Génère une question de quiz pour le visiteur du portail public${body.theme ? ` sur le thème : ${body.theme}` : ''}.` },
        ],
        temperature: 0.8,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      })

      const parsed = JSON.parse(raw)
      const question = typeof parsed.question === 'string' ? parsed.question : quizLocal.question
      const options = Array.isArray(parsed.options) && parsed.options.length >= 2
        ? parsed.options.slice(0, 4)
        : quizLocal.options
      const correct_index = typeof parsed.correct_index === 'number' && parsed.correct_index >= 0 && parsed.correct_index < options.length
        ? parsed.correct_index
        : quizLocal.correct_index
      const explication = typeof parsed.explication === 'string' ? parsed.explication : quizLocal.explication

      return NextResponse.json({
        quiz: { question, options, correct_index, explication },
        iaDisponible: true,
      })
    } catch (err) {
      console.error('[aerorisq/assistant] quiz IA échoué, fallback local:', err)
      return NextResponse.json({ quiz: quizLocal, iaDisponible: false })
    }
  } catch (err) {
    console.error('[aerorisq/assistant] Erreur:', err)
    return NextResponse.json({ error: 'Assistant AERORISQ momentanément indisponible' }, { status: 500 })
  }
}
