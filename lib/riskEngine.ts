// lib/riskEngine.ts
// Moteur de risque avancé pour la surveillance continue
// Version enrichie avec gestion des types périodique/inopiné/maintien
// Intègre le ML agent pour les prédictions de type de surveillance

import { ProfilRisque, Ecart, SuggestionFeedback } from './store';
import { RISK_LEVELS, getRiskLevel, computeVelocityMetrics } from './risque';
import { TypeSurveillanceContinue, DomaineCode, TypeChecklist, SuggestionMaintien, genererSuggestionsMaintien, getDomainesIndividuelsCodes } from './domaines';
import { suggestionMLAgent, type SurveillanceType, type EnsemblePrediction } from '@/lib/ia/agents/suggestionMLAgent';

// ============================================================
// TYPES EXISTANTS (conservés)
// ============================================================

export interface DecisionChecklist {
  type: 'standard' | 'suivi_ecarts' | 'pac' | 'mixte' | 'audit_complet' | 'programmee';
  raison: string;
  priorite: 'basse' | 'moyenne' | 'haute' | 'critique';
  delaiRecommandation: number; // en jours
  domainesCibles: DomaineCode[];
  typesChecklist: TypeChecklist[];
}

export interface DomainDegradation {
  domaine: string;
  degradation: number; // points perdus
  niveauOriginal: number;
  niveauActuel: number;
}

export interface EcartUrgent {
  id: string;
  reference: string;
  niveau: string;
  joursRestants: number;
  actionRequise: string;
  domaine?: string;
}

export interface EcartTrigger {
  ecart: Ecart;
  urgence: 'critique' | 'haute' | 'moyenne' | 'basse';
  celluleOACI: string;
  delaiDepasse: boolean;
  joursRetard: number;
  joursAvantEcheance: number;
  typeSurveillanceSuggere: 'mise_oeuvre_pac' | 'suivi_ecarts' | 'audit_complet';
  justification: string;
  badgeLabel: string;
  predictionResultat: 'SA' | 'NS' | 'NV';
  predictionConfiance: number;
  mlPrediction?: EnsemblePrediction;
}

// ============================================================
// NOUVEAUX TYPES POUR EXEMPTIONS ET MESURES (AJOUT)
// ============================================================

export interface MesureAtténuationAlerte {
  mesureId: string;
  exemptionId: string;
  exemptionReference: string;
  description: string;
  responsable: string;
  dateFinPrevue: string;
  joursRetard: number;
  priorite: 'haute' | 'moyenne' | 'basse';
}

export interface ExemptionActive {
  id: string;
  reference: string;
  aerodromeId: string;
  domainesConcerne: string[];
  dateDebut: string;
  dateFinPrevue: string;
  dureeMois: number;
  statut: 'active' | 'expiree' | 'revoquee';
  mesures: Array<{
    id: string;
    statut: string;
    dateFinPrevue: string;
    efficaciteValidee?: number;
  }>;
}

export interface InspectionRecommandation {
  doitDeclencher: boolean;
  type: 'mise_oeuvre_pac' | 'suivi_ecarts' | 'audit_complet';
  exemptionId?: string;
  mesureId?: string;
  message: string;
  priorite: 'haute' | 'moyenne' | 'basse';
  delaiSuggererJours: number;
}

// ============================================================
// FONCTIONS EXISTANTES (conservées)
// ============================================================

export function detectUrgentEcards(ecarts: Ecart[], profil: ProfilRisque): EcartUrgent[] {
  const maintenant = new Date();
  
  return ecarts
    .filter(ecart => {
      if (ecart.statut === 'cloture') return false;
      const delai = new Date(ecart.delai_regularisation);
      const joursRestants = Math.ceil((delai.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24));
      return joursRestants <= 7 || ecart.niveau_risque === 'critique';
    })
    .map(ecart => {
      const delai = new Date(ecart.delai_regularisation);
      const joursRestants = Math.ceil((delai.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24));
      let actionRequise = 'À traiter';
      if (joursRestants <= 0) actionRequise = 'DÉPASSÉ - Action immédiate';
      else if (joursRestants <= 3) actionRequise = 'URGENT - Action dans 48h';
      else if (joursRestants <= 7) actionRequise = 'À traiter sous 7 jours';
      
      return {
        id: ecart.id,
        reference: ecart.reference,
        niveau: ecart.niveau_risque,
        joursRestants,
        actionRequise,
      };
    })
    .sort((a, b) => a.joursRestants - b.joursRestants);
}

