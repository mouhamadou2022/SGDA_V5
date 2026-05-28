// lib/ia/agents/kitDocAgent.ts
// Agent IA – Génération de checklist pré-remplie depuis le Kit Inspecteur
// ✅ R1 : 0 style inline
// ✅ R2 : 0 dangerouslySetInnerHTML
// ✅ R3 : données via AppStore uniquement
// ✅ R8 : terme "Surveillance" (pas "inspection")
// ✅ R11 : CDC V8 en premier

'use client'

import { useAppStore, KitDocument, ProfilRisque, Aerodrome } from '@/lib/store'
import { checklistMemory } from '@/lib/checklistMemory'
import { aiClient } from '@/lib/ia/aiClient'
import { KITDOC_SYSTEM_PROMPT } from '@/lib/ia/prompts'
import { expandDomaines, DOMAINES_SURVEILLANCE } from '@/lib/domaines'

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
  portee: string[]             // ex: ["PHY","OLS","SLI"] ou ["AGA"]
  profil_risque?: ProfilRisque
  analyses_docs?: KitDocAnalysis[]  // Analyses de documents à intégrer
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
// BASE DE CONNAISSANCE RÉGLEMENTAIRE
// Format items : [numero, ref_reglementaire, question, directive (avec ÉVALUATION OBJECTIVE)]
// ============================================================

interface KBItem {
  numero: string
  ref: string
  question: string
  directive: string
  type_entite_cible: TypeEntite | 'tous'
  inopine?: boolean  // visible en inopinée (true = prioritaire)
  maintien?: boolean // spécifique suivi maintien
}

interface KBSousSousDomaine {
  nom: string
  items: KBItem[]
}

interface KBSousDomaine {
  nom: string
  type_entite_cible: TypeEntite | 'tous'
  sous_sous_domaines: KBSousSousDomaine[]
}

interface KBDomaine {
  code: string
  label: string
  description: string
  sous_domaines: KBSousDomaine[]
}

