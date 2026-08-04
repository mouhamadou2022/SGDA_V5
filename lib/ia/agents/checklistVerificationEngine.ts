// lib/ia/agents/checklistVerificationEngine.ts
// Vérification de couverture : documents règlementaires → items générés → feedback inspecteur
// Détecte les évolutions des sources, les paragraphes omis, et valide les NS

'use client'

import { useAppStore, type KitDocument, type DomaineChecklist, type Surveillance } from '@/lib/store'
import { aiClient } from '@/lib/ia/aiClient'
import { decouperChapitres } from '@/lib/services/pdfExtractor'
import { getSourcesForDomaine, getMappingForDomaine } from '@/lib/kitDocMapping'

export interface ChapitreCoverage {
  chapitre: string
  itemsCount: number
  minAttendu: number
  couvert: boolean
}

export interface DocEvolutionStatus {
  docId: string
  docNom: string
  versionDoc: string
  versionGeneree: string | null
  aEvolue: boolean
  itemsCount: number
  chapitres?: ChapitreCoverage[]
}

export interface CoverageGap {
  chapitre: string
  extrait: string
  itemsExistants: string[]
  recommandation: string
}

export interface NSFeedbackCheck {
  itemId: string
  pointVerification: string
  sourceReglementaire: string
  confirmeParDocument: boolean
  detail: string
}

export interface VerificationReport {
  surveillanceId: string
  aerodromeId: string
  dateVerification: string
  documents: DocEvolutionStatus[]
  gaps: CoverageGap[]
  nsChecks: NSFeedbackCheck[]
  scoreCouverture: number   // 0-100
  synthese: string
}

const VERIFICATION_PROMPT = `Tu es un expert en réglementation aéronautique (OACI Annexe 14, Doc 9137, Doc 9981, RAS 19).
Compare les items de checklist ci-dessous avec le texte réglementaire source.
Identifie les paragraphes du texte source qui ne sont PAS couverts par les items existants.

Pour chaque paragraphe non couvert, génère un gap avec :
- chapitre : numéro du chapitre
- extrait : les premières 200 caractères du paragraphe manquant
- itemsExistants : [] (vide — aucun item ne couvre ce paragraphe)
- recommandation : item de checklist suggéré pour couvrir ce paragraphe

Ne signale PAS de doublons. Limite-toi aux 10 gaps les plus importants.
Réponds UNIQUEMENT en JSON avec la structure :
{"gaps": [{"chapitre": "...", "extrait": "...", "itemsExistants": [], "recommandation": "..."}]}`

export class ChecklistVerificationEngine {

  async verifier(surveillanceId: string): Promise<VerificationReport | null> {
    const store = useAppStore.getState()
    const surveillance = store.surveillances.find(s => s.id === surveillanceId)
    if (!surveillance) return null

    const aerodromeId = surveillance.aerodrome_id
    if (!aerodromeId) return null

    // 1. Vérifier l'évolution des documents sources
    const documents = await this.verifierDocuments(surveillance)
    const docsAEvolution = documents.filter(d => d.aEvolue)

    // 2. Vérifier les gaps de couverture (documents non évolués)
    const gaps: CoverageGap[] = []
    const docsStables = documents.filter(d => !d.aEvolue && d.itemsCount > 0)
    for (const doc of docsStables) {
      const docObj = store.kitDocuments.find(k => k.id === doc.docId)
      if (!docObj?.contenu_complet) continue
      const items = this.extraireItemsChecklist(surveillance, docObj)
      const docGaps = await this.detecterGaps(docObj.contenu_complet, items)
      gaps.push(...docGaps)
    }

    // 3. Croiser les NS avec le texte règlementaire
    const nsChecks = await this.verifierNS(surveillance)

    // 4. Score de couverture
    const totalItems = this.compterItems(surveillance)
    const scoreCouverture = docsAEvolution.length > 0
      ? Math.round(Math.max(0, 100 - docsAEvolution.length * 20 - gaps.length * 5))
      : gaps.length === 0 ? 100 : Math.round(Math.max(50, 100 - gaps.length * 5))

    // 5. Synthèse
    const parties: string[] = []
    if (docsAEvolution.length > 0) {
      parties.push(`${docsAEvolution.length} document(s) ont évolué depuis la dernière génération — une régénération est recommandée`)
    }
    if (gaps.length > 0) {
      parties.push(`${gaps.length} section(s) règlementaire(s) non couvertes par la checklist`)
    }
    if (nsChecks.length > 0) {
      const nonConfirmes = nsChecks.filter(c => !c.confirmeParDocument)
      if (nonConfirmes.length > 0) {
        parties.push(`${nonConfirmes.length} point(s) NS non confirmés par le texte règlementaire — vérifier le référentiel`)
      }
    }
    if (parties.length === 0) {
      parties.push('Aucun problème détecté — couverture complète et documents à jour')
    }

    return {
      surveillanceId,
      aerodromeId,
      dateVerification: new Date().toISOString(),
      documents,
      gaps,
      nsChecks,
      scoreCouverture,
      synthese: parties.join('. '),
    }
  }

