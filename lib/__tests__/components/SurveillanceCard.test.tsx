/**
 * @jest-environment jsdom
 */
// __tests__/components/SurveillanceCard.test.tsx
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import SurveillanceCard from '@/components/modules/surveillance/SurveillanceCard';

const mockSurveillance = {
  id: '1',
  statut: 'en_cours',
  type: 'programmee',
  date_debut: '2025-04-15T08:00:00Z',
  date_fin: '2025-04-17T17:00:00Z',
  portee: ['SGS', 'SLI'],
  equipe_ids: ['insp1', 'insp2'],
  chef_id: 'insp1',
  progression: 50,
};

describe('SurveillanceCard', () => {
  test('affiche les informations correctement', () => {
    render(<SurveillanceCard surveillance={mockSurveillance} />);
    
    expect(screen.getByText(/Programmée/)).toBeInTheDocument();
    expect(screen.getByText(/50%/)).toBeInTheDocument();
    expect(screen.getByText(/SGS/)).toBeInTheDocument();
  });

  test('a la bonne classe selon le statut', () => {
    const { container } = render(<SurveillanceCard surveillance={mockSurveillance} />);
    expect(container.firstChild).toHaveClass('border-l-warning');
  });
});
