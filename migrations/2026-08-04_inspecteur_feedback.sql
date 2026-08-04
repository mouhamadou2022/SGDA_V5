-- ============================================================
-- SGDA V5 — Table inspecteur_feedback pour le suivi ML de l'Inspecteur Virtuel
-- Acceptation / correction / rejet par capacité + maturité dans le temps
-- ============================================================
-- Compatible CQL: safe à ré-exécuter (IF NOT EXISTS / OR REPLACE)

-- 1. TABLE inspecteur_feedback
CREATE TABLE IF NOT EXISTS inspecteur_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Capacité de l'inspecteur virtuel qui a produit la suggestion
  capacite      TEXT NOT NULL CHECK (capacite IN ('checklist','ecart','rapport','certification','evenement')),

  -- Décision utilisateur sur la suggestion
  action        TEXT NOT NULL CHECK (action IN ('acceptee','corrigee','rejetee')),

  -- Contexte
  aerodrome_id  UUID REFERENCES aerodromes(id) ON DELETE CASCADE,
  surveillance_id UUID REFERENCES surveillances(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,  -- qui a réagi

  -- Confiance affichée au moment de la suggestion
  confiance     NUMERIC,

  -- Flag de synchro
  synced_at     TIMESTAMPTZ
);

-- Index pour les requêtes par aérodrome + capacité
CREATE INDEX IF NOT EXISTS idx_inspecteur_feedback_aerodrome ON inspecteur_feedback(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_inspecteur_feedback_capacite ON inspecteur_feedback(capacite);
CREATE INDEX IF NOT EXISTS idx_inspecteur_feedback_user ON inspecteur_feedback(user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trigger_inspecteur_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspecteur_feedback_updated_at ON inspecteur_feedback;
CREATE TRIGGER trg_inspecteur_feedback_updated_at
  BEFORE UPDATE ON inspecteur_feedback
  FOR EACH ROW EXECUTE FUNCTION trigger_inspecteur_feedback_updated_at();

-- 2. RLS
ALTER TABLE inspecteur_feedback ENABLE ROW LEVEL SECURITY;

-- Lecture : admin et inspecteurs voient tout, operateurs voient leur aérodrome
DROP POLICY IF EXISTS inspecteur_feedback_select_all ON inspecteur_feedback;
CREATE POLICY inspecteur_feedback_select_all ON inspecteur_feedback
  FOR SELECT USING (
    get_user_role() IN ('admin','super_admin','inspecteur')
    OR (
      get_user_role() = 'operateur'
      AND aerodrome_id IN (
        SELECT aerodrome_id FROM utilisateurs WHERE id = auth.uid()
      )
    )
  );

-- Écriture : tout utilisateur authentifié peut créer un retour
DROP POLICY IF EXISTS inspecteur_feedback_insert_all ON inspecteur_feedback;
CREATE POLICY inspecteur_feedback_insert_all ON inspecteur_feedback
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Mise à jour : seul l'auteur ou admin peut modifier
DROP POLICY IF EXISTS inspecteur_feedback_update_owner ON inspecteur_feedback;
CREATE POLICY inspecteur_feedback_update_owner ON inspecteur_feedback
  FOR UPDATE USING (
    user_id = auth.uid()
    OR get_user_role() IN ('admin','super_admin')
  );

-- 3. Vue agrégée pour le tableau de bord Inspecteur Virtuel
CREATE OR REPLACE VIEW v_inspecteur_feedback_stats AS
SELECT
  aerodrome_id,
  capacite,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE action = 'acceptee') AS acceptees,
  COUNT(*) FILTER (WHERE action = 'corrigee') AS corrigees,
  COUNT(*) FILTER (WHERE action = 'rejetee') AS rejetees,
  ROUND(AVG(confiance) FILTER (WHERE confiance IS NOT NULL)) AS confiance_moyenne,
  MAX(created_at) AS dernier_retour
FROM inspecteur_feedback
GROUP BY aerodrome_id, capacite;
