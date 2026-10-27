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
import {
  decouperEnLots,
  estDemandeDocumentEntier,
  selectionnerLotsPertinents,
} from '@/lib/ia/documentChunking'
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
 * Budget global du contexte documentaire (caractères) : mesuré à 14000 tokens
 * avec 12000 (pièces) + 6000 (historique) + RAG + prompt → refusé par le tier
 * gratuit Groq (6000) ET trop lent pour AERORISQ local → 503 partout.
 * 6000 car. ≈ 4-5 pages utiles : les questions ciblées restent couvertes.
 */
export const BUDGET_PIECES_CHARS = 6000
/**
 * Budget de l'historique de conversation (caractères) : avec pièces 6000 +
 * RAG + prompt, 3000 chars d'historique gardent le total sous ~5500 tokens.
 */
export const BUDGET_HISTORIQUE_CHARS = 3000
/** Plafond de génération d'une réponse (tokens) : au-delà, suite automatique. */
export const MAX_REPONSE_TOKENS = 4096
/**
 * Taille d'un lot pour la lecture intégrale d'un document (≈ 3000 tokens).
 * Chaque lot est lu séparément (map), puis les faits sont fusionnés (reduce).
 */
export const LOT_LECTURE_CHARS = 9000
/** Nombre max de lots lus en profondeur (garde-fou temps/quota). */
export const MAX_LOTS_LECTURE_INTEGRALE = 12
/** Pages max lues par vision pour une pièce (garde-fou temps/quota). */
export const MAX_PAGES_VISION_COPILOTE = 50

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

/** Concatène les pièces avec leur en-tête, sans rien couper. */
export function assemblerPieces(pieces: PieceJointeCopilote[]): string {
  return pieces
    .map(p => {
      const entete = `── PIÈCE : ${p.nom}${p.nbPages ? ` (${p.nbPages} pages)` : ''} ──\n`
      const corps = p.texte.trim() || '(texte indisponible — document scanné)'
      return entete + corps
    })
    .join('\n\n')
}

/**
 * Construit le contexte documentaire en lisant TOUT le document : si le texte
 * dépasse le budget, on découpe l'ensemble en lots puis on garde les lots les
 * plus pertinents pour la question (au lieu des N premiers caractères).
 */
export function construireContextePieces(
  pieces: PieceJointeCopilote[],
  requete = '',
  budget: number = BUDGET_PIECES_CHARS,
): { texte: string; tronque: boolean; lotsTotal: number; lotsLus: number } {
  const complet = assemblerPieces(pieces)
  if (complet.length <= budget) {
    return { texte: complet, tronque: false, lotsTotal: 1, lotsLus: 1 }
  }
  // Lots d'environ la moitié du budget : deux extraits pertinents tiennent
  // dans la fenêtre, au lieu d'un seul bloc.
  const lots = decouperEnLots(complet, Math.max(1500, Math.floor(budget / 2)))
  const sel = selectionnerLotsPertinents(lots, requete, budget)
  return { texte: sel.texte, tronque: !sel.complet, lotsTotal: sel.lotsTotal, lotsLus: sel.lotsLus }
}

/**
 * Lecture intégrale (map) : chaque lot du document est lu séparément pour en
 * extraire les faits qui répondent à la question. Les notes sont ensuite
 * transmises au modèle qui rédige la réponse finale (reduce).
 */
