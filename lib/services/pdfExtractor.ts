import { getMappingForDomaine } from '@/lib/kitDocMapping'

// Helper : détecte si le texte extrait est probablement un scan (trop court ou peu de contenu)
function estProbablementScan(texte: string, nbPages: number): boolean {
  const lignes = texte.split('\n').filter(l => l.trim().length > 0)
  // Moins de 5 lignes non vides par page en moyenne → probablement un scan
  return lignes.length / Math.max(1, nbPages) < 5
}

// Rendu d'une page PDF en image PNG (dataURL) — l'IA locale LIT l'image
// (modèle de vision), au lieu d'un OCR navigateur lent et de qualité médiocre.
async function rendrePagePng(pagePdf: any, echelle = 1.5): Promise<string> {
  const viewport = pagePdf.getViewport({ scale: echelle })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D indisponible pour le rendu.')
  await pagePdf.render({ canvasContext: context, viewport }).promise
  return canvas.toDataURL('image/png')
}

// ────────────────────────────────────────────────────────────
// Texte natif pdfjs (rapide) + rendu PNG (lecture par l'IA de vision)
// ────────────────────────────────────────────────────────────
/** Charge un PDF (worker local, repli CDN) — partagé par texte et rendu. */
async function chargerPdf(blobUrl: string): Promise<{ pdf: any }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(blobUrl, { signal: controller.signal })
    if (!response.ok) throw new Error(`Document inaccessible (HTTP ${response.status}).`)
    const arrayBuffer = await response.arrayBuffer()
    const pdfjs = await import('pdfjs-dist')
    // Worker servi en local (public/pdf.worker.min.mjs) : pas de dépendance
    // réseau/CDN — l'extraction échouait silencieusement quand le CDN était
    // injoignable. Repli CDN uniquement si le fichier local est absent.
    try {
      const local = await fetch('/pdf.worker.min.mjs', { method: 'HEAD' })
      pdfjs.GlobalWorkerOptions.workerSrc = local.ok
        ? '/pdf.worker.min.mjs'
        : `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    } catch {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    }
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    return { pdf }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Rend les premières pages en images PNG pour lecture par l'IA de vision.
 * Rapide (quelques secondes) : c'est le remplacement de l'OCR navigateur.
 */
export async function rendrePagesPng(blobUrl: string, maxPages = 5): Promise<{
  images: string[]
  nb_pages: number
}> {
  const { pdf } = await chargerPdf(blobUrl)
  const nb = Math.min(pdf.numPages, Math.max(1, maxPages))
  const images: string[] = []
  for (let i = 1; i <= nb; i++) {
    const page = await pdf.getPage(i)
    images.push(await rendrePagePng(page))
  }
  return { images, nb_pages: pdf.numPages }
}

export async function extractTextFromPDF(blobUrl: string): Promise<{
  texte_complet: string
  chapitres: { titre: string; contenu: string; debut: number }[]
  nb_pages: number
  /** Vrai si le document semblait scanné (peu de texte natif). */
  scan_detecte: boolean
  /** Toujours faux : l'OCR navigateur est remplacé par la vision IA (lire-document). */
  ocr_applique: boolean
}> {
  const { pdf } = await chargerPdf(blobUrl)

  // Extraction du texte natif (rapide : quelques secondes même sur gros PDF)
  const pagesTexte: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const textePage = content.items.map((item: any) => item.str).join(' ')
    pagesTexte.push(textePage)
  }

  const texteClassique = pagesTexte.join('\n')

  // Scan détecté (peu de texte natif) : PAS d'OCR navigateur ici — c'est
  // l'agent appelant qui fait lire les pages par l'IA de vision
  // (rendrePagesPng + /api/ia/lire-document), bien plus rapide et fiable.
  const scanDetecte = estProbablementScan(texteClassique, pdf.numPages)
  if (scanDetecte) console.log('[pdfExtractor] Scan probable — lecture par IA de vision requise')

  const chapitres = decouperChapitres(texteClassique)
  return { texte_complet: texteClassique, chapitres, nb_pages: pdf.numPages, scan_detecte: scanDetecte, ocr_applique: false }
}

const ROMAIN_MAP: Record<string, string> = {
  I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9', X: '10',
  XI: '11', XII: '12', XIII: '13', XIV: '14', XV: '15', XVI: '16', XVII: '17', XVIII: '18', XIX: '19', XX: '20',
}

function romainVersArabe(r: string): string {
  return ROMAIN_MAP[r.toUpperCase()] || r
}

/**
 * Extrait le numéro (arabe ou romain) depuis un titre de chapitre.
 * Ex: "CHAPITRE 3 - Pistes" → "3", "CHAPITRE IV" → "4"
 */
function extraireNumeroChapitre(titre: string): string | null {
  const m = titre.match(/(?:CHAPITRE|CHAPTER|Section|Chapitre|TITRE|Titre)\s+([IVXLCDM]+|\d+(?:[\.\d]*)?)/i)
  if (!m) return null
  return /^[IVXLCDM]+$/i.test(m[1]) ? romainVersArabe(m[1]) : m[1]
}

export function decouperChapitres(texte: string): { titre: string; contenu: string; debut: number }[] {
  const chapitres: { titre: string; contenu: string; debut: number }[] = []
  // CHAPITRE/CHAPTER/Section/Titre + nombre ou chiffre romain, OU article/annexe numéroté
  const regex = /(?:CHAPITRE|CHAPTER|Section|Chapitre|TITRE|Titre|Article|ANNEXE|Annexe)\s+([IVXLCDM]+|\d+(?:[\.\d]*)?)[\.\s:]*[—\-–]?\s*(.+)?$/gmi
  let match
  let dernierIndex = 0
  let dernierTitre = 'Préambule'
  while ((match = regex.exec(texte)) !== null) {
    if (match.index > dernierIndex) {
      chapitres.push({
        titre: dernierTitre,
        contenu: texte.slice(dernierIndex, match.index).trim(),
        debut: dernierIndex,
      })
    }
    const num = match[1]
    const label = match[2] ? match[2].trim() : ''
    dernierTitre = `${match[0].trim().replace(/[:—\-–]\s*$/, '')}`
    dernierIndex = match.index
  }
  if (dernierIndex < texte.length) {
    chapitres.push({
      titre: dernierTitre,
      contenu: texte.slice(dernierIndex).trim(),
      debut: dernierIndex,
    })
  }
  return chapitres
}

/**
 * Filtre les chapitres en utilisant le mapping structuré (kitDocMapping.ts).
 * Cherche les numéros de chapitre exacts définis par domaine plutôt que des mots-clés.
 */
export function filtrerChapitresParMapping(
  chapitres: { titre: string; contenu: string; debut: number }[],
  domaine: string,
  type_entite: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
): { textes: string[]; numerosTrouves: string[] } {
  const mapping = getMappingForDomaine(domaine, type_entite === 'helistation' ? 'helistation' : 'aerodrome')
  if (!mapping) return { textes: [], numerosTrouves: [] }

  const numerosAttendus = new Set<string>()
  for (const source of mapping.sources) {
    if (source.chapitre) {
      const nums = Array.isArray(source.chapitre) ? source.chapitre : [source.chapitre]
      nums.forEach(n => numerosAttendus.add(n))
    }
  }

  if (numerosAttendus.size === 0) return { textes: [], numerosTrouves: [] }

  const resultats: string[] = []
  const trouves: string[] = []
  for (const chapitre of chapitres) {
    const num = extraireNumeroChapitre(chapitre.titre)
    if (num && numerosAttendus.has(num)) {
      resultats.push(`--- ${chapitre.titre} ---\n${chapitre.contenu}`)
      trouves.push(num)
    }
  }
  return { textes: resultats, numerosTrouves: trouves }
}

export function filtrerChapitresParDomaine(
  chapitres: { titre: string; contenu: string; debut: number }[],
  domaine: string,
  type_entite: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
): string[] {
  const motsCles: Record<string, string[]> = {
    PHY: ['chaussée', 'piste', 'voie de circulation', 'aire de trafic', 'surface', 'pavement', 'runway', 'taxiway', 'strip', 'résistance', 'portance', 'friction', 'revêtement', 'chaussée', 'drainage', 'déclivité', 'pente', 'accotement', 'shoulder', 'gradient', 'bearing strength'],
    OLS: ['obstacle', 'surface de limitation', 'cône d\'approche', 'surface de dégagement', 'obstacle limitation', 'transitional surface', 'approach surface', 'inner horizontal', 'conical surface', 'limitation', 'degagement', 'obstacle free', 'zone dégagée', 'funnel'],
    OPS: ['exploitation', 'opération', 'procédure', 'operation', 'procedure', 'vol', 'flight', 'décollage', 'atterrissage', 'take-off', 'landing', 'circulation', 'traffic', 'manœuvre', 'manoeuvre', 'hélicoptère', 'helicopter', 'approche', 'départ', 'departure'],
    ELEC: ['électrique', 'electrical', 'éclairage', 'lighting', 'câble', 'cable', 'alimentation', 'power supply', 'générateur', 'generator', 'lumière', 'light', 'phare', 'balisage lumineux', 'aéronautique', 'aeronautical ground light', 'électricité', 'electricity'],
    RA: ['animalier', 'wildlife', 'oiseau', 'bird', 'faune', 'fauna', 'risque', 'risk', 'fray', 'strike', 'animal', 'danger', 'atténuation', 'mitigation', 'contrôle', 'control', 'chasse', 'effarouchement'],
    MFP: ['marque', 'marking', 'feu', 'light', 'panneau', 'sign', 'balise', 'beacon', 'signalisation', 'marquage', 'balisage', 'indicateur', 'wind cone', 'manche à air', 'signal', 'painted', 'strip'],
    SLI: ['sauvetage', 'incendie', 'rescue', 'fire fighting', 'extincteur', 'extinguisher', 'véhicule', 'vehicle', 'RFFS', 'crash', 'urgence', 'emergency', 'pompier', 'firefighter', 'mousse', 'foam', 'intervention', 'first aid', 'secours'],
    SGS: ['sécurité', 'safety', 'management', 'gestion', 'sms', 'risk management', 'policy', 'politique', 'assurance', 'promotion', 'sécurité', 'danger', 'risque', 'risk', 'occurrence', 'compte rendu', 'reporting', 'prévention', 'prevention', 'culture'],
  }
  const domainMotsCles = motsCles[domaine] || [domaine.toLowerCase()]
  const chapitreTextes: string[] = []
  for (const chapitre of chapitres) {
    const bas = chapitre.contenu.toLowerCase()
    const correspond = domainMotsCles.some(mc => bas.includes(mc.toLowerCase()))
    if (correspond) {
      chapitreTextes.push(`--- ${chapitre.titre} ---\n${chapitre.contenu}`)
    }
  }
  return chapitreTextes
}

