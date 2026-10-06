// lib/ia/agents/copiloteAgent.ts
// Copilote conversationnel libre de l'inspecteur.
// L'inspecteur engage un dialogue naturel : questions réglementaires, analyse
// de documents déposés (optionnel), rédaction de notes/courriers, toute
// demande d'aide selon son besoin. Aucun parcours imposé, aucune sortie
// structurée obligatoire : réponse en texte libre fondée sur les pièces
// jointes et les référentiels OACI / IATA / ANACIM (RAG du Kit Inspecteur).

'use client'

import { aiClient } from '@/lib/ia/aiClient'
import { extractTextFromPDF, rendrePagesPng } from '@/lib/services/pdfExtractor'
import { MAX_PAGES_VISION } from '@/lib/ia/lectureDocument'
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
  /** Unité du compteur : pages (PDF), feuilles (Excel), diapositives (PowerPoint). */
  uniteLecture?: 'pages' | 'feuilles' | 'diapositives'
  type?: string
  /** État de lecture : 'ok' (texte natif), 'vision' (scan lu par l'IA locale), 'ocr' (legacy), 'echec'. */
  statutLecture?: 'ok' | 'vision' | 'ocr' | 'echec'
  /** Raison de l'échec de lecture, affichée à l'inspecteur. */
  detailEchec?: string
}

/** Message du dialogue (tour de parole). */
export interface MessageCopilote {
  role: 'user' | 'assistant'
  content: string
}

// ============================================================
// AGENT
// ============================================================

/**
 * Budget global du contexte documentaire (caractères) : à 24000, pièces +
 * RAG + historique atteignaient ~9000 tokens — refusé par le tier gratuit
 * Groq ET trop lent pour le local CPU (abort à 120 s) → 503 partout.
 * 12000 car. ≈ 10 pages utiles : les questions ciblées restent couvertes ;
 * la synthèse intégrale d'un gros doc relèvera du map-reduce (chantier).
 */
export const BUDGET_PIECES_CHARS = 12000
/**
 * Budget de l'historique de conversation (caractères) : les 8 derniers
 * messages SANS plafond dépassaient le tier gratuit avec les pièces + RAG
 * (mesuré : 11865 tokens → 503 chez tous les providers). On garde les plus
 * récents et on coupe les anciens en le signalant.
 */
export const BUDGET_HISTORIQUE_CHARS = 6000
/** Plafond de génération d'une réponse (tokens) : au-delà, suite automatique. */
export const MAX_REPONSE_TOKENS = 4096

export function plafonnerHistorique(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  budget: number = BUDGET_HISTORIQUE_CHARS,
): { messages: Array<{ role: 'user' | 'assistant'; content: string }>; tronque: boolean } {
  const derniers = (messages || []).slice(-8)
  let total = derniers.reduce((s, m) => s + (m.content || '').length, 0)
  if (total <= budget) return { messages: derniers, tronque: false }
  // Retire les plus anciens jusqu'à tenir (garde toujours le dernier).
  const gardes = [...derniers]
  while (gardes.length > 1 && total > budget) {
    total -= (gardes.shift()?.content || '').length
  }
  return { messages: gardes, tronque: gardes.length < derniers.length }
}

export function plafonnerTextePieces(
  pieces: PieceJointeCopilote[],
  budget: number = BUDGET_PIECES_CHARS,
): { texte: string; tronque: boolean } {
  const blocs: string[] = []
  let reste = budget
  let tronque = false
  for (const p of pieces) {
    const entete = `── PIÈCE : ${p.nom}${p.nbPages ? ` (${p.nbPages} pages)` : ''} ──\n`
    const corps = p.texte.trim() || '(texte indisponible — document scanné)'
    if (entete.length + corps.length <= reste) {
      blocs.push(entete + corps)
      reste -= entete.length + corps.length
    } else if (reste > entete.length + 200) {
      const pris = reste - entete.length
      blocs.push(entete + corps.substring(0, pris) + `\n[… suite de « ${p.nom} » tronquée pour tenir dans le budget de lecture …]`)
      reste = 0
      tronque = true
    } else {
      tronque = true
    }
    if (reste <= 0) {
      if (pieces.indexOf(p) < pieces.length - 1) tronque = true
      break
    }
  }
  return { texte: blocs.join('\n\n'), tronque }
}

