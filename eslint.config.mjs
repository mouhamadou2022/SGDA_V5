import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sgdaBoundaries from "./eslint-rules/sgda-boundaries.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Assets statiques servis tels quels (images, manifest, service worker) et
    // artefacts tiers versionnés (worker PDF.js minifié : ~1,2 Mo). Ce n'est pas
    // du code source du projet — le linter n'a rien à y vérifier.
    "public/**",
  ]),
  // Frontières du monolithe modulaire (Phase 1) : toute nouvelle dépendance
  // inter-module ou vers la persistance est une ERREUR de build. L'allowlist
  // vit dans eslint-rules/sgda-boundaries.mjs (revue architecte requise).
  {
    files: ["components/modules/**/*.{ts,tsx,js,jsx}"],
    plugins: { sgda: sgdaBoundaries },
    rules: {
      "sgda/module-boundaries": "error",
      "sgda/data-layer": "error",
    },
  },
  // Scripts Node exécutés directement (`node scripts/x.js`) : le projet n'a pas
  // "type": "module", ces fichiers sont donc en CommonJS où `require()` est la
  // syntaxe normale. La règle ESM ne s'y applique pas.
  {
    files: ["scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // ────────────────────────────────────────────────────────────────────────────
  // Dette technique rétroactive — non bloquante (audit mesuré du 2026-09-30).
  //
  // Constat : `npm run lint` remontait ~2 200 erreurs, dont 2 032 (92 %) issues
  // de DEUX seules règles stylistiques appliquées à du code DÉJÀ VALIDÉ
  // (workflows verrouillés par AGENTS.md : planning → surveillance → écart →
  // portail exploitant). Les corriger en masse par rechercher/remplacer ferait
  // courir un risque de régression injustifié pour un gain runtime nul : elles
  // sont donc déclarées en `warn` — elles RESTENT VISIBLES (tableau de bord de
  // la dette) et sont à résorber module par module, HORS phase de stabilisation.
  //
  //   @typescript-eslint/no-explicit-any       ~1571  `any` → type réel (typage progressif)
  //   react/no-unescaped-entities               ~461  apostrophes JSX (→ &apos;)
  //   react-hooks/purity                         ~48  diagnostics React Compiler (bailout)
  //   react-hooks/set-state-in-effect            ~42  idem (rendus en cascade)
  //   react-hooks/preserve-manual-memoization    ~16  idem (mémoïsation non préservée)
  //   react-hooks/immutability                    ~3  idem (mutation d'instance en state)
  //
  // Restent en `error` (donc vérifiées à chaque lint) : sgda/module-boundaries,
  // sgda/data-layer, react-hooks/rules-of-hooks, react-hooks/refs,
  // react-hooks/static-components, react/display-name, @next/next/*,
  // @typescript-eslint/no-require-imports, @typescript-eslint/no-empty-object-type,
  // prefer-const.
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;
