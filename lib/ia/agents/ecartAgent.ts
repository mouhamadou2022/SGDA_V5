// lib/ia/agents/ecartAgent.ts
// Agent 3 — Écarts & PAC
// Libellés réglementaires générés par LLM + évaluation PAC intelligente

'use client'

import { useAppStore, Ecart, SoumissionPAC, SoumissionPreuves, ProfilRisque, Aerodrome } from '@/lib/store'
import { plansActionsUtils } from '@/lib/plansActionsUtils'
import { computeHawkesContagion } from '@/lib/risque'
import { aiClient } from '@/lib/ia/aiClient'
import { ECART_SYSTEM_PROMPT, SGS_ECART_SYSTEM_PROMPT, PAC_SYSTEM_PROMPT } from '@/lib/ia/prompts'
import { construireContexteReglementaire, recupererExtraitsReglementaires } from '@/lib/ia/rag/reglementaireRagClient'
import { rechercherAutorite, formaterSourcesWeb } from '@/lib/ia/rag/rechercheWeb'
import { getRiskLevelFromCell } from '@/lib/risque'
import { getRecentCorrections } from '@/lib/riskIndex'
import { libelleMemory } from '@/lib/ia/libelleMemory'
import { suggestGraviteFromTexte, classifyEcartTexte } from '@/lib/risque/ecartClassifier'

export interface GenerateEcartRequest {
  itemsNSNV: Array<{
    id: string
    numero: string
    point_verification?: string
    description?: string
    reference_reglementaire: string
    observation?: string
    justification?: string
    domaine: string
    resultat?: 'NS' | 'NV'
    paoeLevel?: 'absent' | 'present' | 'approprie'
  }>
  aerodromeId: string
  surveillanceId?: string
  profil?: ProfilRisque
  /** Instruction personnalisée de l'inspecteur pour régénérer l'écart */
  instruction?: string
  /** Autorise la recherche web sur les autorités aviation si le Kit local couvre mal le sujet */
  rechercheWeb?: boolean
}

export type NiveauGraviteOACI = 'A' | 'B' | 'C' | 'D' | 'E'
export type NiveauProbabiliteOACI = 1 | 2 | 3 | 4 | 5

export interface GenerateEcartResult {
  libelle: string
  ref_reglementaire: string
  niveau_risque: 'critique' | 'eleve' | 'moyen' | 'faible'
  cellule: string
  probabilite: NiveauProbabiliteOACI
  gravite: NiveauGraviteOACI
  justification: string
  delai_pac_propose: number
  delai_regularisation_propose: number
  domaine: string
  confiance: number
  items_lies: string[]
  /** Avis watch-dog de l'IA : quelle combinaison/regroupement recommander et pourquoi */
  avis?: string
  /** Explication explicite (« pourquoi ») du raisonnement de l'IA pour cette
   *  suggestion : pourquoi ce libellé, ce niveau de risque et ce regroupement.
   *  Distinct de `justification` (qui décrit l'indice OACI). */
  pourquoi?: string
  /** Intervalle de confiance de la prédiction (min/max, en %) */ 
  intervalleConfiance?: { min: number; max: number }
  /** Nombre d'écarts recommandés par l'IA à partir des items sélectionnés */
  nbEcartsRecommande?: number
  /** true si le LLM a réellement produit la suggestion ; false si l'IA est
   *  indisponible et qu'un fallback local a été utilisé. Le composant utilise
   *  ce drapeau pour décider s'il présente une « suggestion IA » ou bascule
   *  sur la rédaction manuelle (champ « Libellé de la constatation »). */
  iaDisponible?: boolean
}

export interface EvaluatePACRequest {
  ecartId: string
  pac: SoumissionPAC
}

export interface EvaluatePACResult {
  note_globale: number
  notes_detail: {
    pertinence: number
    exhaustivite: number
    precision: number
    specificite: number
    realisme: number
    coherence: number
  }
  decision: 'accepte' | 'refuse'
  commentaire: string
  ameliorations_suggestions: string[]
  confiance: number
}

export interface VerifyPreuvesRequest {
  ecartId: string
  preuves: SoumissionPreuves
}

export interface VerifyPreuvesResult {
  conforme: boolean
  niveauConfiance: number
  elementsManquants: string[]
  commentaire: string
  preuvesSuffisantes: boolean
}

export interface SuggestActionsRequest {
  ecart: Ecart
  profil?: ProfilRisque
}

export interface ActionSuggestion {
  id: string
  description: string
  responsable: string
  delaiPropose: number
  priorite: 'haute' | 'moyenne' | 'basse'
  impactEstime: number
  probabiliteSucces: number
}

type PACAction = SoumissionPAC['actions'][number]

const NOTES_SEUILS = { ACCEPTE: 70, REFUSE: 40 }

const GRAVITE_LABELS: Record<NiveauGraviteOACI, string> = {
  A: 'Catastrophique (perte de vie ou aéronef)',
  B: 'Grave (blessures graves, dommages importants)',
  C: 'Majeure (incident sérieux, blessures légères)',
  D: 'Mineure (procédures d\'urgence requises)',
  E: 'Négligeable (nuisance sans impact opérationnel)',
}
const PROBABILITE_LABELS: Record<NiveauProbabiliteOACI, string> = {
  5: 'Fréquent (survient souvent)',
  4: 'Probable (survient plusieurs fois)',
  3: 'Occasionnel (survient parfois)',
  2: 'Rare (peu probable mais possible)',
  1: 'Improbable (très peu probable)',
}

const NIVEAUX_DELAI: Record<string, { pac: number; regularisation: number }> = {
  critique: { pac: 3, regularisation: 7 },
  eleve: { pac: 7, regularisation: 30 },
  moyen: { pac: 15, regularisation: 90 },
  faible: { pac: 30, regularisation: 180 },
}

// Gravité OACI à partir du niveau sémantique local (classifieur texte de l'inspecteur).
const GRAVITE_OACI_PAR_NIVEAU: Record<string, NiveauGraviteOACI> = {
  critique: 'A',
  eleve: 'B',
  moyen: 'C',
  faible: 'D',
}

