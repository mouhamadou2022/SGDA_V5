// lib/services/officeExtractor.ts
// Lecture locale et RAPIDE des documents Office (Word / Excel / PowerPoint
// modernes : .docx, .xlsx, .pptx = archives ZIP de XML, parsées en
// millisecondes — aucune IA, aucun OCR, aucun réseau).
// Les vieux formats binaires (.doc, .xls, .ppt) sont refusés avec un message
// clair : ils exigent une conversion préalable.

export type FormatOffice = 'docx' | 'xlsx' | 'pptx'
export type UniteLecture = 'pages' | 'feuilles' | 'diapositives'

export interface TexteOffice {
  texte: string
  /** Nombre d'unités (feuilles Excel, diapositives PowerPoint). */
  nbUnites: number
  unite: UniteLecture
  format: FormatOffice
}

const EXTENSIONS: Record<string, FormatOffice> = {
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
}

/** Détecte un format Office supporté depuis le nom de fichier (null sinon). */
export function detecterFormatOffice(nom: string): FormatOffice | null {
  const ext = (nom.split('.').pop() || '').toLowerCase()
  return EXTENSIONS[ext] ?? null
}

/** Vrai vieux format binaire OLE (.doc/.xls/.ppt) : conversion requise. */
export function estVieuxFormatBinaire(nom: string): boolean {
  return /^\.(doc|xls|ppt)$/i.test('.' + (nom.split('.').pop() || '').toLowerCase()) &&
    detecterFormatOffice(nom) === null
}

type ZipLecture = {
  file: (chemin: string) => { asText: () => string } | null
}

async function chargerZip(bytes: ArrayBuffer, nom: string): Promise<ZipLecture> {
  const PizZip = (await import('pizzip')).default
  try {
    return new PizZip(bytes) as ZipLecture
  } catch {
    throw new Error(`Fichier « ${nom} » illisible ou corrompu.`)
  }
}

function lireXml(zip: ZipLecture, chemin: string): Document | null {
  const fichier = zip.file(chemin)
  if (!fichier) return null
  const contenu = fichier.asText()
  return new DOMParser().parseFromString(contenu, 'application/xml')
}

function textesDe(doc: Document | null, balise: string, separateurs: { paragraphe?: string } = {}): string[] {
  if (!doc) return []
  const sorties: string[] = []
  const elements = doc.getElementsByTagName(balise)
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (balise === 'w:p') {
      const morceaux: string[] = []
      const runs = el.getElementsByTagName('w:t')
      for (let j = 0; j < runs.length; j++) morceaux.push(runs[j].textContent || '')
      const ligne = morceaux.join('').trim()
      if (ligne) sorties.push((separateurs.paragraphe || '') + ligne)
    } else {
      const t = (el.textContent || '').trim()
      if (t) sorties.push(t)
    }
  }
  return sorties
}

// ── Word ────────────────────────────────────────────────

function extraireDocx(zip: ZipLecture): { texte: string } {
  const doc = lireXml(zip, 'word/document.xml')
  if (!doc || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Document Word invalide (document.xml introuvable).')
  }
  const paragraphes = textesDe(doc, 'w:p')
  // Tableaux : les w:t sont déjà couverts via les paragraphes des cellules.
  return { texte: paragraphes.join('\n') }
}

// ── Excel ───────────────────────────────────────────────

