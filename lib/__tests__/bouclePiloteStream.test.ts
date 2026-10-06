// lib/__tests__/bouclePiloteStream.test.ts — Streaming pilote (lib/ia/pilote/bouclePilote.ts).
// Assemblage NDJSON : texte concaténé, outils fusionnés (objets ou fragments), robuste.

import { assemblerReponseStream, estEchoPromptSysteme, estSalutation, necessiteReflexion, selectionnerOutils } from '../ia/pilote/bouclePilote';
import { listerOutils } from '../ia/pilote/outils';

const ligne = (message: unknown, done = false) =>
  JSON.stringify({ message, done });

describe('assemblerReponseStream', () => {
  test('texte seul concaténé, lignes vides et [DONE] ignorées', () => {
    const out = assemblerReponseStream([
      '',
      ligne({ role: 'assistant', content: 'Bon' }),
      ligne({ role: 'assistant', content: 'jour' }),
      '[DONE]',
      ligne({ done: true }),
    ]);
    expect(out).toEqual({ content: 'Bonjour', toolCalls: [] });
  });
  test('lignes invalides ignorées', () => {
    expect(assemblerReponseStream(['{pas json', ligne({ role: 'assistant', content: 'ok' })]).content).toBe('ok');
  });
  test('tool_calls objets complets fusionnés par nom', () => {
    const out = assemblerReponseStream([
      ligne({ role: 'assistant', content: '' }),
      ligne({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'lister_plannings', arguments: { site: 'GOBD' } } }] }),
    ]);
    expect(out.toolCalls).toEqual([{ function: { name: 'lister_plannings', arguments: { site: 'GOBD' } } }]);
  });
  test('tool_calls fragments de chaîne assemblés puis parsés', () => {
    const out = assemblerReponseStream([
      ligne({ role: 'assistant', tool_calls: [{ function: { name: 'creer_ecart', arguments: '{"libelle": "Fis' } }] }),
      ligne({ role: 'assistant', tool_calls: [{ function: { name: 'creer_ecart', arguments: 'sure"}' } }] }),
    ]);
    expect(out.toolCalls).toEqual([{ function: { name: 'creer_ecart', arguments: { libelle: 'Fissure' } } }]);
  });
  test('fragments invalides → arguments vides (jamais de crash)', () => {
    const out = assemblerReponseStream([
      ligne({ role: 'assistant', tool_calls: [{ function: { name: 'x', arguments: '{oups' } }] }),
    ]);
    expect(out.toolCalls).toEqual([{ function: { name: 'x', arguments: {} } }]);
  });
  test('salutations pures détectées, vraies demandes non', () => {
    for (const t of ['bonjour', 'Bonsoir !', '  salut  ', 'merci', 'au revoir', 'À bientôt…']) {
      expect(estSalutation(t)).toBe(true);
    }
    for (const t of ['bonjour, donne-moi le profil de GOBD', 'merci pour le rapport, et les écarts ?', '', 'bonjourbonjour']) {
      expect(estSalutation(t)).toBe(false);
    }
  });
  test('réflexion sélective : dures oui, courantes non', () => {
    for (const t of ['Évalue le PAC de ECA-2026-042', 'Analyse les écarts critiques de GOBD', 'Fais-moi une synthèse du site', 'Briefing de Tambacounda', 'Compare GOBD et GOOY']) {
      expect(necessiteReflexion(t)).toBe(true);
    }
    for (const t of ['bonjour', 'état GOBD ?', 'liste les écarts ouverts', 'quel est le score de GOBD']) {
      expect(necessiteReflexion(t)).toBe(false);
    }
    expect(necessiteReflexion('x'.repeat(300))).toBe(true);
  });
  test('salutations : préfixe DEMANDE et pièces ignorés, vraie demande non', () => {
    for (const t of ['DEMANDE : bonsoir', 'demande:merci beaucoup', '── PIÈCE : ras.pdf ──\n…\n\nDEMANDE : salut']) {
      expect(estSalutation(t)).toBe(true);
    }
    for (const t of ['DEMANDE : Compare GOBD et GOTT', 'DEMANDE : merci pour le rapport, et les écarts ?']) {
      expect(estSalutation(t)).toBe(false);
    }
  });
  test('écho du prompt système détecté, réponse normale non', () => {
    expect(estEchoPromptSysteme('Le message transmis est une règle de fonctionnement du pilote. Voici une synthèse de ces règles :')).toBe(true);
    expect(estEchoPromptSysteme('GOBD — score 72/100 (moyen), 2 écarts ouverts. Prochaine étape : suivi des écarts.')).toBe(false);
  });
  test('sélection par intention : chaque cas étalon garde son outil attendu', () => {
    const cas: Array<[string, string]> = [
      ['Compare GOBD et GOTT', 'comparer_sites'],
      ['Génère le briefing de GOBD en PDF', 'generer_rapport_pdf'],
      ['Planifie une périodique à Ziguinchor le 2026-12-15', 'proposer_surveillance'],
      ['Liste les écarts critiques ouverts', 'lister_ecarts'],
      ['Quel est l’état de Tambacounda ?', 'etat_site'],
      ['Quelle est la longueur de piste de GOBD selon l’AIP ?', 'rechercher_web'],
      ['Donne-moi l’état de GOGB', 'rechercher_aerodrome'],
      ['Faut-il une mise en œuvre ou un suivi pour les écarts de GOBD ?', 'lister_ecarts'],
      ['Détaille l’écart ECA-2026-001', 'detail_ecart'],
      ['Quels plannings pour GOBD ?', 'lister_plannings'],
      ['Selon le RAS 14, quelle exigence pour la longueur de piste ?', 'rechercher_reglementaire'],
      ['Que dit le Doc 9859 sur le suivi des écarts ?', 'rechercher_reglementaire'],
      ['Quel paragraphe du RAS 14 impose le balisage lumineux ?', 'rechercher_reglementaire'],
      ['Fais tes devoirs du soir sur le kit', 'cours_du_soir'],
    ];
    for (const [question, attendu] of cas) {
      const sel = selectionnerOutils(question);
      expect(sel).toContain(attendu);
      expect(sel.length).toBeLessThan(listerOutils().length);
    }
    // Comparer : l'outil dédié d'abord (biais favorable au petit modèle).
    expect(selectionnerOutils('Compare GOBD et GOTT')[0]).toBe('comparer_sites');
    // Inconnu → liste complète (sûr, jamais d'outil manquant).
    expect(selectionnerOutils('xyzzy brume étrange').length).toBe(listerOutils().length);
  });
  test('done_reason capturé (length → suite auto, stop → fin)', () => {
    const out = assemblerReponseStream([
      ligne({ role: 'assistant', content: 'Début...' }),
      JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'length' }),
    ]);
    expect(out.doneReason).toBe('length');
    const out2 = assemblerReponseStream([
      ligne({ role: 'assistant', content: 'Fin.' }),
      JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }),
    ]);
    expect(out2.doneReason).toBe('stop');
    expect(assemblerReponseStream([ligne({ role: 'assistant', content: 'x' })]).doneReason).toBeUndefined();
  });
  test('texte + outils mélangés sur plusieurs chunks', () => {
    const out = assemblerReponseStream([
      ligne({ role: 'assistant', content: 'Je vérifie ' }),
      ligne({ role: 'assistant', content: 'le site.', tool_calls: [{ function: { name: 'etat_site', arguments: { site: 'GOBD' } } }] }),
    ]);
    expect(out.content).toBe('Je vérifie le site.');
    expect(out.toolCalls).toHaveLength(1);
  });
});
