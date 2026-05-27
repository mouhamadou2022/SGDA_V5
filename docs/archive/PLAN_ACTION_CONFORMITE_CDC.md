# Plan d'Action - Conformité CDC Complète
**SGDA V8 - Finalisation Conformité CDC**
**Priorité: CRITIQUE pour UAT**
**Timeline: 4-5 jours**

---

## 🎯 Objectif

Atteindre **100% de conformité CDC V8** avant UAT en complétant les corrections restantes.

**Score Cible:**
- Avant: 83/100 (83%)
- Après corrections faites: 92/100 (92%)
- Cible finale: 100/100 (100%) ✅

---

## 📋 Tâches Détaillées par Priorité

### 🔴 JOUR 1-2: Portails Multi-Rôles (CRITIQUE)

**Why:** Utilisateurs ont besoin des interfaces spécifiques à leur rôle pour UAT

#### Task 1.1: InspectorPortal ⏱️ 6h
```
File: components/portals/InspectorPortal.tsx

Structure:
├── Header: "Portail Inspecteur" (gradient orange)
├── Navigation tabs:
│   ├── Tableau de Bord (plannings assignés, tâches)
│   ├── Plannings (liste assignments)
│   ├── Checklists (en cours)
│   ├── Écarts (découverts)
│   ├── Kit Inspecteur (outils)
│   └── Mode Hors-Ligne (sync status)
├── Contenu:
│   - Dashboard: Plannings du jour, stat écartsaux
│   - Plannings: Afficher PlanningModule filtrés par utilisateur
│   - Checklists: Afficher checklists à compléter
│   - Écarts: Afficher EcartsModule filtrés
│   - Kit: KitInspecteurModule
└── Features:
    - Sync status prominent (pour offline)
    - Offline queue visible
    - Quick actions (Start inspection, etc)

RbacGuard: inspector_regional, inspector_national
```

#### Task 1.2: AdminPortal ⏱️ 4h
```
File: components/portals/AdminPortal.tsx

Structure:
├── Header: "Portail Administrateur" (gradient gris)
├── Navigation tabs:
│   ├── Tableau de Bord
│   ├── Utilisateurs
│   ├── Aérodromes
│   ├── Codes d'Accès
│   └── Logs Système
├── Contenu:
│   - Dashboard: Système health, derniers logs
│   - Users: UtilisateursModule avec création/édition
│   - Aerodromes: AerodromeModule gestion complète
│   - Access: CodesAccesModule
│   - Logs: RegistresModule + AuditModule
└── Features:
    - Audit trail visible
    - System monitoring
    - Bulk actions

RbacGuard: admin
```

#### Task 1.3: OperatorFocalPortal ⏱️ 3h
```
File: components/portals/OperatorFocalPortal.tsx

Structure:
├── Header: "Portail Point Focal - Aérodrome" (gradient bleu clair)
├── Navigation tabs:
│   ├── Tableau de Bord
│   ├── Écarts
│   ├── Enquêtes
│   └── Rapports
├── Contenu:
│   - Dashboard: Health aérodrome, recap conformité
│   - Gaps: EcartsModule (lecture seule + input)
│   - Surveys: EnquetesModule
│   - Reports: Rapports d'inspection
└── Features:
    - Aérodrome context visible
    - Contact inspecteurs
    - Status quo rapide

RbacGuard: focal_operator
```

#### Task 1.4: OperatorDgPortal ⏱️ 3h
```
File: components/portals/OperatorDgPortal.tsx

Structure:
├── Header: "Portail DG Exploitant" (gradient vert)
├── Navigation tabs:
│   ├── Tableau de Bord Stratégique
│   ├── Certifications
│   ├── Conformité
│   └── Rapports Exécutifs
├── Contenu:
    - Dashboard: Vue haut niveau conformité
    - Certs: CertificationModule (approbations)
    - Compliance: Tendances conformité
    - Reports: Export rapports
└── Features:
    - KPI stratégiques
    - Approvals workflow
    - Executive summaries

RbacGuard: dg_operator
```