export function detectDomainDegradations(
  profilActuel: ProfilRisque,
  profilPrecedent?: ProfilRisque
): DomainDegradation[] {
  if (!profilPrecedent) return [];
  
  const degradations: DomainDegradation[] = [];
  const domaines = [
    { key: 'c1', nom: 'SGS' },
    { key: 'c2', nom: 'PAC' },
    { key: 'c3', nom: 'Conformité technique' },
    { key: 'c4', nom: 'Charge critique' },
    { key: 'c5', nom: 'Résilience' },
  ];
  
  for (const domaine of domaines) {
    const ancien = profilPrecedent[domaine.key as keyof ProfilRisque] as number;
    const nouveau = profilActuel[domaine.key as keyof ProfilRisque] as number;
    const degradation = ancien - nouveau;
    
    if (degradation > 5) {
      degradations.push({
        domaine: domaine.nom,
        degradation,
        niveauOriginal: ancien,
        niveauActuel: nouveau,
      });
    }
  }
  
  return degradations.sort((a, b) => b.degradation - a.degradation);
}

// Décision de surveillance continue
export interface DecisionSurveillanceContinue {
  type: TypeSurveillanceContinue;
  raison: string;
  priorite: 'basse' | 'moyenne' | 'haute' | 'critique';
  delaiRecommandation: number;
  domainesCibles: DomaineCode[];
  typesChecklist: TypeChecklist[];
  suggestionsMaintien?: SuggestionMaintien[];
}

