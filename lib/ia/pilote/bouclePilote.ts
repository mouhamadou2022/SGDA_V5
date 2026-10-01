// lib/ia/pilote/bouclePilote.ts
// Boucle agentique du pilote AERORISQ (client direct → Ollama local).
// L'IA RAISONNE + AGIT : elle appelle les outils déclarés (lecture directe,
// écriture UNIQUEMENT après confirmation humaine via onConfirmer), jusqu'à
// la réponse finale. Max 6 itérations — jamais de boucle infinie.

'use client'

import { listerOutils, declarerOutil, trouverOutil, type ContexteOutils } from './outils'

export const MODELE_PILOTE = 'aerorisq'
export const URL_OLLAMA = 'http://localhost:11434'
const MAX_ITERATIONS = 6

export interface ActionPilote {
  outil: string
  resume: string
  /** 'executee' | 'refusee' | 'erreur' */
  statut: 'executee' | 'refusee' | 'erreur'
}

export interface ResultatPilote {
  reponse: string
  actions: ActionPilote[]
  /** Vrai si le modèle de vision/pilote est absent (guider l'install). */
  modeleAbsent: boolean
}

interface MessageOllama {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>
  tool_name?: string
}

const SYSTEME_PILOTE = `Tu es AERORISQ en MODE PILOTE : tu peux AGIR sur l'application SGDA via des outils, pas seulement répondre.
Règles : utilise les outils pour obtenir des données réelles (ne les invente jamais) ; enchaîne au besoin (état du site, puis profil, puis écarts) ; quand l'utilisateur demande de planifier, appelle proposer_surveillance UNE fois avec les bons arguments (date AAAA-MM-JJ obligatoire — demande-la si absente) puis résume ; réponds en français, Markdown simple, sans LaTeX.`

export async function executerPilote(params: {
  instruction: string
  historique?: Array<{ role: 'user' | 'assistant'; content: string }>
  contexte?: ContexteOutils
  /** Appelé pour chaque outil d'ÉCRITURE : true = l'utilisateur approuve. */
  onConfirmer: (outil: string, args: Record<string, unknown>) => Promise<boolean>
  onTrace?: (etape: string) => void
}): Promise<ResultatPilote> {
  const actions: ActionPilote[] = []
  const messages: MessageOllama[] = [
    { role: 'system', content: SYSTEME_PILOTE },
    ...(params.historique || []).slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: params.instruction },
  ]
  const outils = listerOutils().map(declarerOutil)

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let appel: Response
    try {
      appel = await fetch(`${URL_OLLAMA}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODELE_PILOTE,
          messages,
          tools: outils,
          stream: false,
          keep_alive: '30m',
          options: { temperature: 0.2, num_ctx: 16384 },
        }),
        signal: AbortSignal.timeout(180000),
      })
    } catch {
      return {
        reponse: 'Ollama est injoignable — vérifiez qu’Ollama est démarré sur cette machine, puis réessayez.',
        actions, modeleAbsent: false,
      }
    }
    if (!appel.ok) {
      const err = await appel.text().catch(() => '')
      if (/not found|does not exist/i.test(err)) {
        return {
          reponse: `Le modèle pilote « ${MODELE_PILOTE} » est absent. Créez-le : ollama create aerorisq -f Modelfile.aerorisq`,
          actions, modeleAbsent: true,
        }
      }
      return { reponse: `Le pilote a échoué (HTTP ${appel.status}). Réessayez.`, actions, modeleAbsent: false }
    }
    const data = await appel.json()
    const msg = data?.message || {}
    const toolCalls: Array<{ function: { name: string; arguments: Record<string, unknown> } }> = msg.tool_calls || []

    if (toolCalls.length === 0) {
      return { reponse: (msg.content || '').trim() || 'Le pilote n’a pas produit de réponse.', actions, modeleAbsent: false }
    }

    messages.push({ role: 'assistant', content: msg.content || '', tool_calls: toolCalls })
    for (const tc of toolCalls) {
      const nom = tc.function?.name || ''
      const args = tc.function?.arguments || {}
      const outil = trouverOutil(nom)
      if (!outil) {
        messages.push({ role: 'tool', content: JSON.stringify({ erreur: `Outil « ${nom} » inconnu.` }), tool_name: nom })
        continue
      }
      params.onTrace?.(`${outil.ecriture ? '✋' : '⚙️'} ${nom}`)
      if (outil.ecriture) {
        const approuve = await params.onConfirmer(nom, args)
        if (!approuve) {
          actions.push({ outil: nom, resume: 'Action refusée par l’utilisateur.', statut: 'refusee' })
          messages.push({ role: 'tool', content: JSON.stringify({ refuse: true, note: 'L’utilisateur a refusé cette action.' }), tool_name: nom })
          continue
        }
      }
      try {
        const resultat = await outil.executer(args, params.contexte || {})
        actions.push({ outil: nom, resume: resultat.slice(0, 200), statut: 'executee' })
        messages.push({ role: 'tool', content: resultat, tool_name: nom })
      } catch (err) {
        const message = (err as Error)?.message || 'échec'
        actions.push({ outil: nom, resume: message, statut: 'erreur' })
        messages.push({ role: 'tool', content: JSON.stringify({ erreur: message }), tool_name: nom })
      }
    }
  }
  return {
    reponse: 'Le pilote a enchaîné trop d’actions sans conclure — reformulez en étapes plus petites.',
    actions, modeleAbsent: false,
  }
}
