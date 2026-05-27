# Structure de Fichiers CDC V8 - Référence Conforme
**SGDA V8 - Architecture Structurelle Exacte**
**Date: April 24, 2026**

---

## 🎯 Principes Fondamentaux CDC

### 1. Point d'Entrée UNIQUE
```
app/page.tsx → UNIQUE entry point (jamais fragmenter)
   ↓
Hiérarchie stricte: AuthGate → WelcomeToast → AppShell → Module Actif
   ↓
Chaque étape responsable d'une seule fonction
```

### 2. Pas de Fragmentation
```
❌ MAUVAIS:
- app/auth/page.tsx (fragmentation)
- app/dashboard/page.tsx (fragmentation)
- Chaque page = entry point séparé

✅ BON:
- app/page.tsx (UNIQUE)
  - Gère tout le routing via Zustand
  - AppShell centralise navigation
  - Modules chargés conditionnellement
```

### 3. Structure Organisationnelle Stricte
```
✅ CONFORME:
components/
├── cards/          ← Cartes réutilisables
├── forms/          ← Formulaires réutilisables
├── ui/             ← Composants UI de base
├── layouts/        ← Layouts par rôle
├── portals/        ← Portails complets par rôle
├── modules/        ← 21 modules métier
└── shells/         ← AppShell + gates

lib/
├── auth.ts         ← Authentification
├── rbac.ts         ← Permissions
├── sync-manager.ts ← Synchronisation
├── offline.ts      ← IndexedDB
└── ...

app/
├── page.tsx        ← UNIQUE entry point
├── layout.tsx      ← Root layout
└── globals.css
```

---

## 📋 Structure Détaillée Requise

### app/page.tsx - Point d'Entrée UNIQUE
```typescript
'use client'

import { AuthGate } from '@/components/shells/AuthGate'
import { WelcomeToast } from '@/components/shells/WelcomeToast'
import { AppShell } from '@/components/shells/AppShell'
import { useAppStore } from '@/lib/store'

// Structure hiérarchique stricte: AuthGate → WelcomeToast → AppShell
export default function Page() {
  const { user } = useAppStore()

  return (
    <AuthGate>
      <WelcomeToast>
        <AppShell>{/* Module actif rendu par AppShell */}</AppShell>
      </WelcomeToast>
    </AuthGate>
  )
}

// Notes:
// - Jamais importer de modules directement ici
// - AppShell gère le routing via activeModule store
// - Chaque composant a UN rôle unique
```

### Hiérarchie des Couches

```
Page (app/page.tsx)
  ↓
AuthGate (shells/AuthGate.tsx)
  ├─ Vérifie: user existe?
  ├─ Si non: Login UI
  ├─ Si oui: passe au suivant
  └─ Pas de logique métier

WelcomeToast (shells/WelcomeToast.tsx)
  ├─ Affiche notification bienvenue
  ├─ Affiche sync status
  ├─ Pas de navigation
  └─ Passe au suivant

AppShell (shells/AppShell.tsx)
  ├─ Lit activeModule du store
  ├─ Affiche layout (sidebar, header, footer)
  ├─ Affiche portal par rôle
  ├─ Gère navigation modules
  └─ Aucune logique métier

Portal (portals/<Role>Portal.tsx)
  ├─ Affiche interface spécifique au rôle
  ├─ Lis activeModule du store
  ├─ Affiche module actif avec RbacGuard
  └─ Modules rendus par Portal

Module (modules/<Module>Module.tsx)
  ├─ Affiche contenu métier
  ├─ Respecte RBAC du rôle
  └─ Aucune navigation
```

---

## 📁 Structure Complète Conforme

### 1. Root Layout (app/layout.tsx)
```typescript
import type { Metadata } from 'next'
import '@/app/globals.css'
import { Providers } from '@/components/shells/Providers'

export const metadata: Metadata = {
  title: 'SGDA V8 - Système de Gestion des Aérodromes',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

// Notes:
// - Minimal: juste Providers et children
// - Pas de navigation ici
// - Pas de logique authentification
```

### 2. Components Structure