export function determineTypeSurveillanceContinue(
  profil: ProfilRisque,
  urgents: EcartUrgent[],
  degradations: DomainDegradation[],
  ecartsActifs?: Ecart[],
  evenementsSecurite?: Array<{ domaine: string; type: string; gravite: string }>,
  domainesDerniereInspection?: Record<string, string>,
  alertesLanceurs?: Array<{ domaine: string; description: string }>,
  statut_sgs?: 'complet' | 'simplifie' | 'non_applicable',
): DecisionSurveillanceContinue {
  const infra = profil.infrastructure
  const isHelistation = infra?.type_entite === 'helistation'
  const isJourOnly = infra?.horaires === 'jour'
  const aDesUrgents = urgents.some(u => u.joursRestants <= 3);
  const aDesCritiques = urgents.some(u => u.niveau === 'critique');
  const degradationsSeveres = degradations.filter(d => d.degradation > 15);

  // Ajustement des domaines cibles selon type d'entité et infrastructure
  const domainesApplicables = (): DomaineCode[] => {
    const tous = getDomainesIndividuelsCodes()
    if (isHelistation) {
      // Hélistation : retirer les domaines purement aérodrome
      return tous.filter(d => d !== 'MFP') // pas de marquage piste
    }
    if (isJourOnly) {
      // Jour seulement : ELEC et MFP partiellement applicables
      return tous // garder tous les domaines mais avec items filtrés
    }
    return tous
  }

  // Ajustement du délai recommandé selon l'infrastructure
  const ajusterDelai = (base: number): number => {
    if (isHelistation) return Math.max(14, base - 15) // hélistation → délai réduit (moins de domaines)
    if (isJourOnly && base > 30) return base - 10 // jour → léger bonus
    return base
  }

  // Ajustement des types de checklist selon l'infrastructure
  const ajusterChecklists = (types: TypeChecklist[]): TypeChecklist[] => {
    if (isHelistation && types.includes('standard') && types.length === 1) {
      // Hélistation : checklist standard suffit (moins d'items)
      return types
    }
    return types
  }

  // Cas 1 : Score critique → maintien complet
  if (profil.score_global < 30) {
    return {
      type: 'maintien',
      raison: `Score critique (${profil.score_global}/100) — vérification complète requise`,
      priorite: 'critique',
      delaiRecommandation: ajusterDelai(7),
      domainesCibles: domainesApplicables(),
      typesChecklist: ajusterChecklists(['standard', 'suivi_ecarts', 'pac']),
      suggestionsMaintien: genererSuggestionsMaintien({ ecartsActifs, evenementsSecurite, profilRisque: profil, domainesDerniereInspection, alertesLanceurs }),
    };
  }

  // Cas 2 : Écarts urgents/critiques → maintien ciblé
  if (aDesUrgents || aDesCritiques) {
    const domainesEcarts = urgents
      .filter(u => u.joursRestants <= 3 || u.niveau === 'critique')
      .map(u => u.domaine)
      .filter((d): d is DomaineCode => getDomainesIndividuelsCodes().includes(d as DomaineCode));

    return {
      type: 'maintien',
      raison: aDesUrgents
        ? `${urgents.filter(u => u.joursRestants <= 3).length} écart(s) urgent(s) à traiter`
        : `${urgents.length} écart(s) critique(s) actif(s)`,
      priorite: 'haute',
      delaiRecommandation: ajusterDelai(14),
      domainesCibles: [...new Set(domainesEcarts)],
      typesChecklist: ajusterChecklists(['suivi_ecarts', ...(ecartsActifs?.some(e => e.pac) ? ['pac'] as const : [])]),
      suggestionsMaintien: genererSuggestionsMaintien({ ecartsActifs, evenementsSecurite, profilRisque: profil, domainesDerniereInspection, alertesLanceurs }),
    };
  }

  // Cas 3 : Dégradations sévères → maintien sur domaines dégradés
  if (degradationsSeveres.length > 0) {
    const domainesDeg: DomaineCode[] = [];
    degradationsSeveres.forEach(d => {
      if (d.domaine === 'SGS') domainesDeg.push('SGS');
      if (d.domaine === 'Conformité technique') domainesDeg.push('PHY', 'OLS', 'ELEC', 'MFP');
      if (d.domaine === 'Résilience') domainesDeg.push('SLI', 'RA');
    });

    return {
      type: 'maintien',
      raison: `Dégradation sévère détectée sur ${degradationsSeveres.map(d => d.domaine).join(', ')}`,
      priorite: 'haute',
      delaiRecommandation: ajusterDelai(30),
      domainesCibles: [...new Set(domainesDeg)],
      typesChecklist: ajusterChecklists(['standard', 'suivi_ecarts']),
      suggestionsMaintien: genererSuggestionsMaintien({ ecartsActifs, evenementsSecurite, profilRisque: profil, domainesDerniereInspection, alertesLanceurs }),
    };
  }

  // Cas 4 : SGS faible ou absent → maintien renforcé tous domaines
  if (profil.c1 < 30) {
    return {
      type: 'maintien',
      raison: `SGS critique (C1=${profil.c1}/100) — surveillance renforcée tous domaines`,
      priorite: 'haute',
      delaiRecommandation: ajusterDelai(30),
      domainesCibles: domainesApplicables(),
      typesChecklist: ajusterChecklists(['standard', 'suivi_ecarts', 'pac']),
      suggestionsMaintien: genererSuggestionsMaintien({ ecartsActifs, evenementsSecurite, profilRisque: profil, domainesDerniereInspection, alertesLanceurs }),
    };
  }

  // Cas 5 : Score faible + tendance baisse → périodique renforcé
  if (profil.score_global < 50 && profil.tendance === 'baisse') {
    return {
      type: 'periodique',
      raison: `Score faible (${profil.score_global}/100) avec tendance baissière`,
      priorite: 'haute',
      delaiRecommandation: ajusterDelai(45),
      domainesCibles: domainesApplicables(),
      typesChecklist: ajusterChecklists(['standard']),
      suggestionsMaintien: genererSuggestionsMaintien({ ecartsActifs, evenementsSecurite, profilRisque: profil, domainesDerniereInspection, alertesLanceurs }),
    };
  }

  // Cas 6 : Charge critique élevée → inopiné recommandé
  if (profil.c4 < 40) {
    return {
      type: 'inopine',
      raison: `Charge critique élevée (C4=${profil.c4}/100) — inspection inopinée recommandée`,
      priorite: 'moyenne',
      delaiRecommandation: ajusterDelai(60),
      domainesCibles: isHelistation ? ['SGS', 'OPS'] as DomaineCode[] : ['SGS', 'OPS'],
      typesChecklist: ajusterChecklists(['standard']),
      suggestionsMaintien: genererSuggestionsMaintien({ ecartsActifs, evenementsSecurite, profilRisque: profil, domainesDerniereInspection, alertesLanceurs }),
    };
  }

  // Cas par défaut : périodique de routine
  return {
    type: 'periodique',
    raison: 'Surveillance périodique de routine',
    priorite: 'moyenne',
    delaiRecommandation: ajusterDelai(90),
    domainesCibles: domainesApplicables(),
    typesChecklist: ajusterChecklists(['standard']),
    suggestionsMaintien: genererSuggestionsMaintien({ ecartsActifs, evenementsSecurite, profilRisque: profil, domainesDerniereInspection, alertesLanceurs }),
  };
}

