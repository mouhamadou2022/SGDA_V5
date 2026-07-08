// lib/ia/agents/kitDocAgent.ts
// Agent IA – Génération de checklist pré-remplie depuis le Kit Inspecteur
// ✅ R1 : 0 style inline
// ✅ R2 : 0 dangerouslySetInnerHTML
// ✅ R3 : données via AppStore uniquement
// ✅ R8 : terme "Surveillance" (pas "inspection")
// ✅ R11 : CDC V8 en premier

'use client'

import { useAppStore, KitDocument, ProfilRisque, Aerodrome, KitChecklistItemGenere } from '@/lib/store'
import { checklistMemory } from '@/lib/checklistMemory'
import { aiClient } from '@/lib/ia/aiClient'
import { KITDOC_SYSTEM_PROMPT, GENERER_ITEMS_CHECKLIST_PROMPT, GENERER_SGS_QUESTIONS_PROMPT } from '@/lib/ia/prompts'
import { expandDomaines, DOMAINES_SURVEILLANCE } from '@/lib/domaines'
import { getSourcesForDomaine } from '@/lib/kitDocMapping'
import { extractTextFromPDF, decouperChapitres, filtrerChapitresParDomaine, filtrerChapitresParMapping } from '@/lib/services/pdfExtractor'

// ============================================================
// TYPES EXPORTS
// ============================================================

export type TypeEntite = 'aerodrome' | 'helistation' | 'mixte'
export type TypeSurveillanceKit = 'periodique' | 'inopine' | 'maintien'
export type ResultatKit = 'SA' | 'NS' | 'NA' | 'NV'
export type TypeDocumentOACI =
  | 'RAS-14'
  | 'Circulaires'
  | 'Guides'
  | 'Checklists'
  | 'Procédures'
  | 'Rapports'
  | 'Formulaires'

export type StatutExtrait = 'ACTIF' | 'NOUVEAU' | 'MODIFIE' | 'OBSOLETE' | 'ABROGE' | 'CONFLIT'

export interface ExtraitReglementaire {
  reference: string            // ex: "RAS 14 II §4.2.9"
  titre: string
  contenu_resume: string
  statut: StatutExtrait
  domaines: string[]
  type_entite_cible: TypeEntite | 'tous'
  seuil_numerique?: string     // ex: "210°", "3 × D", "2 minutes"
  source_document_id: string
  detecte_le: string
}

export interface KitDocChecklistParams {
  surveillance_id: string
  entite_id: string
  type_entite: TypeEntite
  type_surveillance: TypeSurveillanceKit
  portee: string[]
  profil_risque?: ProfilRisque
  prefix_numero?: string  // 'QSC' (défaut) | 'CERT' | 'HMG'
}

export interface KitChecklistItem {
  id: string
  numero: string
  reference_reglementaire: string
  point_verification: string
  /** Guide d'évaluation étape par étape (étapes numérotées) */
  directive_preuve: string
  /** Directives d'évaluation : critère pour chaque état SA/NS/NV/NA */
  directive_sa?: string
  directive_ns?: string
  directive_nv?: string
  directive_na?: string
  prediction: ResultatKit
  confiance: number
  justification: string
  alerte: boolean
  prefill: boolean
  observation?: string
  type_entite_cible: TypeEntite | 'tous'
  type_checklist?: 'standard' | 'suivi_ecarts' | 'pac'
  sous_domaine?: string
}

// ─── Parser : extrait le guide et les critères SA/NS/NV/NA d'une directive ───

function parseDirectiveEval(directive: string): {
  guide: string
  sa?: string; ns?: string; nv?: string; na?: string
} {
  const EVAL_MARKER = '📌 ÉVALUATION OBJECTIVE'
  const SEUIL_MARKER = '⚠️ Seuil'
  const idx = directive.indexOf(EVAL_MARKER)
  if (idx === -1) return { guide: directive }

  const guide = directive.slice(0, idx).trim()
  let evalSection = directive.slice(idx + EVAL_MARKER.length)
    .replace(/^\s*:\s*/, '').trim()

  // Retirer la partie "⚠️ Seuil" si présente
  const seuilIdx = evalSection.indexOf(SEUIL_MARKER)
  if (seuilIdx !== -1) evalSection = evalSection.slice(0, seuilIdx).trim()

  const extract = (key: string) => {
    // Cherche "- SA : texte" jusqu'à la prochaine "- XX :" ou fin
    const m = evalSection.match(new RegExp(`-\\s*${key}\\s*:\\s*(.+?)(?=\\n\\s*-\\s*[A-Z]{2}\\s*:|$)`, 's'))
    return m?.[1]?.trim()
  }

  return { guide, sa: extract('SA'), ns: extract('NS'), nv: extract('NV'), na: extract('NA') }
}

export interface KitSousSousDomaine {
  id: string
  nom: string
  items: KitChecklistItem[]
  ordre: number
}

export interface KitSousDomaine {
  id: string
  nom: string
  type_entite_cible: TypeEntite | 'tous'
  sous_sous_domaines: KitSousSousDomaine[]
  ordre: number
}

export interface KitDomaine {
  code: string
  label: string
  description: string
  sous_domaines: KitSousDomaine[]
}

export interface KitChecklistResult {
  surveillance_id: string
  entite_id: string
  type_entite: TypeEntite
  type_surveillance: TypeSurveillanceKit
  domaines: KitDomaine[]
  generated_at: string
  kit_documents_utilises: string[]
}

export interface KitDocAnalysis {
  document_id: string
  reference_base: string
  type_oaci_detecte: string
  extraits: ExtraitReglementaire[]
  domaines_impactes: string[]
  impact: 'majeur' | 'modere' | 'mineur' | 'aucun'
  conflits: { document_id: string; description: string }[]
  analysed_at: string
}

// ============================================================
// DÉTECTION DE RÉFÉRENCE RÉGLEMENTAIRE
// ============================================================

const REFERENCE_PATTERNS: { pattern: RegExp; reference: string; priorite: number }[] = [
  { pattern: /ras\s*14?\s*(vol\.?\s*ii?|volume\s*ii?)\s*§?([\d.]+)/i, reference: 'RAS 14 II', priorite: 1 },
  { pattern: /ras\s*14?\s*(vol\.?\s*i|volume\s*i)\s*§?([\d.]+)/i, reference: 'RAS 14 I', priorite: 1 },
  { pattern: /ras\s*14/i, reference: 'RAS 14 I', priorite: 2 },
  { pattern: /annexe\s*14\s*(vol\.?\s*ii?|volume\s*ii?)/i, reference: 'RAS 14 II', priorite: 2 },
  { pattern: /annexe\s*14/i, reference: 'RAS 14 I', priorite: 3 },
  { pattern: /doc\s*9261.*part.*2/i, reference: 'Doc 9261 II', priorite: 1 },
  { pattern: /doc\s*9261/i, reference: 'Doc 9261 I', priorite: 2 },
  { pattern: /doc\s*9157.*part.*6/i, reference: 'Doc 9157 Part6', priorite: 1 },
  { pattern: /doc\s*9157.*part.*5/i, reference: 'Doc 9157 Part5', priorite: 1 },
  { pattern: /doc\s*9157.*part.*4/i, reference: 'Doc 9157 Part4', priorite: 1 },
  { pattern: /doc\s*9157.*part.*3/i, reference: 'Doc 9157 Part3', priorite: 1 },
  { pattern: /doc\s*9157.*part.*2/i, reference: 'Doc 9157 Part2', priorite: 1 },
  { pattern: /doc\s*9157.*part.*1/i, reference: 'Doc 9157 Part1', priorite: 1 },
  { pattern: /doc\s*9157/i, reference: 'Doc 9157 Part1', priorite: 2 },
  { pattern: /doc\s*9137.*part.*9/i, reference: 'Doc 9137 Part9', priorite: 1 },
  { pattern: /doc\s*9137.*part.*8/i, reference: 'Doc 9137 Part8', priorite: 1 },
  { pattern: /doc\s*9137.*part.*7/i, reference: 'Doc 9137 Part7', priorite: 1 },
  { pattern: /doc\s*9137.*part.*5/i, reference: 'Doc 9137 Part5', priorite: 1 },
  { pattern: /doc\s*9137.*part.*3/i, reference: 'Doc 9137 Part3', priorite: 1 },
  { pattern: /doc\s*9137.*part.*2/i, reference: 'Doc 9137 Part2', priorite: 1 },
  { pattern: /doc\s*9137.*part.*1/i, reference: 'Doc 9137 Part1', priorite: 1 },
  { pattern: /doc\s*9137/i, reference: 'Doc 9137 Part1', priorite: 2 },
  { pattern: /doc\s*9981/i, reference: 'Doc 9981', priorite: 1 },
  { pattern: /doc\s*9859/i, reference: 'Doc 9859', priorite: 1 },
  { pattern: /manuel.*anacim|anacim.*manuel/i, reference: 'MANUEL-ANACIM', priorite: 1 },
  { pattern: /circulaire|bulletin/i, reference: 'RAS 14 I', priorite: 3 },
  { pattern: /sgs|safety management/i, reference: 'Doc 9859', priorite: 3 },
  { pattern: /sli|sslia|incendie|sauvetage/i, reference: 'Doc 9137 Part1', priorite: 3 },
  { pattern: /hélistat|helipad|fato|tlof/i, reference: 'Doc 9261 I', priorite: 3 },
  { pattern: /obstacle|ols/i, reference: 'RAS 14 II', priorite: 3 },
  { pattern: /animalier|faune|bird/i, reference: 'Doc 9137 Part3', priorite: 3 },
  { pattern: /balisage|lumineux|elec/i, reference: 'RAS 14 II', priorite: 3 },
]

export function detecterReferenceBase(doc: KitDocument): string {
  const texte = `${doc.nom} ${doc.resume || ''} ${doc.mots_cles.join(' ')}`
  let meilleur: { reference: string; priorite: number } | null = null

  for (const { pattern, reference, priorite } of REFERENCE_PATTERNS) {
    if (pattern.test(texte)) {
      if (!meilleur || priorite < meilleur.priorite) {
        meilleur = { reference, priorite }
      }
    }
  }

  // Fallback par type_document
  if (!meilleur) {
    if (doc.type_document === 'reglementation') return 'RAS 14 I'
    if (doc.type_document === 'guide') return 'Doc 9859'
    if (doc.type_document === 'procedure') return 'MANUEL-ANACIM'
    return 'RAS 14 I'
  }

  return meilleur.reference
}

