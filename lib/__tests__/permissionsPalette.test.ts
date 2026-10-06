// lib/__tests__/permissionsPalette.test.ts — Palette adaptée au rôle (pur).
import { modulesPourRole, moduleAutorise, typesRechercheAutorises } from '../config';

describe('modulesPourRole', () => {
  test('admin : tout', () => {
    expect(modulesPourRole('admin')).toEqual(['*']);
  });
  test('inspecteur : périmètre ANACIM sans admin ni DG', () => {
    const modules = modulesPourRole('inspector');
    expect(modules).toEqual(expect.arrayContaining(['surveillance', 'plans-actions', 'formation']));
    expect(modules).not.toContain('utilisateurs');
    expect(modules).not.toContain('audit');
    expect(modules).not.toContain('signatures');
  });
  test('dg_anacim : pilotage + signatures, pas les modules métier', () => {
    const modules = modulesPourRole('dg_anacim');
    expect(modules).toEqual(expect.arrayContaining(['dashboard', 'signatures']));
    expect(modules).not.toContain('surveillance');
    expect(modules).not.toContain('utilisateurs');
  });
  test('exploitant : modules operator-*, pas les modules ANACIM', () => {
    const modules = modulesPourRole('focal_operator');
    expect(modules).toEqual(expect.arrayContaining(['operator-ecarts', 'operator-evenements']));
    expect(modules).not.toContain('surveillance');
    expect(modules).not.toContain('audit');
  });
  test('inconnu/aucun : tableau de bord seul', () => {
    expect(modulesPourRole('fantome')).toEqual(['dashboard']);
    expect(modulesPourRole(undefined)).toEqual(['dashboard']);
    expect(modulesPourRole(null)).toEqual(['dashboard']);
  });
});

describe('moduleAutorise', () => {
  test('admin partout, inspecteur sans audit, DG sans surveillance', () => {
    expect(moduleAutorise('admin', 'audit')).toBe(true);
    expect(moduleAutorise('inspector', 'audit')).toBe(false);
    expect(moduleAutorise('inspector', 'surveillance')).toBe(true);
    expect(moduleAutorise('dg_anacim', 'surveillance')).toBe(false);
    expect(moduleAutorise('dg_anacim', 'signatures')).toBe(true);
    expect(moduleAutorise('focal_operator', 'surveillance')).toBe(false);
    expect(moduleAutorise('focal_operator', 'operator-evenements')).toBe(true);
  });
});

describe('typesRechercheAutorises', () => {
  test('internes : tout ; exploitants/invités : aérodromes seuls', () => {
    expect(typesRechercheAutorises('inspector')).toEqual(
      expect.arrayContaining(['ecart', 'surveillance', 'document']),
    );
    expect(typesRechercheAutorises('dg_anacim')).toEqual(
      expect.arrayContaining(['ecart', 'document']),
    );
    expect(typesRechercheAutorises('focal_operator')).toEqual(['aerodrome']);
    expect(typesRechercheAutorises('guest')).toEqual(['aerodrome']);
  });
});
