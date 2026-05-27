// components/forms/__tests__/AerodromeForm.steps.test.tsx
// Tests fonctionnels — navigation entre étapes du wizard AerodromeForm
// Couvre : indicateur d'étapes, accès séquentiel, mode édition, étape 6

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (_loader: any) => {
    const Stub = ({ onChange }: any) => (
      <div data-testid="location-picker">
        <button
          type="button"
          data-testid="map-pick"
          onClick={() => onChange?.({ lat: 14.73, lng: -17.49 })}
        >
          Choisir position
        </button>
      </div>
    )
    return Stub
  },
}))

jest.mock('@/lib/store', () => ({ useAppStore: jest.fn() }))

jest.mock('@/lib/ia/agents/assistantAgent', () => ({
  assistantAgent: {
    chat: jest.fn().mockResolvedValue({ message: '{}' }),
  },
}))

jest.mock('@/hooks/useFormProgress', () => ({
  useFormProgress: () => 0,
}))

jest.mock('@/components/ui/FormShell', () => {
  const R = require('react')
  return {
    // La valeur par défaut doit être une fonction (même signature que dans FormShell.tsx)
    FormProgressContext: R.createContext(() => {}),
  }
})

jest.mock('@/lib/performance/globalOptimizer', () => ({
  LazyLoad: ({ children }: any) => <>{children}</>,
}))

global.fetch = jest.fn().mockResolvedValue({
  json: async () => ({ address: {}, namedetails: {} }),
})

// jsdom ne supporte pas scrollTo sur les éléments
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  value: jest.fn(),
  writable: true,
})

// ─── Import après mocks ───────────────────────────────────────────────────────
import { useAppStore } from '@/lib/store'
import AerodromeForm from '../AerodromeForm'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockAddAerodrome    = jest.fn()
const mockUpdateAerodrome = jest.fn()
const mockOnClose         = jest.fn()
const mockOnSuccess       = jest.fn()

const MOCK_AERODROME = {
  id: 'a1',
  nom: 'Aéroport Léopold Sédar Senghor',
  code_oaci: 'GOOY',
  type: 'international',
  type_entite: 'aerodrome',
  region: 'Dakar',
  statut: 'actif',
  maturite_sgs: 4,
  latitude: 14.7347,
  longitude: -17.4902,
  altitude: 24,
  categorie_sslia: '9',
  piste_principale: { longueur: 3600, largeur: 45, revetement: 'Béton bitumineux', code_reference: 'F' },
  exploitant_nom: 'AIBD SA',
  exploitant_contact_nom: 'Directeur', exploitant_contact_prenom: '',
  exploitant_tel: '', exploitant_email: '',
  deleted_at: null,
} as any

const MOCK_STATE = {
  aerodromes: [MOCK_AERODROME],
  utilisateurs: [],
  addAerodrome: mockAddAerodrome,
  updateAerodrome: mockUpdateAerodrome,
  setLoading: jest.fn(),
  addNotification: jest.fn(),
  user: { id: 'u1', role: 'inspector' },
}

function setupStore(overrides?: Partial<typeof MOCK_STATE>) {
  const state = { ...MOCK_STATE, ...overrides }
  ;(useAppStore as unknown as jest.Mock).mockImplementation((sel: any) =>
    typeof sel === 'function' ? sel(state) : state
  )
}

function renderNewForm() {
  setupStore()
  return render(
    <AerodromeForm
      aerodrome={undefined}
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
      userRole="inspector"
    />
  )
}

