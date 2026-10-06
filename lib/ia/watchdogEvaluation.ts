// lib/ia/watchdogEvaluation.ts
// Second regard AERORISQ sur l'ÉVALUATION MANUELLE d'un PAC : assistant +
// watch-dog. Pendant que l'inspecteur note, on confronte ses notes au dossier
// réel — constat, actions proposées, dates, responsables, historique
// (récidive) — et on lève des alertes ciblées s'il semble mal évaluer.
// Complète les alertes de cohérence notes-vs-notes du formulaire (qui ne
// voient pas le monde extérieur). 100 % déterministe : rapide, testé, sans LLM.
// Couvre aussi la SOUMISSION (veillerSoumissionPAC, côté exploitant : plan
// hors-sujet, famélique ou vague détecté AVANT envoi) et les ÉVÉNEMENTS
// (veillerEvenement).

import { getRiskLevelFromCell } from '../risque/matrix';
import { DELAI_PAR_NIVEAU } from '../flux';
import { retirerDiacritiques } from '../domaines';

export interface AlerteWatchdog {
  niveau: 'danger' | 'warning' | 'info'
  titre: string
  detail: string
}

export interface ContexteWatchdog {
  notes: Record<string, number>
  decision: 'accepte' | 'reserve' | 'refuse' | ''
  libelleEcart: string
  domaine: string
  niveauRisque: string
  delaiRegularisation?: string | null
  actions: Array<{ description?: string; responsable?: string; date_prevue?: string }>
  /** Écarts clôturés du même site (récidive), hors écart courant. */
  antecedents: Array<{ libelle?: string; domaine?: string }>
  maintenant?: number
}

const MOTS_VIDES = new Set([
  'de', 'la', 'le', 'les', 'des', 'du', 'un', 'une', 'et', 'est', 'en', 'au', 'aux',
  'dans', 'par', 'pour', 'sur', 'avec', 'sans', 'pas', 'plus', 'tout', 'tous', 'toute',
  'son', 'sa', 'ses', 'leur', 'leurs', 'qui', 'que', 'quoi', 'dont', 'est', 'sont',
  'été', 'être', 'avoir', 'fait', 'faire', 'cet', 'cette', 'ces', 'ils', 'elles',
  'nous', 'vous', 'mais', 'comme', 'aussi', 'entre', 'chez', 'sous', 'the', 'of', 'to',
  'aérodrome', 'aeroport', 'exploitant', 'mise', 'oeuvre', 'place',
])

function motsSignificatifs(texte: string): Set<string> {
  return new Set(
    retirerDiacritiques((texte || '').toLowerCase())
      .split(/[^a-z0-9]+/)
      .filter(m => m.length > 2 && !MOTS_VIDES.has(m)),
  )
}

/** Part des mots-clés du constat repris dans les actions (0-1). */
export function recouvrementConstat(libelle: string, actions: Array<{ description?: string }>): number {
  const cles = motsSignificatifs(libelle)
  if (cles.size === 0) return 1
  const texteActions = actions.map(a => a.description || '').join(' ')
  const motsActions = motsSignificatifs(texteActions)
  let trouves = 0
  for (const m of cles) {
    if (motsActions.has(m)) { trouves++; continue }
    // Racine commune (piste/pistes, procédure/procédures…)
    for (const ma of motsActions) {
      if ((ma.startsWith(m) || m.startsWith(ma)) && Math.min(ma.length, m.length) >= 5) { trouves++; break }
    }
  }
  return trouves / cles.size
}

/** Ressemblance entre deux libellés (0-1) pour la récidive. */
export function ressemblance(a: string, b: string): number {
  const ma = motsSignificatifs(a)
  const mb = motsSignificatifs(b)
  if (ma.size === 0 || mb.size === 0) return 0
  let inter = 0
  for (const m of ma) if (mb.has(m)) inter++
  return inter / Math.max(ma.size, mb.size)
}

