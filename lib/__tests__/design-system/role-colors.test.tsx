// __tests__/design-system/role-colors.test.tsx
import { render } from '@testing-library/react';
import { ROLE_COLORS } from '@/lib/config';

describe('Couleurs par rôle', () => {
  test('les couleurs correspondent au CSS', () => {
    expect(ROLE_COLORS.admin.primary).toBe('#1a237e');
    expect(ROLE_COLORS.inspector.primary).toBe('#b45309');
    expect(ROLE_COLORS.dg_anacim.primary).toBe('#1b4332');
    expect(ROLE_COLORS.dg_operator.primary).toBe('#065f46');
    expect(ROLE_COLORS.focal_operator.primary).toBe('#0f766e');
    expect(ROLE_COLORS.staff_operator.primary).toBe('#0d9488');
    expect(ROLE_COLORS.guest.primary).toBe('#475569');
  });
});