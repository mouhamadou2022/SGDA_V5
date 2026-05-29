/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('LoginPage', () => {
  test('affiche le message de session expiree', () => {
    render(<LoginPage />);
    expect(screen.getByText(/Session expirée/)).toBeInTheDocument();
  });

  test('affiche le lien de retour a l\'accueil', () => {
    render(<LoginPage />);
    expect(screen.getByText(/Retour à l'accueil/)).toBeInTheDocument();
  });
});
