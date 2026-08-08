import type { DomaineChecklist, ChecklistItem } from '@/lib/store'
import type { SGSQuestion, SGSDirectives, SGSGuideEtape } from '@/types/checklist'

export type ChecklistParseType = 'IT' | 'SOP' | 'QSC' | 'SGS' | 'VALIDATION_SITE' | 'HMG' | 'COP' | 'AUT'

function detectTemplateType(filename: string, text: string): { type: ChecklistParseType; code: string } {
  const upper = text.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const fn = filename.toUpperCase()

  // SGS doit être vérifié avant QSC : un fichier SGS peut contenir le mot
  // "continue"/"continues" dans son texte d'introduction (ex. "évaluations
  // continues"), ce qui matchait par erreur l'heuristique QSC ci-dessous
  // et faisait basculer TOUT le fichier sur le mauvais parseur (aucune
  // section SGS_PAOE, donc ni directives ni guide d'évaluation extraits).
  if (fn.includes('SGS') || upper.includes('SYSTEME DE GESTION DE LA SECURITE') || upper.includes('EVALUATION DE LA MISE EN OEUVRE')) {
    return { type: 'SGS', code: 'SGS_PAOE' }
  }
  // CHCKLIT / QSC / Surveillance Continue — doit passer AVANT SOP
  if (fn.includes('CHCKLIT') || fn.includes('QSC') || upper.includes('SURVEILLANCE')) {
    return { type: 'QSC', code: 'QSC_CONTINUE' }
  }
  if (fn.includes('SOP') || upper.includes('PROCEDURES D\'EXPLOITATION NORMALISEES')) {
    const sub = fn.includes('COMPETENCE') || fn.includes('FORMATION') ? 'COMPETENCE'
      : fn.includes('SGS') ? 'SGS'
      : fn.includes('PROCEDURE') || fn.includes('EXPLOITATION') ? 'PROCEDURES'
      : 'GENERAL'
    return { type: 'SOP', code: `SOP_CHKLIST_${sub}` }
  }
  // COP (Contrôle des Opérations en Piste) — avant IT
  if (fn.includes('COP') && !fn.includes('COPY') && !fn.includes('SCOP')) {
    return { type: 'COP', code: 'COP_CHKLIST_GENERAL' }
  }
  if (fn.includes('IT_') || upper.includes('INSPECTION TECHNIQUE') || upper.includes('LISTE DE VERIFICATIONS AERODROMES')) {
    const sub = fn.includes('OBSTACLE') ? 'LIMITATION_OBSTACLES'
      : fn.includes('SLI') || fn.includes('SSLIA') || fn.includes('SAUVETAGE') ? 'SLI'
      : fn.includes('RA') || fn.includes('RÉSEAU') || fn.includes('RESEAU') ? 'RESEAUX_ELECTRIQUES'
      : fn.includes('PHYSIQUE') || fn.includes('CARACTÉRISTIQUE') ? 'CARACTERISTIQUES_PHYSIQUES'
      : 'GENERAL'
    return { type: 'IT', code: `IT_CHKLIST_${sub}` }
  }
  // Homologation (Aérodrome / Hélistation) — avant VS qui matche aussi "HOMOLOGATION"
  if (fn.includes('HMG') || fn.includes('HOMOLOGATION') || upper.includes('HOMOLOGATION')) {
    return { type: 'HMG', code: 'HMG_CHKLIST_GENERAL' }
  }
  if (fn.includes('VS_') || fn.includes('VALIDATION') || upper.includes('VALIDATION DE SITE') || upper.includes('CONSTRUCTION') || (upper.includes('HOMOLOGATION') && (upper.includes('SITE') || upper.includes('TERRAIN')))) {
    const sub = fn.includes('ETUDE') || fn.includes('TOPO') || upper.includes('TOPOGRAPHIE') ? 'ETUDES_PREALABLES'
      : fn.includes('TER') || fn.includes('VRD') || upper.includes('TERRASSEMENT') ? 'TERRASSEMENT_VRD'
      : fn.includes('GENIE') || fn.includes('INFRA') || upper.includes('GENIE CIVIL') ? 'GENIE_CIVIL'
      : fn.includes('ENV') || fn.includes('IMPACT') || upper.includes('ENVIRONNEMENT') || upper.includes('ETUDE IMPACT') ? 'ENVIRONNEMENT'
      : fn.includes('BALISAGE') || fn.includes('EQUIP') || fn.includes('AIDE') ? 'EQUIPEMENTS'
      : fn.includes('SECURITE') || fn.includes('SURETE') || fn.includes('CLOTURE') ? 'SECURITE_PERIMETRE'
      : 'GENERAL'
    return { type: 'VALIDATION_SITE', code: `VS_CHKLIST_${sub}` }
  }
  return { type: 'QSC', code: 'QSC_CONTINUE' }
}