/**
 * Estimation LOCALE déterministe (100 % sans LLM) de l'indice OACI à partir des
 * items sélectionnés (observations + nombre de non-conformités). Sert de garde-fou
 * quand le modèle renvoie la cellule neutre par défaut (3C) au lieu de raisonner.
 */
function estimerCelluleLocale(items: GenerateEcartRequest['itemsNSNV']): { probabilite: NiveauProbabiliteOACI; gravite: NiveauGraviteOACI } {
  const texte = items.map(i => `${i.observation || ''} ${i.point_verification || i.description || ''}`).join(' ').slice(0, 500)
  let gravOACI: NiveauGraviteOACI = 'C'
  try {
    const { gravite } = suggestGraviteFromTexte(texte)
    gravOACI = GRAVITE_OACI_PAR_NIVEAU[gravite as keyof typeof GRAVITE_OACI_PAR_NIVEAU] || 'C'
  } catch { /* ignore */ }

  const n = items.length
  const prob: NiveauProbabiliteOACI =
    n >= 4 ? 4
    : n === 3 ? 4
    : n === 2 ? 3
    : 3

  return { probabilite: prob, gravite: gravOACI }
}

export class EcartAgent {
  private initialized = false
  private evaluationCache = new Map<string, EvaluatePACResult>()
  private verificationCache = new Map<string, VerifyPreuvesResult>()
  private relanceCache = new Map<string, { titre: string; contenu: string; delai: string }>()

  async init(_storeData: unknown): Promise<void> {
    this.initialized = true
    libelleMemory.initFromIDB()
  }

  // ============================================================
  // GÉNÉRATION D'ÉCART — libellé officiel par LLM
  // ============================================================

  async generateEcart(request: GenerateEcartRequest, _storeData: unknown): Promise<GenerateEcartResult> {
    const store = useAppStore.getState()
    const aerodrome = store.aerodromes.find((a: Aerodrome) => a.id === request.aerodromeId)

    const domaine = request.itemsNSNV[0]?.domaine ?? 'Général'
    const isSGS = domaine === 'SGS'
    const refs = [...new Set(request.itemsNSNV.map(i => i.reference_reglementaire).filter(Boolean))]

    // Contexte réglementaire RAG (Kit Inspecteur)
    const contexteReglementaire = construireContexteReglementaire({
      domaines: request.itemsNSNV.map(i => i.domaine),
      type_entite: aerodrome?.type_entite,
      requete: request.itemsNSNV.map(i => i.point_verification || i.description || '').join(' '),
      maxChars: 3500,
    })

    // ── RECHERCHE WEB AUTORITÉS (enrichissement) ──────────────────
    // Si le Kit Inspecteur local ne couvre PAS ce sujet, on interroge les sites
    // officiels d'aviation (OACI, EASA, FAA, DGAC, IATA, ACI, ANACIM, ASECNA, ANAC…).
    // Strictement borné : timeout court + ne bloque jamais la génération rapide.
    let contexteAvecWeb = contexteReglementaire
    if (request.rechercheWeb !== false) {
      const perteKit = recupererExtraitsReglementaires({
        domaines: request.itemsNSNV.map(i => i.domaine),
        type_entite: aerodrome?.type_entite,
        requete: request.itemsNSNV.map(i => i.point_verification || i.description || '').join(' '),
        maxChunks: 3,
        maxChars: 1000,
      })
      if (perteKit.length === 0) {
        const requeteWeb = request.itemsNSNV
          .map(i => `${i.point_verification || i.description || ''} ${i.reference_reglementaire || ''}`)
          .join(' ')
          .trim()
          .slice(0, 120)
        if (requeteWeb) {
          try {
            const sourcesWeb = await Promise.race([
              rechercherAutorite(requeteWeb, { max: 4 }),
              new Promise<Awaited<ReturnType<typeof rechercherAutorite>>>(resolve => setTimeout(() => resolve([]), 800)),
            ])
            if (sourcesWeb.length > 0) {
              contexteAvecWeb = `${contexteReglementaire}\n\n${formaterSourcesWeb(sourcesWeb, 4)}`
            }
          } catch {
            /* la recherche web ne bloque jamais l'écart */
          }
        }
      }
    }

    // ── ANTICIPATION (pré-remplissage) ─────────────────────────────
    // L'IA connaît déjà ces questions : si l'INSPECTEUR a déjà validé un libellé
    // pour EXACTEMENT ce même ensemble d'items (surveillances récurrentes), on
    // renvoie ce libellé immédiatement, SANS rappeler le LLM. Réponse instantanée.
    const itemIds = request.itemsNSNV.map(i => i.id)
    const match = libelleMemory.findExactMatch({ itemIds, isSGS })
    if (match && match.regroupementValide !== false) {
      const prefill = estimerCelluleLocale(request.itemsNSNV)
      const cellulePrefill = `${prefill.probabilite}${prefill.gravite}`
      const niveauPrefill = getRiskLevelFromCell(cellulePrefill) as 'critique' | 'eleve' | 'moyen' | 'faible'
      const delaisPrefill = NIVEAUX_DELAI[niveauPrefill]
      return {
        libelle: match.libelleCorrige,
        ref_reglementaire: refs.join(' ; ') || 'RAS 14 / Annexe 14 OACI',
        niveau_risque: niveauPrefill,
        cellule: cellulePrefill,
        probabilite: prefill.probabilite,
        gravite: prefill.gravite,
        justification: `Estimation locale OACI ${cellulePrefill} (${niveauPrefill}) — libellé déjà validé précédemment par l'inspecteur pour ces mêmes questions (anticipation par réutilisation du libellé appris). Ajuste l'indice OACI si besoin.`,
        delai_pac_propose: delaisPrefill.pac,
        delai_regularisation_propose: delaisPrefill.regularisation,
        domaine,
        confiance: 92,
        pourquoi: `Réutilisation du libellé que vous avez déjà validé pour ces mêmes questions (${itemIds.length} item(s)) lors d'une surveillance précédente. Le constat et le regroupement ont été approuvés par l'inspecteur, d'où une confiance maximale.`,
        intervalleConfiance: { min: 86, max: 98 },
        items_lies: itemIds,
        avis: match.avis || 'Libellé déjà validé pour ces questions — suggestion instantanée.',
        nbEcartsRecommande: match.nbEcartsRecommande ?? 1,
        iaDisponible: true,
      }
    }

    // Indiquer à l'IA les groupements déjà REFUSÉS pour cet ensemble (anti-apprentissage)
    const refus = libelleMemory.findRecentRefus({ itemIds, isSGS })
    const refusNote = refus
      ? `ATTENTION : l'inspecteur a déjà REFUSÉ la combinaison de ces questions (${new Date(refus.date).toLocaleDateString('fr-FR')}). Ne propose pas un regroupement similaire.`
      : ''

    // Génération du libellé officiel par IA
    let userMessage: string
    if (isSGS) {
      // Message SGS : maturité PAOE, Annexe 19, sans risque OACI
      // Les items SGS utilisent 'description' (pas 'point_verification')
      // et peuvent avoir 'justification' (observations de l'inspecteur)
      const itemsContext = request.itemsNSNV.map(i => {
        const paoeLabel = i.paoeLevel === 'absent' ? 'Absent (—)'
          : i.paoeLevel === 'present' ? 'Présent (P)'
          : i.paoeLevel === 'approprie' ? 'Approprié (A)'
          : 'Non conforme'
        const desc = i.description || i.point_verification || ''
        const observation = i.justification || i.observation || ''
        const obsPart = observation ? `\n  → Observation inspecteur : ${observation}` : ''
        return `- [${paoeLabel}] ${desc}${obsPart}${i.reference_reglementaire ? ` [Réf: ${i.reference_reglementaire}]` : ''}`
      }).join('\n')

      userMessage = `Tu es l'assistant IA d'un inspecteur ANACIM. À partir des éléments SGS non conformes sélectionnés, tu dois :
1) JOUER UN RÔLE DE WATCH-DOG : dire lesquels peuvent être COMBINÉS en un seul écart et lesquels doivent être SÉPARÉS.
   - Combiner les éléments de MÊME domaine + MÊME référence réglementaire (et gravité comparable) en un seul écart.
   - Séparer les éléments de domaines ou références DIFFÉRENTES, ou de nature distincte.
2) Rédiger le libellé officiel selon le modèle PAOE (Annexe 19 OACI) avec des phrases COURTES.
   - Si plusieurs éléments sont combinés, structure en PUCEs numérotées (« 1. », « 2. », « 3. »), UN point par élément, chaque puce simple et autonome.
   - Éviter les phrases longues : l'exploitant doit comprendre sans effort.

Aérodrome : ${aerodrome?.code_oaci ?? ''} — ${aerodrome?.nom ?? ''}
Éléments SGS non conformes constatés (avec niveau PAOE) :
${itemsContext}

${contexteAvecWeb}

${refusNote}

${(() => {
  const exemples = libelleMemory.getExemples(3, { isSGS: true, references: refs });
  if (exemples.length === 0) return '';
  const lignes = exemples.map(e => {
    const partie = `- ${e.libelleCorrige}`;
    if (e.regroupementValide === false) return partie + ` (groupement REFUSÉ par l'inspecteur — ne pas reproduire cette combinaison)`;
    const note = e.avis ? ` (groupement validé : ${e.avis.slice(0, 80)})` : '';
    return partie + note;
  });
  return 'EXEMPLES DE LIBELLÉS CORRIGÉS PAR L\'INSPECTEUR (constats déjà validés ; respecte les groupements validés et évite ceux refusés) :\n' +
    lignes.join('\n') + '\n';
})()}

