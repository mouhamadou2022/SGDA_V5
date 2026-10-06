import { listerOutils, trouverOutil, declarerOutil } from '../ia/pilote/outils'

describe('registre outils pilote', () => {
  test('noms uniques, descriptions renseignées', () => {
    const outils = listerOutils()
    expect(outils.length).toBeGreaterThanOrEqual(4)
    expect(new Set(outils.map(o => o.nom)).size).toBe(outils.length)
    for (const o of outils) expect(o.description.length).toBeGreaterThan(10)
  })

  test('écritures soumises à confirmation (brouillons + téléchargements, jamais de destructif)', () => {
    const ecritures = listerOutils().filter(o => o.ecriture).map(o => o.nom).sort()
    expect(ecritures).toEqual(['creer_ecart', 'generer_rapport_pdf', 'generer_rapport_word', 'preparer_checklist', 'proposer_surveillance'])
  })

  test('outils ancrage données présents (lectures ciblées)', () => {
    for (const nom of ['detail_ecart', 'rapport_surveillance', 'lister_plannings', 'etat_checklist', 'lister_evenements', 'rechercher_web', 'rechercher_aerodrome']) {
      const outil = trouverOutil(nom)
      expect(outil).toBeDefined()
      expect(outil!.ecriture).toBe(false)
    }
    expect(trouverOutil('detail_ecart')!.requis).toContain('reference')
    expect(trouverOutil('rapport_surveillance')!.requis).toContain('site')
  })

  test('couverture tous modules (dossiers, formation, aérodromes, ML, certif, homologation, messages)', () => {
    for (const nom of ['lister_aerodromes', 'dossier_certification', 'dossier_homologation', 'lister_dossiers', 'etat_formation', 'etat_ml', 'messages_recents']) {
      const outil = trouverOutil(nom)
      expect(outil).toBeDefined()
      expect(outil!.ecriture).toBe(false)
    }
    expect(trouverOutil('dossier_certification')!.requis).toContain('site')
    expect(trouverOutil('dossier_homologation')!.requis).toContain('site')
  })

  test('couverture toute application : chaque module métier a au moins un outil (ou exclusion documentée)', () => {
    const noms = new Set(listerOutils().map(o => o.nom))
    const couverture: Record<string, string[]> = {
      'aerodromes': ['lister_aerodromes', 'fiche_aerodrome', 'rechercher_aerodrome', 'etat_site', 'resumer_activite'],
      'certification': ['dossier_certification', 'generer_rapport_pdf', 'etat_site'],
      'homologation': ['dossier_homologation', 'generer_rapport_pdf', 'etat_site'],
      'planning': ['lister_plannings', 'proposer_surveillance'],
      'surveillance': ['suivi_surveillances', 'rapport_surveillance', 'etat_checklist', 'preparer_checklist'],
      'plans-actions': ['lister_ecarts', 'detail_ecart', 'creer_ecart'],
      'registres': ['consulter_registre', 'generer_rapport_pdf'],
      'dossiers': ['lister_dossiers'],
      'formation': ['etat_formation'],
      'kit': ['documents_kit', 'rechercher_reglementaire', 'cours_du_soir'],
      'evenements': ['lister_evenements'],
      'enquetes': ['etat_enquetes'],
      'messagerie': ['messages_recents'],
      'risque': ['consulter_profil_risque', 'recalculer_profil_risque', 'comparer_sites', 'alertes_risque'],
      'charge': ['charge_travail'],
      'ml-monitoring': ['etat_ml'],
      'audit': ['journal_audit'],
    }
    // Exclusions volontaires documentées : signatures (module placeholder, données fictives),
    // utilisateurs + codes (données sensibles/secrets), agents (méta-module IA), dashboards (vues).
    for (const [module, outils] of Object.entries(couverture)) {
      expect(outils.some(n => noms.has(n))).toBe(true)
    }
  })

  test('journal_audit réservé admin/DG', async () => {
    const outil = trouverOutil('journal_audit')!
    const refuse = JSON.parse(await outil.executer({}, { userRole: 'inspector' }))
    expect(refuse.erreur).toMatch(/réservé/)
  })

  test('messages_recents exige un utilisateur connecté (confidentialité)', async () => {
    const outil = trouverOutil('messages_recents')!
    const res = JSON.parse(await outil.executer({}, {}))
    expect(res.erreur).toMatch(/connect/i)
  })

  test('nouveaux outils Phase 2 présents (lectures + écritures)', () => {
    for (const nom of ['etat_checklist', 'lister_evenements']) {
      const outil = trouverOutil(nom)
      expect(outil).toBeDefined()
      expect(outil!.ecriture).toBe(false)
    }
    for (const nom of ['preparer_checklist', 'generer_rapport_pdf', 'generer_rapport_word']) {
      const outil = trouverOutil(nom)
      expect(outil).toBeDefined()
      expect(outil!.ecriture).toBe(true)
    }
    expect(trouverOutil('generer_rapport_pdf')!.requis).toContain('type')
    expect(trouverOutil('generer_rapport_word')!.requis).toContain('type')
    expect(trouverOutil('preparer_checklist')!.requis).toEqual(
      expect.arrayContaining(['site', 'date_debut']),
    )
  })

  test('écritures refusées sans rôle inspecteur (garde côté outil)', async () => {
    for (const nom of ['proposer_surveillance', 'creer_ecart', 'preparer_checklist', 'generer_rapport_pdf', 'generer_rapport_word']) {
      const outil = trouverOutil(nom)!
      const res = JSON.parse(await outil.executer({ site: 'GOOY', date_debut: '2026-12-01', type: 'periodique', domaine: 'SGS', libelle: 'x', niveau_risque: 'moyen' }, { userRole: 'focal_operator' }))
      expect(res.erreur).toMatch(/réservé aux inspecteurs/i)
    }
  })

  test('lectures : résumé, comparatif, recalcul, suivi', () => {
    for (const nom of ['resumer_activite', 'comparer_sites', 'recalculer_profil_risque', 'suivi_surveillances']) {
      const outil = trouverOutil(nom)
      expect(outil).toBeDefined()
      expect(outil!.ecriture).toBe(false)
    }
    expect(trouverOutil('comparer_sites')!.requis).toContain('sites')
    expect(trouverOutil('creer_ecart')!.requis).toEqual(
      expect.arrayContaining(['site', 'domaine', 'libelle', 'niveau_risque']),
    )
  })

  test('déclaration Ollama bien formée', () => {
    const outil = trouverOutil('proposer_surveillance')!
    const decl = declarerOutil(outil) as {
      type: string
      function: { name: string; parameters: { required: string[] } }
    }
    expect(decl.type).toBe('function')
    expect(decl.function.name).toBe('proposer_surveillance')
    expect(decl.function.parameters.required).toContain('site')
    expect(decl.function.parameters.required).toContain('date_debut')
    expect(trouverOutil('outil_inexistant')).toBeUndefined()
  })
})
