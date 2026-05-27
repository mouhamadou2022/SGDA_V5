// components/modules/aerodromes/__tests__/AerodromesModule.test.tsx
// Tests fonctionnels — AerodromesModule
// Couvre : rendu KPIs, filtres, vue, modales, suppression, droits opérateur

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

// ─── Mocks de dépendances externes ───────────────────────────────────────────

jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (_loader: any, opts?: any) => {
    const Stub = () => <div data-testid="dynamic-stub" />
    Stub.displayName = 'DynamicStub'
    return Stub
  },
}))

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock('zustand/react/shallow', () => ({
  useShallow: (selector: any) => selector,
}))

// Store
jest.mock('@/lib/store', () => ({ useAppStore: jest.fn() }))
jest.mock('@/lib/performance/globalOptimizer', () => ({
  useOptimizedStore: jest.fn(),
  useGlobalDebounce: (fn: any) => fn,
  useGlobalTransition: () => [false, (fn: any) => fn()],
  LazyLoad: ({ children }: any) => <>{children}</>,
}))

// Sous-composants — rendus en stub
jest.mock('@/components/layout/ModuleHeader', () => ({
  ModuleHeader: ({ title, actions }: any) => (
    <div data-testid="module-header">
      <span data-testid="module-title">{title}</span>
      <div data-testid="module-actions">{actions}</div>
    </div>
  ),
}))
jest.mock('@/components/ui/FormShell', () => ({
  FormShell: ({ children, open }: any) =>
    open ? <div data-testid="form-shell">{children}</div> : null,
}))
jest.mock('@/components/forms/AerodromeForm', () => ({
  __esModule: true,
  default: () => <div data-testid="aerodrome-form" />,
}))
jest.mock('../AerodromeDetail', () => ({
  __esModule: true,
  default: () => <div data-testid="aerodrome-detail" />,
}))
jest.mock('../QrCodeGenerator', () => ({
  QrCodeGenerator: () => <div data-testid="qr-generator" />,
}))
jest.mock('@/lib/config', () => ({
  REGIONS: ['Dakar', 'Ziguinchor', 'Saint-Louis'],
}))

// ─── Imports après mocks ──────────────────────────────────────────────────────
import { useAppStore } from '@/lib/store'
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import AerodromesModule from '../AerodromesModule'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockDeleteAerodrome = jest.fn()

const MOCK_AERODROMES = [
  {
    id: 'a1', nom: 'Aéroport Léopold Sédar Senghor', code_oaci: 'GOOY',
    type: 'international', type_entite: 'aerodrome', region: 'Dakar',
    statut: 'actif', deleted_at: null, latitude: 14.73, longitude: -17.49, altitude: 24,
  },
  {
    id: 'a2', nom: 'Aéroport de Ziguinchor', code_oaci: 'GOGG',
    type: 'national', type_entite: 'aerodrome', region: 'Ziguinchor',
    statut: 'actif', deleted_at: null, latitude: 12.56, longitude: -16.28, altitude: 23,
  },
  {
    id: 'a3', nom: 'Hélistation Dakar Nord', code_oaci: 'GODN',
    type: 'national', type_entite: 'helistation', region: 'Dakar',
    statut: 'brouillon', deleted_at: null, latitude: 14.75, longitude: -17.45, altitude: 10,
  },
  {
    id: 'a4', nom: 'Aérodrome supprimé', code_oaci: 'GODEL',
    type: 'national', type_entite: 'aerodrome', region: 'Dakar',
    statut: 'ferme', deleted_at: '2024-01-01T00:00:00Z',
    latitude: 14.0, longitude: -17.0, altitude: 5,
  },
] as any[]

const MOCK_STATE = {
  user: { id: 'u1', role: 'inspector', aerodrome_id: undefined } as any,
  aerodromes: MOCK_AERODROMES,
  profilsRisque: {
    a1: { id: 'p1', aerodrome_id: 'a1', score_global: 82, niveau: 'faible', tendance: 'stable' },
    a2: { id: 'p2', aerodrome_id: 'a2', score_global: 35, niveau: 'eleve',  tendance: 'baisse' },
  },
  certifications: [],
  homologations: [],
  surveillances: [],
  ecarts: [],
  deleteAerodrome: mockDeleteAerodrome,
}