function guessDomaineFromSection(sectionNum: string, type?: string): string {
  if (type === 'VALIDATION_SITE') {
    const n = parseFloat(sectionNum)
    if (n >= 1 && n < 2) return 'ETU'     // Études préliminaires / topographie
    if (n >= 2 && n < 3) return 'ENV'     // Environnement / impact
    if (n >= 3 && n < 4) return 'TER'     // Terrassement / VRD
    if (n >= 4 && n < 5) return 'GEN'     // Génie civil / infrastructures
    if (n >= 5 && n < 6) return 'EQU'     // Équipements / balisage
    if (n >= 6 && n < 7) return 'SEC'     // Sécurité / sûreté périmètre
    return 'ETU'
  }
  const n = parseFloat(sectionNum)
  if (n >= 1 && n < 2) return 'PHY'
  if (n >= 2 && n < 3) return 'OBS'
  if (n >= 3 && n < 4) return 'OPS'
  if (n >= 4 && n < 5) return 'SLI'
  if (n >= 5 && n < 6) return 'SGS'
  return 'PHY'
}

export async function parseChecklistWord(
  file: File,
  forcedType?: ChecklistParseType,
): Promise<{
  template: { type: ChecklistParseType; code: string; nom: string; version: string; portee: string[]; type_entite_cible: string }
  hierarchie: DomaineChecklist[]
}> {
  const buffer = await file.arrayBuffer()
  const zip = new Uint8Array(buffer)

  const header = new Uint8Array([0x50, 0x4B, 0x03, 0x04])
  const isZip = zip[0] === header[0] && zip[1] === header[1] && zip[2] === header[2] && zip[3] === header[3]
  if (!isZip) {
    throw new Error('Format non supporté. Seuls les fichiers .docx (Word) sont acceptés.')
  }

  const { unzipSync, strFromU8 } = await import('fflate')
  const unzipped = unzipSync(new Uint8Array(buffer))
  const docKey = Object.keys(unzipped).find(k => k === 'word/document.xml')
  if (!docKey) throw new Error('Fichier .docx invalide : pas de document.xml.')
  const docXml = strFromU8(unzipped[docKey])

  if (!docXml) throw new Error('Impossible de lire le contenu du document.')

  const itemRegex = /<w:p[^>]*>[\s\S]*?<\/w:p>/g
  const textRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g
  const paragraphs: string[] = []
  let match: RegExpExecArray | null
  while ((match = itemRegex.exec(docXml)) !== null) {
    const texts: string[] = []
    let tMatch: RegExpExecArray | null
    while ((tMatch = textRegex.exec(match[0])) !== null) {
      texts.push(tMatch[1])
    }
    if (texts.length > 0) paragraphs.push(texts.join(''))
  }

  const detected = detectTemplateType(file.name, paragraphs.slice(0, 50).join(' '))
  const type = forcedType || detected.type
  const code = forcedType && forcedType !== detected.type
    ? (forcedType === 'SGS' ? 'SGS_PAOE'
      : forcedType === 'QSC' ? 'QSC_CONTINUE'
      : forcedType === 'IT' ? 'IT_CHKLIST_GENERAL'
      : forcedType === 'SOP' ? 'SOP_CHKLIST_GENERAL'
      : forcedType === 'HMG' ? 'HMG_CHKLIST_GENERAL'
      : forcedType === 'COP' ? 'COP_CHKLIST_GENERAL'
      : forcedType === 'AUT' ? 'AUT_GENERAL'
      : 'VS_CHKLIST_GENERAL')
    : detected.code

  // ─── Branche SGS : format PAOE (RAS 19) ─────────────────────────
  if (type === 'SGS') {
    return parseSGSChecklist(paragraphs, code, file.name, docXml)
  }

  const sectionRegex = /^(\d+(?:\.\d+)*)\s*[.—–]\s*(.+)/

  interface RawItem {
    sectionNum: string
    sectionLabel: string
    ref: string
    question: string
    directive: string
    numItem: string
  }

  const rawItems: RawItem[] = []
  let currentSection = ''
  let currentSectionNum = ''
  let pendingRefs: string[] = []
  let currentQuestion = ''
  let currentDirective = ''
  let currentNumItem = ''

  for (const p of paragraphs) {
    const trimmed = p.trim()
    if (!trimmed) continue

    // Detection en-tête de section: "6.4. Délégation d'activités..."
    const sectionMatch = trimmed.match(sectionRegex)
    if (sectionMatch && !trimmed.match(/^(?:IT|SOP|QSC|VS)\d+/i)) {
      const num = sectionMatch[1]
      const label = sectionMatch[2]
      const parts = num.split('.')
      if (parts.length === 1 || parts.length === 2 || (parts.length === 3 && !label.toUpperCase().includes('PISTE') && !label.toUpperCase().includes('ACCOTEMENT'))) {
        // Vider l'item en cours si on change de section
        if (currentNumItem) {
          rawItems.push({
            sectionNum: currentSectionNum, sectionLabel: currentSection,
            ref: pendingRefs.join(' ; '), question: currentQuestion, directive: currentDirective, numItem: currentNumItem,
          })
          currentNumItem = ''; currentQuestion = ''; currentDirective = ''; pendingRefs = []
        }
        currentSection = label
        currentSectionNum = num
        continue
      }
    }

    // Index interne (ex: "PQ8.138") — on ignore
    if (/^PQ\d+(?:\.\d+)*\s*$/.test(trimmed)) continue

    // Ligne résultat: "S / NS / NA / NV" — vide l'item en cours
    if (/^(S\s+NS|SA\s+NS)/i.test(trimmed) || (/^[SNSNVAN]+\s+/.test(trimmed) && /[SN]/.test(trimmed))) {
      if (currentNumItem) {
        rawItems.push({
          sectionNum: currentSectionNum, sectionLabel: currentSection,
          ref: pendingRefs.join(' ; '), question: currentQuestion, directive: currentDirective, numItem: currentNumItem,
        })
        currentNumItem = ''; currentQuestion = ''; currentDirective = ''; pendingRefs = []
      }
      continue
    }

    // Référence réglementaire sur sa propre ligne: "RAS 14 Vol. I, 2.9.1..."
    if (/^\s*(?:RAS|Doc|PANS|OACI|Annexe|Circulaire)\s/i.test(trimmed)) {
      // Si on est en train de collecter une question, c'est une ligne de suite de ref
      if (currentNumItem && !/^QSC\d/i.test(trimmed)) {
        pendingRefs.push(trimmed)
      } else if (!currentNumItem) {
        pendingRefs.push(trimmed)
      }
      continue
    }

    // Ligne de référence supplémentaire (ex: "§ 5.4 n)" ou "App. 1 au C2")
    if (/^[§§]?\s*\d+(?:\.\d+)*\s/.test(trimmed) || /^(?:App|Suppl|Part|Vol)/i.test(trimmed)) {
      if (pendingRefs.length > 0) {
        pendingRefs[pendingRefs.length - 1] += ' ' + trimmed
      }
      continue
    }

    // Ligne de référence: "PANS AGA Supplément C au Chapitre 2" (continuation)
    if (/^PANS\s/i.test(trimmed)) {
      if (currentNumItem && !currentQuestion) {
        pendingRefs.push(trimmed)
      } else if (!currentNumItem) {
        pendingRefs.push(trimmed)
      }
      continue
    }

    // Question: "QSC50. L'exploitant d'aérodrome assure-t-il..."
    // ou "IT1.1 — RAS 14 § 5.1 Vérifier le balisage..." (ref inline)
    const itemMatch = trimmed.match(/^((?:IT|SOP|QSC|VS)\d+(?:\.\d+)*)\s*[.—–]\s*(.+)/i)
    if (itemMatch) {
      // Vider l'item précédent si existant
      if (currentNumItem) {
        rawItems.push({
          sectionNum: currentSectionNum, sectionLabel: currentSection,
          ref: pendingRefs.join(' ; '), question: currentQuestion, directive: currentDirective, numItem: currentNumItem,
        })
        pendingRefs = []
      }
      currentNumItem = itemMatch[1]
      const rest = itemMatch[2].trim()

      // Vérifier si une référence réglementaire est incluse sur la même ligne
      // (format: "RAS 14 § 5.1 Vérifier le balisage...")
      const inlineRefMatch = rest.match(/^((?:RAS|Doc|PANS|OACI|Annexe|Circulaire)\s[^A-Z]*?)\s*(?=[A-ZÉÈÊËÀÂÄÎÏÔÖÙÛÜ].{3,})/)
      if (inlineRefMatch) {
        pendingRefs.push(inlineRefMatch[1].trim())
        currentQuestion = rest.slice(inlineRefMatch[0].length).trim()
      } else {
        // Référence depuis les lignes précédentes OU le numéro item comme fallback
        currentQuestion = rest
      }
      currentDirective = ''
      continue
    }

    // Étapes du guide d'évaluation (directives)
    if (/^(Vérifier|Examiner|Demander|S'assurer|Évaluer|Procéder|Contrôler)/i.test(trimmed)) {
      if (currentNumItem) {
        currentDirective += (currentDirective ? '\n' : '') + trimmed
      }
      continue
    }

    // Marqueurs indicateurs: "S  NS  NA  NV" simple
    if (/^S\s+NS/.test(trimmed) || (/^S\s*$/.test(trimmed) && currentNumItem)) {
      if (currentNumItem) {
        rawItems.push({
          sectionNum: currentSectionNum, sectionLabel: currentSection,
          ref: pendingRefs.join(' ; '), question: currentQuestion, directive: currentDirective, numItem: currentNumItem,
        })
        currentNumItem = ''; currentQuestion = ''; currentDirective = ''; pendingRefs = []
      }
      continue
    }

    // Ligne de référence "§ 5.4 n)" seule (sans préfixe RAS/Doc)
    if (/^§/.test(trimmed)) {
      if (pendingRefs.length > 0) {
        pendingRefs[pendingRefs.length - 1] += ' ' + trimmed
      }
      continue
    }
  }

  // Dernier item
  if (currentNumItem) {
    rawItems.push({
      sectionNum: currentSectionNum, sectionLabel: currentSection,
      ref: pendingRefs.join(' ; '), question: currentQuestion, directive: currentDirective, numItem: currentNumItem,
    })
  }

  const sectionMap = new Map<string, DomaineChecklist>()
  // Garantir des IDs uniques par section : un numItem répété (ex. QSC08 dans
  // deux lignes du doc source) produirait des clés React dupliquées.
  const usedIdsBySection = new Map<string, Set<string>>()
  for (const raw of rawItems) {
    const domaineCode = guessDomaineFromSection(raw.sectionNum, type)
    if (!sectionMap.has(raw.sectionNum)) {
      const domaineNom = raw.sectionLabel || `Section ${raw.sectionNum}`
      sectionMap.set(raw.sectionNum, {
        id: `${code}_SEC${raw.sectionNum}`,
        nom: domaineCode,
        description: domaineNom,
        items: [],
        sousDomaines: [],
        isExpanded: true,
        progression: 0,
        ordre: sectionMap.size,
      })
      usedIdsBySection.set(raw.sectionNum, new Set<string>())
    }
    const domaine = sectionMap.get(raw.sectionNum)!
    const usedIds = usedIdsBySection.get(raw.sectionNum)!
    const idx = (domaine.items?.length ?? 0) + 1
    let baseId = `${code}_${raw.numItem || raw.ref || idx}`
    let itemId = baseId
    let suffix = 2
    while (usedIds.has(itemId)) {
      itemId = `${baseId}_${suffix++}`
    }
    usedIds.add(itemId)
    domaine.items!.push({
      id: itemId,
      surveillance_id: '',
      type_checklist: 'standard',
      categorie: domaineCode,
      reference_ras14: raw.ref || '',
      description: raw.question || raw.ref,
      directive_preuve: raw.directive || '',
      domaine: domaineCode,
      ordre: idx,
      last_modified: new Date().toISOString(),
      modified_by: 'import',
      numero: raw.numItem || `${idx}`,
      reference_reglementaire: raw.ref,
      point_verification: raw.question,
      prediction: 'NV',
      confiance: 30,
      alerte: false,
      prefilled: false,
    })
  }

  const domaines = Array.from(sectionMap.values())
  const portee = [...new Set(rawItems.map(r => guessDomaineFromSection(r.sectionNum, type)))]

  const versionMatch = file.name.match(/(\w+\s+\d{4})/)
  const version = versionMatch ? versionMatch[1] : ''

  return {
    template: {
      type,
      code,
      nom: file.name.replace(/\.docx$/i, ''),
      version,
      portee,
      type_entite_cible: type === 'VALIDATION_SITE' ? 'tous' : 'aerodrome',
    },
    hierarchie: domaines,
  }
}

// ─── Parseur dédié SGS (format PAOE, RAS 19) ─────────────────────

const SGS_SECTION_LABELS: Record<number, string> = {
  1: 'POLITIQUES ET OBJECTIFS EN MATIÈRE DE SÉCURITÉ',
  2: 'GESTION DES RISQUES DE SÉCURITÉ',
  3: 'ASSURANCE DE LA SÉCURITÉ',
  4: 'PROMOTION DE LA SÉCURITÉ',
  5: 'GESTION DES INTERFACES',
}

/**
 * Découpe le XML du document en tableaux -> lignes -> cellules (texte
 * uniquement, paragraphes internes joints par des sauts de ligne).
 *
 * C'est la seule structure qui permette de retrouver de façon fiable
 * quel texte appartient à quel indicateur ou à quel niveau (Présent /
 * Approprié / Opérationnel / Efficace) : à plat, la liste des
 * paragraphes ne porte aucune information sur les limites de cellule,
 * et deux cellules voisines peuvent avoir un nombre de paragraphes
 * différent — d'où les mélanges de contenu observés précédemment.
 */
function parseDocxTables(docXml: string): string[][][] {
  const tables: string[][][] = []
  const tblRegex = /<w:tbl>([\s\S]*?)<\/w:tbl>/g
  let tblMatch: RegExpExecArray | null
  while ((tblMatch = tblRegex.exec(docXml)) !== null) {
    const rows: string[][] = []
    const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
    let trMatch: RegExpExecArray | null
    while ((trMatch = trRegex.exec(tblMatch[1])) !== null) {
      const cells: string[] = []
      const tcRegex = /<w:tc>([\s\S]*?)<\/w:tc>/g
      let tcMatch: RegExpExecArray | null
      while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
        const paragraphs: string[] = []
        const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g
        let pMatch: RegExpExecArray | null
        while ((pMatch = pRegex.exec(tcMatch[1])) !== null) {
          const texts: string[] = []
          const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g
          let tMatch: RegExpExecArray | null
          while ((tMatch = tRegex.exec(pMatch[1])) !== null) texts.push(tMatch[1])
          const paraText = texts.join('').trim()
          if (paraText) paragraphs.push(paraText)
        }
        cells.push(paragraphs.join('\n'))
      }
      rows.push(cells)
    }
    tables.push(rows)
  }
  return tables
}