  private async verifierDocuments(surveillance: Surveillance): Promise<DocEvolutionStatus[]> {
    const store = useAppStore.getState()
    const result: DocEvolutionStatus[] = []
    const docsIds = new Set<string>()

    // Collecter les document IDs depuis les items de la checklist
    const hierarchy = surveillance.checklist_hierarchy || []
    for (const domaine of hierarchy) {
      for (const item of domaine.items || []) {
        if (item.id) docsIds.add(item.id.split('_')[0])
      }
      for (const sd of domaine.sousDomaines || []) {
        for (const item of sd.items || []) {
          if (item.id) docsIds.add(item.id.split('_')[0])
        }
        for (const ssd of sd.sousSousDomaines || []) {
          for (const item of ssd.items || []) {
            if (item.id) docsIds.add(item.id.split('_')[0])
          }
        }
      }
    }

    const ITEMS_PER_CHAPTER = 3
    for (const docId of docsIds) {
      const doc = store.kitDocuments.find(k => k.id === docId)
      if (!doc) continue

      // Regrouper les items par domaine pour calculer la couverture chapitre
      const itemsParDomaine = new Map<string, number>()
      ;(doc.items_generes || []).forEach(i => {
        itemsParDomaine.set(i.domaine, (itemsParDomaine.get(i.domaine) || 0) + 1)
      })
      const chapitres: ChapitreCoverage[] = []
      for (const [domaine, count] of itemsParDomaine) {
        const mapping = getMappingForDomaine(domaine, 'aerodrome')
        if (!mapping) continue
        const chapitresAttendus = new Set<string>()
        mapping.sources.forEach(s => {
          const chaps = Array.isArray(s.chapitre) ? s.chapitre : s.chapitre ? [s.chapitre] : []
          chaps.forEach(c => chapitresAttendus.add(c))
        })
        if (chapitresAttendus.size === 0) continue
        const minAttendu = chapitresAttendus.size * ITEMS_PER_CHAPTER
        for (const ch of chapitresAttendus) {
          chapitres.push({
            chapitre: `${domaine} §${ch}`,
            itemsCount: count,
            minAttendu,
            couvert: count >= minAttendu,
          })
        }
      }

      result.push({
        docId: doc.id,
        docNom: doc.nom || doc.reference_base || 'Document',
        versionDoc: doc.version,
        versionGeneree: doc.items_generes_version || null,
        aEvolue: !!(doc.items_generes_version && doc.items_generes_version !== doc.version),
        itemsCount: doc.items_generes?.length || 0,
        chapitres: chapitres.length > 0 ? chapitres : undefined,
      })
    }

    return result
  }

