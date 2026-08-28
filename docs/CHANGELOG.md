# CHANGELOG - SGDA V5

## [S16] - Enrichissement modules métier (Dossiers, Planning, Surveillance, Écarts & PAC, Agents IA) - 2026-08-16

### 🤖 Module Agents IA — Copilote conversationnel libre
- **Nouvel onglet « Copilote »** (par défaut) dans le module Agents IA : dialogue libre avec l'IA selon le besoin de l'inspecteur (question réglementaire, analyse de documents, rédaction de notes/courriers, comparaison…). Aucun parcours imposé — le copilote remplace l'ancien workflow guidé « Dossier technique » (jugé redondant avec le module Dossiers, supprimé).
- **`lib/ia/agents/copiloteAgent.ts`** : réponse libre fondée sur les pièces jointes (optionnel) + référentiels OACI / IATA / ANACIM via RAG (`construireContexteReglementaire`) + historique de conversation.
- **Pièces jointes optionnelles** : dépôt multi-PDF (20 Mo max), extraction du texte (`extractTextFromPDF`), contexte d'aérodrome et note de travail libres.
- **Export de la conversation PDF & Word** (`lib/services/rapportConversation.ts`) : le PDF réutilise le **format institutionnel ANACIM partagé** (`lib/services/pdfRapport.ts`, celui du module Profil de Risque) — page de garde, Times, sections soulignées, pied de page paginé. Le **DOCX** a été repensé dans le même gabarit : page de garde isolée (en-tête République du Sénégal / ANACIM, filets, titre), bloc méta sous forme de tableau (date, aérodrome, confidentialité), saut de page avant l'échange, réponses IA découpées par paragraphes, en-tête/pied de page « Page X / Y » (masqués sur la garde). Tests de fumée ajoutés (`lib/services/__tests__/rapportConversation.test.ts`).
- **Nettoyage** : suppression des fichiers morts / redondants — `dossierTechniqueAgent.ts`, `rapportDossierTechnique.ts`, `DossierTechniqueWorkflow.tsx` et les prompts `ANALYSER_DOSSIER_TECHNIQUE_PROMPT` / `REPONDRE_DOSSIER_TECHNIQUE_PROMPT` (remplacés par un unique `REPONDRE_COPILOTE_PROMPT`).
- **Suppression de l'onglet « Exécuter »** (jugé redondant avec le copilote et les modules métier) : les ~30 tâches à formulaires pré-encadrées du registre des agents ont été retirées. Le registre (`agentRegistry.ts`) ne conserve plus que les **métadonnées** des 9 agents (identité, capacité, icône) utilisées par l'onglet Apprentissage. Nettoyage connexe : suppression de `findTask` et des types `AgentTask`/`TaskParam*`/`TaskRunContext`, retrait de `taskRunner.executer()` et `getParamOptions()`, suppression des commandes IA dans la palette Ctrl+K, et de l'état `agentTaskRequest` du store. Les **tâches personnalisées** (Entraînement) restent : elles s'exécutent désormais via un seul chemin générique (assistant conversationnel).

### 📁 Module Dossiers (Phase 1)
- `kitDocAgent.analyserDocumentDossier()` : analyse IA des documents d'un dossier (extraction, conformité, preuves attendues).
- `kitDocAgent.genererChecklistTraitement()` : génération d'une checklist de traitement IA pour un dossier.
- `DetailsModal` enrichi : analyse IA, checklist de traitement, formulaires, évaluation admin.
- Migration SQL : 4 nouvelles colonnes sur les dossiers.
- 2 prompts Dossiers ajoutés dans `lib/ia/prompts.ts`.