// ============================================================
// MOTEUR DE PRÉDICTION (Règles R1–R5)
// ============================================================

function appliquerPrediction(
  entite_id: string,
  type_surveillance: TypeSurveillanceKit,
  domaine_code: string,
  sous_domaine: string,
  sous_sous_domaine: string,
  item_id: string,
  item_numero: string,
  item_description: string,
  profil?: ProfilRisque
): { prediction: ResultatKit; confiance: number; justification: string; alerte: boolean } {
  // R4 : Vérifier historique checklistMemory
  const prediction = checklistMemory.getPredictionForItem(
    entite_id,
    type_surveillance,
    domaine_code,
    sous_domaine,
    sous_sous_domaine,
    { id: item_id, numero: item_numero, point_verification: item_description },
    profil
  )

  // Si l'historique existe et est fiable, l'utiliser directement
  if (prediction.confiance > 0) {
    return {
      prediction: prediction.prediction,
      confiance: prediction.confiance,
      justification: prediction.justification,
      alerte: prediction.alerte,
    }
  }

  // R2 : Prédiction par profil de risque (pas d'historique)
  if (profil) {
    const score = profil.score_global
    let pred: ResultatKit = 'NV'
    let conf = 30
    let alerte = false
    let justif = 'Aucun historique — prédiction par profil de risque'

    // R5 : Ajustement par critères spécifiques domaine
    const domainScoreMap: Record<string, number | undefined> = {
      SGS: profil.c1, COP: profil.c1,
      OPS: profil.c2,
      PHY: profil.c3, OLS: profil.c3, ELEC: profil.c3, MFP: profil.c3,
      SLI: profil.c5, RA: profil.c5,
    }
    const domaineScore = domainScoreMap[domaine_code] ?? score

    if (score >= 80 && domaineScore >= 70) {
      pred = 'SA'; conf = 75
      justif = `Profil de risque favorable (score ${score}/100, domaine ${domaineScore}/100)`
    } else if (score >= 60 && domaineScore >= 60) {
      pred = 'SA'; conf = 60; alerte = true
      justif = `Score moyen — vérification recommandée (${score}/100)`
    } else if (score >= 30) {
      pred = 'NV'; conf = 50; alerte = true
      justif = `Score risque élevé (${score}/100) — résultat incertain`
    } else {
      pred = 'NS'; conf = 65; alerte = true
      justif = `Score critique (${score}/100) — non-conformité probable`
    }

    // R3 : Ajustement par tendance
    if (profil.tendance === 'baisse') {
      conf = Math.max(0, conf - 10)
      if (pred === 'SA') { pred = 'NV'; alerte = true }
      justif += ' ⬇️ Tendance dégradée'
    } else if (profil.tendance === 'hausse') {
      conf = Math.min(100, conf + 5)
    }

    // Vigilance critique
    const vigilance = profil.velocity_metrics?.niveau_vigilance
    if (vigilance === 'alerte' || vigilance === 'critique') {
      alerte = true
    }

    return { prediction: pred, confiance: conf, justification: justif, alerte }
  }

  // Défaut : pas d'historique, pas de profil
  return {
    prediction: 'NV',
    confiance: 30,
    justification: 'Aucun historique ni profil de risque — à vérifier sur site',
    alerte: false,
  }
}

// ============================================================
// GÉNÉRATEUR DE CHECKLIST HIÉRARCHIQUE
// ============================================================