// Compatibilité : wrapper vers la nouvelle fonction
export function determineChecklistType(
  profil: ProfilRisque,
  urgents: EcartUrgent[],
  degradations: DomainDegradation[],
  typePlanning: string
): DecisionChecklist {
  const decision = determineTypeSurveillanceContinue(profil, urgents, degradations);
  return {
    type: decision.type === 'periodique' ? 'standard' : decision.type === 'inopine' ? 'standard' : 'mixte',
    raison: decision.raison,
    priorite: decision.priorite,
    delaiRecommandation: decision.delaiRecommandation,
    domainesCibles: decision.domainesCibles,
    typesChecklist: decision.typesChecklist,
  };
}

export function needsFullDomainAudit(
  profil: ProfilRisque,
  degradations: DomainDegradation[],
  nbEcartsCritiques: number
): { necessaire: boolean; domaine: string; raison: string } {
  if (profil.score_global < 30) {
    return { necessaire: true, domaine: 'global', raison: 'Score critique - audit complet requis' };
  }
  
  if (nbEcartsCritiques > 2) {
    return { necessaire: true, domaine: 'Écarts', raison: `${nbEcartsCritiques} écarts critiques actifs` };
  }
  
  const degradationMax = degradations[0];
  if (degradationMax && degradationMax.degradation > 20) {
    return { 
      necessaire: true, 
      domaine: degradationMax.domaine, 
      raison: `Dégradation de ${degradationMax.degradation} points sur ${degradationMax.domaine}` 
    };
  }
  
  return { necessaire: false, domaine: '', raison: '' };
}

export function calculateGlobalPriority(profil: ProfilRisque): 'critique' | 'haute' | 'moyenne' | 'basse' {
  if (profil.score_global < 30) return 'critique';
  if (profil.score_global < 50) return 'haute';
  if (profil.score_global < 70) return 'moyenne';
  return 'basse';
}

export function calculateRecommendedDelay(profil: ProfilRisque, type: 'programmee' | 'suivi_ecarts' | 'mise_oeuvre_pac' | 'audit_complet'): number {
  if (type === 'audit_complet') return 7;
  if (type === 'suivi_ecarts') return 14;
  if (type === 'mise_oeuvre_pac') return 30;
  
  if (profil.score_global < 30) return 7;
  if (profil.score_global < 50) return 45;
  if (profil.score_global < 70) return 90;
  return 180;
}

// ============================================================
// NOUVELLES FONCTIONS POUR EXEMPTIONS (AJOUT)
// ============================================================

/**
 * Détecte les mesures d'atténuation en retard
 */
export function detecterMesuresEnRetard(
  exemptions: ExemptionActive[]
): MesureAtténuationAlerte[] {
  const maintenant = new Date();
  const alertes: MesureAtténuationAlerte[] = [];
  
  for (const exemption of exemptions) {
    for (const mesure of exemption.mesures) {
      if (mesure.statut === 'en_retard' || mesure.statut === 'a_venir') {
        const dateFin = new Date(mesure.dateFinPrevue);
        const joursRetard = Math.ceil((maintenant.getTime() - dateFin.getTime()) / (1000 * 60 * 60 * 24));
        
        if (joursRetard > 0) {
          let priorite: 'haute' | 'moyenne' | 'basse' = 'moyenne';
          if (joursRetard > 30) priorite = 'haute';
          else if (joursRetard > 15) priorite = 'moyenne';
          else priorite = 'basse';
          
          alertes.push({
            mesureId: mesure.id,
            exemptionId: exemption.id,
            exemptionReference: exemption.reference,
            description: `Mesure d'atténuation en retard de ${joursRetard} jours`,
            responsable: 'À vérifier',
            dateFinPrevue: mesure.dateFinPrevue,
            joursRetard,
            priorite,
          });
        }
      }
    }
  }
  
  return alertes.sort((a, b) => b.joursRetard - a.joursRetard);
}

/**
 * Vérifie si des inspections doivent être déclenchées à cause des mesures en retard
 */
