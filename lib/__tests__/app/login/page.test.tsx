/**
 * @jest-environment jsdom
 */
// __tests__/app/login/page.test.tsx
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '@/app/login/page';

// Mock du router
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('LoginPage', () => {
  test('affiche le formulaire de connexion', () => {
    render(<LoginPage />);
    
    expect(screen.getByPlaceholderText(/prenom.nom@anacim.sn/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ACCÉDER À LA PLATEFORME/ })).toBeInTheDocument();
  });

  test('affiche les statistiques', () => {
    render(<LoginPage />);
    
    expect(screen.getByText(/AÉRODROMES À SURVEILLER/)).toBeInTheDocument();
    expect(screen.getByText(/INSPECTEURS ACTIFS/)).toBeInTheDocument();
    expect(screen.getByText(/CONFORMITÉ VISÉE/)).toBeInTheDocument();
  });

  test('gère la soumission du formulaire', async () => {
    render(<LoginPage />);
    
    fireEvent.change(screen.getByPlaceholderText(/prenom.nom@anacim.sn/), {
      target: { value: 'test@anacim.sn' },
    });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/), {
      target: { value: 'password' },
    });
    
    fireEvent.click(screen.getByRole('button', { name: /ACCÉDER À LA PLATEFORME/ }));
    
    await waitFor(() => {
      expect(screen.getByText(/CONNEXION EN COURS/)).toBeInTheDocument();
    });
  });
});