export function veillerEvaluationPAC(ctx: ContexteWatchdog): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const notes = ctx.notes || {}
  const n = (k: string) => notes[k] || 0
  const maintenant = ctx.maintenant ?? Date.now()
  const niveau = (ctx.niveauRisque || '').toLowerCase()

  // 1. Hors-sujet : pertinence haute mais actions sans rapport avec le constat.
  if (n('pertinence') >= 3 && ctx.actions.length > 0) {
    const rec = recouvrementConstat(ctx.libelleEcart, ctx.actions)
    if (rec < 0.25) {
      alertes.push({
        niveau: 'warning',
        titre: 'Action possiblement hors sujet',
        detail: `Pertinence notée ${n('pertinence')}/4 mais les actions ne reprennent presque aucun mot-clé du constat — vérifiez qu'elles traitent bien la cause (« ${(ctx.libelleEcart || '').slice(0, 80)}… »).`,
      })
    }
  }

  // 2. Délais : réalisme haut mais date passée ou au-delà du délai de régularisation.
  if (n('realisme') >= 3) {
    const dates = ctx.actions.map(a => a.date_prevue).filter(Boolean) as string[]
    const passee = dates.some(d => new Date(d).getTime() < maintenant)
    if (passee) {
      alertes.push({
        niveau: 'danger',
        titre: 'Échéance déjà dépassée',
        detail: `Réalisme noté ${n('realisme')}/4 alors qu'au moins une action a une date prévue passée — ce PAC n'est plus tenable en l'état.`,
      })
    } else if (ctx.delaiRegularisation) {
      const limite = new Date(ctx.delaiRegularisation).getTime()
      const depasse = dates.some(d => new Date(d).getTime() > limite)
      if (depasse) {
        alertes.push({
          niveau: 'warning',
          titre: 'Action au-delà du délai de régularisation',
          detail: `Une action finit après l'échéance de régularisation (${new Date(ctx.delaiRegularisation).toLocaleDateString('fr-FR')}) — le PAC ne régularise pas à temps.`,
        })
      }
    }
  }

  // 3. Responsable fantôme : spécificité haute mais personne nommée.
  if (n('specificite') >= 3) {
    const sansResponsable = ctx.actions.filter(a => !(a.responsable || '').trim())
    if (ctx.actions.length > 0 && sansResponsable.length === ctx.actions.length) {
      alertes.push({
        niveau: 'warning',
        titre: 'Aucun responsable nommé',
        detail: `Spécificité notée ${n('specificite')}/4 mais aucune action ne nomme de responsable — qui fait quoi ?`,
      })
    }
  }

  // 4. Indulgence : écart critique accepté avec des notes moyennes.
  const moyenne = ['pertinence', 'exhaustivite', 'precision', 'specificite', 'realisme', 'coherence']
    .reduce((s, k) => s + n(k), 0) / 6
  if (ctx.decision === 'accepte' && (niveau === 'critique' || niveau === 'eleve') && moyenne < 3) {
    alertes.push({
      niveau: 'danger',
      titre: `Indulgence suspecte sur écart ${niveau}`,
      detail: `Décision « accepté » avec une moyenne de ${Math.round(moyenne * 10) / 10}/4 sur un écart ${niveau} — durcissez les notes ou passez en « sous réserve ».`,
    })
  }

  // 5. Refus incohérent : tout est bien noté mais refusé.
  if (ctx.decision === 'refuse' && moyenne >= 3.5) {
    alertes.push({
      niveau: 'info',
      titre: 'Refus alors que tout est bien noté',
      detail: `Moyenne de ${Math.round(moyenne * 10) / 10}/4 mais décision « refusé » — motivez le refus en commentaire pour l'exploitant.`,
    })
  }

  // 6. Récidive : même famille déjà clôturée sur le site.
  const recidives = (ctx.antecedents || []).filter(a =>
    (a.domaine || '').toUpperCase() === (ctx.domaine || '').toUpperCase() &&
    ressemblance(a.libelle || '', ctx.libelleEcart) >= 0.5,
  )
  if (recidives.length > 0) {
    alertes.push({
      niveau: 'warning',
      titre: `Récidive probable (${recidives.length} antécédent(s))`,
      detail: 'Un écart très proche a déjà été clôturé sur ce site — exigez l’analyse de la cause racine avant d’accepter, sinon le PAC ne tiendra pas.',
    })
  }

  // 7. Plan famélique : une seule action pour un écart élevé/critique bien noté en exhaustivité.
  if (n('exhaustivite') >= 3 && ctx.actions.length === 1 && (niveau === 'critique' || niveau === 'eleve')) {
    alertes.push({
      niveau: 'warning',
      titre: 'Une seule action pour un écart grave',
      detail: `Exhaustivité notée ${n('exhaustivite')}/4 avec une unique action sur un écart ${niveau} — un plan sérieux en comporte généralement plusieurs (cause, correction, prévention).`,
    })
  }

  return alertes
}

// ── SOUMISSION du PAC (côté exploitant, avant envoi) ────────

export interface ContexteSoumissionPAC {
  libelleEcart: string
  domaine?: string
  niveauRisque: string
  actions: Array<{ description?: string; responsable?: string; date_prevue?: string }>
}

/**
 * Second regard sur le plan AVANT envoi : évite l'aller-retour
 * soumission → refus pour un plan hors-sujet, famélique ou vague.
 * Non bloquant (avertissements), la validation dure reste au formulaire.
 */