#### Task 1.5: GuestPortal ⏱️ 2h
```
File: components/portals/GuestPortal.tsx

Structure:
├── Header: "Portail Accès Limité" (gradient neutre)
├── Navigation tabs:
│   ├── Rapports Publics
│   ├── Information
├── Contenu:
    - Public reports listing
    - Aérodromes publics
    - Lecture seule complète
└── Features:
    - Pas de modification
    - Pas d'édition
    - Export seulement

RbacGuard: guest
```

**Deliverables Jour 1-2:**
```
✅ 5 nouveaux portals implémentés
✅ Tous utilisent RbacGuard
✅ Tous intègrent modules existants
✅ Tous testés localement
```

---

### 🔴 JOUR 2-3: Extension Mode Hors-Ligne (CRITIQUE)

**Why:** Mode offline doit fonctionner pour tous les 21 modules

#### Task 2.1: Ajouter stores manquants ⏱️ 3h
```
File: lib/offline.ts (ÉTENDRE)

Ajouter après les 10 stores existants:

export const IDB_STORES = {
  // ... 10 existants ...
  AERODROMES: 'idb_aerodromes',
  UTILISATEURS: 'idb_utilisateurs',
  CODES_ACCES: 'idb_codes_acces',
  REGISTRES: 'idb_registres',
  AUDIT: 'idb_audit',
  FORMATION: 'idb_formation',
  RISQUE: 'idb_risque',
  PLANNING: 'idb_planning',
  HOMOLOGATION: 'idb_homologation',
  CHARGE_TRAVAIL: 'idb_charge_travail',
  ENQUETES: 'idb_enquetes',
} as const

Action dans openDB():
- Créer objectStore pour chaque nouveau store
- Ajouter indexes (par date, par status, etc)
- Version IDB++
```

#### Task 2.2: Créer interfaces storage ⏱️ 2h
```
File: lib/offline-types.ts (CRÉER)

Définir interfaces pour chaque store:

export interface AerodromeOffline {
  id: string
  nom: string
  code_icao: string
  date_sync: string
  synced: boolean
}

export interface UserOffline {
  id: string
  email: string
  role: Role
  date_sync: string
}

... (19 autres stores)

Export utility functions:
- mapToOffline<T>(data: T, storeType): StorageModel
- mapFromOffline<T>(data: StorageModel): T
```

#### Task 2.3: Étendre SyncManager ⏱️ 2h
```
File: lib/sync-manager.ts (COMPLÉTER)

Ajouter handlers pour nouveaux stores dans:
executeSyncOperation(item):
  - case 'idb_aerodromes': syncAerodrome()
  - case 'idb_utilisateurs': syncUser()
  - case 'idb_codes_acces': syncAccessCode()
  - case 'idb_registres': syncLog()
  - case 'idb_audit': syncAudit()
  - case 'idb_formation': syncFormation()
  - case 'idb_risque': syncRisk()
  - case 'idb_planning': syncPlanning()
  - case 'idb_homologation': syncHomologation()
  - case 'idb_charge_travail': syncWorkload()
  - case 'idb_enquetes': syncSurvey()

Chaque handler appelle l'API appropriée:
  - aerodromeAPI.create/update/delete()
  - utilisateurAPI.create/update/delete()
  - etc...
```

#### Task 2.4: Créer Offline Middleware ⏱️ 2h
```
File: lib/offline-middleware.ts (CRÉER)

Middleware Zustand qui:
1. Persiste state dans IndexedDB
2. Hydrate state au démarrage
3. Écoute changements + SyncManager.addToQueue()
4. Affiche sync status/queue

Usage:
const store = create<AppState>((set) => ({
  ...
}))
.pipe(offlineMiddleware({ storeName: 'app_state' }))
```

**Deliverables Jour 2-3:**
```
✅ 12 nouveaux stores IndexedDB
✅ Interfaces offline complètes
✅ SyncManager handlers pour tous modules
✅ Middleware persistence + sync
✅ Tests offline offline-first scenarios
```

---

### 🟡 JOUR 3: RBAC & Permissions (IMPORTANT)

