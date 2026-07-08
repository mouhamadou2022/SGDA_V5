// components/modules/certification/__tests__/CertificationModule.test.tsx
// Tests fonctionnels — CertificationModule
// Couvre : rendu, onglets, filtrage, accordéon, phases, actions

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}))

jest.mock('@/lib/store', () => ({ useAppStore: jest.fn() }))

jest.mock('@/lib/performance/globalOptimizer', () => ({
  useOptimizedStore: jest.fn(),
  useGlobalTransition: () => ({ startTransition: (fn: any) => fn() }),
  LazyLoad: ({ children }: any) => <>{children}</>,
}))

jest.mock('@/lib/ia/agents/certificationAgent', () => ({
  certificationAgent: {
    analyzeProcess: jest.fn().mockResolvedValue({
      suggestions: { actionsPrioritaires: [] },
    }),
  },
}))

jest.mock('@/lib/certificationUtils', () => ({
  checkExpiringCertifications: jest.fn().mockReturnValue({ expiringSoon: [], expired: [] }),
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

jest.mock('../CertExpiryAlert', () => ({
  CertExpiryAlert: () => <div data-testid="cert-expiry-alert" />,
}))

jest.mock('../CertificationDocumentUpload', () => ({
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
import { useOptimizedStore } from '@/lib/performance/globalOptimizer'
import CertificationModule from '../CertificationModule'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUpdateCertification = jest.fn()
const mockSetActiveModule = jest.fn()

const MOCK_AERODROMES = [
  {
    id: 'a1', nom: 'Aéroport Léopold Sédar Senghor', code_oaci: 'GOOY',
    type: 'international', type_entite: 'aerodrome',
    region: 'Dakar', statut: 'actif', deleted_at: null,
  },
  {
    id: 'a2', nom: 'Aéroport de Ziguinchor', code_oaci: 'GOGG',
    type: 'national', type_entite: 'aerodrome',
    region: 'Ziguinchor', statut: 'actif', deleted_at: null,
  },
  {
    id: 'a3', nom: 'Aéroport Blaise Diagne', code_oaci: 'GOBD',
    type: 'international', type_entite: 'aerodrome',
    region: 'Dakar', statut: 'actif', deleted_at: null,
    statut_certification: 'certifie',
  },
] as any[]

const MOCK_CERTIFICATIONS = [
  {
    id: 'c1', aerodrome_id: 'a1', reference: 'CERT-2024-001',
    phase_active: 3, statut_global: 'en_cours',
    phases_data: {
      phase1: {
        date_reception: '2024-01-15', cloture_le: '2024-02-01',
        nature_demande: 'Nouvel aérodrome', description: 'Test',
        coordonnees: { nom: '', poste: '', email: '', telephone: '' },
      },
      phase2: {
        date_reception: '2024-02-01', numero_dossier: 'DOS-001',
        responsable_id: 'insp1', documents: {}, completude: 60,
        avis: 'favorable', cloture_le: '2024-03-01',
      },
    },
    created_at: '2024-01-15', updated_at: '2024-03-01',
  },
  {
    id: 'c2', aerodrome_id: 'a3', reference: 'CERT-2023-001',
    phase_active: 5, statut_global: 'certifie',
    date_expiration: '2028-01-01', phases_data: {},
    created_at: '2023-01-01', updated_at: '2024-01-01',
  },
] as any[]

const MOCK_STATE = {
  aerodromes: MOCK_AERODROMES,
  certifications: MOCK_CERTIFICATIONS,
  user: { id: 'u1', role: 'inspector' },
  updateCertification: mockUpdateCertification,
  addNotification: jest.fn(),
  setActiveModule: mockSetActiveModule,
  utilisateurs: [],
}

function setupMocks(overrides?: Partial<typeof MOCK_STATE>) {
  const state = { ...MOCK_STATE, ...overrides }
  ;(useOptimizedStore as unknown as jest.Mock).mockImplementation((sel: any) =>
    typeof sel === 'function' ? sel(state) : state
  )
  ;(useAppStore as unknown as jest.Mock).mockImplementation((sel: any) =>
    typeof sel === 'function' ? sel(state) : state
  )
}

function renderModule() {
  return render(<CertificationModule userRole="inspector" />)
}

// Helper : passe en onglet "Liste des certifications"
async function goToListTab() {
  fireEvent.click(screen.getByText(/liste des certifications/i))
}

// Helper : ouvre l'accordéon d'un aérodrome donné
function openAccordion(codeOaci: string) {
  const badge = screen.getByText(codeOaci)
  const trigger = badge.closest('button')!
  fireEvent.click(trigger)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CertificationModule', () => {

  beforeEach(() => {
    jest.clearAllMocks()
    setupMocks()
  })

  // ── 1. Rendu initial ──────────────────────────────────────────────────────

  describe('Rendu initial', () => {
    it('affiche le titre "Certification"', () => {
      renderModule()
      expect(screen.getByTestId('module-title')).toHaveTextContent('Certification')
    })

    it('affiche les KPIs et la liste des certifications', () => {
      renderModule()
      expect(screen.getByText(/liste des certifications/i)).toBeInTheDocument()
      expect(screen.getByText(/filtres/i)).toBeInTheDocument()
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

  // ── 3. Filtrage par type d'aérodrome ─────────────────────────────────────

  describe('Affichage des aérodromes internationaux uniquement', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
    })

    it('affiche les aérodromes internationaux (GOOY, GOBD)', () => {
      expect(screen.getByText('GOOY')).toBeInTheDocument()
      expect(screen.getByText('GOBD')).toBeInTheDocument()
    })

    it("n'affiche pas les aérodromes nationaux (GOGG)", () => {
      expect(screen.queryByText('GOGG')).not.toBeInTheDocument()
    })

    it('affiche le nom de chaque aérodrome international', () => {
      expect(screen.getByText('Aéroport Léopold Sédar Senghor')).toBeInTheDocument()
      expect(screen.getByText('Aéroport Blaise Diagne')).toBeInTheDocument()
    })
  })

  // ── 4. Filtrage par statut ────────────────────────────────────────────────

  describe('Filtrage par statut', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
    })

    it('affiche tous les aérodromes internationaux par défaut (filtre=all)', () => {
      expect(screen.getByText('GOOY')).toBeInTheDocument()
      expect(screen.getByText('GOBD')).toBeInTheDocument()
    })

    it('filtre par statut "en_cours" → affiche GOOY seulement', () => {
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'en_cours' } })
      expect(screen.getByText('GOOY')).toBeInTheDocument()
      expect(screen.queryByText('GOBD')).not.toBeInTheDocument()
    })

    it('filtre par statut "certifie" → affiche GOBD seulement', () => {
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'certifie' } })
      expect(screen.getByText('GOBD')).toBeInTheDocument()
      expect(screen.queryByText('GOOY')).not.toBeInTheDocument()
    })

    it('filtre "expire" → aucun résultat → message vide', () => {
      const select = screen.getByRole('combobox')
      fireEvent.change(select, { target: { value: 'expire' } })
      expect(screen.getByText(/aucun aérodrome international trouvé/i)).toBeInTheDocument()
    })
  })

  // ── 5. Accordéon et phases ────────────────────────────────────────────────

  describe('Accordéon et affichage des phases', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
    })

    it('les phases ne sont pas visibles avant l\'ouverture de l\'accordéon', () => {
      expect(screen.queryByText(/expression d'intérêt/i)).not.toBeInTheDocument()
    })

    it('ouvre l\'accordéon GOOY et affiche les 5 phases', () => {
      openAccordion('GOOY')
      expect(screen.getByText(/expression d'intérêt/i)).toBeInTheDocument()
      // "Demande Formelle" et "Vérification" peuvent apparaître plusieurs fois (h4 + p description)
      expect(screen.getAllByText(/demande formelle/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/vérification sur site/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/délivrance du certificat/i).length).toBeGreaterThan(0)
      expect(screen.getByText(/publication statut/i)).toBeInTheDocument()
    })

    it('affiche le badge "En cours" pour la phase active (phase 3)', () => {
      openAccordion('GOOY')
      const enCoursBadges = screen.getAllByText('En cours')
      expect(enCoursBadges.length).toBeGreaterThan(0)
    })

    it('affiche les badges "Complété" pour les phases terminées (1 et 2)', () => {
      openAccordion('GOOY')
      const completedBadges = screen.getAllByText('Complété')
      // phases 1 et 2 sont complétées (phase_active = 3)
      expect(completedBadges.length).toBe(2)
    })

    it('affiche "Verrouillé" pour les phases futures (4 et 5)', () => {
      openAccordion('GOOY')
      const lockedBadges = screen.getAllByText('Verrouillé')
      // phases 4 et 5 sont verrouillées
      expect(lockedBadges.length).toBe(2)
    })

    it('ferme l\'accordéon au second clic', () => {
      openAccordion('GOOY')
      expect(screen.getByText(/expression d'intérêt/i)).toBeInTheDocument()
      openAccordion('GOOY')
      expect(screen.queryByText(/expression d'intérêt/i)).not.toBeInTheDocument()
    })

    it('affiche le badge "Phase 3/5" dans l\'accordéon GOOY', () => {
      expect(screen.getByText('Phase 3/5')).toBeInTheDocument()
    })

    it("affiche le badge statut 'En cours' dans l'accordéon de GOOY", () => {
      // "En cours" apparaît aussi comme option du select → utiliser getAllByText
      const matches = screen.getAllByText('En cours')
      expect(matches.some(el => el.classList.contains('badge'))).toBe(true)
    })

    it("affiche le badge statut 'Certifié' dans l'accordéon de GOBD", () => {
      const matches = screen.getAllByText('Certifié')
      expect(matches.some(el => el.classList.contains('badge'))).toBe(true)
    })
  })

  // ── 6. Modal de phase ─────────────────────────────────────────────────────

  describe('Modal de phase (édition / vue)', () => {
    beforeEach(async () => {
      renderModule()
      await goToListTab()
      openAccordion('GOOY')
    })

    it('ouvre le modal au clic sur Modifier la phase active (phase 3)', async () => {
      // Phase 3 est active (not locked, not completed) → boutons action visibles
      const editButtons = screen.getAllByTitle('Modifier')
      // Le premier bouton Modifier non verrouillé concerne la phase 3
      await act(async () => {
        fireEvent.click(editButtons[0])
      })
      await waitFor(() => {
        expect(screen.getByTestId('form-shell')).toBeInTheDocument()
      })
    })

    it('le titre du modal contient "Phase" et le numéro', async () => {
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

  // ── 7. Archives ───────────────────────────────────────────────────────────

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

  // ── 8. État vide ──────────────────────────────────────────────────────────

  describe('État vide', () => {
    it('affiche le message vide quand aucun aérodrome international', async () => {
      setupMocks({ aerodromes: MOCK_AERODROMES.filter(a => a.type === 'national') })
      renderModule()
      await goToListTab()
      expect(screen.getByText(/aucun aérodrome international trouvé/i)).toBeInTheDocument()
    })
  })
})
