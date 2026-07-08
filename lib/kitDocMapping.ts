export interface SourceMapping {
  ref_pattern: RegExp
  type_oaci?: string
  volume?: string
  partie?: string
  chapitre?: string | string[]
  priorite: 1 | 2 | 3  // 1=RAS (primaire), 2=Doc technique, 3=Guide/autre
}

export interface DomaineDocMapping {
  code: string
  sources: SourceMapping[]
}

export const DOMAINE_DOCUMENTS: DomaineDocMapping[] = [
  {
    code: 'SGS',
    sources: [
      { ref_pattern: /ras\s*19|annexe\s*19/i, type_oaci: 'RAS-14', priorite: 1 },
      { ref_pattern: /doc\s*9859/i, type_oaci: 'Guides', chapitre: ['8', '9'], priorite: 2 },
    ],
  },
  {
    code: 'PHY',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i|ras\s*14.*volume\s*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '3', priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '3', priorite: 1 },
      { ref_pattern: /doc\s*9157.*part.*1/i, type_oaci: 'Guides', partie: '1', chapitre: ['4', '5', '6'], priorite: 2 },
      { ref_pattern: /doc\s*9157.*part.*2/i, type_oaci: 'Guides', partie: '2', chapitre: ['1', '2', '3', '4'], priorite: 2 },
      { ref_pattern: /doc\s*9157.*part.*3/i, type_oaci: 'Guides', partie: '3', chapitre: ['1', '2', '3', '4'], priorite: 2 },
    ],
  },
  {
    code: 'OLS',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i|ras\s*14.*volume\s*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '4', priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '4', priorite: 1 },
      { ref_pattern: /doc\s*9137.*part.*6/i, type_oaci: 'Guides', partie: '6', priorite: 2 },
      { ref_pattern: /cir\s*301/i, priorite: 3 },
    ],
  },
  {
    code: 'OPS',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i|ras\s*14.*volume\s*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: ['2', '9', '10'], priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: ['2', '9', '10'], priorite: 1 },
      { ref_pattern: /doc\s*9981/i, chapitre: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], priorite: 2 },
      // Doc 9981 Partie II = Gestion opérationnelle des aérodromes (chapitres 1-10) -- un seul document
      { ref_pattern: /doc\s*9157.*part.*6/i, priorite: 2 },
      { ref_pattern: /doc\s*9137.*part.*2/i, priorite: 2 },
      { ref_pattern: /doc\s*9137.*part.*8/i, priorite: 2 },
      { ref_pattern: /pans.*aerodromes/i, priorite: 2 },
      { ref_pattern: /grf/i, priorite: 3 },
    ],
  },
  {
    code: 'ELEC',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '9', priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '9', priorite: 1 },
      { ref_pattern: /doc\s*9157.*part.*5/i, priorite: 2 },
    ],
  },
  {
    code: 'RA',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '9', priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '9', priorite: 1 },
      { ref_pattern: /doc\s*9137.*part.*3/i, priorite: 2 },
      { ref_pattern: /doc\s*9332/i, priorite: 3 },
    ],
  },
  {
    code: 'COP',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i|ras\s*14.*volume\s*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '1.4', priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '1.4', priorite: 1 },
      { ref_pattern: /manuel.*métiers.*anacim|manuel.*compétences.*anacim/i, priorite: 2 },
      { ref_pattern: /doc\s*9683/i, priorite: 3 },
    ],
  },
  {
    code: 'MFP',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '5', priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '5', priorite: 1 },
      { ref_pattern: /doc\s*9157.*part.*4/i, priorite: 2 },
    ],
  },
  {
    code: 'SLI',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '9', priorite: 1 },
      { ref_pattern: /annexe\s*14.*vol.*i/i, type_oaci: 'RAS-14', volume: 'I', chapitre: '9', priorite: 1 },
      { ref_pattern: /doc\s*9137.*part.*1/i, priorite: 2 },
      { ref_pattern: /doc\s*9137.*part.*7/i, priorite: 2 },
    ],
  },
]

export const HELISTATION_MAPPING: DomaineDocMapping[] = [
  {
    code: 'SGS',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'SLI',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'PHY',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'OLS',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'RA',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'ELEC',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'MFP',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'COP',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
  {
    code: 'OPS',
    sources: [
      { ref_pattern: /ras\s*14.*vol.*ii/i, type_oaci: 'RAS-14', volume: 'II', priorite: 1 },
      { ref_pattern: /doc\s*9261/i, priorite: 2 },
    ],
  },
]

export function getMappingForDomaine(domaine: string, type_entite: string): DomaineDocMapping | undefined {
  const mappings = type_entite === 'helistation'
    ? HELISTATION_MAPPING
    : DOMAINE_DOCUMENTS
  return mappings.find(m => m.code === domaine)
}

export function matcherDocument(
  doc: { type_document_oaci?: string; reference_base?: string; nom?: string }
): { volume?: string; partie?: string; chapitres?: string[] } {
  const text = `${doc.reference_base || ''} ${doc.nom || ''}`
  for (const domaine of DOMAINE_DOCUMENTS) {
    for (const source of domaine.sources) {
      if (source.type_oaci && doc.type_document_oaci !== source.type_oaci) continue
      if (source.ref_pattern.test(text)) {
        return {
          volume: source.volume,
          partie: source.partie,
          chapitres: Array.isArray(source.chapitre) ? source.chapitre : source.chapitre ? [source.chapitre] : undefined,
        }
      }
    }
  }
  return {}
}

export function getSourcesForDomaine(
  domaine: string,
  type_entite: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
): SourceMapping[] {
  const mapping = getMappingForDomaine(domaine, type_entite === 'helistation' ? 'helistation' : 'aerodrome')
  return mapping?.sources || []
}