#### components/ui/ - UI Primitives
```
components/ui/
├── button.tsx          (Button component)
├── input.tsx           (Input component)
├── dialog.tsx          (Dialog component)
├── select.tsx          (Select component)
├── label.tsx           (Label component)
├── badge.tsx           (Badge component)
├── card.tsx            (Card component)
├── alert.tsx           (Alert component)
├── spinner.tsx         (Loading spinner)
└── index.ts            (Export all)
```

#### components/cards/ - Cartes Réutilisables
```
components/cards/
├── KPICard.tsx         (Métrique KPI générique)
├── DataCard.tsx        (Card affichage données)
├── ActionCard.tsx      (Card avec actions)
├── StatsCard.tsx       (Card statistiques)
├── StatusCard.tsx      (Card statut)
└── index.ts
```

#### components/forms/ - Formulaires Réutilisables
```
components/forms/
├── LoginForm.tsx       (Formulaire login)
├── CreateForm.tsx      (Formulaire création générique)
├── EditForm.tsx        (Formulaire édition)
├── SearchForm.tsx      (Formulaire recherche)
├── FilterForm.tsx      (Formulaire filtrage)
└── index.ts
```

#### components/layouts/ - Layouts par Rôle
```
components/layouts/
├── DgLayout.tsx        (Layout DG ANACIM)
├── InspectorLayout.tsx (Layout inspecteur)
├── AdminLayout.tsx     (Layout admin)
├── OperatorLayout.tsx  (Layout exploitant)
└── index.ts
```

#### components/shells/ - Gestion Application
```
components/shells/
├── AuthGate.tsx        (Vérification authentification)
├── WelcomeToast.tsx    (Toast bienvenue + sync)
├── AppShell.tsx        (Shell principal app)
├── Providers.tsx       (Providers globaux: Zustand, etc)
├── Sidebar.tsx         (Navigation sidebar)
├── Header.tsx          (Header navigation)
├── Footer.tsx          (Footer)
└── index.ts
```

#### components/portals/ - Portails Complets par Rôle
```
components/portals/
├── DgPortal.tsx        (Portal DG ANACIM - COMPLET)
├── InspectorPortal.tsx (Portal inspecteur)
├── AdminPortal.tsx     (Portal admin)
├── OperatorFocalPortal.tsx (Portal focal)
├── OperatorDgPortal.tsx    (Portal DG exploitant)
├── GuestPortal.tsx     (Portal invité)
└── index.ts
```

#### components/modules/ - 21 Modules Métier
```
components/modules/
├── modules.ts          (Registre central)
├── surveillance/
│   ├── SurveillanceModule.tsx
│   ├── SurveillanceStepper.tsx
│   ├── SurveillanceChecklist.tsx
│   ├── types.ts
│   └── index.ts
├── certification/
│   ├── CertificationModule.tsx
│   ├── CertificationCard.tsx
│   ├── CertificationForm.tsx
│   ├── types.ts
│   └── index.ts
├── aerodromes/
│   ├── AerodromeModule.tsx
│   ├── AerodromeCard.tsx
│   ├── AerodromeForm.tsx
│   ├── AerodromeDetail.tsx
│   ├── types.ts
│   └── index.ts
└── ... (19 autres modules - même pattern)
```

#### components/charts/ - 7 Charts Réutilisables
```
components/charts/
├── LineChart.tsx
├── BarChart.tsx
├── PieChart.tsx
├── RadarChart.tsx
├── GaugeChart.tsx
├── GanttChart.tsx
├── TrendChart.tsx
└── index.ts
```

### 3. Lib Structure

```
lib/
├── auth.ts             (Authentification + detectLoginType)
├── rbac.ts             (RBAC matrix + RbacGuard)
├── sync-manager.ts     (Sync offline/online)
├── offline.ts          (IndexedDB 21 stores)
├── api-integration.ts  (Supabase API)
├── store.ts            (Zustand store avec persistance)
├── config.ts           (Configuration + rôles)
├── types.ts            (Types globaux)
├── utils.ts            (Utilitaires)
├── constants.ts        (Constantes)
└── ...
```

---

## 🔄 Flow d'Application Conforme