export function veillerSoumissionPAC(ctx: ContexteSoumissionPAC): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const niveau = (ctx.niveauRisque || '').toLowerCase()
  const renseignees = (ctx.actions || []).filter(a => (a.description || '').trim())
  if (renseignees.length === 0) return alertes

  // 1. Hors-sujet : les actions ne reprennent pas le vocabulaire du constat.
  const rec = recouvrementConstat(ctx.libelleEcart, renseignees)
  if (rec < 0.25) {
    alertes.push({
      niveau: 'warning',
      titre: 'Plan possiblement hors sujet',
      detail: `Vos actions reprennent presque aucun mot-clé du constat (« ${(ctx.libelleEcart || '').slice(0, 80)}… ») — vérifiez qu'elles traitent bien la cause, sinon l'inspecteur refusera.`,
    })
  }

  // 2. Plan famélique : une seule action pour un écart grave.
  if (renseignees.length === 1 && (niveau === 'critique' || niveau === 'eleve')) {
    alertes.push({
      niveau: 'warning',
      titre: 'Une seule action pour un écart grave',
      detail: `Un plan sérieux comporte généralement plusieurs actions (cause, correction, prévention) — avec une seule, le refus est probable.`,
    })
  }

  // 3. Descriptions vagues (< 20 caractères) : inexploitables à l'évaluation.
  const vagues = renseignees.filter(a => (a.description || '').trim().length < 20)
  if (vagues.length > 0) {
    alertes.push({
      niveau: 'info',
      titre: `Description(s) trop vague(s) (${vagues.length})`,
      detail: 'Précisez quoi, où et comment — une action inexploitable sera refusée.',
    })
  }

  // 4. Tout tient sur une seule date : pas de phasage cause/correction/prévention.
  const dates = [...new Set(renseignees.map(a => a.date_prevue).filter(Boolean))]
  if (renseignees.length >= 2 && dates.length === 1) {
    alertes.push({
      niveau: 'info',
      titre: 'Échéances identiques',
      detail: 'Toutes vos actions finissent le même jour — phasez si possible (correction immédiate, prévention ensuite).',
    })
  }

  return alertes
}

// ── COHÉRENCE D'ENSEMBLE d'une checklist ────────────────────

export interface ItemCoherence {
  id: string
  /** Référence réglementaire ou numéro (contradictions). */
  ref?: string
  /** Énoncé de la question / libellé. */
  texte?: string
  /** Résultat standard/Suivi/PAC (SA/NS/NV/NA) — absent pour SGS. */
  resultat?: string
  /** Vrai si évalué (standard/PAC/suivi : résultat valide ; SGS : niveau ≠ absent). */
  evalue: boolean
  observation?: string
  observation_stylus_data?: string
  /** Critères/directives affichés pour juger (cohérence technique). */
  directives?: string[]
}

export interface ContexteCoherenceChecklist {
  items: ItemCoherence[]
  /** Niveau du profil du site (tout-SA suspect sur site à risque). */
  niveauRisqueSite?: string
  /** Antécédents NS (tout-SA suspect si site déjà non conforme). */
  aDesAntecedentsNS?: boolean
}

export interface BilanCoherence {
  alertes: AlerteWatchdog[]
  /** % d'items évalués sans observation (miroir d'exigence). */
  tauxSansObservation: number
  nbEvalues: number
}