/**
 * Le titre de chaque élément (ex. "Engagement de la direction" pour 1.1)
 * n'est pas dans une cellule de tableau : c'est un paragraphe isolé entre
 * la fin du tableau précédent et le début de celui de l'élément suivant.
 * On ne le trouve donc qu'en relisant le XML brut hors des <w:tbl>, un par
 * tableau (null si le tableau est une continuation du même élément — dans
 * ce cas il n'y a aucun texte entre les deux tableaux).
 */
function extractTitleBeforeEachTable(docXml: string): (string | null)[] {
  const spans: { start: number; end: number }[] = []
  const tblRegex = /<w:tbl>[\s\S]*?<\/w:tbl>/g
  let m: RegExpExecArray | null
  while ((m = tblRegex.exec(docXml)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length })
  }

  const extractParas = (segment: string): string[] => {
    const out: string[] = []
    const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g
    let pMatch: RegExpExecArray | null
    while ((pMatch = pRegex.exec(segment)) !== null) {
      const texts: string[] = []
      const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g
      let tMatch: RegExpExecArray | null
      while ((tMatch = tRegex.exec(pMatch[1])) !== null) texts.push(tMatch[1])
      const text = texts.join('').trim()
      if (text) out.push(text)
    }
    return out
  }

  return spans.map((span, i) => {
    const prevEnd = i === 0 ? 0 : spans[i - 1].end
    const paras = extractParas(docXml.slice(prevEnd, span.start))
    // Le titre est le dernier paragraphe du segment qui n'est pas un titre
    // de composante (tout en majuscules, ex. "POLITIQUES ET OBJECTIFS...").
    for (let j = paras.length - 1; j >= 0; j--) {
      const p = paras[j]
      const isComposanteHeading = p === p.toUpperCase() && p.length > 3
      if (!isComposanteHeading && p.length > 2 && p.length < 150) return p
    }
    return null
  })
}

