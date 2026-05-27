# Plan de Restructuration SGDA V8 — Architecture Modulaire

## 📁 Structure cible des dossiers

```
components/
├── aerodromes/
│   ├── AerodromeCard.tsx
│   ├── AerodromeForm.tsx
│   ├── AerodromeDetail.tsx (détails 7 onglets)
│   ├── AerodromeMap.tsx
│   └── AerodromeQRCode.tsx
│
├── certification/
│   ├── CertificationModule.tsx
│   ├── CertPhaseForm.tsx (5 phases)
│   ├── CertDocumentUpload.tsx
│   ├── CertProgressBar.tsx
│   └── CertTimeline.tsx
│
├── homologation/
│   ├── HomologationModule.tsx
│   ├── HomoPhaseForm.tsx (3 phases)
│   ├── HomoProgressBar.tsx
│   └── HomoTimeline.tsx
│
├── planning/
│   ├── PlanningModule.tsx
│   ├── PlanningForm.tsx
│   ├── PlanningCard.tsx
│   ├── PlanningCalendarView.tsx
│   ├── PlanningGanttView.tsx
│   ├── InspecteurAssignmentModal.tsx
│   └── ConflictDetectionAlert.tsx
│
├── surveillance/
│   ├── SurveillanceModule.tsx
│   ├── SurveillanceForm.tsx
│   ├── SurveillanceCard.tsx
│   ├── SurveillanceStepper.tsx (7 étapes)
│   ├── SurveillanceChecklistStandard.tsx
│   ├── SurveillanceChecklistSuiviEcarts.tsx
│   ├── SurveillanceChecklistPAC.tsx
│   ├── SurveillanceEcartsRedaction.tsx
│   ├── SurveillanceRapport.tsx
│   ├── SurveillanceLettre.tsx
│   └── SurveillanceTransmission.tsx
│
├── ecarts/
│   ├── EcartsModule.tsx
│   ├── EcartCard.tsx
│   ├── EcartForm.tsx
│   ├── EcartPACWizard.tsx (5 étapes)
│   ├── EcartEvaluationMatrix.tsx (6 critères)
│   ├── EcartHistoriqueModal.tsx
│   └── EcartRedactionModal.tsx
│
├── registres/
│   ├── RegistresModule.tsx
│   ├── RegistreCard.tsx
│   ├── RegistreForm.tsx
│   ├── RegistreFilters.tsx
│   └── types.ts (6 types de registres)
│
├── dossiers/
│   ├── DossiersModule.tsx
│   ├── DossierCard.tsx
│   ├── DossierForm.tsx
│   ├── DossierAccordion.tsx
│   ├── DossierOCRExtraction.tsx
│   └── DossierNotifModal.tsx
│
├── formation/
│   ├── FormationModule.tsx
│   ├── FormationCard.tsx
│   ├── FormationForm.tsx
│   ├── CompetencyMatrix.tsx
│   ├── CompetencyRadar.tsx
│   ├── ExpiryAlerts.tsx
│   └── TrainingRecommendations.tsx
│
├── kit/
│   ├── KitModule.tsx
│   ├── KitDocCard.tsx
│   ├── KitDocForm.tsx
│   ├── KitDocSharing.tsx
│   └── KitDocSearch.tsx
│
├── evenements/
│   ├── EvenementsModule.tsx
│   ├── EventCard.tsx
│   ├── EventForm.tsx
│   ├── EventWorkflowStepper.tsx (6 étapes)
│   ├── EventClassification.tsx
│   └── EventNotificationAlert.tsx
│
├── enquetes/
│   ├── EnquetesModule.tsx
│   ├── EnqueteCard.tsx
│   ├── EnqueteForm.tsx
│   ├── EnqueteBuilder.tsx (drag-drop)
│   ├── EnqueteResponses.tsx
│   ├── EnqueteStats.tsx
│   └── EnqueteExport.tsx
│
├── messagerie/
│   ├── MessagerieModule.tsx
│   ├── MessageCard.tsx
│   ├── MessageForm.tsx
│   ├── MessageThread.tsx
│   ├── ComposeMessage.tsx
│   └── OperatorPortalMessaging.tsx
│
├── risque/
│   ├── RisqueModule.tsx
│   ├── RiskCard.tsx
│   ├── RiskScoreCard.tsx
│   ├── RiskGauge.tsx
│   ├── RiskRadarChart.tsx
│   ├── PredictionChart.tsx (N+1, N+2, N+3)
│   ├── TrendAnalysis.tsx
│   ├── ScenarioSimulator.tsx
│   └── RiskRecalculate.tsx
│
├── signatures/
│   ├── SignaturesModule.tsx
│   ├── SignatureCard.tsx
│   ├── SignaturePad.tsx
│   ├── SignatureHistory.tsx
│   ├── SignatureVerification.tsx
│   └── SignatureSummary.tsx
│
├── charge/
│   ├── ChargeModule.tsx
│   ├── ChargeAccordion.tsx (par statut)
│   ├── ChargeKPICard.tsx
│   ├── ChargeMonthlyReport.tsx
│   ├── ChargeDetectionAlert.tsx
│   └── ChargeBalancing.tsx
│
├── utilisateurs/
│   ├── UtilisateursModule.tsx
│   ├── UserCard.tsx
│   ├── UserForm.tsx
│   ├── UserPasswordReset.tsx
│   ├── UserRoleAssignment.tsx
│   ├── InspecteurSync.tsx
│   └── UserActivationModal.tsx
│
├── codesAcces/
│   ├── CodesAccesModule.tsx
│   ├── CodeAccesCard.tsx
│   ├── CodeAccesForm.tsx (GOXX-XXXXXXX)
│   ├── CodeAccesDisplay.tsx (une fois)
│   └── CodeAccesRevoke.tsx
│
├── audit/
│   ├── AuditModule.tsx
│   ├── AuditLogTable.tsx
│   ├── AuditFilters.tsx
│   └── AuditExport.tsx
│
├── operatorPortal/
│   ├── OperatorPortalModule.tsx
│   ├── OperatorDashboard.tsx
│   ├── OperatorEcarts.tsx
│   ├── OperatorEvenements.tsx
│   ├── OperatorDocumentations.tsx
│   └── OperatorEnquetes.tsx
│
├── dashboard/
│   ├── DashboardModule.tsx
│   ├── DgDashboardModule.tsx
│   ├── AdminDashboardModule.tsx
│   ├── InspectorDashboardModule.tsx
│   ├── OperatorDashboardModule.tsx
│   ├── KPICard.tsx
│   ├── AlertCard.tsx
│   ├── ActivityFeed.tsx
│   ├── StatWidget.tsx
│   └── AnomaliesWidget.tsx
│
├── charts/
│   ├── LineChart.tsx
│   ├── BarChart.tsx
│   ├── PieChart.tsx
│   ├── RadarChart.tsx
│   ├── GaugeChart.tsx
│   ├── GanttChart.tsx
│   └── TrendChart.tsx
│
├── layout/
│   ├── AppShell.tsx
│   ├── AppHeader.tsx
│   ├── AppNav.tsx
│   ├── Breadcrumb.tsx
│   ├── TimerBar.tsx
│   ├── CommandPalette.tsx ✅ (créé)
│   ├── OfflineBanner.tsx ✅ (créé)
│   ├── SyncStatus.tsx ✅ (créé)
│   └── SgdaCopilot.tsx (IA assistant)
│
└── ui/
    ├── (shadcn/ui standard)
    ├── EmptyState.tsx ✅ (créé)
    ├── StyletCanvas.tsx ✅ (créé)
    ├── Stepper.tsx
    ├── AlertBadge.tsx
    ├── StatusIndicator.tsx
    └── LoadingSpinner.tsx

lib/
├── datastore.ts ✅ (créé) — Supabase CRUD + realtime
├── offline.ts ✅ (créé) — IndexedDB (10 stores) + sync queue
├── competences.ts ✅ (créé) — Scoring compétences
├── anomalies.ts ✅ (créé) — Détection proactive
├── stylet.ts ✅ (créé) — Logique canvas stylet
├── planning.ts — Intelligent scheduling + conflict detection
├── risque.ts — Risk scoring + N+3 predictions
├── audit.ts — Complete audit logging
├── copilot.ts — Claude API integration
├── certification.ts — 5-phase workflow logic
├── homologation.ts — 3-phase workflow logic
├── evenement.ts — 6-step event workflow
├── pac.ts — 6-criteria evaluation matrix
├── formation.ts — Competency tracking
├── config.ts ✅ (existe) — ROLES, PERMISSIONS, MODULES
├── supabase.ts ✅ (existe) — Client initialization
├── auth.ts ✅ (mis à jour) — Login + password management
├── store.ts ✅ (existe) — Zustand global state
├── types.ts ✅ (existe) — TypeScript interfaces
└── utils.ts ✅ (existe) — Helper functions

types/
├── surveillance.ts ✅ (existe)
├── checklist.ts ✅ (existe)
├── index.ts
├── aerodrome.ts
├── ecart.ts
├── planning.ts
├── certification.ts
├── homologation.ts
├── evenement.ts
├── enquete.ts
├── dossier.ts
├── registre.ts
├── formation.ts
├── audit.ts
└── api.ts
```

