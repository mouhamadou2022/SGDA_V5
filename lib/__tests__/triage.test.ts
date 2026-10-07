// lib/__tests__/triage.test.ts — file de traitement derivee (pur, sans store).
import {
  fileTraitementAdmin,
  fileTraitementInspecteur,
  fileTraitementExploitant,
  syntheseDG,
  trierTriage,
  filtresDe,
  alertesTriage,
  avecAlertes,
  messageRelance,
} from '../triage';

const NOMS = { a1: 'GOBD', a2: 'GOOY' };
const MAINTENANT = new Date('2026-10-07T12:00:00Z').getTime();
const PASSE = '2026-09-01';
const FUTUR = '2026-12-31';

const ENTREES = {
  evenements: [
    { id: 'e1', reference: 'EVT-2026-001', aerodrome_id: 'a1', statut: 'recu', gravite: 'eleve', type: 'Incursion' },
    { id: 'e2', reference: 'EVT-2026-002', aerodrome_id: 'a2', statut: 'assigne', gravite: 'moyen', inspecteur_id: 'insp1' },
    { id: 'e3', reference: 'EVT-2026-003', aerodrome_id: 'a1', statut: 'cloture', gravite: 'critique' },
  ],
  ecarts: [
    { id: 'c1', reference: 'ECA-2026-001', aerodrome_id: 'a1', statut: 'pac_soumis', niveau_risque: 'eleve', libelle: 'Balise HS', inspecteur_ref_id: 'insp1', evaluation_pac: { deadline: FUTUR } },
    { id: 'c2', reference: 'ECA-2026-002', aerodrome_id: 'a2', statut: 'preuves_soumises', niveau_risque: 'moyen', libelle: 'Cloture', inspecteur_ref_id: 'insp1', validation_preuves: { deadline: PASSE } },
    { id: 'c3', reference: 'ECA-2026-003', aerodrome_id: 'a1', statut: 'en_retard', niveau_risque: 'critique', libelle: 'Piste' },
    { id: 'c4', reference: 'ECA-2026-004', aerodrome_id: 'a1', statut: 'cloture', niveau_risque: 'faible' },
  ],
  surveillances: [
    { id: 's1', aerodrome_id: 'a1', type: 'programmee', statut: 'planifiee', equipe_ids: [], date_debut: FUTUR },
    { id: 's2', aerodrome_id: 'a2', type: 'programmee', statut: 'en_cours', equipe_ids: ['insp1'], chef_id: 'insp1' },
  ],
  messages: [
    { id: 'm1', to_id: 'admin1', subject: 'PAC recu', from_nom: 'Focal GOBD' },
    { id: 'm2', to_id: 'admin1', subject: 'Lu', from_nom: 'X', read_at: '2026-10-01' },
  ],
  nomsAerodromes: NOMS,
};

describe('fileTraitementAdmin', () => {
  const r = fileTraitementAdmin(ENTREES as any, 'admin1', MAINTENANT);
  test("recu -> Assigner, pac/preuves/retard -> Relancer (l'admin n'évalue jamais)", () => {
    const actions = r.items.map((i) => i.action);
    expect(actions).toContain('Assigner');
    expect(actions).toContain('Relancer');
    expect(actions).not.toContain('Évaluer');
    expect(actions).not.toContain('Valider');
    expect(actions).toContain('Composer l’équipe');
  });
  test('relance : destinataire = inspecteur_ref_id + message prete', () => {
    const pac = r.items.find((i) => i.id === 'ecart:c1:pac')!;
    expect(pac.relance?.destinataireId).toBe('insp1');
    expect(pac.relance?.objet).toContain('ECA-2026-001');
    expect(pac.relance?.corps).toContain('Administration SGDA');
  });
  test('compteurs et exclusions (clotures, lus, equipes completes)', () => {
    expect(r.compteurs.nonAssignes).toBe(2); // e1 + s1
    expect(r.compteurs.aValider).toBe(2); // c1 + c2
    expect(r.compteurs.enRetard).toBe(2); // c2 (deadline passee) + c3
    expect(r.compteurs.messages).toBe(1);
    expect(r.items.some((i) => i.id === 'evenement:e3')).toBe(false);
    expect(r.items.some((i) => i.id === 'ecart:c4')).toBe(false);
  });
  test('tri : en retard dabord', () => {
    expect(r.items[0].enRetard).toBe(true);
  });
  test('niveauRisque propagé pour le badge canonique', () => {
    expect(r.items.find((i) => i.id === 'evenement:e1')?.niveauRisque).toBe('eleve');
    expect(r.items.find((i) => i.id === 'ecart:c3:retard')?.niveauRisque).toBe('critique');
  });
  test('jamais dassignation hors admin : actions sans Assigner ailleurs', () => {
    expect(r.items.filter((i) => i.famille === 'message').every((i) => i.action === 'Lire')).toBe(true);
  });
});

