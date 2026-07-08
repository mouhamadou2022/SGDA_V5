// lib/chargeUtils.ts
// Utilitaires pour le calcul de la charge de travail des inspecteurs

import { Surveillance, Ecart, EvenementSecurite, Dossier, Formation } from './store';

export interface Tache {
  id: string;
  type: 'surveillance' | 'ecart' | 'evenement' | 'dossier' | 'formation';
  titre: string;
  description: string;
  priorite: 'basse' | 'moyenne' | 'haute' | 'critique';
  statut: 'a_faire' | 'en_cours' | 'termine' | 'en_retard';
  date_echeance: string;
  date_debut?: string;
  temps_estime: number; // en heures
  temps_passe?: number; // en heures
  progression: number; // 0-100
  aerodrome_id?: string;
  lien_id: string;
}

export interface ChargeInspecteur {
  inspecteur_id: string;
  inspecteur_nom: string;
  total_taches: number;
  taches_par_statut: {
    a_faire: number;
    en_cours: number;
    termine: number;
    en_retard: number;
  };
  taches_par_priorite: {
    basse: number;
    moyenne: number;
    haute: number;
    critique: number;
  };
  temps_total_estime: number; // heures
  temps_total_passe: number; // heures
  progression_globale: number; // %
  charge: number; // % du temps disponible
  jours_disponibles: number;
  taches: Tache[];
}