```
User visite app/page.tsx
   ↓
Page() composant rend:
   ├─ <AuthGate>
   │   ├─ Vérifie localStorage/session user
   │   ├─ Si absent: LoginForm
   │   ├─ Si présent: Passe children
   │   └─ <WelcomeToast>
   │
   ├─ <WelcomeToast>
   │   ├─ Affiche "Bienvenue {prénom}"
   │   ├─ Affiche sync status (Online/Offline/Syncing)
   │   ├─ Affiche notifications
   │   └─ Passe children
   │
   └─ <AppShell>
       ├─ Lit user.role du store
       ├─ Affiche Header
       ├─ Affiche Sidebar avec modules du rôle
       ├─ Affiche Footer
       ├─ Lit activeModule du store
       ├─ Affiche Portal approprié au rôle
       │   └─ Portal lit activeModule
       │       └─ Portal affiche Module actif
       └─ Gère navigation onclick modules
           └─ setActiveModule(name) → AppShell re-render

User click module "Certification"
   └─ useAppStore().setActiveModule('certification')
       └─ AppShell se re-render
           └─ Portal affiche CertificationModule
```

---

## ✅ Nomenclature Conforme CDC

### Nommage Composants
```
✅ CONFORME:
- <ModuleName>Module.tsx      (Principal, default export)
- <ComponentName>Card.tsx      (Affichage liste)
- <ComponentName>Form.tsx      (Création/édition)
- <ComponentName>Detail.tsx    (Détail complet)
- <ComponentName>Gate.tsx      (Protection accès)
- <Layout>Layout.tsx           (Layout)
- <Role>Portal.tsx             (Portal)

❌ NON-CONFORME:
- <ModuleName>Page.tsx         (page = fragmenté)
- <ComponentName>Container.tsx (container = vague)
- <ComponentName>View.tsx      (view = vague)
- <ComponentName>Component.tsx (Component = redondant)
```

### Nommage Fonctions
```
✅ CONFORME:
- useAppStore()                (Zustand hook)
- useRbacPermissions()         (Permission hook)
- useSyncManager()             (Sync hook)
- hasPermission(role, module, action)  (Vérification)
- getAccessibleModules(role)   (Données)
- detectLoginType(email)       (Détection)
- initializeSyncManager()      (Initialisation)
- subscribeToAerodromes()      (Subscription)

❌ NON-CONFORME:
- useStore()                   (Trop vague)
- check()                      (Trop vague)
- get()                        (Trop vague)
- init()                       (Trop vague)
- onAerodromeChange()          (callback = confus)
```

### Nommage Types/Interfaces
```
✅ CONFORME:
- interface AuthUser { }       (Objet user authentifiée)
- interface RbacGuardProps { } (Props composant)
- interface SyncQueueItem { }  (Item queue)
- interface SyncState { }      (État manager)
- type LoginType = 'email' | 'code_acces'
- type Permission = 'read' | 'create' | ...
- type ModulePermissions = Record<string, Permission[]>

❌ NON-CONFORME:
- interface IUser { }          (Préfixe I = obsolète)
- interface UserData { }       (Data = vague)
- interface Props { }          (Props = trop vague)
- type AnyStore = any          (Pas de types à any)
```

### Nommage Exports/Index
```
✅ CONFORME:
// components/cards/index.ts
export { default as KPICard } from './KPICard'
export { default as DataCard } from './DataCard'
export { default as ActionCard } from './ActionCard'

// components/modules/index.ts
export { default as AerodromeModule } from './aerodromes'
export { default as CertificationModule } from './certification'
export { AerodromeCard, AerodromeForm } from './aerodromes'

❌ NON-CONFORME:
export * from './KPICard'     (Pas wildcard exports)
export { default } from './...' (Pas ambigü)
export { KPICard as Card } (Renommage = confus)
```

### Nommage Actions/Events
```
✅ CONFORME:
- onClick={handleSelectModule}
- onClick={handleSyncNow}
- onClick={handleApproveEcart}
- onChange={handleStatusChange}
- onSuccess={handleSyncSuccess}
- onError={handleSyncError}

❌ NON-CONFORME:
- onClick={selectModule}       (Pas verbe handle)
- onClick={onSelect}           (Préfixe on = callback)
- onClick={() => dispatch(..)} (Logique en JSX)
```

---

## 🔍 Checklist Conformité Structure

### app/page.tsx
- [ ] UNIQUE point d'entrée
- [ ] Hiérarchie: AuthGate → WelcomeToast → AppShell
- [ ] Aucune logique métier
- [ ] Aucune importation modules directs
- [ ] Utilise useAppStore() pour activeModule

