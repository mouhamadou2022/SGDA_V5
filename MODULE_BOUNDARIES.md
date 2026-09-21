# Frontières du monolithe modulaire — SGDA V5 (Phase 1)

> Vision architecte : chaque module est indépendant, sauf **partage** (noyau),
> **synchronisation** (événements) et **transfert de flux** (contrats typés).
> Ce document décrit l'état **mesuré** (pas souhaité). L'application est
> `eslint-rules/sgda-boundaries.mjs` — toute violation est une **erreur de build**.

## Règle 1 — Imports inter-modules UI (erreur `sgda/module-boundaries`)

Un fichier sous `components/modules/<A>/` ne peut importer `components/modules/<B>/`
que si le couple est déclaré dans `CROSS_MODULE_ALLOW`. État mesuré :

| Module | Peut importer |
|---|---|
| certification | signatures, exemptions |
| homologation | archive, certification, exemptions, signatures |
| surveillance | checklist, signatures |
| portail-exploitant | certification, dashboard, plans-actions, profil-risque |
| profil-risque | amdec |
| ml-monitoring | profil-risque |
| tous les autres | rien (autonomes côté UI) |

Aucun cycle A→B→A détecté. Partagés légitimes (hors règle) : `components/ui`,
`components/forms`, `components/cards`, `components/ia`, `lib/*`.

## Règle 2 — Couche persistance (erreur `sgda/data-layer`)

Cible : **UI → store → datastore**. Seuls ces modules gardent un accès direct
(dette documentée, à re-router via le store) : `certification`,
`kit-inspecteur`, `messagerie`, `portail-exploitant`, `surveillance`.

## Règle 3 — Noyau partagé (lecture seule)

Ne pas dupliquer : `lib/planning.ts` (référentiel planning),
`lib/utils.ts` (scores SGS 0-100, maturité), `lib/config.ts` (seuils risque),
`lib/domaines.ts` (domaines, spécialités).

## Pattern d'extraction des slices (Phase 2+)

Référence : `lib/store/exemptionsSlice.ts` + test `lib/__tests__/exemptionsSlice.test.ts`.
- Types + interface + `createExemptionsSlice: StateCreator<AppStore, [], [], XSlice>` dans `lib/store/<nom>Slice.ts` (ne touche que ses clés, type-only import du store).
- `lib/store.ts` : importe le créateur, étale `...createXSlice(set, get, api)`, réexporte les types (importateurs `@/lib/store` inchangés).
- Hooks React restant dans `lib/store.ts` (cycle d'import interdit dans le slice).
- Test-contrat : slice isolé via `zustand/vanilla` (aucune dépendance Supabase/IDB).

## Synchronisation par événements (Phase 3 — en place)

`lib/store/eventBus.ts` (typé, synchrone, testé) : les slices ÉMETTENT,
seul `registerStoreSubscriptions()` (bas de `lib/store.ts`) S'ABONNE.

| Événement | Émetteurs | Abonné (propriétaire) |
|---|---|---|
| `risque:recalcul-demande` | aerodromes, amdec, certification, ecarts, evenements, homologation | profils (recalcul) |
| `planning:mission-terminee` | workflow (transmission, archivage) | plannings (`marquerMissionTerminee`) |
| `planning:mission-annulee` | surveillances (suppression) | plannings (`restaurerMissionAnnulee`) |
| `notification:envoyer` | ~66 sites (tous les slices) | notifications (`addNotification`) |
| `registre:ajouter` | certifications, homologations (archivage), workflow (transmission) | registres (`addRegistreEntry`) |
| `message:envoyer` | kit (partage) | messagerie (`envoyerMessage`) |
| `utilisateur:supprimer-lie` / `utilisateur:desactiver` | codesAcces (création, révocation, suppression) | utilisateurs (`deleteUtilisateur` + repli désactivation centralisé) |
| `inspecteur:synchroniser` | utilisateurs (`updateUtilisateur`) | formations (`updateInspecteur`) |
| `ecart:integrer-externe` | evenements (création liée) | ecarts (`integrerEcartExterne`, idempotent) |
| `planning:marquer-rappels` | surveillances (rappels) | plannings (`marquerRappelsEnvoyes`) |
| `certification/homologation:nettoyer-lien-surveillance` | surveillances (suppression) | certifications/homologations (nettoyage phase) |
| `certification/homologation:nettoyer-lien-planning` | plannings (suppression) | certifications/homologations (nettoyage phase) |

Zéro appel direct `get().autreTranche()` restant hors exceptions ci-dessous
(vérifié par grep ; les lectures `get().x` pures restent autorisées).
Exceptions documentées : appels intra-tranche (ex. `updateCertification`
dans `nettoyerLienPlanningCertification`) ; SAGA `workflowSlice`
(`updateSurveillance`, `addEcart`/`updateEcart`, `updateDelegation` —
coordination awaited : la transmission doit finir d'écrire avant de
continuer, un événement fire-and-forget casserait la persistance).
Logique pure du workflow extraite dans `lib/workflow/` et testée
(`extractionEcarts`, `reglesSignature`, `conversionEcarts` —
`lib/__tests__/workflowLogic.test.ts`) ; le slice ne fait
qu'orchestrer. Réparation legacy (`reparerEcartsManquants`) volontairement
non fusionnée avec la transmission (fallbacks IDB/références).

## Contrats de flux (Phase 3)

`lib/flux.ts` : barème unique des délais PAC/régularisation + normalisation
d'identifiants, utilisés par les 2 conversions brouillon→officiel (transmission
et réparation — volontairement non fusionnées : différences métier). Testé
(`lib/__tests__/flux.test.ts`).

## Données partagées (Phase 3)

