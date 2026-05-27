// lib/rappelEngine.ts
'use client';

import { Ecart } from './store';

export type TypeRappel = 'pac' | 'preuves';
export type CanalRappel = 'email' | 'sms' | 'in_app';
export type NiveauUrgence = 'info' | 'warning' | 'danger';

export interface RappelConfig {
  id: string;
  type: TypeRappel;
  delais_jours: number[];
  relances_apres_echeance: boolean;
  intervalle_relance_jours: number;
  max_relances: number;
  escalade_automatique: boolean;
  escalade_apres_jours: number;
  canaux: CanalRappel[];
}

export interface RappelProgramme {
  id: string;
  ecart_id: string;
  type: TypeRappel;
  date_declenchement: string;
  destinataires: string[];
  message: string;
  niveau_urgence: NiveauUrgence;
  statut: 'programme' | 'envoye' | 'annule';
  tentative: number;
}

export interface RappelManuel {
  id: string;
  ecart_id: string;
  date_envoi: string;
  expediteur_id: string;
  expediteur_nom: string;
  destinataires: string[];
  message: string;
  fichiers: { nom: string; url: string }[];
  canaux: CanalRappel[];
}

// Configuration par défaut
const DEFAULT_CONFIG: RappelConfig[] = [
  {
    id: 'config-pac',
    type: 'pac',
    delais_jours: [7, 3, 1],
    relances_apres_echeance: true,
    intervalle_relance_jours: 7,
    max_relances: 3,
    escalade_automatique: true,
    escalade_apres_jours: 15,
    canaux: ['email', 'sms', 'in_app'],
  },
  {
    id: 'config-preuves',
    type: 'preuves',
    delais_jours: [15, 30, 45],
    relances_apres_echeance: true,
    intervalle_relance_jours: 15,
    max_relances: 3,
    escalade_automatique: true,
    escalade_apres_jours: 30,
    canaux: ['email', 'in_app'],
  },
];

let rappelsProgrammes: RappelProgramme[] = [];
let rappelsManuels: RappelManuel[] = [];
let configs: RappelConfig[] = [...DEFAULT_CONFIG];

/**
 * Programmer les rappels automatiques pour un écart
 */
export function programmerRappelsAutomatiques(
  ecart: Ecart,
  type: TypeRappel,
  date_echeance: Date
): RappelProgramme[] {
  const config = configs.find(c => c.type === type);
  if (!config) return [];

  const nouveauxRappels: RappelProgramme[] = [];

  // Rappels avant échéance
  for (const delai of config.delais_jours) {
    const dateDeclenchement = new Date(date_echeance);
    dateDeclenchement.setDate(dateDeclenchement.getDate() - delai);

    if (dateDeclenchement > new Date()) {
      nouveauxRappels.push({
        id: `rappel-${Date.now()}-${delai}`,
        ecart_id: ecart.id,
        type,
        date_declenchement: dateDeclenchement.toISOString(),
        destinataires: ['exploitant'],
        message: getMessageRappel(type, delai, false),
        niveau_urgence: delai === 1 ? 'danger' : delai === 3 ? 'warning' : 'info',
        statut: 'programme',
        tentative: 0,
      });
    }
  }

  // Rappels après échéance si configuré
  if (config.relances_apres_echeance) {
    for (let i = 1; i <= config.max_relances; i++) {
      const dateDeclenchement = new Date(date_echeance);
      dateDeclenchement.setDate(dateDeclenchement.getDate() + (i * config.intervalle_relance_jours));

      nouveauxRappels.push({
        id: `rappel-${Date.now()}-apres-${i}`,
        ecart_id: ecart.id,
        type,
        date_declenchement: dateDeclenchement.toISOString(),
        destinataires: i >= 2 ? ['dg_operator', 'inspecteur'] : ['exploitant'],
        message: getMessageRappel(type, -i * config.intervalle_relance_jours, true),
        niveau_urgence: i >= 2 ? 'danger' : 'warning',
        statut: 'programme',
        tentative: 0,
      });
    }
  }

  rappelsProgrammes.push(...nouveauxRappels);
  return nouveauxRappels;
}

