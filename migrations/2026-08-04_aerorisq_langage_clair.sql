-- Migration 2026-08-04 — AERORISQ apprend le « langage clair »
-- Persiste les échanges langage clair IA générés sur les vues exploitant / DG
-- (texte final + contexte chiffré + indicateur fallback + vote exploitant) et
-- alimente le dataset d'entraînement quotidien de l'IA maison AERORISQ.
--
-- Table 1 : ia_langage_clair — chaque texte « en langage clair » affiché.
--   Le texte est dédoublonné par (module, texte_hash) : un même texte n'est
--   stocké qu'une fois, un vote ultérieur met simplement à jour la ligne.
-- Table 2 : ia_training_dataset — exemples validés (vote 'up' + non-fallback)
--   constituant la base d'entraînement de l'IA maison.
-- Table 3 : ia_training_logs — journal des runs du cron quotidien.

CREATE TABLE IF NOT EXISTS ia_langage_clair (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module      text NOT NULL,
  texte_hash  text NOT NULL,
  aerodrome_id text,
  contexte    jsonb,
  texte       text NOT NULL,
  fallback_ia boolean NOT NULL DEFAULT false,
  vote        text CHECK (vote IN ('up', 'down')),
  user_id     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module, texte_hash)
);

CREATE TABLE IF NOT EXISTS ia_training_dataset (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module      text NOT NULL,
  texte_hash  text NOT NULL,
  contexte    jsonb,
  texte       text NOT NULL,
  fallback_ia boolean NOT NULL DEFAULT false,
  vote        text CHECK (vote IN ('up', 'down')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module, texte_hash)
);

CREATE TABLE IF NOT EXISTS ia_training_logs (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type     text NOT NULL,
  resume   jsonb,
  run_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_langage_clair_module  ON ia_langage_clair (module);
CREATE INDEX IF NOT EXISTS idx_ia_langage_clair_created ON ia_langage_clair (created_at);
CREATE INDEX IF NOT EXISTS idx_ia_training_logs_type    ON ia_training_logs (type, run_at);