export const chargeUtils = {
  /**
   * Calcule le temps disponible pour un inspecteur sur une période
   */
  calculerTempsDisponible(joursPeriode: number = 30, heuresParJour: number = 7): number {
    // 7h par jour ouvré (lundi-vendredi)
    const joursOuvres = Math.floor(joursPeriode * 5 / 7);
    return joursOuvres * heuresParJour;
  },

  /**
   * Convertit une surveillance en tâche
   */
  surveillanceVersTache(surveillance: Surveillance, aerodromes: any[]): Tache {
    const aerodrome = aerodromes.find(a => a.id === surveillance.aerodrome_id);
    const maintenant = new Date();
    const dateDebut = new Date(surveillance.date_debut);
    const estEnRetard = (surveillance.statut !== 'transmise' && surveillance.statut !== 'archivee' && dateDebut < maintenant);

    let priorite: 'basse' | 'moyenne' | 'haute' | 'critique' = 'moyenne';
    if (surveillance.type === 'urgence') priorite = 'critique';
    else if (surveillance.type === 'inopinee') priorite = 'haute';

    return {
      id: `surv-${surveillance.id}`,
      type: 'surveillance',
      titre: `${surveillance.type} - ${aerodrome?.code_oaci || 'Inconnu'}`,
      description: surveillance.observations || 'Surveillance programmée',
      priorite,
      statut: estEnRetard ? 'en_retard' :
              (surveillance.statut === 'transmise' || surveillance.statut === 'archivee') ? 'termine' :
              surveillance.statut === 'en_cours' ? 'en_cours' : 'a_faire',
      date_echeance: surveillance.date_fin,
      date_debut: surveillance.date_debut,
      temps_estime: 8, // 8h par défaut pour une surveillance
      temps_passe: 0,
      progression: surveillance.progression || 0,
      aerodrome_id: surveillance.aerodrome_id,
      lien_id: surveillance.id,
    };
  },

  /**
   * Convertit un écart en tâche
   */
  ecartVersTache(ecart: Ecart, aerodromes: any[]): Tache {
    const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id);
    const maintenant = new Date();
    const dateEcheance = new Date(ecart.delai_regularisation);
    const estEnRetard = ecart.statut === 'en_retard' || 
      (ecart.statut !== 'cloture' && dateEcheance < maintenant);

    const prioriteMap: Record<string, 'basse' | 'moyenne' | 'haute' | 'critique'> = {
      'critique': 'critique',
      'eleve': 'haute',
      'moyen': 'moyenne',
      'faible': 'basse'
    };

    const tempsEstimeMap: Record<string, number> = {
      'critique': 4,
      'eleve': 3,
      'moyen': 2,
      'faible': 1
    };

    let progression = 0;
    if (ecart.statut === 'cloture') progression = 100;
    else if (ecart.statut === 'preuves_evaluees') progression = 90;
    else if (ecart.statut === 'preuves_soumises') progression = 80;
    else if (ecart.statut === 'pac_accepte') progression = 60;
    else if (ecart.statut === 'pac_soumis') progression = 40;
    else if (ecart.statut === 'pac_attendu') progression = 20;
    else progression = 10;

    return {
      id: `ecart-${ecart.id}`,
      type: 'ecart',
      titre: `Écart ${ecart.reference} - ${aerodrome?.code_oaci || 'Inconnu'}`,
      description: ecart.libelle,
      priorite: prioriteMap[ecart.niveau_risque] || 'moyenne',
      statut: estEnRetard ? 'en_retard' : 
              ecart.statut === 'cloture' ? 'termine' :
              ecart.statut === 'preuves_evaluees' || ecart.statut === 'preuves_soumises' ? 'en_cours' : 'a_faire',
      date_echeance: ecart.delai_regularisation,
      date_debut: ecart.created_at,
      temps_estime: tempsEstimeMap[ecart.niveau_risque] || 2,
      temps_passe: 0,
      progression,
      aerodrome_id: ecart.aerodrome_id,
      lien_id: ecart.id,
    };
  },

  /**
   * Convertit un événement en tâche
   */
  evenementVersTache(evenement: EvenementSecurite, aerodromes: any[]): Tache {
    const aerodrome = aerodromes.find(a => a.id === evenement.aerodrome_id);
    const maintenant = new Date();
    const dateEcheance = new Date(evenement.date);
    dateEcheance.setDate(dateEcheance.getDate() + 7); // Délai de traitement: 7j
    const estEnRetard = evenement.statut !== 'cloture' && dateEcheance < maintenant;

    let priorite: 'basse' | 'moyenne' | 'haute' | 'critique' = 'moyenne';
    if (evenement.gravite === 'CRITIQUE') priorite = 'critique';
    else if (evenement.gravite === 'ORANGE') priorite = 'haute';

    let progression = 0;
    if (evenement.statut === 'cloture') progression = 100;
    else if (evenement.statut === 'rapport_redige') progression = 80;
    else if (evenement.statut === 'ecart_cree') progression = 60;
    else if (evenement.statut === 'analyse') progression = 40;
    else if (evenement.statut === 'en_cours') progression = 20;
    else progression = 10;

    return {
      id: `evt-${evenement.id}`,
      type: 'evenement',
      titre: `${evenement.type} - ${aerodrome?.code_oaci || 'Inconnu'}`,
      description: evenement.description,
      priorite,
      statut: estEnRetard ? 'en_retard' : 
              evenement.statut === 'cloture' ? 'termine' : 'en_cours',
      date_echeance: dateEcheance.toISOString(),
      date_debut: evenement.date,
      temps_estime: evenement.gravite === 'CRITIQUE' ? 8 : 4,
      temps_passe: 0,
      progression,
      aerodrome_id: evenement.aerodrome_id,
      lien_id: evenement.id,
    };
  },

  /**
   * Convertit un dossier en tâche
   */
  dossierVersTache(dossier: Dossier, aerodromes: any[]): Tache {
    const aerodrome = aerodromes.find(a => a.id === dossier.aerodrome_id);
    const maintenant = new Date();
    const dateEcheance = new Date(dossier.date_limite);
    const estEnRetard = dossier.statut !== 'termine' && dateEcheance < maintenant;

    const prioriteMap: Record<string, 'basse' | 'moyenne' | 'haute' | 'critique'> = {
      'reglementaire': 'haute',
      'technique': 'moyenne',
      'operationnel': 'moyenne',
      'surveillance': 'haute',
      'formation': 'basse',
      'financier': 'moyenne'
    };

    return {
      id: `dossier-${dossier.id}`,
      type: 'dossier',
      titre: `Dossier ${dossier.reference} - ${aerodrome?.code_oaci || 'Général'}`,
      description: dossier.titre,
      priorite: prioriteMap[dossier.categorie] || 'moyenne',
      statut: estEnRetard ? 'en_retard' : 
              dossier.statut === 'termine' ? 'termine' :
              dossier.statut === 'en_cours' ? 'en_cours' : 'a_faire',
      date_echeance: dossier.date_limite,
      date_debut: dossier.date_instruction,
      temps_estime: 3,
      temps_passe: 0,
      progression: dossier.progression,
      aerodrome_id: dossier.aerodrome_id,
      lien_id: dossier.id,
    };
  },

  /**
   * Convertit un écart en tâche d'évaluation PAC (pour l'inspecteur)
   */
  ecartVersTacheEvaluationPAC(ecart: Ecart, aerodromes: any[]): Tache | null {
    if (ecart.statut !== 'pac_soumis' || !ecart.evaluation_pac?.deadline) return null
    const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id)
    const maintenant = new Date()
    const deadline = new Date(ecart.evaluation_pac.deadline)
    const estEnRetard = ecart.retard_inspecteur || deadline < maintenant
    const prioriteMap: Record<string, 'basse' | 'moyenne' | 'haute' | 'critique'> = {
      'critique': 'critique', 'eleve': 'haute', 'moyen': 'moyenne', 'faible': 'basse'
    }
    return {
      id: `eval-pac-${ecart.id}`,
      type: 'ecart',
      titre: `Évaluer PAC — ${ecart.reference}`,
      description: ecart.libelle,
      priorite: prioriteMap[ecart.niveau_risque] || 'moyenne',
      statut: estEnRetard ? 'en_retard' : 'en_cours',
      date_echeance: ecart.evaluation_pac.deadline,
      date_debut: ecart.pac?.soumis_le || ecart.created_at,
      temps_estime: 1,
      progression: 0,
      aerodrome_id: ecart.aerodrome_id,
      lien_id: ecart.id,
    }
  },

  /**
   * Convertit un écart en tâche de validation preuves (pour l'inspecteur)
   */
  ecartVersTacheValidationPreuves(ecart: Ecart, aerodromes: any[]): Tache | null {
    if (ecart.statut !== 'preuves_soumises' || !ecart.validation_preuves?.deadline) return null
    const aerodrome = aerodromes.find(a => a.id === ecart.aerodrome_id)
    const maintenant = new Date()
    const deadline = new Date(ecart.validation_preuves.deadline)
    const estEnRetard = ecart.retard_inspecteur || deadline < maintenant
    const prioriteMap: Record<string, 'basse' | 'moyenne' | 'haute' | 'critique'> = {
      'critique': 'critique', 'eleve': 'haute', 'moyen': 'moyenne', 'faible': 'basse'
    }
    return {
      id: `val-preuves-${ecart.id}`,
      type: 'ecart',
      titre: `Valider preuves — ${ecart.reference}`,
      description: ecart.libelle,
      priorite: prioriteMap[ecart.niveau_risque] || 'moyenne',
      statut: estEnRetard ? 'en_retard' : 'en_cours',
      date_echeance: ecart.validation_preuves.deadline,
      date_debut: ecart.preuves?.soumis_le || ecart.created_at,
      temps_estime: 1,
      progression: 0,
      aerodrome_id: ecart.aerodrome_id,
      lien_id: ecart.id,
    }
  },

  /**
   * Calcule la charge de travail pour un inspecteur
   */
  calculerChargeInspecteur(
    inspecteurId: string,
    inspecteurNom: string,
    taches: Tache[],
    joursPeriode: number = 30
  ): ChargeInspecteur {
    const tempsDisponible = this.calculerTempsDisponible(joursPeriode);
    const tempsEstimeTotal = taches.reduce((acc, t) => acc + (t.temps_estime || 0), 0);
    
    const charge = Math.min(100, Math.round((tempsEstimeTotal / tempsDisponible) * 100));

    const tachesParStatut = {
      a_faire: taches.filter(t => t.statut === 'a_faire').length,
      en_cours: taches.filter(t => t.statut === 'en_cours').length,
      termine: taches.filter(t => t.statut === 'termine').length,
      en_retard: taches.filter(t => t.statut === 'en_retard').length,
    };

    const tachesParPriorite = {
      basse: taches.filter(t => t.priorite === 'basse').length,
      moyenne: taches.filter(t => t.priorite === 'moyenne').length,
      haute: taches.filter(t => t.priorite === 'haute').length,
      critique: taches.filter(t => t.priorite === 'critique').length,
    };

    const tachesTerminees = taches.filter(t => t.statut === 'termine').length;
    const progressionGlobale = taches.length > 0
      ? Math.round((tachesTerminees / taches.length) * 100)
      : 0;

    return {
      inspecteur_id: inspecteurId,
      inspecteur_nom: inspecteurNom,
      total_taches: taches.length,
      taches_par_statut: tachesParStatut,
      taches_par_priorite: tachesParPriorite,
      temps_total_estime: tempsEstimeTotal,
      temps_total_passe: 0,
      progression_globale: progressionGlobale,
      charge,
      jours_disponibles: joursPeriode,
      taches,
    };
  },

  /**
   * Filtre les tâches par période
   */
  filtrerParPeriode(taches: Tache[], debut: Date, fin: Date): Tache[] {
    return taches.filter(t => {
      const dateEcheance = new Date(t.date_echeance);
      return dateEcheance >= debut && dateEcheance <= fin;
    });
  },

  /**
   * Calcule les statistiques globales
   */
  calculerStatistiquesGlobales(charges: ChargeInspecteur[]): {
    total_taches: number;
    total_en_retard: number;
    charge_moyenne: number;
    progression_moyenne: number;
  } {
    const total_taches = charges.reduce((acc, c) => acc + c.total_taches, 0);
    const total_en_retard = charges.reduce((acc, c) => acc + c.taches_par_statut.en_retard, 0);
    const charge_moyenne = charges.length > 0
      ? Math.round(charges.reduce((acc, c) => acc + c.charge, 0) / charges.length)
      : 0;
    const progression_moyenne = charges.length > 0
      ? Math.round(charges.reduce((acc, c) => acc + c.progression_globale, 0) / charges.length)
      : 0;

    return {
      total_taches,
      total_en_retard,
      charge_moyenne,
      progression_moyenne,
    };
  },

  /**
   * Obtient la variante de badge pour la jauge de charge
   */
  getChargeVariant(charge: number): 'danger' | 'warning' | 'primary' | 'success' {
    if (charge >= 90) return 'danger';
    if (charge >= 70) return 'warning';
    if (charge >= 50) return 'primary';
    return 'success';
  },

  /**
   * Formate le temps en heures
   */
  formatTemps(heures: number): string {
    if (!heures || isNaN(heures)) return '0h';
    const h = Math.floor(heures);
    const min = Math.round((heures - h) * 60);
    if (min === 0) return `${h}h`;
    return `${h}h${min}`;
  },
};