const normRef = (ref?: string): string => (ref || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Œil de regard d'ensemble : contradictions sur une même exigence,
 * tout-SA suspect, copier-coller d'observations, cohérence technique
 * (base réglementaire, énoncé). L'inspecteur tranche toujours (avis).
 */
export function veillerCoherenceChecklist(ctx: ContexteCoherenceChecklist): BilanCoherence {
  const alertes: AlerteWatchdog[] = []
  const items = ctx.items || []
  const evalues = items.filter(i => i.evalue)
  const obsDe = (i: ItemCoherence): string =>
    ((i.observation || '') + '\n' + (i.observation_stylus_data || '')).trim()

  // 1. Contradiction : même exigence jugée SA et NS.
  const parRef = new Map<string, ItemCoherence[]>()
  for (const item of evalues) {
    const ref = normRef(item.ref)
    if (!ref || !item.resultat) continue
    const liste = parRef.get(ref) ?? []
    liste.push(item)
    parRef.set(ref, liste)
  }
  let contradictions = 0
  for (const [ref, liste] of parRef) {
    const resultats = new Set(liste.map(i => (i.resultat || '').toUpperCase()))
    if (resultats.has('SA') && resultats.has('NS') && contradictions < 5) {
      contradictions++
      alertes.push({
        niveau: 'warning',
        titre: `Exigence contradictoire (${ref || 'sans réf'})`,
        detail: `La même exigence est jugée Satisfaisante ici et Non satisfaisante là (${liste.length} items) — tranchez, les deux ne peuvent être vrais.`,
      })
    }
  }

  // 2. Tout-SA suspect : aucun écart sur site à risque ou avec antécédents.
  const niveauSite = (ctx.niveauRisqueSite || '').toLowerCase()
  if (evalues.length >= 3 && evalues.every(i => !i.resultat || (i.resultat || '').toUpperCase() === 'SA') &&
    (niveauSite === 'eleve' || niveauSite === 'critique' || ctx.aDesAntecedentsNS)) {
    alertes.push({
      niveau: 'info',
      titre: 'Aucune non-conformité relevée',
      detail: `100 % Satisfaisant sur un site ${niveauSite || 'avec antécédents'} — tout est-il couvert ? Second regard renforcé, sans remettre en cause un bon travail.`,
    })
  }

  // 3. Copier-coller : même observation (≥15 car.) sur ≥3 items.
  const parObs = new Map<string, number>()
  for (const item of evalues) {
    const obs = obsDe(item)
    if (obs.length >= 15) parObs.set(obs, (parObs.get(obs) || 0) + 1)
  }
  for (const [obs, n] of parObs) {
    if (n >= 3) {
      alertes.push({
        niveau: 'warning',
        titre: `Observation dupliquée (${n} items)`,
        detail: `« ${obs.slice(0, 80)}… » recopié sur ${n} items — personnalisez chaque constat, sinon l'évaluation semble bâclée.`,
      })
      break
    }
  }

  // 4. Technique : NS sans base réglementaire (écart fragile en instruction).
  const nsSansRef = evalues.filter(i =>
    (i.resultat || '').toUpperCase() === 'NS' && !normRef(i.ref))
  if (nsSansRef.length > 0) {
    alertes.push({
      niveau: 'warning',
      titre: `NS sans référence réglementaire (${nsSansRef.length})`,
      detail: 'Une non-conformité sans ancrage RAS/OACI est fragile — les écarts qui en découleront aussi.',
    })
  }

  // 5. Technique : item évalué sans énoncé ni critères affichés.
  const sansEnonce = evalues.filter(i =>
    !(i.texte || '').trim() && (i.directives || []).filter(d => (d || '').trim()).length === 0)
  if (sansEnonce.length > 0) {
    alertes.push({
      niveau: 'info',
      titre: `Évalué sans énoncé ni critères (${sansEnonce.length})`,
      detail: 'On ne sait pas ce qui a été vérifié — complétez l’énoncé ou les critères avant de signer.',
    })
  }

  // 6. Jauge d'exigence : % d'évalués sans observation.
  const sansObs = evalues.filter(i => !obsDe(i)).length
  const tauxSansObservation = evalues.length > 0 ? Math.round((sansObs / evalues.length) * 100) : 0

  return { alertes, tauxSansObservation, nbEvalues: evalues.length }
}

// ── RÉDACTION d'écart (brouillon, avant sauvegarde) ─────────

export interface ContexteRedactionEcart {
  libelle: string
  ref_reglementaire?: string
  niveau: string
  cellule_oaci?: string
  /** Délais saisis en jours (formulaire) — comparés au barème du niveau. */
  delai_pac_jours?: number
  delai_regularisation_jours?: number
  isSGS?: boolean
}

/**
 * Second regard sur le brouillon d'écart : référence manquante, cellule
 * incohérente avec le niveau, délais incohérents avec le niveau.
 * Non bloquant (le garde anti-doublon reste dans le composant).
 */
export function veillerRedactionEcart(ctx: ContexteRedactionEcart): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  if (!(ctx.libelle || '').trim()) return alertes

  // 1. Sans référence réglementaire : écart faible juridiquement.
  if (!(ctx.ref_reglementaire || '').trim()) {
    alertes.push({
      niveau: 'warning',
      titre: 'Sans référence réglementaire',
      detail: 'Un écart sans ancrage RAS/OACI est fragile en instruction — reprenez la référence proposée par l\u2019IA ou saisissez-la.',
    })
  }

  // 2. Cellule OACI incohérente avec le niveau (hors SGS : pas de matrice).
  if (!ctx.isSGS && ctx.cellule_oaci && /^[1-5][A-E]$/i.test(ctx.cellule_oaci)) {
    try {
      const attendu = String(getRiskLevelFromCell(ctx.cellule_oaci.toUpperCase())).toLowerCase()
      const declare = (ctx.niveau || '').toLowerCase()
      if (attendu && declare && attendu !== declare) {
        alertes.push({
          niveau: 'danger',
          titre: 'Cellule / niveau incohérents',
          detail: `La cellule ${ctx.cellule_oaci.toUpperCase()} correspond à un niveau « ${attendu} », pas « ${declare} » — alignez les deux.`,
        })
      }
    } catch { /* matrice indisponible : pas d'alerte */ }
  }

  // 3. Délais incohérents avec le niveau (barème unique lib/flux.ts).
  const bareme = DELAI_PAR_NIVEAU[(ctx.niveau || '').toLowerCase() as keyof typeof DELAI_PAR_NIVEAU]
  if (bareme && typeof ctx.delai_pac_jours === 'number' && ctx.delai_pac_jours > bareme.pac * 3) {
    alertes.push({
      niveau: 'warning',
      titre: 'Délai PAC incohérent avec le niveau',
      detail: `Délai d'envoi de ${ctx.delai_pac_jours} j pour un écart ${ctx.niveau} (barème : ${bareme.pac} j) — resserrez ou justifiez.`,
    })
  }
  if (bareme && typeof ctx.delai_regularisation_jours === 'number' && ctx.delai_regularisation_jours > bareme.regularisation * 3) {
    alertes.push({
      niveau: 'warning',
      titre: 'Délai de régularisation incohérent avec le niveau',
      detail: `Régularisation en ${ctx.delai_regularisation_jours} j pour un écart ${ctx.niveau} (barème : ${bareme.regularisation} j) — resserrez ou justifiez.`,
    })
  }

  return alertes
}

// ── ÉVÉNEMENTS de sécurité (déclaration) ────────────────────

export interface ContexteEvenement {
  type: string
  gravite: string
  description: string
  actions_immediates?: string
  services_alertes?: string[]
  blesses_mortels?: number
  blesses_graves?: number
  dommages_desc?: string
  date?: string
  /** Événements récents du même site (doublon / série). */
  recents: Array<{ type?: string; description?: string; date?: string }>
  maintenant?: number
}

/**
 * Second regard à la déclaration : gravité sous-évaluée, alerte grave sans
 * services prévenus, doublon probable. Non bloquant.
 */
