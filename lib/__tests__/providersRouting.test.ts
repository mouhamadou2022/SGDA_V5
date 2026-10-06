// lib/__tests__/providersRouting.test.ts — Routage providers (lib/ia/providers.ts).
// Fallback localhost<->127.0.0.1 (cas IPv6/IPv4) + skip des tiers gratuits
// quand le prompt dépasse leur quota (évite les 413 inutiles).

import { urlsOllama, getProviderTierInputCap, ordonnerProvidersLocalFirst, marquerQuotaEpuise, quotaEnPause, leverPauseQuota } from '../ia/providers';

describe('urlsOllama', () => {
  const OLD_ENV = process.env;
  beforeEach(() => { process.env = { ...OLD_ENV }; delete process.env.OLLAMA_URL; delete process.env.NEXT_PUBLIC_OLLAMA_URL; });
  afterAll(() => { process.env = OLD_ENV; });
  test('localhost -> variante 127.0.0.1 (et inverse)', () => {
    expect(urlsOllama()).toEqual([
      'http://localhost:11434/v1/chat/completions',
      'http://127.0.0.1:11434/v1/chat/completions',
    ]);
  });
  test('URL configurée respectée + variante', () => {
    process.env.OLLAMA_URL = 'http://192.168.1.20:11434';
    expect(urlsOllama()[0]).toBe('http://192.168.1.20:11434/v1/chat/completions');
    expect(urlsOllama()).toHaveLength(1);
  });
});

describe('ordonnerProvidersLocalFirst', () => {
  const liste = [
    { name: 'groq_0' },
    { name: 'aerorisq_0' },
    { name: 'google_ai_0' },
    { name: 'ollama' },
  ];
  test('locaux devant, ordre relatif conservé', () => {
    expect(ordonnerProvidersLocalFirst(liste, true).map(p => p.name)).toEqual([
      'aerorisq_0', 'ollama', 'groq_0', 'google_ai_0',
    ]);
  });
  test('aerorisq distant reste côté cloud', () => {
    expect(ordonnerProvidersLocalFirst(liste, false).map(p => p.name)).toEqual([
      'ollama', 'groq_0', 'aerorisq_0', 'google_ai_0',
    ]);
  });
});

describe('getProviderTierInputCap', () => {
  test('groq plafonné (tier gratuit ~7000), les autres illimités', () => {
    expect(getProviderTierInputCap('groq_0')).toBeLessThanOrEqual(7000);
    expect(getProviderTierInputCap('groq_fallback_0')).toBeLessThanOrEqual(7000);
    expect(getProviderTierInputCap('ollama')).toBe(Infinity);
    expect(getProviderTierInputCap('aerorisq_0')).toBe(Infinity);
  });
});

describe('pause auto sur quota \u00E9puis\u00E9', () => {
  test('marqu\u00E9 \u2192 en pause, expir\u00E9 \u2192 rejou\u00E9', () => {
    marquerQuotaEpuise('openrouter_0');
    expect(quotaEnPause('openrouter_0')).toBe(true);
    expect(quotaEnPause('groq_0')).toBe(false);
    leverPauseQuota('openrouter_0');
    expect(quotaEnPause('openrouter_0')).toBe(false);
  });
  test('expiration automatique', () => {
    marquerQuotaEpuise('groq_0', 1);
    expect(quotaEnPause('groq_0', Date.now())).toBe(true);
    expect(quotaEnPause('groq_0', Date.now() + 60000)).toBe(false);
  });
});

describe('pause auto : jumeaux fallback couverts', () => {
  test('marquer openrouter_0 pause aussi openrouter_fallback_0, pas groq', () => {
    marquerQuotaEpuise('openrouter_0');
    expect(quotaEnPause('openrouter_0')).toBe(true);
    expect(quotaEnPause('openrouter_fallback_0')).toBe(true);
    expect(quotaEnPause('groq_0')).toBe(false);
    leverPauseQuota('openrouter_0');
    expect(quotaEnPause('openrouter_fallback_0')).toBe(false);
  });
});
