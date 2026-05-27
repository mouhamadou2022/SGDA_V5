// lib/rapportUtils.ts
'use client';

import { ProfilRisque, Ecart, Surveillance, ChecklistItem } from './store';

// Types
export type ResultatChecklist = 'SA' | 'NS' | 'NA' | 'NV';

export interface RapportStats {
  total_items: number;
  sa: number;
  ns: number;
  nv: number;
  na: number;
  taux_conformite_classique: number;
  taux_conformite_reel: number;
  progression: number;
}

export interface RapportDomaineStats {
  domaine: string;
  total: number;
  sa: number;
  ns: number;
  nv: number;
  na: number;
  taux: number;
}

export interface RapportEcart {
  id: string;
  reference: string;
  ref_reglementaire: string;
  libelle: string;
  niveau: string;
  created_at: string;
}

export interface RapportPresence {
  id: string;
  prenom_nom: string;
  structure: string;
  fonction: string;
  signature_url: string;
  signature_date: string;
}

export interface RapportScenario {
  nom: string;
  description: string;
  probabilite: number;
  scoreProjecte: number;
  intervalleConfiance: [number, number];
  actionsRecommandees: string[];
}

export interface RapportProfil {
  score_global: number;
  niveau: string;
  tendance: string;
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  c5: number;
  computed_at: string;
  prediction_3m?: number;
  prediction_6m?: number;
  prediction_12m?: number;
  prediction_interval_3m?: { lower: number; upper: number };
  prediction_interval_6m?: { lower: number; upper: number };
  incident_prediction_3m?: number;
  incident_prediction_6m?: number;
  incident_prediction_12m?: number;
  event_frequency?: number;
  event_severity_trend?: string;
  days_since_last_event?: number;
  event_trend_acceleration?: number;
  bayesian_posterior?: number;
  bayesian_prior?: number;
  bayesian_black_swan?: boolean;
  scenarios?: RapportScenario[];
  ensemble_confidence?: number;
  hawkes_intensity?: number;
  effectiveness_score?: number;
  sgs_maturity_label?: string;
}

/**
 * Calculer les statistiques globales du rapport
 */
export function calculateRapportStats(checklistItems: ChecklistItem[]): RapportStats {
  const total = checklistItems.length;
  const sa = checklistItems.filter(i => i.resultat === 'SA').length;
  const ns = checklistItems.filter(i => i.resultat === 'NS').length;
  const nv = checklistItems.filter(i => i.resultat === 'NV' || !i.resultat).length;
  const na = checklistItems.filter(i => i.resultat === 'NA').length;
  const renseignes = sa + ns + na;

  const taux_conformite_classique = total > 0 ? Math.round((sa / total) * 100) : 0;
  const totalReel = sa + ns + nv;
  const taux_conformite_reel = totalReel > 0 ? Math.round((sa / totalReel) * 100) : 0;
  const progression = total > 0 ? Math.round((renseignes / total) * 100) : 0;

  return {
    total_items: total,
    sa,
    ns,
    nv,
    na,
    taux_conformite_classique,
    taux_conformite_reel,
    progression,
  };
}

/**
 * Calculer les statistiques par domaine
 */
export function calculateRapportStatsByDomaine(checklistItems: ChecklistItem[]): RapportDomaineStats[] {
  const domaineMap = new Map<string, RapportDomaineStats>();

  checklistItems.forEach(item => {
    const domaine = item.domaine || 'Autre';
    if (!domaineMap.has(domaine)) {
      domaineMap.set(domaine, {
        domaine,
        total: 0,
        sa: 0,
        ns: 0,
        nv: 0,
        na: 0,
        taux: 0,
      });
    }

    const stats = domaineMap.get(domaine)!;
    stats.total++;

    if (item.resultat === 'SA') stats.sa++;
    else if (item.resultat === 'NS') stats.ns++;
    else if (item.resultat === 'NA') stats.na++;
    else stats.nv++;

    const totalReel = stats.sa + stats.ns + stats.nv;
    stats.taux = totalReel > 0 ? Math.round((stats.sa / totalReel) * 100) : 0;
  });

  return Array.from(domaineMap.values()).sort((a, b) => a.domaine.localeCompare(b.domaine));
}

/**
 * Formater les écarts pour le rapport
 */
export function formatEcartsForRapport(ecarts: Ecart[]): RapportEcart[] {
  return ecarts.map(ecart => ({
    id: ecart.id,
    reference: ecart.reference,
    ref_reglementaire: ecart.ref_reglementaire,
    libelle: ecart.libelle,
    niveau: ecart.niveau_risque,
    created_at: ecart.created_at,
  }));
}

