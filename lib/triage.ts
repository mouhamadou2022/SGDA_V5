// lib/triage.ts
// File de traitement DERIVEE (aucune table, aucun trigger, aucun RLS) :
// a chaque ouverture, chaque role voit ce qu'il a recu, ce qui n'est pas
// traite et ce qui est urgent — calcule en pur depuis le store existant
// (offline-safe, zero migration, zero divergence de source).
// Pertinence par role : l'admin assigne, l'inspecteur execute, l'exploitant
// agit sur son aérodrome, le DG lit. Aucune action proposee hors role.

export type TriageNiveau = 'danger' | 'warning' | 'info';
export type TriageFamille = 'evenement' | 'ecart' | 'preuve' | 'surveillance' | 'message' | 'alerte';

export interface TriageItem {
  /** Cle stable famille:id (jamais de collision inter-familles). */
  id: string;
  famille: TriageFamille;
  titre: string;
  detail: string;
  aerodromeId?: string;
  aerodromeNom?: string;
  niveau: TriageNiveau;
  enRetard: boolean;
  echeance?: string | null;
  module: string;
  /** Libelle du CTA, toujours pertinent pour le role (jamais d'assignation hors admin). */
  action: string;
  /** Niveau de risque métier (gravité / niveau_risque) pour le badge canonique. */
  niveauRisque?: string;
  /**
   * Relance automatique (admin uniquement) : au lieu de naviguer, le CTA
   * envoie un message de rappel à l'inspecteur concerné. L'admin n'évalue
   * jamais (PAC, preuves, écarts) — c'est le travail des inspecteurs.
   */
  relance?: {
    /** inspecteur_ref_id de l'écart (destinataire). */
    destinataireId: string;
    /** Objet du message. */
    objet: string;
    /** Corps du message. */
    corps: string;
  };
}

export interface TriageCompteurs {
  nonAssignes: number;
  enRetard: number;
  aValider: number;
  messages: number;
  alertes: number;
  total: number;
}

export interface TriageResultat {
  items: TriageItem[];
  compteurs: TriageCompteurs;
}

// ── Entrees structurelles (les entites du store passent telles quelles) ──

export interface EntreeTriEvenement {
  id: string;
  reference?: string;
  aerodrome_id?: string;
  statut?: string;
  gravite?: string;
  type?: string;
  created_at?: string;
  inspecteur_id?: string | null;
  equipe_ids?: string[];
  chef_id?: string;
  responsable_id?: string;
}

export interface EntreeTriEcart {
  id: string;
  reference?: string;
  aerodrome_id?: string;
  statut?: string;
  niveau_risque?: string;
  libelle?: string;
  inspecteur_ref_id?: string;
  delai_pac?: string;
  delai_regularisation?: string;
  created_at?: string;
  evaluation_pac?: { deadline?: string; evalue_le?: string } | null;
  validation_preuves?: { deadline?: string; valide_le?: string } | null;
}

export interface EntreeTriSurveillance {
  id: string;
  aerodrome_id?: string;
  type?: string;
  statut?: string;
  equipe_ids?: string[];
  chef_id?: string;
  date_debut?: string;
}

export interface EntreeTriMessage {
  id: string;
  to_id?: string | string[];
  cc_id?: string[];
  read_at?: string | null;
  subject?: string;
  from_nom?: string;
  created_at?: string;
}

export interface EntreeTriProfil {
  aerodrome_id?: string;
  score_global?: number;
}

export interface EntreesTriage {
  evenements: EntreeTriEvenement[];
  ecarts: EntreeTriEcart[];
  surveillances: EntreeTriSurveillance[];
  messages: EntreeTriMessage[];
  nomsAerodromes?: Record<string, string>;
  /** Profils de risque (alertes transverse : scores critiques). */
  profils?: EntreeTriProfil[];
  /** Recalibrations ML en attente (admin) — compteur pré-calculé. */
  mlRecalEnAttente?: number;
}

// ── Helpers ──

const STATUTS_ECART_CLOTURES = new Set(['cloture']);
const STATUTS_EVT_CLOTURES = new Set(['cloture', 'refuse']);