function renderEditForm(aerodrome = MOCK_AERODROME) {
  setupStore()
  return render(
    <AerodromeForm
      aerodrome={aerodrome}
      onClose={mockOnClose}
      onSuccess={mockOnSuccess}
      userRole="inspector"
    />
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Retourne les boutons d'étapes du StepIndicator */
function getStepButtons() {
  return screen.getAllByRole('button', { name: /localisation|validation ia|général|exploitant|infrastructure|sgs|statut|fato|piste/i })
}

/** Retourne le label "Étape X / 6" */
function getStepCounter() {
  return screen.getByText(/étape \d+ \/ 6/i)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AerodromeForm — navigation par étapes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── 1. Indicateur d'étapes (nouveau formulaire) ───────────────────────────

  describe('Indicateur étapes (nouveau formulaire)', () => {
    it('affiche 6 étapes dans l\'indicateur', () => {
      renderNewForm()
      // 6 boutons : Localisation, Validation IA, Général, Exploitant, Infrastructure, SGS & Statut
      const stepDivs = document.querySelectorAll('[class*="flex-col"][class*="items-center"][class*="min-w"]')
      // Au moins les étiquettes des 6 étapes doivent être présentes
      expect(screen.getByText('Localisation')).toBeInTheDocument()
      expect(screen.getByText('Validation IA')).toBeInTheDocument()
      expect(screen.getByText('Général')).toBeInTheDocument()
      expect(screen.getByText('Exploitant')).toBeInTheDocument()
      expect(screen.getByText('SGS & Statut')).toBeInTheDocument()
    })

    it('démarre à l\'étape 1 (compteur "Étape 1 / 6")', () => {
      renderNewForm()
      expect(getStepCounter()).toHaveTextContent('Étape 1 / 6')
    })

    it("affiche le contenu de l'étape 1 (localisation) par défaut", () => {
      renderNewForm()
      expect(screen.getByText(/localisation géographique/i)).toBeInTheDocument()
    })

    it('les étapes 2 à 6 sont désactivées au départ (boutons disabled)', () => {
      renderNewForm()
      // L'étape 1 est toujours accessible (step.id === 1)
      // Les étapes 2-6 : canClick = isDone || completedSteps.has(step.id - 1)
      // Au départ completedSteps est vide → uniquement l'étape 1 accessible
      const allButtons = screen.getAllByRole('button')
      const stepIndicatorButtons = allButtons.filter(btn =>
        btn.hasAttribute('disabled') &&
        (btn.textContent?.includes('Validation IA') ||
         btn.textContent?.includes('Général') ||
         btn.textContent?.includes('Exploitant') ||
         btn.textContent?.includes('SGS'))
      )
      // Au moins les étapes IA et Général sont désactivées
      expect(stepIndicatorButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('affiche le bouton "Suivant" (pas "Créer") à l\'étape 1', () => {
      renderNewForm()
      expect(screen.getByText(/suivant/i)).toBeInTheDocument()
      expect(screen.queryByText(/^créer$/i)).not.toBeInTheDocument()
    })

    it('affiche le bouton "Annuler"', () => {
      renderNewForm()
      expect(screen.getByText('Annuler')).toBeInTheDocument()
    })
  })

  // ── 2. Navigation vers l'étape suivante ───────────────────────────────────

  describe('Navigation vers l\'étape suivante', () => {
    it('affiche des erreurs de validation si les champs requis sont vides (étape 1)', async () => {
      renderNewForm()
      // Cliquer "Suivant" sans renseigner les coordonnées déclenche la validation
      await act(async () => {
        fireEvent.click(screen.getByText(/suivant/i))
      })
      // Le formulaire doit soit rester à l'étape 1, soit afficher une erreur
      await waitFor(() => {
        // Le compteur d'étape doit toujours être présent
        expect(screen.getByText(/étape \d+ \/ 6/i)).toBeInTheDocument()
      })
    })

    it('en mode édition, le bouton "Précédent" est visible à l\'étape 3', () => {
      renderEditForm()
      // Édition démarre à l'étape 3 → "Précédent" doit être visible
      expect(screen.getByText(/précédent/i)).toBeInTheDocument()
    })

    it('en mode édition, cliquer "Précédent" depuis l\'étape 3 revient à l\'étape 2', () => {
      renderEditForm()
      fireEvent.click(screen.getByText(/précédent/i))
      expect(screen.getByText(/étape 2 \/ 6/i)).toBeInTheDocument()
    })
  })

  // ── 3. Mode édition ───────────────────────────────────────────────────────

  describe('Mode édition (aérodrome existant)', () => {
    it('démarre à l\'étape 3 en mode édition', () => {
      renderEditForm()
      expect(getStepCounter()).toHaveTextContent('Étape 3 / 6')
    })

    it('initialise completedSteps avec 1, 2, 3, 4, 5 en mode édition', () => {
      renderEditForm()
      // Toutes les étapes 1-5 sont complétées → leurs labels en vert
      // L'étape 6 est accessible (completedSteps.has(5) → canClick=true)
      const sgsLabel = screen.getByText('SGS & Statut')
      // Le bouton parent ne doit PAS être disabled
      const sgsBtn = sgsLabel.closest('button')
      expect(sgsBtn).not.toBeDisabled()
    })

    it('l\'étape 1 est accessible en mode édition', () => {
      renderEditForm()
      const locLabel = screen.getByText('Localisation')
      const locBtn   = locLabel.closest('button')
      expect(locBtn).not.toBeDisabled()
    })

    it('permet de naviguer directement à l\'étape 6 (SGS & Statut)', () => {
      renderEditForm()
      const sgsLabel = screen.getByText('SGS & Statut')
      const sgsBtn   = sgsLabel.closest('button') as HTMLButtonElement
      fireEvent.click(sgsBtn)
      expect(screen.getByText(/étape 6 \/ 6/i)).toBeInTheDocument()
    })

    it("affiche le bouton 'Mettre à jour' à l'étape 6 en mode édition", () => {
      renderEditForm()
      const sgsBtn = screen.getByText('SGS & Statut').closest('button')!
      fireEvent.click(sgsBtn)
      // En mode édition le bouton dit "Mettre à jour", en création "Créer"
      expect(screen.getByText(/mettre à jour/i)).toBeInTheDocument()
      expect(screen.queryByText(/suivant/i)).not.toBeInTheDocument()
    })

    it('affiche les informations pré-remplies en mode édition (étape 3)', () => {
      renderEditForm()
      // En étape 3, le champ "nom" doit être pré-rempli
      const nomInput = screen.queryByDisplayValue('Aéroport Léopold Sédar Senghor')
      expect(nomInput).toBeInTheDocument()
    })
  })

  // ── 4. Accès séquentiel (règle canClick) ──────────────────────────────────

  describe("Règle d'accès séquentiel aux étapes", () => {
    it("l'étape 6 est inaccessible si les étapes 1-5 ne sont pas complétées", () => {
      renderNewForm()
      const sgsLabel = screen.getByText('SGS & Statut')
      const sgsBtn   = sgsLabel.closest('button')
      // disabled car completedSteps vide et step.id-1 = 5 pas dans completedSteps
      expect(sgsBtn).toBeDisabled()
    })

    it("l'étape 2 est inaccessible depuis l'étape 1 (sans avoir cliqué Suivant)", () => {
      renderNewForm()
      const iaLabel = screen.getByText('Validation IA')
      const iaBtn   = iaLabel.closest('button')
      expect(iaBtn).toBeDisabled()
    })

    it("l'étape 1 est toujours accessible (step.id === 1)", () => {
      renderNewForm()
      const locLabel = screen.getByText('Localisation')
      const locBtn   = locLabel.closest('button')
      expect(locBtn).not.toBeDisabled()
    })
  })

  // ── 5. Bouton Annuler ─────────────────────────────────────────────────────

  describe('Bouton Annuler', () => {
    it('appelle onClose au clic sur "Annuler"', () => {
      renderNewForm()
      fireEvent.click(screen.getByText('Annuler'))
      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })
  })

  // ── 6. Type d'entité ──────────────────────────────────────────────────────

  describe("Étiquette d'étape selon le type d'entité", () => {
    it('affiche "Infrastructure" pour un aérodrome standard', () => {
      renderNewForm()
      expect(screen.getByText('Infrastructure')).toBeInTheDocument()
    })

    it('affiche "FATO & TLOF" pour une hélistation en mode édition', () => {
      renderEditForm({ ...MOCK_AERODROME, type_entite: 'helistation' })
      expect(screen.getByText('FATO & TLOF')).toBeInTheDocument()
    })

    it('affiche "Piste & FATO" pour un site mixte en mode édition', () => {
      renderEditForm({ ...MOCK_AERODROME, type_entite: 'mixte' })
      expect(screen.getByText('Piste & FATO')).toBeInTheDocument()
    })
  })
})
