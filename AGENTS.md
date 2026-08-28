# Agent Context — SGDA V5

## Conventions de design

### Composant Card (`components/ui/card.tsx`)
- **Unique composant de carte** à utiliser dans tous les modules.
- Variantes :
  - `role` (défaut) — bordure gauche `role-primary`, header avec dégradé.
  - `level` — bordure gauche colorée selon `levelColor` (`danger`, `warning`, `primary`, `success`).
  - `alert` — fond pastel selon `alertBg` (90/10). À réserver aux alertes critiques.
- **Texte** : `text-foreground` (noir) partout, sauf labels très secondaires.
- Ne jamais utiliser `text-muted-foreground` pour du contenu principal.

### Pondération C1-C5
- Les poids par défaut sont **C1:20, C2:25, C3:20, C4:20, C5:15** (`DEFAULT_WEIGHTS` dans `lib/ia/weightController.ts`).
- `calculateGlobalScore()` dans `lib/risque.ts` accepte un paramètre `weights` optionnel. Sans lui, utilise les défauts.
- Le cron `recalculate-risk` charge les poids appris depuis `ia_thresholds` avant d'appeler `calculateGlobalScore`.
- Ne jamais hardcoder les poids dans `calculateGlobalScore` — toujours passer par le paramètre `weights`.
- Fichiers de référence : `lib/risque.ts`, `lib/risque/bowTieEngine.ts`, `lib/ia/weightController.ts`.

### Niveaux de risque
- Utiliser `getRiskLevel(score)` (minuscules : `critique`, `eleve`, `moyen`, `faible`).
- Mapper vers les classes CSS via `RISK_LEVELS` (`lib/risque.ts`).

### Maturité SGS
- Afficher le label `getSgsMaturiteLabel(c1)` (N1-N5) partout où C1 est présenté.

## Fichiers critiques
- `lib/risque.ts` — logique de calcul du score global et pondération.
- `components/ui/card.tsx` — composant carte unique.
- `lib/ia/index.ts` — logique des agents IA (ne pas inverser les conditions).
- `SGDA_v5_FINAL_COMPLET.sql` — **schéma de référence unique** (source de vérité DB). Les anciens fichiers migrations/ ont été archivés puis supprimés (tout y est consolidé).

### TypeInspection (`lib/checklistMemory.ts`)
- Type union pour `type_inspection` : `periodique`, `inopine`, `maintien`, `certification`, `homologation`, `suivi_ecarts`, `mise_oeuvre_pac`, `programmee`, `inopinee`, `speciale`, `surveillance`, `evenement`, `audit_complet`, `urgence`, `ecart`.
- Utilisé dans `ItemHistoryRecord`, `upsertItemHistory`, `getPredictionForItem`, `recordCorrection`, `recordTextModification`, `getSuggestionsDetaillees`.
- Toujours passer le type réel de la surveillance — ne jamais hardcoder `'programmee'`.
- Les 4 hardcodes `'programmee'` ont été corrigés : `checklistAgent.ts` (3) et `learningEngine.ts` (1).
- `TypeSurveillanceKit` (`kitDocAgent.ts`) aligné avec `TypeInspection` (inclut certification, homologation).

## Développement en phases — Isolation des modules validés (CRITIQUE)

> Règle n°1 : **on vérrouille ce qui marche et on ne casse JAMAIS un workflow validé.**
> Phase actuelle : test de 4 workflows — **planning → surveillance → écart → portail exploitant**.
> Pendant cette phase on n'AJOUTE rien : on s'assure que ces workflows fonctionnent, on les corrige, on ne les touche que si nécessaire.

### Modules / workflows « verrouillés » (à préserver absolument)
- **Planning** (création/planification des surveillances).
- **Surveillance** (déroulement, checklist, redaction).
- **Écart** (`/ecarts` et `/ecarts/sgs`, composant `SurveillanceEcartsRedaction`, suggestion IA watch-dog).
- **Portail exploitant** (modules qui se voient côté exploitant).

### Règles obligatoires
1. **Ne rien casser** : avant toute modification, vérifier si le fichier / la fonction touchée est **partagée** par d'autres workflows :
   - `lib/store.ts` (store Zustand global, ~9000 lignes — le plus sensible).
   - `lib/datastore.ts` (couche Supabase/IDB).
   - Composants communs dans `components/` et `components/ui/`.
   - Fichiers critiques listés ci-dessus (`lib/risque.ts`, `components/ui/card.tsx`, `lib/ia/index.ts`, `SGDA_v5_FINAL_COMPLET.sql`).
   Si oui → changement à forte attention régression.
2. **Non-régression obligatoire** : après tout changement touchant du code partagé, rejouer le smoke-test des 4 workflows validés avant de considérer la tâche faite.
3. **Smoke-test des 4 workflows** (à exécuter manuellement après modif du code partagé) :
   - Planning → créer/planifier une surveillance.
   - Surveillance → ouvrir la surveillance, dérouler la checklist.
   - Écart → rédiger un écart (IA) sur `/ecarts` et `/ecarts/sgs`, sauvegarder, recharger la page (les brouillons doivent réapparaître).
   - Portail exploitant → vues côté exploitant accessibles et cohérentes.
4. **Pendant une phase de test, on n'ajoute pas de fonctionnalités nouvelles non demandées** : uniquement corrections/bugfix des workflows en cours.
5. Toute modification doit passer `npm run typecheck` + le smoke-test ci-dessus avant d'être considérée terminée.

### Architecture (réflexion en cours — pas d'exécution pendant la stabilisation)
On vise, à terme, un découplage progressif pour réduire le couplage (le store global et le datastore sont les points de friction principaux). **Ce refactor n'est PAS à faire pendant la phase de stabilisation/test** — il sera traité séparément une fois les workflows validés.

## Build
- `npm run typecheck` doit passer sans erreur avant tout commit.

## GitHub Actions
- La branche par défaut est **`main`**, pas `master`.
- Les workflows ne sont détectés que depuis `main`. Toujours pousser sur `main` :
  `git push origin master:main` (ou merger master dans main).
