// lib/__tests__/ollamaWarmup.test.ts — Préchauffage + maintien au chaud
// (lib/ia/ollamaWarmup.ts). Une micro-inférence silencieuse, horodatée,
// battement d'entretien sans doublon, jamais d'erreur visible.

import { prechaufferOllama, entretenirChaleur } from '../ia/ollamaWarmup';

describe('prechaufferOllama', () => {
  beforeEach(() => {
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });
  test('micro-inférence keep_alive puis pas de rejouée (encore chaud)', async () => {
    await expect(prechaufferOllama()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/api\/chat$/);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.keep_alive).toBe('30m');
    expect(body.stream).toBe(false);
    await expect(prechaufferOllama()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test('Ollama éteint : false silencieux, sans throw', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('refused'));
    await expect(prechaufferOllama()).resolves.toBe(false);
  });
});

describe('entretenirChaleur', () => {
  let entretenirChaleur: () => void;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    window.localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    // Module frais : intervalle pas encore démarré par les tests précédents.
    entretenirChaleur = require('../ia/ollamaWarmup').entretenirChaleur;
  });
  afterEach(() => {
    jest.useRealTimers();
  });
  test('battement toutes les 20 min, onglet visible uniquement', async () => {
    entretenirChaleur();
    entretenirChaleur();
    expect(global.fetch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    await jest.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await jest.advanceTimersByTimeAsync(20 * 60 * 1000);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
