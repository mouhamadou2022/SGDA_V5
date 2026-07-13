-- Table : ia_bayes_network_state
-- Stocke l'état du réseau bayésien causal par aérodrome et domaine bow-tie.
-- Supabase est l'autorité unique. IndexedDB sert de cache de lecture côté client.
-- Chaque ligne = les CPT (observations incluses) d'un réseau pour un (aerodrome, domaine).

CREATE TABLE IF NOT EXISTS ia_bayes_network_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aerodrome_id UUID NOT NULL REFERENCES aerodromes(id) ON DELETE CASCADE,
  bow_tie_domaine TEXT NOT NULL,
  noeuds JSONB NOT NULL DEFAULT '[]'::jsonb,
  nb_observations_total INTEGER NOT NULL DEFAULT 0,
  derniere_maj TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Une seule ligne par couple (aerodrome, domaine)
  CONSTRAINT uq_aerodrome_domaine UNIQUE (aerodrome_id, bow_tie_domaine)
);

-- Index pour chargement rapide par aérodrome
CREATE INDEX IF NOT EXISTS idx_bayes_network_aerodrome ON ia_bayes_network_state(aerodrome_id);

-- Index pour les mises à jour récentes
CREATE INDEX IF NOT EXISTS idx_bayes_network_maj ON ia_bayes_network_state(derniere_maj DESC);

COMMENT ON TABLE ia_bayes_network_state IS 'État persistant du réseau bayésien causal (CPT + observations) par aérodrome/domaine';
COMMENT ON COLUMN ia_bayes_network_state.noeuds IS 'JSON : tableau BayesNode[] avec les CPT complètes (table + observations)';
COMMENT ON COLUMN ia_bayes_network_state.nb_observations_total IS 'Somme de toutes les observations sur tous les nœuds, utilisée pour calculer la confiance';
