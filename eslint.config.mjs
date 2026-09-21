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
]);

export default eslintConfig;
