// lib/__tests__/aiClientThink.test.ts â€” Option think (lib/ia/aiClient.ts).
// Transmise à /api/ia/analyze (défaut false = direct et rapide).

import { aiClient } from '../ia/aiClient';

describe('aiClient think', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'ok' }),
    });
  });
  test('think:true transmis au serveur', async () => {
    await aiClient.call({ systemPrompt: 's', userMessage: 'Analyse ceci en profondeur', think: true });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.think).toBe(true);
  });
  test('défaut false transmis', async () => {
    await aiClient.call({ systemPrompt: 's', userMessage: 'bonjour' });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.think).toBe(false);
  });
});

describe('garde-fou taille centrale', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'ok' }),
    });
  });
  const gros = (n: number) => Array.from({ length: n }, (_, i) => ({
    role: (i % 2 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `h${i}-` + 'y'.repeat(2000),
  }));
  test('historique monstre : coup\u00E9 aux anciens, message courant gard\u00E9 + note', async () => {
    await aiClient.call({ systemPrompt: 's', userMessage: 'question finale', history: gros(30) });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const total = body.messages.reduce((s: number, m: { content: string }) => s + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(26000);
    expect(body.messages[body.messages.length - 1].content).toBe('question finale');
    expect(body.systemPrompt).toContain('tronqu\u00E9s');
  });
  test('petit historique : intact, sans note', async () => {
    await aiClient.call({ systemPrompt: 's', userMessage: 'bonjour', history: gros(2).slice(0, 2) });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages).toHaveLength(3);
    expect(body.systemPrompt).toBe('s');
  });
  test('voie JSON : contexte complet pr\u00E9serv\u00E9 (paliers)', async () => {
    await aiClient.call({ systemPrompt: 's', userMessage: 'donne JSON', history: gros(30), responseFormat: 'json_object' });
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.messages).toHaveLength(31);
  });
});

describe('garde-fou taille et retry JSON', () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockReset();
  });
  test('sembleTronque : compteurs et fin abrupte', async () => {
    const { sembleTronque } = await import('../ia/aiClient');
    expect(sembleTronque('{"a": 1', 1000, 1000)).toBe(true);
    expect(sembleTronque('{"a": 1,', 1000, 10)).toBe(true);
    expect(sembleTronque('{"a": 1}', 1000)).toBe(false);
    expect(sembleTronque('', 1000)).toBe(false);
  });
  test('tronque au plafond : retry PLUS GRAND une fois, puis parse', async () => {
    const f = global.fetch as jest.Mock;
    f.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '{"items": [{"q": "abc",', usage: { completion_tokens: 1000 } }),
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: '{"items": [{"q": "abc"}]}', usage: { completion_tokens: 50 } }),
    });
    const res = await aiClient.callJSON<{ items: Array<{ q: string }> }>(
      { systemPrompt: 'prompt-retry-plus-grand', userMessage: 'genere', maxTokens: 1000 },
      { items: [] },
    );
    expect(res).toEqual({ items: [{ q: 'abc' }] });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).maxTokens).toBe(1500);
  });
  test('JSON mal forme non tronque : paliers decroissants classiques', async () => {
    const f = global.fetch as jest.Mock;
    f.mockResolvedValue({ ok: true, json: async () => ({ content: 'pas du json du tout' }) });
    const res = await aiClient.callJSON(
      { systemPrompt: 'prompt-toujours-invalide', userMessage: 'genere', maxTokens: 1000 },
      { items: ['repli'] } as unknown as { items: string[] },
    );
    expect(res).toEqual({ items: ['repli'] });
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

describe('erreurIaEnClair', () => {
  test('chaque panne a son message actionnable, jamais de perte', async () => {
    const { erreurIaEnClair } = await import('../ia/aiClient');
    expect(erreurIaEnClair('Tous les providers LLM ont échoué [ALL_PROVIDERS_FAILED]')).toContain('indisponible');
    expect(erreurIaEnClair('quota dépassé (429)')).toContain('Quotas cloud');
    expect(erreurIaEnClair('402 Insufficient credits')).toContain('Quotas cloud');
    expect(erreurIaEnClair('Délai dépassé — IA lente')).toContain('trop longtemps');
    expect(erreurIaEnClair('model mistral retiré (404)')).toContain('indisponible ou retiré');
    expect(erreurIaEnClair('truc bizarre inconnu')).toBe('truc bizarre inconnu');
    expect(erreurIaEnClair('')).toBe('Réponse indisponible.');
  });
});