### components/shells/
- [ ] AuthGate: Vérifie user
- [ ] WelcomeToast: Affiche notifications
- [ ] AppShell: Gère layout + routing
- [ ] Providers: Configure Zustand, etc

### components/portals/
- [ ] 6 portals: DG, Inspector, Admin, OperatorFocal, OperatorDg, Guest
- [ ] Chaque portal utilise RbacGuard
- [ ] Chaque portal lit activeModule
- [ ] Chaque portal affiche modules du rôle

### components/modules/
- [ ] 21 modules avec pattern uniforme
- [ ] Chaque module: Module.tsx + Card.tsx + Form.tsx + types.ts
- [ ] Aucun routing interne
- [ ] RbacGuard sur actions sensibles

### components/cards/, forms/, ui/
- [ ] Composants réutilisables génériques
- [ ] Pas de logique métier
- [ ] Pas d'importation modules

### lib/
- [ ] auth.ts: detectLoginType()
- [ ] rbac.ts: hasPermission(), RbacGuard
- [ ] sync-manager.ts: SyncManager, useSyncManager()
- [ ] offline.ts: openDB(), 21 stores
- [ ] store.ts: useAppStore()
- [ ] Tous les types définis

---

## 📝 Exemple Conformité: Module Certification

### Structure
```
components/modules/certification/
├── CertificationModule.tsx    (Principal, default export)
│   ├─ Interface: userRole
│   ├─ Affiche: liste certifications
│   ├─ Gère: activeView (list/detail)
│   ├─ Utilise: RbacGuard pour actions
│   └─ Pas de: routing, navigation
├── CertificationCard.tsx      (Named export)
│   ├─ Props: certification data
│   ├─ Affiche: card compacte
│   └─ Events: onSelect
├── CertificationForm.tsx      (Named export)
│   ├─ Props: initialData?
│   ├─ Affiche: formulaire
│   └─ Events: onSubmit
├── types.ts                   (Interfaces)
│   ├─ interface CertificationData
│   ├─ type CertificationFormData
│   └─ interface CertificationModuleProps
└── index.ts                   (Exports)
    ├─ export { default as CertificationModule }
    ├─ export { default as CertificationCard }
    └─ export { default as CertificationForm }
```

### Usage dans Portal
```typescript
// components/portals/DgPortal.tsx
import { CertificationModule } from '@/components/modules'
import { RbacGuard } from '@/lib/rbac'

export function DgPortal({ userRole }: DgPortalProps) {
  return (
    <RbacGuard role={userRole} module="certification">
      <CertificationModule userRole={userRole} />
    </RbacGuard>
  )
}
```

### Aucun routing interne
```typescript
// ❌ MAUVAIS dans CertificationModule:
<Link href="/certification/detail/123">
  Voir détail
</Link>

// ✅ BON dans CertificationModule:
<button onClick={() => handleSelectCertification(123)}>
  Voir détail
</button>
// handleSelectCertification peut stocker dans local state
// ou appeler store si besoin cross-module
```

---

## 🎯 Résumé Conformité Structure

### Les 3 Règles CDC de Structure

1. **Point d'Entrée UNIQUE**
   - ✅ app/page.tsx seulement
   - ✅ Jamais app/auth/page.tsx, app/dashboard/page.tsx, etc
   - ✅ Hiérarchie stricte: AuthGate → WelcomeToast → AppShell → Module

2. **Pas de Fragmentation**
   - ✅ Toute navigation via activeModule store
   - ✅ AppShell gère le layout
   - ✅ Aucun routing interne aux modules

3. **Structure Organisationnelle**
   - ✅ components/ui/: Primitives UI
   - ✅ components/cards/: Cartes réutilisables
   - ✅ components/forms/: Formulaires réutilisables
   - ✅ components/layouts/: Layouts par rôle
   - ✅ components/shells/: Gates, AppShell, Providers
   - ✅ components/portals/: 6 portals complets
   - ✅ components/modules/: 21 modules métier
   - ✅ components/charts/: 7 charts réutilisables

---

*Référence CDC Structure - Version Finale*
*SGDA V8 Architecture Conforme*