### 📅 Module Planning (Phase 2)
- **Nettoyage** : suppression de la modale interne morte de `PlanningCard.tsx` (632 l) et de l'orphelin `ArchiveEcarts.tsx` (578 l) + import dans `PlansActionsModule`.
- **Briefing de mission** : `Planning.briefing_fiche` (JSONB Supabase), `kitDocAgent.genererFicheBriefing()`, bouton dans `PreparationModal` + carte repliable « Briefing de mission » sur `/preparation-checklist/[planningId]` + **export PDF** (`lib/services/ficheBriefingPDF.ts`, même format ANACIM que le bulletin mensuel : page de garde, KPIs, sections, tableaux, footer) — boutons « Télécharger PDF » dans la modale de préparation et la page checklist.
- **Grande modale de détails** (`PlanningDetailsModal`) : le bouton « Voir » de la carte planning (inspecteur & admin) ouvre désormais une modale récapitulative — identité de la mission, profil de risque, objectifs, équipe, domaines surveillés, **état de la préparation** (équipe désignée, briefing, checklist, délégations, confirmation, lancement) avec progression, fiche de briefing, écarts actifs et surveillance liée + actions (Préparer / Ouvrir la checklist / Ouvrir la surveillance). Branché sur les cartes (listes cert/homo & principales) et la vue table.

### 🔍 Module Surveillance (Phase 2)
- Encart d'avancement sur `/rapport` : étapes du workflow, stats (écarts, points NS/NV sans preuve, items renseignés), bloc « Vérification documentaire » (couverture + alerte documents évolués).

### ⚠️ Module Écarts & PAC (Phase 2)
- **Avis IA sur les preuves** dans `EcartDetail` : verdict stocké + vérification IA à la demande via `ecartAgent.verifyPreuves`.
- **Projet de courrier de relance** dans `RappelSection` : `ecartAgent.genererCourrierRelance(ecartId)` (contexte RAG réglementaire, fallback déterministe, aperçu + téléchargement + régénération).

### 🤖 Briefing enrichi par IA (AERORISQ)
- Le prompt `GENERER_FICHE_BRIEFING_PROMPT` demande désormais une `synthese` rédigée par l'IA et l'exploitation complète du contexte fourni (profil C1-C5, historique, écarts/PAC, événements).
- `kitDocAgent.genererFicheBriefing()` injecte dans le contexte de l'IA : profil de risque complet (C1-C5, tendance), historique des 5 dernières surveillances passées, écarts actifs détaillés (réf, libellé, niveau, statut, PAC, délai), événements de sécurité récents.
- `FicheBriefing` enrichi (store) : `synthese`, `contexte_profil`, `contexte_historique`, `contexte_ecarts`, `contexte_evenements` — données structurées réelles, jamais inventées.
- **PDF étendu** (`ficheBriefingPDF.ts`) : 14 sections — synthèse AERORISQ, profil de risque C1-C5, historique des surveillances passées, écarts actifs & PAC, événements récents (tableaux) ; la conclusion reprend la `synthese` de l'IA.
- Affichage enrichi de la carte « Briefing de mission » sur `/preparation-checklist/[planningId]` : synthèse IA, profil, historique, écarts/PAC, événements à un coup d'œil.

### 🧪 Validation
- `npx tsc --noEmit` : 0 erreur.
- Lint : baseline stricte (aucune nouvelle erreur/warning).
- Jest : 505 tests OK (seule suite en échec pré-existante = fixture `CHCKLIT SC CSK 102025.docx`).

---

## [S15] - Tests et Finalisation - 2026-03-13

### ✅ Tests ajoutés
- Tests unitaires pour `evenementUtils`
- Tests unitaires pour `enqueteUtils`
- Tests unitaires pour `messagerieUtils`
- Tests unitaires pour `operatorUtils`
- Tests complémentaires pour `risqueUtils`

### 🔒 Sécurité
- Script SQL complet pour RLS (Row Level Security)
- Politiques par rôle conformes à la matrice d'accès
- Isolation des données entre exploitants

### 📝 Documentation
- CHANGELOG.md créé
- README.md mis à jour
- Commentaires JSDoc ajoutés dans tous les utils

### 🐛 Corrections de bugs
- Correction du typage dans `operatorUtils.getStatsEcarts`
- Ajout de la gestion d'erreur dans `SoumissionPACForm`
- Validation des formulaires améliorée
- Gestion des dates dans les délais

### ⚡ Optimisations
- Memoization dans tous les composants
- Suppression des renders inutiles
- Lazy loading des modales
- Debounce sur la recherche

---

## [S14] - Portail Exploitant - 2026-03-13

