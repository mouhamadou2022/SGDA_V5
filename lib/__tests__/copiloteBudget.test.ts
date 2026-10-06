// lib/__tests__/copiloteBudget.test.ts — Plafonds de contexte (pur, sans réseau).
import { aiClient } from '../ia/aiClient';
import { copiloteAgent, plafonnerHistorique, plafonnerTextePieces, BUDGET_HISTORIQUE_CHARS } from '../ia/agents/copiloteAgent';

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
  test('budget par défaut = 6000 (tient le tier gratuit avec pièces + RAG)', () => {
    expect(BUDGET_HISTORIQUE_CHARS).toBe(6000);
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
    const texte = await copiloteAgent.repondre({ question: 'Fais une synth\u00E8se.', historique: [] });
    expect(texte).toContain('Premi\u00E8re partie...');
    expect(texte).toContain('...et fin.');
    expect(appelIA).toHaveBeenCalledTimes(2);
    expect(String(appelIA.mock.calls[1][0].userMessage)).toContain('Continuez');
  });
  test('suite en \u00E9chec : premi\u00E8re partie conserv\u00E9e', async () => {
    appelIA
      .mockResolvedValueOnce({ content: 'D\u00E9but.', ok: true, usage: { completion_tokens: 4096 } })
      .mockResolvedValueOnce({ content: '', ok: false, error: 'timeout' });
    const texte = await copiloteAgent.repondre({ question: 'Fais une synth\u00E8se.', historique: [] });
    expect(texte).toBe('D\u00E9but.');
  });
});