describe('fileTraitementInspecteur', () => {
  const r = fileTraitementInspecteur(ENTREES as any, 'insp1', MAINTENANT);
  test("ne voit que ses items, évalue lui-même (jamais Assigner ni Relancer)", () => {
    expect(r.items.map((i) => i.id).sort()).toEqual(['ecart:c1', 'ecart:c2', 'evenement:e2', 'surveillance:s2'].sort());
    expect(r.items.some((i) => i.action === 'Assigner' || i.action === 'Relancer')).toBe(false);
    expect(r.items.find((i) => i.id === 'ecart:c1')?.action).toBe('Évaluer');
    expect(r.items.find((i) => i.id === 'ecart:c2')?.action).toBe('Valider');
  });
});

describe('fileTraitementExploitant', () => {
  const r = fileTraitementExploitant(ENTREES as any, 'a1', 'focal1');
  test('aérodrome unique, actions operationnelles, jamais Assigner', () => {
    expect(r.items.every((i) => i.aerodromeId === 'a1' || i.famille === 'message')).toBe(true);
    expect(r.items.some((i) => i.action === 'Assigner')).toBe(false);
    expect(r.items.map((i) => i.action)).toContain('Suivre');
  });
});

describe('syntheseDG', () => {
  const r = syntheseDG(ENTREES as any);
  test('critiques non clotures en lecture seule', () => {
    // e3 cloture exclu ; c3 critique ouvert inclus
    expect(r.items.map((i) => i.id)).toEqual(['ecart:c3']);
    expect(r.items.every((i) => i.action === 'Voir')).toBe(true);
  });
});

describe('trierTriage', () => {
  test('retard > echeance > niveau', () => {
    const items: any[] = [
      { id: 'a', niveau: 'danger', enRetard: false, echeance: FUTUR },
      { id: 'b', niveau: 'info', enRetard: true },
      { id: 'c', niveau: 'warning', enRetard: false, echeance: PASSE },
    ];
    expect(trierTriage(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('filtresDe', () => {
  test('un item peut cumuler retard + aValider', () => {
    const r = fileTraitementAdmin(ENTREES as any, 'admin1', MAINTENANT);
    const preuves = r.items.find((i) => i.id === 'ecart:c2:preuves')!;
    expect(filtresDe(preuves).sort()).toEqual(['aValider', 'enRetard'].sort());
    expect(filtresDe(r.items.find((i) => i.id === 'evenement:e1')!)).toEqual(['nonAssignes']);
  });
});

describe('messageRelance', () => {
  test('PAC avec echeance depassee : prioritaire', () => {
    const m = messageRelance('PAC', 'ECA-2026-001', PASSE, true);
    expect(m.objet).toContain('ECA-2026-001');
    expect(m.corps).toContain('DÉPASSÉE');
  });
  test('preuves sans echeance : pas de ligne echeance', () => {
    const m = messageRelance('preuves', 'ECA-2026-002', null, false);
    expect(m.objet).toContain('Validation preuves');
    expect(m.corps).not.toContain('Échéance');
  });
  test('retard : libelle inclus', () => {
    const m = messageRelance('retard', 'ECA-2026-003', PASSE, true, 'Piste');
    expect(m.objet).toContain('en retard');
    expect(m.corps).toContain('Piste');
  });
});

describe('alertesTriage', () => {
  const ENTREES_ALERTES: any = {
    evenements: [],
    ecarts: [
      { id: 'c9', reference: 'ECA-2026-009', aerodrome_id: 'a1', statut: 'pac_attendu', delai_pac: '2026-10-10', niveau_risque: 'eleve' },
    ],
    surveillances: [
      { id: 's9', aerodrome_id: 'a1', type: 'programmee', statut: 'planifiee', equipe_ids: [], date_debut: '2026-10-10' },
    ],
    messages: [],
    profils: [{ aerodrome_id: 'a1', score_global: 20 }],
    mlRecalEnAttente: 2,
  };
  test('admin : J-7 + PAC urgent + critique + ML, modules joignables', () => {
    const a = alertesTriage(ENTREES_ALERTES, 'admin', { userId: 'admin1', maintenant: MAINTENANT });
    expect(a.map((i) => i.id).sort()).toEqual(
      ['alerte:critiques', 'alerte:ecarts-pac', 'alerte:ml', 'alerte:surv-7j'].sort(),
    );
    expect(a.every((i) => i.famille === 'alerte')).toBe(true);
    expect(a.find((i) => i.id === 'alerte:ml')?.module).toBe('ml-monitoring');
  });
  test('exploitant : modules portail + pas de ML ni scores', () => {
    const a = alertesTriage(ENTREES_ALERTES, 'focal_operator', { userId: 'f1', aerodromeId: 'a1', maintenant: MAINTENANT });
    expect(a.some((i) => i.module.startsWith('operator-'))).toBe(true);
    expect(a.some((i) => i.id === 'alerte:ml')).toBe(false);
    expect(a.some((i) => i.id === 'alerte:critiques')).toBe(false);
  });
  test('avecAlertes fusionne compteurs et tri', () => {
    const base = fileTraitementAdmin(ENTREES as any, 'admin1', MAINTENANT);
    const fusion = avecAlertes(base, alertesTriage(ENTREES_ALERTES, 'admin', { maintenant: MAINTENANT }));
    expect(fusion.compteurs.alertes).toBe(4);
    expect(fusion.compteurs.total).toBe(base.compteurs.total + 4);
    expect(filtresDe(fusion.items.find((i) => i.id === 'alerte:ml')!)).toEqual(['alertes']);
  });
});