async function extraireFaitsDesLots(
  lots: ReturnType<typeof decouperEnLots>,
  question: string,
): Promise<{ notes: string; lotsLus: number; lotsTotal: number }> {
  const traites = lots.slice(0, MAX_LOTS_LECTURE_INTEGRALE)
  // Budget par extrait : toutes les parties sont représentées dans le prompt
  // final, sans dépasser la fenêtre du modèle.
  const budgetParNote = Math.max(300, Math.floor(BUDGET_PIECES_CHARS / Math.max(1, traites.length)))
  const notes: string[] = []
  for (const lot of traites) {
    const res = await aiClient.call({
      systemPrompt:
        'Tu es un lecteur de documents réglementaires aéronautiques (OACI, ANACIM). ' +
        "Tu extrais UNIQUEMENT les faits présents dans le texte fourni. Tu n'inventes rien " +
        'et tu ne complètes pas avec des connaissances externes.',
      userMessage: `QUESTION DE L'INSPECTEUR :\n${question}\n\n` +
        `EXTRAIT ${lot.index + 1}/${lots.length} DU DOCUMENT :\n${lot.texte}\n\n` +
        'Extrais de cet extrait TOUS les éléments qui aident à répondre (obligations, chiffres, ' +
        "seuils, références, constats, exceptions). Réponds en 3 à 6 puces concises " +
        '(600 caractères maximum au total). Si l\'extrait ne contient rien d\'utile, réponds ' +
        'exactement « (rien de pertinent) ».',
      temperature: 0.1,
      maxTokens: 500,
      responseFormat: 'text',
      timeoutMs: 180000,
    })
    const contenu = res.ok ? (res.content || '').trim() : ''
    if (contenu && !/^\(rien de pertinent\)$/i.test(contenu)) {
      notes.push(`— Extrait ${lot.index + 1}/${lots.length} :\n${contenu.slice(0, budgetParNote)}`)
    }
  }
  return { notes: notes.join('\n\n'), lotsLus: traites.length, lotsTotal: lots.length }
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
      // Scan (ou PDF sans texte) : lecture par l'IA de vision, PAGE PAR PAGE,
      // sur tout le document (et non plus seulement les 5 premières pages).
      try {
        const morceaux: string[] = []
        let page = 1
        let nbPages = 0
        let echec: string | undefined
        while (page <= MAX_PAGES_VISION_COPILOTE) {
          const paquet = await rendrePagesPng(
            url,
            Math.min(MAX_PAGES_VISION, MAX_PAGES_VISION_COPILOTE - page + 1),
            page,
          )
          nbPages = paquet.nb_pages || nbPages
          if (paquet.images.length === 0 || (nbPages > 0 && page > nbPages)) break

          const res = await fetch('/api/ia/lire-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom: nomFichier, images: paquet.images }),
            signal: AbortSignal.timeout(280000),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || typeof data.texte !== 'string' || data.texte.trim().length <= 50) {
            echec = data?.aide || data?.error || 'Document scanné illisible — joignez une version texte du PDF.'
            break
          }
          // La route numérote 1..N par appel : on renumérote en pages absolues.
          let n = 0
          const absolu = data.texte.replace(
            /---\s*Page\s+(\d+)\s*---/gi,
            () => `--- Page ${page + (n++)} ---`,
          )
          morceaux.push(absolu)
          page += paquet.images.length
          if (nbPages > 0 && page > nbPages) break
        }

        const texteLu = morceaux.join('\n\n').trim()
        if (texteLu.length > 50) {
          const suffixe = nbPages > MAX_PAGES_VISION_COPILOTE
            ? `\n\n[Note : seules les ${MAX_PAGES_VISION_COPILOTE} premières pages sur ${nbPages} ont été lues par l'IA.]`
            : page <= nbPages
              ? `\n\n[Note : lecture visuelle interrompue à la page ${Math.max(1, page - 1)} sur ${nbPages}.]`
              : ''
          return {
            texte: texteLu + suffixe,
            nbPages: nbPages || 0,
            statutLecture: 'vision',
          }
        }
        return {
          texte: '',
          nbPages: nbPages || 0,
          statutLecture: 'echec',
          detailEchec: echec || 'Document scanné illisible — joignez une version texte du PDF.',
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

  private cacheReponses = new Map<string, { timestamp: number; texte: string }>()

  /** Réponse libre : s'appuie sur les pièces jointes + RAG réglementaire + historique. */
  async repondre(params: {
    question: string
    pieces?: PieceJointeCopilote[]
    historique: MessageCopilote[]
    aerodromeNom?: string
    domaines?: string[]
    instructions?: string
  }): Promise<string> {
    const cacheKey = `${params.question}|${params.pieces?.length || 0}|${params.aerodromeNom || ''}`
    const cached = this.cacheReponses.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < 120_000) return cached.texte

    const pieces = params.pieces || []

    // Lecture documentaire : si les pièces dépassent la fenêtre, on ne coupe
    // plus « les premières pages » — on découpe TOUT le document et on lit soit
    // les extraits pertinents, soit l'intégralité (map/reduce) pour une demande
    // globale (synthèse, résumé, analyse complète…).
    let piecesContexte = ''
    let noteLecture = ''
    if (pieces.length > 0) {
      const complet = assemblerPieces(pieces)
      if (complet.length <= BUDGET_PIECES_CHARS) {
        piecesContexte = complet
      } else if (estDemandeDocumentEntier(params.question)) {
        const lots = decouperEnLots(complet, LOT_LECTURE_CHARS)
        const { notes, lotsLus, lotsTotal } = await extraireFaitsDesLots(lots, params.question)
        piecesContexte = notes
        noteLecture = lotsLus < lotsTotal
          ? `[Note : document très volumineux — ${lotsLus} parties sur ${lotsTotal} ont été lues en profondeur.]`
          : `[Note : document lu intégralement (${lotsTotal} parties).]`
        // Aucun fait extrait (question hors sujet) : repli sur les extraits les
        // plus pertinents plutôt que de perdre tout le contexte documentaire.
        if (!piecesContexte.trim()) {
          piecesContexte = construireContextePieces(pieces, params.question, BUDGET_PIECES_CHARS).texte
        }
      } else {
        const sel = construireContextePieces(pieces, params.question, BUDGET_PIECES_CHARS)
        piecesContexte = sel.texte
        noteLecture = sel.tronque
          ? `[Note : extraits les plus pertinents sélectionnés dans TOUT le document (${sel.lotsLus}/${sel.lotsTotal} parties) — posez une question ciblée pour explorer une autre section.]`
          : ''
      }
    }

    const contexteReg = construireContexteReglementaire({
      requete: `${params.question} ${params.instructions || ''}`,
      domaines: params.domaines || [],
      type_entite: 'aerodrome',
      maxChars: 4000,
    })

    const userMessage = [
      params.aerodromeNom ? `Aérodrome concerné : ${params.aerodromeNom}` : '',
      params.instructions ? `Contexte donné par l'inspecteur : ${params.instructions}` : '',
      pieces.length ? `PIÈCES JOINTES (documents déposés par l'inspecteur) :\n${piecesContexte}${noteLecture ? `\n${noteLecture}` : ''}` : '(aucune pièce jointe)',
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

    const final = texte || 'Je n\'ai pas pu formuler de réponse. Reformulez votre demande, ou vérifiez que les documents joints sont bien lus.'
    this.cacheReponses.set(cacheKey, { timestamp: Date.now(), texte: final })
    return final
  }
}

export const copiloteAgent = new CopiloteAgent()