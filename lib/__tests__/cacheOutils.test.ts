// lib/__tests__/cacheOutils.test.ts — Cache des lectures d'outils pilote.
// Clé normalisée (casse, accents, ordre), TTL par nature, jamais d'écritures.

import {
  normaliserValeurCache,
  cleCacheOutil,
  lireCacheOutil,
  ecrireCacheOutil,
  statsCacheOutils,
} from '../ia/pilote/bouclePilote';

describe('normaliserValeurCache', () => {
  test('casse, accents, espaces et ordre indifférents', () => {
    expect(normaliserValeurCache('État  GOBD')).toBe('etat gobd');
    expect(normaliserValeurCache({ b: 1, a: 'X' })).toEqual({ a: 'x', b: 1 });
    expect(cleCacheOutil('etat_site', { site: 'GOBD' }))
      .toBe(cleCacheOutil('etat_site', { site: '  gobd ' }));
  });
});

describe('lire/ecrireCacheOutil', () => {
  const T0 = 1_700_000_000_000;
  test('hit puis expiration TTL', () => {
    ecrireCacheOutil('lister_plannings', { site: 'GOBD' }, false, '{"ok":true}', T0);
    expect(lireCacheOutil('lister_plannings', { site: 'gobd' }, false, T0 + 1000))
      .toBe('{"ok":true}');
    // TTL défaut 5 min : expiré après 6 min.
    expect(lireCacheOutil('lister_plannings', { site: 'GOBD' }, false, T0 + 6 * 60 * 1000))
      .toBeNull();
  });
  test('jamais les écritures, la messagerie ni l\u2019audit', () => {
    ecrireCacheOutil('creer_ecart', { site: 'GOBD' }, true, '{"ok":true}', T0);
    expect(lireCacheOutil('creer_ecart', { site: 'GOBD' }, true, T0 + 1)).toBeNull();
    ecrireCacheOutil('messages_recents', {}, false, '{"ok":true}', T0);
    expect(lireCacheOutil('messages_recents', {}, false, T0 + 1)).toBeNull();
    ecrireCacheOutil('journal_audit', {}, false, '{"ok":true}', T0);
    expect(lireCacheOutil('journal_audit', {}, false, T0 + 1)).toBeNull();
  });
  test('stats cohérentes', () => {
    const avant = statsCacheOutils();
    lireCacheOutil('___inexistant___', {}, false, T0);
    const apres = statsCacheOutils();
    expect(apres.lectures).toBe(avant.lectures + 1);
    expect(apres.hits).toBe(avant.hits);
  });
});