function estEnRetard(echeance: string | null | undefined, maintenant: number): boolean {
  if (!echeance) return false;
  const t = new Date(echeance).getTime();
  return Number.isFinite(t) && t < maintenant;
}

function nomAerodrome(noms: Record<string, string> | undefined, id?: string): string {
  if (!id) return '';
  return noms?.[id] || id;
}

function vide(): TriageCompteurs {
  return { nonAssignes: 0, enRetard: 0, aValider: 0, messages: 0, alertes: 0, total: 0 };
}

function destinataire(m: EntreeTriMessage, userId: string): boolean {
  const to = m.to_id;
  const vise = to === userId || (Array.isArray(to) && to.includes(userId));
  return vise || (m.cc_id || []).includes(userId);
}

/** Tri : en retard d'abord, echeance proche, niveau, puis recent. Pur et teste. */
export function trierTriage(items: TriageItem[]): TriageItem[] {
  const poidsNiveau: Record<TriageNiveau, number> = { danger: 0, warning: 1, info: 2 };
  return [...items].sort((a, b) => {
    if (a.enRetard !== b.enRetard) return a.enRetard ? -1 : 1;
    const ea = a.echeance ? new Date(a.echeance).getTime() : NaN;
    const eb = b.echeance ? new Date(b.echeance).getTime() : NaN;
    if (Number.isFinite(ea) || Number.isFinite(eb)) {
      if (!Number.isFinite(ea)) return 1;
      if (!Number.isFinite(eb)) return -1;
      if (ea !== eb) return ea - eb;
    }
    return poidsNiveau[a.niveau] - poidsNiveau[b.niveau];
  });
}

function finaliser(items: TriageItem[], c: TriageCompteurs): TriageResultat {
  c.total = items.length;
  return { items: trierTriage(items), compteurs: c };
}

/**
 * Contenu d'une relance automatique admin → inspecteur (pur, testé).
 * L'admin orchestre : il relance, il n'évalue pas.
 */
export function messageRelance(
  kind: 'PAC' | 'preuves' | 'retard',
  reference: string,
  echeance: string | null | undefined,
  enRetard: boolean,
  libelle?: string,
): { objet: string; corps: string } {
  const sujet = kind === 'PAC'
    ? 'votre évaluation du PAC soumis par l’exploitant'
    : kind === 'preuves'
      ? 'votre validation des preuves déposées'
      : `la régularisation de l’écart${libelle ? ` « ${libelle} »` : ''}`;
  const objet = kind === 'retard'
    ? `[Rappel] Écart en retard — ${reference || 'écart'}`.trim()
    : `[Rappel] ${kind === 'PAC' ? 'Évaluation PAC' : 'Validation preuves'} — ${reference || 'écart'}`;
  const lignes = [
    'Bonjour,',
    '',
    `Le dossier ${reference || 'concerné'} attend toujours ${sujet}.`,
  ];
  if (echeance) {
    lignes.push(`Échéance : ${echeance}${enRetard ? ' (DÉPASSÉE — traitement prioritaire)' : ''}.`);
  }
  lignes.push('', 'Merci de traiter ou de signaler un blocage via la messagerie.', '— Administration SGDA (relance automatique)');
  return { objet, corps: lignes.join('\n') };
}

// ── ADMIN : assigne, relance — n'évalue jamais ──