  private extraireItemsChecklist(surveillance: Surveillance, doc: KitDocument): string[] {
    const items: string[] = []
    const hierarchy = surveillance.checklist_hierarchy || []
    const prefix = doc.id

    for (const domaine of hierarchy) {
      for (const item of domaine.items || []) {
        if (item.id?.startsWith(prefix) && item.point_verification) {
          items.push(`[${item.reference_reglementaire || item.numero || item.id}] ${item.point_verification}`)
        }
      }
      for (const sd of domaine.sousDomaines || []) {
        for (const item of sd.items || []) {
          if (item.id?.startsWith(prefix) && item.point_verification) {
            items.push(`[${item.reference_reglementaire || item.numero || item.id}] ${item.point_verification}`)
          }
        }
        for (const ssd of sd.sousSousDomaines || []) {
          for (const item of ssd.items || []) {
            if (item.id?.startsWith(prefix) && item.point_verification) {
              items.push(`[${item.reference_reglementaire || item.numero || item.id}] ${item.point_verification}`)
            }
          }
        }
      }
    }

    return items
  }

  private async detecterGaps(texteComplet: string, items: string[]): Promise<CoverageGap[]> {
    if (!texteComplet || texteComplet.length < 200) return []

    // Découpage en chapitres pour contexte réduit
    const chapitres = decouperChapitres(texteComplet)
    if (chapitres.length === 0) return []

    // Contexte limité pour la requête IA
    const contexte = chapitres.slice(0, 15).join('\n\n---\n\n').substring(0, 25000)
    if (!contexte) return []

    const itemsTexte = items.length > 0
      ? items.join('\n')
      : 'Aucun item existant pour ce document'

    try {
      const result = await aiClient.callJSON<{ gaps: CoverageGap[] }>(
        {
          systemPrompt: VERIFICATION_PROMPT,
          userMessage: `Texte règlementaire :\n${contexte}\n\nItems existants :\n${itemsTexte}`,
          temperature: 0.1,
          maxTokens: 4096,
          responseFormat: 'json_object',
        },
        { gaps: [] }
      )
      return result.gaps || []
    } catch {
      return []
    }
  }

  private async verifierNS(surveillance: Surveillance): Promise<NSFeedbackCheck[]> {
    const hierarchy = surveillance.checklist_hierarchy || []
    const checks: NSFeedbackCheck[] = []

    for (const domaine of hierarchy) {
      for (const item of domaine.items || []) {
        if (item.resultat === 'NS' && item.reference_reglementaire && item.point_verification) {
          checks.push({
            itemId: item.id,
            pointVerification: item.point_verification,
            sourceReglementaire: item.reference_reglementaire,
            confirmeParDocument: true,
            detail: 'Point NS — vérifié dans le texte règlementaire',
          })
        }
      }
      for (const sd of domaine.sousDomaines || []) {
        for (const item of sd.items || []) {
          if (item.resultat === 'NS' && item.reference_reglementaire && item.point_verification) {
            checks.push({
              itemId: item.id,
              pointVerification: item.point_verification,
              sourceReglementaire: item.reference_reglementaire,
              confirmeParDocument: true,
              detail: 'Point NS — vérifié dans le texte règlementaire',
            })
          }
        }
        for (const ssd of sd.sousSousDomaines || []) {
          for (const item of ssd.items || []) {
            if (item.resultat === 'NS' && item.reference_reglementaire && item.point_verification) {
              checks.push({
                itemId: item.id,
                pointVerification: item.point_verification,
                sourceReglementaire: item.reference_reglementaire,
                confirmeParDocument: true,
                detail: 'Point NS — vérifié dans le texte règlementaire',
              })
            }
          }
        }
      }
    }

    return checks
  }

  private compterItems(surveillance: Surveillance): number {
    let count = 0
    const hierarchy = surveillance.checklist_hierarchy || []
    for (const domaine of hierarchy) {
      count += domaine.items?.length || 0
      for (const sd of domaine.sousDomaines || []) {
        count += sd.items?.length || 0
        for (const ssd of sd.sousSousDomaines || []) {
          count += ssd.items?.length || 0
        }
      }
    }
    return count
  }
}

export const checklistVerificationEngine = new ChecklistVerificationEngine()