function colVersIndex(ref: string): number {
  const m = ref.match(/^[A-Z]+/)
  if (!m) return 0
  let n = 0
  for (const ch of m[0]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Convertit un serial Excel en date ISO (base 1900, bug Lotus inclus). */
export function serialExcelVersIso(serial: number): string {
  const base = Date.UTC(1899, 11, 30)
  const d = new Date(base + Math.floor(serial) * 86400000)
  return d.toISOString().slice(0, 10)
}

function stylesDate(zip: ZipLecture): { estDate: (styleId: number) => boolean } {
  const doc = lireXml(zip, 'xl/styles.xml')
  const formatsDate = new Set<number>()
  if (doc) {
    const numFmts = doc.getElementsByTagName('numFmt')
    const codesDate = new Set<string>()
    for (let i = 0; i < numFmts.length; i++) {
      const id = Number(numFmts[i].getAttribute('numFmtId'))
      const code = numFmts[i].getAttribute('formatCode') || ''
      if (/[dmyhs]/i.test(code) && /[-/.:,\s]/.test(code)) codesDate.add(code)
      if (codesDate.has(code)) formatsDate.add(id)
    }
    // Formats intégrés date/heure : 14-22, 27-36, 45-47, 50-58, 165-180 (approx).
    for (let id = 14; id <= 22; id++) formatsDate.add(id)
    for (let id = 27; id <= 36; id++) formatsDate.add(id)
    for (let id = 45; id <= 47; id++) formatsDate.add(id)
    const cellXfs = doc.getElementsByTagName('cellXfs')[0]
    const mapStyleVersFmt = new Map<number, number>()
    if (cellXfs) {
      const xfs = cellXfs.getElementsByTagName('xf')
      for (let i = 0; i < xfs.length; i++) {
        mapStyleVersFmt.set(i, Number(xfs[i].getAttribute('numFmtId') || '0'))
      }
    }
    return { estDate: (s: number) => formatsDate.has(mapStyleVersFmt.get(s) ?? 0) }
  }
  return { estDate: () => false }
}

function extraireXlsx(zip: ZipLecture): { texte: string; nbUnites: number } {
  const classeur = lireXml(zip, 'xl/workbook.xml')
  if (!classeur) throw new Error('Classeur Excel invalide (workbook.xml introuvable).')
  const partagees: string[] = []
  const partageesDoc = lireXml(zip, 'xl/sharedStrings.xml')
  if (partageesDoc) {
    const items = partageesDoc.getElementsByTagName('si')
    for (let i = 0; i < items.length; i++) partagees.push((items[i].textContent || '').trim())
  }
  const { estDate } = stylesDate(zip)
  const feuilles = classeur.getElementsByTagName('sheet')
  const blocs: string[] = []
  for (let f = 0; f < feuilles.length; f++) {
    const nomFeuille = feuilles[f].getAttribute('name') || `Feuille ${f + 1}`
    const feuilleDoc = lireXml(zip, `xl/worksheets/sheet${f + 1}.xml`)
    if (!feuilleDoc) continue
    const lignes = feuilleDoc.getElementsByTagName('row')
    const grille: string[][] = []
    for (let r = 0; r < lignes.length; r++) {
      const cellules = lignes[r].getElementsByTagName('c')
      const ligne: string[] = []
      for (let c = 0; c < cellules.length; c++) {
        const cell = cellules[c]
        const type = cell.getAttribute('t')
        const style = Number(cell.getAttribute('s') || '0')
        const vEl = cell.getElementsByTagName('v')[0]
        const brut = (vEl?.textContent || '').trim()
        let valeur = ''
        if (type === 's') {
          valeur = partagees[Number(brut)] ?? ''
        } else if (type === 'inlineStr') {
          valeur = (cell.getElementsByTagName('t')[0]?.textContent || '').trim()
        } else if (type === 'b') {
          valeur = brut === '1' ? 'VRAI' : 'FAUX'
        } else if (brut !== '') {
          const num = Number(brut)
          valeur = !Number.isNaN(num) && estDate(style) && num > 1000 && num < 80000
            ? serialExcelVersIso(num)
            : brut
        }
        const idx = colVersIndex(cell.getAttribute('r') || '')
        ligne[idx] = valeur
      }
      if (ligne.some(v => (v || '').trim() !== '')) {
        grille.push(ligne.map(v => v || ''))
      }
    }
    if (grille.length > 0) {
      blocs.push(`--- Feuille : ${nomFeuille} ---\n${grille.map(l => l.join('\t')).join('\n')}`)
    }
  }
  return { texte: blocs.join('\n\n'), nbUnites: feuilles.length }
}

// ── PowerPoint ──────────────────────────────────────────

function extrairePptx(zip: ZipLecture): { texte: string; nbUnites: number } {
  const presentation = lireXml(zip, 'ppt/presentation.xml')
  if (!presentation) throw new Error('Présentation invalide (presentation.xml introuvable).')
  const ids = presentation.getElementsByTagName('p:sldId')
  const blocs: string[] = []
  for (let i = 0; i < ids.length; i++) {
    const diapo = lireXml(zip, `ppt/slides/slide${i + 1}.xml`)
    const lignes = textesDe(diapo, 'a:t')
    // Notes du présentateur (précieuses pour l'IA).
    const notes = lireXml(zip, `ppt/notesSlides/notesSlide${i + 1}.xml`)
    const lignesNotes = textesDe(notes, 'a:t')
    const corps = [...lignes, ...(lignesNotes.length > 0 ? [`[Notes : ${lignesNotes.join(' ')}]`] : [])]
    if (corps.length > 0) blocs.push(`--- Diapositive ${i + 1} ---\n${corps.join('\n')}`)
  }
  return { texte: blocs.join('\n\n'), nbUnites: ids.length }
}

// ── Entrée principale ───────────────────────────────────

/** Extrait le texte d'un fichier Office depuis son contenu binaire. */
export async function extractTextFromOffice(data: ArrayBuffer, nom: string): Promise<TexteOffice> {
  const format = detecterFormatOffice(nom)
  if (!format) {
    if (estVieuxFormatBinaire(nom)) {
      throw new Error(
        `Format « ${nom.split('.').pop()} » trop ancien (Word/Excel/PowerPoint 97-2003). ` +
        `Convertissez-le en .docx / .xlsx / .pptx puis redéposez-le.`,
      )
    }
    throw new Error(`Format non pris en charge : « ${nom} ». Formats acceptés : PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx).`)
  }
  const zip = await chargerZip(data, nom)
  if (format === 'docx') {
    return { ...extraireDocx(zip), nbUnites: 0, unite: 'pages', format }
  }
  if (format === 'xlsx') {
    const { texte, nbUnites } = extraireXlsx(zip)
    return { texte, nbUnites, unite: 'feuilles', format }
  }
  const { texte, nbUnites } = extrairePptx(zip)
  return { texte, nbUnites, unite: 'diapositives', format }
}