export function fileTraitementAdmin(
  entrees: EntreesTriage,
  userId: string,
  maintenant = Date.now(),
): TriageResultat {
  const items: TriageItem[] = [];
  const c = vide();
  const noms = entrees.nomsAerodromes;

  for (const e of entrees.evenements || []) {
    if ((e.statut || '') !== 'recu') continue;
    items.push({
      id: `evenement:${e.id}`,
      famille: 'evenement',
      titre: `Événement ${e.reference || ''} à assigner`.trim(),
      detail: `${e.type || 'Événement'}${e.gravite ? ` · gravité ${e.gravite}` : ''}${e.aerodrome_id ? ` · ${nomAerodrome(noms, e.aerodrome_id)}` : ''}`,
      aerodromeId: e.aerodrome_id,
      aerodromeNom: nomAerodrome(noms, e.aerodrome_id) || undefined,
        niveau: e.gravite === 'critique' ? 'danger' : 'warning',
        niveauRisque: e.gravite,
        enRetard: false,
        module: 'evenements',
        action: 'Assigner',
    });
    c.nonAssignes++;
  }

  for (const e of entrees.ecarts || []) {
    const statut = e.statut || '';
    if (STATUTS_ECART_CLOTURES.has(statut)) continue;
    const aero = nomAerodrome(noms, e.aerodrome_id);
    if (statut === 'pac_soumis' && !e.evaluation_pac?.evalue_le) {
      const retard = estEnRetard(e.evaluation_pac?.deadline, maintenant);
      const msg = messageRelance('PAC', e.reference || '', e.evaluation_pac?.deadline, retard);
      items.push({
        id: `ecart:${e.id}:pac`, famille: 'ecart',
        titre: `PAC en attente d’évaluation — ${e.reference || ''}`.trim(),
        detail: `${e.libelle || 'Écart'}${aero ? ` · ${aero}` : ''} · inspecteur : ${e.inspecteur_ref_id || 'à désigner'}`,
        aerodromeId: e.aerodrome_id, aerodromeNom: aero || undefined,
        niveau: retard || e.niveau_risque === 'critique' ? 'danger' : 'warning',
        niveauRisque: e.niveau_risque,
        enRetard: retard, echeance: e.evaluation_pac?.deadline ?? null,
        module: 'plans-actions', action: 'Relancer',
        relance: { destinataireId: e.inspecteur_ref_id || '', objet: msg.objet, corps: msg.corps },
      });
      c.aValider++;
      if (retard) c.enRetard++;
    }
    if (statut === 'preuves_soumises' && !e.validation_preuves?.valide_le) {
      const retard = estEnRetard(e.validation_preuves?.deadline, maintenant);
      const msg = messageRelance('preuves', e.reference || '', e.validation_preuves?.deadline, retard);
      items.push({
        id: `ecart:${e.id}:preuves`, famille: 'preuve',
        titre: `Preuves en attente de validation — ${e.reference || ''}`.trim(),
        detail: `${e.libelle || 'Écart'}${aero ? ` · ${aero}` : ''} · inspecteur : ${e.inspecteur_ref_id || 'à désigner'}`,
        aerodromeId: e.aerodrome_id, aerodromeNom: aero || undefined,
        niveau: retard ? 'danger' : 'warning',
        niveauRisque: e.niveau_risque,
        enRetard: retard, echeance: e.validation_preuves?.deadline ?? null,
        module: 'plans-actions', action: 'Relancer',
        relance: { destinataireId: e.inspecteur_ref_id || '', objet: msg.objet, corps: msg.corps },
      });
      c.aValider++;
      if (retard) c.enRetard++;
    }
    if (statut === 'en_retard' || estEnRetard(e.delai_regularisation, maintenant)) {
      const msg = messageRelance('retard', e.reference || '', e.delai_regularisation, true, e.libelle);
      items.push({
        id: `ecart:${e.id}:retard`, famille: 'ecart',
        titre: `Écart en retard — ${e.reference || ''}`.trim(),
        detail: `${e.libelle || 'Écart'}${aero ? ` · ${aero}` : ''}${e.delai_regularisation ? ` · échéance ${e.delai_regularisation}` : ''} · inspecteur : ${e.inspecteur_ref_id || 'à désigner'}`,
        aerodromeId: e.aerodrome_id, aerodromeNom: aero || undefined,
        niveau: 'danger', enRetard: true, echeance: e.delai_regularisation ?? null,
        niveauRisque: e.niveau_risque,
        module: 'plans-actions', action: 'Relancer',
        relance: { destinataireId: e.inspecteur_ref_id || '', objet: msg.objet, corps: msg.corps },
      });
      c.enRetard++;
    }
  }

  for (const s of entrees.surveillances || []) {
    if ((s.statut || '') !== 'planifiee') continue;
    if ((s.equipe_ids || []).length > 0) continue;
    items.push({
      id: `surveillance:${s.id}`, famille: 'surveillance',
      titre: `Surveillance sans équipe — ${s.type || ''}`.trim(),
      detail: `${nomAerodrome(noms, s.aerodrome_id)}${s.date_debut ? ` · débute le ${s.date_debut}` : ''}`,
      aerodromeId: s.aerodrome_id, aerodromeNom: nomAerodrome(noms, s.aerodrome_id) || undefined,
      niveau: 'warning', enRetard: false, echeance: s.date_debut ?? null,
      module: 'surveillance', action: 'Composer l’équipe',
    });
    c.nonAssignes++;
  }

  for (const m of entrees.messages || []) {
    if (m.read_at || !destinataire(m, userId)) continue;
    items.push({
      id: `message:${m.id}`, famille: 'message',
      titre: m.subject || 'Message',
      detail: m.from_nom ? `De ${m.from_nom}` : '',
      niveau: 'info', enRetard: false,
      module: 'messagerie', action: 'Lire',
    });
    c.messages++;
  }

  return finaliser(items, c);
}

