// lib/ia/rag/reglementaireRag.ts
// RAG réglementaire — Inspecteur Virtuel
// Récupère les extraits pertinents du Kit Inspecteur (KitDocument) selon les
// domaines de surveillance et la requête, puis les formate en contexte cité
// (référence + chapitre + extrait) injectable dans les prompts des agents
// (écart, rapport, certification/homologation).
// Garantie : l'IA ne cite que des références réellement présentes dans le Kit
// (règle anti-fabrication intégrée au formateur).

import type { KitDocument, KitDocExtrait } from '@/lib/store'
import { getDomaineCode, retirerDiacritiques } from '@/lib/domaines'
import { getSourcesForDomaine } from '@/lib/kitDocMapping'

export type TypeEntiteRag = 'aerodrome' | 'helistation' | 'mixte'

export interface ExtraitCite {
  document_id: string
  document_nom: string
  reference_base: string
  version: string
  statut: string
  reference: string
  titre: string
  contenu: string
  domaine: string
  priorite: number
  type_entite_cible?: string
  seuil_numerique?: string
}

export interface RecuperationParams {
  domaines?: string[]
  type_entite?: TypeEntiteRag
  requete?: string
  maxChunks?: number
  maxChars?: number
}

// Extraits larges (~1100 car.) : les chunks de 700 caractères coupaient les
// paragraphes réglementaires en plein milieu — l'IA répondait « dans les
// limites de l'extrait ». Budget total inchangé (maxChars borne toujours).
const MAX_CHUNK = 1100

interface ChunkBrut {
  reference: string
  titre: string
  contenu: string
  domaines: string[]
  type_entite_cible?: string
  seuil_numerique?: string
}

// ────────────────────────────────────────────────────────────
// Découpage du contenu complet d'un document en segments citables
// ────────────────────────────────────────────────────────────

function decouperTexte(texte: string): string[] {
  const segments: string[] = []
  let courant = ''
  for (const ligne of texte.split(/\n+/)) {
    const l = ligne.trim()
    if (!l) continue
    if (courant && courant.length + l.length > MAX_CHUNK) {
      segments.push(courant)
      courant = l
    } else {
      courant = courant ? `${courant}\n${l}` : l
    }
  }
  if (courant) segments.push(courant)
  return segments.map(s => s.substring(0, MAX_CHUNK))
}

function construireChunks(doc: KitDocument): ChunkBrut[] {
  const refBase = doc.reference_base || ''
  const extraits: KitDocExtrait[] = doc.extraits || []

  if (extraits.length > 0) {
    return extraits
      .filter(e => (e.contenu_resume || '').trim().length > 0)
      .map(e => ({
        reference: e.reference || refBase || doc.type_document_oaci || 'Référence à préciser',
        titre: e.titre || doc.nom,
        contenu: e.contenu_resume.substring(0, MAX_CHUNK),
        domaines: e.domaines.length > 0 ? e.domaines : doc.domaines,
        type_entite_cible: e.type_entite_cible,
        seuil_numerique: e.seuil_numerique,
      }))
  }

  if (doc.contenu_complet && doc.contenu_complet.trim()) {
    const ref = refBase || doc.type_document_oaci || doc.nom
    return decouperTexte(doc.contenu_complet).map(seg => ({
      reference: ref,
      titre: doc.nom,
      contenu: seg,
      domaines: doc.domaines,
    }))
  }

  if (doc.resume && doc.resume.trim()) {
    return [{
      reference: refBase || doc.type_document_oaci || doc.nom,
      titre: doc.nom,
      contenu: doc.resume.substring(0, MAX_CHUNK),
      domaines: doc.domaines,
    }]
  }

  return []
}

// ────────────────────────────────────────────────────────────
// Pertinence
// ────────────────────────────────────────────────────────────

function tokens(texte: string): string[] {
  return retirerDiacritiques(texte.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2)
}