export function verifierInspectionsPourExemptions(
  exemptions: ExemptionActive[],
  surveillancesExistantes: Array<{ type: string; objectifs?: string; statut: string; date_debut: string }>
): InspectionRecommandation[] {
  const recommandations: InspectionRecommandation[] = [];
  const maintenant = new Date();
  
  for (const exemption of exemptions) {
    for (const mesure of exemption.mesures) {
      if (mesure.statut === 'en_retard') {
        const dateFin = new Date(mesure.dateFinPrevue);
        const joursRetard = Math.ceil((maintenant.getTime() - dateFin.getTime()) / (1000 * 60 * 60 * 24));
        
        // Vérifier si une inspection est déjà programmée pour cette mesure
        const inspectionExistante = surveillancesExistantes.some(s => 
          (s.type === 'mise_oeuvre_pac' || s.type === 'suivi_ecarts') &&
          s.objectifs?.includes(mesure.id) &&
          s.statut !== 'terminee'
        );
        
        if (!inspectionExistante && joursRetard > 0) {
          let priorite: 'haute' | 'moyenne' | 'basse' = 'moyenne';
          let delaiSuggererJours = 30;
          
          if (joursRetard > 30) {
            priorite = 'haute';
            delaiSuggererJours = 7;
          } else if (joursRetard > 15) {
            priorite = 'haute';
            delaiSuggererJours = 14;
          } else {
            priorite = 'moyenne';
            delaiSuggererJours = 30;
          }
          
          recommandations.push({
            doitDeclencher: true,
            type: 'mise_oeuvre_pac',
            exemptionId: exemption.id,
            mesureId: mesure.id,
            message: `Mesure d'atténuation en retard pour l'exemption ${exemption.reference} (${joursRetard} jours)`,
            priorite,
            delaiSuggererJours,
          });
        }
      }
    }
  }
  
  return recommandations;
}

/**
 * Calcule l'impact des exemptions sur le score C3
 */
export function calculerImpactExemptionsSurC3(
  c3Brut: number,
  exemptions: ExemptionActive[]
): { c3Ajuste: number; bonusTotal: number; malusTotal: number; details: { exemptionId: string; bonus: number; malus: number }[] } {
  let bonusTotal = 0;
  let malusTotal = 0;
  const details: { exemptionId: string; bonus: number; malus: number }[] = [];
  
  for (const exemption of exemptions) {
    // Bonus selon nombre de domaines concernés (max 20 pts)
    const bonus = Math.min(20, exemption.domainesConcerne.length * 5);
    
    // Malus selon mesures en retard (max 15 pts)
    const mesuresEnRetard = exemption.mesures.filter(m => m.statut === 'en_retard').length;
    const malus = Math.min(15, mesuresEnRetard * 5);
    
    bonusTotal += bonus;
    malusTotal += malus;
    
    details.push({
      exemptionId: exemption.id,
      bonus,
      malus,
    });
  }
  
  const c3Ajuste = Math.min(100, Math.max(0, c3Brut + bonusTotal - malusTotal));
  
  return {
    c3Ajuste,
    bonusTotal,
    malusTotal,
    details,
  };
}

/**
 * Détermine si une surveillance mixte est nécessaire
 */
export function necessiteSurveillanceMixte(
  profil: ProfilRisque,
  exemptionsActives: ExemptionActive[],
  ecartsActifs: Ecart[]
): { necessaire: boolean; raison: string; priorite: 'haute' | 'moyenne' | 'basse' } {
  const aDesMesuresEnRetard = exemptionsActives.some(e => 
    e.mesures.some(m => m.statut === 'en_retard')
  );
  
  const aDesEcartsCritiques = ecartsActifs.some(e => e.niveau_risque === 'critique');
  
  if (aDesMesuresEnRetard && aDesEcartsCritiques) {
    return {
      necessaire: true,
      raison: 'Mesures d\'atténuation en retard + écarts critiques actifs',
      priorite: 'haute',
    };
  }
  
  if (aDesMesuresEnRetard) {
    return {
      necessaire: true,
      raison: `${exemptionsActives.filter(e => e.mesures.some(m => m.statut === 'en_retard')).length} exemption(s) avec mesures en retard`,
      priorite: 'haute',
    };
  }
  
  if (exemptionsActives.length > 0 && profil.tendance === 'baisse') {
    return {
      necessaire: true,
      raison: 'Exemptions actives + tendance à la dégradation',
      priorite: 'moyenne',
    };
  }
  
  if (exemptionsActives.length > 0 && profil.c4 < 50) {
    return {
      necessaire: true,
      raison: 'Exemptions actives + charge critique élevée',
      priorite: 'moyenne',
    };
  }
  
  return {
    necessaire: false,
    raison: '',
    priorite: 'basse',
  };
}

/**
 * Génère les items de checklist pour les mesures d'atténuation
 */