interface SGSGuidanceBlock {
  present: string
  approprie: string
  operationnel: string
  efficace: string
  guideActions: string[]
}

interface SGSTableExtraction {
  items: { numero: string; question: string }[]
  guidanceByElement: Record<string, SGSGuidanceBlock[]>
  elementTitles: Record<string, string>
}

/**
 * Parcourt les tableaux et, pour chaque groupe d'indicateurs, associe
 * les questions (X.X.X) au bloc "Orientation" qui les suit dans le
 * même tableau : "Directives pour l'examen des preuves" (les actions
 * à mener) puis les niveaux Présent / Approprié / Opérationnel /
 * Efficace (le contenu de la cellule suivant chaque étiquette).
 *
 * Un même élément (X.X) est souvent couvert par plusieurs tableaux
 * successifs (ex. 1.1.1-1.1.3 puis 1.1.4-1.1.5 puis 1.1.6-1.1.7...),
 * chacun avec son propre bloc d'orientation : les blocs sont donc
 * accumulés par élément plutôt qu'écrasés ou fusionnés en texte libre.
 */
function extractSGSTableData(tables: string[][][], tableTitles: (string | null)[]): SGSTableExtraction {
  const items: { numero: string; question: string }[] = []
  const guidanceByElement: Record<string, SGSGuidanceBlock[]> = {}
  const elementTitles: Record<string, string> = {}

  // Le bloc Présent/Approprié/Opérationnel/Efficace d'un groupe se retrouve
  // parfois dans un <w:tbl> distinct de celui qui contient les questions et
  // les directives (tableau Word coupé par un saut de page). On traite donc
  // toutes les lignes de tous les tableaux comme un flux continu, dans
  // l'ordre du document, plutôt que de raisonner tableau par tableau — en
  // gardant l'index du tableau d'origine de chaque ligne pour retrouver son
  // titre éventuel.
  const rows: { cells: string[]; tableIdx: number }[] = tables.flatMap((t, tableIdx) => t.map(cells => ({ cells, tableIdx })))

  let currentItemNumeros: string[] = []
  let guide: SGSGuidanceBlock | null = null

  const flushGroup = () => {
    if (guide && currentItemNumeros.length > 0) {
      const elementIds = new Set(currentItemNumeros.map(n => n.split('.').slice(0, 2).join('.')))
      for (const elementId of elementIds) {
        if (!guidanceByElement[elementId]) guidanceByElement[elementId] = []
        guidanceByElement[elementId].push(guide as SGSGuidanceBlock)
      }
    }
    currentItemNumeros = []
    guide = null
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].cells

    const numeroIdx = row.findIndex(c => /^\d+\.\d+\.\d+$/.test(c.trim()))
    if (numeroIdx !== -1) {
      // Une nouvelle série de questions (ex. 1.1.4) qui suit un groupe déjà
      // pourvu de son orientation ferme ce groupe précédent.
      if (guide && currentItemNumeros.length > 0) flushGroup()
      const numero = row[numeroIdx].trim()
      const question = (row[numeroIdx + 1] || '').trim()
      if (question) {
        items.push({ numero, question })
        currentItemNumeros.push(numero)
        const elementId = numero.split('.').slice(0, 2).join('.')
        if (!elementTitles[elementId]) {
          const title = tableTitles[rows[i].tableIdx]
          if (title) elementTitles[elementId] = title
        }
      }
      continue
    }

    const isDirectivesLabel = row.some(c => /directives/i.test(c) && /examen/i.test(c))
    if (isDirectivesLabel) {
      const nextRow = rows[i + 1]?.cells
      const actionsCell = nextRow ? nextRow[nextRow.length - 1] : ''
      guide = guide || { present: '', approprie: '', operationnel: '', efficace: '', guideActions: [] }
      guide.guideActions = (actionsCell || '').split('\n').map(s => s.trim()).filter(Boolean)
      continue
    }

    const presentIdx = row.findIndex(c => c.trim() === 'Présent')
    if (presentIdx !== -1) {
      const approprieIdx = row.findIndex(c => c.trim() === 'Approprié')
      const operationnelIdx = row.findIndex(c => c.trim() === 'Opérationnel')
      const efficaceIdx = row.findIndex(c => c.trim() === 'Efficace')
      const contentRow = rows[i + 1]?.cells
      if (contentRow) {
        guide = guide || { present: '', approprie: '', operationnel: '', efficace: '', guideActions: [] }
        guide.present = (contentRow[presentIdx] || '').trim()
        if (approprieIdx !== -1) guide.approprie = (contentRow[approprieIdx] || '').trim()
        if (operationnelIdx !== -1) guide.operationnel = (contentRow[operationnelIdx] || '').trim()
        if (efficaceIdx !== -1) guide.efficace = (contentRow[efficaceIdx] || '').trim()
      }
      continue
    }
  }
  flushGroup()

  return { items, guidanceByElement, elementTitles }
}

