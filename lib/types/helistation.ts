// lib/types/helistation.ts
// Types spécifiques aux héliplates-formes et hélistations
// Basé sur RAS 14 Partie II / Doc OACI 9261 et le modèle ANACIM
//
// ── Intégration dans store.ts ────────────────────────────────────────────────
// 1. Importer ce fichier en haut de lib/store.ts :
//      import type { HelistationData } from './types/helistation'
//
// 2. Ajouter le champ optionnel dans l'interface Aerodrome (ligne ~130) :
//      helistation?: HelistationData
//
// C'est tout — aucune autre modification du store n'est nécessaire.
// ────────────────────────────────────────────────────────────────────────────

export type MoyenCom = 'VHF' | 'UHF' | 'HF' | 'SATCOM'

export type TypeInstallation =
  | 'plateforme_autoelevee'    // Plate-forme auto-élévatrice (jack-up)
  | 'plateforme_fixe'          // Plate-forme fixe en mer
  | 'plateforme_flottante'     // FPSO, semi-submersible
  | 'terrestre'                // Hélistation terrestre (hôpital, immeuble…)
  | 'navire'                   // Navire (cargo, tanker)
  | 'autre'

export const TYPE_INSTALLATION_LABELS: Record<TypeInstallation, string> = {
  plateforme_autoelevee: 'Plate-forme auto-élévatrice (jack-up)',
  plateforme_fixe:       'Plate-forme fixe en mer',
  plateforme_flottante:  'Plate-forme flottante (FPSO/semi-sub)',
  terrestre:             'Hélistation terrestre',
  navire:                'Navire',
  autre:                 'Autre',
}

export const MOYEN_COM_LABELS: Record<MoyenCom, string> = {
  VHF:    'VHF (Very High Frequency)',
  UHF:    'UHF (Ultra High Frequency)',
  HF:     'HF (High Frequency)',
  SATCOM: 'SATCOM (Satellite)',
}

/**
 * Données techniques spécifiques à une hélistation / héliplate-forme.
 * Correspond aux exigences RAS 14 Partie II, Doc OACI 9261 et
 * au modèle de formulaire ANACIM (Sénégal).
 */
export interface HelistationData {
  // ── Identification ──────────────────────────────────────────────────────
  /** Indicatif d'appel radiotelephonique (ex: "HUB RADIO") */
  indicatif_rt?: string

  /** Identification officielle de la plate-forme (ex: "GTA HUB") */
  identification?: string

  /** Marque distinctive latérale visible depuis l'air (ex: "GTA HUB") */
  marque_distinctive?: string

  /** Type d'installation ou de navire */
  type_installation?: TypeInstallation

  // ── Caractéristiques physiques ───────────────────────────────────────────
  /** Valeur D = diamètre de l'aéronef le plus grand admis (mètres) */
  valeur_d?: number

  /** Altitude de la plate-forme au-dessus du niveau de la mer (pieds) */
  altitude_ft?: number

  /** Hauteur maximale de la plate-forme (pieds) */
  hauteur_maximale_ft?: number

  /** Hauteur de l'obstacle le plus élevé sur la plate-forme (pieds) */
  hauteur_obstacle_ft?: number

  /** Cap magnétique de l'hélistation / FATO (degrés, 0-360) */
  cap?: number

  /** Masse maximale au décollage de l'aéronef admis (tonnes) */
  mtom?: number

  // ── Communications ───────────────────────────────────────────────────────
  /** Moyen de communication principal */
  moyen_com?: MoyenCom

  /** Fréquence COM principale (ex: "133.4") */
  frequence_com?: string

  // ── Équipements & services ───────────────────────────────────────────────
  /** Avitaillement en carburant disponible */
  avitaillement?: boolean

  /** Groupe de Puissance au Sol (GPU) disponible */
  gpu?: boolean

  /** Description des équipements de lutte contre l'incendie (ex: "3% AFFF + DIFFS") */
  equipement_incendie?: string

  // ── Administrative ───────────────────────────────────────────────────────
  /** Date de la dernière révision de la fiche (ISO 8601) */
  date_revision?: string
}
