/**
 * @jest-environment jsdom
 */
// __tests__/app/login/page.test.tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('LoginPage', () => {
  test('redirige vers la page d\'accueil', () => {
    render(<LoginPage />);
    expect(screen.getByText(/Redirection vers l'accueil/)).toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