**Why:** Assurer permissions granulaires cohérentes

#### Task 3.1: Valider RBAC matrix ⏱️ 1h
```
File: lib/rbac.ts (VALIDER)

Checklist:
✅ 7 rôles × 21 modules = 147 mappings
✅ Chaque rôle a accès à au moins 1 module
✅ DG ANACIM accès complet (read, create, update, delete, export, approve)
✅ Guests lectures uniquement
✅ Permissions cohérentes (ex: delete = update >  create > read)
✅ Tous les rôles mappés à portals
```

#### Task 3.2: Tester RbacGuard ⏱️ 1h
```
Test RbacGuard component:
- Rôle avec permission → affiche children
- Rôle sans permission → affiche fallback
- Changer rôle → contenu changé
- Nested RbacGuard → ET logic

Exemples:
<RbacGuard role="dg_anacim" module="certification" permission="approve">
  <ApproveButton /> ✅
</RbacGuard>

<RbacGuard role="guest" module="dossiers" permission="create">
  <CreateButton /> ❌ shows fallback
</RbacGuard>
```

#### Task 3.3: Ajouter permissions aux modules ⏱️ 2h
```
Pattern: Chaque module doit respecter RBAC

Exemple dans CertificationModule:
```typescript
interface CertificationModuleProps {
  userRole: Role
}

export function CertificationModule({ userRole }: CertificationModuleProps) {
  return (
    <div>
      {/* Afficher toujours */}
      <CertificationList data={data} />
      
      {/* Afficher seulement si création autorisée */}
      <RbacGuard role={userRole} module="certification" permission="create">
        <CreateButton />
      </RbacGuard>
      
      {/* Afficher seulement si approbation autorisée */}
      <RbacGuard role={userRole} module="certification" permission="approve">
        <ApprovalSection />
      </RbacGuard>
    </div>
  )
}
```

**Deliverables Jour 3:**
```
✅ RBAC matrix validée
✅ RbacGuard intégré tous portals
✅ Permissions appliquées dans modules
✅ Test pass: chaque rôle ne voit que ses modules/actions
```

---

### 🟡 JOUR 4: Normalisation Structure (IMPORTANT)

**Why:** Code consistency pour maintenabilité

#### Task 4.1: Ajouter types.ts manquants ⏱️ 2h

**Modules qui besoin types.ts:**
```
components/aerodromes/types.ts
components/surveillance/types.ts
components/certification/types.ts
components/ecarts/types.ts
components/planning/types.ts
components/homologation/types.ts
components/risque/types.ts
components/formation/types.ts
components/signatures/types.ts
components/dossiers/types.ts
components/evenements/types.ts
components/registres/types.ts
components/codes-acces/types.ts
components/utilisateurs/types.ts
components/audit/types.ts
components/charge-travail/types.ts
components/enquetes/types.ts
components/messagerie/types.ts
components/kit-inspecteur/types.ts
```

**Template types.ts:**
```typescript
// components/<module>/types.ts

export interface <Module>Data {
  id: string
  // ... entity fields
  created_at: string
  updated_at: string
}

export type <Module>FormData = Omit<<Module>Data, 'id' | 'created_at' | 'updated_at'>

export interface <Module>ApiResponse {
  data: <Module>Data | null
  error: Error | null
  status: 'success' | 'error' | 'loading'
}

export interface <Module>ModuleProps {
  userRole: Role
  // ... other props
}
```

#### Task 4.2: Valider pattern structure ⏱️ 1h

**Checklist structure:**
```
Chaque module deve avoir:
✅ <Module>Module.tsx (default export, principal component)
✅ <Component>Card.tsx (pour listes, named export)
✅ <Component>Form.tsx (création/édition, named export)
✅ types.ts (interfaces TypeScript)
✅ index.ts (exports centralisés)
⚠️ Optional: <Component>Detail.tsx, utils.ts
```

**Deliverables Jour 4:**
```
✅ 19 fichiers types.ts créés
✅ Interfaces cohérentes tous modules
✅ Pattern documentation updated
✅ Consistency validated
```

---

### 🟢 JOUR 5: Testing & Documentation (VALIDATION)

#### Task 5.1: Test Conformité Complète ⏱️ 3h

```
Checklist de validation:

STRUCTURE FICHIERS:
✅ app/ structure OK
✅ components/ structure OK
✅ lib/ structure OK
✅ Tous modules dans components/modules/

AUTHENTIFICATION:
✅ Détection type login (email vs code)
✅ Normalization ANACIM format
✅ Supabase integration OK

MODE HORS-LIGNE:
✅ 21 modules peuvent sauvegarder offline
✅ SyncQueue fonctionne
✅ Reconnection sync automatique

RBAC:
✅ 7 rôles avec permissions complètes
✅ RbacGuard protège tous modules
✅ Chaque action respecte RBAC

PORTAILS:
✅ 6 portails implémentés
✅ Navigation par rôle OK
✅ Modules filtrés par rôle

SYNCHRONISATION:
✅ Offline → Online sync
✅ Retry logic fonctionne
✅ Conflict resolution OK
```

#### Task 5.2: Documenter Conformité ⏱️ 1h

Créer final compliance report:
- ✅ Score 100/100
- ✅ Checklist passé
- ✅ UAT ready certification

#### Task 5.3: Briefing UAT ⏱️ 1h

Préparer équipe UAT:
- Guide des 6 portails
- RBAC matrix reference
- Offline testing guide
- Known limitations

---

## 📊 Timeline Consolidée

| Jour | Task | Effort | Owner |
|------|------|--------|-------|
| **D1-2** | 5 Portals | 18h | Dev |
| **D2-3** | Extension Offline | 9h | Dev |
| **D3** | RBAC Validation | 4h | Dev |
| **D4** | Normalisation | 3h | Dev |
| **D5** | Testing & Doc | 5h | QA + Dev |
| **Total** | | 39h | 1 Dev, 1 QA |

**Timeline réaliste: 5-6 jours (1 semaine)**

---

## ✅ Critères de Succès

### Avant UAT:
- [ ] 6/6 portals implémentés et testés
- [ ] 21/21 modules offline-capable
- [ ] RBAC enforced partout
- [ ] 100% CDC compliance score
- [ ] UAT team briefed
- [ ] Offline testing guide créé

### Pendant UAT:
- [ ] Tous les tests RBAC passent
- [ ] Offline scenarios fonctionnent
- [ ] Portals accessibles par rôle
- [ ] Sync fonctionne en production

### Post-UAT:
- [ ] UAT sign-off reçu
- [ ] Déploiement production scheduled
- [ ] Support team formé

---

## 🚀 Prochaines Actions (Immédiatement)

```
1. ✅ FAIT: Rapport CDC analysis créé
2. ✅ FAIT: RBAC matrix implémentée
3. ✅ FAIT: SyncManager implémenté
4. ✅ FAIT: DgPortal exemple implémenté
5. 👉 À FAIRE: Implémenter 5 portals manquants
6. 👉 À FAIRE: Étendre offline.ts + SyncManager
7. 👉 À FAIRE: Valider et tester
8. 👉 À FAIRE: UAT avec équipe
```

---

## 📞 Support & Escalation

**Questions sur RBAC:**
- Référer à lib/rbac.ts et RBAC_MATRIX
- Tester avec hasPermission()

**Questions sur Offline:**
- Référer à lib/offline.ts et lib/sync-manager.ts
- Tester avec browser DevTools

**Questions sur Portals:**
- Pattern: components/portals/<Portal>.tsx
- Exemplr: DgPortal.tsx

---

## Conclusion

**Objectif:** 100% CDC Compliance avant UAT ✅

**Clé:** Implémenter les 5 portals manquants + compléter offline + valider RBAC

**Timeline:** 5-6 jours (1 semaine)

**Effort:** 39 heures développement + 5 heures QA

**Risque:** FAIBLE (tâches définies, pattern établi, dépendances claires)

---

*Plan généré: April 24, 2026*
*SGDA V8 - Chemin vers 100% Conformité CDC*