export function genererItemsPourMesures(
  exemptions: ExemptionActive[]
): Array<{
  id: string;
  type: 'mesure_atténuation';
  exemptionId: string;
  exemptionReference: string;
  description: string;
  responsable: string;
  date_prevue: string;
  statut_origine: string;
  efficacite_suggeree: number;
  impact_c3_suggere: number;
  justification: string;
}> {
  const items: Array<{
    id: string;
    type: 'mesure_atténuation';
    exemptionId: string;
    exemptionReference: string;
    description: string;
    responsable: string;
    date_prevue: string;
    statut_origine: string;
    efficacite_suggeree: number;
    impact_c3_suggere: number;
    justification: string;
  }> = [];
  
  for (const exemption of exemptions) {
    for (let i = 0; i < exemption.mesures.length; i++) {
      const mesure = exemption.mesures[i];
      if (mesure.statut !== 'realisee') {
        // Suggestion d'efficacité basée sur le type d'exemption
        let efficaciteSuggeree = 70;
        let impactC3Suggere = 20;
        let justification = 'Mesure corrective standard - impact estimé modéré';
        
        if (exemption.domainesConcerne.includes('PHY') || exemption.domainesConcerne.includes('OPS')) {
          efficaciteSuggeree = 85;
          impactC3Suggere = 25;
          justification = 'Mesure sur domaine critique (PHY/OPS) - impact élevé sur la conformité technique';
        } else if (exemption.domainesConcerne.includes('SGS')) {
          efficaciteSuggeree = 75;
          impactC3Suggere = 15;
          justification = 'Mesure sur système de gestion - impact modéré sur la maturité';
        } else if (exemption.domainesConcerne.includes('SLI')) {
          efficaciteSuggeree = 80;
          impactC3Suggere = 20;
          justification = 'Mesure sur sauvetage et lutte incendie - impact important sur la sécurité';
        }
        
        // Ajustement selon le statut
        if (mesure.statut === 'en_retard') {
          efficaciteSuggeree = Math.max(40, efficaciteSuggeree - 20);
          justification += ' - Attention : mesure en retard';
        }
        
        items.push({
          id: `mesure-${exemption.id}-${i}`,
          type: 'mesure_atténuation',
          exemptionId: exemption.id,
          exemptionReference: exemption.reference,
          description: `Mesure d'atténuation ${i + 1} : ${exemption.reference}`,
          responsable: 'À vérifier sur site',
          date_prevue: mesure.dateFinPrevue,
          statut_origine: mesure.statut,
          efficacite_suggeree: efficaciteSuggeree,
          impact_c3_suggere: impactC3Suggere,
          justification,
        });
      }
    }
  }
  
  return items;
}

// ============================================================
// EXPORT FINAL (conservé + ajouts)
// ============================================================

export const riskEngine = {
  detectUrgentEcards: detectUrgentEcards,
  detectDomainDegradations: detectDomainDegradations,
  determineChecklistType: determineChecklistType,
  determineTypeSurveillanceContinue,
  needsFullDomainAudit: needsFullDomainAudit,
  calculateGlobalPriority: calculateGlobalPriority,
  calculateRecommendedDelay: calculateRecommendedDelay,
  detecterMesuresEnRetard,
  verifierInspectionsPourExemptions,
  calculerImpactExemptionsSurC3,
  necessiteSurveillanceMixte,
  genererItemsPourMesures,
  computeEcartUrgency,
  getEcartTriggers,
};

// ============================================================
// NOUVELLES FONCTIONS — DÉCLENCHEMENT PAC/ÉCARTS
// ============================================================

const OACI_URGENCY_MAP: Record<string, { label: string; delaiJours: number; urgence: 'critique' | 'haute' | 'moyenne' | 'basse' }> = {
  '5A': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '5B': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '4A': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '4B': { label: 'Intolérable', delaiJours: 7, urgence: 'critique' },
  '5C': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '5D': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '4C': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '3A': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '3B': { label: 'Inacceptable', delaiJours: 15, urgence: 'haute' },
  '4D': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '4E': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '3C': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '3D': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '2A': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '2B': { label: 'Tolérable', delaiJours: 30, urgence: 'moyenne' },
  '3E': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '2C': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '2D': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '2E': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1A': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1B': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1C': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1D': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
  '1E': { label: 'Acceptable', delaiJours: 60, urgence: 'basse' },
};

function getCelluleOACI(ecart: Ecart): string {
  if (ecart.domaine === 'SGS') return 'SGS';
  if (ecart.cellule_risque_oaci) return ecart.cellule_risque_oaci;
  const prob = ecart.probabilite_risque ?? 3;
  const grav = ecart.gravite_risque ?? 'C';
  return `${prob}${grav}`;
}

