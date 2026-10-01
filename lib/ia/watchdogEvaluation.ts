// lib/ia/watchdogEvaluation.ts
// Second regard AERORISQ sur l'ÉVALUATION MANUELLE d'un PAC : assistant +
// watch-dog. Pendant que l'inspecteur note, on confronte ses notes au dossier
// réel — constat, actions proposées, dates, responsables, historique
// (récidive) — et on lève des alertes ciblées s'il semble mal évaluer.
// Complète les alertes de cohérence notes-vs-notes du formulaire (qui ne
// voient pas le monde extérieur). 100 % déterministe : rapide, testé, sans LLM.

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
    (texte || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
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
