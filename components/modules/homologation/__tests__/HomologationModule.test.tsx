// components/modules/homologation/__tests__/HomologationModule.test.tsx
// Tests fonctionnels — HomologationModule
// Couvre : rendu, onglets, filtrage, recherche, accordéon, phases, archives

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}))

jest.mock('@/lib/store', () => ({ useAppStore: jest.fn() }))

jest.mock('@/lib/ia/agents/certificationAgent', () => ({
  certificationAgent: {
    analyzeProcess: jest.fn().mockResolvedValue({
      suggestions: { actionsPrioritaires: [] },
    }),
  },
  CertificationAnalysisResult: {},
}))

jest.mock('@/lib/homologationUtils', () => ({
  getPhaseStats: jest.fn().mockReturnValue({ blocked: 0, inactive: 0 }),
}))

jest.mock('@/components/layout/ModuleHeader', () => ({
  ModuleHeader: ({ title, actions }: any) => (
    <div data-testid="module-header">
      <span data-testid="module-title">{title}</span>
      <div data-testid="module-actions">{actions}</div>
    </div>
  ),
}))

jest.mock('@/components/ui/FormShell', () => ({
  FormShell: ({ children, open, title, footer, tabs, activeTab, onTabChange }: any) =>
    open ? (
      <div data-testid="form-shell">
        <div data-testid="form-shell-title">{title}</div>
        {tabs?.map((t: any) => (
          <button key={t.id} onClick={() => onTabChange?.(t.id)}>{t.label}</button>
        ))}
        <div>{children}</div>
        <div data-testid="form-shell-footer">{footer}</div>
      </div>
    ) : null,
}))

jest.mock('../../certification/CertificationDocumentUpload', () => ({
  CertificationDocumentUpload: () => <div data-testid="cert-doc-upload" />,
}))

jest.mock('../../signatures/SignatureSection', () => ({
  SignatureSection: () => <div data-testid="signature-section" />,
}))

jest.mock('@/components/ui/LettreTransmissionUpload', () => ({
  LettreTransmissionUpload: () => <div data-testid="lettre-upload" />,
}))

jest.mock('../../exemptions/ExemptionManager', () => ({
  ExemptionManager: ({ open }: any) =>
    open ? <div data-testid="exemption-manager" /> : null,
}))

jest.mock('../../archive/ArchiveAccordion', () => ({
  ArchiveAccordion: ({ items }: any) => (
    <div data-testid="archive-accordion">
      {items.map((item: any) => (
        <div key={item.id} data-testid="archive-item">{item.reference}</div>
      ))}
    </div>
  ),
}))

// ─── Imports après mocks ──────────────────────────────────────────────────────
import { useAppStore } from '@/lib/store'
import HomologationModule from '../HomologationModule'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUpdateHomologation = jest.fn()
const mockSetActiveModule = jest.fn()

const MOCK_AERODROMES = [
  {
    id: 'a1', nom: 'Aéroport de Kaolack', code_oaci: 'GOOK',
    type: 'national', type_entite: 'aerodrome',
    region: 'Kaolack', statut: 'actif', deleted_at: null,
  },
  {
    id: 'a2', nom: 'Aéroport de Tambacounda', code_oaci: 'GOTT',
    type: 'national', type_entite: 'aerodrome',
    region: 'Tambacounda', statut: 'actif', deleted_at: null,
  },
  {
    id: 'a3', nom: 'Aéroport Léopold Sédar Senghor', code_oaci: 'GOOY',
    type: 'international', type_entite: 'aerodrome',
    region: 'Dakar', statut: 'actif', deleted_at: null,
  },
] as any[]

const MOCK_HOMOLOGATIONS = [
  {
    id: 'h1', aerodrome_id: 'a1', reference: 'HOMO-2024-001',
    phase_active: 2, statut_global: 'en_cours',
    phases_data: {
      phase1: {
        date_reception: '2024-01-10',
        responsable_id: 'insp1', documents: {}, completude: 80,
        cloture_le: '2024-02-15',
      },
    },
    created_at: '2024-01-10', updated_at: '2024-02-15',
  },
  {
    id: 'h2', aerodrome_id: 'a2', reference: 'HOMO-2023-001',
    phase_active: 3, statut_global: 'homologue',
    phases_data: {},
    created_at: '2023-01-01', updated_at: '2024-01-01',
  },
] as any[]

const MOCK_STATE = {
  aerodromes: MOCK_AERODROMES,
  homologations: MOCK_HOMOLOGATIONS,
  user: { id: 'u1', role: 'inspector' },
  updateHomologation: mockUpdateHomologation,
  addNotification: jest.fn(),
  setActiveModule: mockSetActiveModule,
  utilisateurs: [],
}

