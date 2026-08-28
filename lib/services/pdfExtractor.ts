import { getMappingForDomaine } from '@/lib/kitDocMapping'

// Helper : détecte si le texte extrait est probablement un scan (trop court ou peu de contenu)
function estProbablementScan(texte: string): boolean {
  const lignes = texte.split('\n').filter(l => l.trim().length > 0)
  // Si moins de 3 lignes non vides sur une page moyenne, c'est probablement un scan
  const ratio = lignes.length / Math.max(1, 1)
  return ratio < 5
}

// OCR via Tesseract.js sur une page PDF rendue en canvas
async function ocrPageAvecTesseract(
  pagePdf: any,
  pageNumber: number
): Promise<string> {
  // Render the page as a canvas
  const canvas = await pagePdf.getCanvas({
    viewport: { width: 595, height: 842 }, // A4 par défaut en points
  })

  // Convertir le canvas en data URI que Tesseract peut traiter
  const context = canvas.getContext('2d')
  const dataUrl = canvas.toDataURL('image/jpeg', 1.0)

  // Tesseract.js : initialisation et OCR
  const { createWorker } = await import('tesseract.js')
  const worker = createWorker('fra') as any

  // Charger la langue et démarrer reconnaissance
  await worker.load()
  await worker.setParameters({ tessedit_ocr_engine_mode: 1 })

  // Lancer reconnaissance et attendre le résultat via promesse
  const result: any = await new Promise((resolve, reject) => {
    worker.recognize(dataUrl, (err: any, result: any) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

  // Nettoyage
  worker.terminate()

  // Extraire le texte du résultat - accès sécurisé
  const texte: string = (result && result.data && result.data.text
    ? result.data.text
    : '') || ''

  return texte.trim()
}

// ────────────────────────────────────────────────────────────
// Extraction principale : pdfjs-dist d'abord, puis OCR fallback
// ────────────────────────────────────────────────────────────
export async function extractTextFromPDF(blobUrl: string): Promise<{
  texte_complet: string
  chapitres: { titre: string; contenu: string; debut: number }[]
  nb_pages: number
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(blobUrl, { signal: controller.signal })
    const arrayBuffer = await response.arrayBuffer()
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

    // D'abord essayer l'extraction texte classique
    const pagesTexte: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const textePage = content.items.map((item: any) => item.str).join(' ')
      pagesTexte.push(textePage)
    }

    const texteClassique = pagesTexte.join('\n')

    // Si le texte extrait semble être un scan (peu de contenu), utiliser l'OCR
    const besoinOCR = estProbablementScan(texteClassique) || pdf.numPages > 50 // OCR pour les très gros docs

    let texteFinal: string
    if (besoinOCR) {
      // OCR page par page via Tesseract
      const pagesOCR: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const texteOcr = await ocrPageAvecTesseract(page, i)
        pagesOCR.push(texteOcr)
      }
      texteFinal = pagesOCR.join('\n')
      console.log(`[pdfExtractor] OCR appliqué sur ${pdf.numPages} pages (scan détecté)`)
    } else {
      texteFinal = texteClassique
      console.log(`[pdfExtractor] Texte extrait directement (pas de scan détecté)`)
    }

    const chapitres = decouperChapitres(texteFinal)
    return { texte_complet: texteFinal, chapitres, nb_pages: pdf.numPages }
  } finally {
    clearTimeout(timeout)
  }
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