function setupMocks(overrides?: Partial<typeof MOCK_STATE>) {
  const state = { ...MOCK_STATE, ...overrides }
  ;(useAppStore as unknown as jest.Mock).mockImplementation((sel: any) =>
    typeof sel === 'function' ? sel(state) : state
  )
  ;(useOptimizedStore as unknown as jest.Mock).mockImplementation((sel: any) =>
    typeof sel === 'function' ? sel(state) : state
  )
}

function renderModule(userRole = 'inspector') {
  return render(<AerodromesModule userRole={userRole} />)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AerodromesModule', () => {

  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
  })

  // ── 1. Rendu et KPIs ──────────────────────────────────────────────────────

  describe('Rendu et statistiques', () => {
    it('affiche le titre du module', () => {
      renderModule()
      expect(screen.getByTestId('module-title')).toHaveTextContent('Aérodromes & Hélistations')
    })

    it('affiche le KPI "Total" avec le bon compte (excluant les supprimés)', () => {
      renderModule()
      // 4 aérodromes dont 1 deleted_at → 3 actifs
      const kpiCards = screen.getAllByText('Total')
      expect(kpiCards.length).toBeGreaterThan(0)
      // La valeur numérique juste à côté
      const kpiValue = kpiCards[0].closest('.kpi-card')?.querySelector('.kpi-value')
      expect(kpiValue?.textContent).toBe('3')
    })

    it('affiche le KPI "Aérodromes" (type_entite=aerodrome) correctement', () => {
      renderModule()
      const label = screen.getByText('Aérodromes')
      const value = label.closest('.kpi-card')?.querySelector('.kpi-value')
      expect(value?.textContent).toBe('2')
    })

    it('affiche le KPI "Hélistations / Mixtes"', () => {
      renderModule()
      const label = screen.getByText('Hélistations / Mixtes')
      const value = label.closest('.kpi-card')?.querySelector('.kpi-value')
      expect(value?.textContent).toBe('1')
    })

    it("n'affiche pas les aérodromes supprimés (deleted_at) dans la liste", () => {
      renderModule()
      expect(screen.queryByText('GODEL')).not.toBeInTheDocument()
    })
  })

  // ── 2. Filtrage par recherche ─────────────────────────────────────────────

  describe('Filtre par recherche texte', () => {
    it('affiche tous les aérodromes actifs au départ', () => {
      renderModule()
      expect(screen.getByText('GOOY')).toBeInTheDocument()
      expect(screen.getByText('GOGG')).toBeInTheDocument()
      expect(screen.getByText('GODN')).toBeInTheDocument()
    })

    it('filtre par code OACI', () => {
      renderModule()
      const searchInput = screen.getByPlaceholderText(/nom.*code.*oaci/i)
      fireEvent.change(searchInput, { target: { value: 'GOOY' } })
      expect(screen.getByText('GOOY')).toBeInTheDocument()
      expect(screen.queryByText('GOGG')).not.toBeInTheDocument()
    })

    it('filtre par nom (insensible à la casse)', () => {
      renderModule()
      const searchInput = screen.getByPlaceholderText(/nom.*code.*oaci/i)
      fireEvent.change(searchInput, { target: { value: 'ziguinchor' } })
      expect(screen.getByText('GOGG')).toBeInTheDocument()
      expect(screen.queryByText('GOOY')).not.toBeInTheDocument()
    })

    it('affiche le message vide si aucun résultat', () => {
      renderModule()
      const searchInput = screen.getByPlaceholderText(/nom.*code.*oaci/i)
      fireEvent.change(searchInput, { target: { value: 'xxxxxx_inexistant' } })
      expect(screen.getByText(/aucune infrastructure/i)).toBeInTheDocument()
    })
  })

  // ── 3. Filtres de la barre ────────────────────────────────────────────────

  describe('Filtres par type et statut', () => {
    it('filtre par type "national"', () => {
      renderModule()
      const selects = screen.getAllByRole('combobox')
      // Le select type est généralement le 2e ou 3e select
      const typeSelect = selects.find(s =>
        Array.from(s.querySelectorAll('option')).some(o => o.value === 'national')
      )
      expect(typeSelect).toBeTruthy()
      fireEvent.change(typeSelect!, { target: { value: 'national' } })
      // GOOY (international) doit disparaître
      expect(screen.queryByText('GOOY')).not.toBeInTheDocument()
      expect(screen.getByText('GOGG')).toBeInTheDocument()
    })

    it('filtre par type "international"', () => {
      renderModule()
      const selects = screen.getAllByRole('combobox')
      const typeSelect = selects.find(s =>
        Array.from(s.querySelectorAll('option')).some(o => o.value === 'international')
      )
      expect(typeSelect).toBeTruthy()
      fireEvent.change(typeSelect!, { target: { value: 'international' } })
      expect(screen.getByText('GOOY')).toBeInTheDocument()
      expect(screen.queryByText('GOGG')).not.toBeInTheDocument()
    })
  })

  // ── 4. Vue grille / liste ─────────────────────────────────────────────────

  describe('Basculement de vue', () => {
    it('affiche la vue liste par défaut (tableau visible)', () => {
      renderModule()
      // Table présente en vue liste
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    it('bascule vers la vue grille au clic sur le bouton Grille', () => {
      renderModule()
      const gridBtn = screen.getByTitle(/grille/i) ||
        screen.getAllByRole('button').find(b => b.textContent?.match(/grille/i))
      if (gridBtn) {
        fireEvent.click(gridBtn)
        // En vue grille, plus de table
        expect(screen.queryByRole('table')).not.toBeInTheDocument()
      }
    })
  })

  // ── 5. Ouverture du formulaire ────────────────────────────────────────────

  describe('Formulaire de création', () => {
    it('ouvre le formulaire au clic sur "Nouvelle infrastructure"', () => {
      renderModule('inspector')
      const newBtn = screen.getByText(/nouvelle infrastructure/i)
      fireEvent.click(newBtn)
      expect(screen.getByTestId('form-shell')).toBeInTheDocument()
    })

    it("n'affiche pas le bouton Nouvelle infrastructure pour un opérateur", () => {
      setupMocks({ user: { id: 'u2', role: 'dg_operator', aerodrome_id: 'a1' } })
      renderModule('dg_operator')
      expect(screen.queryByText(/nouvelle infrastructure/i)).not.toBeInTheDocument()
    })
  })

  // ── 6. Suppression ────────────────────────────────────────────────────────

  describe('Suppression d\'un aérodrome', () => {
    it('ouvre la boîte de confirmation au clic sur Supprimer', () => {
      renderModule()
      const deleteButtons = document.querySelectorAll('.action-button.danger')
      expect(deleteButtons.length).toBeGreaterThan(0)
      fireEvent.click(deleteButtons[0])
      // Le bouton de confirmation "Supprimer définitivement" doit apparaître
      expect(screen.getByText(/supprimer définitivement/i)).toBeInTheDocument()
    })

    it('appelle deleteAerodrome après confirmation', async () => {
      renderModule()
      const deleteButtons = document.querySelectorAll('.action-button.danger')
      fireEvent.click(deleteButtons[0])
      const confirmBtn = screen.getByText(/supprimer définitivement/i)
      await act(async () => { fireEvent.click(confirmBtn) })
      expect(mockDeleteAerodrome).toHaveBeenCalled()
    })
  })

  // ── 7. Droits opérateur ───────────────────────────────────────────────────

  describe('Restriction des droits opérateur', () => {
    beforeEach(() => {
      setupMocks({ user: { id: 'u2', role: 'dg_operator', aerodrome_id: 'a1' } })
    })

    it('affiche le titre "Mon Infrastructure" pour un opérateur', () => {
      renderModule('dg_operator')
      expect(screen.getByTestId('module-title')).toHaveTextContent('Mon Infrastructure')
    })

    it("ne montre que l'aérodrome de l'opérateur (aerodrome_id = a1)", () => {
      renderModule('dg_operator')
      expect(screen.getByText('GOOY')).toBeInTheDocument()
      expect(screen.queryByText('GOGG')).not.toBeInTheDocument()
    })

    it("n'affiche pas les boutons Modifier / Supprimer pour un opérateur", () => {
      renderModule('dg_operator')
      expect(document.querySelectorAll('.action-button.danger').length).toBe(0)
    })
  })

  // ── 8. Score de risque affiché dans la liste ──────────────────────────────

  describe('Affichage du profil de risque', () => {
    it("affiche le score du profil de risque pour les aérodromes qui en ont", () => {
      renderModule()
      // GOOY a un profil avec score 82
      expect(screen.getByText('82%')).toBeInTheDocument()
      // GOGG a score 35
      expect(screen.getByText('35%')).toBeInTheDocument()
    })

    it("affiche '-' pour les aérodromes sans profil de risque", () => {
      renderModule()
      // GODN (a3) n'a pas de profil → '-' affiché
      const noProfile = screen.getAllByText('-')
      expect(noProfile.length).toBeGreaterThan(0)
    })
  })
})