Exemptions persistées serveur : SECTION 25 de `SGDA_v5_FINAL_COMPLET.sql`
(fichier schéma unique — à appliquer sur la base), CRUD dans `lib/datastore.ts`, chargement
dans `loadInitialData` + fusion dans `app/page.tsx`, sync best-effort dans le
slice, cron `recalculate-risk` lit la table (convergence C3 complète).
Délégations persistées (table pré-existante, ni lue ni écrite avant) : CRUD
`lib/datastore.ts` (`marshalDelegation` retire `assigne_nom`, champ local
sans colonne), `loadInitialData` + fusion `app/page.tsx`, sync best-effort.
Enquêtes + réponses persistées : nouvelles tables SECTION 26 (`enquetes`,
`reponses_enquetes`, RLS + politiques), CRUD + `loadInitialData` + fusion,
sync best-effort (`unmarshalReponseEnquete` reconvertit `NUMERIC` → nombre).
Restent 100 % locales : propositions N+1, suggestions IA, checklist volatile,
mémoires IA.

## Découpage composants (Phase 3 — en cours, extraction prop-driven, zéro logique changée)

- `planning/PlanningModule.tsx` (2441 → ~1620) : extraits `planningDates.ts`
  (helpers dates purs), `PlanningModals.tsx` (5 modales : suppression,
  exécution, formulaire, suggestions IA, feedback), `PlanningTableColumns.tsx`
  (`TablePlanning` + `buildPlanningTableColumns`, mêmes permissions/callbacks),
  `useLancerSurveillance.ts` (orchestration lancement, mêmes gardes/notifs) +
  `useIaSuggestions.ts` (cluster suggestions/assistant/feedback) +
  `lib/planning-lancement.ts` (10 briques pures testées :
  `lib/__tests__/planningLancement.test.ts`, dont `buildPlanningFromSuggestion`
  qui déduplique valider/ajuster).
- `lib/ecarts-rappels.ts` (décisions pures : retard, rappels J, délais
  inspecteur, couleur délai) + `lib/__tests__/ecartsRappels.test.ts` ;
  `ecartsSlice` applique (set/emit). Lint slice : 14 → 12 erreurs
  `no-explicit-any` pré-existantes, 0 nouvelle.
- Vigies propriétaires : `verifierRappelsAutomatiques` (écarts + dossiers +
  plannings mélangés) scindé en `verifierRappelsEcarts` (écarts),
  `verifierRappelsDossiers` (dossiers) et `verifierPlanningsDepasses`
  (plannings) ; décisions pures dossiers/plannings dans `lib/vigie.ts` +
  `lib/__tests__/vigie.test.ts`. Les 2 appelants (timer `lib/store.ts`,
  `PlansActionsModule`) appellent les trois. Lint 3 slices : 34 → 32
  problèmes (que du pré-existant).
  Supprimé `getSurveillanceBadge` (code mort : défini, jamais appelé).
- `lib/workflow/` (saga mince) : `extractionEcarts`, `reglesSignature`,
  `conversionEcarts` + `lib/__tests__/workflowLogic.test.ts` ; le slice
  n'orchestre que des écritures awaited (un event fire-and-forget casserait
  la persistance — pattern saga documenté dans l'en-tête du slice).
- `lib/store/ecartsTypes.ts` : les 7 interfaces du domaine Écarts extraites
  de `ecartsSlice.ts` (1365 → ~1150) ; `eventBus.ts` importe depuis les types.
- `useIaSuggestions.ts` + `buildPlanningFromSuggestion`/`buildExportCSV`
  (`lib/planning-lancement.ts`, testés) : cluster IA extrait de
  `PlanningModule` (~1620 → ~1470, déduplication valider/ajuster).
- Non découpés (volontaire, rendement nul) : `PreparationModal` (880),
  `SmartAssignment` (784) — un composant par fichier déjà, helpers purs
  déjà factorisés en tête de fichier, onglets/états profondément couplés.
- `aerodromes/aerodromesExport.ts` : exports PDF liste + fiche extraits de
  `AerodromesModule.tsx` (910 → ~670), dépendances explicites.
- `aerodromes/AerodromeDetail.tsx` (1124 → ~350) : préparation des données
  (store, memos, effet IA, coquille header/onglets/footer) conservée ; les
  8 panneaux extraits dans `AerodromeDetailTabs.tsx` + `toDMS`/`MiniMap`
  déplacés avec l'onglet Infos ; dérivations IA recalculées dans
  `OngletRisque`. Lint : 24 → 17 problèmes (16 erreurs pré-existantes
  déplacées verbatim, 0 nouvelle).

## État du découpage (Phase 2 — terminé)

`lib/store.ts` : 9265 → ~820 lignes. Zéro interface `*Slice` inline restante.
42 tranches dans `lib/store/*Slice.ts` (+ `kitTypes.ts`), composées dans
le store via `...createXSlice(set, get, api)` — même instance, même état,
même persistance. Chaque tranche : types + interface + créateur + tests-contrat
(`lib/__tests__/storeSlices*.test.ts`, `*Slice.test.ts`).

## Processus

1. Nouvelle dépendance ? → entrée dans `sgda-boundaries.mjs` + **revue architecte**.
2. Fin de phase → reviewer : `npx tsc --noEmit --incremental false` (le
   `npm run typecheck` incrémental MASQUE les erreurs des fichiers inchangés —
   constaté puis corrigé : `TypeSurveillanceKit` désormais alias de
   `TypeInspection`, casts retirés, runtime inchangé) + `npx eslint
   components/modules/` (zéro `sgda/`) + tests du module + smoke-test des
   4 workflows si code partagé touché.
3. Interdit : patch contournant une règle, code mort, import relatif qui fuit son module.
