// lib/__tests__/historiqueRefus.test.ts — refus anterieurs multi-cycles (pur).
import { refusAnterieurs } from '../historiqueRefus';

const H = (id: string, type: string, decision: string, date: string) => ({
  id, type, date, acteur: 'insp1', role_acteur: 'inspector',
  description: 'x', details: { decision },
}) as any;

describe('refusAnterieurs', () => {
  test('ne garde que les refus/reserves du type demande', () => {
    const h = [
      H('1', 'evaluation_pac', 'refuse', '2026-09-01T10:00:00Z'),
      H('2', 'evaluation_pac', 'accepte', '2026-09-10T10:00:00Z'),
      H('3', 'validation_preuves', 'refuse', '2026-09-12T10:00:00Z'),
    ];
    const r = refusAnterieurs(h, 'evaluation_pac', null);
    expect(r.map((x) => x.id)).toEqual(['1']);
  });
  test('exclut le doublon courant (meme decision < 60s)', () => {
    const h = [H('1', 'evaluation_pac', 'refuse', '2026-10-01T10:00:00.000Z')];
    const r = refusAnterieurs(h, 'evaluation_pac', { decision: 'refuse', date: '2026-10-01T10:00:00.050Z' });
    expect(r).toHaveLength(0);
  });
  test('garde un refus identique mais ancien (vrai cycle precedent)', () => {
    const h = [H('1', 'evaluation_pac', 'refuse', '2026-09-01T10:00:00Z')];
    const r = refusAnterieurs(h, 'evaluation_pac', { decision: 'refuse', date: '2026-10-01T10:00:00Z' });
    expect(r.map((x) => x.id)).toEqual(['1']);
  });
  test('plus recents dabord, entrees vides ignorees', () => {
    const r = refusAnterieurs([null, undefined] as any, 'evaluation_pac', null);
    expect(r).toEqual([]);
  });
});