interface SGSGlobalDefinitions {
  present: string
  approprie: string
  operationnel: string
  efficace: string
  directives: string
}

/**
 * Définitions génériques données en tête de document (avant la première
 * section), utilisées uniquement en secours pour un élément dont aucun
 * tableau ne fournit son propre bloc "Orientation".
 */
function extractGlobalPAOEDefinitions(paragraphs: string[]): SGSGlobalDefinitions | null {
  let firstSectionIdx = -1
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim()
    if (p === p.toUpperCase() && p.length > 10 &&
        !p.includes('ANACIM') && !p.includes('BP') && !p.includes('EMAIL') &&
        !p.includes('TEL') && !p.includes('AGENCE') && !p.includes('EVALUATION') &&
        !p.includes('INFORMATIONS')) {
      firstSectionIdx = i
      break
    }
  }
  if (firstSectionIdx <= 0) return null

  const result: SGSGlobalDefinitions = { present: '', approprie: '', operationnel: '', efficace: '', directives: '' }
  let inDirectives = false
  for (let i = 0; i < firstSectionIdx; i++) {
    const p = paragraphs[i].trim()
    if (/^Présent\s*\(P\)\s*:/i.test(p)) { result.present = p.replace(/^Présent\s*\(P\)\s*:\s*/i, '').trim(); inDirectives = false; continue }
    if (/^Approprié\s*\(A\)\s*:/i.test(p)) { result.approprie = p.replace(/^Approprié\s*\(A\)\s*:\s*/i, '').trim(); inDirectives = false; continue }
    if (/^Opérationnel\s*\(O\)\s*:/i.test(p)) { result.operationnel = p.replace(/^Opérationnel\s*\(O\)\s*:\s*/i, '').trim(); inDirectives = false; continue }
    if (/^Efficace\s*\(E\)\s*:/i.test(p)) { result.efficace = p.replace(/^Efficace\s*\(E\)\s*:\s*/i, '').trim(); inDirectives = false; continue }
    const pNorm = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    if (pNorm.includes('directives') && pNorm.includes('examen')) { inDirectives = true; continue }
    if (inDirectives && p.length > 10) result.directives += (result.directives ? '\n' : '') + p
  }
  const hasContent = result.present || result.approprie || result.operationnel || result.efficace || result.directives
  return hasContent ? result : null
}