function pertinenceRequete(requete: string, texte: string): number {
  const req = tokens(requete)
  if (req.length === 0) return 0
  const corpus = new Set(tokens(texte))
  let hits = 0
  for (const t of req) if (corpus.has(t)) hits += 1
  return hits / req.length
}

function prioriteSource(domaine: string, reference: string, type_entite: TypeEntiteRag): number {
  const sources = getSourcesForDomaine(domaine, type_entite)
  let best = 3
  for (const s of sources) {
    if (s.ref_pattern.test(reference)) best = Math.min(best, s.priorite)
  }
  return best
}

// ────────────────────────────────────────────────────────────
// Récupération
// ────────────────────────────────────────────────────────────

export function recupererExtraitsAvecDocs(docsInput: KitDocument[], params: RecuperationParams = {}): ExtraitCite[] {
  const {
    domaines = [],
    type_entite = 'aerodrome',
    requete = '',
    maxChunks = 8,
    maxChars = 6000,
  } = params

  const docs = (docsInput || []).filter(d => d.etat !== 'obsolete')
  const requested = new Set(domaines.map(d => getDomaineCode(d).toUpperCase()))

  const candidats: Array<{ cite: ExtraitCite; score: number }> = []

  for (const doc of docs) {
    const refBase = doc.reference_base || ''
    for (const chunk of construireChunks(doc)) {
      const chunkDomaines = chunk.domaines.map(d => getDomaineCode(d).toUpperCase())
      // AGA = global (même sémantique que expandDomaines côté UI/sélections) :
      // un chunk taggé AGA répond à tout domaine demandé.
      const chunkGlobal = chunkDomaines.includes('AGA')
      const domaineMatch = requested.size === 0
        ? chunkDomaines[0] || ''
        : chunkGlobal
          ? [...requested][0] || ''
          : chunkDomaines.find(d => requested.has(d)) || ''

      if (requested.size > 0 && !domaineMatch) continue

      if (chunk.type_entite_cible && chunk.type_entite_cible !== 'tous' && type_entite !== 'mixte' && chunk.type_entite_cible !== type_entite) continue

      let score = 0
      const srcPriorite = prioriteSource(domaineMatch || chunkDomaines[0] || 'SGS', refBase || chunk.reference, type_entite)
      score += srcPriorite === 1 ? 8 : srcPriorite === 2 ? 4 : 1
      score += doc.etat === 'a_jour' ? 5 : 2

      const corpus = `${chunk.titre} ${chunk.contenu} ${doc.resume || ''} ${doc.mots_cles.join(' ')}`
      if (requete.trim()) score += Math.round(pertinenceRequete(requete, corpus) * 15)

      if (chunk.type_entite_cible === type_entite) score += 3
      else if (type_entite === 'helistation' && refBase.toLowerCase().includes('9261')) score += 3

      score += chunk.contenu.length >= 40 ? 2 : 0
      if (chunk.seuil_numerique) score += 2

      candidats.push({
        cite: {
          document_id: doc.id,
          document_nom: doc.nom,
          reference_base: refBase,
          version: doc.version,
          statut: doc.etat,
          reference: chunk.reference,
          titre: chunk.titre,
          contenu: chunk.contenu,
          domaine: domaineMatch || chunkDomaines[0] || '',
          priorite: srcPriorite,
          type_entite_cible: chunk.type_entite_cible,
          seuil_numerique: chunk.seuil_numerique,
        },
        score,
      })
    }
  }

  candidats.sort((a, b) => b.score - a.score)

  const retenus: ExtraitCite[] = []
  const vus = new Set<string>()
  let total = 0

  for (const c of candidats) {
    if (retenus.length >= maxChunks) break
    const cle = `${c.cite.reference}||${c.cite.titre}||${c.cite.contenu.substring(0, 80)}`
    if (vus.has(cle)) continue
    vus.add(cle)
    const budget = maxChars - total
    if (budget <= 0) break
    const contenu = c.cite.contenu.length > budget ? c.cite.contenu.substring(0, budget) : c.cite.contenu
    total += contenu.length
    retenus.push({ ...c.cite, contenu })
  }

  return retenus
}