### ✅ Modules créés
- `OperatorDashboardModule` - Tableau de bord exploitant
- `OperatorEcartsModule` - Gestion des écarts et PAC
- `OperatorEvenementsModule` - Déclaration d'événements
- `OperatorDocumentationsModule` - Documents reçus
- `OperatorEnquetesModule` - Enquêtes

### 📦 Utilitaires
- `operatorUtils.ts` - Fonctions spécifiques exploitant
- `SoumissionPACForm.tsx` - Formulaire de soumission PAC

### 🎨 Design
- Bandeau personnalisé par rôle
- Badges de gravité pour événements
- Timeline des actions

---

## [S13] - Événements, Enquêtes & Messagerie - 2026-03-13

### ✅ Modules créés
- `EvenementsModule` - Gestion des événements de sécurité
- `EnquetesModule` - Enquêtes personnalisées
- `MessagerieModule` - Deux canaux de messagerie

### 📦 Utilitaires
- `evenementUtils.ts` - Calculs et formatage événements
- `enqueteUtils.ts` - Statistiques et impact C1
- `messagerieUtils.ts` - Gestion des conversations

### 🔔 Notifications
- SMS pour événements critiques
- Email pour enquêtes
- In-app pour messages

---

## [S12] - Plans d'Actions & Écarts - 2026-03-13

### ✅ Modules créés
- `PlansActionsModule` - Vue principale
- `EcartCard` - Carte individuelle
- `EvaluationPACModal` - Évaluation 6 critères
- `HistoriqueEcartModal` - Timeline
- `SoumissionPACModal` - Soumission exploitant

### 📦 Utilitaires
- `plansActionsUtils.ts` - Calculs C2/C4
- Gestion complète des statuts PAC
- Notifications multi-canaux

### 🔄 Workflow
- Ouvert → PAC attendu → PAC soumis → Évalué → Preuves → Clôture
- Rappels automatiques J-7, J-3, J-1

---

## [S11] - Surveillance Module - 2026-03-12

### ✅ Modules créés
- `SurveillanceModule` complet
- Checklist avec signatures
- Rédaction des écarts
- Génération de rapport
- Lettre de transmission

---

## [S10] - Planning Module - 2026-03-12

### ✅ Modules créés
- `PlanningModule` avec vues calendrier/liste
- Génération N+1 basée sur risque
- Bouton "Exécuter" vers surveillance

---

## [S09] - Certification & Homologation - 2026-03-11

### ✅ Modules créés
- `CertificationModule` (5 phases)
- `HomologationModule` (3 phases)
- Signature DG ANACIM
- Documents upload

---

## [S08] - Aérodromes Module - 2026-03-10

### ✅ Modules créés
- `AerodromesModule` CRUD complet
- Fiche détail 7 onglets
- Carte Leaflet interactive
- Suppression en cascade

---

## [S07] - Dashboard Modules - 2026-03-09

### ✅ Modules créés
- `DashboardModule` (admin/inspector)
- `DgDashboardModule` (DG ANACIM)
- KPIs interactifs
- Graphiques Chart.js

---

## [S06] - Signature & Store - 2026-03-08

### ✅ Composants
- `SignaturePad` avec Canvas
- Export PNG/PDF
- Upload Supabase Storage

### 📦 Store
- Architecture Zustand complète
- Persistance locale
- Notifications

---

## [S05] - Risque & Prédiction - 2026-03-07

### ✅ Fonctions
- Calcul C1 à C5
- Score global pondéré
- Prédiction 3/6 mois
- Génération planning N+1

---

## [S04] - Layout & Navigation - 2026-03-06

### ✅ Composants layout
- `AppShell`
- `TimerBar`
- `AppHeader`
- `AppNav`
- `Breadcrumb`

---

## [S03] - Design System - 2026-03-05

### ✅ CSS
- Variables par rôle
- Classes utilitaires
- Animations
- Dark mode

---

## [S02] - Auth & Config - 2026-03-04

### ✅ Authentification
- Login email/mot de passe
- Gestion des rôles
- data-role sur body

### 📦 Configuration
- ROLES et PERMISSIONS
- Constantes métier

---

## [S01] - Initialisation - 2026-03-03

### ✅ Setup
- Next.js 14 avec App Router
- Tailwind CSS
- shadcn/ui
- Supabase client
- Structure de dossiers