function parseSGSChecklist(
  paragraphs: string[],
  code: string,
  filename: string,
  docXml: string,
): {
  template: { type: 'SGS'; code: string; nom: string; version: string; portee: string[]; type_entite_cible: string }
  hierarchie: DomaineChecklist[]
} {
  const tables = parseDocxTables(docXml)
  const tableTitles = extractTitleBeforeEachTable(docXml)
  const { items, guidanceByElement, elementTitles } = extractSGSTableData(tables, tableTitles)
  const globalDefinitions = extractGlobalPAOEDefinitions(paragraphs)

  // Regrouper les questions par composante (1er chiffre du numéro d'item)
  interface SGSItem { numero: string; question: string; composante: number }
  const compMap = new Map<number, SGSItem[]>()
  for (const item of items) {
    const composante = parseInt(item.numero.split('.')[0], 10)
    if (!compMap.has(composante)) compMap.set(composante, [])
    compMap.get(composante)!.push({ ...item, composante })
  }

  const domaines: DomaineChecklist[] = []
  const sortedComposantes = [...compMap.keys()].sort((a, b) => a - b)
  for (const compNum of sortedComposantes) {
    const compItems = compMap.get(compNum)!
    const sectionLabel = SGS_SECTION_LABELS[compNum] || `Composante ${compNum}`
    const itemsList: ChecklistItem[] = compItems.map((item, idx) => ({
      id: `${code}_${item.numero.replace(/\./g, '_')}`,
      surveillance_id: '',
      type_checklist: 'standard',
      categorie: 'SGS',
      reference_ras14: 'RAS 19',
      description: item.question || item.numero,
      directive_preuve: '',
      domaine: 'SGS',
      ordre: idx + 1,
      last_modified: new Date().toISOString(),
      modified_by: 'import',
      numero: item.numero,
      reference_reglementaire: 'RAS 19',
      point_verification: item.question,
      prediction: 'NV',
      confiance: 30,
      alerte: false,
      prefilled: false,
    }))

    domaines.push({
      id: `${code}_COMP${compNum}`,
      nom: 'SGS',
      description: `${sectionLabel} (${compItems.length} questions)`,
      items: itemsList,
      sousDomaines: [],
      isExpanded: true,
      progression: 0,
      ordre: domaines.length,
      _sgsGuidanceByElement: guidanceByElement,
      _sgsGlobalDefinitions: globalDefinitions,
      _sgsElementTitles: elementTitles,
    } as DomaineChecklist & {
      _sgsGuidanceByElement?: Record<string, SGSGuidanceBlock[]>
      _sgsGlobalDefinitions?: SGSGlobalDefinitions | null
      _sgsElementTitles?: Record<string, string>
    })
  }

  const portee = items.length > 0 ? ['SGS'] : []
  const versionMatch = filename.match(/(\w+\s+\d{4})/)
  const version = versionMatch ? versionMatch[1] : ''

  return {
    template: {
      type: 'SGS',
      code,
      nom: filename.replace(/\.docx$/i, ''),
      version,
      portee,
      type_entite_cible: 'aerodrome',
    },
    hierarchie: domaines,
  }
}

