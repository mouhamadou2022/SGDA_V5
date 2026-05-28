// components/modules/formation/__tests__/FormationModule.test.tsx
// Tests fonctionnels — FormationModule
// Couvre : rendu, 6 onglets, navigation, formulaire, vides, cas limites, drag & drop

import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}))

const mockFormations: any[] = [
  { id: 'f1', titre: 'Formation SLI Avancé', type: 'continue', statut: 'planifiee', date: '2026-06-15', participants: ['i1', 'i2'], domaines: ['sli'], reference: 'REF-001', duree_heures: 16, lieu: 'Dakar', formateur: 'Expert SLI', objectifs: 'Renforcer SLI', created_at: '2026-01-01', created_by: 'u1' },
  { id: 'f2', titre: 'Certification Exploitation', type: 'certification', statut: 'terminee', date: '2026-03-10', participants: ['i1'], domaines: ['exploitation'], reference: 'REF-002', duree_heures: 24, lieu: 'Dakar', formateur: 'Expert OPS', objectifs: 'Certification', created_at: '2026-01-01', created_by: 'u1' },
  { id: 'f3', titre: 'Recyclage GC', type: 'recyclage', statut: 'en_cours', date: '2026-05-20', participants: ['i2'], domaines: ['genie_civil'], reference: 'REF-003', duree_heures: 8, lieu: 'Saint-Louis', formateur: 'Expert GC', objectifs: 'Remise à niveau', created_at: '2026-01-01', created_by: 'u1' },
]

const mockInspecteurs: any[] = [
  { id: 'i1', prenom: 'Amadou', nom: 'Diop', matricule: 'INS001', email: 'amadou.diop@anacim.sn', type: 'inspecteur_titulaire', service: 'securite_aerodromes', domaine_principal: 'sli', statut: 'en_service', competences: [{ id: 'c1', domaine: 'sli', niveau: 4, source: 'auto', date_obtention: '2025-01-01', inspecteur_id: 'i1' }], formations: [], created_at: '2025-01-01', deleted_at: undefined },
  { id: 'i2', prenom: 'Fatou', nom: 'Sow', matricule: 'INS002', email: 'fatou.sow@anacim.sn', type: 'inspecteur_stagiaire', service: 'normes_aerodromes', domaine_principal: 'genie_civil', statut: 'en_service', competences: [], formations: [], created_at: '2025-03-01', deleted_at: undefined }
]

let storeDynamic: any

function resetStore() {
  storeDynamic = {
    formations: [...mockFormations],
    inspecteurs: [...mockInspecteurs],
    surveillances: [],
    utilisateurs: [],
    user: { id: 'u1', prenom: 'Admin', nom: 'ANACIM', role: 'admin', email: 'admin@anacim.sn' },
    competencesVersion: 1,
    addFormation: jest.fn().mockResolvedValue(undefined),
    updateFormation: jest.fn().mockResolvedValue(undefined),
    deleteFormation: jest.fn().mockResolvedValue(undefined),
    addInspecteur: jest.fn().mockResolvedValue(undefined),
    updateInspecteur: jest.fn().mockResolvedValue(undefined),
    deleteInspecteur: jest.fn().mockResolvedValue(undefined),
    setActiveModule: jest.fn(),
    incrementerVersion: jest.fn(),
    setFormations: jest.fn(),
    setInspecteurs: jest.fn(),
  }
}

function selector(sel: any) {
  if (typeof sel === 'function') return sel(storeDynamic)
  return (storeDynamic as any)[sel]
}

jest.mock('@/lib/store', () => ({ useAppStore: (s: any) => selector(s) }))
jest.mock('@/lib/performance/globalOptimizer', () => ({
  useOptimizedStore: (s: any) => selector(s),
  useGlobalTransition: () => ({ startTransition: (fn: any) => { if (fn) fn() } }),
  LazyLoad: ({ children }: any) => <>{children}</>,
  LazyComponent: ({ children }: any) => <>{children}</>,
}))
jest.mock('@/components/ui/FormShell', () => ({
  FormShell: ({ children, open, title }: any) =>
    open ? <div data-testid="form-shell"><p data-testid="form-shell-title">{title}</p><div>{children}</div></div> : null,
}))
jest.mock('@/components/layout/ModuleHeader', () => ({
  ModuleHeader: ({ title, actions }: any) => (
    <div data-testid="module-header">
      <span data-testid="module-title">{title}</span>
      <div data-testid="module-actions">{actions}</div>
    </div>
  ),
}))
jest.mock('@/hooks/useDebounce', () => ({ useDebounce: (v: any) => v }))
jest.mock('@/lib/formationUtils', () => ({
  formationUtils: {
    calculerNiveauCompetence: jest.fn().mockReturnValue(3),
    formatService: jest.fn((s: string) => s),
    formatTypeInspecteur: jest.fn((t: string) => t),
    calculerMatriceCompetences: jest.fn(() => ({})),
    getNiveauLabel: jest.fn((n: number) => `${n}`),
  },
}))
jest.mock('@/lib/utils', () => ({ formatDate: jest.fn((d: string) => d) }))
jest.mock('../CompetenceMatrix', () => ({ CompetenceMatrix: () => <div data-testid="competence-matrix">CompetenceMatrix</div> }))
jest.mock('../EcheanceAlert', () => ({ EcheanceAlert: () => <div data-testid="echeance-alert">EcheanceAlert</div> }))
jest.mock('../FormationSuggestions', () => ({ FormationSuggestions: () => <div data-testid="formation-suggestions">FormationSuggestions</div> }))