// ────────────────────────────────────────────────────────────
// Formatage du contexte injectable dans les prompts
// ────────────────────────────────────────────────────────────

export function formaterContexteReglementaire(extraits: ExtraitCite[]): string {
  if (extraits.length === 0) {
    return [
      '## RÉFÉRENCES RÉGLEMENTAIRES DU KIT INSPECTEUR',
      '',
      'Aucun document du Kit Inspecteur ne couvre ce sujet.',
      'RÈGLE ANTI-FABRICATION :',
      '- Ne fabrique AUCUNE référence précise (§, chapitre, numéro de paragraphe).',
      '- Reste sur les référentiels généraux OACI/ANACIM (RAS 14, Doc 9157, Doc 9859, Doc 9981) sans inventer de numéros,',
      '  ou précise « exigence à vérifier dans le référentiel applicable ».',
    ].join('\n')
  }

  const lignes = extraits.map((e, i) => {
    const source = `[${i + 1}] ${e.reference} — « ${e.titre} » (${e.reference_base || e.document_nom}, v${e.version}, ${e.statut})`
    const corps = e.contenu.length > 900 ? `${e.contenu.substring(0, 900)}…` : e.contenu
    return `${source}\n> ${corps}`
  })

  return [
    '## RÉFÉRENCES RÉGLEMENTAIRES DU KIT INSPECTEUR',
    'Fonde chaque constat ou recommandation sur les extraits suivants. Cite la référence exacte (ex : « RAS 14 I §3.1.2 ») à l\'appui de chaque point.',
    '',
    lignes.join('\n\n'),
    '',
    'RÈGLE ANTI-FABRICATION :',
    '- Ne cite JAMAIS une référence (§, chapitre, paragraphe) absente des extraits ci-dessus.',
    '- Recopie le numéro de paragraphe tel quel, sans le modifier.',
    '- Si un point n\'est couvert par aucun extrait, reste général et indique « exigence à vérifier dans le référentiel applicable ».',
  ].join('\n')
}

export function construireContexteAvecDocs(docs: KitDocument[], params: RecuperationParams): string {
  return formaterContexteReglementaire(recupererExtraitsAvecDocs(docs, params))
}

// ────────────────────────────────────────────────────────────
// Génération déterministe d'extraits citables depuis les chapitres
// détectés à l'extraction (sans LLM : rapide, hors-ligne, fiable).
// Comble le trou : analyzeDocument ne persistait jamais ses extraits et
// l'enrichissement IA lisait un résumé souvent vide — ici on cite le texte
// réellement extrait. Ne touche jamais aux extraits existants (manuels).
// ────────────────────────────────────────────────────────────

/**
 * Construit jusqu'à `max` extraits citables depuis des chapitres
 * { titre, contenu } : référence = base + titre de chapitre, résumé = tête
 * du contenu (400 car.), domaines du document. Pur et testé.
 */
export function extraitsDepuisChapitres(
  doc: Pick<KitDocument, 'id' | 'nom' | 'domaines'> & { reference_base?: string },
  chapitres: Array<{ titre: string; contenu: string }>,
  max = 10,
): KitDocExtrait[] {
  const refBase = (doc.reference_base || doc.nom || '').trim() || 'Référence à préciser'
  const domaines = (doc.domaines || []).filter(Boolean)
  const extraits: KitDocExtrait[] = []
  for (const ch of chapitres || []) {
    if (extraits.length >= max) break
    const contenu = (ch.contenu || '').trim()
    if (contenu.length < 50) continue
    const titre = (ch.titre || '').trim() || 'Section du document'
    extraits.push({
      reference: `${refBase} — ${titre}`.substring(0, 160),
      titre,
      contenu_resume: contenu.substring(0, 400),
      statut: 'ACTIF',
      domaines: domaines.length > 0 ? domaines : ['AGA'],
      type_entite_cible: 'tous',
      source_document_id: doc.id,
      detecte_le: new Date().toISOString().substring(0, 10),
    })
  }
  return extraits
}