function setupMocks(overrides?: Partial<typeof MOCK_STATE>) {
  const state = { ...MOCK_STATE, ...overrides }
  ;(useAppStore as unknown as jest.Mock).mockImplementation((sel: any) =>
    typeof sel === 'function' ? sel(state) : state
  )
}

function renderModule() {
  return render(<HomologationModule userRole="inspector" />)
}

// Helper : passe à l'onglet "Liste des homologations"
async function goToListTab() {
  fireEvent.click(screen.getByText(/liste des homologations/i))
}

// Helper : ouvre l'accordéon d'un aérodrome via son code OACI
function openAccordion(codeOaci: string) {
  const badge = screen.getByText(codeOaci)
  const trigger = badge.closest('button')!
  fireEvent.click(trigger)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HomologationModule', () => {

  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
  })

  // ── 1. Rendu initial ──────────────────────────────────────────────────────

  describe('Rendu initial', () => {
    it('affiche le titre "Homologation"', () => {
      renderModule()
      expect(screen.getByTestId('module-title')).toHaveTextContent('Homologation')
    })

    it('affiche les KPIs et la liste des homologations', () => {
      renderModule()
      expect(screen.getByText(/liste des homologations/i)).toBeInTheDocument()
      expect(screen.getByText(/filtres/i)).toBeInTheDocument()
    })

    it("n'affiche pas les aérodromes directement au démarrage", () => {
      renderModule()
      expect(screen.queryByText('GOOK')).not.toBeInTheDocument()
    })
  })

  // ── 2. Navigation ─────────────────────────────────────────────────────────

  describe('Navigation', () => {
    it('affiche le bouton Archives qui redirige vers Registres', () => {
      renderModule()
      fireEvent.click(screen.getByText(/archives/i))
      expect(mockSetActiveModule).toHaveBeenCalledWith('registres')
    })
  })

  // ── 3. Affichage des aérodromes nationaux uniquement ─────────────────────

  describe('Affichage des aérodromes nationaux uniquement', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
    })

    it('affiche les aérodromes nationaux (GOOK, GOTT)', () => {
      expect(screen.getByText('GOOK')).toBeInTheDocument()
      expect(screen.getByText('GOTT')).toBeInTheDocument()
    })

    it("n'affiche pas les aérodromes internationaux (GOOY)", () => {
      expect(screen.queryByText('GOOY')).not.toBeInTheDocument()
    })

    it('affiche le nom de chaque aérodrome national', () => {
      expect(screen.getByText('Aéroport de Kaolack')).toBeInTheDocument()
      expect(screen.getByText('Aéroport de Tambacounda')).toBeInTheDocument()
    })
  })

  // ── 4. Filtrage par statut ────────────────────────────────────────────────

  describe('Filtrage par statut', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
    })

    it('affiche tous les aérodromes nationaux par défaut (filtre=all)', () => {
      expect(screen.getByText('GOOK')).toBeInTheDocument()
      expect(screen.getByText('GOTT')).toBeInTheDocument()
    })

    it('filtre par "en_cours" → affiche GOOK seulement', () => {
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'en_cours' } })
      expect(screen.getByText('GOOK')).toBeInTheDocument()
      expect(screen.queryByText('GOTT')).not.toBeInTheDocument()
    })

    it('filtre par "homologue" → affiche GOTT seulement', () => {
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'homologue' } })
      expect(screen.getByText('GOTT')).toBeInTheDocument()
      expect(screen.queryByText('GOOK')).not.toBeInTheDocument()
    })
  })

  // ── 5. Recherche textuelle ────────────────────────────────────────────────

  describe('Recherche textuelle', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
    })

    it('filtre par code OACI', () => {
      const input = screen.getByPlaceholderText(/rechercher un aérodrome/i)
      fireEvent.change(input, { target: { value: 'GOOK' } })
      expect(screen.getByText('GOOK')).toBeInTheDocument()
      expect(screen.queryByText('GOTT')).not.toBeInTheDocument()
    })

    it('filtre par nom (insensible à la casse)', () => {
      const input = screen.getByPlaceholderText(/rechercher un aérodrome/i)
      fireEvent.change(input, { target: { value: 'tambacounda' } })
      expect(screen.getByText('GOTT')).toBeInTheDocument()
      expect(screen.queryByText('GOOK')).not.toBeInTheDocument()
    })

    it('affiche le message vide si aucun résultat', () => {
      const input = screen.getByPlaceholderText(/rechercher un aérodrome/i)
      fireEvent.change(input, { target: { value: 'xxxxxx_inexistant' } })
      expect(screen.getByText(/aucun aérodrome national trouvé/i)).toBeInTheDocument()
    })
  })

  // ── 6. Accordéon et phases ────────────────────────────────────────────────

  describe('Accordéon et affichage des phases', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
    })

    it('les phases ne sont pas visibles avant l\'ouverture de l\'accordéon', () => {
      expect(screen.queryByText(/demande formelle/i)).not.toBeInTheDocument()
    })

    it('ouvre l\'accordéon GOOK et affiche les 3 phases', () => {
      openAccordion('GOOK')
      expect(screen.getByText(/demande formelle/i)).toBeInTheDocument()
      expect(screen.getByText(/vérification sur site/i)).toBeInTheDocument()
      expect(screen.getByText(/délivrance décision/i)).toBeInTheDocument()
    })

    it('affiche "Complété" pour la phase 1 (GOOK, phase_active=2)', () => {
      openAccordion('GOOK')
      const completedBadges = screen.getAllByText('Complété')
      expect(completedBadges.length).toBe(1)
    })

    it('affiche "En cours" pour la phase active (phase 2, GOOK)', () => {
      openAccordion('GOOK')
      const enCoursBadges = screen.getAllByText('En cours')
      expect(enCoursBadges.length).toBeGreaterThan(0)
    })

    it('affiche "Verrouillé" pour la phase future (phase 3, GOOK)', () => {
      openAccordion('GOOK')
      const lockedBadges = screen.getAllByText('Verrouillé')
      expect(lockedBadges.length).toBe(1)
    })

    it('ferme l\'accordéon au second clic', () => {
      openAccordion('GOOK')
      expect(screen.getByText(/demande formelle/i)).toBeInTheDocument()
      openAccordion('GOOK')
      expect(screen.queryByText(/demande formelle/i)).not.toBeInTheDocument()
    })

    it('affiche le badge de progression "Phase 2/3" pour GOOK', () => {
      expect(screen.getByText('Phase 2/3')).toBeInTheDocument()
    })

    it('affiche le badge statut "Homologué" pour GOTT', () => {
      // "Homologué" apparaît aussi comme option du select → vérifier via badge
      const matches = screen.getAllByText('Homologué')
      expect(matches.some(el => el.classList.contains('badge'))).toBe(true)
    })
  })

  // ── 7. Modal de phase ─────────────────────────────────────────────────────

  describe('Modal de phase (édition)', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
      openAccordion('GOOK')
    })

    it('ouvre le modal au clic sur Modifier (phase active)', async () => {
      const editButtons = screen.getAllByTitle('Modifier')
      await act(async () => {
        fireEvent.click(editButtons[0])
      })
      await waitFor(() => {
        expect(screen.getByTestId('form-shell')).toBeInTheDocument()
      })
    })

    it('le titre du modal contient le numéro de phase', async () => {
      const editButtons = screen.getAllByTitle('Modifier')
      await act(async () => {
        fireEvent.click(editButtons[0])
      })
      await waitFor(() => {
        expect(screen.getByTestId('form-shell-title')).toHaveTextContent(/phase/i)
      })
    })

    it('le modal se ferme au clic sur Annuler', async () => {
      const editButtons = screen.getAllByTitle('Modifier')
      await act(async () => {
        fireEvent.click(editButtons[0])
      })
      await waitFor(() => screen.getByTestId('form-shell'))
      fireEvent.click(screen.getByText('Annuler'))
      await waitFor(() => {
        expect(screen.queryByTestId('form-shell')).not.toBeInTheDocument()
      })
    })
  })

  // ── 8. Archives ───────────────────────────────────────────────────────────

  describe('Onglet Archives', () => {
    it("affiche le libellé 'Archives → Registres' dans l'onglet", () => {
      renderModule()
      expect(screen.getByText(/archives.*registres/i)).toBeInTheDocument()
    })

    it('redirige vers le module Registres au clic', () => {
      renderModule()
      fireEvent.click(screen.getByText(/archives/i))
      expect(mockSetActiveModule).toHaveBeenCalledWith('registres')
    })
  })

  // ── 9. État vide ──────────────────────────────────────────────────────────

  describe('État vide', () => {
    it('affiche le message vide quand aucun aérodrome national', async () => {
      setupMocks({
        aerodromes: MOCK_AERODROMES.filter(a => a.type === 'international'),
      })
      renderModule()
      await goToListTab()
      expect(screen.getByText(/aucun aérodrome national trouvé/i)).toBeInTheDocument()
    })
  })
})