// ── INSPECTEUR : exécute, évalue, valide — n'assigne jamais ──

export function fileTraitementInspecteur(
  entrees: EntreesTriage,
  userId: string,
  maintenant = Date.now(),
): TriageResultat {
  const items: TriageItem[] = [];
  const c = vide();
  const noms = entrees.nomsAerodromes;
  const meConcerne = (e: EntreeTriEvenement): boolean =>
    e.inspecteur_id === userId
    || e.responsable_id === userId
    || e.chef_id === userId
    || (e.equipe_ids || []).includes(userId);

  for (const s of entrees.surveillances || []) {
    if ((s.statut || '') !== 'en_cours') continue;
    if (!(s.equipe_ids || []).includes(userId) && s.chef_id !== userId) continue;
    items.push({
      id: `surveillance:${s.id}`, famille: 'surveillance',
      titre: `Surveillance en cours — ${s.type || ''}`.trim(),
      detail: nomAerodrome(noms, s.aerodrome_id),
      aerodromeId: s.aerodrome_id, aerodromeNom: nomAerodrome(noms, s.aerodrome_id) || undefined,
      niveau: 'warning', enRetard: false,
      module: 'surveillance', action: 'Reprendre',
    });
  }

  for (const e of entrees.evenements || []) {
    if (STATUTS_EVT_CLOTURES.has(e.statut || '') || !meConcerne(e)) continue;
    const retard = estEnRetard((e as { echeance?: string }).echeance, maintenant);
    items.push({
      id: `evenement:${e.id}`, famille: 'evenement',
      titre: `Événement à instruire — ${e.reference || ''}`.trim(),
      detail: `${e.type || 'Événement'}${e.aerodrome_id ? ` · ${nomAerodrome(noms, e.aerodrome_id)}` : ''} · statut ${e.statut}`,
      aerodromeId: e.aerodrome_id, aerodromeNom: nomAerodrome(noms, e.aerodrome_id) || undefined,
      niveau: e.gravite === 'critique' ? 'danger' : 'warning',
      niveauRisque: e.gravite,
      enRetard: retard,
      module: 'evenements', action: 'Instruire',
    });
    if (retard) c.enRetard++;
  }

  for (const e of entrees.ecarts || []) {
    if (STATUTS_ECART_CLOTURES.has(e.statut || '')) continue;
    if (e.inspecteur_ref_id !== userId) continue;
    const statut = e.statut || '';
    const aero = nomAerodrome(noms, e.aerodrome_id);
    const aEvaluer = statut === 'pac_soumis' && !e.evaluation_pac?.evalue_le;
    const aValider = statut === 'preuves_soumises' && !e.validation_preuves?.valide_le;
    const retard = estEnRetard(e.evaluation_pac?.deadline, maintenant)
      || estEnRetard(e.validation_preuves?.deadline, maintenant)
      || statut === 'en_retard';
    items.push({
      id: `ecart:${e.id}`, famille: 'ecart',
      titre: `${aEvaluer ? 'PAC à évaluer' : aValider ? 'Preuves à valider' : 'Écart à traiter'} — ${e.reference || ''}`.trim(),
      detail: `${e.libelle || 'Écart'}${aero ? ` · ${aero}` : ''}`,
      aerodromeId: e.aerodrome_id, aerodromeNom: aero || undefined,
      niveau: retard || e.niveau_risque === 'critique' ? 'danger' : 'warning',
      niveauRisque: e.niveau_risque,
      enRetard: retard,
      module: 'plans-actions',
      action: aEvaluer ? 'Évaluer' : aValider ? 'Valider' : 'Traiter',
    });
    if (aEvaluer || aValider) c.aValider++;
    if (retard) c.enRetard++;
  }

  for (const m of entrees.messages || []) {
    if (m.read_at || !destinataire(m, userId)) continue;
    items.push({
      id: `message:${m.id}`, famille: 'message',
      titre: m.subject || 'Message',
      detail: m.from_nom ? `De ${m.from_nom}` : '',
      niveau: 'info', enRetard: false,
      module: 'messagerie', action: 'Lire',
    });
    c.messages++;
  }

  return finaliser(items, c);
}