export function veillerEvenement(ctx: ContexteEvenement): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const gravite = (ctx.gravite || 'faible').toLowerCase()
  const victimes = (ctx.blesses_mortels || 0) + (ctx.blesses_graves || 0)

  // 1. Sous-évaluation : des morts/blessés graves mais gravité faible/moyenne.
  if (victimes > 0 && (gravite === 'faible' || gravite === 'moyen')) {
    alertes.push({
      niveau: 'danger',
      titre: 'Gravité sous-évaluée ?',
      detail: `${ctx.blesses_mortels || 0} mort(s) / ${ctx.blesses_graves || 0} blessé(s) grave(s) avec une gravité « ${gravite} » — relevez la gravité, cela change les délais de notification.`,
    })
  }

  // 2. Grave sans services prévenus.
  if ((gravite === 'critique' || gravite === 'eleve') && (ctx.services_alertes || []).length === 0) {
    alertes.push({
      niveau: 'warning',
      titre: 'Aucun service alerté',
      detail: `Événement ${gravite} sans aucun service prévenu — Pompiers, SAMU, Gendarmerie selon le cas.`,
    })
  }

  // 3. Actions immédiates vagues sur événement grave.
  if ((gravite === 'critique' || gravite === 'eleve') && (ctx.actions_immediates || '').trim().length < 30) {
    alertes.push({
      niveau: 'warning',
      titre: 'Actions immédiates trop vagues',
      detail: 'Décrivez concrètement ce qui a été fait sur le champ (périmètre, évacuation, fermeture…) — 30 caractères minimum pour un événement grave.',
    })
  }

  // 4. Doublon probable : événement très proche sur le même site (30 j).
  const maintenant = ctx.maintenant ?? Date.now()
  const trenteJours = 30 * 86400000
  const doublons = (ctx.recents || []).filter(r => {
    const t = new Date(r.date || '').getTime()
    if (isNaN(t) || maintenant - t > trenteJours) return false
    return ressemblance(r.description || '', ctx.description) >= 0.6
  })
  if (doublons.length > 0) {
    alertes.push({
      niveau: 'info',
      titre: `Doublon probable (${doublons.length})`,
      detail: 'Un événement très proche a été déclaré sur ce site ces 30 derniers jours — même cause ? Lier plutôt que dupliquer.',
    })
  }

  return alertes
}

// ── Évaluation des PREUVES ──────────────────────────────────

export interface ContexteWatchdogPreuves {
  notes: Record<string, number>
  decision: 'valide' | 'refuse' | 'reserve' | ''
  nbPreuves: number
  niveauRisque: string
}

/** Second regard sur l'évaluation manuelle des preuves déposées. */
export function veillerEvaluationPreuves(ctx: ContexteWatchdogPreuves): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const n = (k: string) => ctx.notes[k] || 0
  const niveau = (ctx.niveauRisque || '').toLowerCase()
  const moyenne = ['completude', 'qualite', 'pertinence', 'tracabilite', 'efficacite']
    .reduce((s, k) => s + n(k), 0) / 5

  if (ctx.decision === 'valide' && ctx.nbPreuves === 0) {
    alertes.push({
      niveau: 'danger',
      titre: 'Validation sans aucune preuve jointe',
      detail: 'Décision « validé » alors qu’aucun fichier de preuve n’est joint — sur quoi porte la validation ?',
    })
  }
  if (n('efficacite') >= 3 && ctx.nbPreuves === 0) {
    alertes.push({
      niveau: 'warning',
      titre: 'Efficacité haute sans preuve',
      detail: `Efficacité notée ${n('efficacite')}/4 sans preuve jointe — l’efficacité se prouve, elle ne se déclare pas.`,
    })
  }
  if (ctx.decision === 'valide' && (niveau === 'critique' || niveau === 'eleve') && moyenne < 3) {
    alertes.push({
      niveau: 'danger',
      titre: `Indulgence suspecte sur écart ${niveau}`,
      detail: `Décision « validé » avec une moyenne de ${Math.round(moyenne * 10) / 10}/5 sur un écart ${niveau} — durcissez ou passez en « sous réserve ».`,
    })
  }
  if (ctx.decision === 'refuse' && moyenne >= 3.5) {
    alertes.push({
      niveau: 'info',
      titre: 'Refus alors que tout est bien noté',
      detail: `Moyenne de ${Math.round(moyenne * 10) / 10}/5 mais décision « refusé » — motivez le refus en commentaire.`,
    })
  }
  if (n('tracabilite') >= 3 && n('qualite') <= 1) {
    alertes.push({
      niveau: 'warning',
      titre: 'Traçabilité haute mais qualité faible',
      detail: 'Des preuves tracées mais de qualité insuffisante ne prouvent rien — exigez des pièces exploitables.',
    })
  }
  return alertes
}

// ── Checklist SUIVI DES ÉCARTS (items EcartEvaluation) ──────

export interface ItemSuiviVue {
  conclusion?: string
  commentaire?: string
  preuves?: Array<unknown>
  statut_mesure?: string
  risque_initial?: string
  risque_residuel?: string
}

const ORDRE_RISQUE = ['faible', 'moyen', 'eleve', 'critique']