export function buildChecklistHierarchy(templateHierarchie: DomaineChecklist[], portee: string[]): DomaineChecklist[] {
  return templateHierarchie
    .filter(d => portee.length === 0 || portee.includes(d.nom))
    .map(d => ({
      ...d,
      isExpanded: false,
      items: (d.items || []).map((i: ChecklistItem) => ({
        ...i,
        resultat: undefined,
        observation: '',
        fichiers: [],
      })),
    }))
}

function splitDirectiveText(text: string): string[] {
  // Découpe d'abord par saut de ligne (cas normal : une action par ligne)
  const byNewline = text.split('\n').map(s => s.trim()).filter(Boolean)
  if (byNewline.length > 1) return byNewline
  // Repli : découpe par phrase si le texte est un seul bloc
  const bySentences = text.split(/(?<=\.)\s+/).filter(Boolean)
  return bySentences.length > 0 ? bySentences : [text]
}

export function buildSGSTemplateFromImport(
  hierarchie: DomaineChecklist[],
  code?: string,
): Record<string, { questions: SGSQuestion[]; directives: SGSDirectives; guideEtapes: SGSGuideEtape[]; titre?: string }> {
  const template: Record<string, { questions: SGSQuestion[]; directives: SGSDirectives; guideEtapes: SGSGuideEtape[]; titre?: string }> = {}

  const guidanceByElement = (hierarchie[0] as (DomaineChecklist & { _sgsGuidanceByElement?: Record<string, SGSGuidanceBlock[]> }) | undefined)?._sgsGuidanceByElement
  const globalDefinitions = (hierarchie[0] as (DomaineChecklist & { _sgsGlobalDefinitions?: SGSGlobalDefinitions | null }) | undefined)?._sgsGlobalDefinitions
  const elementTitles = (hierarchie[0] as (DomaineChecklist & { _sgsElementTitles?: Record<string, string> }) | undefined)?._sgsElementTitles
  const editedTemplate = (hierarchie[0] as (DomaineChecklist & { _sgsEditedTemplate?: Record<string, { questions?: SGSQuestion[]; directives?: SGSDirectives; guideEtapes?: SGSGuideEtape[] }> }) | undefined)?._sgsEditedTemplate

  const questionnaireRef = code ? code.replace(/_/g, '-') : ''

  for (const domaine of hierarchie) {
    for (const item of domaine.items || []) {
      const parts = (item.numero || '').split('.')
      if (parts.length < 2) continue
      const elementId = `${parts[0]}.${parts[1]}`
      if (!template[elementId]) {
        template[elementId] = {
          questions: [],
          directives: { present: [], approprie: [], operationnel: [], efficace: [] },
          guideEtapes: [],
          titre: elementTitles?.[elementId],
        }
      }
      template[elementId].questions.push({
        id: `q_${item.numero || item.id}`,
        ref: item.numero || questionnaireRef || '',
        texte: item.point_verification || item.description || '',
        niveau: 'absent',
        sourceReglementaire: item.reference_reglementaire || 'RAS 19',
        prefilled: item.prefilled,
        aiPropose: item.aiPropose,
        sourceItemId: item.id,
      })
    }
  }

  for (const elementId of Object.keys(template)) {
    const entry = template[elementId]
    const blocks = guidanceByElement?.[elementId] ?? []

    for (const block of blocks) {
      if (block.present) entry.directives.present.push(block.present)
      if (block.approprie) entry.directives.approprie.push(block.approprie)
      if (block.operationnel) entry.directives.operationnel.push(block.operationnel)
      if (block.efficace) entry.directives.efficace.push(block.efficace)
      if (block.guideActions.length > 0) {
        entry.guideEtapes.push({
          etape: entry.guideEtapes.length + 1,
          titre: 'Directives pour l\'examen des preuves',
          actions: block.guideActions,
        })
      }
    }

    // Repli sur les définitions génériques si ce groupe n'a aucun bloc propre
    if (blocks.length === 0 && globalDefinitions) {
      if (globalDefinitions.present) entry.directives.present = splitDirectiveText(globalDefinitions.present)
      if (globalDefinitions.approprie) entry.directives.approprie = splitDirectiveText(globalDefinitions.approprie)
      if (globalDefinitions.operationnel) entry.directives.operationnel = splitDirectiveText(globalDefinitions.operationnel)
      if (globalDefinitions.efficace) entry.directives.efficace = splitDirectiveText(globalDefinitions.efficace)
      if (globalDefinitions.directives) {
        entry.guideEtapes.push({
          etape: 1,
          titre: 'Directives pour l\'examen des preuves',
          actions: splitDirectiveText(globalDefinitions.directives),
        })
      }
    }
  }

  // Applique les modifications persistant l'édition de l'inspecteur dans le Kit
  // (questions / directives / guide étapes sauvegardées via domaines[0]._sgsEditedTemplate)
  if (editedTemplate) {
    for (const elementId of Object.keys(editedTemplate)) {
      const edited = editedTemplate[elementId]
      if (!edited || typeof edited !== 'object') continue
      if (!template[elementId]) {
        template[elementId] = {
          questions: [],
          directives: { present: [], approprie: [], operationnel: [], efficace: [] },
          guideEtapes: [],
          titre: elementTitles?.[elementId],
        }
      }
      if (Array.isArray(edited.questions)) template[elementId].questions = edited.questions
      if (edited.directives && typeof edited.directives === 'object') template[elementId].directives = edited.directives
      if (Array.isArray(edited.guideEtapes)) template[elementId].guideEtapes = edited.guideEtapes
    }
  }

  return template
}

