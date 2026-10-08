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
  nomUtilisateur,
  focalDuSite,
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

describe('fileTraitementExploitant : auto-évaluation', () => {
  const base: any = { evenements: [], ecarts: [], surveillances: [], messages: [], nomsAerodromes: NOMS };
  test('top 3 non cochées + rappel si score bas', () => {
    const r = fileTraitementExploitant(
      {
        ...base,
        autoEval: {
          scoreAutoEval: 42,
          actions: [
            { id: 'a1', texte: 'Rédiger le manuel', gain: 5, checked: false },
            { id: 'a2', texte: 'Former l’équipe', gain: 3, checked: false },
            { id: 'a3', texte: 'Registre mensuel', gain: 2, checked: false },
            { id: 'a4', texte: 'Indicateurs', gain: 1, checked: false },
            { id: 'a5', texte: 'Déjà fait', gain: 1, checked: true },
          ],
        },
      },
      'a1',
      'focal1',
    );
    const ids = r.items.map((i) => i.id);
    expect(ids).toContain('autoeval:a1');
    expect(ids).toContain('autoeval:a2');
    expect(ids).toContain('autoeval:a3');
    expect(ids).not.toContain('autoeval:a4'); // top 3 seulement
    expect(ids).not.toContain('autoeval:a5'); // cochée exclue
    expect(ids).toContain('autoeval:rappel');
    expect(r.items.find((i) => i.id === 'autoeval:a1')?.module).toBe('risque');
  });
  test('sans autoEval : rien ; score haut + tout coché : rien', () => {
    expect(fileTraitementExploitant(base, 'a1', 'focal1').items).toHaveLength(0);
    const r = fileTraitementExploitant(
      { ...base, autoEval: { scoreAutoEval: 85, actions: [{ id: 'a1', texte: 'Fait', checked: true }] } },
      'a1',
      'focal1',
    );
    expect(r.items).toHaveLength(0);
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
  test('correction et soumission : wording et destinataire', () => {
    const c = messageRelance('correction', 'ECA-9', null, false, 'Balise', 'Moussa Ndiaye');
    expect(c.objet).toContain('Corriger');
    expect(c.corps).toContain('Moussa Ndiaye');
    const s = messageRelance('soumission', 'ECA-10', FUTUR, false);
    expect(s.objet).toContain('non soumis');
    expect(s.corps).toContain(FUTUR);
  });
});

describe('noms et focal', () => {
  const USERS = [
    { id: 'insp1', role: 'inspector', prenom: 'Awa', nom: 'Diallo' },
    { id: 'focal1', role: 'focal_operator', aerodrome_id: 'a1', prenom: 'Moussa', nom: 'Ndiaye' },
    { id: 'staff1', role: 'staff_operator', aerodrome_id: 'a1', prenom: 'Ibra', nom: 'Sow' },
  ];
  test('nomUtilisateur : jamais d’UUID brut sauf inconnu', () => {
    expect(nomUtilisateur(USERS, 'insp1')).toBe('Awa Diallo');
    expect(nomUtilisateur(USERS, 'zzz')).toBe('zzz');
    expect(nomUtilisateur(USERS, '')).toBe('à désigner');
  });
  test('focalDuSite : focal prioritaire, sinon operateur du site', () => {
    expect(focalDuSite(USERS, 'a1')?.id).toBe('focal1');
    expect(focalDuSite(USERS, 'a9')).toBeNull();
    expect(focalDuSite([{ id: 's1', role: 'staff_operator', aerodrome_id: 'a2' }], 'a2')?.id).toBe('s1');
  });
});

describe('fileTraitementAdmin : camps et états fins', () => {
  const ENTREES_CAMP: any = {
    evenements: [],
    ecarts: [
      { id: 'o1', reference: 'ECA-1', aerodrome_id: 'a1', statut: 'ouvert', niveau_risque: 'moyen', libelle: 'X', delai_pac: PASSE },
      { id: 'o2', reference: 'ECA-2', aerodrome_id: 'a1', statut: 'pac_attendu', niveau_risque: 'moyen', libelle: 'Y' },
      { id: 'r1', reference: 'ECA-3', aerodrome_id: 'a1', statut: 'pac_refuse', niveau_risque: 'eleve', libelle: 'Z' },
      { id: 'a1x', reference: 'ECA-4', aerodrome_id: 'a1', statut: 'pac_accepte', niveau_risque: 'faible', libelle: 'W' },
      { id: 'v1', reference: 'ECA-5', aerodrome_id: 'a1', statut: 'en_attente_validation_chef', niveau_risque: 'moyen', libelle: 'V' },
    ],
    surveillances: [],
    messages: [],
    nomsAerodromes: NOMS,
    utilisateurs: [
      { id: 'insp1', role: 'inspector', prenom: 'Awa', nom: 'Diallo' },
      { id: 'focal1', role: 'focal_operator', aerodrome_id: 'a1', prenom: 'Moussa', nom: 'Ndiaye' },
    ],
  };
  const r = fileTraitementAdmin(ENTREES_CAMP, 'admin1', MAINTENANT);
  const parId = (id: string) => r.items.find((i) => i.id === id)!;
  test('PAC non soumis dépassé → Relancer exploitant nommé', () => {
    const it = parId('ecart:o1:soumission');
    expect(it.action).toBe('Relancer');
    expect(it.camp).toBe('exploitant');
    expect(it.relance?.destinataireId).toBe('focal1');
    expect(it.detail).toContain('Moussa Ndiaye');
    expect(it.detail).not.toContain('focal1');
  });
  test('PAC à soumettre non échu → Voir, sans relance', () => {
    const it = parId('ecart:o2:asoumettre');
    expect(it.action).toBe('Voir');
    expect(it.camp).toBe('exploitant');
    expect(it.relance).toBeUndefined();
  });
  test('PAC refusé → Relancer exploitant (correction)', () => {
    const it = parId('ecart:r1:correction');
    expect(it.action).toBe('Relancer');
    expect(it.camp).toBe('exploitant');
    expect(it.relance?.destinataireId).toBe('focal1');
  });
  test('PAC accepté → Voir côté exploitant (preuves à déposer)', () => {
    const it = parId('ecart:a1x:preuvesadeposer');
    expect(it.action).toBe('Voir');
    expect(it.camp).toBe('exploitant');
  });
  test('validation chef → Valider côté admin', () => {
    const it = parId('ecart:v1:chef');
    expect(it.action).toBe('Valider');
    expect(it.camp).toBe('admin');
    expect(r.compteurs.aValider).toBe(1);
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
