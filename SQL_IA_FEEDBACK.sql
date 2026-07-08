-- ============================================================
-- SGDA V5 — Table ia_feedback pour l'apprentissage continu AERORISQ
-- Persistance durable des feedbacks des engines décisionnels
-- ============================================================
-- Compatible CQL: safe à ré-exécuter (IF NOT EXISTS / OR REPLACE)

-- 1. TABLE ia_feedback
CREATE TABLE IF NOT EXISTS ia_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Engine qui a produit la décision
  engine_type   TEXT NOT NULL CHECK (engine_type IN ('riskProfile','compliance','recommendation','certificate','team')),

  -- Contexte
  aerodrome_id  UUID REFERENCES aerodromes(id) ON DELETE CASCADE,
  planning_id   UUID REFERENCES plannings(id) ON DELETE SET NULL,
  surveillance_id UUID REFERENCES surveillances(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,  -- qui a voté

  -- Décision originale
  decision_type TEXT NOT NULL,
  decision_data JSONB DEFAULT '{}',

  -- Feedback
  vote          TEXT NOT NULL CHECK (vote IN ('pertinent','non_pertinent','partiellement')),
  commentaire   TEXT,

  -- Flag de synchro
  synced_at     TIMESTAMPTZ
);

-- Index pour les requêtes par aérodrome + engine
CREATE INDEX IF NOT EXISTS idx_ia_feedback_aerodrome ON ia_feedback(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_ia_feedback_engine ON ia_feedback(engine_type);
CREATE INDEX IF NOT EXISTS idx_ia_feedback_user ON ia_feedback(user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trigger_ia_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ia_feedback_updated_at ON ia_feedback;
CREATE TRIGGER trg_ia_feedback_updated_at
  BEFORE UPDATE ON ia_feedback
  FOR EACH ROW EXECUTE FUNCTION trigger_ia_feedback_updated_at();

-- 2. RLS
ALTER TABLE ia_feedback ENABLE ROW LEVEL SECURITY;

-- Lecture : admin et inspecteurs voient tout, operateurs voient leur aérodrome
DROP POLICY IF EXISTS ia_feedback_select_all ON ia_feedback;
CREATE POLICY ia_feedback_select_all ON ia_feedback
  FOR SELECT USING (
    get_user_role() IN ('admin','super_admin','inspecteur')
    OR (
      get_user_role() = 'operateur'
      AND aerodrome_id IN (
        SELECT aerodrome_id FROM utilisateurs WHERE id = auth.uid()
      )
    )
  );

-- Écriture : tout utilisateur authentifié peut créer un feedback
DROP POLICY IF EXISTS ia_feedback_insert_all ON ia_feedback;
CREATE POLICY ia_feedback_insert_all ON ia_feedback
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Mise à jour : seul l'auteur ou admin peut modifier
DROP POLICY IF EXISTS ia_feedback_update_owner ON ia_feedback;
CREATE POLICY ia_feedback_update_owner ON ia_feedback
  FOR UPDATE USING (
    user_id = auth.uid()
    OR get_user_role() IN ('admin','super_admin')
  );

-- 3. Vue aggrégée pour le tableau de bord AERORISQ
CREATE OR REPLACE VIEW v_ia_feedback_stats AS
SELECT
  aerodrome_id,
  engine_type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE vote = 'pertinent') AS pertinents,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE vote = 'pertinent')::numeric / COUNT(*) * 100)
    ELSE 0
  END AS taux_pertinence,
  MAX(created_at) AS dernier_feedback
FROM ia_feedback
GROUP BY aerodrome_id, engine_type;

-- ============================================================
-- 4. TABLE ia_thresholds — seuils dynamiques persistés
-- ============================================================
CREATE TABLE IF NOT EXISTS ia_thresholds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  parametre     TEXT NOT NULL UNIQUE,
  valeur        NUMERIC NOT NULL,
  engine        TEXT NOT NULL DEFAULT 'recommendation',
  raison        TEXT,
  actif         BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_ia_thresholds_engine ON ia_thresholds(engine);
CREATE INDEX IF NOT EXISTS idx_ia_thresholds_actif ON ia_thresholds(actif);

