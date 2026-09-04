// lib/ia/agents/copiloteAgent.ts
// Copilote conversationnel libre de l'inspecteur.
// L'inspecteur engage un dialogue naturel : questions réglementaires, analyse
// de documents déposés (optionnel), rédaction de notes/courriers, toute
// demande d'aide selon son besoin. Aucun parcours imposé, aucune sortie
// structurée obligatoire : réponse en texte libre fondée sur les pièces
// jointes et les référentiels OACI / IATA / ANACIM (RAG du Kit Inspecteur).

'use client'

import { aiClient } from '@/lib/ia/aiClient'
import { extractTextFromPDF } from '@/lib/services/pdfExtractor'
import { construireContexteReglementaire } from '@/lib/ia/rag/reglementaireRagClient'
import { REPONDRE_COPILOTE_PROMPT } from '@/lib/ia/prompts'

// ============================================================
// TYPES PUBLICS
// ============================================================

/** Pièce jointe au dialogue : document déposé avec son texte extrait. */
export interface PieceJointeCopilote {
  id: string
  nom: string
  texte: string
  nbPages?: number
  type?: string
}

/** Message du dialogue (tour de parole). */
export interface MessageCopilote {
  role: 'user' | 'assistant'
  content: string
}

// ============================================================
// AGENT
// ============================================================

class CopiloteAgent {
  /** Extrait le texte d'une pièce PDF (URL d'objet) — réutilisable depuis l'UI. */
  async extraireTextePiece(url: string): Promise<{ texte: string; nbPages: number }> {
    try {
      const result = await extractTextFromPDF(url)
      return { texte: result.texte_complet || '', nbPages: result.nb_pages || 0 }
    } catch {
      return { texte: '', nbPages: 0 }
    }
  }

  /** Réponse libre : s'appuie sur les pièces jointes + RAG réglementaire + historique. */
  async repondre(params: {
    question: string
    pieces?: PieceJointeCopilote[]
    historique: MessageCopilote[]
    aerodromeNom?: string
    domaines?: string[]
    instructions?: string
  }): Promise<string> {
    const pieces = params.pieces || []

    const piecesContexte = pieces
      .map(p => `── PIÈCE : ${p.nom}${p.nbPages ? ` (${p.nbPages} pages)` : ''} ──\n${p.texte.trim().substring(0, 16000) || '(texte indisponible — document scanné)'}`)
      .join('\n\n')

    const contexteReg = construireContexteReglementaire({
      requete: `${params.question} ${params.instructions || ''}`,
      domaines: params.domaines || [],
      type_entite: 'aerodrome',
      maxChars: 4000,
    })

    const userMessage = [
      params.aerodromeNom ? `Aérodrome concerné : ${params.aerodromeNom}` : '',
      params.instructions ? `Contexte donné par l'inspecteur : ${params.instructions}` : '',
      pieces.length ? `PIÈCES JOINTES (documents déposés par l'inspecteur) :\n${piecesContexte}` : '(aucune pièce jointe)',
      contexteReg ? `RÉFÉRENTIEL OACI / IATA / ANACIM pertinent :\n${contexteReg}` : '',
      `DEMANDE DE L'INSPECTEUR :\n${params.question}`,
    ].filter(s => s.trim()).join('\n\n')

    const result = await aiClient.call({
      systemPrompt: REPONDRE_COPILOTE_PROMPT,
      userMessage,
      history: params.historique.slice(-8).map(m => ({ role: m.role, content: m.content })),
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: 'text',
    })

    return result.content?.trim() || 'Je n\'ai pas pu formuler de réponse. Reformulez votre demande, ou vérifiez que les documents joints sont bien lus.'
  }
}

export const copiloteAgent = new CopiloteAgent()