// ── EXPLOITANT (point focal) : agit sur son aérodrome uniquement ──

export function fileTraitementExploitant(
  entrees: EntreesTriage,
  aerodromeId: string,
  userId: string,
): TriageResultat {
  const items: TriageItem[] = [];
  const c = vide();

  for (const e of entrees.ecarts || []) {
    if (e.aerodrome_id !== aerodromeId) continue;
    const statut = e.statut || '';
    if (STATUTS_ECART_CLOTURES.has(statut)) continue;
    const retard = statut === 'en_retard';
    let action = 'Corriger';
    let niveau: TriageNiveau = 'warning';
    if (statut === 'pac_attendu' || statut === 'ouvert') action = 'Soumettre le PAC';
    else if (statut === 'pac_refuse') { action = 'Corriger le PAC'; niveau = 'danger'; }
    else if (statut === 'pac_accepte') action = 'Déposer les preuves';
    else if (statut === 'preuves_soumises') { action = 'Suivre'; niveau = 'info'; }
    if (retard) niveau = 'danger';
    items.push({
      id: `ecart:${e.id}`, famille: 'ecart',
      titre: `${e.reference || 'Écart'} — ${e.libelle || ''}`.trim(),
      detail: `Statut : ${statut}${retard ? ' · EN RETARD' : ''}`,
      aerodromeId, niveau, enRetard: retard,
      niveauRisque: e.niveau_risque,
      module: 'operator-ecarts', action,
    });
    if (retard) c.enRetard++;
  }

  for (const e of entrees.evenements || []) {
    if (e.aerodrome_id !== aerodromeId) continue;
    if (STATUTS_EVT_CLOTURES.has(e.statut || '')) continue;
    items.push({
      id: `evenement:${e.id}`, famille: 'evenement',
      titre: `Déclaration ${e.reference || ''} — ${e.statut}`.trim(),
      detail: `${e.type || 'Événement'} · suivi ANACIM en cours`,
      aerodromeId, niveau: 'info', enRetard: false,
      niveauRisque: e.gravite,
      module: 'operator-evenements', action: 'Suivre',
    });
  }

  for (const m of entrees.messages || []) {
    if (m.read_at || !destinataire(m, userId)) continue;
    items.push({
      id: `message:${m.id}`, famille: 'message',
      titre: m.subject || 'Message',
      detail: m.from_nom ? `De ${m.from_nom}` : '',
      niveau: 'info', enRetard: false,
      module: 'operator-messagerie', action: 'Lire',
    });
    c.messages++;
  }

  return finaliser(items, c);
}

// ── DG : lecture seule, critiques et blocages ──