export async function generateKitChecklist(params: KitDocChecklistParams): Promise<KitChecklistResult> {
  const { surveillance_id, entite_id, type_entite, type_surveillance, portee, profil_risque } = params

  const domainesActifs = expandDomaines(portee)
  const store = useAppStore.getState()
  const kitDocs = (store.kitDocuments || []).filter(
    d => d.etat === 'a_jour' || d.etat === 'en_revision'
  )
  const kitDocsIds = kitDocs.map(d => d.id)

  await kitDocAgent.genererChecklistDepuisPortee({
    portee: domainesActifs,
    type_entite,
    type_surveillance,
    force: false,
    entite_id,
  })

  // Re-lire les documents après génération IA (items_generes a été mis à jour dans le store)
  const storeApres = useAppStore.getState()
  const kitDocsActualises = (storeApres.kitDocuments || []).filter(
    d => d.etat === 'a_jour' || d.etat === 'en_revision'
  )

  const prefix = params.prefix_numero || 'QSC'

  const result: KitChecklistResult = {
    surveillance_id,
    entite_id,
    type_entite,
    type_surveillance,
    domaines: [],
    generated_at: new Date().toISOString(),
    kit_documents_utilises: kitDocsIds,
  }

  let itemCounter = 0

  for (const domaineCode of domainesActifs) {
    const domaineInfo = DOMAINES_SURVEILLANCE.find(d => d.code === domaineCode)
    if (!domaineInfo) continue
    // SGS est traité séparément (évaluation PAOE) — pas dans la checklist standard
    if (domaineCode === 'SGS' && type_surveillance !== 'maintien') continue

    const docsForDomaine = kitDocsActualises.filter(d =>
      (d.items_generes || []).some(ig => ig.domaine === domaineCode)
    )

    const items: KitChecklistItem[] = []
    const seenQuestions = new Set<string>()

    for (const doc of docsForDomaine) {
      const generes = doc.items_generes?.filter(ig => ig.domaine === domaineCode) || []
      for (const ig of generes) {
        const key = ig.point_verification.toLowerCase().trim()
        if (seenQuestions.has(key)) continue
        seenQuestions.add(key)

        itemCounter++
        const itemNum = `${prefix}-${String(itemCounter).padStart(2, '0')}`
        const itemId = `${domaineCode}_${itemNum}`

        const pred = appliquerPrediction(
          entite_id,
          type_surveillance,
          domaineCode,
          domaineInfo.label,
          ig.sous_domaine || 'Général',
          itemId,
          itemNum,
          ig.point_verification,
          profil_risque
        )

        items.push({
          id: itemId,
          numero: itemNum,
          reference_reglementaire: ig.reference_reglementaire,
          point_verification: ig.point_verification,
          directive_preuve: ig.directive_preuve,
          directive_sa: ig.directive_sa,
          directive_ns: ig.directive_ns,
          directive_nv: ig.directive_nv,
          directive_na: ig.directive_na,
          prediction: pred.prediction,
          confiance: pred.confiance,
          justification: pred.justification,
          alerte: pred.alerte,
          prefill: pred.confiance >= 70,
          observation: pred.confiance >= 85 ? `Prédiction automatique (${pred.confiance}%)` : undefined,
          type_entite_cible: ig.type_entite_cible,
          type_checklist: type_surveillance === 'maintien' ? 'standard' : 'standard',
          sous_domaine: ig.sous_domaine,
        })
      }
    }

    if (items.length === 0) {
      itemCounter++
      const fbNum = `${prefix}-${String(itemCounter).padStart(2, '0')}`
      items.push({
        id: `${domaineCode}_fallback_${fbNum}`,
        numero: fbNum,
        reference_reglementaire: `RAS 14 I — ${domaineInfo.label}`,
        point_verification: `Le domaine ${domaineInfo.label} est-il conforme aux exigences réglementaires ?`,
        directive_preuve: `1. Demander la documentation ${domaineInfo.label}\n2. Vérifier la conformité aux spécifications\n3. Observer les installations sur site`,
        directive_sa: 'La documentation est complète, à jour et conforme. Les installations respectent les spécifications.',
        directive_ns: 'La documentation est manquante, incomplète ou les installations présentent des écarts.',
        directive_nv: 'La documentation ou les installations n\'ont pas pu être vérifiées lors de la visite.',
        directive_na: 'Ce domaine ne s\'applique pas à cet aérodrome selon sa classification.',
        prediction: 'NV',
        confiance: 30,
        justification: `Aucun document réglementaire chargé pour ${domaineCode} — item générique`,
        alerte: false,
        prefill: false,
        type_entite_cible: type_entite === 'helistation' ? 'helistation' : 'tous',
      })
    }

    // Grouper les items par sous-domaine (provenant de l'IA)
    const itemsBySousDomaine = new Map<string, KitChecklistItem[]>()
    for (const item of items) {
      const sd = item.sous_domaine || 'Général'
      if (!itemsBySousDomaine.has(sd)) itemsBySousDomaine.set(sd, [])
      itemsBySousDomaine.get(sd)!.push(item)
    }

    const kitDomaine: KitDomaine = {
      code: domaineCode,
      label: domaineInfo.label,
      description: domaineInfo.description,
      sous_domaines: Array.from(itemsBySousDomaine.entries()).map(([nom, sdItems], sdi) => ({
        id: `${domaineCode}_${nom.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        nom,
        type_entite_cible: 'tous',
        sous_sous_domaines: sdItems.map((item, i) => ({
          id: `${domaineCode}_${sdi}_${i}`,
          nom: item.numero,
          items: [item],
          ordre: i,
        })),
        ordre: sdi,
      })),
    }

    if (type_surveillance === 'maintien') {
      kitDomaine.sous_domaines.push(...genererItemsMaintien(domaineCode, entite_id, profil_risque))
    }

    result.domaines.push(kitDomaine)
    console.log(`[generateKitChecklist] ${domaineCode}: ${items.length} items, ${itemsBySousDomaine.size} sous-domaines (${Array.from(itemsBySousDomaine.keys()).join(', ')})`)
  }

  console.log(`[generateKitChecklist] FINI — ${result.domaines.length} domaines, ${result.domaines.reduce((s, d) => s + d.sous_domaines.reduce((s2, sd) => s2 + sd.sous_sous_domaines.length, 0), 0)} items au total`)

  return result
}

// Items spécifiques au type de surveillance "maintien" (Doc 9859, Doc 9981)
function genererItemsMaintien(
  domaine_code: string,
  entite_id: string,
  profil?: ProfilRisque
): KitSousDomaine[] {
  if (domaine_code !== 'SGS') return []

  return [
    {
      id: `SGS_suivi_ecarts_maintien`,
      nom: 'Suivi des écarts et PAC',
      type_entite_cible: 'tous',
      sous_sous_domaines: [
        {
          id: 'SGS_suivi_ecarts_maintien_pac',
          nom: 'Avancement des Plans d\'Actions Correctives',
          ordre: 0,
          items: [
            {
              id: `SGS_M01_maintien`,
              numero: 'SGS.M01',
              reference_reglementaire: 'Doc 9859 §6.3',
              point_verification: 'Les PAC pour les écarts des surveillances précédentes font-ils l\'objet d\'un suivi et d\'une validation ANACIM ?',
              directive_preuve: `1. Demander le tableau de suivi des PAC avec les écarts en cours
2. Vérifier l'avancement de chaque action (délai, responsable, preuves)
3. Confirmer la validation ANACIM pour les PAC jugés satisfaisants`,
              directive_sa: 'Tous les PAC actifs ont un avancement tracé, les délais sont respectés et les validations ANACIM sont documentées.',
              directive_ns: 'Au moins un PAC est en retard sans justification, ou le suivi est absent ou incomplet.',
              directive_nv: 'Le tableau de suivi des PAC n\'a pas été présenté lors de la surveillance.',
              directive_na: 'Aucun écart n\'est ouvert à ce jour (premier cycle de surveillance de cet aérodrome).',
              prediction: profil && profil.c4 < 40 ? 'NS' : 'NV',
              confiance: profil && profil.c4 < 40 ? 65 : 30,
              justification: profil && profil.c4 < 40
                ? '⚠️ C4 < 40 : charge critique élevée, PAC probablement en retard'
                : 'À vérifier lors de la surveillance de maintien',
              alerte: !!(profil && profil.c4 < 40),
              prefill: !!(profil && profil.c4 < 40),
              type_entite_cible: 'tous',
            },
          ],
        },
      ],
      ordre: 99,
    },
  ]
}

// ============================================================
// CONVERSION VERS DOMAINECHECKLIST[] (format store)
// ============================================================

export function toDomaineChecklistArray(result: KitChecklistResult): any[] {
  return result.domaines.map((d, di) => ({
    id: `kit_${result.surveillance_id}_${d.code}`,
    nom: d.label,
    description: d.description,
    items: [],
    sousDomaines: d.sous_domaines.map((sd, sdi) => ({
      id: sd.id,
      nom: sd.nom,
      items: [],
      sousSousDomaines: sd.sous_sous_domaines.map((ssd, ssdi) => ({
        id: ssd.id,
        nom: ssd.nom,
        ordre: ssd.ordre,
        isExpanded: false,
        items: ssd.items.map((item, ii) => ({
          id: item.id,
          numero: item.numero,
          reference_reglementaire: item.reference_reglementaire,
          point_verification: item.point_verification,
          directive_preuve: item.directive_preuve,
          directive_sa: item.directive_sa,
          directive_ns: item.directive_ns,
          directive_nv: item.directive_nv,
          directive_na: item.directive_na,
          ordre: ii,
          resultat: item.prefill ? item.prediction : undefined,
          prediction: item.prediction,
          confiance: item.confiance,
          justification: item.justification,
          alerte: item.alerte,
          prefilled: item.prefill,
          observation: item.observation,
          fichiers: [],
          // Champs store.ChecklistItem
          surveillance_id: result.surveillance_id,
          type_checklist: 'standard' as const,
          categorie: ssd.nom,
          reference_ras14: item.reference_reglementaire,
          description: item.point_verification,
          domaine: d.code,
          last_modified: result.generated_at,
          modified_by: 'kit_doc_agent',
        })),
      })),
      isExpanded: true,
      ordre: sdi,
    })),
    isExpanded: true,
    progression: 0,
    ordre: di,
  }))
}

// ============================================================
// ANALYSE D'UN DOCUMENT KIT NOUVELLEMENT AJOUTÉ
// ============================================================

export class KitDocAgent {
  private initialized = false
  private analysisCache = new Map<string, KitDocAnalysis>()

  async init(): Promise<void> {
    this.initialized = true
    console.log('[KitDocAgent] Initialisé')
  }

  // Analyse un document nouvellement chargé
  async analyzeDocument(doc: KitDocument): Promise<KitDocAnalysis> {
    const cacheKey = `${doc.id}_${doc.version}`
    const cached = this.analysisCache.get(cacheKey)
    if (cached) return cached

    const reference_base = detecterReferenceBase(doc)

    // Générer les extraits réglementaires pertinents via IA
    const extraitsIA = await this.extractRegulationExtraits(doc, reference_base)

    // Détecter les conflits avec documents existants
    const conflits = this.detecterConflits(doc)

    // Déterminer l'impact
    const impact = this.estimerImpact(doc, extraitsIA)

    const analysis: KitDocAnalysis = {
      document_id: doc.id,
      reference_base,
      type_oaci_detecte: this.detecterTypeOACI(doc),
      extraits: extraitsIA,
      domaines_impactes: [...new Set(extraitsIA.flatMap(e => e.domaines))],
      impact,
      conflits,
      analysed_at: new Date().toISOString(),
    }

    this.analysisCache.set(cacheKey, analysis)
    return analysis
  }

  private async extractRegulationExtraits(
    doc: KitDocument,
    reference_base: string
  ): Promise<ExtraitReglementaire[]> {
    const extraitsBase: ExtraitReglementaire[] = doc.domaines.map(domaine => ({
      reference: `${reference_base} §[à préciser]`,
      titre: `Extrait ${reference_base} — domaine ${domaine}`,
      contenu_resume: doc.resume || `Document ${doc.nom} couvrant le domaine ${domaine}`,
      statut: doc.etat === 'a_jour' ? 'ACTIF' : doc.etat === 'en_revision' ? 'MODIFIE' : 'OBSOLETE' as StatutExtrait,
      domaines: [domaine],
      type_entite_cible: 'tous' as const,
      source_document_id: doc.id,
      detecte_le: new Date().toISOString(),
    }))

    // Enrichissement optionnel via IA
    if (doc.resume && doc.resume.length > 20) {
      type ExtraitAI = { reference: string; titre: string; resume: string; seuil?: string }
      const aiResult = await aiClient.callJSON<{ extraits: ExtraitAI[] }>(
        {
          systemPrompt: KITDOC_SYSTEM_PROMPT,
          userMessage: `Document: "${doc.nom}" (${reference_base})
Résumé: ${doc.resume}
Domaines: ${doc.domaines.join(', ')}
Mots-clés: ${doc.mots_cles.join(', ')}

Identifie jusqu'à 5 extraits clés. Format:
{"extraits": [{"reference": "RAS 14 I §X.X.X", "titre": "...", "resume": "...", "seuil": "valeur numérique si applicable"}]}`,
          temperature: 0.2,
          maxTokens: 500,
          responseFormat: 'json_object',
        },
        { extraits: [] }
      )

      if (aiResult.extraits && aiResult.extraits.length > 0) {
        return aiResult.extraits.map((e, i) => ({
          reference: e.reference || extraitsBase[i]?.reference || `${reference_base} §X.X`,
          titre: e.titre || extraitsBase[i]?.titre || 'Extrait non titré',
          contenu_resume: e.resume || '',
          statut: 'ACTIF' as StatutExtrait,
          domaines: doc.domaines.slice(0, 2),
          type_entite_cible: 'tous' as const,
          seuil_numerique: e.seuil,
          source_document_id: doc.id,
          detecte_le: new Date().toISOString(),
        }))
      }
    }

    return extraitsBase
  }

  private detecterConflits(doc: KitDocument): { document_id: string; description: string }[] {
    const store = useAppStore.getState()
    const autresDocs = store.kitDocuments.filter(d =>
      d.id !== doc.id &&
      d.domaines.some(dom => doc.domaines.includes(dom)) &&
      d.etat === 'a_jour'
    )

    return autresDocs
      .filter(d => {
        // Conflit potentiel si même domaine + version proche ou même type
        const memeType = d.type_document === doc.type_document
        const memeNomBase = d.nom.split('-')[0].trim().toLowerCase() ===
                            doc.nom.split('-')[0].trim().toLowerCase()
        return memeType && memeNomBase
      })
      .map(d => ({
        document_id: d.id,
        description: `Conflit potentiel avec "${d.nom}" (${d.version}) — même type et domaines similaires`,
      }))
  }

  private detecterTypeOACI(doc: KitDocument): string {
    const nom = doc.nom.toLowerCase()
    if (nom.includes('ras 14') || nom.includes('annexe 14')) return 'Norme RAS 14'
    if (nom.includes('circulaire')) return 'Circulaire ANACIM'
    if (nom.includes('doc 9261')) return 'Doc OACI 9261 (Hélistations)'
    if (nom.includes('doc 9157')) return 'Doc OACI 9157 (AGA)'
    if (nom.includes('doc 9137')) return 'Doc OACI 9137 (SLI)'
    if (nom.includes('doc 9859')) return 'Doc OACI 9859 (SGS)'
    if (nom.includes('doc 9981')) return 'Doc OACI 9981 (STDOC)'
    if (nom.includes('manuel') && nom.includes('anacim')) return 'Manuel des métiers ANACIM'
    return doc.type_document
  }

  private estimerImpact(doc: KitDocument, extraits: ExtraitReglementaire[]): KitDocAnalysis['impact'] {
    if (doc.type_document === 'reglementation') {
      const hasNormes = extraits.some(e => e.reference.includes('RAS 14'))
      if (hasNormes) return 'majeur'
      return 'modere'
    }
    if (doc.type_document === 'guide' || doc.type_document === 'procedure') return 'modere'
    if (doc.type_document === 'checklist') return 'mineur'
    return 'aucun'
  }

  // Génère la checklist depuis les paramètres
  async generateChecklist(params: KitDocChecklistParams): Promise<KitChecklistResult> {
    return generateKitChecklist(params)
  }

  // Injecte la checklist dans le store (checklistHierarchy)
  injectIntoStore(surveillanceId: string, result: KitChecklistResult): void {
    const store = useAppStore.getState()
    const hierarchy = toDomaineChecklistArray(result)
    store.setChecklistHierarchy(surveillanceId, hierarchy)
  }

  /**
   * Codes domaine connus pour l'extraction dans les nomenclatures de checklist
   */
  private static CODES_DOMAINES = ['SGS','SLI','PHY','OLS','RA','ELEC','MFP','COP','OPS'] as const

  /**
   * Extrait le code domaine (SGS, PHY, ELEC…) à partir du nom ou de l'id d'un domaine.
   * Gère les formats : label long, id "kit_xxx_CODE", etc.
   */
  private static extractDomaineCode(domaine: any): string {
    const id = (domaine.id || '').toUpperCase()
    // Pattern id: kit_xxxx_ELEC ou KIT_XXXX_ELEC
    const match = id.match(/_([A-Z]{2,4})$/i)
    if (match) {
      const code = match[1].toUpperCase()
      if ((KitDocAgent.CODES_DOMAINES as readonly string[]).includes(code)) return code
    }
    const nom = (domaine.nom || '').toUpperCase()
    for (const code of KitDocAgent.CODES_DOMAINES) {
      if (nom === code || id === code) return code
    }
    return nom
  }

  /**
   * Filtre les items d'une checklist selon les caractéristiques de l'entité (aérodrome/hélistation/mixte).
   * Les items non applicables sont marqués NA avec une justification.
   * Conserve les règles R1-R6 existantes et ajoute les règles hélistation (R7-R10).
   */
  filterChecklistByAerodrome(
    checklist: any[],
    aerodrome: Partial<Pick<Aerodrome, 'horaires' | 'aides_visuelles' | 'piste_principale' | 'type_entite'>>
  ): any[] {
    const typeEntite: string = aerodrome.type_entite || 'aerodrome'
    const revetementsNonRevetus = ['herbe', 'terre', 'latérite', 'latrite']
    const isPisteRevêtue = !revetementsNonRevetus.includes((aerodrome.piste_principale?.revetement || '').toLowerCase())
    const horaires = aerodrome.horaires
    const aidesVisuelles = aerodrome.aides_visuelles || []
    const typeApproche = aerodrome.piste_principale?.type_approche
    const isHelistation = typeEntite === 'helistation'
    const isMixte = typeEntite === 'mixte'
    const isAerodrome = typeEntite === 'aerodrome'

    // R7: items ciblant un type d'entité spécifique → NA si incompatible
    const filterByEntityType = (item: any): boolean => {
      const cible = item.type_entite_cible
      if (!cible || cible === 'tous') return true
      if (isMixte) return true
      if (isAerodrome && cible === 'helistation') return false
      if (isHelistation && cible === 'aerodrome') return false
      return true
    }

    const walkItems = (items: any[], domaineCode: string, sousDomaine: string, sousSousDomaine: string) =>
      (items || []).map(item => {
        // R7: Filtrer par type d'entité cible
        if (!filterByEntityType(item)) {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 98,
            justification: isHelistation
              ? `Non applicable — entité de type hélistation, item réservé aux aérodromes`
              : `Non applicable — entité de type aérodrome, item réservé aux hélistations`,
            prefilled: true,
            alerte: false,
          }
        }

        const texteComplet = [
          item.point_verification || item.description || '',
          item.directive_preuve || '',
          item.reference_reglementaire || '',
        ].join(' ').toLowerCase()

        // R1: ELEC — si horaires === 'jour', tout le domaine ELEC est NA
        // (inclut hélistation : pas de balisage lumineux requis de jour)
        if (domaineCode === 'ELEC' && horaires === 'jour') {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 95,
            justification: `Non applicable — ${isHelistation ? 'hélistation' : 'aérodrome'} non exploité de nuit (horaires Jour 08h-19h)`,
            prefilled: true,
            alerte: false,
          }
        }

        // R2: MFP marquage — si piste non revêtue ou hélistation, les items marquage sont NA
        if (domaineCode === 'MFP' && (isHelistation || !isPisteRevêtue) && (texteComplet.includes('marquage') || texteComplet.includes('marque') || texteComplet.includes('panneau'))) {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 95,
            justification: isHelistation
              ? 'Non applicable — hélistation sans piste, le marquage de piste n\'est pas requis'
              : 'Non applicable — piste non revêtue, le marquage au sol n\'est pas requis',
            prefilled: true,
            alerte: false,
          }
        }

        // R8: PHY/aérodrome — pour hélistation, les items piste/taxiway sont NA
        if (isHelistation && domaineCode === 'PHY' && (texteComplet.includes('piste') || texteComplet.includes('taxiway') || texteComplet.includes('resa'))) {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 97,
            justification: 'Non applicable — hélistation sans piste, les caractéristiques physiques aérodrome ne s\'appliquent pas',
            prefilled: true,
            alerte: false,
          }
        }

        // R9: SLI items piste → NA pour hélistation (utilisation FATO)
        if (isHelistation && domaineCode === 'SLI' && texteComplet.includes('piste')) {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 95,
            justification: 'Non applicable — hélistation : le temps d\'intervention s\'applique à la FATO, pas à une piste',
            prefilled: true,
            alerte: false,
          }
        }

        // R10: RA clôture → NA pour hélistation maritime/insulaire
        if (isHelistation && domaineCode === 'RA' && texteComplet.includes('clôture')) {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 93,
            justification: 'Non applicable — hélistation sans périmètre terrestre, clôture non requise',
            prefilled: true,
            alerte: false,
          }
        }

        // R3: PAPI — si non installé (sauf hélistation sans piste)
        if (domaineCode !== 'OLS' && !isHelistation && texteComplet.includes('papi') && !aidesVisuelles.includes('papi')) {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 95,
            justification: 'Non applicable — PAPI non installé sur cet aérodrome',
            prefilled: true,
            alerte: false,
          }
        }

        // R4: Feux de balisage — si non installés ou aérodrome de jour
        if (texteComplet.includes('feu') && !aidesVisuelles.includes('feux') && horaires === 'jour') {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 95,
            justification: 'Non applicable — feux de balisage non installés ou entité non exploitée de nuit',
            prefilled: true,
            alerte: false,
          }
        }

        // R5: Balises — si non installées
        if (texteComplet.includes('balise') && !aidesVisuelles.includes('balise')) {
          return {
            ...item,
            resultat: 'NA' as const,
            prediction: 'NA',
            confiance: 95,
            justification: 'Non applicable — balises non installées sur cette entité',
            prefilled: true,
            alerte: false,
          }
        }

        // R6: Approche de précision — si type d'approche incompatible (aérodrome seulement)
        if (!isHelistation && (texteComplet.includes('approche') || texteComplet.includes('ils') || texteComplet.includes('precision'))) {
          if (typeApproche && !['cat1', 'cat2'].includes(typeApproche) && (texteComplet.includes('cat') || texteComplet.includes('precision') || texteComplet.includes('ils'))) {
            return {
              ...item,
              resultat: 'NA' as const,
              prediction: 'NA',
              confiance: 90,
              justification: `Non applicable — aérodrome en approche ${typeApproche === 'a_vue' ? 'à vue' : 'classique'}, les normes d'approche de précision ne s'appliquent pas`,
              prefilled: true,
              alerte: false,
            }
          }
        }

        return item
      })

    return checklist.map(domaine => {
      const domaineCode = KitDocAgent.extractDomaineCode(domaine)
      return {
        ...domaine,
        items: walkItems(domaine.items || [], domaineCode, '', ''),
        sousDomaines: (domaine.sousDomaines || []).map((sd: any) => ({
          ...sd,
          items: walkItems(sd.items || [], domaineCode, sd.nom || '', ''),
          sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) => ({
            ...ssd,
            items: walkItems(ssd.items || [], domaineCode, sd.nom || '', ssd.nom || ''),
          })),
        })),
      }
    })
  }

  /**
   * Applique les prédictions du profil de risque à une checklist maîtresse.
   * Parcourt tous les items à tous les niveaux et appelle appliquerPrediction()
   * pour préremplir prediction, confiance, justification, alerte.
   */
  applyRiskProfileToChecklist(
    checklist: any[],
    params: {
      entite_id: string
      type_entite: TypeEntite
      type_surveillance: TypeSurveillanceKit
      portee: string[]
      profil_risque?: ProfilRisque
    }
  ): any[] {
    const { entite_id, type_surveillance, profil_risque } = params

    return checklist.map(domaine => {
      const domaineCode = domaine.nom?.toUpperCase() || ''
      const walkItems = (items: any[], sousDomaine: string, sousSousDomaine: string) =>
        (items || []).map(item => {
          const pred = appliquerPrediction(
            entite_id,
            type_surveillance,
            domaineCode,
            sousDomaine,
            sousSousDomaine,
            item.id || '',
            item.numero || '',
            item.point_verification || item.description || '',
            profil_risque
          )
          return {
            ...item,
            prediction: pred.prediction,
            confiance: pred.confiance,
            justification: pred.justification,
            alerte: pred.alerte,
            prefilled: pred.confiance >= 70,
            resultat: item.resultat || (pred.prediction !== 'NV' ? undefined : undefined),
          }
        })

      return {
        ...domaine,
        items: walkItems(domaine.items || [], '', ''),
        sousDomaines: (domaine.sousDomaines || []).map((sd: any) => ({
          ...sd,
          items: walkItems(sd.items || [], sd.nom || '', ''),
          sousSousDomaines: (sd.sousSousDomaines || []).map((ssd: any) => ({
            ...ssd,
            items: walkItems(ssd.items || [], sd.nom || '', ssd.nom || ''),
          })),
        })),
      }
    })
  }

  // ============================================================
  // GÉNÉRATION D'APERÇU CHECKLIST DEPUIS UN DOCUMENT ANALYSÉ
  // ============================================================

  generatePreviewFromDoc(doc: KitDocument, analyse: KitDocAnalysis): any[] {
    const domainesCibles = analyse.domaines_impactes.length > 0
      ? analyse.domaines_impactes
      : doc.domaines

    const domainesActifs = expandDomaines(domainesCibles)
    const result: any[] = []
    const itemsGeneres = doc.items_generes || []

    for (const domaineCode of domainesActifs) {
      const domaineInfo = DOMAINES_SURVEILLANCE.find(d => d.code === domaineCode)
      if (!domaineInfo) continue

      const itemsDomaine = itemsGeneres.filter(ig => ig.domaine === domaineCode)
      if (itemsDomaine.length === 0) continue

      // Grouper par sous-domaine dans la preview aussi
      const previewGroups = new Map<string, typeof itemsDomaine>()
      for (const ig of itemsDomaine) {
        const sd = ig.sous_domaine || 'Général'
        if (!previewGroups.has(sd)) previewGroups.set(sd, [])
        previewGroups.get(sd)!.push(ig)
      }

      const domaine: any = {
        id: `kit_preview_${doc.id}_${domaineCode}`,
        nom: domaineInfo.label,
        description: domaineInfo.description,
        items: [],
        sousDomaines: Array.from(previewGroups.entries()).map(([sdName, sdItems], sdi) => ({
          id: `kit_preview_${doc.id}_${domaineCode}_${sdName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          nom: sdName,
          items: [],
          sousSousDomaines: sdItems.map((ig, i) => ({
            id: `kit_preview_${doc.id}_${domaineCode}_item_${i}`,
            nom: ig.numero,
            items: [{
              id: `preview_${doc.id}_${domaineCode}_${ig.numero}`,
              numero: ig.numero,
              reference_reglementaire: ig.reference_reglementaire,
              point_verification: ig.point_verification,
              directive_preuve: ig.directive_preuve,
              directive_sa: ig.directive_sa,
              directive_ns: ig.directive_ns,
              directive_nv: ig.directive_nv,
              directive_na: ig.directive_na,
              resultat: undefined,
              ordre: i,
              prediction: 'NV',
              confiance: 40,
              justification: `Point issu du document "${doc.nom}" (${analyse.reference_base})`,
              alerte: false,
              prefilled: false,
              observation: undefined,
              fichiers: [],
            }],
            isExpanded: true,
            ordre: i,
          })),
          isExpanded: true,
          ordre: sdi,
        })),
        isExpanded: true,
        progression: 0,
        ordre: result.length,
      }

      result.push(domaine)
    }

    return result
  }

  generatePreviewFromAllDocuments(): any[] {
    const store = useAppStore.getState()
    const allDocs = (store.kitDocuments || []).filter(d =>
      d.etat === 'a_jour' && d.items_generes && d.items_generes.length > 0
    )

    const allDomaineCodes = [...new Set(allDocs.flatMap(d => (d.items_generes || []).map(ig => ig.domaine)))]
    const domainesActifs = allDomaineCodes.length > 0
      ? allDomaineCodes
      : ['SLI','PHY','OLS','RA','ELEC','MFP','COP','OPS']

    const result: any[] = []

    for (const domaineCode of domainesActifs) {
      const domaineInfo = DOMAINES_SURVEILLANCE.find(d => d.code === domaineCode)
      if (!domaineInfo) continue

      const itemsDomaine = allDocs.flatMap(d =>
        (d.items_generes || []).filter(ig => ig.domaine === domaineCode)
      )

      if (itemsDomaine.length === 0) continue

      const seenQuestions = new Set<string>()
      const itemsUniques = itemsDomaine.filter(ig => {
        const key = ig.point_verification.toLowerCase().trim()
        if (seenQuestions.has(key)) return false
        seenQuestions.add(key)
        return true
      })

      // Grouper par sous-domaine dans la preview aussi
      const previewGroups = new Map<string, typeof itemsUniques>()
      for (const ig of itemsUniques) {
        const sd = ig.sous_domaine || 'Général'
        if (!previewGroups.has(sd)) previewGroups.set(sd, [])
        previewGroups.get(sd)!.push(ig)
      }

      const domaine: any = {
        id: `kit_preview_all_${domaineCode}`,
        nom: domaineInfo.label,
        description: domaineInfo.description,
        items: [],
        sousDomaines: Array.from(previewGroups.entries()).map(([sdName, sdItems], sdi) => ({
          id: `kit_preview_all_${domaineCode}_${sdName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
          nom: sdName,
          items: [],
          sousSousDomaines: sdItems.map((ig, i) => ({
            id: `kit_preview_all_${domaineCode}_item_${i}`,
            nom: ig.numero,
            items: [{
              id: `preview_all_${domaineCode}_${ig.numero}_${i}`,
              numero: ig.numero,
              reference_reglementaire: ig.reference_reglementaire,
              point_verification: ig.point_verification,
              directive_preuve: ig.directive_preuve,
              directive_sa: ig.directive_sa,
              directive_ns: ig.directive_ns,
              directive_nv: ig.directive_nv,
              directive_na: ig.directive_na,
              resultat: undefined,
              ordre: i,
              prediction: 'NV',
              confiance: 40,
              justification: `Point de vérification pour le domaine ${domaineCode}`,
              alerte: false,
              prefilled: false,
              observation: undefined,
              fichiers: [],
            }],
            isExpanded: true,
            ordre: i,
          })),
          isExpanded: true,
          ordre: sdi,
        })),
        isExpanded: true,
        progression: 0,
        ordre: result.length,
      }

      result.push(domaine)
    }

    return result
  }

  async extractAnacimChecklistItems(docId: string): Promise<{
    numero: string;
    reference_reglementaire: string;
    point_verification: string;
    directive_preuve: string;
    directive_sa?: string;
    directive_ns?: string;
    directive_nv?: string;
    directive_na?: string;
    resultat?: 'SA' | 'NS' | 'NA';
    domaine: string;
  }[]> {
    const store = useAppStore.getState()
    const doc = store.kitDocuments.find(d => d.id === docId)
    if (!doc) return []

    const extraits = (doc.extraits || []) as any[]
    if (extraits.length === 0) return []

    type Row = {
      numero: string
      reference: string
      question: string
      guide_etapes: string
      directive_sa?: string
      directive_ns?: string
      directive_nv?: string
      directive_na?: string
      resultat?: string
    }

    const aiResult = await aiClient.callJSON<{ rows: Row[] }>(
      {
        systemPrompt: `Tu es un expert en réglementation aéronautique ANACIM Sénégal (RAS 14, Doc 9137, Doc 9157).
Extrais les lignes de checklist standard à partir des extraits fournis.

STRUCTURE DE CHAQUE LIGNE :
- numero : code de la question (ex: QV01, SLI.01)
- reference : référence réglementaire précise (ex: RAS 14 I §9.2.1)
- question : le point de vérification sous forme de question claire
- guide_etapes : étapes numérotées pour vérifier ce point (ex: "1. Demander le document X\n2. Vérifier Y\n3. Confirmer Z")
- directive_sa : 1-2 phrases décrivant ce qui rend la réponse SATISFAISANTE (conforme)
- directive_ns : 1-2 phrases décrivant ce qui rend la réponse NON SATISFAISANTE (non-conforme)
- directive_nv : 1 phrase décrivant quand la vérification est IMPOSSIBLE (document absent, accès refusé…)
- directive_na : 1 phrase décrivant quand la question NE S'APPLIQUE PAS à cet aérodrome
- resultat : optionnel — SA, NS, NA (mapper SO→NA, ignorer les autres valeurs)

RÈGLES :
- Ignorer les lignes d'en-tête, totaux et lignes vides
- Les directives doivent être concrètes et actionnables pour l'inspecteur terrain
- Répondre UNIQUEMENT en JSON valide`,

        userMessage: `Document: "${doc.nom}" (${doc.reference_base || ''})
Extraits disponibles :
${extraits.map((e: any, i: number) =>
  `[${i}] Réf: ${e.reference || ''} | Titre: ${e.titre || ''} | Contenu: ${(e.contenu_resume || '').substring(0, 400)}`
).join('\n')}

Génère le JSON au format :
{
  "rows": [
    {
      "numero": "QV01",
      "reference": "RAS 14 I §X.X.X",
      "question": "La question à vérifier ?",
      "guide_etapes": "1. Demander le document\\n2. Vérifier la conformité\\n3. Contrôler la date",
      "directive_sa": "Le document est présent, à jour (< 12 mois) et signé par le responsable.",
      "directive_ns": "Le document est absent, non signé ou périmé (> 12 mois).",
      "directive_nv": "Le document n'a pas été présenté lors de la visite.",
      "directive_na": "Cette exigence ne s'applique pas à cet aérodrome selon sa classification.",
      "resultat": "SA"
    }
  ]
}`,
        temperature: 0.15,
        maxTokens: 3000,
        responseFormat: 'json_object',
      },
      { rows: [] }
    )

    if (!aiResult.rows || aiResult.rows.length === 0) return []

    return aiResult.rows.map(r => ({
      numero: r.numero || '',
      reference_reglementaire: r.reference || '',
      point_verification: r.question || '',
      directive_preuve: r.guide_etapes || '',
      directive_sa: r.directive_sa || undefined,
      directive_ns: r.directive_ns || undefined,
      directive_nv: r.directive_nv || undefined,
      directive_na: r.directive_na || undefined,
      resultat: r.resultat === 'SO' ? 'NA'
        : (r.resultat === 'SA' || r.resultat === 'NS' || r.resultat === 'NA')
          ? r.resultat as 'SA' | 'NS' | 'NA'
          : undefined,
      domaine: doc.domaines[0] || 'AGA',
    }))
  }

  // ============================================================
  // GÉNÉRATION STANDARD SA/NS/NV/NA — Questions, Directives, Guide
  // ============================================================

  /**
   * Génère des questions de checklist standard (SA/NS/NV/NA) pour un sous-domaine.
   * Structure identique à generateSGSQuestions mais adaptée à la checklist standard ANACIM.
   */
  async generateStandardChecklistByIA(params: {
    aerodromeType: 'international' | 'national'
    domaineCode: string
    domaineLabel: string
    sousDomaine: string
    existingItems?: { numero: string; question: string }[]
    documentsActifs?: KitDocument[]
    profilRisque?: ProfilRisque
  }): Promise<{
    items: {
      numero: string
      reference_reglementaire: string
      point_verification: string
      directive_preuve: string
      directive_sa: string
      directive_ns: string
      directive_nv: string
      directive_na: string
    }[]
    justification: string
  }> {
    const { aerodromeType, domaineCode, domaineLabel, sousDomaine, existingItems, documentsActifs, profilRisque } = params

    const docsContext = documentsActifs && documentsActifs.length > 0
      ? `Documents réglementaires actifs :\n${documentsActifs.map(d => `- ${d.nom} (${d.reference_base || d.type_document}) v${d.version}`).join('\n')}`
      : 'Références : RAS 14 I & II (Aérodromes), Doc 9137, Doc 9157, Doc 9261'

    const existingContext = existingItems && existingItems.length > 0
      ? `Questions existantes (ne pas dupliquer) :\n${existingItems.map(i => `- ${i.numero}: ${i.question}`).join('\n')}`
      : 'Première génération — aucune question existante'

    const risqueContext = profilRisque
      ? `Profil de risque : SGS=${profilRisque.c1 ?? '?'}/100, SLI=${profilRisque.c2 ?? '?'}/100, Infrastructure=${profilRisque.c3 ?? '?'}/100`
      : ''

    const systemPrompt = `Tu es un expert en inspection d'aérodromes ANACIM Sénégal (RAS 14, Doc 9137, Doc 9157, Doc 9261 OACI).
Ta mission est de générer des questions de checklist standard d'inspection avec leurs directives SA/NS/NV/NA.

RÈGLES CRITIQUES :
1. Chaque question doit avoir une référence réglementaire précise (ex : RAS 14 I §9.2.1, Doc 9137 Part1 §4.1).
2. guide_etapes : liste d'étapes concrètes pour vérifier le point — UNE ÉTAPE PAR LIGNE, préfixée par un tiret "- ".
   NE PAS numéroter (pas de "1.", "2."…). Exemple : "- Demander le registre\n- Vérifier la date de dernière mise à jour\n- Contrôler la signature".
   Ce champ doit UNIQUEMENT contenir les étapes de vérification — PAS les critères SA/NS/NV/NA.
3. Les directives SA/NS/NV/NA sont des champs SÉPARÉS. Chacune est 1-2 phrases simples décrivant OBJECTIVEMENT l'état observé :
   - SA (Satisfaisant) : ce qui confirme la conformité réglementaire.
   - NS (Non Satisfaisant) : ce qui caractérise la non-conformité (écart mesurable ou observable).
   - NV (Non Validé) : quand la vérification est physiquement impossible lors de la visite.
   - NA (Non Applicable) : quand l'exigence ne s'applique pas à cet aérodrome selon sa catégorie.
4. Adapter le nombre de questions à la complexité du domaine (3-6 questions).
5. Type d'aérodrome : ${aerodromeType === 'international' ? 'International — inclure standards OACI/IATA' : 'National — se concentrer sur les exigences nationales RAS'}.
6. Répondre EXCLUSIVEMENT en JSON valide.

FORMAT DE RÉPONSE JSON :`

    const userMessage = `${docsContext}

Domaine : ${domaineCode} — ${domaineLabel}
Sous-domaine : ${sousDomaine}
${risqueContext}

${existingContext}

Génère un JSON avec cette structure exacte (guide_etapes = tirets, PAS de numéros) :
{
  "items": [
    {
      "numero": "${domaineCode}.01",
      "reference_reglementaire": "RAS 14 I §X.X.X",
      "point_verification": "La question à vérifier sous forme interrogative ?",
      "guide_etapes": "- Demander et examiner le document X\n- Vérifier la conformité de Y\n- Contrôler la date de Z\n- Observer l'état physique de l'équipement",
      "directive_sa": "Le document est présent, à jour et conforme aux exigences réglementaires. L'inspecteur confirme la mise en œuvre effective.",
      "directive_ns": "Le document est absent, périmé ou non conforme. Un ou plusieurs critères réglementaires ne sont pas satisfaits.",
      "directive_nv": "Le document ou l'équipement n'a pas pu être présenté lors de la visite. Une nouvelle vérification est à planifier.",
      "directive_na": "Cette exigence ne s'applique pas à cet aérodrome selon sa catégorie ou ses activités déclarées."
    }
  ],
  "justification": "Explication de la pertinence de ces questions pour ce domaine."
}`

    type StandardGenerationResult = {
      items: {
        numero: string
        reference_reglementaire: string
        point_verification: string
        guide_etapes: string
        directive_sa: string
        directive_ns: string
        directive_nv: string
        directive_na: string
      }[]
      justification: string
    }

    const result = await aiClient.callJSON<StandardGenerationResult>(
      {
        systemPrompt,
        userMessage,
        temperature: 0.2,
        maxTokens: 2000,
        responseFormat: 'json_object',
      },
      {
        items: [{
          numero: `${domaineCode}.01`,
          reference_reglementaire: 'RAS 14 I',
          point_verification: `Le domaine ${domaineLabel} est-il documenté et conforme ?`,
          guide_etapes: '- Demander la documentation\n- Vérifier la conformité\n- Confirmer la mise en œuvre',
          directive_sa: 'La documentation est complète, à jour et conforme aux exigences réglementaires.',
          directive_ns: 'La documentation est manquante, incomplète ou non conforme.',
          directive_nv: 'La documentation n\'a pas pu être présentée lors de la visite.',
          directive_na: 'Cette exigence ne s\'applique pas à cet aérodrome.',
        }],
        justification: 'Questions générées par IA',
      }
    )

    return {
      items: (result.items || []).map(i => ({
        numero: i.numero,
        reference_reglementaire: i.reference_reglementaire,
        point_verification: i.point_verification,
        directive_preuve: i.guide_etapes,
        directive_sa: i.directive_sa,
        directive_ns: i.directive_ns,
        directive_nv: i.directive_nv,
        directive_na: i.directive_na,
      })),
      justification: result.justification,
    }
  }

  isReady(): boolean {
    return this.initialized
  }

  // ============================================================
  // GÉNÉRATION SGS PAOE — Questions, Directives, Guides
  // ============================================================

  async generateSGSQuestions(params: {
    aerodromeType: 'international' | 'national'
    maturiteInitiale?: number
    composanteId: 1 | 2 | 3 | 4 | 5
    elementId: string
    elementLabel: string
    existingQuestions?: { ref: string; texte: string }[]
    documentsActifs?: KitDocument[]
  }): Promise<{
    questions: { ref: string; texte: string; sourceReglementaire: string }[]
    directives: { present: string[]; approprie: string[]; operationnel: string[]; efficace: string[] }
    guideEtapes: { etape: number; titre: string; actions: string[] }[]
    justification: string
  }> {
    const { aerodromeType, maturiteInitiale, composanteId, elementId, elementLabel, existingQuestions, documentsActifs } = params

    const composanteLabels: Record<number, string> = {
      1: 'Politique & objectifs de sécurité',
      2: 'Gestion des risques',
      3: 'Assurance sécurité',
      4: 'Promotion sécurité',
      5: 'Gestion des interfaces',
    }

    const docsContext = documentsActifs && documentsActifs.length > 0
      ? `Documents réglementaires actifs:\n${documentsActifs.map(d => `- ${d.nom} (${d.reference_base || d.type_document}) v${d.version}`).join('\n')}`
      : 'Documents de référence: RAS 19 (Annexe 19 OACI), RAS 14 (Aérodromes), Doc 9859 (Manuel de gestion de la sécurité)'

    const existingContext = existingQuestions && existingQuestions.length > 0
      ? `Questions existantes (à conserver ou mettre à jour):\n${existingQuestions.map(q => `- ${q.ref}: ${q.texte}`).join('\n')}`
      : 'Première génération — aucune question existante'

    const maturiteContext = maturiteInitiale !== undefined
      ? maturiteInitiale < 25
        ? 'Aérodrome avec SGS naissant — privilégier les questions fondamentales (niveau Présent/Approprié)'
        : maturiteInitiale < 50
          ? 'Aérodrome avec SGS en développement — équilibrer questions fondamentales et avancées'
          : maturiteInitiale < 75
            ? 'Aérodrome avec SGS mature — inclure questions niveau Opérationnel/Efficace'
            : 'Aérodrome avec SGS très mature — focus sur l\'efficacité et l\'amélioration continue'
      : 'Niveau de maturité inconnu — générer un ensemble complet et progressif'

    const systemPrompt = GENERER_SGS_QUESTIONS_PROMPT

    const userMessage = `${docsContext}

Composante ${composanteId}: ${composanteLabels[composanteId]}
Élément: ${elementId} — ${elementLabel}
Type d'aérodrome: ${aerodromeType}
${maturiteContext}

${existingContext}

Génère un JSON avec cette structure exacte:
{
  "questions": [
    {"ref": "SGS-X.X", "texte": "Question précise...", "sourceReglementaire": "RAS 19 §X.X.X"}
  ],
  "directives": {
    "present": ["Critère objectif pour niveau Présent..."],
    "approprie": ["Critère objectif pour niveau Approprié..."],
    "operationnel": ["Critère objectif pour niveau Opérationnel..."],
    "efficace": ["Critère objectif pour niveau Efficace..."]
  },
  "guideEtapes": [
    {"etape": 1, "titre": "Vérifier la documentation", "actions": ["Action 1", "Action 2"]},
    {"etape": 2, "titre": "Vérifier la mise en oeuvre", "actions": ["Action 1", "Action 2"]}
  ],
  "justification": "Pourquoi ces questions sont pertinentes pour cet élément..."
}`

    type SGSGenerationResult = {
      questions: { ref: string; texte: string; sourceReglementaire: string }[]
      directives: { present: string[]; approprie: string[]; operationnel: string[]; efficace: string[] }
      guideEtapes: { etape: number; titre: string; actions: string[] }[]
      justification: string
    }

    const result = await aiClient.callJSON<SGSGenerationResult>(
      {
        systemPrompt,
        userMessage,
        temperature: 0.2,
        maxTokens: 1500,
        responseFormat: 'json_object',
      },
      {
        questions: [{ ref: `${elementId}.q1`, texte: `L'élément ${elementLabel} est-il documenté?`, sourceReglementaire: 'Doc 9859 (SGS OACI)' }],
        directives: {
          present: ['Documenté et accessible'],
          approprie: ['Adapté au contexte'],
          operationnel: ['Appliqué au quotidien'],
          efficace: ['Résultats mesurables'],
        },
        guideEtapes: [{ etape: 1, titre: 'Vérifier', actions: ['Consulter la documentation'] }],
        justification: 'Questions générées par IA',
      }
    )

    return result
  }

  /**
   * Génère les questions SGS pour TOUTES les composantes et éléments
   * Utile pour la première initialisation ou mise à jour réglementaire majeure
   */
  async generateFullSGSChecklist(params: {
    aerodromeType: 'international' | 'national'
    maturiteInitiale?: number
    documentsActifs?: KitDocument[]
  }): Promise<{
    composantes: {
      id: number
      label: string
      elements: {
        id: string
        label: string
        questions: { ref: string; texte: string; sourceReglementaire: string }[]
        directives: { present: string[]; approprie: string[]; operationnel: string[]; efficace: string[] }
        guideEtapes: { etape: number; titre: string; actions: string[] }[]
      }[]
    }[]
    generatedAt: string
    documentsUtilises: string[]
  }> {
    const { aerodromeType, maturiteInitiale, documentsActifs } = params

    const composantesDef = [
      { id: 1, label: 'Politique & objectifs de sécurité', elements: [
        { id: '1.1', label: 'Politique sécurité' },
        { id: '1.2', label: 'Objectifs sécurité' },
        { id: '1.3', label: 'Responsabilités SGS' },
        { id: '1.4', label: 'Plan de réponse urgences' },
        { id: '1.5', label: 'Engagement direction' },
      ]},
      { id: 2, label: 'Gestion des risques', elements: [
        { id: '2.1', label: 'Identification dangers' },
        { id: '2.2', label: 'Analyse risques' },
        { id: '2.3', label: 'Mesures atténuation' },
        { id: '2.4', label: 'Gestion du changement' },
        { id: '2.5', label: 'Revue périodique' },
      ]},
      { id: 3, label: 'Assurance sécurité', elements: [
        { id: '3.1', label: 'Monitoring performances' },
        { id: '3.2', label: 'Audits internes' },
        { id: '3.3', label: 'Vérification post-changement' },
        { id: '3.4', label: 'Amélioration continue' },
        { id: '3.5', label: 'Reporting sécurité' },
      ]},
      { id: 4, label: 'Promotion sécurité', elements: [
        { id: '4.1', label: 'Formation' },
        { id: '4.2', label: 'Communication' },
        { id: '4.3', label: 'Culture reporting' },
        { id: '4.4', label: 'Retours d\'expérience' },
        { id: '4.5', label: 'Sensibilisation' },
      ]},
      { id: 5, label: 'Gestion des interfaces', elements: [
        { id: '5.1', label: 'Documentation des interfaces' },
        { id: '5.2', label: 'Coordinations' },
      ]},
    ]

    const result: { composantes: any[]; generatedAt: string; documentsUtilises: string[] } = {
      composantes: [],
      generatedAt: new Date().toISOString(),
      documentsUtilises: documentsActifs?.map(d => d.nom) || [],
    }

    for (const comp of composantesDef) {
      const compResult: { id: number; label: string; elements: any[] } = {
        id: comp.id,
        label: comp.label,
        elements: [],
      }

      for (const elem of comp.elements) {
        try {
          const elemResult = await this.generateSGSQuestions({
            aerodromeType,
            maturiteInitiale,
            composanteId: comp.id as 1 | 2 | 3 | 4 | 5,
            elementId: elem.id,
            elementLabel: elem.label,
            documentsActifs,
          })

          compResult.elements.push({
            id: elem.id,
            label: elem.label,
            questions: elemResult.questions,
            directives: elemResult.directives,
            guideEtapes: elemResult.guideEtapes,
          })
        } catch (err) {
          console.error(`[KitDocAgent] Erreur génération SGS ${elem.id}:`, err)
        }
      }

      if (compResult.elements.length > 0) {
        result.composantes.push(compResult)
      }
    }

    return result
  }

  /**
   * Compare une checklist SGS existante avec une nouvelle génération IA
   * Détecte: nouvelles questions, questions obsolètes, questions modifiées
   */
  compareSGSChecklists(
    existing: { ref: string; texte: string }[],
    generated: { ref: string; texte: string; sourceReglementaire: string }[]
  ): {
    nouvelles: { ref: string; texte: string; sourceReglementaire: string }[]
    obsoletees: { ref: string; texte: string }[]
    modifiees: { ref: string; ancienTexte: string; nouveauTexte: string }[]
    inchangees: { ref: string; texte: string }[]
  } {
    const existingMap = new Map(existing.map(q => [q.ref, q]))
    const generatedMap = new Map(generated.map(q => [q.ref, q]))

    const nouvelles: { ref: string; texte: string; sourceReglementaire: string }[] = []
    const obsoletees: { ref: string; texte: string }[] = []
    const modifiees: { ref: string; ancienTexte: string; nouveauTexte: string }[] = []
    const inchangees: { ref: string; texte: string }[] = []

    for (const [ref, q] of generatedMap) {
      const existingQ = existingMap.get(ref)
      if (!existingQ) {
        nouvelles.push(q)
      } else if (existingQ.texte !== q.texte) {
        modifiees.push({ ref, ancienTexte: existingQ.texte, nouveauTexte: q.texte })
      } else {
        inchangees.push({ ref, texte: q.texte })
      }
    }

    for (const [ref, q] of existingMap) {
      if (!generatedMap.has(ref)) {
        obsoletees.push(q)
      }
    }

    return { nouvelles, obsoletees, modifiees, inchangees }
  }

  // ──────────────────────────────────────────────────────────
  // MÉTHODES DE GÉNÉRATION PAR DOCUMENTS RÉGLEMENTAIRES
  // ──────────────────────────────────────────────────────────

  /**
   * Extrait le texte d'un document PDF via pdfjs-dist et le stocke sur le document.
   * Ne fait rien si le texte a déjà été extrait (sauf si force=true).
   */
  async extraireTexteDocument(docId: string, force = false): Promise<void> {
    const store = useAppStore.getState()
    const doc = store.kitDocuments.find(d => d.id === docId)
    if (!doc) return
    const versionChanged = doc.texte_extrait_version && doc.texte_extrait_version !== doc.version
    if (doc.contenu_complet && !force && !versionChanged) return

    const fichierUrl = doc.fichier_url
    if (!fichierUrl) {
      console.warn(`[KitDocAgent] Aucun fichier_url pour "${doc.nom}" (id=${docId}) — extraction PDF impossible`)
      return
    }

    try {
      console.log(`[KitDocAgent] Extraction PDF: "${doc.nom}" url=${fichierUrl.substring(0, 100)}...`)
      const result = await extractTextFromPDF(fichierUrl)
      console.log(`[KitDocAgent] Extraction OK: ${doc.nom} — ${result.texte_complet.length} caractères, ${result.nb_pages} pages, ${result.chapitres.length} chapitres`)
      store.updateKitDocument(docId, {
        contenu_complet: result.texte_complet,
        texte_extrait_le: new Date().toISOString(),
        texte_extrait_version: doc.version,
      })
    } catch (err) {
      console.error(`[KitDocAgent] Erreur extraction PDF ${doc.nom}:`, err)
    }
  }

  /**
   * Nettoie un sous-domaine renvoyé par l'IA : supprime le préfixe slug/code
   * Ex: "OLS_surfaces_de_limitation_d_obstacles_surface_conique  Surfaces..." → "Surfaces de limitation d'obstacles - Surface conique"
   */
  private cleanSousDomaine(sd: string | undefined): string | undefined {
    if (!sd) return undefined
    // Supprime préfixe slug "RA_plan_d_urgence  " ou "OLS_surfaces_  " → garde le label après
    let cleaned = sd.replace(/^[A-Z]{2,4}_[a-z_]+(?:\s+|[_-]{2,})/, '')
    // Si encore un code domaine _ au début
    cleaned = cleaned.replace(/^[A-Z]{2,4}_/, '')
    return cleaned.trim() || sd
  }

  /**
   * Génère les items de checklist pour un document à partir de son texte.
   * Utilise l'IA pour analyser le texte réglementaire et produire des items structurés.
   * Les items sont stockés sur le document (items_generes) pour éviter les régénérations.
   */
  async genererItemsPourDocument(docId: string, domainesCibles?: string[], type_entite: 'aerodrome' | 'helistation' | 'mixte' | 'tous' = 'aerodrome'): Promise<KitChecklistItemGenere[]> {
    const store = useAppStore.getState()
    const doc = store.kitDocuments.find(d => d.id === docId)
    if (!doc) return []

    if (!doc.contenu_complet) {
      await this.extraireTexteDocument(docId)
    }

    const docMaj = useAppStore.getState().kitDocuments.find(d => d.id === docId) || doc
    let stored = docMaj.items_generes || []

    // Invalidation automatique si la version du document a changé
    const versionChanged = docMaj.items_generes_version && docMaj.items_generes_version !== docMaj.version
    if (versionChanged) {
      console.log(`[KitDocAgent] Version changée pour ${docMaj.nom}: ${docMaj.items_generes_version} → ${docMaj.version}, cache invalidé`)
      stored = []
    }

    const storedDomaines = new Set(stored.map(i => i.domaine))
    const domainesAGenerer = domainesCibles
      ? domainesCibles.filter(d => !storedDomaines.has(d))
      : docMaj.domaines.filter(d => !storedDomaines.has(d))

    console.log(`[genererItemsPourDocument] ${docMaj.nom}: domainesCibles=${domainesCibles?.join(',')} domainesAGenerer=${domainesAGenerer.join(',')} stored=${stored.length} items texte=${(docMaj.contenu_complet || '').length}chars`)

    if (domainesAGenerer.length === 0) {
      return stored.filter(i => !domainesCibles || domainesCibles.includes(i.domaine))
    }

    const texte = docMaj.contenu_complet || ''
    if (texte.length < 50) return stored

    const chapitres = decouperChapitres(texte)
    const nouveauxItems: KitChecklistItemGenere[] = []

    for (const domaine of domainesAGenerer) {
      // 1. Essaye le mapping structuré (numéros de chapitres exacts par domaine)
      const mapping = filtrerChapitresParMapping(chapitres, domaine, type_entite)
      // 2. Complète avec les mots-clés pour attraper le contenu non-chapitré
      const chapitresKeywords = filtrerChapitresParDomaine(chapitres, domaine, type_entite)
      // 3. Fusion : mapping en priorité, ajoute les mots-clés non déjà présents
      const seen = new Set(mapping.textes)
      const chapitresPertinents = [...mapping.textes, ...chapitresKeywords.filter(c => !seen.has(c))]

      let sourcesInfo = ''
      if (mapping.textes.length > 0) {
        sourcesInfo = `Chapitres ${mapping.numerosTrouves.join(', ')} du document ${docMaj.reference_base || docMaj.nom}`
        console.log(`[genererItemsPourDocument] ${domaine}: mapping=${mapping.numerosTrouves.length} keywords=${chapitresKeywords.length} fusion=${chapitresPertinents.length}`)
      } else {
        console.log(`[genererItemsPourDocument] ${domaine}: keywords → ${chapitresPertinents.length} chapitres trouvés`)
      }

      if (chapitresPertinents.length === 0) {
        const contexteFallback = texte.substring(0, 8000)
        if (contexteFallback.length < 50) continue

        const aiResult = await aiClient.callJSON<{ items: any[] }>(
          {
            systemPrompt: GENERER_ITEMS_CHECKLIST_PROMPT,
            userMessage: `Document: "${docMaj.nom}" (${docMaj.reference_base || ''})
Domaine cible: ${domaine}

Texte réglementaire (début du document — aucun chapitre spécifique au domaine ${domaine} n'a été détecté) :
${contexteFallback}

Génère les items de checklist standard pour le domaine ${domaine}.
Parcours tout le texte fourni article par article, et crée un item distinct pour chaque exigence réglementaire vérifiable.

Format attendu (génère autant d'items que d'exigences distinctes dans le texte) :
{
  "items": [
    {
      "numero": "01",
      "reference_reglementaire": "réf. précise",
      "sous_domaine": "Pistes",
      "point_verification": "question claire ?",
      "directive_preuve": "guide détaillé étape par étape",
      "directive_sa": "critère objectif satisfaisant",
      "directive_ns": "critère objectif non satisfaisant",
      "directive_nv": "quand impossible",
      "directive_na": "quand non applicable",
      "type_entite_cible": "aerodrome|helistation|tous"
    }
  ]
}`,
            temperature: 0.15,
            maxTokens: 24000,
            responseFormat: 'json_object',
          },
          { items: [] }
        )

        if (aiResult.items && aiResult.items.length > 0) {
          for (let i = 0; i < aiResult.items.length; i++) {
            const item = aiResult.items[i]
            nouveauxItems.push({
              id: `${docId}_${domaine}_${String(i + 1).padStart(2, '0')}`,
              numero: item.numero || `${String(i + 1).padStart(2, '0')}`,
              reference_reglementaire: item.reference_reglementaire || `${docMaj.reference_base || 'RAS 14 I'}`,
              point_verification: item.point_verification || `Vérification ${domaine} — ${docMaj.nom}`,
              directive_preuve: Array.isArray(item.directive_preuve) ? item.directive_preuve.join('\n') : (typeof item.directive_preuve === 'string' ? item.directive_preuve : item.guide_etapes || ''),
              directive_sa: item.directive_sa,
              directive_ns: item.directive_ns,
              directive_nv: item.directive_nv,
              directive_na: item.directive_na,
              domaine,
              sous_domaine: this.cleanSousDomaine(item.sous_domaine),
              type_entite_cible: item.type_entite_cible || 'tous',
              source_document_id: docId,
            })
          }
        }
        continue
      }

      const contexteTexte = chapitresPertinents.join('\n\n').substring(0, 35000)
      const indicationSources = sourcesInfo ? `\nSources identifiées: ${sourcesInfo}` : ''

      const aiResult = await aiClient.callJSON<{ items: any[] }>(
        {
          systemPrompt: GENERER_ITEMS_CHECKLIST_PROMPT,
          userMessage: `Document: "${docMaj.nom}" (${docMaj.reference_base || ''})
Domaine cible: ${domaine}${indicationSources}

Texte réglementaire (chapitres pertinents) :
${contexteTexte}

Génère les items de checklist standard pour le domaine ${domaine}.
Parcours tout le texte fourni article par article, et crée un item distinct pour chaque exigence réglementaire vérifiable.

Format attendu (génère autant d'items que d'exigences distinctes dans le texte) :
{
  "items": [
    {
      "numero": "01",
      "reference_reglementaire": "réf. précise",
      "sous_domaine": "Pistes",
      "point_verification": "question claire ?",
      "directive_preuve": "guide détaillé étape par étape",
      "directive_sa": "critère objectif satisfaisant",
      "directive_ns": "critère objectif non satisfaisant",
      "directive_nv": "quand impossible",
      "directive_na": "quand non applicable",
      "type_entite_cible": "aerodrome|helistation|tous"
    }
  ]
}`,
          temperature: 0.15,
          maxTokens: 24000,
          responseFormat: 'json_object',
        },
        { items: [] }
      )

      if (aiResult.items && aiResult.items.length > 0) {
        for (let i = 0; i < aiResult.items.length; i++) {
          const item = aiResult.items[i]
          nouveauxItems.push({
            id: `${docId}_${domaine}_${String(i + 1).padStart(2, '0')}`,
            numero: item.numero || `${String(i + 1).padStart(2, '0')}`,
            reference_reglementaire: item.reference_reglementaire || `${docMaj.reference_base || 'RAS 14 I'}`,
            point_verification: item.point_verification || `Vérification ${domaine} — ${docMaj.nom}`,
            directive_preuve: item.directive_preuve || item.guide_etapes || '',
            directive_sa: item.directive_sa,
            directive_ns: item.directive_ns,
            directive_nv: item.directive_nv,
            directive_na: item.directive_na,
            domaine,
            sous_domaine: item.sous_domaine,
            type_entite_cible: item.type_entite_cible || 'tous',
            source_document_id: docId,
          })
        }
      }
    }

    const tousItems = [...stored, ...nouveauxItems]
    console.log(`[genererItemsPourDocument] ${docMaj.nom}: généré ${nouveauxItems.length} items pour domaines ${domainesAGenerer.join(',')} — total ${tousItems.length}`)
    store.updateKitDocument(docId, {
      items_generes: tousItems,
      items_generes_le: new Date().toISOString(),
      items_generes_version: docMaj.version,
    })

    return tousItems.filter(i => !domainesCibles || domainesCibles.includes(i.domaine))
  }

  /**
   * Génère les items de checklist pour une portée donnée à partir des documents disponibles.
   * Parcourt chaque domaine de la portée, trouve les documents pertinents via le mapping,
   * génère les items par IA (ou utilise le cache), et retourne une checklist structurée.
   */
  async genererChecklistDepuisPortee(options: {
    portee: string[]
    type_entite: 'aerodrome' | 'helistation' | 'mixte' | 'tous'
    type_surveillance: TypeSurveillanceKit
    force?: boolean
    entite_id?: string
  }): Promise<void> {
    const { portee, type_entite, type_surveillance, force, entite_id } = options
    const store = useAppStore.getState()
    const docs = (store.kitDocuments || []).filter(d =>
      d.etat === 'a_jour' || d.etat === 'en_revision'
    )

    for (const domaine of portee) {
      console.log(`[genererChecklistDepuisPortee] Traitement domaine "${domaine}"...`)
      if (domaine === 'SGS') {
        // SGS : générer le template d'évaluation PAOE (questions + directives + guide)
        if (type_surveillance !== 'maintien') {
          await this.genererSGSTemplate({
            aerodromeType: type_entite === 'helistation' ? 'national' : 'national',
            aerodromeId: entite_id,
          })
        }
        continue
      }

      const sources = getSourcesForDomaine(domaine, type_entite)
      if (sources.length === 0) continue

      const docsPertinents = docs.filter(d =>
        d.domaines.includes(domaine) || sources.some(s =>
          s.ref_pattern.test(`${d.reference_base || ''} ${d.nom || ''}`)
        )
      )

      // Fallback : si aucun document ne matche le domaine via domaines[] ou ref_pattern,
      // utiliser les documents qui ont du texte extrait plutôt que de laisser le domaine vide
      const docsAEssayer = docsPertinents.length > 0
        ? docsPertinents
        : docs.filter(d => d.contenu_complet && d.contenu_complet.length > 50).slice(0, 2)

      console.log(`[genererChecklistDepuisPortee] ${domaine}: ${docsPertinents.length} docs pertinents, ${docsAEssayer.length} à essayer`)

      for (const doc of docsAEssayer) {
        if (force) {
          store.updateKitDocument(doc.id, { items_generes: [] })
        }
        await this.genererItemsPourDocument(doc.id, [domaine], type_entite)
      }
    }
  }

  /**
   * Génère le template SGS (questions + directives + guide étapes) pour tous les éléments
   * et le sauvegarde sur l'aérodrome.
   */
  async genererSGSTemplate(params: {
    aerodromeType: 'international' | 'national'
    aerodromeId?: string
  }): Promise<void> {
    const store = useAppStore.getState()
    const aerodromes = params.aerodromeId
      ? store.aerodromes.filter(a => a.id === params.aerodromeId)
      : store.aerodromes
    if (aerodromes.length === 0) return

    for (const aerodrome of aerodromes) {
      const existing = aerodrome.sgs_checklist_template
      const versionChanged = aerodrome.sgs_checklist_template_version && aerodrome.sgs_checklist_template_version !== aerodrome.maturite_sgs.toString()
      if (existing && Object.keys(existing).length > 0 && !versionChanged) continue

      const result = await this.generateFullSGSChecklist({
        aerodromeType: params.aerodromeType,
        maturiteInitiale: aerodrome.maturite_sgs,
        documentsActifs: store.kitDocuments?.filter(d => d.etat === 'a_jour' && d.domaines.includes('SGS')) || [],
      })

      const template: Record<string, any> = {}
      for (const comp of result.composantes) {
        for (const elem of comp.elements) {
          template[elem.id] = {
            questions: elem.questions,
            directives: elem.directives,
            guideEtapes: elem.guideEtapes,
          }
        }
      }

      store.updateAerodrome(aerodrome.id, { sgs_checklist_template: template as any, sgs_checklist_template_version: aerodrome.maturite_sgs.toString() })
    }
  }
}

export const kitDocAgent = new KitDocAgent()