CREATE OR REPLACE FUNCTION trigger_ia_thresholds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ia_thresholds_updated_at ON ia_thresholds;
CREATE TRIGGER trg_ia_thresholds_updated_at
  BEFORE UPDATE ON ia_thresholds
  FOR EACH ROW EXECUTE FUNCTION trigger_ia_thresholds_updated_at();

ALTER TABLE ia_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_thresholds_select_all ON ia_thresholds;
CREATE POLICY ia_thresholds_select_all ON ia_thresholds
  FOR SELECT USING (get_user_role() IN ('admin','super_admin','inspecteur','operateur'));

DROP POLICY IF EXISTS ia_thresholds_insert_admin ON ia_thresholds;
CREATE POLICY ia_thresholds_insert_admin ON ia_thresholds
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','super_admin'));

DROP POLICY IF EXISTS ia_thresholds_update_admin ON ia_thresholds;
CREATE POLICY ia_thresholds_update_admin ON ia_thresholds
  FOR UPDATE USING (get_user_role() IN ('admin','super_admin'));

-- ============================================================
-- 5. TABLE ia_decisions — historique des décisions AERORISQ
-- ============================================================
CREATE TABLE IF NOT EXISTS ia_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  aerodrome_id  UUID REFERENCES aerodromes(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('recommendation','certificat','declencheur','type_suggestion')),
  date_decision TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Décision originale
  recommendation_action TEXT,
  recommendation_type   TEXT,
  recommendation_urgence TEXT,
  certificat_action     TEXT,
  declencheur_type      TEXT,
  suggestion_type       TEXT,
  suggestion_confiance  NUMERIC,

  -- Suivi
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','dismissed','expired')),
  effectiveness TEXT NOT NULL DEFAULT 'non_evalue' CHECK (effectiveness IN ('efficace','partiel','inefficace','non_evalue')),
  applied_at    TIMESTAMPTZ,
  commentaire   TEXT,

  -- Confiance mesurée à l'instant de la décision
  confiance     NUMERIC DEFAULT 50
);

CREATE INDEX IF NOT EXISTS idx_ia_decisions_aerodrome ON ia_decisions(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_ia_decisions_status ON ia_decisions(status);
CREATE INDEX IF NOT EXISTS idx_ia_decisions_type ON ia_decisions(type);

CREATE OR REPLACE FUNCTION trigger_ia_decisions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ia_decisions_updated_at ON ia_decisions;
CREATE TRIGGER trg_ia_decisions_updated_at
  BEFORE UPDATE ON ia_decisions
  FOR EACH ROW EXECUTE FUNCTION trigger_ia_decisions_updated_at();

ALTER TABLE ia_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_decisions_select_all ON ia_decisions;
CREATE POLICY ia_decisions_select_all ON ia_decisions
  FOR SELECT USING (
    get_user_role() IN ('admin','super_admin')
    OR (
      get_user_role() IN ('inspecteur','operateur')
      AND aerodrome_id IN (
        SELECT aerodrome_id FROM utilisateurs WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS ia_decisions_insert_all ON ia_decisions;
CREATE POLICY ia_decisions_insert_all ON ia_decisions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS ia_decisions_update_owner ON ia_decisions;
CREATE POLICY ia_decisions_update_owner ON ia_decisions
  FOR UPDATE USING (get_user_role() IN ('admin','super_admin'));

-- ============================================================
-- 6. Vue agrégée : taux d'application et d'efficacité par aérodrome
-- ============================================================
CREATE OR REPLACE VIEW v_ia_decision_stats AS
SELECT
  aerodrome_id,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'applied') AS appliquees,
  COUNT(*) FILTER (WHERE effectiveness = 'efficace') AS efficaces,
  CASE WHEN COUNT(*) > 0
    THEN ROUND(COUNT(*) FILTER (WHERE status = 'applied')::numeric / COUNT(*) * 100)
    ELSE 0
  END AS taux_application,
  CASE WHEN COUNT(*) FILTER (WHERE status = 'applied') > 0
    THEN ROUND(COUNT(*) FILTER (WHERE effectiveness = 'efficace')::numeric / COUNT(*) FILTER (WHERE status = 'applied') * 100)
    ELSE 0
  END AS taux_efficacite,
  MAX(created_at) AS derniere_decision
FROM ia_decisions
GROUP BY aerodrome_id;