const KNOWLEDGE_BASE: KBDomaine[] = [
  // ─────────────────────── SGS ───────────────────────
  {
    code: 'SGS',
    label: 'Système de Gestion de la Sécurité',
    description: 'Manuel SGS, politiques, documentation, audits internes',
    sous_domaines: [
      {
        nom: 'Documentation SGS',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Manuel et politique',
            items: [
              {
                numero: 'SGS.01',
                ref: 'RAS 14 I §1.5.1',
                question: 'Le gestionnaire dispose-t-il d\'un Manuel SGS formalisé, approuvé et à jour ?',
                directive: `1. Demander et examiner le Manuel SGS (version datée, signée par le DG)
2. Vérifier la date de dernière révision (≤ 12 mois ou après tout changement majeur)
3. Contrôler la structure : politique, organisation, identification des dangers, évaluation des risques, assurance, promotion

📌 ÉVALUATION OBJECTIVE :
- SA : Manuel présent, signé par le DG, révisé dans les 12 derniers mois, structure conforme à RAS 14 I §1.5.1
- NS : Manuel absent, non signé, non révisé depuis > 12 mois ou structure incomplète
- NA : Non applicable (entité exemptée par arrêté — rare)
- NV : Document non présenté lors de la visite

⚠️ Seuil réglementaire : RAS 14 I §1.5.1 (Norme) : «L\'exploitant d\'aérodrome doit établir un système de gestion de la sécurité.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'SGS.02',
                ref: 'RAS 14 I §1.5.2',
                question: 'La politique de sécurité est-elle formalisée, affichée et comprise du personnel ?',
                directive: `1. Vérifier l'existence d'une politique de sécurité signée par le plus haut responsable
2. Confirmer l'affichage en zones accessibles (hall, salle opérations, bureaux)
3. Interroger 2 à 3 agents de maîtrise sur les objectifs de la politique

📌 ÉVALUATION OBJECTIVE :
- SA : Politique datée, signée, affichée et connue du personnel questionné
- NS : Politique absente, non affichée, ou personnels interrogés l'ignorent
- NA : Sans objet
- NV : Vérification impossible (personnel absent, locaux fermés)

⚠️ Seuil réglementaire : RAS 14 I §1.5.2 (Norme) : «La politique de sécurité doit être signée par l'administrateur responsable.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'SGS.03',
                ref: 'Doc 9859 §3.2.1',
                question: 'Les objectifs de sécurité sont-ils mesurables, documentés et régulièrement suivis ?',
                directive: `1. Demander le tableau de bord sécurité ou les KPIs de sécurité de l'année
2. Vérifier qu'il existe des indicateurs quantifiables (ex: taux de signalement, délai de levée d'écarts)
3. Examiner les PV de revue de direction (fréquence ≥ annuelle)

📌 ÉVALUATION OBJECTIVE :
- SA : KPIs définis, actualisés (≤ 3 mois), PV de revue disponible ≤ 12 mois
- NS : Objectifs non définis ou non suivis ; aucun PV de revue disponible
- NA : Entité nouvellement certifiée < 6 mois (objectifs en cours de définition)
- NV : Documentation non présentée

⚠️ Seuil réglementaire : Doc 9859 §3.2.1 : «Les objectifs de sécurité doivent être mesurables.»`,
                type_entite_cible: 'tous',
              },
            ],
          },
        ],
      },
      {
        nom: 'Gestion des risques',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Identification et évaluation',
            items: [
              {
                numero: 'SGS.04',
                ref: 'Doc 9859 §4.1',
                question: 'Le processus d\'identification des dangers est-il documenté et appliqué ?',
                directive: `1. Vérifier l'existence d'un registre des dangers (document dédié ou module SGS)
2. Contrôler la fréquence de mise à jour (dernière entrée ≤ 3 mois)
3. Confirmer les sources d'identification : inspections, rapports internes, REX, signalements

📌 ÉVALUATION OBJECTIVE :
- SA : Registre existant, mis à jour récemment (≤ 3 mois), sources multiples documentées
- NS : Registre absent, non mis à jour ou sources uniques non documentées
- NA : Sans objet
- NV : Registre non présenté

⚠️ Seuil réglementaire : Doc 9859 §4.1 : «Un processus d'identification des dangers doit être établi.»`,
                type_entite_cible: 'tous',
              },
              {
                numero: 'SGS.05',
                ref: 'Doc 9859 §4.2',
                question: 'Les risques identifiés font-ils l\'objet d\'une évaluation et de mesures de mitigation documentées ?',
                directive: `1. Sélectionner 3 dangers du registre et vérifier leur évaluation (probabilité × gravité)
2. Confirmer l'existence d'une matrice de risque et de mesures de mitigation associées
3. Vérifier le suivi de l'efficacité des mesures

📌 ÉVALUATION OBJECTIVE :
- SA : Matrice de risque utilisée, mesures de mitigation documentées, efficacité vérifiée
- NS : Évaluation absente ou incomplète pour ≥ 2 dangers examinés
- NA : Sans objet
- NV : Documentation non disponible pendant la visite

⚠️ Seuil réglementaire : Doc 9859 §4.2 : «L'évaluation des risques doit résulter en des mesures d'atténuation.»`,
                type_entite_cible: 'tous',
              },
            ],
          },
          {
            nom: 'Audits et amélioration continue',
            items: [
              {
                numero: 'SGS.06',
                ref: 'RAS 14 I §1.5.4',
                question: 'Des audits internes de sécurité sont-ils réalisés selon la fréquence prévue ?',
                directive: `1. Demander le programme d'audits internes de l'année en cours
2. Vérifier que les audits planifiés ont eu lieu (PV signés)
3. Contrôler le suivi des recommandations issues des audits

📌 ÉVALUATION OBJECTIVE :
- SA : Programme d'audits existant, audits réalisés ≥ 1/an, recommandations suivies
- NS : Aucun audit réalisé ou recommandations non suivies
- NA : Entité certifiée < 6 mois (premier cycle en cours)
- NV : PV non présentés

⚠️ Seuil réglementaire : RAS 14 I §1.5.4 (Norme) : «Des audits internes réguliers doivent être conduits.»`,
                type_entite_cible: 'tous',
                maintien: true,
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── SLI ───────────────────────
  {
    code: 'SLI',
    label: 'Sauvetage et Lutte contre l\'Incendie',
    description: 'Service SSLIA, véhicules, équipements, temps d\'intervention',
    sous_domaines: [
      {
        nom: 'Catégorie et agents extincteurs',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Catégorie SSLIA',
            items: [
              {
                numero: 'SLI.01',
                ref: 'RAS 14 I §9.2.1',
                question: 'La catégorie SSLIA en vigueur correspond-elle au trafic maximal des 3 derniers mois ?',
                directive: `1. Demander les statistiques de trafic (types d'aéronefs, fréquence journalière maximale)
2. Déterminer la catégorie théorique selon la table RAS 14 I §9.2.1 (longueur + largeur fuselage max)
3. Comparer avec la catégorie déclarée et vérifier la cohérence des équipements

📌 ÉVALUATION OBJECTIVE :
- SA : Catégorie déclarée ≥ catégorie théorique calculée, équipements conformes
- NS : Catégorie déclarée < catégorie théorique (sous-dotation) ou équipements insuffisants
- NA : Aérodrome VMC jour seulement avec trafic < 700 mouvements/an (dérogation possible)
- NV : Statistiques de trafic non disponibles

⚠️ Seuil réglementaire : RAS 14 I §9.2.1 (Norme) : «La catégorie SSLIA doit couvrir l'aéronef le plus grand desservant l'aérodrome.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'SLI.02',
                ref: 'RAS 14 I §9.2.5',
                question: 'Les quantités d\'agents extincteurs principaux (eau + émulseur) sont-elles conformes à la catégorie ?',
                directive: `1. Relever les capacités effectives des citernes d'eau et d'émulseur sur chaque véhicule
2. Additionner les capacités et comparer avec les minimaux du tableau RAS 14 I §9.2.5 pour la catégorie
3. Vérifier les dates de péremption de l'émulseur (échantillonnage)

📌 ÉVALUATION OBJECTIVE :
- SA : Somme des capacités ≥ valeur minimale de la table pour la catégorie en vigueur
- NS : Déficit sur eau ou émulseur, ou produit périmé en service
- NA : Catégorie 1 (quantité symbolique acceptée)
- NV : Véhicules en maintenance le jour de la visite

⚠️ Seuil réglementaire : RAS 14 I §9.2.5 (Norme) : Table des agents extincteurs par catégorie.`,
                type_entite_cible: 'tous',
                inopine: true,
              },
            ],
          },
        ],
      },
      {
        nom: 'Véhicules et personnel',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Véhicules d\'intervention',
            items: [
              {
                numero: 'SLI.03',
                ref: 'RAS 14 I §9.2.4',
                question: 'Les véhicules d\'intervention sont-ils en état de marche, entretenus et disponibles 24h/24 ?',
                directive: `1. Inspecter visuellement chaque véhicule SSLIA (carrosserie, pneus, gyrophares, lances)
2. Demander les carnets d'entretien (dernière révision, prochaine échéance)
3. Tester le démarrage et la montée en pression de la pompe (chronométrer)

📌 ÉVALUATION OBJECTIVE :
- SA : Tous véhicules démarrables, pompe opérationnelle, entretien < 6 mois et planification à jour
- NS : ≥ 1 véhicule en panne, pompe défaillante ou entretien non réalisé
- NA : Catégorie 1 : véhicule non requis
- NV : Véhicules hors site ou accès hangar refusé

⚠️ Seuil réglementaire : RAS 14 I §9.2.4 (Norme) : «Les véhicules doivent être maintenus en état opérationnel.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'SLI.04',
                ref: 'RAS 14 I §9.2.20',
                question: 'Le temps d\'intervention principal est-il ≤ 2 minutes pour les catégories ≥ 4 ?',
                directive: `1. Réaliser un exercice de déclenchement à l'improviste (départ base SSLIA → seuil de piste)
2. Chronométrer de la sonnerie d'alarme au premier jet d'agent extincteur sur la piste
3. Réaliser 2 mesures et retenir le pire résultat

📌 ÉVALUATION OBJECTIVE :
- SA : Temps mesuré ≤ 2 minutes (catégorie ≥ 4) ou ≤ 3 minutes (catégorie 1-3)
- NS : Temps > 2 minutes (cat. ≥ 4) ou > 3 minutes (cat. 1-3)
- NA : Pas de piste utilisée (hélistation pure)
- NV : Exercice non réalisable le jour de la visite

⚠️ Seuil réglementaire : RAS 14 I §9.2.20 (Norme) : «Temps d'intervention ≤ 2 minutes pour catégories ≥ 4.»`,
                type_entite_cible: 'aerodrome',
                inopine: true,
              },
              {
                numero: 'SLI.05',
                ref: 'Doc 9137 Part1 §4.1',
                question: 'Le personnel SSLIA est-il qualifié, en nombre suffisant et ses habilitations sont-elles à jour ?',
                directive: `1. Demander l'organigramme nominatif SSLIA et les certificats de qualification
2. Vérifier la conformité du ratio effectif/catégorie (tableau Doc 9137 Part1 §4.1)
3. Contrôler les dates d'expiration des habilitations pour chaque agent

📌 ÉVALUATION OBJECTIVE :
- SA : Effectif ≥ minimum réglementaire, 100% des habilitations valides
- NS : Effectif insuffisant ou ≥ 1 habilitation expirée en poste actif
- NA : Sans objet
- NV : Dossiers du personnel non disponibles

⚠️ Seuil réglementaire : Doc 9137 Part1 §4.1 : Qualifications minimales du personnel SSLIA.`,
                type_entite_cible: 'tous',
              },
              {
                numero: 'SLI.06',
                ref: 'RAS 14 I §9.2.23',
                question: 'Les exercices d\'urgence aérodrome sont-ils réalisés selon la fréquence réglementaire ?',
                directive: `1. Demander le programme annuel d'exercices (grand exercice ≥ 2 ans, partiel ≥ 1 an)
2. Vérifier les PV des exercices réalisés (présence, déroulement, bilan)
3. Confirmer la participation des services externes (pompiers, SAMU, gendarmerie)

📌 ÉVALUATION OBJECTIVE :
- SA : Exercice complet ≤ 2 ans ET exercice partiel ≤ 1 an, PV signés disponibles
- NS : Exercice complet > 2 ans ou exercice partiel > 1 an, ou PV absents
- NA : Aérodrome VMC/jour uniquement avec dispense formelle
- NV : Planification non présentée

⚠️ Seuil réglementaire : RAS 14 I §9.2.23 (Norme) : «Exercice complet ≤ 2 ans, exercice partiel ≤ 1 an.»`,
                type_entite_cible: 'tous',
                maintien: true,
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── PHY ───────────────────────
  {
    code: 'PHY',
    label: 'Caractéristiques Physiques',
    description: 'Piste, taxiway, aire de stationnement, dégagements',
    sous_domaines: [
      {
        nom: 'Caractéristiques physiques (aérodrome)',
        type_entite_cible: 'aerodrome',
        sous_sous_domaines: [
          {
            nom: 'Piste et abords',
            items: [
              {
                numero: 'PHY.A01',
                ref: 'RAS 14 II §3.1.9',
                question: 'La largeur de la piste est-elle conforme au code de référence de l\'aérodrome ?',
                directive: `1. Mesurer la largeur de la piste (entre bords de piste marqués) en 3 points (début, milieu, fin)
2. Comparer avec la table RAS 14 II §3.1.9 selon le code de référence (1 à 4) et la lettre (A à F)
3. Vérifier l'état des bords : absence de dégradations affectant la largeur utilisable

📌 ÉVALUATION OBJECTIVE :
- SA : Largeur mesurée ≥ valeur minimale de la table pour le code de référence, bords intègres
- NS : Largeur < minimale ou dégradations réduisant la largeur effective
- NA : Piste en travaux avec NOTAM de restriction
- NV : Mesure impossible (météo, opérations en cours)

⚠️ Seuil réglementaire : RAS 14 II §3.1.9 (Norme) : Largeurs minimales par code de référence.`,
                type_entite_cible: 'aerodrome',
                inopine: true,
              },
              {
                numero: 'PHY.A02',
                ref: 'RAS 14 II §3.5.1',
                question: 'L\'aire de sécurité d\'extrémité (RESA) répond-elle aux dimensions minimales requises ?',
                directive: `1. Mesurer la longueur de la RESA depuis le seuil de piste (ou extrémité de prolongement d'arrêt)
2. Mesurer la largeur de la RESA
3. Comparer : longueur ≥ 90 m (recommandé 240 m), largeur ≥ 2× largeur piste

📌 ÉVALUATION OBJECTIVE :
- SA : RESA ≥ 90 m de long et largeur ≥ 2× largeur piste, terrain sans obstacle
- NS : RESA < 90 m ou largeur insuffisante, ou présence d'obstacles non balisés
- NA : Piste à code 1 ou 2 avec vitesse approche < 91 kt (non requis)
- NV : Accès terrain non autorisé

⚠️ Seuil réglementaire : RAS 14 II §3.5.1 (Norme) : «RESA : longueur minimale 90 m, recommandée 240 m.»`,
                type_entite_cible: 'aerodrome',
              },
              {
                numero: 'PHY.A03',
                ref: 'Doc 9157 Part2 §2.1',
                question: 'L\'inspection quotidienne de l\'aire de mouvement est-elle réalisée et consignée ?',
                directive: `1. Demander le registre d'inspections quotidiennes de l'aire de mouvement
2. Vérifier la régularité des inspections (7 derniers jours consécutifs)
3. Contrôler les fiches : points vérifiés, anomalies relevées, suivi des corrections

📌 ÉVALUATION OBJECTIVE :
- SA : Inspections réalisées chaque jour, registre complet, anomalies tracées avec suivi
- NS : Lacunes dans les inspections (> 2 jours manquants sur 7), registre incomplet
- NA : Aérodrome fermé administrativement (statut NOTAM)
- NV : Registre non présenté

⚠️ Seuil réglementaire : Doc 9157 Part2 §2.1 : «L'aire de mouvement doit être inspectée au moins une fois par jour d'exploitation.»`,
                type_entite_cible: 'aerodrome',
                inopine: true,
              },
              {
                numero: 'PHY.A04',
                ref: 'RAS 14 II §3.2.1',
                question: 'La résistance structurelle de la piste (PCR) est-elle publiée et respectée par les opérateurs ?',
                directive: `1. Relever le PCR publié dans l'AIP Sénégal pour cet aérodrome
2. Vérifier que l'AIP est à jour (date de dernière révision ≤ 24 mois)
3. Contrôler les procédures d'autorisation pour aéronefs dépassant le PCR

📌 ÉVALUATION OBJECTIVE :
- SA : PCR publié, AIP à jour, procédure de dépassement documentée
- NS : PCR non publié, AIP obsolète ou procédure de dépassement absente
- NA : Piste nouvellement construite (PCR en cours d'évaluation)
- NV : Documentation AIP non accessible lors de la visite

⚠️ Seuil réglementaire : RAS 14 II §3.2.1 (Norme) : «La résistance des chaussées doit être publiée par la méthode PCR.»`,
                type_entite_cible: 'aerodrome',
              },
            ],
          },
          {
            nom: 'Voies de circulation et parkings',
            items: [
              {
                numero: 'PHY.A05',
                ref: 'RAS 14 II §3.9.1',
                question: 'La largeur des voies de circulation est-elle conforme au code de référence lettre ?',
                directive: `1. Mesurer la largeur des voies de circulation en 3 points représentatifs
2. Comparer avec la table RAS 14 II §3.9.1 (largeur minimale selon lettre de référence)
3. Vérifier les marges de dégagement (entre roues et bords de taxiway)

📌 ÉVALUATION OBJECTIVE :
- SA : Largeur ≥ minimale de la table, marges conformes
- NS : Largeur < minimale ou marges insuffisantes
- NA : Aérodrome sans voie de circulation distincte (piste utilisée comme taxiway)
- NV : Mesure non réalisable (présence d'aéronefs)

⚠️ Seuil réglementaire : RAS 14 II §3.9.1 (Norme) : Largeurs de taxiways par lettre de référence.`,
                type_entite_cible: 'aerodrome',
              },
            ],
          },
        ],
      },
      {
        nom: 'Caractéristiques physiques (hélistation)',
        type_entite_cible: 'helistation',
        sous_sous_domaines: [
          {
            nom: 'FATO et TLOF',
            items: [
              {
                numero: 'PHY.H01',
                ref: 'RAS 14 II §4.1.1',
                question: 'Les dimensions de la FATO sont-elles conformes aux exigences pour la catégorie d\'hélicoptères desservis ?',
                directive: `1. Mesurer les dimensions de la FATO (longueur × largeur ou diamètre si circulaire)
2. Identifier la catégorie de performance des hélicoptères desservis (H = 1, 2 ou 3)
3. Comparer avec le tableau RAS 14 II §4.1.1 (FATO ≥ 1,5 × D pour performances 2 et 3)

📌 ÉVALUATION OBJECTIVE :
- SA : FATO ≥ 1,5 × D du plus grand hélicoptère, sans obstacle dans la zone
- NS : FATO < 1,5 × D ou obstacles intrusifs
- NA : Hélistation en cours de certification initiale
- NV : Mesures non réalisables (hélicoptère garé sur FATO)

⚠️ Seuil réglementaire : RAS 14 II §4.1.1 (Norme) : «La FATO doit avoir des dimensions permettant d'inscrire un cercle de diamètre ≥ 1,5 D.»`,
                type_entite_cible: 'helistation',
                inopine: true,
              },
              {
                numero: 'PHY.H02',
                ref: 'RAS 14 II §4.1.6',
                question: 'La TLOF offre-t-elle une résistance structurelle suffisante pour le poids maximal certifié ?',
                directive: `1. Demander le rapport de capacité portante de la TLOF (valeur en kg/m²)
2. Identifier le poids maximal au décollage (MTOW) du plus lourd hélicoptère desservi
3. Vérifier que la résistance TLOF ≥ 1,5 × MTOW (Doc 9261 I §4.1.6)

📌 ÉVALUATION OBJECTIVE :
- SA : Capacité portante certifiée ≥ 1,5 × MTOW plus lourd hélicoptère, rapport récent ≤ 3 ans
- NS : Capacité portante < 1,5 × MTOW ou rapport absent/expiré
- NA : TLOF récemment construite avec rapport initial en cours
- NV : Rapport non présenté

⚠️ Seuil réglementaire : RAS 14 II §4.1.6 (Norme) : «La TLOF doit pouvoir supporter 1,5 fois le poids des hélicoptères l'utilisant.»`,
                type_entite_cible: 'helistation',
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── OLS ───────────────────────
  {
    code: 'OLS',
    label: 'Surface de Limitation d\'Obstacles',
    description: 'Surfaces OLS, obstacles, marquage',
    sous_domaines: [
      {
        nom: 'Surfaces de limitation d\'obstacles (aérodrome)',
        type_entite_cible: 'aerodrome',
        sous_sous_domaines: [
          {
            nom: 'Recensement et balisage obstacles',
            items: [
              {
                numero: 'OLS.A01',
                ref: 'RAS 14 II §3.7.1',
                question: 'Les obstacles pénétrant les surfaces de limitation sont-ils recensés et publiés dans l\'AIP ?',
                directive: `1. Demander la liste des obstacles répertoriés et la comparer avec l'AIP
2. Réaliser une inspection visuelle du secteur d'approche principal (±15° de l'axe piste)
3. Vérifier le balisage des obstacles recensés (feux de jalonnement, marquage)

📌 ÉVALUATION OBJECTIVE :
- SA : Liste exhaustive publiée, obstacles balisés conformément à RAS 14 II §6
- NS : Obstacle non recensé ou non balisé détecté ; liste AIP incomplète
- NA : Surface d'approche dégagée, aucun obstacle ≥ 3 m dans le secteur
- NV : Conditions météo empêchant l'inspection visuelle

⚠️ Seuil réglementaire : RAS 14 II §3.7.1 (Norme) : «Les obstacles doivent être recensés et publiés.»`,
                type_entite_cible: 'aerodrome',
                inopine: true,
              },
              {
                numero: 'OLS.A02',
                ref: 'RAS 14 II §3.7.3',
                question: 'La surface de montée au décollage est-elle exempte d\'obstacles non balisés ?',
                directive: `1. Identifier la surface de montée selon le code de référence (pente, largeur)
2. Inspecter visuellement les bords et le prolongement d'arrêt
3. Vérifier la cohérence avec les procédures NOTAM publiées

📌 ÉVALUATION OBJECTIVE :
- SA : Surface dégagée ou obstacles existants correctement balisés et publiés
- NS : Obstacle non balisé pénétrant la surface
- NA : Prise en compte dans un EFS (Étude de Franchissement Spécifique) approuvée
- NV : Inspection terrain non réalisable

⚠️ Seuil réglementaire : RAS 14 II §3.7.3 (Norme) : «La surface de montée au décollage doit être dégagée d'obstacles.»`,
                type_entite_cible: 'aerodrome',
              },
            ],
          },
        ],
      },
      {
        nom: 'Surfaces de limitation d\'obstacles (hélistation)',
        type_entite_cible: 'helistation',
        sous_sous_domaines: [
          {
            nom: 'Secteur dégagé d\'obstacles 210°',
            items: [
              {
                numero: 'OLS.H01',
                ref: 'RAS 14 II §4.2.9',
                question: 'Le secteur dégagé d\'obstacles (OFS) couvre-t-il un arc d\'au moins 210° ?',
                directive: `1. Depuis le centre de la FATO, relever à 360° les obstacles (bâtiments, arbres, équipements)
2. Tracer le secteur libre de tout obstacle sur plan ou relevé topographique
3. Mesurer l'arc dégagé et vérifier qu'il est ≥ 210°

📌 ÉVALUATION OBJECTIVE :
- SA : L'arc dégagé d'obstacles mesure ≥ 210°, confirmé par relevé ou plan récent
- NS : L'arc dégagé mesure < 210°, ou obstacle non signalé pénètre le secteur
- NA : L'entité n'est pas une hélistation certifiée (pas de FATO)
- NV : L'angle n'a pas pu être mesuré lors de la visite (conditions, accès)

⚠️ Seuil réglementaire : RAS 14 II §4.2.9 (Norme) : «Un secteur d'héliplate-forme dégagé d'obstacles sous-tendra un arc d'au moins 210°.»`,
                type_entite_cible: 'helistation',
                inopine: true,
              },
              {
                numero: 'OLS.H02',
                ref: 'Doc 9261 I §4.2.3',
                question: 'La surface d\'approche de l\'hélistation respecte-t-elle les pentes et dimensions réglementaires ?',
                directive: `1. Identifier les axes d'approche publiés
2. Vérifier l'absence d'obstacles pénétrant la surface d'approche (pente ≥ 4,5% pour norme)
3. Contrôler la cohérence avec les procédures publiées (approches aux instruments si applicable)

📌 ÉVALUATION OBJECTIVE :
- SA : Aucun obstacle pénétrant la surface, procédures cohérentes
- NS : Obstacle détecté, ou surface non conforme à la pente requise
- NA : Axe d'approche non défini formellement
- NV : Vérification terrain impossible

⚠️ Seuil réglementaire : Doc 9261 I §4.2.3 : «Surface d'approche : pente montante de 4,5%.»`,
                type_entite_cible: 'helistation',
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── RA ───────────────────────
  {
    code: 'RA',
    label: 'Risque Animalier',
    description: 'Gestion de la faune, péril animalier, prévention',
    sous_domaines: [
      {
        nom: 'Programme de gestion de la faune',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Programme et inspections',
            items: [
              {
                numero: 'RA.01',
                ref: 'RAS 14 I §11.3.1',
                question: 'L\'aérodrome dispose-t-il d\'un programme documenté de gestion du péril animalier ?',
                directive: `1. Demander le programme de gestion de la faune (Wildlife Hazard Management Plan)
2. Vérifier qu'il couvre : espèces recensées, mesures dissuasives, responsabilités, formations
3. Contrôler la date de révision (≤ 24 mois ou après incident significatif)

📌 ÉVALUATION OBJECTIVE :
- SA : Programme documenté, révisé ≤ 24 mois, parties prenantes désignées
- NS : Programme absent, obsolète (> 24 mois) ou non formalisé
- NA : Aérodrome ≤ 700 mvts/an avec dérogation formelle
- NV : Document non présenté

⚠️ Seuil réglementaire : RAS 14 I §11.3.1 (Norme) : «Un programme de réduction du péril animalier doit être mis en place.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'RA.02',
                ref: 'Doc 9137 Part3 §3.1',
                question: 'Les inspections régulières de l\'aire de mouvement pour détecter la présence d\'animaux sont-elles réalisées ?',
                directive: `1. Demander le registre des inspections faune de la semaine écoulée
2. Vérifier la régularité (≥ 1 inspection avant la première exploitation + après chaque heure de fort trafic)
3. Contrôler les fiches de signalement d'incidents (wildlife strikes) sur les 12 derniers mois

📌 ÉVALUATION OBJECTIVE :
- SA : Inspections quotidiennes réalisées, registre complet, incidents signalés et traités
- NS : Inspections manquantes (> 2 jours/semaine) ou registre lacunaire
- NA : Aérodrome fermé la semaine de la visite
- NV : Registre non disponible

⚠️ Seuil réglementaire : Doc 9137 Part3 §3.1 : «Inspection de l'aire de mouvement avant chaque exploitation.»`,
                type_entite_cible: 'tous',
              },
              {
                numero: 'RA.03',
                ref: 'RAS 14 I §11.2.1',
                question: 'La clôture périmétrique est-elle intègre et empêche-t-elle efficacement l\'intrusion d\'animaux ?',
                directive: `1. Effectuer une inspection visuelle complète du périmètre (ou portion représentative ≥ 30%)
2. Relever les brèches, fondations dégagées, portails défectueux
3. Vérifier les registres de maintenance de la clôture (réparations, rondes)

📌 ÉVALUATION OBJECTIVE :
- SA : Clôture continue, aucune brèche > 10 cm, portails fonctionnels, maintenance tracée
- NS : ≥ 1 brèche permettant l'intrusion de gros animaux ou portail défaillant
- NA : Hélistation en zone maritime/insulaire sans faune terrestre
- NV : Inspection périmètre non réalisable (météo, sécurité)

⚠️ Seuil réglementaire : RAS 14 I §11.2.1 (Norme) : «Une clôture doit empêcher les intrusions d'animaux.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── ELEC ───────────────────────
  {
    code: 'ELEC',
    label: 'Réseaux Électriques',
    description: 'Balisage lumineux, centrales, réseaux électriques aérodromes',
    sous_domaines: [
      {
        nom: 'Balisage lumineux et alimentation',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Éclairage piste et taxiways',
            items: [
              {
                numero: 'ELEC.01',
                ref: 'RAS 14 II §8.2.1',
                question: 'L\'ensemble des feux de piste (seuil, bords, extrémité) est-il opérationnel et conforme ?',
                directive: `1. Réaliser l'inspection nocturne (ou crépusculaire) des feux de bord de piste, seuil et extrémité
2. Compter les feux défaillants et calculer le pourcentage de défaillance
3. Vérifier l'intensité lumineuse (contrôle chromatique : blanc, rouge, vert)

📌 ÉVALUATION OBJECTIVE :
- SA : ≤ 5% de feux défaillants sur chaque groupe, couleurs conformes
- NS : > 5% de défaillance sur un groupe, ou feux manquants sur seuil/extrémité
- NA : Aérodrome VMC jour seulement, sans exigence de balisage nocturne
- NV : Inspection nocturne non réalisable lors de la visite

⚠️ Seuil réglementaire : RAS 14 II §8.2.1 (Norme) : «Les feux de bord de piste doivent fonctionner à ≥ 95%.»`,
                type_entite_cible: 'aerodrome',
                inopine: true,
              },
              {
                numero: 'ELEC.02',
                ref: 'RAS 14 II §8.5.1',
                question: 'Le système d\'indicateur de pente d\'approche (PAPI/VASIS) est-il calibré et fonctionnel ?',
                directive: `1. Vérifier le fonctionnement visuel du PAPI/VASIS depuis la piste (observation des unités lumineuses)
2. Demander le dernier rapport de calibration (≤ 12 mois)
3. Contrôler la cohérence avec la procédure ILS/approche publiée

📌 ÉVALUATION OBJECTIVE :
- SA : Toutes unités opérationnelles, calibration ≤ 12 mois, cohérence ILS vérifiée
- NS : ≥ 1 unité défaillante ou calibration > 12 mois
- NA : Aérodrome sans procédure d'approche aux instruments ni PAPI requis
- NV : Inspection lumineuse impossible (conditions de jour sans nuages témoins)

⚠️ Seuil réglementaire : RAS 14 II §8.5.1 (Norme) : «Les indicateurs de pente doivent être vérifiés annuellement.»`,
                type_entite_cible: 'aerodrome',
              },
              {
                numero: 'ELEC.03',
                ref: 'RAS 14 II §8.1.6',
                question: 'Le groupe électrogène de secours assure-t-il la reprise automatique en ≤ 15 secondes ?',
                directive: `1. Déclencher une coupure simulée de l'alimentation principale (avec accord opérationnel)
2. Chronométrer le délai de reprise automatique par le groupe de secours
3. Vérifier le niveau de carburant et les dernières maintenance (PV ≤ 6 mois)

📌 ÉVALUATION OBJECTIVE :
- SA : Reprise automatique ≤ 15 secondes, carburant ≥ 24h d'autonomie, maintenance ≤ 6 mois
- NS : Reprise > 15 secondes, autonomie < 24h ou maintenance absente
- NA : Aérodrome VMC/jour avec alimentation secourue non requise
- NV : Test non autorisé ou groupe hors service lors de la visite

⚠️ Seuil réglementaire : RAS 14 II §8.1.6 (Norme) : «Le groupe de secours doit reprendre en ≤ 15 secondes.»`,
                type_entite_cible: 'tous',
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── MFP ───────────────────────
  {
    code: 'MFP',
    label: 'Marques, Feux et Panneaux',
    description: 'Marquage au sol, signalisation lumineuse et panneaux',
    sous_domaines: [
      {
        nom: 'Marquage au sol',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Marquages de piste',
            items: [
              {
                numero: 'MFP.A01',
                ref: 'RAS 14 II §5.2.2',
                question: 'Le marquage de seuil de piste est-il présent, lisible et conforme en dimensions ?',
                directive: `1. Inspecter visuellement le marquage de seuil (barres blanches perpendiculaires à l'axe)
2. Vérifier le nombre de barres et leur largeur selon le code de référence lettre
3. Évaluer la lisibilité (contraste, dégradation ≤ 30% de la surface)

📌 ÉVALUATION OBJECTIVE :
- SA : Marquage conforme, lisibilité > 70%, dimensions conformes au code lettre
- NS : Marquage absent, largeur non conforme ou lisibilité ≤ 70%
- NA : Piste sans instrument avec marquage minimal requis seulement
- NV : Piste mouillée rendant l'évaluation visuelle impossible

⚠️ Seuil réglementaire : RAS 14 II §5.2.2 (Norme) : Marquages de seuil de piste selon code de référence lettre.`,
                type_entite_cible: 'aerodrome',
                inopine: true,
              },
              {
                numero: 'MFP.A02',
                ref: 'RAS 14 II §5.2.3',
                question: 'L\'axe de piste est-il marqué de manière continue et lisible sur toute la longueur ?',
                directive: `1. Parcourir l'axe de piste et inspecter la continuité des tirets d'axe
2. Mesurer la lisibilité (contraste minimum 70% avec la surface)
3. Vérifier l'état général sur les zones à haute friction (toucher des roues)

📌 ÉVALUATION OBJECTIVE :
- SA : Axe continu, contraste > 70%, dégradation localisée < 10% de la longueur
- NS : Interruptions de > 10 m, contraste ≤ 70% ou dégradation > 30% de la longueur
- NA : Piste en cours de marquage (NOTAM publié)
- NV : Conditions ne permettant pas l'inspection (nuit sans éclairage)

⚠️ Seuil réglementaire : RAS 14 II §5.2.3 (Norme) : «L'axe de piste doit être marqué sur toute la longueur.»`,
                type_entite_cible: 'aerodrome',
              },
            ],
          },
          {
            nom: 'Panneaux de signalisation',
            items: [
              {
                numero: 'MFP.P01',
                ref: 'RAS 14 II §7.1.1',
                question: 'Les panneaux d\'information obligatoire sont-ils présents, lisibles et correctement positionnés ?',
                directive: `1. Inventorier les panneaux d'information obligatoire (désignation de piste, points d'attente)
2. Vérifier la lisibilité à la distance requise (30 m de nuit, 60 m de jour)
3. Contrôler l'état physique (absence de déformation, éclairage nocturne si requis)

📌 ÉVALUATION OBJECTIVE :
- SA : Tous panneaux présents, lisibles aux distances requises et en bon état
- NS : Panneau manquant ou illisible sur un point d'attente critique
- NA : Aérodrome sans croisement de piste (topologie simple)
- NV : Inventaire impossible lors de la visite (nuit sans accès)

⚠️ Seuil réglementaire : RAS 14 II §7.1.1 (Norme) : «Les panneaux d'information obligatoire doivent être installés aux intersections.»`,
                type_entite_cible: 'aerodrome',
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── COP ───────────────────────
  {
    code: 'COP',
    label: 'Compétences Organisationnelles et Personnels',
    description: 'Formation, habilitations, compétences du personnel',
    sous_domaines: [
      {
        nom: 'Effectifs et habilitations',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Qualifications et formations',
            items: [
              {
                numero: 'COP.01',
                ref: 'RAS 14 I §4.1',
                question: 'L\'effectif de l\'exploitant est-il conforme aux exigences minimales réglementaires ?',
                directive: `1. Demander l'organigramme nominatif et les fiches de poste
2. Comparer l'effectif avec les exigences RAS 14 I §4.1 et Manuel ANACIM pour la catégorie
3. Vérifier que les postes-clés (responsable sécurité, chef d'exploitation) sont pourvus

📌 ÉVALUATION OBJECTIVE :
- SA : Effectif ≥ minimum réglementaire, postes-clés pourvus, organigramme à jour
- NS : Effectif insuffisant ou poste-clé vacant sans suppléant désigné
- NA : Cas particulier d'hélistation légère avec accord ANACIM
- NV : Organigramme non présenté

⚠️ Seuil réglementaire : RAS 14 I §4.1 (Norme) : Effectifs minimaux selon type et catégorie d'aérodrome.`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'COP.02',
                ref: 'MANUEL-ANACIM §5.2',
                question: 'Les agents affectés à des postes de sécurité ont-ils reçu une formation initiale validée ?',
                directive: `1. Sélectionner 3 agents en postes de sécurité (aléatoirement) et demander leurs dossiers
2. Vérifier pour chacun : certificat de formation initiale, domaine, date de délivrance
3. Contrôler la validité (formation < délai réglementaire de péremption si applicable)

📌 ÉVALUATION OBJECTIVE :
- SA : 100% des agents sélectionnés ont des certificats de formation valides
- NS : ≥ 1 agent sans certificat valide en poste actif de sécurité
- NA : Agent nouvellement recruté < 3 mois (en période d'intégration formelle)
- NV : Dossiers non disponibles lors de la visite

⚠️ Seuil réglementaire : MANUEL-ANACIM §5.2 : «Tout agent de sécurité doit avoir reçu une formation initiale validée.»`,
                type_entite_cible: 'tous',
              },
              {
                numero: 'COP.03',
                ref: 'MANUEL-ANACIM §5.3',
                question: 'Les habilitations et certificats du personnel de sécurité sont-ils à jour et tracés ?',
                directive: `1. Demander le tableau de suivi des habilitations (document ou SI RH)
2. Vérifier que les dates d'expiration sont renseignées et que les renouvellements sont planifiés
3. Contrôler l'absence d'agent avec habilitation expirée en poste actif

📌 ÉVALUATION OBJECTIVE :
- SA : Tableau complet, aucun agent avec habilitation expirée, renouvellements planifiés ≤ 30j
- NS : ≥ 1 agent avec habilitation expirée en poste, ou tableau incomplet
- NA : Poste ne nécessitant pas d'habilitation formelle
- NV : Tableau non présenté

⚠️ Seuil réglementaire : MANUEL-ANACIM §5.3 : «Les habilitations doivent être maintenues à jour et tracées.»`,
                type_entite_cible: 'tous',
                maintien: true,
              },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────── OPS ───────────────────────
  {
    code: 'OPS',
    label: 'Procédures Opérationnelles',
    description: 'Procédures d\'exploitation, coordination, communication',
    sous_domaines: [
      {
        nom: 'Manuel d\'exploitation et procédures',
        type_entite_cible: 'tous',
        sous_sous_domaines: [
          {
            nom: 'Manuel et procédures d\'urgence',
            items: [
              {
                numero: 'OPS.01',
                ref: 'RAS 14 I §2.1',
                question: 'Le Manuel d\'Exploitation de l\'aérodrome (MEA) est-il à jour et approuvé par l\'ANACIM ?',
                directive: `1. Demander le MEA (ou équivalent pour hélistation)
2. Vérifier la présence de la page d'approbation ANACIM avec date
3. Comparer la date de révision avec les événements structurants (nouvelles pistes, équipements, réglementations)

📌 ÉVALUATION OBJECTIVE :
- SA : MEA présent, approuvé par ANACIM, révisé après dernier événement structurant
- NS : MEA absent, non approuvé, ou non révisé après modification majeure de l'infrastructure
- NA : Hélistation non soumise à obligation de MEA (surface < seuil réglementaire)
- NV : Document non disponible lors de la visite

⚠️ Seuil réglementaire : RAS 14 I §2.1 (Norme) : «L'exploitant doit tenir à jour un manuel d'exploitation agréé.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'OPS.02',
                ref: 'RAS 14 I §2.2',
                question: 'Les procédures d\'urgence aérodrome sont-elles documentées, connues et exercées ?',
                directive: `1. Demander la liste des procédures d'urgence (incendie, accident aérien, alerte bombe, intrusion)
2. Interroger 2 agents sur la procédure à suivre en cas d'incendie de terminal
3. Vérifier les affichages des contacts d'urgence et l'existence d'un plan d'urgence aérodrome (PUA)

📌 ÉVALUATION OBJECTIVE :
- SA : PUA existant, procédures affichées, agents interrogés connaissent les actions de base
- NS : PUA absent, procédures non affichées ou agents ignorants des actions d'urgence
- NA : Hélistation sans activité commerciale avec plan simplifié accepté
- NV : Procédures non accessibles lors de la visite

⚠️ Seuil réglementaire : RAS 14 I §2.2 (Norme) : «Un plan d'urgence d'aérodrome doit être établi.»`,
                type_entite_cible: 'tous',
                inopine: true,
              },
              {
                numero: 'OPS.03',
                ref: 'RAS 14 I §2.3',
                question: 'Le protocole de coordination entre l\'exploitant et les services de navigation aérienne est-il formalisé ?',
                directive: `1. Demander le protocole ou lettre d'accord entre l'exploitant et l'ASECNA/ANA
2. Vérifier la date et les signatures des parties
3. Contrôler les procédures de coordination (fermeture piste, SNOWTAM, NOTAM)

📌 ÉVALUATION OBJECTIVE :
- SA : Protocole signé ≤ 3 ans, procédures de coordination opérationnelles
- NS : Protocole absent, expiré (> 3 ans) ou procédures non définies
- NA : Hélistation privée sans SNA désigné
- NV : Document non présenté

⚠️ Seuil réglementaire : RAS 14 I §2.3 (Norme) : «Une coordination formelle doit être établie avec les SNA.»`,
                type_entite_cible: 'tous',
              },
              {
                numero: 'OPS.04',
                ref: 'Doc 9981 §5.1',
                question: 'Les incidents de sécurité sont-ils systématiquement consignés et traités via le système de compte-rendu ?',
                directive: `1. Demander le registre des compte-rendus d'incidents (CRIT ou équivalent)
2. Vérifier la régularité des signalements sur les 6 derniers mois
3. Contrôler le traitement (analyse, mesures correctives, retour d'information à l'auteur)

📌 ÉVALUATION OBJECTIVE :
- SA : Registre tenu, signalements réguliers, traitement tracé avec retour d'information
- NS : Absence de signalements sur 6 mois, ou signalements sans traitement documenté
- NA : Entité avec accord de dispense du système de compte-rendu
- NV : Registre non présenté

⚠️ Seuil réglementaire : Doc 9981 §5.1 : «Un système de compte-rendu d'incidents doit être opérationnel.»`,
                type_entite_cible: 'tous',
                maintien: true,
              },
            ],
          },
        ],
      },
    ],
  },
]

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

export function generateKitChecklist(params: KitDocChecklistParams): KitChecklistResult {
  const { surveillance_id, entite_id, type_entite, type_surveillance, portee, profil_risque, analyses_docs } = params

  // Étendre la portée (AGA → tous les domaines individuels)
  const domainesActifs = expandDomaines(portee)

  // Récupérer les documents Kit actifs depuis le store
  const store = useAppStore.getState()
  const kitDocs = (store.kitDocuments || []).filter(
    d => d.etat === 'a_jour' || d.etat === 'en_revision'
  )
  const kitDocsIds = kitDocs.map(d => d.id)

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

  for (const kbDomaine of KNOWLEDGE_BASE) {
    // Filtrer par portée
    if (!domainesActifs.includes(kbDomaine.code)) continue

    const domaineInfo = DOMAINES_SURVEILLANCE.find(d => d.code === kbDomaine.code)
    const kitDomaine: KitDomaine = {
      code: kbDomaine.code,
      label: kbDomaine.label,
      description: kbDomaine.description,
      sous_domaines: [],
    }

    for (const kbSD of kbDomaine.sous_domaines) {
      // Filtrer par type d'entité
      const sdCible = kbSD.type_entite_cible
      if (sdCible !== 'tous' && sdCible !== type_entite && type_entite !== 'mixte') continue
      // Pour mixte : inclure tous
      if (type_entite === 'mixte' && sdCible !== 'tous' &&
          sdCible !== 'aerodrome' && sdCible !== 'helistation') continue

      const kitSD: KitSousDomaine = {
        id: `${kbDomaine.code}_${kbSD.nom.replace(/\s+/g, '_').toLowerCase()}`,
        nom: kbSD.nom,
        type_entite_cible: kbSD.type_entite_cible,
        sous_sous_domaines: [],
        ordre: kitDomaine.sous_domaines.length,
      }

      for (const kbSSD of kbSD.sous_sous_domaines) {
        const kitSSD: KitSousSousDomaine = {
          id: `${kitSD.id}_${kbSSD.nom.replace(/\s+/g, '_').toLowerCase()}`,
          nom: kbSSD.nom,
          items: [],
          ordre: kitSD.sous_sous_domaines.length,
        }

        for (const kbItem of kbSSD.items) {
          // Adapter selon type_surveillance
          if (type_surveillance === 'inopine' && !kbItem.inopine) continue
          if (type_surveillance === 'maintien' && kbItem.maintien === false) {
            // garder tous les items (maintien = checklist complète + items spécifiques)
          }

          itemCounter++
          const itemId = `${kbDomaine.code}_${kbItem.numero}_${itemCounter}`

          // Appliquer la prédiction
          const pred = appliquerPrediction(
            entite_id,
            type_surveillance,
            kbDomaine.code,
            kbSD.nom,
            kbSSD.nom,
            itemId,
            kbItem.numero,
            kbItem.question,
            profil_risque
          )

          // Parser la directive pour séparer guide + critères d'évaluation
          const parsedDir = parseDirectiveEval(kbItem.directive)

          const kitItem: KitChecklistItem = {
            id: itemId,
            numero: kbItem.numero,
            reference_reglementaire: kbItem.ref,
            point_verification: kbItem.question,
            directive_preuve: parsedDir.guide,
            directive_sa: parsedDir.sa,
            directive_ns: parsedDir.ns,
            directive_nv: parsedDir.nv,
            directive_na: parsedDir.na,
            prediction: pred.prediction,
            confiance: pred.confiance,
            justification: pred.justification,
            alerte: pred.alerte,
            prefill: pred.confiance >= 70,
            observation: pred.confiance >= 85 ? `Prédiction automatique (${pred.confiance}%)` : undefined,
            type_entite_cible: kbItem.type_entite_cible,
            type_checklist: type_surveillance === 'maintien' ? 'standard' : 'standard',
          }

          // Enrichir avec les analyses de documents si disponibles
          if (analyses_docs && analyses_docs.length > 0) {
            const extraitsPertinents = analyses_docs.flatMap(a => a.extraits).filter(e =>
              e.domaines.includes(kbDomaine.code) &&
              (kbItem.ref.toLowerCase().includes(e.reference.toLowerCase().split('§')[0].trim()) ||
               e.reference.toLowerCase().includes(kbItem.ref.toLowerCase().split('§')[0].trim()))
            )
            if (extraitsPertinents.length > 0) {
              const ex = extraitsPertinents[0]
              kitItem.reference_reglementaire = `${kbItem.ref} — ${ex.reference}`
              if (ex.seuil_numerique) {
                kitItem.directive_preuve = `${parsedDir.guide}\n\nSeuil issu de l'analyse documentaire : ${ex.seuil_numerique}`
              }
              kitItem.justification = `${pred.justification} | Enrichi par analyse documentaire : ${ex.titre}`
            }
          }

          kitSSD.items.push(kitItem)
        }

        if (kitSSD.items.length > 0) {
          kitSD.sous_sous_domaines.push(kitSSD)
        }
      }

      if (kitSD.sous_sous_domaines.length > 0) {
        kitDomaine.sous_domaines.push(kitSD)
      }
    }

    // Items de maintien supplémentaires
    if (type_surveillance === 'maintien') {
      kitDomaine.sous_domaines.push(...genererItemsMaintien(kbDomaine.code, entite_id, profil_risque))
    }

    if (kitDomaine.sous_domaines.length > 0) {
      result.domaines.push(kitDomaine)
    }
  }

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
  generateChecklist(params: KitDocChecklistParams): KitChecklistResult {
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

    for (const kbDomaine of KNOWLEDGE_BASE) {
      if (!domainesActifs.includes(kbDomaine.code)) continue

      const extraitsDomaine = analyse.extraits.filter(e =>
        e.domaines.includes(kbDomaine.code)
      )

      const domaine: any = {
        id: `kit_preview_${doc.id}_${kbDomaine.code}`,
        nom: kbDomaine.label,
        description: kbDomaine.description,
        items: [],
        sousDomaines: [],
        isExpanded: true,
        progression: 0,
        ordre: result.length,
      }

      let itemCounter = 0
      for (const kbSD of kbDomaine.sous_domaines) {
        const sd: any = {
          id: `${domaine.id}_${kbSD.nom.replace(/\s+/g, '_').toLowerCase()}`,
          nom: kbSD.nom,
          items: [],
          sousSousDomaines: [],
          isExpanded: true,
          ordre: domaine.sousDomaines.length,
        }

        for (const kbSSD of kbSD.sous_sous_domaines) {
          const ssd: any = {
            id: `${sd.id}_${kbSSD.nom.replace(/\s+/g, '_').toLowerCase()}`,
            nom: kbSSD.nom,
            items: [],
            isExpanded: true,
            ordre: sd.sousSousDomaines.length,
          }

          for (const kbItem of kbSSD.items) {
            itemCounter++
            const extraitPertinent = extraitsDomaine.find(e =>
              kbItem.ref.toLowerCase().includes(e.reference.toLowerCase().split('§')[0].trim()) ||
              e.reference.toLowerCase().includes(kbItem.ref.toLowerCase().split('§')[0].trim())
            )

            ssd.items.push({
              id: `${ssd.id}_${kbItem.numero}_${itemCounter}`,
              numero: kbItem.numero,
              reference_reglementaire: extraitPertinent
                ? `${kbItem.ref} — ${extraitPertinent.reference}`
                : kbItem.ref,
              point_verification: kbItem.question,
              directive_preuve: extraitPertinent?.seuil_numerique
                ? `${kbItem.directive}\n\nSeuil issu de l'analyse documentaire : ${extraitPertinent.seuil_numerique}`
                : kbItem.directive,
              resultat: undefined,
              ordre: itemCounter,
              prediction: 'NV',
              confiance: extraitPertinent ? 40 : 30,
              justification: extraitPertinent
                ? `Point issu du document "${doc.nom}" (${analyse.reference_base}) — ${extraitPertinent.titre}`
                : `Point de verification standard pour le domaine ${kbDomaine.code}`,
              alerte: false,
              prefilled: false,
              observation: undefined,
              fichiers: [],
            })
          }

          if (ssd.items.length > 0) sd.sousSousDomaines.push(ssd)
        }

        if (sd.sousSousDomaines.length > 0) domaine.sousDomaines.push(sd)
      }

      if (domaine.sousDomaines.length > 0) result.push(domaine)
    }

    return result
  }

  /**
   * Génère une preview de checklist à partir de TOUS les documents réglementaires actifs.
   * Parcourt l'intégralité de la KNOWLEDGE_BASE (tous les domaines) et croise
   * chaque item avec les extraits de tous les documents disponibles.
   */
  private parseTrainingDescription(desc: string): { point_verification: string; reference_reglementaire?: string; directive_preuve?: string } {
    try {
      const parsed = JSON.parse(desc);
      if (parsed && parsed.pv) {
        return {
          point_verification: parsed.pv,
          reference_reglementaire: parsed.ref,
          directive_preuve: parsed.dir,
        };
      }
    } catch {}
    return { point_verification: desc };
  }

  generatePreviewFromAllDocuments(): any[] {
    const store = useAppStore.getState()
    const allDocs = (store.kitDocuments || []).filter(d =>
      d.etat === 'a_jour' && d.ia_analyse_at
    )
    const trainingRecords = (store.checklistMemoryRecords || []).filter(r => r.aerodrome_id === 'anacim_legacy')
    // Reconstruire toutes les analyses
    const allAnalyses: { doc: KitDocument; analyse: KitDocAnalysis }[] = allDocs.map(d => {
      const extraits: ExtraitReglementaire[] = (d.extraits || []).map(e => ({
        reference: e.reference,
        titre: e.titre,
        contenu_resume: e.contenu_resume,
        statut: e.statut as StatutExtrait,
        domaines: e.domaines,
        type_entite_cible: e.type_entite_cible as TypeEntite | 'tous',
        seuil_numerique: e.seuil_numerique,
        source_document_id: e.source_document_id,
        detecte_le: e.detecte_le,
      }))
      return {
        doc: d,
        analyse: {
          document_id: d.id,
          reference_base: d.reference_base || 'RAS 14 I',
          type_oaci_detecte: d.type_document_oaci || d.type_document,
          extraits,
          domaines_impactes: d.domaines,
          impact: (d.ia_impact || 'mineur') as KitDocAnalysis['impact'],
          conflits: [],
          analysed_at: d.ia_analyse_at || d.created_at,
        } as KitDocAnalysis,
      }
    })

    // Fusionner tous les domaines impactés
    const allDomainesImpactes = [...new Set(allAnalyses.flatMap(a => a.analyse.domaines_impactes))]
    const domainesActifs = allDomainesImpactes.length > 0
      ? expandDomaines(allDomainesImpactes)
      : ['SLI','PHY','OLS','RA','ELEC','MFP','COP','OPS']

    const result: any[] = []

    for (const kbDomaine of KNOWLEDGE_BASE) {
      if (!domainesActifs.includes(kbDomaine.code)) continue

      // Extraits de TOUS les documents pour ce domaine
      const extraitsDomaine = allAnalyses.flatMap(({ doc, analyse }) =>
        analyse.extraits
          .filter(e => e.domaines.includes(kbDomaine.code))
          .map(e => ({ ...e, docNom: doc.nom, docRef: analyse.reference_base }))
      )

      const domaine: any = {
        id: `kit_preview_all_${kbDomaine.code}`,
        nom: kbDomaine.label,
        description: kbDomaine.description,
        items: [],
        sousDomaines: [],
        isExpanded: true,
        progression: 0,
        ordre: result.length,
      }

      let itemCounter = 0
      for (const kbSD of kbDomaine.sous_domaines) {
        const sd: any = {
          id: `${domaine.id}_${kbSD.nom.replace(/\s+/g, '_').toLowerCase()}`,
          nom: kbSD.nom,
          items: [],
          sousSousDomaines: [],
          isExpanded: true,
          ordre: domaine.sousDomaines.length,
        }

        for (const kbSSD of kbSD.sous_sous_domaines) {
          const ssd: any = {
            id: `${sd.id}_${kbSSD.nom.replace(/\s+/g, '_').toLowerCase()}`,
            nom: kbSSD.nom,
            items: [],
            isExpanded: true,
            ordre: sd.sousSousDomaines.length,
          }

          for (const kbItem of kbSSD.items) {
            itemCounter++

            // Trouver tous les extraits pertinents (tous documents confondus)
            const extraitsPertinents = extraitsDomaine.filter(e =>
              kbItem.ref.toLowerCase().includes(e.reference.toLowerCase().split('§')[0].trim()) ||
              e.reference.toLowerCase().includes(kbItem.ref.toLowerCase().split('§')[0].trim())
            )

            const meilleurExtrait = extraitsPertinents[0]
            const refsMultiDocs = extraitsPertinents.length > 1
              ? `\n\nRéférences croisées (${extraitsPertinents.length} documents) :\n${extraitsPertinents.map(e => `- ${e.docNom} (${e.docRef}) — ${e.titre}`).join('\n')}`
              : ''

            // Parser la directive pour séparer guide et critères SA/NS/NV/NA
            const rawDirective = meilleurExtrait?.seuil_numerique
              ? `${kbItem.directive}\n\nSeuil : ${meilleurExtrait.seuil_numerique}${refsMultiDocs}`
              : `${kbItem.directive}${refsMultiDocs}`
            const parsedPreview = parseDirectiveEval(rawDirective)

            ssd.items.push({
              id: `${ssd.id}_${kbItem.numero}_${itemCounter}`,
              numero: kbItem.numero,
              reference_reglementaire: meilleurExtrait
                ? `${kbItem.ref} — ${meilleurExtrait.reference}`
                : kbItem.ref,
              point_verification: kbItem.question,
              directive_preuve: parsedPreview.guide,
              directive_sa: parsedPreview.sa,
              directive_ns: parsedPreview.ns,
              directive_nv: parsedPreview.nv,
              directive_na: parsedPreview.na,
              resultat: undefined,
              ordre: itemCounter,
              prediction: 'NV',
              confiance: extraitsPertinents.length > 0
                ? Math.min(40 + extraitsPertinents.length * 10, 80)
                : 30,
              justification: extraitsPertinents.length > 0
                ? `Validé par ${extraitsPertinents.length} document(s) réglementaire(s)\n${extraitsPertinents.map(e => `- ${e.docNom} (${e.docRef}): ${e.titre}`).join('\n')}`
                : `Point de vérification standard pour le domaine ${kbDomaine.code}`,
              alerte: false,
              prefilled: false,
              observation: undefined,
              fichiers: [],
            })
          }

          if (ssd.items.length > 0) sd.sousSousDomaines.push(ssd)
        }

        if (sd.sousSousDomaines.length > 0) domaine.sousDomaines.push(sd)
      }

      // Injecter les items d'entraînement ANACIM (few-shot) dans les items du domaine
      const trainingForDomaine = trainingRecords.filter(r => r.domaine === kbDomaine.code)
      if (trainingForDomaine.length > 0) {
        if (!domaine.items) domaine.items = []
        for (const tr of trainingForDomaine) {
          const parsed = this.parseTrainingDescription(tr.item_description)
          domaine.items.push({
            id: `training_${tr.id}`,
            numero: tr.item_numero,
            reference_reglementaire: parsed.reference_reglementaire || '',
            point_verification: parsed.point_verification,
            directive_preuve: parsed.directive_preuve || '',
            resultat: tr.dernier_resultat || undefined,
            ordre: 9999 + domaine.items.length,
            prediction: tr.dernier_resultat || 'NV',
            confiance: tr.confiance || 95,
            justification: `Item issu de la mémoire ANACIM (confiance: ${tr.confiance}%)`,
            alerte: tr.alerte_ecart_recurrent || false,
            prefilled: true,
          })
        }
        domaine.progression = Math.round(
          (domaine.items.filter((i: any) => i.resultat).length / domaine.items.length) * 100
        )
      }

      if (domaine.sousDomaines.length > 0 || (domaine.items && domaine.items.length > 0)) result.push(domaine)
    }

    return result
  }

  // Reconstruit une KitDocAnalysis depuis un document persisté
  getAnalysisFromDoc(doc: KitDocument): KitDocAnalysis | null {
    if (!doc.ia_analyse_at) return null
    const extraits: ExtraitReglementaire[] = (doc.extraits || []).map(e => ({
      reference: e.reference,
      titre: e.titre,
      contenu_resume: e.contenu_resume,
      statut: e.statut as StatutExtrait,
      domaines: e.domaines,
      type_entite_cible: e.type_entite_cible as TypeEntite | 'tous',
      seuil_numerique: e.seuil_numerique,
      source_document_id: e.source_document_id,
      detecte_le: e.detecte_le,
    }))
    return {
      document_id: doc.id,
      reference_base: doc.reference_base || detecterReferenceBase(doc),
      type_oaci_detecte: doc.type_document_oaci || doc.type_document,
      extraits,
      domaines_impactes: doc.domaines,
      impact: (doc.ia_impact || 'mineur') as KitDocAnalysis['impact'],
      conflits: [],
      analysed_at: doc.ia_analyse_at || doc.created_at,
    }
  }

  // Récupère les analyses de documents pour un ensemble de domaines
  getAnalysesForPortee(portee: string[]): KitDocAnalysis[] {
    const store = useAppStore.getState()
    const domainesActifs = expandDomaines(portee)
    const docs = (store.kitDocuments || []).filter(d =>
      d.etat === 'a_jour' &&
      d.ia_analyse_at &&
      d.domaines.some(dom => domainesActifs.includes(dom))
    )
    // Reconstruire les analyses à partir des données persistées dans les documents
    return docs.map(d => {
      const extraits: ExtraitReglementaire[] = (d.extraits || []).map(e => ({
        reference: e.reference,
        titre: e.titre,
        contenu_resume: e.contenu_resume,
        statut: e.statut as StatutExtrait,
        domaines: e.domaines,
        type_entite_cible: e.type_entite_cible as TypeEntite | 'tous',
        seuil_numerique: e.seuil_numerique,
        source_document_id: e.source_document_id,
        detecte_le: e.detecte_le,
      }))
      return {
        document_id: d.id,
        reference_base: d.reference_base || 'RAS 14 I',
        type_oaci_detecte: d.type_document_oaci || d.type_document,
        extraits,
        domaines_impactes: d.domaines,
        impact: (d.ia_impact || 'mineur') as KitDocAnalysis['impact'],
        conflits: [],
        analysed_at: d.ia_analyse_at || d.created_at,
      } as KitDocAnalysis
    })
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

    const systemPrompt = `Tu es un expert en systèmes de gestion de la sécurité (SGS) aéronautique selon l'OACI.
Ta mission est de générer des questions d'évaluation PAOE (Présent, Approprié, Opérationnel, Efficace) pour un élément spécifique du SGS.

RÈGLES CRITIQUES:
1. Chaque question doit avoir une référence réglementaire précise (ex: RAS 19 §2.1.2, Doc 9859 Ch.3.4)
2. Les directives doivent être PERTINENTES et ACTIONNABLES — l'inspecteur doit savoir exactement quoi vérifier
3. Les directives PAOE doivent être hiérarchiques:
   - Présent: existe-t-il documenté?
   - Approprié: est-il adapté au contexte de l'aérodrome?
   - Opérationnel: est-il appliqué au quotidien?
   - Efficace: produit-il les résultats attendus?
4. Le guide d'étapes doit être une procédure de vérification terrain étape par étape
5. Adapter le nombre de questions à la complexité de l'élément (2-5 questions)
6. Pour un aérodrome international: inclure des questions sur les standards internationaux
7. Pour un aérodrome national: se concentrer sur les exigences nationales essentielles

FORMAT DE RÉPONSE EXCLUSIVEMENT JSON:`

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
        questions: [{ ref: `${elementId}.q1`, texte: `L'élément ${elementLabel} est-il documenté?`, sourceReglementaire: 'RAS 19' }],
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
}

export const kitDocAgent = new KitDocAgent()