/** Second regard sur un item du suivi des écarts. */
export function veillerItemSuivi(item: ItemSuiviVue): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const conclusion = (item.conclusion || '').toUpperCase()
  const nbPreuves = (item.preuves || []).length

  if (conclusion === 'SA') {
    if (!(item.commentaire || '').trim()) {
      alertes.push({
        niveau: 'warning',
        titre: 'Soldé sans justification',
        detail: 'Conclusion SA (satisfaisant) sans aucun commentaire — décrivez ce qui a été constaté sur le terrain.',
      })
    }
    if (nbPreuves === 0) {
      alertes.push({
        niveau: 'warning',
        titre: 'Soldé sans preuve',
        detail: 'Conclusion SA sans preuve jointe — joignez au moins une pièce (photo, relevé, document).',
      })
    }
    if ((item.statut_mesure || 'aucune') === 'aucune') {
      alertes.push({
        niveau: 'info',
        titre: 'Soldé sans mesure associée',
        detail: 'Conclusion SA alors qu’aucune mesure n’est déclarée (ni prévue, ni réalisée) — vérifiez la cohérence.',
      })
    }
    const ini = ORDRE_RISQUE.indexOf((item.risque_initial || '').toLowerCase())
    const res = ORDRE_RISQUE.indexOf((item.risque_residuel || '').toLowerCase())
    if (ini >= 0 && res >= 0 && res >= ini && ini >= 2) {
      alertes.push({
        niveau: 'danger',
        titre: 'Risque non réduit mais soldé',
        detail: `Risque résiduel (${item.risque_residuel}) égal ou supérieur à l’initial (${item.risque_initial}) avec conclusion SA — incohérent.`,
      })
    }
    if (res === 3) {
      alertes.push({
        niveau: 'danger',
        titre: 'Résiduel critique soldé',
        detail: 'Risque résiduel critique avec conclusion SA — un risque critique ne se solde pas, il se traite.',
      })
    }
  }
  if (conclusion === 'NS' && !(item.commentaire || '').trim()) {
    alertes.push({
      niveau: 'warning',
      titre: 'Non-satisfaisant non décrit',
      detail: 'Conclusion NS sans commentaire — décrivez le constat pour nourrir l’écart qui en découlera.',
    })
  }
  return alertes
}

// ── Checklist MISE EN ŒUVRE PAC (items ItemVerification) ────

export interface ItemPACVue {
  resultat?: string
  observation?: string
  preuves?: Array<unknown>
  efficacite?: number | null
  datePrevue?: string | null
  niveauEcart?: string
  risqueResiduel?: string | null
  maintenant?: number
}

/**
 * NS sans observation : bloque la signature (chaque non-conformité doit être
 * justifiée — elle nourrira l'écart). SA sans observation : simple alerte.
 */
export function compterNSsansObservation(
  items: Array<{ resultat?: string; observation?: string; observation_stylus_data?: string }>,
): number {
  return items.filter(i =>
    (i.resultat || '').toUpperCase() === 'NS' &&
    !(i.observation || '').trim() &&
    !(i.observation_stylus_data || '').trim(),
  ).length
}

/** Second regard sur un item de la checklist STANDARD (SA/NS/NA/NV). */
export function veillerItemStandard(item: {
  resultat?: string
  observation?: string
  preuves?: Array<unknown>
  fichiers?: Array<unknown>
  libelle?: string
  description?: string
  point_verification?: string
}): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const resultat = (item.resultat || '').toUpperCase()
  if (!resultat || resultat === 'NV') return alertes
  const texte = item.libelle || item.description || item.point_verification || 'cet item'
  const obs = (item.observation || '').trim()
  const nbPreuves = (item.preuves || []).length + (item.fichiers || []).length

  if (resultat === 'NS' && !obs) {
    alertes.push({
      niveau: 'warning',
      titre: 'Non-satisfaisant non décrit',
      detail: `« ${texte.slice(0, 80)} » noté NS sans observation — décrivez le constat constaté pour justifier l’écart.`,
    })
  }
  if (resultat === 'SA') {
    if (!obs) {
      alertes.push({
        niveau: 'info',
        titre: 'SA sans observation',
        detail: `« ${texte.slice(0, 80)} » noté SA sans observation — une ligne de constat renforce la crédibilité.`,
      })
    }
    if (nbPreuves === 0) {
      alertes.push({
        niveau: 'info',
        titre: 'SA sans preuve jointe',
        detail: 'Aucune preuve jointe — recommandé pour les items critiques même satisfaisants.',
      })
    }
  }
  if (resultat === 'NA' && !obs) {
    alertes.push({
      niveau: 'info',
      titre: 'NA sans motif',
      detail: 'Non-applicable sans motif — indiquez pourquoi (une ligne suffit).',
    })
  }
  return alertes
}

