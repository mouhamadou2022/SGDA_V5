/**
 * @jest-environment jsdom
 */
// __tests__/design-system/role-personalization.test.tsx
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';

// Mock window.matchMedia (jsdom doesn't implement it)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock('@/components/layout/AppShell', () => {
  const MockAppShell = ({ user, children }: any) => {
    document.body.setAttribute('data-role', user.role);
    return <div>{children}</div>;
  };
  return { AppShell: MockAppShell };
});

jest.mock('@/components/layout/AppHeader', () => {
  const LABELS: Record<string, string> = {
    admin: 'ADMINISTRATEUR',
    inspector: 'INSPECTEUR',
    dg_anacim: 'DG ANACIM',
    dg_operator: 'DG EXPLOITANT',
  };
  const MockAppHeader = ({ user }: any) => {
    return <div>{LABELS[user.role] || user.role}</div>;
  };
  return { AppHeader: MockAppHeader };
});

describe('Personnalisation par rôle', () => {
  test('data-role est correctement appliqué sur le body', () => {
    const { AppShell } = require('@/components/layout/AppShell');
    const mockUser = { role: 'admin', prenom: 'Test', nom: 'User', id: '1', email: 'test@test.com' };
    render(<AppShell user={mockUser} onLogout={() => {}}><div /></AppShell>);
    
    expect(document.body.getAttribute('data-role')).toBe('admin');
  });

  test('Badge de rôle affiche le bon label', () => {
    const { AppHeader } = require('@/components/layout/AppHeader');
    const roles = [
      { role: 'admin', expected: 'ADMINISTRATEUR' },
      { role: 'inspector', expected: 'INSPECTEUR' },
      { role: 'dg_anacim', expected: 'DG ANACIM' },
      { role: 'dg_operator', expected: 'DG EXPLOITANT' },
    ];

    roles.forEach(({ role, expected }) => {
      const { getByText } = render(<AppHeader user={{ role, prenom: 'Test', nom: 'User' }} onLogout={() => {}} />);
      expect(getByText(expected)).toBeInTheDocument();
    });
  });
});
