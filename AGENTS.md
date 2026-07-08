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
- Uniforme dans tout le système : **C1:20, C2:25, C3:20, C4:20, C5:15**.
- Fichiers de référence : `lib/risque.ts`, `lib/risque/bowTieEngine.ts`.

### Niveaux de risque
- Utiliser `getRiskLevel(score)` (minuscules : `critique`, `eleve`, `moyen`, `faible`).
- Mapper vers les classes CSS via `RISK_LEVELS` (`lib/risque.ts`).

### Maturité SGS
- Afficher le label `getSgsMaturiteLabel(c1)` (N1-N5) partout où C1 est présenté.

## Fichiers critiques
- `lib/risque.ts` — logique de calcul du score global et pondération.
- `components/ui/card.tsx` — composant carte unique.
- `lib/ia/index.ts` — logique des agents IA (ne pas inverser les conditions).

## Build
- `npm run typecheck` doit passer sans erreur avant tout commit.

## GitHub Actions
- La branche par défaut est **`main`**, pas `master`.
- Les workflows ne sont détectés que depuis `main`. Toujours pousser sur `main` :
  `git push origin master:main` (ou merger master dans main).