/** Second regard sur les questions SGS d'un élément (niveaux absent→efficace). */
export function veillerSGSQuestions(questions: Array<{
  id?: string
  ref?: string
  texte?: string
  niveau?: string
  justification?: string
  observation?: string
  preuves?: Array<unknown>
  statutIA?: string
}>): { restants: string[]; alertes: AlerteWatchdog[] } {
  const restants: string[] = []
  const alertes: AlerteWatchdog[] = []
  for (const q of questions) {
    const niveau = (q.niveau || 'absent').toLowerCase()
    const touchee = !!(q.justification || '').trim() || (q.preuves || []).length > 0 || !!(q.observation || '').trim()
    // Non évaluée : niveau par défaut 'absent' sans aucune trace de travail.
    if (niveau === 'absent' && !touchee) {
      restants.push(q.ref || q.id || 'question')
      continue
    }
    if ((niveau === 'efficace' || niveau === 'operationnel') && !touchee) {
      alertes.push({
        niveau: 'info',
        titre: `${niveau} sans justification ni preuve`,
        detail: `« ${(q.texte || q.ref || '').slice(0, 80)} » évalué ${niveau} sans justification ni preuve — justifiez en une phrase.`,
      })
    }
  }
  return { restants, alertes }
}

/** Second regard sur un élément SGS PAOE (niveaux N0-N5). */
export function veillerSGSElement(element: {
  elementId?: string
  label?: string
  niveauGlobal?: string
  score?: number
  noteLibre?: string
}): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const niveau = (element.niveauGlobal || 'N0').toUpperCase()
  const label = element.label || element.elementId || 'cet élément'

  if (niveau === 'N0') return alertes // Les non-évalués vont dans la liste des restants, pas en alerte.
  if ((niveau === 'N5' || niveau === 'N4') && !(element.noteLibre || '').trim()) {
    alertes.push({
      niveau: 'info',
      titre: `${niveau} sans justification`,
      detail: `« ${label} » évalué ${niveau} sans note — justifiez l’excellence en une phrase.`,
    })
  }
  if (niveau === 'N1' && (element.score || 0) >= 20) {
    alertes.push({
      niveau: 'warning',
      titre: 'Score/niveau incohérents',
      detail: `« ${label} » : score ${element.score} mais niveau N1 (Absent) — revérifiez la notation.`,
    })
  }
  return alertes
}

/** Second regard sur un item de la mise en œuvre PAC. */
export function veillerItemPACAction(item: ItemPACVue): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const resultat = (item.resultat || '').toUpperCase()
  const nbPreuves = (item.preuves || []).length
  const maintenant = item.maintenant ?? Date.now()

  if (resultat === 'SA') {
    if (!(item.observation || '').trim()) {
      alertes.push({
        niveau: 'warning',
        titre: 'SA sans observation',
        detail: 'Résultat SA sans observation terrain — que s’est-il passé lors de la vérification ?',
      })
    }
    if (nbPreuves === 0) {
      alertes.push({
        niveau: 'warning',
        titre: 'SA sans preuve',
        detail: 'Résultat SA sans preuve jointe — la mise en œuvre doit être prouvée.',
      })
    }
    if (item.efficacite != null && item.efficacite < 50) {
      alertes.push({
        niveau: 'danger',
        titre: 'Efficacité faible mais SA',
        detail: `Efficacité à ${item.efficacite} % avec résultat SA — incohérent, repassez en NS ou justifiez.`,
      })
    }
  }
  if (resultat === 'NS' && !(item.observation || '').trim()) {
    alertes.push({
      niveau: 'warning',
      titre: 'NS sans observation',
      detail: 'Résultat NS sans observation — décrivez l’écart constaté pour le suivi.',
    })
  }
  if (item.datePrevue) {
    const t = new Date(item.datePrevue).getTime()
    if (Number.isFinite(t) && t < maintenant && resultat !== 'SA') {
      alertes.push({
        niveau: 'warning',
        titre: 'Échéance dépassée',
        detail: `Date prévue (${new Date(item.datePrevue).toLocaleDateString('fr-FR')}) dépassée sans résultat SA — replanifier ou justifier.`,
      })
    }
  }
  if (resultat === 'SA' && (item.risqueResiduel || '').toLowerCase() === 'critique') {
    alertes.push({
      niveau: 'danger',
      titre: 'Résiduel critique avec SA',
      detail: 'Risque résiduel critique et résultat SA — incohérent.',
    })
  }
  return alertes
}

// ── QUALITÉ DES QUESTIONS (lecture + génération) ─────────────────────
// Second regard sur la STRUCTURE des questions : doublons (la même exigence
// posée deux fois, y compris entre deux domaines), questions sans ancrage
// réglementaire, énoncés trop vagues. 100 % déterministe, sans LLM.

/** Seuil de ressemblance au-delà duquel deux questions sont doublons. */
export const SEUIL_DOUBLON_QUESTION = 0.7
/** Longueur minimale d'un énoncé (caractères significatifs) pour ne pas être vague. */
export const LONGUEUR_MIN_QUESTION = 20

export interface QuestionVue {
  id?: string
  ref?: string
  texte?: string
  domaine?: string
}

export interface QuestionVue {
  id?: string
  ref?: string
  texte?: string
  domaine?: string
}

/**
 * Doublons + qualité des énoncés sur une checklist (tous domaines confondus) :
 * accepte le même ItemCoherence que les 3 vues construisent déjà pour
 * veillerCoherenceChecklist (champs id/ref/texte compatibles) comme les
 * questions générées { id, ref, texte } — aucun nouveau câblage de données.
 */