/**
 * Résout le template SGS à utiliser pour un aérodrome.
 * Source maîtresse = checklist SGS du Kit Inspecteur (`masterChecklists` clés `SGS_*`),
 * fusionnée avec les edits de l'inspecteur (`_sgsEditedTemplate`).
 * Repli : template SGS stocké sur l'aérodrome (`sgs_checklist_template`).
 */
function countSGSQuestions(template: Record<string, { questions: SGSQuestion[] }>): number {
  let total = 0
  for (const elementId of Object.keys(template)) {
    total += template[elementId]?.questions?.length || 0
  }
  return total
}

export function buildSGSTemplateFromMaster(
  masterChecklists: Record<string, DomaineChecklist[]>,
  fallback?: Record<string, unknown> | null,
): Record<string, { questions: SGSQuestion[]; directives: SGSDirectives; guideEtapes: SGSGuideEtape[]; titre?: string }> | undefined {
  const sgsIds = Object.keys(masterChecklists).filter(id => id.toUpperCase().startsWith('SGS_'))
  if (sgsIds.length > 0) {
    // Choisir la version SGS la plus complète (le plus de questions), comme le kit
    // inspecteur qui ouvre le template exact. L'ordre d'insertion de
    // loadTemplatesFromSupabase étant `created_at DESC`, la dernière clé peut
    // être une ancienne version incomplète.
    let bestId = sgsIds[0]
    let bestCount = -1
    for (const id of sgsIds) {
      const candidate = buildSGSTemplateFromImport(masterChecklists[id], id.replace(/^SGS_/i, ''))
      const count = countSGSQuestions(candidate)
      if (count > bestCount) {
        bestCount = count
        bestId = id
      }
    }
    const hierarchie = masterChecklists[bestId]
    const code = bestId.replace(/^SGS_/i, '')
    return buildSGSTemplateFromImport(hierarchie, code)
  }
  return fallback as Record<string, { questions: SGSQuestion[]; directives: SGSDirectives; guideEtapes: SGSGuideEtape[]; titre?: string }> | undefined
}