/**
 * Formater le profil de risque pour le rapport
 */
export function formatProfilForRapport(profil: ProfilRisque | null): RapportProfil | null {
  if (!profil) return null;

  const sgsScore = profil.c1;
  const sgs_maturity_label = sgsScore >= 80 ? 'Avancé' : sgsScore >= 60 ? 'Significatif' : sgsScore >= 40 ? 'Partiel' : sgsScore >= 20 ? 'Émergent' : 'Inexistant';

  return {
    score_global: profil.score_global,
    niveau: profil.niveau,
    tendance: profil.tendance,
    c1: profil.c1,
    c2: profil.c2,
    c3: profil.c3,
    c4: profil.c4,
    c5: profil.c5,
    computed_at: profil.computed_at,
    prediction_3m: profil.prediction_3m,
    prediction_6m: profil.prediction_6m,
    prediction_12m: profil.prediction_12m,
    prediction_interval_3m: profil.prediction_interval_3m,
    prediction_interval_6m: profil.prediction_interval_6m,
    incident_prediction_3m: profil.incident_prediction_3m,
    incident_prediction_6m: profil.incident_prediction_6m,
    incident_prediction_12m: profil.incident_prediction_12m,
    event_frequency: profil.event_frequency,
    event_severity_trend: profil.event_severity_trend,
    days_since_last_event: profil.days_since_last_event,
    event_trend_acceleration: profil.event_trend_acceleration,
    bayesian_posterior: profil.bayesian_posterior,
    bayesian_prior: profil.bayesian_prior,
    bayesian_black_swan: profil.bayesian_black_swan,
    scenarios: (profil.scenarios || []).map(s => ({
      nom: s.nom,
      description: s.description,
      probabilite: s.probabilite,
      scoreProjecte: s.scoreProjecte,
      intervalleConfiance: s.intervalleConfiance,
      actionsRecommandees: s.actionsRecommandees,
    })),
    ensemble_confidence: profil.ensemble_confidence,
    hawkes_intensity: profil.hawkes_intensity,
    effectiveness_score: profil.effectiveness_score,
    sgs_maturity_label,
  };
}

/**
 * Générer le HTML de la page de garde
 */
export function generatePageGardeHTML(
  aerodromeNom: string,
  aerodromeCode: string,
  dateDebut: string,
  dateFin: string,
  type: string,
  reference: string,
  chefEquipe?: string
): string {
  const dateDebutFormatted = new Date(dateDebut).toLocaleDateString('fr-FR');
  const dateFinFormatted = new Date(dateFin).toLocaleDateString('fr-FR');

  return `
    <div style="text-align: center; margin-bottom: 40px; page-break-after: avoid;">
      <div style="margin-bottom: 30px;">
        <h1 style="font-size: 28px; margin: 20px 0; color: #1a56db;">ANACIM</h1>
        <h2 style="font-size: 18px; margin-bottom: 10px; color: #374151;">Agence Nationale de l'Aviation Civile du Sénégal</h2>
        <h3 style="font-size: 16px; margin-bottom: 30px; color: #4b5563;">Direction de la Sécurité des Aérodromes</h3>
      </div>
      <hr style="margin: 30px 0; border-color: #e5e7eb;">
      <h1 style="font-size: 32px; margin: 40px 0; color: #1a56db;">RAPPORT DE SURVEILLANCE</h1>
      <p style="font-size: 14px; margin: 10px 0;"><strong>Réf:</strong> ${reference}</p>
      <hr style="margin: 30px 0; border-color: #e5e7eb;">
      <table style="width: 100%; margin-top: 40px; border-collapse: collapse;">
        <tr><td style="padding: 8px;"><strong>Aérodrome:</strong></td><td>${aerodromeNom} (${aerodromeCode})</td></tr>
        <tr><td style="padding: 8px;"><strong>Date de la surveillance:</strong></td><td>${dateDebutFormatted} → ${dateFinFormatted}</td></tr>
        <tr><td style="padding: 8px;"><strong>Type de surveillance:</strong></td><td>${type}</td></tr>
        ${chefEquipe ? `<tr><td style="padding: 8px;"><strong>Chef d'équipe:</strong></td><td>${chefEquipe}</td></tr>` : ''}
      </table>
      <div style="margin-top: 60px;">
        <p style="font-size: 12px; color: #6b7280;">Document confidentiel - ANACIM</p>
      </div>
    </div>
  `;
}

/**
 * Générer le HTML de la table des matières
 */
export function generateTableMatiereHTML(sections: { id: string; titre: string }[]): string {
  const items = sections.map((section, index) => {
    return `<li><a href="#${section.id}">${index + 1}. ${section.titre}</a></li>`;
  }).join('');

  return `
    <div style="page-break-before: avoid;">
      <h2>Table des matières</h2>
      <ul style="margin-top: 20px;">
        ${items}
      </ul>
    </div>
  `;
}

/**
 * Générer le HTML de l'équipe d'inspection
 */
export function generateEquipeInspectionHTML(presences: RapportPresence[]): string {
  const anacimMembers = presences.filter(p => p.structure === 'ANACIM');
  const exploitantMembers = presences.filter(p => p.structure === 'EXPLOITANT');

  let tableRows = '';
  [...anacimMembers, ...exploitantMembers].forEach(p => {
    tableRows += `
      <tr>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.prenom_nom}</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.structure}</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.fonction || '-'}</td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.signature_url ? '✅ Signé' : '❌ Non signé'}</td>
      </tr>
    `;
  });

  return `
    <div>
      <h2>Équipe d'inspection</h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Nom</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Structure</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Fonction</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb; text-align: left;">Signature</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  `;
}