export function computeEcartUrgency(ecart: Ecart, c2Score?: number): {
  urgence: 'critique' | 'haute' | 'moyenne' | 'basse';
  delaiDepasse: boolean;
  joursRetard: number;
  joursAvantEcheance: number;
  celluleOACI: string;
  badgeLabel: string;
} {
  const maintenant = new Date();
  const cellule = getCelluleOACI(ecart);
  const oaciInfo = OACI_URGENCY_MAP[cellule] || { label: 'Non classifié', delaiJours: 30, urgence: 'moyenne' as const };

  const delaiDate = new Date(ecart.delai_pac || ecart.delai_regularisation);
  const joursAvantEcheance = Math.ceil((delaiDate.getTime() - maintenant.getTime()) / (1000 * 60 * 60 * 24));
  const delaiDepasse = joursAvantEcheance < 0;
  const joursRetard = delaiDepasse ? Math.abs(joursAvantEcheance) : 0;

  let urgence = oaciInfo.urgence;

  if (ecart.statut === 'pac_attendu' && delaiDepasse) {
    const seuilRetard = cellule.startsWith('5') || cellule.startsWith('4') ? 1 : cellule.startsWith('3') ? 3 : 7;
    if (joursRetard >= seuilRetard) urgence = 'critique';
    else if (joursRetard >= 1) urgence = 'haute';
  }

  if (ecart.statut === 'pac_accepte' || ecart.statut === 'preuves_soumises') {
    urgence = urgence === 'critique' ? 'haute' : urgence === 'haute' ? 'moyenne' : urgence;
  }

  if (ecart.niveau_risque === 'critique' && urgence !== 'critique') {
    urgence = urgence === 'basse' || urgence === 'moyenne' ? 'haute' : urgence;
  }

  if (c2Score !== undefined && c2Score < 45 && ecart.statut === 'pac_accepte') {
    urgence = urgence === 'basse' ? 'moyenne' : urgence;
  }

  let badgeLabel = '';
  if (urgence === 'critique') badgeLabel = delaiDepasse ? `⚠️ RETARD ${joursRetard}j` : 'URGENT';
  else if (urgence === 'haute') badgeLabel = delaiDepasse ? `RETARD ${joursRetard}j` : 'À suivre';
  else if (urgence === 'moyenne') badgeLabel = delaiDepasse ? `${joursRetard}j retard` : `${joursAvantEcheance}j restants`;
  else badgeLabel = `${joursAvantEcheance}j`;

  return { urgence, delaiDepasse, joursRetard, joursAvantEcheance, celluleOACI: cellule, badgeLabel };
}

