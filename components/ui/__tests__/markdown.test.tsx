import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { Markdown, convertirLatex, markdownVersTexte } from '../markdown'

describe('Markdown', () => {
  test('gras sans astérisques visibles', () => {
    const { container } = render(<Markdown texte="Voici une **Question de relance :** la suite" />)
    expect(screen.getByText('Question de relance :').tagName).toBe('STRONG')
    expect(container.textContent).not.toContain('**')
  })

  test('listes et titres', () => {
    render(<Markdown texte={'## Titre\n- point un\n- point deux'} />)
    expect(screen.getByText('Titre')).toBeInTheDocument()
    expect(screen.getByText('point un').tagName).toBe('LI')
  })

  test('LaTeX converti en Unicode lisible', () => {
    expect(convertirLatex('K')).toBe('K')
    expect(convertirLatex('\\alpha = 0.05')).toBe('α = 0.05')
    expect(convertirLatex('\\frac{a}{b}')).toBe('a/b')
    expect(convertirLatex('x^2 + x_1')).toBe('x² + x₁')
    expect(convertirLatex('\\sqrt{\\Delta}')).toBe('√(Δ)')
  })

  test('$K$ rendu sans dollars, $ monétaire intact', () => {
    const { container } = render(<Markdown texte="Coefficient $K$ et seuil $\\alpha = 0,05$" />)
    expect(container.textContent).not.toContain('$')
    expect(container.textContent).toContain('Coefficient K')
    expect(container.textContent).toContain('α = 0,05')
    const { container: prix } = render(<Markdown texte="Coût 5 $ par unité" />)
    expect(prix.textContent).toContain('5 $ par unité')
  })

  test('markdownVersTexte : brut lisible pour export', () => {
    const brut = markdownVersTexte('## Titre\n- **Point** important\n- Seuil $\\alpha = 0,05$\n\n`code` et *italique*')
    expect(brut).not.toContain('**')
    expect(brut).not.toContain('$')
    expect(brut).not.toContain('#')
    expect(brut).toContain('• Point important')
    expect(brut).toContain('α = 0,05')
  })

  test('pas de HTML injecté (XSS)', () => {
    const { container } = render(<Markdown texte={'<img src=x onerror=alert(1)> coucou'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('coucou')
  })
})
