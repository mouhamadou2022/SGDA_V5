-- ============================================================
-- Migration 2026-08-02 — Import wizard checklist
-- Familles métier, régime de surveillance, audit utilisateur,
-- nouveaux types (HMG, COP, AUT)
-- ============================================================

-- 1. Élargir CHECK(type) : + HMG (homologation), COP (certification COP), AUT (autres)
ALTER TABLE checklist_templates DROP CONSTRAINT IF EXISTS checklist_templates_type_check;
ALTER TABLE checklist_templates ADD CONSTRAINT checklist_templates_type_check
  CHECK (type IN ('IT', 'SOP', 'QSC', 'SGS', 'VALIDATION_SITE', 'HMG', 'COP', 'AUT'));

-- 2. Nouvelle colonne categorie (famille métier guidée à l'import)
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS categorie text
  NOT NULL DEFAULT 'autres'
  CHECK (categorie IN ('homologation', 'certification', 'surveillance_continue', 'validation_site', 'autres'));

-- 3. Nouvelle colonne regime (surveillance continue : certifié vs homologué)
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS regime text
  NOT NULL DEFAULT 'tous'
  CHECK (regime IN ('certifie', 'homologue', 'tous'));

-- 4. updated_by (utilisateur de la dernière modification)
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. Index de filtrage
CREATE INDEX IF NOT EXISTS idx_checklist_templates_categorie ON checklist_templates (categorie);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_regime     ON checklist_templates (regime);

-- 6. Unicité : un seul template ACTIF par (type, code), mais plusieurs
--    versions archivées possibles → remplace la contrainte UNIQUE(type,code,version)
ALTER TABLE checklist_templates DROP CONSTRAINT IF EXISTS uq_checklist_template;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_template_active
  ON checklist_templates (type, code) WHERE actif = true;

-- Commentaires
COMMENT ON COLUMN checklist_templates.type       IS 'Préfixe de code : IT=Inspection Technique, SOP=Procédures, QSC=Surveillance Continue, SGS=PAOE, VALIDATION_SITE=Validation site, HMG=Homologation, COP=COP, AUT=Autres';
COMMENT ON COLUMN checklist_templates.categorie  IS 'Famille métier guidée à l''import : homologation | certification | surveillance_continue | validation_site | autres';
COMMENT ON COLUMN checklist_templates.regime     IS 'Régime (surveillance continue) : certifie | homologue | tous';
COMMENT ON COLUMN checklist_templates.updated_by IS 'Utilisateur ayant effectué la dernière modification';