export function getEcartTriggers(
  ecarts: Ecart[],
  profil?: ProfilRisque,
  feedbacks?: SuggestionFeedback[],
): EcartTrigger[] {
  const now = new Date();
  const c2 = profil?.c2;

  return ecarts
    .filter(e => e.statut !== 'cloture')
    .map(ecart => {
      const urgency = computeEcartUrgency(ecart, c2);
      const { urgence, delaiDepasse, joursRetard, joursAvantEcheance, celluleOACI, badgeLabel } = urgency;

      let typeSurveillanceSuggere: EcartTrigger['typeSurveillanceSuggere'] = 'suivi_ecarts';
      let justification = '';
      let predictionResultat: EcartTrigger['predictionResultat'] = 'NV';
      let predictionConfiance = 50;

      if (ecart.statut === 'pac_attendu' && delaiDepasse) {
        typeSurveillanceSuggere = 'suivi_ecarts';
        justification = `PAC non soumis — délai dépassé de ${joursRetard}j (cellule ${celluleOACI})`;
        predictionResultat = 'NS';
        predictionConfiance = Math.min(95, 70 + joursRetard * 2 + (c2 ? (100 - c2) / 5 : 0));
      } else if (ecart.statut === 'pac_attendu') {
        typeSurveillanceSuggere = 'suivi_ecarts';
        justification = `PAC attendu — échéance dans ${joursAvantEcheance}j`;
        predictionConfiance = 30;
      } else if (ecart.statut === 'pac_soumis') {
        typeSurveillanceSuggere = 'suivi_ecarts';
        justification = 'PAC soumis — en attente d\'évaluation par l\'inspecteur';
        predictionResultat = 'NV';
        predictionConfiance = 50;
      } else if (ecart.statut === 'pac_refuse') {
        typeSurveillanceSuggere = 'suivi_ecarts';
        justification = 'PAC refusé — nouvelle soumission requise';
        predictionResultat = 'NS';
        predictionConfiance = 75;
      } else if (ecart.statut === 'pac_accepte') {
        typeSurveillanceSuggere = 'mise_oeuvre_pac';
        justification = 'PAC accepté — surveillance de vérification recommandée';
        if (ecart.pac) {
          const actionsTotal = ecart.pac.actions?.length || 0;
          const fichiersCount = ecart.pac.fichiers?.length || 0;
          if (fichiersCount === 0 && actionsTotal > 0) {
            predictionResultat = 'NS';
            predictionConfiance = c2 && c2 < 45 ? 70 : 55;
            justification += ' — aucune preuve soumise';
          } else if (fichiersCount > 0) {
            predictionResultat = c2 && c2 > 70 ? 'SA' : 'NV';
            predictionConfiance = c2 && c2 > 70 ? 70 : 50;
            justification += ` — ${fichiersCount} preuve(s) soumise(s)`;
          }
        }
      } else if (ecart.statut === 'preuves_soumises') {
        typeSurveillanceSuggere = 'mise_oeuvre_pac';
        justification = 'Preuves soumises — évaluation en cours';
        predictionResultat = c2 && c2 > 70 ? 'SA' : 'NV';
        predictionConfiance = c2 && c2 > 70 ? 70 : 50;
      } else if (ecart.statut === 'preuves_evaluees') {
        typeSurveillanceSuggere = 'mise_oeuvre_pac';
        justification = 'Preuves évaluées — clôture imminente';
        predictionResultat = 'SA';
        predictionConfiance = 90;
      } else if (ecart.statut === 'ouvert') {
        typeSurveillanceSuggere = 'suivi_ecarts';
        justification = `Écart ouvert — en attente de plan d'action`;
        predictionResultat = delaiDepasse ? 'NS' : 'NV';
        predictionConfiance = delaiDepasse ? Math.min(95, 70 + joursRetard * 2) : 40;
      }

      if (urgence === 'critique') {
        predictionConfiance = Math.max(predictionConfiance, 80);
      }

      const ruleType = typeSurveillanceSuggere as SurveillanceType;
      const ruleConfiance = predictionConfiance;
      const mlEnsemble = suggestionMLAgent.ensemblePredict(
        ecart, profil, ecarts, feedbacks,
        ruleType, ruleConfiance,
      );

      if (mlEnsemble.source === 'ensemble' || mlEnsemble.source === 'ml') {
        typeSurveillanceSuggere = mlEnsemble.type as EcartTrigger['typeSurveillanceSuggere'];
        predictionConfiance = mlEnsemble.confiance;
        justification += `\n🤖 ML: ${mlEnsemble.recommandation}`;
      }

      // Détection d'anomalies (RF Isolation Forest)
      try {
        const { anomalyDetector } = require('@/lib/ia/models/randomForest')
        if (anomalyDetector && ecart.cellule_risque_oaci) {
          const features = [
            ecart.niveau_risque === 'critique' ? 4 : ecart.niveau_risque === 'eleve' ? 3 : ecart.niveau_risque === 'moyen' ? 2 : 1,
            parseInt(ecart.cellule_risque_oaci?.charAt(0) || '3'),
            profil?.score_global || 50,
            profil?.c2 || 50,
          ]
          const anomalyScore = anomalyDetector.predictAnomaly(features)
          if (anomalyScore > 0.7) {
            justification += `\n🔍 Anomalie détectée (score: ${Math.round(anomalyScore * 100)}%) — pattern suspect identifié par le modèle d'isolation`
            if (predictionConfiance < 70) predictionConfiance = Math.max(predictionConfiance, 70)
          }
        }
      } catch { /* anomaly detector unavailable */ }

      return {
        ecart,
        urgence,
        celluleOACI,
        delaiDepasse,
        joursRetard,
        joursAvantEcheance,
        typeSurveillanceSuggere,
        justification,
        badgeLabel,
        predictionResultat,
        predictionConfiance: Math.round(predictionConfiance),
        mlPrediction: mlEnsemble,
      };
    })
    .sort((a, b) => {
      const order: Record<string, number> = { critique: 0, haute: 1, moyenne: 2, basse: 3 };
      return (order[a.urgence] ?? 4) - (order[b.urgence] ?? 4) || a.joursRetard - b.joursRetard;
    });
}