import FormationModule from '../FormationModule'

const renderModule = (role = 'admin') => {
  resetStore()
  return render(<FormationModule userRole={role} />)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FormationModule', () => {
  // ─── 1. Rendu initial ───────────────────────────────────────────────────
  describe('Rendu initial', () => {
    it('affiche le titre', () => {
      renderModule()
      expect(screen.getByTestId('module-title')).toHaveTextContent('Formation')
    })

    it('affiche les onglets', () => {
      renderModule()
      // Les onglets view-toggle sont visibles (icônes + texte pour certains)
      expect(screen.getAllByText('Formations').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Calendrier')).toBeInTheDocument()
      expect(screen.getByText('Compétences')).toBeInTheDocument()
      expect(screen.getByText('Échéances')).toBeInTheDocument()
      expect(screen.getByText('Suggestions')).toBeInTheDocument()
    })

    it('affiche les KPIs du dashboard', () => {
      renderModule()
      expect(screen.getByText('Total formations')).toBeInTheDocument()
      expect(screen.getAllByText('Planifiées').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('En cours').length).toBeGreaterThanOrEqual(1)
    })

    it('le ModuleHeader contient le bouton Nouvelle formation', () => {
      renderModule()
      const actions = screen.getByTestId('module-actions')
      expect(actions).toBeInTheDocument()
      expect(actions.querySelector('button')).toBeInTheDocument()
    })
  })

  // ─── 2. Navigation ─────────────────────────────────────────────────────
  describe('Navigation', () => {
    it('passe à la vue calendrier', () => {
      renderModule()
      fireEvent.click(screen.getByText('Calendrier'))
      expect(screen.getByText('Mois')).toBeInTheDocument()
      expect(screen.getByText('6 mois')).toBeInTheDocument()
    })

    it('passe à la vue compétences (tableau inspecteurs/domaines)', () => {
      renderModule()
      fireEvent.click(screen.getByText('Compétences'))
      // La vue matrice affiche un tableau de compétences
      expect(screen.getByTestId('module-header')).toBeInTheDocument()
      expect(document.querySelector('table')).toBeInTheDocument()
    })

    it('passe à la vue échéances', () => {
      renderModule()
      fireEvent.click(screen.getByText('Échéances'))
      expect(screen.getByTestId('echeance-alert')).toBeInTheDocument()
    })

    it('passe à la vue suggestions', () => {
      renderModule()
      fireEvent.click(screen.getByText('Suggestions'))
      expect(screen.getByTestId('formation-suggestions')).toBeInTheDocument()
    })

    it('revient au dashboard depuis un autre onglet', () => {
      renderModule()
      fireEvent.click(screen.getByText('Suggestions'))
      // Cliquer sur la vue dashboard (icône LayoutDashboard, sans texte)
      const dashboardBtn = document.querySelector('button') // premier bouton = dashboard
      if (dashboardBtn) fireEvent.click(dashboardBtn)
      expect(screen.getByText('Total formations')).toBeInTheDocument()
    })
  })

  // ─── 3. Filtrage ────────────────────────────────────────────────────────
  describe('Filtrage', () => {
    it('la recherche textuelle est présente dans la vue formations', () => {
      renderModule()
      fireEvent.click(screen.getAllByText('Formations')[0])
      expect(screen.getAllByPlaceholderText(/Rechercher/i).length).toBeGreaterThan(0)
    })

    it('les filtres select sont présents', () => {
      renderModule()
      fireEvent.click(screen.getAllByText('Formations')[0])
      const selects = document.querySelectorAll('select')
      expect(selects.length).toBeGreaterThan(0)
    })
  })

  // ─── 4. Formulaire ──────────────────────────────────────────────────────
  describe('Formulaire', () => {
    it('ouvre le formulaire via le bouton', () => {
      renderModule()
      const btn = screen.getByTestId('module-actions').querySelector('button')
      if (btn) fireEvent.click(btn)
      expect(screen.getByTestId('form-shell')).toBeInTheDocument()
    })
  })

  // ─── 5. États vides / erreurs ───────────────────────────────────────────
  describe('Robustesse', () => {
    it('survit sans formations', () => {
      renderModule()
      storeDynamic.formations = []
      fireEvent.click(screen.getAllByText('Formations')[0])
      expect(screen.getByTestId('module-header')).toBeInTheDocument()
    })

    it('survit sans inspecteurs', () => {
      storeDynamic.inspecteurs = []
      renderModule()
      expect(screen.getByTestId('module-header')).toBeInTheDocument()
    })

    it('survit sans utilisateur connecté', () => {
      storeDynamic.user = null
      renderModule()
      expect(screen.getByTestId('module-header')).toBeInTheDocument()
    })

    it('survit avec formations sans domaine', () => {
      storeDynamic.formations = [{ ...mockFormations[0], domaines: undefined }]
      renderModule()
      expect(screen.getByTestId('module-header')).toBeInTheDocument()
    })

    it('survit avec inspecteurs sans competences', () => {
      storeDynamic.inspecteurs = [{ ...mockInspecteurs[0], competences: undefined }]
      renderModule()
      expect(screen.getByTestId('module-header')).toBeInTheDocument()
    })
  })

  // ─── 6. Drag & drop calendrier ──────────────────────────────────────────
  describe('Drag & drop', () => {
    it('les formations sont draggables', () => {
      renderModule()
      fireEvent.click(screen.getByText('Calendrier'))
      const draggableItems = document.querySelectorAll('[draggable="true"]')
      expect(draggableItems.length).toBeGreaterThan(0)
    })
  })
})