## 📊 Status: Fichiers à créer (priorité)

### 🔴 CRITIQUE (Cœur métier)
- [ ] lib/planning.ts — Algorithme de planification intelligente
- [ ] lib/risque.ts — Moteur de scoring risque + prédictions N+3
- [ ] lib/audit.ts — Logging d'audit complet
- [ ] lib/pac.ts — Matrice 6-critères PAC
- [ ] lib/certification.ts — Logique 5 phases
- [ ] lib/homologation.ts — Logique 3 phases
- [ ] lib/evenement.ts — Workflow 6 étapes
- [ ] lib/formation.ts — Matrix compétences

### 🟠 IMPORTANT (Modules)
- [ ] Tous les dossiers `/modules/` listés ci-dessus avec leurs composants
- [ ] Types correspondants dans `/types/`
- [ ] Charts personnalisés dans `/charts/`

### 🟡 COMPLÉMENTAIRE
- [ ] lib/copilot.ts — Claude API assistant
- [ ] components/layout/SgdaCopilot.tsx
- [ ] PWA icons (192×192, 512×512)
- [ ] Service Worker (offline support)

## ✅ Status: Déjà créé
- [x] lib/datastore.ts
- [x] lib/offline.ts
- [x] lib/competences.ts
- [x] lib/anomalies.ts
- [x] lib/stylet.ts
- [x] components/ui/StyletCanvas.tsx
- [x] components/ui/EmptyState.tsx
- [x] components/layout/CommandPalette.tsx
- [x] components/layout/OfflineBanner.tsx
- [x] components/layout/SyncStatus.tsx
- [x] lib/auth.ts (mis à jour)
- [x] app/layout.tsx (Sora font + PWA)
- [x] public/manifest.json

---

**Total à créer: ~120+ fichiers pour conformité complète V8**