export function syntheseDG(entrees: EntreesTriage): TriageResultat {
  const items: TriageItem[] = [];
  const c = vide();
  const noms = entrees.nomsAerodromes;

  for (const e of entrees.evenements || []) {
    if (e.gravite !== 'critique' || STATUTS_EVT_CLOTURES.has(e.statut || '')) continue;
    items.push({
      id: `evenement:${e.id}`, famille: 'evenement',
      titre: `Événement critique — ${e.reference || ''}`.trim(),
      detail: `${e.type || ''}${e.aerodrome_id ? ` · ${nomAerodrome(noms, e.aerodrome_id)}` : ''} · ${e.statut}`,
      aerodromeId: e.aerodrome_id, aerodromeNom: nomAerodrome(noms, e.aerodrome_id) || undefined,
      niveau: 'danger', enRetard: false,
      niveauRisque: e.gravite,
      module: 'evenements', action: 'Voir',
    });
  }
  for (const e of entrees.ecarts || []) {
    if (e.niveau_risque !== 'critique' || STATUTS_ECART_CLOTURES.has(e.statut || '')) continue;
    const aero = nomAerodrome(noms, e.aerodrome_id);
    items.push({
      id: `ecart:${e.id}`, famille: 'ecart',
      titre: `Écart critique — ${e.reference || ''}`.trim(),
      detail: `${e.libelle || ''}${aero ? ` · ${aero}` : ''} · ${e.statut}`,
      aerodromeId: e.aerodrome_id, aerodromeNom: aero || undefined,
      niveau: 'danger', enRetard: (e.statut || '') === 'en_retard',
      niveauRisque: e.niveau_risque,
      module: 'plans-actions', action: 'Voir',
    });
    if ((e.statut || '') === 'en_retard') c.enRetard++;
  }

  return finaliser(items, c);
}

// ── Filtres UI (un seul endroit : compteurs ↔ lignes) ──

export type TriageFiltre = 'nonAssignes' | 'enRetard' | 'aValider' | 'messages' | 'alertes';

/** Facettes d'un item pour les puces-filtres du bloc compact. Pur et testé. */
export function filtresDe(item: TriageItem): TriageFiltre[] {
  if (item.famille === 'alerte') return ['alertes'];
  const f: TriageFiltre[] = [];
  if (item.action === 'Assigner' || item.action === 'Composer l’équipe') f.push('nonAssignes');
  if (item.enRetard) f.push('enRetard');
  // « À valider » = en attente côté inspecteurs (l'admin relance, il n'évalue pas).
  if (item.action === 'Évaluer' || item.action === 'Valider' || item.action === 'Relancer') f.push('aValider');
  if (item.famille === 'message') f.push('messages');
  return f;
}

export const TRIAGE_FILTRE_LABELS: Record<TriageFiltre, string> = {
  nonAssignes: 'Non assignés',
  enRetard: 'En retard',
  aValider: 'À valider',
  messages: 'Messages',
  alertes: 'Alertes',
};

const ROLES_OPERATEURS = ['dg_operator', 'focal_operator', 'staff_operator'];
const ROLES_SCORES = ['admin', 'inspector', 'dg_anacim'];

/**
 * Signaux agrégés transverses (portage pur de l'AlertCard partagée) :
 * horizons (J-7), scores critiques, recalibration ML, signatures en attente,
 * nouveaux écarts / PAC à soumettre (exploitants). Complète les files
 * unitaires — fusion via avecAlertes.
 */