Règles de rédaction :
- Décris l'ÉTAT CONSTATÉ (ce qui manque ou est insuffisant), pas seulement la question. Utilise les observations de l'inspecteur comme base du constat.
- NE COMMENCE PAS le libellé par la référence réglementaire (elle est enregistrée séparément).
- Ne mentionne AUCUNE matrice de risque OACI (probabilité × gravité), ni cellule, ni risque chiffré.

Retourne UNIQUEMENT un JSON (pas de texte avant ou après) :
{
  "libelle": "[constat SGS, en puces numérotées s'il y a plusieurs éléments combinés]",
  "avis": "[avis watch-dog en 1-2 phrases : quels éléments combinés ou séparés et pourquoi]",
  "nb_ecarts": [nombre d'écarts recommandés, ex: 1 si tout combinable, sinon 2 ou 3],
  "pourquoi": "[2-3 phrases : EXPLIQUE le raisonnement — pourquoi ce libellé, pourquoi ce regroupement ou séparation, sur la base du niveau PAOE et de la référence réglementaire. Explicite, pédagogique, en français]",
  "confiance_min": [numéro entier 0-100, borne basse de votre certitude sur la suggestion],
  "confiance_max": [numéro entier 0-100, borne haute de votre certitude, ≥ confiance_min]
}${request.instruction ? `\n\nINSTRUCTION SPÉCIALE DE L'INSPECTEUR :\n${request.instruction}\nRespecte cette instruction pour la rédaction du libellé et/ou le regroupement.` : ''}`
    } else {
      const itemsContext = request.itemsNSNV.map(i => {
        const desc = i.point_verification || i.description || ''
        const obs = i.observation || i.justification || ''
        return `- Question : ${desc}${obs ? `\n  Observation inspecteur : ${obs}` : ''}${i.reference_reglementaire ? `\n  Référence : ${i.reference_reglementaire}` : ''}`
      }).join('\n\n')

      userMessage = `Tu dois évaluer un écart de surveillance aéroportuaire.

CONTEXTE :
Aérodrome : ${aerodrome?.code_oaci ?? ''} — ${aerodrome?.nom ?? ''}
Domaine : ${domaine}

ITEMS À ÉVALUER (question + observation inspecteur) :
${itemsContext}

${contexteAvecWeb}

${refusNote}

${(() => {
  const corrections = getRecentCorrections(5);
  if (corrections.length === 0) return '';
  const exemples = corrections.map(c =>
    `- ${c.itemsNS} NS, ${c.itemsNV} NV, score ${c.scoreGlobal} → suggéré ${c.suggestionCellule}, corrigé ${c.correctionCellule}`
  ).join('\n');
  return `EXEMPLES DE CORRECTIONS PRÉCÉDENTES :\n${exemples}`;
})()}

${(() => {
  const exemplesLib = libelleMemory.getExemples(3, { isSGS: false, references: refs });
  if (exemplesLib.length === 0) return '';
  const lignes = exemplesLib.map(e => {
    const partie = `- ${e.libelleCorrige}`;
    if (e.regroupementValide === false) return partie + ` (groupement REFUSÉ par l'inspecteur — ne pas reproduire cette combinaison)`;
    const note = e.avis ? ` (groupement validé : ${e.avis.slice(0, 80)})` : '';
    return partie + note;
  });
  return 'EXEMPLES DE LIBELLÉS CORRIGÉS PAR L\'INSPECTEUR (constats déjà validés ; respecte les groupements validés et évite ceux refusés) :\n' +
    lignes.join('\n') + '\n';
})()}

INSTRUCTIONS :
1. JOUER UN RÔLE DE WATCH-DOG : déterminer quels items peuvent être COMBINÉS en un seul écart et lesquels doivent être SÉPARÉS.
   - Combiner les items de MÊME domaine + MÊME référence réglementaire (et gravité comparable) en un seul écart.
   - Séparer les items de domaines ou références DIFFÉRENTES, ou de nature distincte.
2. Lis chaque question ET chaque observation de l'inspecteur pour comprendre la non-conformité réelle.
3. Si des observations sont renseignées, ce sont elles qui décrivent la situation constatée — utilises-les pour rédiger le libellé ET évaluer la gravité.
4. Si une observation est vide, rédige à partir de la question en décrivant ce qui manque ou est insuffisant.
5. La gravité doit refléter le risque COMBINÉ des items réellement combinés — plusieurs items NS dans un même écart grave le risque.
6. Rédiger le libellé avec des phrases COURTES. Si plusieurs items sont combinés, structure en PUCEs numérotées (« 1. », « 2. », « 3. »), UN point par item, chaque puce simple et autonome. Éviter les phrases longues : l'exploitant doit comprendre sans effort.
7. NE COMMENCE PAS le libellé par la référence réglementaire : rédige uniquement le constat factuel (la référence est enregistrée séparément).

MATRICE OACI — évalue la probabilité ET la gravité basées sur ce qui est décrit :
PROBABILITÉ (fréquence d'occurrence) :
  5 = Fréquent    (survient souvent, problème systémique)
  4 = Probable    (survient plusieurs fois)
  3 = Occasionnel (survient parfois)
  2 = Rare        (peu probable mais possible)
  1 = Improbable  (très peu probable)

GRAVITÉ (conséquence potentielle sur la sécurité) :
  A = Catastrophique (perte de vie ou d'aéronef)
  B = Grave         (blessures graves, dommages importants)
  C = Majeure       (incident sérieux, blessures légères)
  D = Mineure       (procédures d'urgence requises)
  E = Négligeable   (nuisance sans impact opérationnel)

Retourne UNIQUEMENT un JSON (pas de texte avant ou après) :
{
  "libelle": "[description factuelle du constat, sans référence en tête, en puces numérotées si plusieurs items combinés]",
  "probabilite": 3,
  "gravite": "C",
  "avis": "[avis watch-dog en 1-2 phrases : quels items combinés ou séparés et pourquoi]",
  "nb_ecarts": [nombre d'écarts recommandés, ex: 1 si tout combinable, sinon 2 ou 3],
  "pourquoi": "[2-3 phrases : EXPLIQUE le raisonnement — pourquoi ce libellé, pourquoi ce niveau de gravité/probabilité, pourquoi ce regroupement ou séparation. Explicite, pédagogique, en français]",
  "confiance_min": [numéro entier 0-100, borne basse de votre certitude sur la suggestion],
  "confiance_max": [numéro entier 0-100, borne haute de votre certitude, ≥ confiance_min]
}

Le libellé doit être factuel, au présent, phrases courtes, style réglementaire ANACIM, et ne pas commencer par la référence.
Si plusieurs items sont combinés, une puce par item. Si des items sont séparés, précise-le dans l'avis.${request.instruction ? `\n\nINSTRUCTION SPÉCIALE DE L'INSPECTEUR :\n${request.instruction}\nRespecte cette instruction pour la rédaction du libellé et/ou le regroupement.` : ''}`
    }

    const aiResult = await aiClient.call({
      systemPrompt: isSGS ? SGS_ECART_SYSTEM_PROMPT : ECART_SYSTEM_PROMPT,
      userMessage,
      temperature: 0.2,
      maxTokens: 700,
    })

    // Parser la réponse LLM
    let libelle = ''
    let probabilite: NiveauProbabiliteOACI = 3
    let gravite: NiveauGraviteOACI = 'C'
    let confiance = 60
    let avis = ''
    let pourquois = ''
    let intervalleConfiance: { min: number; max: number } | undefined
    let nbEcarts = request.itemsNSNV.length

    if (aiResult.ok && aiResult.content.trim()) {
      const raw = aiResult.content.trim()
      // Tenter d'extraire le JSON
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          libelle = parsed.libelle || ''
          // Garde défensive : le JSON.parse ne vérifie que la syntaxe, pas la forme.
          // Certains modèles peuvent renvoyer `libelle` en tableau ou objet (cas multi-items).
          // On normalise toujours vers une chaîne pour ne pas casser l'UI (rendu de type
          // object/array). Aucun changement de comportement pour le cas string existant.
          if (Array.isArray(libelle)) libelle = libelle.join(' ')
          else if (typeof libelle !== 'string') libelle = String(libelle)
          probabilite = Math.min(5, Math.max(1, Number(parsed.probabilite) || 3)) as NiveauProbabiliteOACI
          const g = String(parsed.gravite || 'C').toUpperCase()
          gravite = (['A','B','C','D','E'].includes(g) ? g : 'C') as NiveauGraviteOACI
          avis = String(parsed.avis || '').trim()
          pourquois = String(parsed.pourquoi || '')
          const n = Number(parsed.nb_ecarts)
          if (Number.isFinite(n) && n > 0 && n <= request.itemsNSNV.length) nbEcarts = n
          // Intervalle de confiance fourni par le modèle (%). On le borne à [0;100].
          const cMin = Number(parsed.confiance_min)
          const cMax = Number(parsed.confiance_max)
          if (Number.isFinite(cMin) && Number.isFinite(cMax)) {
            intervalleConfiance = {
              min: Math.round(Math.min(100, Math.max(0, Math.min(cMin, cMax)))),
              max: Math.round(Math.min(100, Math.max(0, Math.max(cMin, cMax)))),
            }
            confiance = intervalleConfiance.max
          } else {
            confiance = 85
          }
          if (!intervalleConfiance) {
            intervalleConfiance = { min: Math.max(0, confiance - 15), max: Math.min(100, confiance + 5) }
          }
        } catch {
          libelle = raw.slice(0, 500)
          confiance = 55
        }
      } else {
        libelle = raw.slice(0, 500)
        confiance = 50
      }
    }

    if (!libelle) {
      libelle = this.buildFallbackLibelle(request.itemsNSNV, 'moyen')
    }

    // Garde-fou local : si le modèle renvoie la cellule neutre par défaut (3C) —
    // sans raisonner sur la matrice OACI — on la remplace par une estimation
    // locale déterministe issue des items sélectionnés (observations + nb NS).
    if (probabilite === 3 && gravite === 'C') {
      try {
        const local = estimerCelluleLocale(request.itemsNSNV)
        probabilite = local.probabilite
        gravite = local.gravite
        if (confiance < 85) confiance = Math.max(confiance, 70)
      } catch { /* conserver 3C si estimation locale impossible */ }
    }

    const cellule = `${probabilite}${gravite}`
    const niveau_risque = getRiskLevelFromCell(cellule) as 'critique' | 'eleve' | 'moyen' | 'faible'
    const delais = NIVEAUX_DELAI[niveau_risque]

    // L'IA est considérée "disponible" si elle a réellement renvoyé un contenu
    // exploitable. Sinon (échec LLM / contenu vide) on est tombé sur le fallback
    // local (buildFallbackLibelle) : le composant bascule alors sur la rédaction
    // manuelle plutôt que de présenter une fausse « suggestion IA ».
    const iaDisponible = Boolean(aiResult.ok && aiResult.content && aiResult.content.trim().length > 0)

    // Intervalle de confiance par défaut si le modèle ne l'a pas fourni
    const confianceFinale = Math.max(0, Math.min(100, confiance))
    const intervalleFinal = intervalleConfiance ?? {
      min: Math.max(0, confianceFinale - 15),
      max: Math.min(100, confianceFinale + 5),
    }

    // « Pourquoi » explicite : fallback construit à partir de la justification si le modèle
    // n'a pas produit de raisonnement explicite.
    const pourquoiFinal = (pourquois || '').trim()
      ? pourquois.trim()
      : `Ce libellé traduit l'état constaté (non-conformité${request.itemsNSNV.length > 1 ? 's multiples combinées' : ''}) rapporté par l'inspecteur, rattaché à la référence réglementaire ${refs.join(' ; ') || 'applicable'}. L'indice OACI ${cellule} (niveau ${niveau_risque}) découle de la gravité des observations et de leur probabilité d'occurrence.`

    const justification =
      `Indice déterminé par IA à partir de la question checklist et de l'observation inspecteur. ` +
      `Probabilité ${probabilite} (${PROBABILITE_LABELS[probabilite]}), Gravité ${gravite} (${GRAVITE_LABELS[gravite]}). ` +
      `Cellule OACI : ${cellule} → niveau ${niveau_risque}.${avis ? `\nAvis de regroupement IA : ${avis}` : ''}`

    return {
      libelle,
      ref_reglementaire: refs.join(' ; ') || 'RAS 14 / Annexe 14 OACI',
      niveau_risque,
      cellule,
      probabilite,
      gravite,
      justification,
      delai_pac_propose: delais.pac,
      delai_regularisation_propose: delais.regularisation,
      domaine,
      confiance: confianceFinale,
      items_lies: request.itemsNSNV.map(i => i.id),
      avis,
      pourquoi: pourquoiFinal,
      intervalleConfiance: intervalleFinal,
      nbEcartsRecommande: nbEcarts,
      iaDisponible,
    }
  }

  private buildFallbackLibelle(items: GenerateEcartRequest['itemsNSNV'], niveau: string): string {
    const isSGS = items[0]?.domaine === 'SGS'
    // Utiliser 'description' pour SGS, 'point_verification' pour standard
    const desc = items.map(i => i.description || i.point_verification || '')
    const observations = items.map(i => i.justification || i.observation || '').filter(Boolean)

    if (isSGS) {
      const paoeLabel = items[0]?.paoeLevel === 'absent' ? 'absence'
        : items[0]?.paoeLevel === 'present' ? 'insuffisance'
        : 'non-conformité'
      if (observations.length > 0) {
        return `${observations[0]}`
      }
      if (desc.length === 1) return `${paoeLabel} de ${desc[0]}`
      return `${desc.slice(0, 3).join(' ; ')}${desc.length > 3 ? ` et ${desc.length - 3} autre(s)` : ''}`
    }
    if (observations.length > 0) return `Non-conformité constatée : ${observations[0]}`
    if (desc.length === 1) return `Non-conformité constatée : ${desc[0]}`
    if (desc.length <= 3) return `Non-conformités constatées : ${desc.join(' ; ')}`
    return `Non-conformités multiples constatées : ${desc.slice(0, 3).join(' ; ')} et ${desc.length - 3} autre(s)`
  }

  // ============================================================
  // ÉVALUATION PAC — scoring + commentaire IA
  // ============================================================

  async evaluatePAC(request: EvaluatePACRequest, storeData: any): Promise<EvaluatePACResult> {
    const cached = this.evaluationCache.get(request.ecartId)
    if (cached) return cached

    const store = useAppStore.getState()
    const ecart = store.ecarts.find((e: Ecart) => e.id === request.ecartId)

    if (!ecart) {
      return {
        note_globale: 0,
        notes_detail: { pertinence: 0, exhaustivite: 0, precision: 0, specificite: 0, realisme: 0, coherence: 0 },
        decision: 'refuse',
        commentaire: 'Écart introuvable dans le système.',
        ameliorations_suggestions: ['Vérifiez que l\'écart existe'],
        confiance: 0,
      }
    }

    const actions = request.pac.actions ?? []

    // Scores quantitatifs (locaux)
    const notes_detail = {
      pertinence: this.evaluatePertinence(actions, ecart),
      exhaustivite: this.evaluateExhaustivite(actions),
      precision: this.evaluatePrecision(actions),
      specificite: this.evaluateSpecificite(actions),
      realisme: this.evaluateRealisme(actions),
      coherence: this.evaluateCohérence(actions, ecart),
    }

    const note_globale = Math.round(plansActionsUtils.calculerNoteGlobale({
      note_pertinence: notes_detail.pertinence,
      note_exhaustivite: notes_detail.exhaustivite,
      note_precision: notes_detail.precision,
      note_specificite: notes_detail.specificite,
      note_coherence: notes_detail.coherence,
      note_tracabilite: notes_detail.realisme,
    }) * 10) / 10

    const decision: 'accepte' | 'refuse' = note_globale >= NOTES_SEUILS.ACCEPTE ? 'accepte' : 'refuse'

    // Commentaire et suggestions par IA
    const contextPAC = {
      ecart_libelle: ecart.libelle?.substring(0, 200),
      ecart_niveau: ecart.niveau_risque,
      note_globale,
      decision,
      notes_detail,
      nb_actions: actions.length,
      actions_resume: actions.slice(0, 3).map((a: SoumissionPAC['actions'][number]) => ({
        description: a.description?.substring(0, 100),
        responsable: a.responsable,
        date_prevue: a.date_prevue,
        livrables: a.livrables?.length ?? 0,
      })),
    }

    type PACFeedbackJSON = { commentaire: string; suggestions: string[] }
    const fallback: PACFeedbackJSON = {
      commentaire: decision === 'accepte'
        ? `PAC ${decision === 'accepte' ? 'accepté' : 'refusé'} avec une note de ${note_globale}/100.`
        : `PAC refusé (${note_globale}/100). Améliorations requises.`,
      suggestions: this.buildFallbackSuggestions(notes_detail),
    }

    const aiResult = await aiClient.callJSON<PACFeedbackJSON>(
      {
        systemPrompt: PAC_SYSTEM_PROMPT,
        userMessage: `Évalue ce PAC et retourne JSON {"commentaire": "...", "suggestions": ["...", "..."]}:
${JSON.stringify(contextPAC, null, 2)}`,
        temperature: 0.3,
        maxTokens: 512,
        responseFormat: 'json_object',
      },
      fallback
    )

    const result: EvaluatePACResult = {
      note_globale,
      notes_detail,
      decision,
      commentaire: aiResult.commentaire,
      ameliorations_suggestions: aiResult.suggestions ?? [],
      confiance: decision === 'accepte' ? note_globale : 100 - note_globale,
    }

    this.evaluationCache.set(request.ecartId, result)
    return result
  }

  // ============================================================
  // SUGGESTION D'ACTIONS CORRECTIVES — par IA
  // ============================================================

  async suggestActions(request: SuggestActionsRequest, _storeData?: unknown): Promise<ActionSuggestion[]> {
    const { ecart, profil } = request

    type ActionJSON = { description: string; responsable: string; delai_jours: number; priorite: 'haute' | 'moyenne' | 'basse'; impact: number; probabilite: number }
    type ActionsJSON = { actions: ActionJSON[] }
    const fallback: ActionsJSON = {
      actions: [
        { description: `Corriger : ${ecart.libelle?.substring(0, 100)}`, responsable: 'Responsable à désigner', delai_jours: NIVEAUX_DELAI[ecart.niveau_risque]?.pac ?? 15, priorite: 'haute', impact: 80, probabilite: 70 },
        { description: 'Mettre en place une vérification périodique pour éviter la récurrence', responsable: 'Responsable qualité', delai_jours: 30, priorite: 'moyenne', impact: 60, probabilite: 65 },
      ],
    }

    const contextEcart = {
      libelle: ecart.libelle?.substring(0, 200),
      domaine: ecart.domaine,
      niveau_risque: ecart.niveau_risque,
      ref_reglementaire: ecart.ref_reglementaire,
      profil_score_global: profil?.score_global,
      profil_c1_sgs: profil?.c1,
    }

    const aiResult = await aiClient.callJSON<ActionsJSON>(
      {
        systemPrompt: ECART_SYSTEM_PROMPT,
        userMessage: `Propose 3-4 actions correctives concrètes pour cet écart. Retourne JSON:
{"actions": [{"description": "...", "responsable": "...", "delai_jours": 30, "priorite": "haute|moyenne|basse", "impact": 85, "probabilite": 80}]}
Écart: ${JSON.stringify(contextEcart, null, 2)}`,
        temperature: 0.4,
        maxTokens: 600,
        responseFormat: 'json_object',
      },
      fallback
    )

    return (aiResult.actions ?? fallback.actions).map((a: ActionJSON, idx: number) => ({
      id: `action_${Date.now()}_${idx}`,
      description: a.description,
      responsable: a.responsable,
      delaiPropose: a.delai_jours ?? 15,
      priorite: a.priorite ?? 'moyenne',
      impactEstime: a.impact ?? 70,
      probabiliteSucces: a.probabilite ?? 65,
    }))
  }

  // ============================================================
  // VÉRIFICATION DES PREUVES
  // ============================================================

  async verifyPreuves(request: VerifyPreuvesRequest, _storeData: unknown): Promise<VerifyPreuvesResult> {
    const cached = this.verificationCache.get(request.ecartId)
    if (cached) return cached

    const store = useAppStore.getState()
    const ecart = store.ecarts.find((e: Ecart) => e.id === request.ecartId)

    if (!ecart) {
      return { conforme: false, niveauConfiance: 0, elementsManquants: ['Écart non trouvé'], commentaire: 'Écart introuvable', preuvesSuffisantes: false }
    }

    const preuves = request.preuves.fichiers ?? []
    const commentaire = request.preuves.commentaire ?? ''
    const elementsManquants: string[] = []

    if (preuves.length === 0) {
      elementsManquants.push('Aucun fichier justificatif joint')
    } else {
      const hasPDF = preuves.some((f: SoumissionPreuves['fichiers'][number]) => f.nom?.endsWith('.pdf'))
      const hasImage = preuves.some((f: SoumissionPreuves['fichiers'][number]) => f.nom?.match(/\.(jpg|jpeg|png)$/i))
      const hasDoc = preuves.some((f: SoumissionPreuves['fichiers'][number]) => f.nom?.match(/\.(doc|docx|xls|xlsx)$/i))
      if (!hasPDF && !hasImage && !hasDoc) {
        elementsManquants.push('Format de fichier non reconnu (PDF, image ou document attendu)')
      }
    }

    if (!commentaire || commentaire.length < 10) {
      elementsManquants.push('Commentaire explicatif insuffisant')
    }

    let niveauConfiance = 50
    if (preuves.length >= 2 && commentaire.length >= 20) niveauConfiance = 85
    else if (preuves.length >= 1 && commentaire.length >= 10) niveauConfiance = 70
    else if (preuves.length >= 1) niveauConfiance = 55

    if (ecart.niveau_risque === 'critique' && preuves.length < 3) {
      niveauConfiance -= 20
      elementsManquants.push('Écart critique : minimum 3 pièces justificatives requises')
    }

    const conforme = elementsManquants.length === 0
    const preuvesSuffisantes = niveauConfiance >= 70

    const result: VerifyPreuvesResult = {
      conforme,
      niveauConfiance: Math.max(0, Math.min(100, niveauConfiance)),
      elementsManquants,
      commentaire: conforme ? 'Preuves complètes et conformes aux exigences.' : `Preuves insuffisantes : ${elementsManquants.join(' ; ')}`,
      preuvesSuffisantes,
    }

    this.verificationCache.set(request.ecartId, result)
    return result
  }

  // ============================================================
  // PROJET DE COURRIER DE RELANCE
  // ============================================================

  async genererCourrierRelance(ecartId: string): Promise<{ titre: string; contenu: string; delai: string }> {
    const cached = this.relanceCache.get(ecartId)
    if (cached) return cached

    const store = useAppStore.getState()
    const ecart = store.ecarts.find((e: Ecart) => e.id === ecartId)
    if (!ecart) {
      const fallback: { titre: string; contenu: string; delai: string } = {
        titre: 'Courrier de relance',
        contenu: 'Écart non trouvé.',
        delai: new Date(Date.now() + 15 * 86400000).toISOString(),
      }
      this.relanceCache.set(ecartId, fallback)
      return fallback
    }

    const aerodrome = store.aerodromes.find(a => a.id === ecart.aerodrome_id) ?? null
    const dateFormatted = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    const delai = ecart.delai_pac ?? new Date(Date.now() + 15 * 86400000).toISOString()
    const delaiFormatted = new Date(delai).toLocaleDateString('fr-FR')

    const contexteReg = construireContexteReglementaire({
      requete: `courrier relance écart ${ecart.reference} ${ecart.libelle}`,
      domaines: ecart.domaine ? [ecart.domaine] : [],
      type_entite: aerodrome?.type_entite,
      maxChars: 2000,
    })

    const aiResult = await aiClient.call({
      systemPrompt: `Tu es un inspecteur référent de l'ANACIM. Rédige le CORPS d'un courrier de relance officiel adressé à l'exploitant d'un aérodrome concernant un écart de conformité non régularisé.

Format : lettre administrative française. Commence par "Objet :" puis le corps structuré en courts paragraphes (constat du retard, référence réglementaire, demande de régularisation avec échéance ferme, mise en garde proportionnée si l'écart est critique), et une formule de politesse signée "L'Inspecteur Référent".
N'inclus pas d'en-tête ni de logo. Appuie les mentions réglementaires sur les références fournies.`,
      userMessage: `ÉCART À RELANCER :
Référence : ${ecart.reference}
Libellé : ${ecart.libelle}
Niveau de risque : ${ecart.niveau_risque}
Référence réglementaire : ${ecart.ref_reglementaire}
Aérodrome : ${aerodrome ? `${aerodrome.nom} (${aerodrome.code_oaci})` : ecart.aerodrome_id}
Délai PAC : ${delaiFormatted}
Date de création de l'écart : ${new Date(ecart.created_at).toLocaleDateString('fr-FR')}

${contexteReg}

Rédige le courrier de relance.`,
      temperature: 0.3,
      maxTokens: 900,
    })

    const contenuFallback = `Objet : Relance — Écart de conformité ${ecart.reference}

Monsieur le Directeur d'Exploitation,

Nos services ont constaté que l'écart de conformité référencé ${ecart.reference} (${ecart.libelle}), signalé le ${new Date(ecart.created_at).toLocaleDateString('fr-FR')} au titre de la référence ${ecart.ref_reglementaire}, n'a pas encore fait l'objet de la transmission de votre plan d'actions correctives dans le délai imparti.

Nous vous prions de bien vouloir nous transmettre, sous 15 jours, le plan d'actions correctives afin de clore ce dossier. À défaut, l'ANACIM se réserve le droit d'engager les mesures prévues par la réglementation en vigueur.

Fait à Dakar, le ${dateFormatted}.

Veuillez agréer, Monsieur le Directeur d'Exploitation, l'expression de nos salutations distinguées.

L'Inspecteur Référent`

    const contenu = aiResult.ok && aiResult.content ? aiResult.content : contenuFallback

    const result = { titre: `Courrier de relance — Écart ${ecart.reference}`, contenu, delai }
    this.relanceCache.set(ecartId, result)
    return result
  }

  // ============================================================
  // ANALYSE RISQUE CASCADE
  // ============================================================

  async getCascadeRisk(aerodromeId: string) {
    const store = useAppStore.getState()
    const ecarts = store.ecarts.filter((e: Ecart) => e.aerodrome_id === aerodromeId)
    const hawkes = computeHawkesContagion(
      ecarts.map((e: Ecart) => ({ createdAt: e.created_at, niveau: e.niveau_risque }))
    )
    let niveau: 'critique' | 'eleve' | 'moyen' | 'faible' = 'faible'
    if (hawkes.riskNext30Days >= 70) niveau = 'critique'
    else if (hawkes.riskNext30Days >= 50) niveau = 'eleve'
    else if (hawkes.riskNext30Days >= 30) niveau = 'moyen'
    return { riskNext30Days: hawkes.riskNext30Days, currentIntensity: hawkes.currentIntensity, expectedNewEcarts: hawkes.expectedNewEcarts, niveau }
  }

  async prioritizeEcarts(ecarts: Ecart[]): Promise<Ecart[]> {
    const store = useAppStore.getState()
    const avecScore = await Promise.all(ecarts.map(async ecart => {
      let score = 0
      const niveauScore: Record<string, number> = { critique: 40, eleve: 25, moyen: 15, faible: 5 }
      score += niveauScore[ecart.niveau_risque] ?? 5
      const { jours, depasse } = plansActionsUtils.getDelaiRestant(ecart)
      if (depasse) score += 30
      else if (jours < 7) score += 20
      else if (jours < 15) score += 10
      const profil = store.profilsRisque[ecart.aerodrome_id]
      if (profil) {
        if (profil.score_global < 30) score += 25
        else if (profil.score_global < 50) score += 15
        else if (profil.tendance === 'baisse') score += 10
        if (profil.c4 < 40) score += 15
      }
      const cascadeRisk = await this.getCascadeRisk(ecart.aerodrome_id)
      if (cascadeRisk.riskNext30Days > 50) score += 20
      return { ecart, score }
    }))
    return avecScore.sort((a, b) => b.score - a.score).map(x => x.ecart)
  }

  getPACStatistics(aerodromeId?: string) {
    const store = useAppStore.getState()
    return plansActionsUtils.getStatistiquesPAC(store.ecarts, aerodromeId)
  }

  // ============================================================
  // SCORES QUANTITATIFS (inchangés)
  // ============================================================

  private evaluatePertinence(actions: PACAction[], ecart: Ecart): number {
    if (actions.length === 0) return 0
    let score = 0
    for (const a of actions) {
      if (a.description?.toLowerCase().includes(ecart.libelle?.toLowerCase() ?? '')) score += 20
      else if (a.description) score += 10
    }
    return Math.min(100, Math.max(0, score))
  }

  private evaluateExhaustivite(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    let score = 0
    for (const a of actions) {
      if (a.description) score += 15
      if (a.responsable) score += 15
      if (a.date_prevue) score += 10
      if (a.livrables?.length > 0) score += 10
    }
    return Math.min(100, score)
  }

  private evaluatePrecision(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    let score = 0
    for (const a of actions) {
      if (a.description?.length > 50) score += 15
      if (a.responsable?.includes(' ')) score += 15
      if (a.livrables?.some((l: string) => l.includes('.'))) score += 20
    }
    return Math.min(100, score)
  }

  private evaluateSpecificite(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    const vagueTerms = ['à faire', 'à voir', 'peut-être', 'si possible', 'envisager', 'essayer']
    let score = 0
    for (const a of actions) {
      if (a.description && !vagueTerms.some(t => a.description.toLowerCase().includes(t))) score += 20
      if (a.responsable && a.responsable !== 'À définir') score += 15
      if (a.date_prevue) score += 15
    }
    return Math.min(100, score)
  }

  private evaluateRealisme(actions: PACAction[]): number {
    if (actions.length === 0) return 0
    let score = 0
    const now = new Date()
    for (const a of actions) {
      if (a.date_prevue) {
        const diff = (new Date(a.date_prevue).getTime() - now.getTime()) / 86400000
        if (diff >= 7 && diff <= 90) score += 20
        else if (diff > 0) score += 10
      } else score += 5
    }
    return Math.min(100, score)
  }

  private evaluateCohérence(actions: PACAction[], ecart: Ecart): number {
    if (actions.length === 0) return 0
    let score = 50
    if (ecart.niveau_risque === 'critique' && actions.length >= 2) score += 20
    else if (ecart.niveau_risque === 'critique' && actions.length === 1) score -= 20
    const responsables = actions.map((a: PACAction) => a.responsable).filter(Boolean)
    if (new Set(responsables).size === responsables.length && responsables.length > 1) score += 15
    return Math.min(100, Math.max(0, score))
  }

  private buildFallbackSuggestions(notes: Record<string, number>): string[] {
    const s: string[] = []
    if (notes.pertinence < 70) s.push('Renforcez le lien explicite entre les actions et l\'écart constaté')
    if (notes.exhaustivite < 70) s.push('Complétez les informations : description, responsable, date prévue et livrables pour chaque action')
    if (notes.precision < 70) s.push('Détaillez les livrables attendus (documents, rapports, preuves)')
    if (notes.specificite < 70) s.push('Remplacez les formulations vagues par des engagements concrets et mesurables')
    if (notes.realisme < 70) s.push('Ajustez les délais : ils doivent être compris entre 7 et 90 jours pour être réalistes')
    return s
  }

  clearCache(): void {
    this.evaluationCache.clear()
    this.verificationCache.clear()
    this.relanceCache.clear()
  }

  isReady(): boolean { return this.initialized }

  /**
   * Enregistre un libellé d'écart réajusté par l'inspecteur comme exemple
   * de référence (boucle d'apprentissage textuelle). Ne fait rien si le
   * libellé final est identique à la suggestion ou si aucun libellé.
   */
  enregistrerCorrectionLibelle(input: {
    isSGS: boolean
    references: string[]
    itemIds: string[]
    libellePropose?: string
    libelleCorrige: string
    contexte?: string
    avis?: string
    nbEcartsRecommande?: number
  }): void {
    libelleMemory.enregistrerCorrection({
      isSGS: input.isSGS,
      references: input.references || [],
      itemIds: input.itemIds || [],
      libellePropose: input.libellePropose || '',
      libelleCorrige: input.libelleCorrige,
      contexte: input.contexte || '',
      avis: input.avis,
      nbEcartsRecommande: input.nbEcartsRecommande,
      regroupementValide: true,
    })
  }

  /**
   * Mémorise un refus du regroupement proposé par l'IA afin d'éviter de
   * reproduire la même décision de combinaison/séparation dans le futur.
   */
  enregistrerRefusGroupement(input: {
    isSGS: boolean
    references: string[]
    itemIds: string[]
    libelleCorrige: string
    contexte?: string
  }): void {
    libelleMemory.enregistrerCorrection({
      isSGS: input.isSGS,
      references: input.references || [],
      itemIds: input.itemIds || [],
      libellePropose: input.libelleCorrige,
      libelleCorrige: input.libelleCorrige,
      contexte: input.contexte || '',
      regroupementValide: false,
    })
  }
}

export const ecartAgent = new EcartAgent()
