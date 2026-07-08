-- ============================================================
-- SGDA V5 — Table ia_model_state pour les poids des modèles ML
-- Persistance durable des modèles entraînés (Bayesian, LSTM, XGBoost, RF, Ensemble)
-- ============================================================
-- Compatible CQL: safe à ré-exécuter (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS ia_model_state (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Clé unique : modèle + aérodrome (optionnel)
  model_name    TEXT NOT NULL,
  aerodrome_id  UUID REFERENCES aerodromes(id) ON DELETE CASCADE,

  -- Version du modèle
  version       INTEGER NOT NULL DEFAULT 1,

  -- Poids et paramètres (JSON)
  weights       JSONB NOT NULL DEFAULT '{}',
  biases        JSONB NOT NULL DEFAULT '{}',

  -- Métriques
  total_feedbacks  INTEGER NOT NULL DEFAULT 0,
  accuracy_history  JSONB NOT NULL DEFAULT '[]',
  learning_rate    NUMERIC NOT NULL DEFAULT 0.05,

  -- Données spécifiques au modèle (ex: aerodrome_specific pour Bayesian)
  model_data    JSONB NOT NULL DEFAULT '{}',

  -- Flag actif
  actif         BOOLEAN NOT NULL DEFAULT true,

  UNIQUE(model_name, aerodrome_id)
);

CREATE INDEX IF NOT EXISTS idx_ia_model_state_model ON ia_model_state(model_name);
CREATE INDEX IF NOT EXISTS idx_ia_model_state_aerodrome ON ia_model_state(aerodrome_id);

CREATE OR REPLACE FUNCTION trigger_ia_model_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ia_model_state_updated_at ON ia_model_state;
CREATE TRIGGER trg_ia_model_state_updated_at
  BEFORE UPDATE ON ia_model_state
  FOR EACH ROW EXECUTE FUNCTION trigger_ia_model_state_updated_at();

ALTER TABLE ia_model_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_model_state_select_all ON ia_model_state;
CREATE POLICY ia_model_state_select_all ON ia_model_state
  FOR SELECT USING (get_user_role() IN ('admin','super_admin','inspecteur','operateur'));

DROP POLICY IF EXISTS ia_model_state_insert_admin ON ia_model_state;
CREATE POLICY ia_model_state_insert_admin ON ia_model_state
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','super_admin'));

DROP POLICY IF EXISTS ia_model_state_update_admin ON ia_model_state;
CREATE POLICY ia_model_state_update_admin ON ia_model_state
  FOR UPDATE USING (get_user_role() IN ('admin','super_admin'));
