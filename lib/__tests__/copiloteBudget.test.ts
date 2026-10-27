// lib/__tests__/copiloteBudget.test.ts — Plafonds de contexte (pur, sans réseau).
import { aiClient } from '../ia/aiClient';
import { copiloteAgent, plafonnerHistorique, plafonnerTextePieces, construireContextePieces, BUDGET_HISTORIQUE_CHARS } from '../ia/agents/copiloteAgent';

jest.mock('../ia/aiClient', () => ({ aiClient: { call: jest.fn() } }));
const appelIA = aiClient.call as jest.Mock;

const msg = (n: number, taille: number): { role: 'user' | 'assistant'; content: string } => ({ role: n % 2 ? 'user' : 'assistant', content: `m${n}-` + 'x'.repeat(taille) });

describe('plafonnerHistorique', () => {
  test('sous budget : 8 derniers intacts, sans troncature', () => {
    const entree = Array.from({ length: 12 }, (_, i) => msg(i, 10));
    const { messages, tronque } = plafonnerHistorique(entree);
    expect(tronque).toBe(false);
    expect(messages).toHaveLength(8);
    expect(messages[0].content.startsWith('m4-')).toBe(true);
  });
  test('hors budget : garde les plus récents, signale', () => {
    const entree = Array.from({ length: 8 }, (_, i) => msg(i, 2000));
    const { messages, tronque } = plafonnerHistorique(entree, 6000);
    expect(tronque).toBe(true);
    const total = messages.reduce((s, m) => s + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(6000);
    expect(messages[messages.length - 1].content.startsWith('m7-')).toBe(true);
  });
  test('budget par défaut = 3000 (tient le tier gratuit avec pièces + RAG)', () => {
    expect(BUDGET_HISTORIQUE_CHARS).toBe(3000);
  });
  test('vide : rien, sans troncature', () => {
    expect(plafonnerHistorique([])).toEqual({ messages: [], tronque: false });
  });
});

describe('plafonnerTextePieces (non-régression)', () => {
  test('petite pièce intacte', () => {
    const { texte, tronque } = plafonnerTextePieces([{ id: 'p1', nom: 'a.pdf', texte: 'bonjour' }]);
    expect(tronque).toBe(false);
    expect(texte).toContain('bonjour');
  });
  test('grosse pièce plafonnée à 12000 car. (tient les tiers + le local)', () => {
    const gros = 'z'.repeat(30000);
    const { texte, tronque } = plafonnerTextePieces([{ id: 'p1', nom: 'gros.pdf', texte: gros }]);
    expect(tronque).toBe(true);
    expect(texte.length).toBeLessThanOrEqual(13000);
    expect(texte).toContain('tronquée');
  });
});

describe('construireContextePieces (lecture de TOUT le document)', () => {
  test('trouve une exigence située à la fin d’une grosse pièce', () => {
    const texte = 'Début sans rapport avec la question. '.repeat(800) + 'EXIGENCE FINALE : clôture des écarts sous 30 jours.'
    const { texte: contexte, tronque } = construireContextePieces(
      [{ id: 'p1', nom: 'gros.pdf', texte }],
      'Quel est le délai de clôture des écarts ?',
      6000,
    );
    expect(contexte).toContain('30 jours');
    expect(tronque).toBe(true);
  });
  test('petite pièce : contexte intégral, sans troncature', () => {
    const { texte, tronque } = construireContextePieces([{ id: 'p1', nom: 'a.pdf', texte: 'bonjour' }]);
    expect(texte).toContain('bonjour');
    expect(tronque).toBe(false);
  });
});

describe('repondre : lecture intégrale d’un gros document', () => {
  test('demande globale : chaque lot est lu (map) puis la réponse est rédigée (reduce)', async () => {
    appelIA.mockReset();
    const texte = Array.from({ length: 20 }, (_, i) => `Section ${i} : ${'x'.repeat(1500)}`).join('\n\n');
    appelIA.mockResolvedValue({ content: 'Fait pertinent.', ok: true, usage: { completion_tokens: 10 } });
    const texteFinal = await copiloteAgent.repondre({
      question: 'Fais une synthèse complète du document.',
      pieces: [{ id: 'p1', nom: 'gros.pdf', texte }],
      historique: [],
    });
    // 30 000 caractères / 9 000 = 4 lots → 4 lectures + 1 rédaction finale.
    expect(appelIA.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(texteFinal).toBe('Fait pertinent.');
    const messagesMap = appelIA.mock.calls.slice(0, -1).map(c => String(c[0].userMessage));
    expect(messagesMap.some(m => m.includes('EXTRAIT 4/4'))).toBe(true);
  });
});

describe('repondre : suite automatique si coup\u00E9e au plafond', () => {
  beforeEach(() => {
    appelIA.mockReset();
  });
  test('r\u00E9ponse compl\u00E8te : un seul appel', async () => {
    appelIA.mockResolvedValue({ content: 'Voici la synth\u00E8se demand\u00E9e.', ok: true, usage: { completion_tokens: 120 } });
    const texte = await copiloteAgent.repondre({ question: 'Fais une synth\u00E8se.', historique: [] });
    expect(texte).toBe('Voici la synth\u00E8se demand\u00E9e.');
    expect(appelIA).toHaveBeenCalledTimes(1);
  });
  test('coup\u00E9e au plafond : suite concat\u00E9n\u00E9e, jamais de boucle', async () => {
    appelIA
      .mockResolvedValueOnce({ content: 'Premi\u00E8re partie...', ok: true, usage: { completion_tokens: 4000 } })
      .mockResolvedValueOnce({ content: '...et fin.', ok: true, usage: { completion_tokens: 50 } });
    const texte = await copiloteAgent.repondre({ question: 'Fais une synth\u00E8se complete.', historique: [] });
    expect(texte).toContain('Premi\u00E8re partie...');
    expect(texte).toContain('...et fin.');
    expect(appelIA).toHaveBeenCalledTimes(2);
    expect(String(appelIA.mock.calls[1][0].userMessage)).toContain('Continuez');
  });
  test('suite en \u00E9chec : premi\u00E8re partie conserv\u00E9e', async () => {
    appelIA
      .mockResolvedValueOnce({ content: 'D\u00E9but.', ok: true, usage: { completion_tokens: 4096 } })
      .mockResolvedValueOnce({ content: '', ok: false, error: 'timeout' });
    const texte = await copiloteAgent.repondre({ question: 'Fais une synth\u00E8se detaillee.', historique: [] });
    expect(texte).toBe('D\u00E9but.');
  });
});
