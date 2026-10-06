// lib/ia/recitEcart.ts — Récit d'un écart à partir des FAITS (zéro hallucination).
// Pur et testé : construit la synthèse narrative calculée, la situation et
// les anomalies de parcours depuis l'écart + son historique. L'IA (appelée
// depuis le modal) ne fait que REFORMULER ces faits — jamais les inventer.

import type { Ecart, HistoriqueEcart } from '../store/ecartsTypes';
import { DELAI_PAR_NIVEAU } from '../flux';
import { quiDoitJouer } from '../domaines';
import { calculerDelaiRestant } from '../ecarts-rappels';

export interface AnomalieParcours {
  niveau: 'danger' | 'warning'
  titre: string
  detail: string
}

export interface RecitEcart {
  phrases: string[]
  situation: {
    statut: string
    niveau: string
    attente: string
    action: string
    joursDepuisConstat: number
    echeance: string
  }
  anomalies: AnomalieParcours[]
}

const fmtDate = (iso?: string): string =>
  iso ? new Date(iso).toLocaleDateString('fr-FR') : 'date inconnue';

const joursEntre = (a: string, b: string): number =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

/** Construit le récit calculé d'un écart (synthèse + situation + anomalies). */
export function construireRecitEcart(
  ecart: Ecart,
  historique: HistoriqueEcart[],
  maintenant: Date = new Date(),
): RecitEcart {
  const phrases: string[] = [];
  const anomalies: AnomalieParcours[] = [];
  const attente = quiDoitJouer(ecart.statut, ecart.retard_inspecteur);
  const joursDepuisConstat = Math.max(0, joursEntre(ecart.created_at, maintenant.toISOString()));

  phrases.push(`Écart ${ecart.reference} (${ecart.niveau_risque}) constaté le ${fmtDate(ecart.created_at)} — ${joursDepuisConstat} jour(s) de parcours.`);

  const soumissions = historique.filter(h => h.type === 'soumission_pac').length;
  if (ecart.pac) {
    phrases.push(`PAC v${ecart.pac.version || 1} soumis le ${fmtDate(ecart.pac.soumis_le)} avec ${(ecart.pac.actions || []).length} action(s) corrective(s).`);
  } else if (soumissions === 0) {
    phrases.push(`Aucun PAC soumis à ce jour (délai d'envoi : ${fmtDate(ecart.delai_pac)}).`);
  }

  const decisionPac = ecart.evaluation_pac?.decision;
  if (decisionPac === 'accepte' || decisionPac === 'reserve') {
    phrases.push(`PAC ${decisionPac === 'reserve' ? 'accepté avec réserves' : 'accepté'} le ${fmtDate(ecart.evaluation_pac?.evalue_le)} — délai de régularisation : ${fmtDate(ecart.delai_regularisation)}.`);
  } else if (decisionPac === 'refuse') {
    phrases.push(`PAC refusé le ${fmtDate(ecart.evaluation_pac?.evalue_le)}${ecart.evaluation_pac?.commentaire_refus ? ` — motif : ${ecart.evaluation_pac.commentaire_refus}` : ''}.`);
  }

  if (ecart.preuves) {
    phrases.push(`Preuves déposées le ${fmtDate(ecart.preuves.soumis_le)} (${(ecart.preuves.fichiers || []).length} fichier(s)).`);
  }
  const decisionPreuves = ecart.validation_preuves?.decision;
  if (decisionPreuves === 'valide') {
    phrases.push(`Preuves validées le ${fmtDate(ecart.validation_preuves?.valide_le)} — écart clôturé${ecart.cloture_le ? ` le ${fmtDate(ecart.cloture_le)}` : ''}.`);
  } else if (decisionPreuves === 'refuse' || decisionPreuves === 'reserve') {
    phrases.push(`Preuves ${decisionPreuves === 'reserve' ? 'acceptées avec réserves' : 'refusées'} — corrections requises.`);
  }

  if (ecart.statut !== 'cloture') {
    phrases.push(`Situation : ${attente.action} — en attente : ${attente.camp === 'exploitant' ? "de l'exploitant" : attente.camp === 'inspecteur' ? "de l'inspecteur" : attente.camp === 'chef' ? "du chef d'équipe" : '—'}.`);
  }

  // ── Anomalies de parcours (règles, pas de ML) ──
  const refusPacHist = historique.filter(h =>
    h.type === 'evaluation_pac' && /refus/i.test(h.description || '')).length;
  const nbRefusPac = Math.max(refusPacHist, decisionPac === 'refuse' ? 1 : 0);
  const nbRefusPreuves = decisionPreuves === 'refuse' ? 1 : 0;
  if (nbRefusPac + nbRefusPreuves >= 2) {
    anomalies.push({
      niveau: 'danger',
      titre: `Refus répétés (${nbRefusPac + nbRefusPreuves})`,
      detail: 'Le dossier tourne en rond — convoquer l\u2019exploitant ou diligenter une contre-expertise.',
    });
  }

  const bareme = DELAI_PAR_NIVEAU[ecart.niveau_risque as keyof typeof DELAI_PAR_NIVEAU];
  if (ecart.statut !== 'cloture' && bareme && joursDepuisConstat > bareme.regularisation * 2) {
    anomalies.push({
      niveau: 'warning',
      titre: 'Dossier ancien',
      detail: `${joursDepuisConstat} jours depuis le constat, soit plus du double du barème ${ecart.niveau_risque} (${bareme.regularisation} j de régularisation).`,
    });
  }

  const allerRetours = historique.filter(h =>
    h.type === 'soumission_pac' || h.type === 'evaluation_pac' ||
    h.type === 'soumission_preuves' || h.type === 'validation_preuves').length;
  if (allerRetours >= 6) {
    anomalies.push({
      niveau: 'warning',
      titre: `Aller-retours nombreux (${allerRetours})`,
      detail: 'Le cycle soumission/évaluation patine — arbitrage du chef recommandé.',
    });
  }

  if ((ecart.statut === 'pac_soumis' || ecart.statut === 'preuves_soumises') && ecart.retard_inspecteur) {
    anomalies.push({
      niveau: 'warning',
      titre: 'Balle chez l\u2019inspecteur',
      detail: 'Délai d\u2019évaluation/validation dépassé — escalade au chef SNA déjà notifiée.',
    });
  }

  if (ecart.statut === 'en_retard' && (ecart.niveau_risque === 'critique' || ecart.niveau_risque === 'eleve')) {
    anomalies.push({
      niveau: 'danger',
      titre: `Retard sur risque ${ecart.niveau_risque}`,
      detail: 'Un écart à risque ne peut rester sans correction — surveillance à déclencher sans délai.',
    });
  }

  const echeance = ecart.statut === 'cloture'
    ? 'Dossier clôturé.'
    : (() => {
      const d = calculerDelaiRestant(ecart, maintenant);
      return d.depasse
        ? `En retard de ${Math.abs(d.jours)} jour(s).`
        : `Échéance dans ${d.jours} jour(s).`;
    })();

  return {
    phrases,
    situation: {
      statut: ecart.statut,
      niveau: ecart.niveau_risque,
      attente: attente.camp || '—',
      action: attente.action,
      joursDepuisConstat,
      echeance,
    },
    anomalies,
  };
}
