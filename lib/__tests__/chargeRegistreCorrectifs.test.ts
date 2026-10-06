// lib/__tests__/chargeRegistreCorrectifs.test.ts — Correctifs XS charge + registre (pur).
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { chargeUtils, type Tache } from '../chargeUtils';
import { registreUtils } from '../registreUtils';
import { createRegistresSlice } from '../store/registresSlice';

jest.mock('../datastore', () => ({
  saveRegistreEntry: async (e: unknown) => ({ data: e, error: null }),
}));

const tache = (over: Partial<Tache> = {}): Tache => ({
  id: `t-${Math.random().toString(36).slice(2, 7)}`,
  type: 'surveillance',
  titre: 'T', description: 'D',
  priorite: 'moyenne',
  statut: 'a_faire',
  date_echeance: new Date().toISOString(),
  temps_estime: 8,
  progression: 0,
  lien_id: 'i1',
  ...over,
});

describe('calculerChargeInspecteur : capacité restante', () => {
  test('tâches terminées exclues du numérateur', () => {
    const r = chargeUtils.calculerChargeInspecteur('i1', 'N', [
      tache({ statut: 'termine', temps_estime: 100 }),
      tache({ statut: 'a_faire', temps_estime: 10 }),
    ], 30);
    // Disponible 30j = 21j ouvrés × 7h = 147h → 10/147 ≈ 7 % (pas 75 %).
    expect(r.charge).toBe(Math.min(100, Math.round((10 / 147) * 100)));
    expect(r.taches_par_statut.termine).toBe(1);
  });
  test('en_retard compte (travail en souffrance)', () => {
    const r = chargeUtils.calculerChargeInspecteur('i1', 'N', [
      tache({ statut: 'en_retard', temps_estime: 10 }),
    ], 30);
    expect(r.charge).toBeGreaterThan(0);
    expect(r.taches_par_statut.en_retard).toBe(1);
  });
});

describe('prochainCompteurRegistre : max+1 par (type, année)', () => {
  test('ignore les autres types/années et les références malformées', () => {
    const entries = [
      { reference: 'REG-CER-2026-0005' },
      { reference: 'REG-CER-2026-0002' },
      { reference: 'REG-CER-2025-0009' },
      { reference: 'BIDON' },
    ];
    expect(registreUtils.prochainCompteurRegistre(entries, 'certifications', 2026)).toBe(6);
  });
  test('vide → 1 (jamais de doublon par suppression)', () => {
    expect(registreUtils.prochainCompteurRegistre([], 'ecarts', 2026)).toBe(1);
    expect(registreUtils.prochainCompteurRegistre([{ reference: 'REG-EVA-2026-0007' }], 'ecarts', 2026)).toBe(1);
  });
});

describe('addRegistreEntry : dedup source (SIC)', () => {
  test('meme source auto-generee deux fois : un seul archivage', async () => {
    const s = createStore<ReturnType<typeof createRegistresSlice>>()(
      createRegistresSlice as unknown as StateCreator<ReturnType<typeof createRegistresSlice>, [], [], ReturnType<typeof createRegistresSlice>>,
    );
    const st = s.getState() as unknown as {
      registreEntries: Array<{ id: string; source_id?: string }>;
      addRegistreEntry: (e: Record<string, unknown>) => Promise<void>;
    };
    const entry = { id: 'r1', source_id: 'evt-9', source_type: 'evenement' };
    await st.addRegistreEntry(entry);
    await st.addRegistreEntry({ ...entry, id: 'r2' });
    const apres = (s.getState() as unknown as { registreEntries: Array<{ id: string }> }).registreEntries;
    expect(apres).toHaveLength(1);
    expect(apres[0].id).toBe('r1');
  });
  test('sans source : deux insertions manuelles conservées', async () => {
    const s = createStore<ReturnType<typeof createRegistresSlice>>()(
      createRegistresSlice as unknown as StateCreator<ReturnType<typeof createRegistresSlice>, [], [], ReturnType<typeof createRegistresSlice>>,
    );
    const st = s.getState() as unknown as {
      registreEntries: Array<{ id: string }>;
      addRegistreEntry: (e: Record<string, unknown>) => Promise<void>;
    };
    await st.addRegistreEntry({ id: 'r1' });
    await st.addRegistreEntry({ id: 'r2' });
    const apres = (s.getState() as unknown as { registreEntries: Array<{ id: string }> }).registreEntries;
    expect(apres).toHaveLength(2);
  });
});