export function alertesTriage(
  entrees: EntreesTriage,
  role: string,
  opts?: { userId?: string; aerodromeId?: string; maintenant?: number },
): TriageItem[] {
  const items: TriageItem[] = [];
  const maintenant = opts?.maintenant ?? Date.now();
  const userId = opts?.userId || '';
  const aeroId = opts?.aerodromeId;
  const estOperateur = ROLES_OPERATEURS.includes(role);
  const memeAerodrome = <T extends { aerodrome_id?: string }>(e: T): boolean =>
    !aeroId || e.aerodrome_id === aeroId;

  // Surveillances à venir (J-7) — tous rôles
  const prochains = (entrees.surveillances || []).filter((s) => {
    if (!memeAerodrome(s) || s.statut === 'archivee') return false;
    const diff = (new Date(s.date_debut || '').getTime() - maintenant) / 86400000;
    return diff > 0 && diff <= 7;
  });
  if (prochains.length > 0) {
    items.push({
      id: 'alerte:surv-7j', famille: 'alerte',
      titre: `${prochains.length} surveillance(s) dans 7 jours`,
      detail: 'Horizon de préparation',
      niveau: 'warning', enRetard: false,
      module: estOperateur ? 'operator-planning' : 'planning', action: 'Voir',
    });
  }

  // Écarts PAC urgent ou refusé — module selon rôle (jamais de module inatteignable)
  const urgents = (entrees.ecarts || []).filter((e) => {
    if (!memeAerodrome(e) || e.statut === 'cloture') return false;
    if (e.statut === 'pac_attendu') {
      const delai = e.delai_pac ? new Date(e.delai_pac).getTime() : 0;
      return delai > 0 && (delai - maintenant) / 86400000 <= 7;
    }
    return e.statut === 'pac_refuse';
  });
  if (urgents.length > 0) {
    items.push({
      id: 'alerte:ecarts-pac', famille: 'alerte',
      titre: `${urgents.length} écart(s) — PAC urgent ou refusé`,
      detail: 'Délai < 7 j ou correction demandée',
      niveau: 'danger', enRetard: false,
      module: estOperateur ? 'operator-ecarts' : 'plans-actions', action: 'Gérer',
    });
  }

  // Preuves attendues (exploitants) — PAC accepté, preuves à déposer
  if (estOperateur) {
    const preuves = (entrees.ecarts || []).filter(
      (e) => memeAerodrome(e) && (e.statut === 'pac_accepte' || e.statut === 'preuves_soumises'),
    );
    if (preuves.length > 0) {
      items.push({
        id: 'alerte:preuves', famille: 'alerte',
        titre: `${preuves.length} écart(s) en attente de preuves`,
        detail: 'Déposez les pièces demandées',
        niveau: 'warning', enRetard: false,
        module: 'operator-ecarts', action: 'Déposer',
      });
    }
  }

  // Scores critiques — admin / inspecteur / DG
  if (ROLES_SCORES.includes(role)) {
    const critiques = (entrees.profils || []).filter(
      (p) => (!aeroId || p.aerodrome_id === aeroId) && (p.score_global ?? 100) < 30,
    );
    if (critiques.length > 0) {
      items.push({
        id: 'alerte:critiques', famille: 'alerte',
        titre: `${critiques.length} aérodrome(s) en score critique`,
        detail: 'Priorité de supervision',
        niveau: 'danger', enRetard: false,
        module: 'risque', action: 'Voir',
      });
    }
  }

  // Recalibration ML en attente — admin
  if (role === 'admin' && (entrees.mlRecalEnAttente || 0) > 0) {
    items.push({
      id: 'alerte:ml', famille: 'alerte',
      titre: `${entrees.mlRecalEnAttente} recalibration(s) ML en attente`,
      detail: 'Modèles à recalibrer',
      niveau: 'warning', enRetard: false,
      module: 'ml-monitoring', action: 'Voir',
    });
  }

  // Checklists à signer — inspecteur dans l'équipe, en cours
  if (role === 'inspector') {
    const aSigner = (entrees.surveillances || []).filter(
      (s) => (s.equipe_ids || []).includes(userId) && s.statut === 'en_cours',
    );
    if (aSigner.length > 0) {
      items.push({
        id: 'alerte:signatures', famille: 'alerte',
        titre: `${aSigner.length} checklist(s) à signer`,
        detail: 'Signature en attente',
        niveau: 'warning', enRetard: false,
        module: 'surveillance', action: 'Ouvrir',
      });
    }
  }

  // Nouveaux écarts + PAC à soumettre — exploitants
  if (estOperateur) {
    const nouveaux = (entrees.ecarts || []).filter(
      (e) => memeAerodrome(e) && e.statut === 'pac_attendu',
    );
    if (nouveaux.length > 0) {
      items.push({
        id: 'alerte:nouveaux', famille: 'alerte',
        titre: `${nouveaux.length} nouvel(s) écart(s) à traiter`,
        detail: 'PAC à soumettre',
        niveau: 'danger', enRetard: false,
        module: 'operator-ecarts', action: 'Voir',
      });
    }
  }

  return items;
}

/** Fusionne les alertes agrégées dans un résultat de file (compteurs + tri). */
export function avecAlertes(resultat: TriageResultat, alertes: TriageItem[]): TriageResultat {
  const items = [...resultat.items, ...alertes];
  return {
    items: trierTriage(items),
    compteurs: { ...resultat.compteurs, alertes: alertes.length, total: items.length },
  };
}