function getScoreColor(score: number): string {
  if (score >= 70) return '#10b981';
  if (score >= 50) return '#f59e0b';
  if (score >= 30) return '#ef4444';
  return '#7c3aed';
}

function getNiveauLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Bon';
  if (score >= 40) return 'Modéré';
  if (score >= 20) return 'Faible';
  return 'Critique';
}

/**
 * Générer le HTML des résultats
 */
export function generateResultatsHTML(
  stats: RapportStats,
  statsByDomaine: RapportDomaineStats[],
  options?: {
    profil?: RapportProfil | null;
    checklistItems?: ChecklistItem[];
  }
): string {
  const getTauxColor = (taux: number): string => {
    if (taux >= 70) return '#10b981';
    if (taux >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const profil = options?.profil;
  const items = options?.checklistItems;

  // Domaines critiques (conformité < 50%)
  const criticalDomains = statsByDomaine.filter(d => d.taux < 50);
  // SGS : domaine contenant 'SGS' ou 'sécurité' ou premier domaine avec le plus d'items
  const sgsDomaine = statsByDomaine.find(d =>
    d.domaine.toLowerCase().includes('sgs') ||
    d.domaine.toLowerCase().includes('sécurité') ||
    d.domaine.toLowerCase().includes('securite')
  );

  const domaineRows = statsByDomaine.map(d => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${d.domaine}${d.taux < 50 ? ' ⚠️' : ''}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${d.sa}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${d.ns}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${d.nv}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${d.total}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">
        <div style="background-color: #e5e7eb; border-radius: 8px; height: 12px; width: 100%; overflow: hidden;">
          <div style="background-color: ${getTauxColor(d.taux)}; width: ${d.taux}%; height: 100%;"></div>
        </div>
        <span style="font-size: 11px;">${d.taux}%</span>
      </td>
    </tr>
  `).join('');

  // Section SGS
  const sgsHtml = profil ? `
    <div style="margin-top: 30px;">
      <h3>Système de Gestion de la Sécurité (SGS)</h3>
      <div style="margin: 15px 0; padding: 15px; background-color: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <span><strong>Maturité SGS (C1):</strong></span>
          <span style="font-size: 18px; font-weight: bold; color: ${getScoreColor(profil.c1)};">
            ${profil.c1}/100 — ${profil.sgs_maturity_label || getNiveauLabel(profil.c1)}
          </span>
        </div>
        <div style="margin: 10px 0; background-color: #e5e7eb; border-radius: 8px; height: 16px; overflow: hidden;">
          <div style="background-color: ${getScoreColor(profil.c1)}; width: ${profil.c1}%; height: 100%;"></div>
        </div>
        <p style="margin-top: 10px; font-size: 13px; color: #6b7280;">
          ${profil.c1 >= 80 ? 'Le SGS est mature et pleinement opérationnel.' :
            profil.c1 >= 60 ? 'Le SGS est significatif mais des améliorations sont possibles.' :
            profil.c1 >= 40 ? 'Le SGS est partiellement déployé. Des actions correctives sont nécessaires.' :
            profil.c1 >= 20 ? 'Le SGS est émergent. Une mise en œuvre structurée est requise.' :
            'Le SGS est inexistant ou non documenté. Action prioritaire requise.'}
        </p>
        ${sgsDomaine ? `
          <p style="font-size: 13px; color: #6b7280;">
            <strong>Domaine SGS:</strong> ${sgsDomaine.domaine} — Taux de conformité: ${sgsDomaine.taux}%
            ${sgsDomaine.taux < 50 ? ' ⚠️ Nécessite une attention immédiate.' : ''}
          </p>
        ` : ''}
      </div>
    </div>
  ` : '';

  // Domaines critiques
  const criticalHtml = criticalDomains.length > 0 ? `
    <div style="margin-top: 25px;">
      <h3>Domaines critiques</h3>
      <p style="color: #ef4444; font-size: 13px;">⚠️ Les domaines suivants ont un taux de conformité inférieur à 50% :</p>
      <ul style="margin-top: 10px;">
        ${criticalDomains.map(d => `
          <li style="margin: 5px 0; font-size: 13px;">
            <strong>${d.domaine}</strong> — ${d.taux}% de conformité
            (SA: ${d.sa}, NS: ${d.ns}, NV: ${d.nv})
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  // Scénarios
  const scenariosHtml = profil?.scenarios && profil.scenarios.length > 0 ? `
    <div style="margin-top: 25px;">
      <h3>Scénarios de risque projetés</h3>
      <p style="font-size: 13px; color: #6b7280; margin-bottom: 15px;">
        Analyse bayésienne et modélisation des scénarios potentiels (confiance ensemble: ${profil.ensemble_confidence ? `${profil.ensemble_confidence}%` : 'N/A'})
      </p>
      ${profil.scenarios.map(s => `
        <div style="margin: 12px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #fafafa;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 14px;">${s.nom}</strong>
            <span style="font-size: 13px; color: ${getScoreColor(s.scoreProjecte)};">
              Score projeté: ${s.scoreProjecte}/100
            </span>
          </div>
          <p style="margin: 8px 0; font-size: 13px; color: #374151;">${s.description}</p>
          <div style="display: flex; gap: 20px; margin: 8px 0; font-size: 12px; color: #6b7280;">
            <span><strong>Probabilité:</strong> ${s.probabilite}%</span>
            <span><strong>Intervalle de confiance:</strong> [${s.intervalleConfiance[0]}, ${s.intervalleConfiance[1]}]</span>
          </div>
          <div style="margin: 8px 0;">
            <div style="background-color: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
              <div style="background-color: ${getScoreColor(s.scoreProjecte)}; width: ${s.probabilite}%; height: 100%;"></div>
            </div>
          </div>
          ${s.actionsRecommandees.length > 0 ? `
            <div style="margin-top: 8px;">
              <strong style="font-size: 12px;">Actions recommandées:</strong>
              <ul style="margin: 5px 0 0 20px; font-size: 12px;">
                ${s.actionsRecommandees.map(a => `<li>${a}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `).join('')}
      ${profil.bayesian_black_swan ? `
        <div style="margin-top: 10px; padding: 10px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;">
          <p style="font-size: 13px; color: #ef4444;"><strong>⚠️ Risque cygne noir détecté</strong> — événement à faible probabilité mais à très fort impact identifié par l'analyse bayésienne.</p>
        </div>
      ` : ''}
    </div>
  ` : '';

  // Prédictions
  const predictionsHtml = profil?.prediction_3m != null ? `
    <div style="margin-top: 25px;">
      <h3>Tendance avancée du profil de risque</h3>
      <div style="margin: 15px 0; padding: 15px; background-color: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: space-around;">
          <div style="text-align: center; min-width: 100px;">
            <div style="font-size: 24px; font-weight: bold; color: ${getScoreColor(profil.score_global)};">${profil.score_global}</div>
            <div style="font-size: 11px; color: #6b7280;">Actuel</div>
          </div>
          <div style="text-align: center; min-width: 100px;">
            <div style="font-size: 24px; font-weight: bold; color: ${getScoreColor(profil.prediction_3m)};">${profil.prediction_3m}</div>
            <div style="font-size: 11px; color: #6b7280;">3 mois${profil.prediction_interval_3m ? ` [${profil.prediction_interval_3m.lower}-${profil.prediction_interval_3m.upper}]` : ''}</div>
          </div>
          ${profil.prediction_6m != null ? `
          <div style="text-align: center; min-width: 100px;">
            <div style="font-size: 24px; font-weight: bold; color: ${getScoreColor(profil.prediction_6m)};">${profil.prediction_6m}</div>
            <div style="font-size: 11px; color: #6b7280;">6 mois${profil.prediction_interval_6m ? ` [${profil.prediction_interval_6m.lower}-${profil.prediction_interval_6m.upper}]` : ''}</div>
          </div>
          ` : ''}
          ${profil.prediction_12m != null ? `
          <div style="text-align: center; min-width: 100px;">
            <div style="font-size: 24px; font-weight: bold; color: ${getScoreColor(profil.prediction_12m)};">${profil.prediction_12m}</div>
            <div style="font-size: 11px; color: #6b7280;">12 mois</div>
          </div>
          ` : ''}
        </div>
        <!-- Barre de tendance visuelle -->
        <div style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 11px; color: #6b7280; min-width: 50px;">Actuel</span>
          <div style="flex: 1; height: 6px; background-color: #e5e7eb; border-radius: 3px; position: relative;">
            <div style="position: absolute; left: ${profil.score_global}%; width: 2px; height: 14px; top: -4px; background-color: #374151;"></div>
            ${profil.prediction_3m != null ? `<div style="position: absolute; left: ${profil.prediction_3m}%; width: 2px; height: 10px; top: -2px; background-color: ${getScoreColor(profil.prediction_3m)};"></div>` : ''}
            ${profil.prediction_6m != null ? `<div style="position: absolute; left: ${profil.prediction_6m}%; width: 2px; height: 10px; top: -2px; background-color: ${getScoreColor(profil.prediction_6m)};"></div>` : ''}
          </div>
          <span style="font-size: 11px; color: #6b7280; min-width: 50px; text-align: right;">12mois</span>
        </div>
        <p style="margin-top: 10px; font-size: 12px; color: #6b7280;">
          <strong>Tendance:</strong> ${profil.tendance === 'hausse' ? '📈 Amélioration' : profil.tendance === 'baisse' ? '📉 Dégradation' : '➡️ Stable'}
          ${profil.event_trend_acceleration != null ? ` | <strong>Accélération de la tendance:</strong> ${profil.event_trend_acceleration > 0 ? '+':''}${(profil.event_trend_acceleration * 100).toFixed(1)}%` : ''}
          ${profil.ensemble_confidence != null ? ` | <strong>Confiance du modèle:</strong> ${profil.ensemble_confidence}%` : ''}
        </p>
      </div>
    </div>
  ` : '';

  // Efficacité PAC
  const pacHtml = profil?.effectiveness_score != null ? `
    <div style="margin-top: 20px;">
      <h3>Efficacité des actions correctives (PAC)</h3>
      <div style="margin: 10px 0; padding: 12px; background-color: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span><strong>Score d'efficacité:</strong></span>
          <span style="font-size: 18px; font-weight: bold; color: ${getScoreColor(profil.effectiveness_score)};">${profil.effectiveness_score}/100</span>
        </div>
        <div style="margin: 8px 0; background-color: #e5e7eb; border-radius: 8px; height: 12px; overflow: hidden;">
          <div style="background-color: ${getScoreColor(profil.effectiveness_score)}; width: ${profil.effectiveness_score}%; height: 100%;"></div>
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div>
      <h2>Résultats de l'inspection</h2>

      <div style="margin: 20px 0;">
        <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
          <div style="text-align: center; min-width: 80px;">
            <div style="font-size: 32px; font-weight: bold; color: #10b981;">${stats.sa}</div>
            <div style="font-size: 12px;">Satisfaisant</div>
          </div>
          <div style="text-align: center; min-width: 80px;">
            <div style="font-size: 32px; font-weight: bold; color: #ef4444;">${stats.ns}</div>
            <div style="font-size: 12px;">Non satisfaisant</div>
          </div>
          <div style="text-align: center; min-width: 80px;">
            <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${stats.nv}</div>
            <div style="font-size: 12px;">Non vérifié</div>
          </div>
          <div style="text-align: center; min-width: 80px;">
            <div style="font-size: 32px; font-weight: bold; color: #6b7280;">${stats.na}</div>
            <div style="font-size: 12px;">Non applicable</div>
          </div>
        </div>
      </div>

      <p><strong>Taux de conformité réel (NV=NS):</strong> ${stats.taux_conformite_reel}%</p>
      <div style="margin: 15px 0; background-color: #e5e7eb; border-radius: 8px; height: 20px; overflow: hidden;">
        <div style="background-color: ${getTauxColor(stats.taux_conformite_reel)}; width: ${stats.taux_conformite_reel}%; height: 100%;"></div>
      </div>

      <h3 style="margin-top: 25px;">Détail par domaine</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Domaine</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">SA</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">NS</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">NV</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Total</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Conformité</th>
          </tr>
        </thead>
        <tbody>
          ${domaineRows}
        </tbody>
      </table>

      ${sgsHtml}
      ${criticalHtml}
      ${predictionsHtml}
      ${scenariosHtml}
      ${pacHtml}
    </div>
  `;
}

/**
 * Générer le HTML des annexes
 */
export function generateAnnexesHTML(
  presences: RapportPresence[],
  ecarts: RapportEcart[],
  profil: RapportProfil | null,
  checklistItems?: ChecklistItem[]
): string {
  // Fiches de présence
  const presenceRows = presences.map(p => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.prenom_nom}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.structure}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.fonction || '-'}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${p.signature_url ? '✅ Signé le ' + new Date(p.signature_date).toLocaleDateString('fr-FR') : '❌ Non signé'}</td>
    </tr>
  `).join('');

  // Écarts
  const ecartRows = ecarts.map(e => `
    <tr>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${e.reference}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${e.ref_reglementaire}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">${e.libelle}</td>
      <td style="padding: 8px; border: 1px solid #e5e7eb;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; color: white; background-color: ${e.niveau === 'critique' ? '#ef4444' : e.niveau === 'eleve' ? '#f59e0b' : '#3b82f6'};">${e.niveau}</span>
      </td>
    </tr>
  `).join('');

  // Checklist items by domaine
  const checklistByDomaine: Record<string, ChecklistItem[]> = {};
  if (checklistItems) {
    checklistItems.forEach(item => {
      const domaine = item.domaine || 'Autre';
      if (!checklistByDomaine[domaine]) checklistByDomaine[domaine] = [];
      checklistByDomaine[domaine].push(item);
    });
  }

  const getResultatColor = (r?: string) => {
    if (r === 'SA') return '#10b981';
    if (r === 'NS') return '#ef4444';
    if (r === 'NA') return '#6b7280';
    return '#f59e0b';
  };

  const checklistHtml = Object.keys(checklistByDomaine).length > 0 ? `
    <h3>Annexe A-2: Check-list renseignée</h3>
    ${Object.entries(checklistByDomaine).map(([domaine, items]) => `
      <div style="margin-bottom: 20px;">
        <p style="font-weight: bold; font-size: 13px; margin-bottom: 8px;">Domaine: ${domaine} (${items.length} points)</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 6px; border: 1px solid #e5e7eb;">N°</th>
              <th style="padding: 6px; border: 1px solid #e5e7eb;">Réf. RAS14</th>
              <th style="padding: 6px; border: 1px solid #e5e7eb;">Point de vérification</th>
              <th style="padding: 6px; border: 1px solid #e5e7eb;">Résultat</th>
              <th style="padding: 6px; border: 1px solid #e5e7eb;">Observation</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr>
                <td style="padding: 6px; border: 1px solid #e5e7eb; text-align: center;">${idx + 1}</td>
                <td style="padding: 6px; border: 1px solid #e5e7eb;">${item.reference_ras14 || '-'}</td>
                <td style="padding: 6px; border: 1px solid #e5e7eb;">${item.description || item.point_verification || '-'}</td>
                <td style="padding: 6px; border: 1px solid #e5e7eb; text-align: center;">
                  <span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; color: white; background-color: ${getResultatColor(item.resultat)};">
                    ${item.resultat || 'NV'}
                  </span>
                </td>
                <td style="padding: 6px; border: 1px solid #e5e7eb; font-size: 10px;">${item.observation || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  ` : '';

  // Profil risque détaillé
  const niveauConfig = profil ? getNiveauConfigHTML(profil.score_global) : null;

  const profilHtml = profil ? `
    <h3>Annexe A-4: Profil de risque détaillé</h3>
    <div style="margin-bottom: 20px;">
      <div style="padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #fafafa;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px; width: 200px;"><strong>Score global:</strong></td>
            <td style="padding: 6px;">
              <span style="font-size: 16px; font-weight: bold; color: ${niveauConfig?.color || '#f59e0b'};">${profil.score_global}/100</span>
              — ${niveauConfig?.label || profil.niveau}
            </td>
          </tr>
          <tr>
            <td style="padding: 6px;"><strong>Tendance:</strong></td>
            <td style="padding: 6px;">${profil.tendance === 'hausse' ? '📈 Amélioration' : profil.tendance === 'baisse' ? '📉 Dégradation' : '➡️ Stable'}</td>
          </tr>
          <tr>
            <td style="padding: 6px;"><strong>Dernier calcul:</strong></td>
            <td style="padding: 6px;">${new Date(profil.computed_at).toLocaleDateString('fr-FR')}</td>
          </tr>
          ${profil.prediction_3m != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Prédiction à 3 mois:</strong></td>
            <td style="padding: 6px;">${profil.prediction_3m}/100 ${profil.prediction_interval_3m ? `(IC: ${profil.prediction_interval_3m.lower}–${profil.prediction_interval_3m.upper})` : ''}</td>
          </tr>
          ` : ''}
          ${profil.prediction_6m != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Prédiction à 6 mois:</strong></td>
            <td style="padding: 6px;">${profil.prediction_6m}/100 ${profil.prediction_interval_6m ? `(IC: ${profil.prediction_interval_6m.lower}–${profil.prediction_interval_6m.upper})` : ''}</td>
          </tr>
          ` : ''}
          ${profil.hawkes_intensity != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Intensité Hawkes:</strong></td>
            <td style="padding: 6px;">${profil.hawkes_intensity.toFixed(4)} ${profil.hawkes_intensity > 0.5 ? '⚠️ Activation' : '✅ Normal'}</td>
          </tr>
          ` : ''}
          ${profil.event_frequency != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Fréquence d'événements:</strong></td>
            <td style="padding: 6px;">${profil.event_frequency.toFixed(2)} événements/mois ${profil.event_severity_trend ? `(Tendance: ${profil.event_severity_trend})` : ''}</td>
          </tr>
          ` : ''}
          ${profil.days_since_last_event != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Dernier événement:</strong></td>
            <td style="padding: 6px;">Il y a ${profil.days_since_last_event} jours</td>
          </tr>
          ` : ''}
          ${profil.bayesian_posterior != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Probabilité a posteriori (bayésien):</strong></td>
            <td style="padding: 6px;">${(profil.bayesian_posterior * 100).toFixed(1)}% ${profil.bayesian_black_swan ? '⚠️ Risque cygne noir' : ''}</td>
          </tr>
          ` : ''}
          ${profil.effectiveness_score != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Efficacité PAC:</strong></td>
            <td style="padding: 6px;">${profil.effectiveness_score}/100</td>
          </tr>
          ` : ''}
          ${profil.ensemble_confidence != null ? `
          <tr>
            <td style="padding: 6px;"><strong>Confiance ensemble:</strong></td>
            <td style="padding: 6px;">${profil.ensemble_confidence}%</td>
          </tr>
          ` : ''}
        </table>

        <!-- Critères C1-C5 -->
        <div style="margin-top: 15px;">
          <p style="font-weight: bold; margin-bottom: 10px;">Critères d'évaluation</p>
          ${[
            { label: 'C1 — Maturité SGS', value: profil.c1 },
            { label: 'C2 — Efficacité PAC', value: profil.c2 },
            { label: 'C3 — Conformité réglementaire', value: profil.c3 },
            { label: 'C4 — Charge critique', value: profil.c4 },
            { label: 'C5 — Résilience', value: profil.c5 },
          ].map(c => `
            <div style="margin: 8px 0;">
              <div style="display: flex; justify-content: space-between; font-size: 12px;">
                <span>${c.label}</span>
                <span style="font-weight: bold; color: ${getNiveauConfigHTML(c.value).color};">${c.value}/100</span>
              </div>
              <div style="margin-top: 3px; background-color: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
                <div style="background-color: ${getNiveauConfigHTML(c.value).color}; width: ${c.value}%; height: 100%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  ` : '';

  // Scénarios en annexe
  const scenariosHtml = profil?.scenarios && profil.scenarios.length > 0 ? `
    <h3>Annexe A-5: Analyse des scénarios et projections</h3>
    ${profil.scenarios.map(s => `
      <div style="margin: 12px 0; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong>${s.nom}</strong>
          <span style="font-size: 13px; color: ${getNiveauConfigHTML(s.scoreProjecte).color};">
            Score: ${s.scoreProjecte}/100 — Probabilité: ${s.probabilite}%
          </span>
        </div>
        <p style="margin: 8px 0; font-size: 12px; color: #374151;">${s.description}</p>
        <div style="margin: 5px 0; background-color: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden;">
          <div style="background-color: ${getNiveauConfigHTML(s.scoreProjecte).color}; width: ${s.probabilite}%; height: 100%;"></div>
        </div>
        <div style="font-size: 11px; color: #6b7280; margin: 5px 0;">
          Intervalle de confiance: [${s.intervalleConfiance[0]}, ${s.intervalleConfiance[1]}]
        </div>
        ${s.actionsRecommandees.length > 0 ? `
          <div style="margin-top: 8px; font-size: 12px;">
            <strong>Actions recommandées:</strong>
            <ul style="margin: 5px 0 0 20px;">
              ${s.actionsRecommandees.map(a => `<li>${a}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `).join('')}
  ` : '';

  return `
    <div>
      <h2>Annexes</h2>

      <h3>Annexe A-1: Fiches de présence</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Nom</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Structure</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Fonction</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Signature</th>
          </tr>
        </thead>
        <tbody>
          ${presenceRows || '<tr><td colspan="4" style="text-align: center;">Aucune fiche de présence</td></tr>'}
        </tbody>
      </table>

      ${checklistHtml || '<h3>Annexe A-2: Check-list renseignée</h3><p>Aucune check-list disponible</p>'}

      <h3>Annexe A-3: Écarts constatés</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Référence</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Réf. réglementaire</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Libellé</th>
            <th style="padding: 10px; border: 1px solid #e5e7eb;">Niveau</th>
          </tr>
        </thead>
        <tbody>
          ${ecartRows || '<tr><td colspan="4" style="text-align: center;">Aucun écart constaté</td></tr>'}
        </tbody>
      </table>

      ${profilHtml}
      ${scenariosHtml}
    </div>
  `;
}

/**
 * Obtenir la configuration HTML d'un niveau de score
 */
function getNiveauConfigHTML(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'Excellent', color: '#10b981' };
  if (score >= 60) return { label: 'Bon', color: '#3b82f6' };
  if (score >= 30) return { label: 'Modéré', color: '#f59e0b' };
  return { label: 'Critique', color: '#ef4444' };
}

/**
 * Générer le rapport complet en HTML
 */
export function generateRapportCompletHTML(
  sections: Record<string, string>,
  options?: {
    includeCSS?: boolean;
    pageSize?: 'A4' | 'Letter';
  }
): string {
  const pageSizeStyle = options?.pageSize === 'Letter' 
    ? 'width: 8.5in; min-height: 11in;' 
    : 'width: 210mm; min-height: 297mm;';

  const css = options?.includeCSS !== false ? `
    <style>
      body {
        font-family: 'Times New Roman', Times, serif;
        margin: 0;
        padding: 20px;
        background-color: #f3f4f6;
      }
      .rapport-container {
        max-width: 210mm;
        margin: 0 auto;
        background-color: white;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      .rapport-content {
        padding: 40px;
      }
      h1, h2, h3, h4 {
        color: #1a56db;
      }
      h1 { font-size: 28px; }
      h2 { font-size: 22px; margin-top: 30px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
      h3 { font-size: 18px; margin-top: 20px; }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #e5e7eb;
        padding: 8px;
        text-align: left;
      }
      th {
        background-color: #f3f4f6;
      }
      @media print {
        body {
          background-color: white;
          padding: 0;
        }
        .rapport-container {
          box-shadow: none;
          margin: 0;
          padding: 0;
        }
        .rapport-content {
          padding: 20px;
        }
        h2 {
          page-break-after: avoid;
        }
        table {
          page-break-inside: avoid;
        }
      }
    </style>
  ` : '';

  const content = Object.entries(sections)
    .map(([id, html]) => `<div id="${id}" style="page-break-before: ${id === 'page_garde' ? 'avoid' : 'always'};">${html}</div>`)
    .join('');

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <title>Rapport de surveillance</title>
      ${css}
    </head>
    <body>
      <div class="rapport-container" style="${pageSizeStyle}">
        <div class="rapport-content">
          ${content}
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Exporter les fonctions utilitaires
 */
export const rapportUtils = {
  calculateRapportStats,
  calculateRapportStatsByDomaine,
  formatEcartsForRapport,
  formatProfilForRapport,
  generatePageGardeHTML,
  generateTableMatiereHTML,
  generateEquipeInspectionHTML,
  generateResultatsHTML,
  generateAnnexesHTML,
  generateRapportCompletHTML,
};