class CopiloteAgent {
  /**
   * Lit une pièce PDF : texte natif d'abord (quelques secondes) ; si le
   * document est scanné, l'IA locale de vision LIT les pages rendues en
   * images (plus de minutes d'OCR navigateur).
   */
  async extraireTextePiece(url: string, nomFichier = 'document'): Promise<{
    texte: string
    nbPages: number
    statutLecture: 'ok' | 'vision' | 'ocr' | 'echec'
    detailEchec?: string
  }> {
    try {
      const result = await extractTextFromPDF(url)
      const texte = result.texte_complet || ''
      if (texte.trim().length > 50) {
        return { texte, nbPages: result.nb_pages || 0, statutLecture: 'ok' }
      }
      // Scan (ou PDF sans texte) : lecture par l'IA de vision.
      try {
        const { images, nb_pages } = await rendrePagesPng(url, MAX_PAGES_VISION)
        const res = await fetch('/api/ia/lire-document', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nom: nomFichier, images }),
          signal: AbortSignal.timeout(280000),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && typeof data.texte === 'string' && data.texte.trim().length > 50) {
          const suffixe = nb_pages > images.length
            ? `\n\n[Note : seules les ${images.length} premières pages sur ${nb_pages} ont été lues par l'IA.]`
            : ''
          return {
            texte: data.texte.trim() + suffixe,
            nbPages: nb_pages || 0,
            statutLecture: 'vision',
          }
        }
        return {
          texte: '',
          nbPages: nb_pages || 0,
          statutLecture: 'echec',
          detailEchec: data?.aide || data?.error || 'Document scanné illisible — joignez une version texte du PDF.',
        }
      } catch (errVision) {
        return {
          texte: '',
          nbPages: result.nb_pages || 0,
          statutLecture: 'echec',
          detailEchec: `Lecture du scan impossible (${(errVision as Error)?.message || 'IA de vision injoignable'}) — vérifiez qu'Ollama est démarré.`,
        }
      }
    } catch (err) {
      return {
        texte: '',
        nbPages: 0,
        statutLecture: 'echec',
        detailEchec: `Lecture impossible (${(err as Error)?.message || 'erreur inconnue'}) — réessayez ou changez de fichier.`,
      }
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

    const { texte: piecesContexte, tronque } = plafonnerTextePieces(pieces)

    const contexteReg = construireContexteReglementaire({
      requete: `${params.question} ${params.instructions || ''}`,
      domaines: params.domaines || [],
      type_entite: 'aerodrome',
      maxChars: 4000,
    })

    const userMessage = [
      params.aerodromeNom ? `Aérodrome concerné : ${params.aerodromeNom}` : '',
      params.instructions ? `Contexte donné par l'inspecteur : ${params.instructions}` : '',
      pieces.length ? `PIÈCES JOINTES (documents déposés par l'inspecteur) :\n${piecesContexte}${tronque ? '\n[Note : contexte documentaire plafonné pour tenir dans la fenêtre du modèle — posez des questions ciblées pour explorer la suite.]' : ''}` : '(aucune pièce jointe)',
      contexteReg ? `RÉFÉRENTIEL OACI / IATA / ANACIM pertinent :\n${contexteReg}` : '',
      `DEMANDE DE L'INSPECTEUR :\n${params.question}`,
    ].filter(s => s.trim()).join('\n\n')

    const { messages: historiquePlafonne, tronque: historiqueTronque } = plafonnerHistorique(
      params.historique.map(m => ({ role: m.role, content: m.content })),
    )

    const result = await aiClient.call({
      systemPrompt: REPONDRE_COPILOTE_PROMPT + (historiqueTronque
        ? '\n[Note : historique de conversation tronqué aux échanges récents pour tenir dans la fenêtre du modèle.]'
        : ''),
      userMessage,
      history: historiquePlafonne,
      temperature: 0.3,
      maxTokens: MAX_REPONSE_TOKENS,
      responseFormat: 'text',
      // Laisse le local finir les synthèses : route /api/ia/analyze = 300 s max.
      timeoutMs: 300000,
    })

    let texte = result.content?.trim() || ''
    // Réponse probablement coupée au plafond de génération (compteurs du
    // provider) : UNE suite allégée, jamais de boucle.
    const tokensGeneres = result.usage?.completion_tokens ?? 0
    if (result.ok && texte && tokensGeneres >= Math.floor(MAX_REPONSE_TOKENS * 0.9)) {
      const suite = await aiClient.call({
        systemPrompt: REPONDRE_COPILOTE_PROMPT,
        userMessage: `Votre réponse précédente a été coupée net faute de place. Continuez EXACTEMENT où vous vous êtes arrêté, sans répéter ni résumer :\n\n…${texte.slice(-3000)}`,
        history: historiquePlafonne.slice(-2),
        temperature: 0.3,
        maxTokens: MAX_REPONSE_TOKENS,
        responseFormat: 'text',
        timeoutMs: 300000,
      })
      if (suite.ok && suite.content?.trim()) texte = `${texte}\n${suite.content.trim()}`
    }

    return texte || 'Je n\'ai pas pu formuler de réponse. Reformulez votre demande, ou vérifiez que les documents joints sont bien lus.'
  }
}

export const copiloteAgent = new CopiloteAgent()