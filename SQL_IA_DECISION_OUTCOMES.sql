-- ============================================================
-- SGDA V5 — decision_outcomes : évaluation automatique des décisions
-- Relie chaque décision → évolution du score 6 mois après
-- Boucle d'apprentissage décision → outcome
-- ============================================================

-- 1. Ajouter les colonnes de suivi d'évolution à ia_decisions
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_before       NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_after_3m     NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_after_6m     NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_delta_6m     NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_tendance_at_outcome TEXT;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS evaluated_at       TIMESTAMPTZ;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS auto_evaluated     BOOLEAN DEFAULT false;

-- 2. TABLE score_history (si pas déjà créée ailleurs)
CREATE TABLE IF NOT EXISTS score_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  aerodrome_id  UUID REFERENCES aerodromes(id) ON DELETE CASCADE,
  score_global  NUMERIC NOT NULL,
  c1            NUMERIC,
  c2            NUMERIC,
  c3            NUMERIC,
  c4            NUMERIC,
  c5            NUMERIC,
  niveau        TEXT,
  tendance      TEXT,
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_score_history_aerodrome ON score_history(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_score_history_computed ON score_history(aerodrome_id, computed_at);

-- 3. Fonction d'évaluation automatique
CREATE OR REPLACE FUNCTION evaluate_decision_outcomes()
RETURNS TABLE (
  decision_id       UUID,
  aerodrome_id      UUID,
  score_before      NUMERIC,
  score_after_6m    NUMERIC,
  delta             NUMERIC,
  effectiveness     TEXT
) AS $$
DECLARE
  rec RECORD;
  v_score_before NUMERIC;
  v_score_after_6m NUMERIC;
  v_score_after_3m NUMERIC;
  v_tendance TEXT;
  v_delta NUMERIC;
  v_effectiveness TEXT;
BEGIN
  FOR rec IN
    SELECT d.id, d.aerodrome_id, d.date_decision
    FROM ia_decisions d
    WHERE d.evaluated_at IS NULL
      AND d.date_decision <= NOW() - INTERVAL '6 months'
      AND d.status IN ('applied', 'pending')
    ORDER BY d.date_decision
  LOOP
    -- Score à la date de la décision (score_history le plus proche avant la décision)
    SELECT sh.score_global INTO v_score_before
    FROM score_history sh
    WHERE sh.aerodrome_id = rec.aerodrome_id
      AND sh.computed_at <= rec.date_decision
    ORDER BY sh.computed_at DESC
    LIMIT 1;

    -- Score 3 mois après la décision
    SELECT sh.score_global INTO v_score_after_3m
    FROM score_history sh
    WHERE sh.aerodrome_id = rec.aerodrome_id
      AND sh.computed_at >= rec.date_decision + INTERVAL '3 months'
      AND sh.computed_at <= rec.date_decision + INTERVAL '4 months'
    ORDER BY sh.computed_at ASC
    LIMIT 1;

    -- Score 6 mois après la décision (fenêtre 5-8 mois)
    SELECT sh.score_global, sh.tendance INTO v_score_after_6m, v_tendance
    FROM score_history sh
    WHERE sh.aerodrome_id = rec.aerodrome_id
      AND sh.computed_at >= rec.date_decision + INTERVAL '5 months'
      AND sh.computed_at <= rec.date_decision + INTERVAL '8 months'
    ORDER BY sh.computed_at ASC
    LIMIT 1;

    -- Si pas de score 6 mois après, prendre le dernier score disponible
    IF v_score_after_6m IS NULL THEN
      SELECT sh.score_global, sh.tendance INTO v_score_after_6m, v_tendance
      FROM score_history sh
      WHERE sh.aerodrome_id = rec.aerodrome_id
      ORDER BY sh.computed_at DESC
      LIMIT 1;
    END IF;

    -- Calculer le delta et l'effectiveness
    IF v_score_before IS NOT NULL AND v_score_after_6m IS NOT NULL THEN
      v_delta := v_score_after_6m - v_score_before;

      IF v_delta > 5 THEN
        v_effectiveness := 'efficace';
      ELSIF v_delta >= -5 THEN
        v_effectiveness := 'partiel';
      ELSE
        v_effectiveness := 'inefficace';
      END IF;

      -- Mettre à jour la décision
      UPDATE ia_decisions
      SET
        score_before = v_score_before,
        score_after_3m = v_score_after_3m,
        score_after_6m = v_score_after_6m,
        score_delta_6m = v_delta,
        score_tendance_at_outcome = v_tendance,
        effectiveness = v_effectiveness,
        evaluated_at = NOW(),
        auto_evaluated = true
      WHERE id = rec.id;

      decision_id := rec.id;
      aerodrome_id := rec.aerodrome_id;
      score_before := v_score_before;
      score_after_6m := v_score_after_6m;
      delta := v_delta;
      effectiveness := v_effectiveness;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Vue : bilan des outcomes par aérodrome
CREATE OR REPLACE VIEW v_decision_outcome_stats AS
SELECT
  d.aerodrome_id,
  COUNT(*) AS total_evaluees,
  COUNT(*) FILTER (WHERE d.effectiveness = 'efficace') AS efficaces,
  COUNT(*) FILTER (WHERE d.effectiveness = 'partiel') AS partielles,
  COUNT(*) FILTER (WHERE d.effectiveness = 'inefficace') AS inefficaces,
  ROUND(AVG(d.score_delta_6m) FILTER (WHERE d.score_delta_6m IS NOT NULL), 1) AS delta_moyen,
  MAX(d.evaluated_at) AS derniere_evaluation
FROM ia_decisions d
WHERE d.auto_evaluated = true
GROUP BY d.aerodrome_id;
