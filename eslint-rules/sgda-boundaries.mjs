// eslint-rules/sgda-boundaries.mjs
// Règles locales SGDA — frontières du monolithe modulaire.
// SOURCE UNIQUE des dépendances autorisées : toute nouvelle dépendance
// inter-module ou vers la persistance exige une entrée ici + revue architecte.
// Voir MODULE_BOUNDARIES.md (vision) — ce fichier est l'application (vivant :
// chargé par eslint.config.mjs, jamais du code mort).
//
// Périmètre : fichiers sous components/modules/<module>/.
// - module-boundaries : interdit d'importer un AUTRE module sauf allowlist.
// - data-layer : interdit d'importer @/lib/datastore depuis l'UI sauf allowlist
//   (cible : UI → store → datastore ; les entrées existantes sont de la dette
//   documentée, à re-router via le store dans les phases suivantes).

import path from "node:path";

// module -> modules qu'il a le droit d'importer (état mesuré, pas souhaité)
export const CROSS_MODULE_ALLOW = {
  certification: ["signatures", "exemptions"],
  homologation: ["archive", "certification", "exemptions", "signatures"],
  surveillance: ["checklist", "signatures"],
  "portail-exploitant": ["certification", "dashboard", "plans-actions", "profil-risque"],
  "profil-risque": ["amdec"],
  "ml-monitoring": ["profil-risque"],
};

// Modules UI autorisés (temporairement) à appeler lib/datastore directement.
// Dette documentée : re-router via le store (uploadFile, subscribe, lectures).
export const DATASTORE_ALLOW = new Set([
  "certification",
  "kit-inspecteur",
  "messagerie",
  "portail-exploitant",
  "surveillance",
]);

function moduleOfFile(filename) {
  const norm = filename.split(path.sep).join("/");
  const m = norm.match(/components\/modules\/([^/]+)\//);
  return m ? m[1] : null;
}

function targetModuleOfImport(source, filename) {
  if (typeof source !== "string") return null;
  let m = source.match(/^@\/components\/modules\/([^/]+)\//);
  if (m) return m[1];
  if (source.startsWith(".")) {
    const dir = filename.split(path.sep).join("/").replace(/\/[^/]*$/, "");
    const resolved = path.posix.normalize(`${dir}/${source}`);
    m = resolved.match(/components\/modules\/([^/]+)\//);
    if (m) return m[1];
    if (/(^|\/)lib\/datastore(\.|$)/.test(resolved)) return "@datastore";
  }
  if (source === "@/lib/datastore" || source === "lib/datastore") return "@datastore";
  return null;
}

function isDatastoreTarget(source, filename) {
  return targetModuleOfImport(source, filename) === "@datastore";
}

function checkNode(context, node, source) {
  const filename = context.filename ?? context.getFilename();
  const fromMod = moduleOfFile(filename);
  if (!fromMod) return;
  const target = targetModuleOfImport(source, filename);
  // "@datastore" est du ressort exclusif de la règle data-layer (pas de double signalement).
  if (!target || target === fromMod || target === "@datastore") return;
  const allowed = CROSS_MODULE_ALLOW[fromMod] || [];
  if (!allowed.includes(target)) {
    context.report({
      node,
      message:
        `Import inter-module non déclaré : "${fromMod}" → "${target}". ` +
        `Ajouter la dépendance à CROSS_MODULE_ALLOW dans eslint-rules/sgda-boundaries.mjs ` +
        `(revue architecte requise) ou passer par le noyau partagé.`,
    });
  }
}

function literalSource(node) {
  if (node.source && node.source.type === "Literal") return node.source;
  return null;
}

const moduleBoundariesRule = {
  meta: { type: "problem", docs: { description: "Interdit les imports inter-modules non déclarés" }, schema: [] },
  create(context) {
    return {
      ImportDeclaration(node) {
        const src = literalSource(node);
        if (src) checkNode(context, src, src.value);
      },
      ExportNamedDeclaration(node) {
        const src = literalSource(node);
        if (src) checkNode(context, src, src.value);
      },
      ExportAllDeclaration(node) {
        const src = literalSource(node);
        if (src) checkNode(context, src, src.value);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") {
          checkNode(context, node.source, node.source.value);
        }
      },
      TSImportType(node) {
        if (node.argument && node.argument.type === "Literal") {
          checkNode(context, node.argument, node.argument.value);
        }
      },
    };
  },
};

const dataLayerRule = {
  meta: { type: "problem", docs: { description: "Interdit l'accès direct à lib/datastore depuis l'UI" }, schema: [] },
  create(context) {
    const check = (node, value) => {
      const filename = context.filename ?? context.getFilename();
      const fromMod = moduleOfFile(filename);
      if (!fromMod) return;
      if (isDatastoreTarget(value, filename) && !DATASTORE_ALLOW.has(fromMod)) {
        context.report({
          node,
          message:
            `Accès direct à la persistance interdit depuis le module "${fromMod}". ` +
            `Passer par le store (UI → store → datastore). ` +
            `Dérogation existante à documenter dans DATASTORE_ALLOW (revue architecte requise).`,
        });
      }
    };
    return {
      ImportDeclaration(node) {
        const src = literalSource(node);
        if (src) check(src, src.value);
      },
      ExportNamedDeclaration(node) {
        const src = literalSource(node);
        if (src) check(src, src.value);
      },
      ExportAllDeclaration(node) {
        const src = literalSource(node);
        if (src) check(src, src.value);
      },
      ImportExpression(node) {
        if (node.source && node.source.type === "Literal") check(node.source, node.source.value);
      },
    };
  },
};

export default {
  rules: {
    "module-boundaries": moduleBoundariesRule,
    "data-layer": dataLayerRule,
  },
};