export function veillerQuestionsChecklist(items: QuestionVue[]): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const qs = (items || [])
    .map((q, idx) => ({ q, texte: (q.texte || '').trim(), idx }))
    .filter(e => e.texte.length > 0)
  if (qs.length < 1) return alertes

  // 1. Doublons de questions (ressemblance >= 0.7), intra + inter-domaines.
  let doublons = 0
  const signales = new Set<number>()
  for (let i = 0; i < qs.length && doublons < 5; i++) {
    if (signales.has(i)) continue
    for (let j = i + 1; j < qs.length && doublons < 5; j++) {
      if (signales.has(j)) continue
      const score = ressemblance(qs[i].texte, qs[j].texte)
      if (score >= SEUIL_DOUBLON_QUESTION) {
        doublons++
        signales.add(j)
        const a = qs[i].q.ref || qs[i].q.id || `#${i + 1}`
        const b = qs[j].q.ref || qs[j].q.id || `#${j + 1}`
        alertes.push({
          niveau: 'warning',
          titre: `Question en double (${a} ≈ ${b})`,
          detail: `« ${qs[i].texte.slice(0, 90)} » ressemble à « ${qs[j].texte.slice(0, 90)} » (score ${Math.round(score * 100)} %) — fusionnez ou supprimez l'une des deux.`,
        })
      }
    }
  }

  // 2. Questions sans référence réglementaire (fragiles juridiquement).
  const sansRef = qs.filter(e => !normRef(e.q.ref))
  if (sansRef.length > 0) {
    alertes.push({
      niveau: 'warning',
      titre: `Question(s) sans référence réglementaire (${sansRef.length})`,
      detail: `Ex : ${sansRef.slice(0, 3).map(e => `« ${e.texte.slice(0, 60)} »`).join(' ; ')} — un constat dessus sera fragile en instruction.`,
    })
  }

  // 3. Énoncés trop courts (vagues, invérifiables).
  const vagues = qs.filter(e =>
    e.texte.replace(/[^a-zA-Z0-9àâäéèêëîïôöùûüç]/gi, '').length < LONGUEUR_MIN_QUESTION,
  )
  if (vagues.length > 0) {
    alertes.push({
      niveau: 'info',
      titre: `Énoncé(s) trop vague(s) (${vagues.length})`,
      detail: `Ex : ${vagues.slice(0, 3).map(e => `« ${e.texte.slice(0, 60)} »`).join(' ; ')} — précisez l'objet vérifié et le critère attendu.`,
    })
  }
  return alertes
}

/**
 * Contrôle structuré des directives SA/NS à la GÉNÉRATION (items Kit) :
 * critères vides ou identiques = critère inutile (l'inspecteur ne peut pas
 * trancher). Appelé par kitDocAgent après génération — journalisé, jamais
 * de suppression silencieuse.
 */
export function controlerDirectivesItems(
  items: Array<{ numero?: string; directive_sa?: string; directive_ns?: string }>,
): AlerteWatchdog[] {
  const alertes: AlerteWatchdog[] = []
  const norm = (t?: string) =>
    retirerDiacritiques((t || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()
  for (const item of items || []) {
    const sa = norm(item.directive_sa)
    const ns = norm(item.directive_ns)
    const num = item.numero || '?'
    if (!sa || !ns) {
      alertes.push({
        niveau: 'info',
        titre: `Directives incomplètes (${num})`,
        detail: `Item ${num} : directive SA ou NS vide — l'inspecteur n'a pas de critère objectif pour trancher.`,
      })
    } else if (sa === ns) {
      alertes.push({
        niveau: 'warning',
        titre: `Critères SA/NS identiques (${num})`,
        detail: `Item ${num} : le critère Satisfaisant et Non Satisfaisant disent la même chose — distinguez-les (seuil, état, présence/absence).`,
      })
    }
  }
  return alertes
}

const LIBELLES_RETOUCHES: Record<string, string> = {
  directive_ns: 'critères Non Satisfaisant',
  directive_sa: 'critères Satisfaisant',
  directive_preuve: 'guides de preuve étape par étape',
  directive_nv: 'critères Non Vérifiable',
  directive_na: 'critères Non Applicable',
  point_verification: 'formulation des questions',
  reference_reglementaire: 'références §',
  sous_domaine: 'rattachement aux sous-domaines',
}

/**
 * P2 — la boucle formulation se referme ici : les champs que les inspecteurs
 * recorrigent le plus (getTextDeltaStats) deviennent une exigence explicite
 * injectée dans le prompt de génération des items.
 */
export function formulerConsigneRetouches(
  topFields: Array<{ field: string; count: number }>,
): string {
  const tops = (topFields || []).filter(f => f && f.count > 0).slice(0, 3)
  if (tops.length === 0) return ''
  const cites = tops.map(t => `« ${LIBELLES_RETOUCHES[t.field] || t.field} » (${t.count}×)`)
  return `EXIGENCE QUALITÉ — les inspecteurs recorrigent souvent ${cites.join(', ')} : soigne particulièrement ces champs (critères chiffrés, SA≠NS discriminants, jamais vides).`
}