/**
 * Obtenir le message de rappel
 */
function getMessageRappel(type: TypeRappel, jours: number, estDepasse: boolean): string {
  const absJours = Math.abs(jours);
  const typeLabel = type === 'pac' ? 'Plan d\'Action Correctif' : 'preuves de mise en œuvre';

  if (estDepasse) {
    return `⚠️ URGENT - Le délai de soumission des ${typeLabel} est dépassé depuis ${absJours} jours. Veuillez régulariser votre situation immédiatement.`;
  }

  return `📋 Rappel - Soumission des ${typeLabel} dans ${absJours} jour(s). Merci de respecter le délai imparti.`;
}

/**
 * Enregistrer un rappel manuel
 */
export function enregistrerRappelManuel(
  ecart_id: string,
  expediteur_id: string,
  expediteur_nom: string,
  destinataires: string[],
  message: string,
  fichiers: { nom: string; url: string }[] = [],
  canaux: CanalRappel[] = ['email', 'in_app']
): RappelManuel {
  const rappel: RappelManuel = {
    id: `rappel-manuel-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    ecart_id,
    date_envoi: new Date().toISOString(),
    expediteur_id,
    expediteur_nom,
    destinataires,
    message,
    fichiers,
    canaux,
  };

  rappelsManuels.push(rappel);
  return rappel;
}

/**
 * Récupérer les rappels programmés pour un écart
 */
export function getRappelsProgrammes(ecart_id: string): RappelProgramme[] {
  return rappelsProgrammes.filter(r => r.ecart_id === ecart_id);
}

/**
 * Récupérer les rappels manuels pour un écart
 */
export function getRappelsManuels(ecart_id: string): RappelManuel[] {
  return rappelsManuels.filter(r => r.ecart_id === ecart_id);
}

/**
 * Annuler un rappel programmé
 */
export function annulerRappel(rappelId: string): void {
  rappelsProgrammes = rappelsProgrammes.map(r =>
    r.id === rappelId ? { ...r, statut: 'annule' } : r
  );
}

/**
 * Mettre à jour la configuration des rappels
 */
export function updateRappelConfig(config: RappelConfig): void {
  const index = configs.findIndex(c => c.id === config.id);
  if (index !== -1) {
    configs[index] = config;
  } else {
    configs.push(config);
  }
}

/**
 * Récupérer la configuration
 */
export function getRappelConfig(type: TypeRappel): RappelConfig | undefined {
  return configs.find(c => c.type === type);
}

/**
 * Obtenir tous les rappels (programmés + manuels) pour un écart
 */
export function getAllRappelsForEcart(ecart_id: string): {
  programmes: RappelProgramme[];
  manuels: RappelManuel[];
} {
  return {
    programmes: getRappelsProgrammes(ecart_id),
    manuels: getRappelsManuels(ecart_id),
  };
}

/**
 * Vérifier et déclencher les rappels dont la date est atteinte
 */
export function verifierEtDeclencherRappels(): RappelProgramme[] {
  const maintenant = new Date();
  const aDeclencher = rappelsProgrammes.filter(r =>
    r.statut === 'programme' && new Date(r.date_declenchement) <= maintenant
  );

  for (const rappel of aDeclencher) {
    rappel.statut = 'envoye';
    rappel.tentative++;
  }

  return aDeclencher;
}

/**
 * Exporter les utilitaires
 */
export const rappelEngine = {
  programmerRappelsAutomatiques,
  enregistrerRappelManuel,
  getRappelsProgrammes,
  getRappelsManuels,
  annulerRappel,
  updateRappelConfig,
  getRappelConfig,
  getAllRappelsForEcart,
  verifierEtDeclencherRappels,
  DEFAULT_CONFIG,
};