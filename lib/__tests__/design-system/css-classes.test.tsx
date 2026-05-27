/**
 * @jest-environment jsdom
 */
// __tests__/design-system/css-classes.test.tsx
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

describe('Classes CSS globales', () => {
  test('Bouton primary a les bonnes classes', () => {
    const { container } = render(<Button className="btn-primary">Test</Button>);
    expect(container.firstChild).toHaveClass('btn-primary');
  });

  test('Badge danger a la classe badge', () => {
    const { container } = render(<Badge variant="danger">Test</Badge>);
    expect(container.firstChild).toHaveClass('badge');
  });

  test('Card a la classe card', () => {
    const { container } = render(<Card>Test</Card>);
    expect(container.firstChild).toHaveClass('card');
  });
});
