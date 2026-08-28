-- SGDA v5 — SCHÉMA PRODUCTION (SOURCE UNIQUE DE VÉRITÉ)
-- Généré le 2026-05-17 | Mis à jour le 2026-08-25
-- ✅ Idempotent : safe à ré-exécuter sur une DB existante
-- ✅ Sans perte de données (pas de DROP TABLE)
-- ✅ Rattrapage des colonnes ajoutées par les migrations pour les
--    tables déjà créées par une version antérieure du schéma
--    (ex. checklist_templates : categorie, regime, updated_by)
-- ✅ Inclut les tables des migrations récentes :
--    ia_langage_clair, ia_training_dataset, ia_training_logs (2026-08-04),
--    inspecteur_feedback (2026-08-04)
-- ✅ SECTION 24 — Boucle d'apprentissage AERORISQ complète (rattrapage
--    migrations 2026-07-08 → 2026-08-25) : ia_model_state, ia_feedback,
--    ia_thresholds, ia_decisions (+ outcomes & score_history),
--    ia_bayes_network_state, ml_samples
-- ✅ Colonnes persistance checklist SGS (2026-08-25) :
--    sgs_evaluation_prepa, sgs_evaluation_signee_le, sgs_ecarts_signes_le,
--    checklist_suivi_ecarts, checklist_pac, rapport_sections, rapport_versions
-- ✅ Corrige TOUTES les causes des erreurs RLS
-- ✅ Inclut colonnes checklist préparée sur plannings
-- ✅ Fichiers orphelins nettoyés : CertDashboard.tsx, HomoDashboard.tsx, OperatorPACConsolideModule.tsx
-- ============================================================
--
-- CAUSES RACINES DES ERREURS "violates row-level security" :
--
-- 🔴 CAUSE 1 (principale) — auth_id = null dans le seed admin
--    Le trigger handle_new_user tente INSERT avec email déjà
--    existant → conflit UNIQUE sur email non géré → auth_id
--    reste NULL → get_user_role() retourne NULL → RLS bloque
--    toutes les opérations admin.
--    → FIX : trigger réécrit pour UPDATE l'existant par email
--    → FIX : requête de réparation auth_id en section 1
--
-- 🔴 CAUSE 2 — Utilisateurs code d'accès sans session Supabase
--    loginWithCode() dans auth.ts ne crée pas de session auth
--    → auth.uid() = null → toutes les policies bloquent
--    → FIX SQL : policies anon pour lecture minimale opérateurs
--    → FIX auth.ts requis : voir section IMPORTANT en fin de fichier
--
-- 🟡 CAUSE 3 — 3 tables avec RLS activé mais ZÉRO policy
--    exemptions, plannings, formation_participants → lock-out total
--
-- 🟡 CAUSE 4 — 30 tables sans RLS du tout (accès ouvert)
--    conversations, alertes_securite, scores_historique, etc.
--
-- 🟡 CAUSE 5 — Rôle dg_operator absent de toutes les policies
--
-- 🟡 CAUSE 6 — Messages de conversation non couverts (to_id null)
--
-- 🟡 CAUSE 7 — codes_acces manque colonnes utilisées par auth.ts
--    (dg_prenom, dg_nom, focal_prenom, focal_nom, etc.)
--
-- 🟢 CAUSE 8 — notifications sans politique INSERT
--    Les notifications créées via le store (addNotification → sendNotification)
--    échouaient pour tous les rôles car aucune policy FOR INSERT n'existait.
--    → FIX : ajout de notifications_insert policy
--
-- 🟢 CAUSE 9 — profils_risque écriture bloquée pour focal_operator
--    loadInitialData upsertait les profils via le client anon, mais la
--    policy profils_write n'autorisait que admin/inspector.
--    → FIX : focal_operator autorisé à écrire sur son propre aerodrome
--
-- 🟢 CAUSE 10 — prediction_history écriture bloquée pour focal_operator
--    Les appels ML (api/ia/ml) échouaient pour le rôle opérateur.
--    → FIX : focal_operator autorisé à écrire sur son propre aerodrome
--

-- ============================================================
-- SECTION 1 — RÉPARATION URGENTE (à exécuter EN PREMIER)
-- Lie les auth_id manquants aux utilisateurs existants
-- ============================================================

-- 1.A Réparer l'admin et tout utilisateur dont auth_id = null
-- Dès qu'un utilisateur se reconnecte après ce fix, le trigger
-- correct va lier son auth_id automatiquement.
-- En attendant, forcer la liaison pour l'admin si vous connaissez
-- son UUID Supabase Auth (cherchez dans Authentication > Users) :

-- REMPLACER 'VOTRE-AUTH-UUID-ICI' par l'UUID réel de l'admin
-- dans Supabase Dashboard → Authentication → Users
-- Puis décommenter :
-- UPDATE utilisateurs
-- SET auth_id = 'VOTRE-AUTH-UUID-ICI'::uuid
-- WHERE email = 'admin@anacim.sn' AND auth_id IS NULL;

-- 1.B Supprimer les doublons ghost créés par le mauvais trigger
-- (utilisateurs role='guest' créés automatiquement qui doublonnent)
-- Attention : vérifier d'abord avec le SELECT en commentaire
-- SELECT id, email, role, auth_id, created_at FROM utilisateurs
-- WHERE role = 'guest' AND auth_id IS NOT NULL
-- ORDER BY created_at;
-- Puis si ces lignes sont bien des fantômes :
-- DELETE FROM utilisateurs
-- WHERE role = 'guest'
--   AND auth_id IS NOT NULL
--   AND email LIKE '%@anacim.sn'
--   AND created_at > now() - interval '30 days';

-- ============================================================
-- SECTION 2 — COLONNES MANQUANTES (auth.ts les utilise)
-- codes_acces : ajout des colonnes personnalisation noms
-- ============================================================

DO $$ BEGIN
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS dg_prenom      text;
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS dg_nom         text;
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS focal_prenom   text;
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS focal_nom      text;
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS staff_prenom   text;
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS staff_nom      text;
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS telephone      text;
  ALTER TABLE codes_acces ADD COLUMN IF NOT EXISTS email          text;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- SECTION 3 — COLONNES CHECKLIST PRÉPARÉE SUR PLANNINGS
-- Permet de sauvegarder les 3 types de checklists AVANT exécution
-- Transférées à la surveillance lors du passage en 'en_cours'
-- ============================================================

DO $$ BEGIN
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS checklist_hierarchy    JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS checklist_pac          JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS checklist_suivi_ecarts JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS delegations            JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS briefing_fiche         JSONB;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

COMMENT ON COLUMN plannings.checklist_hierarchy    IS 'Checklist hiérarchique pré-remplie (Standard). Transférée à la surveillance lors de l''exécution.';
COMMENT ON COLUMN plannings.checklist_pac          IS 'Checklist PAC pré-remplie. Transférée à la surveillance lors de l''exécution.';
COMMENT ON COLUMN plannings.checklist_suivi_ecarts IS 'Checklist suivi écarts pré-remplie. Transférée à la surveillance lors de l''exécution.';
COMMENT ON COLUMN plannings.delegations            IS 'Délégations préparatoires { domaine_code → inspecteur_id }. Définies lors de la préparation, utilisées par la checklist.';
COMMENT ON COLUMN plannings.briefing_fiche         IS 'Fiche de briefing pré-mission générée par IA (module Planning / preparation-checklist).';

-- ============================================================
-- SECTION 4.A — INDEX DE PERFORMANCE RLS
-- Les fonctions helper interrogent utilisateurs à chaque ligne
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_utilisateurs_auth_role
  ON utilisateurs(auth_id, role, aerodrome_id, id)
  WHERE deleted_at IS NULL;

-- ============================================================
-- SECTION 4.B — FONCTIONS HELPER RLS (inchangées, rappel)
-- SECURITY DEFINER → bypass RLS → pas de récursion infinie
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT "role"
  FROM utilisateurs
  WHERE auth_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_aerodrome_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT aerodrome_id
  FROM utilisateurs
  WHERE auth_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_internal_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id
  FROM utilisateurs
  WHERE auth_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;
$$;

-- ============================================================
-- SECTION 5 — TRIGGER CORRIGÉ (cause racine #1)
-- Comportement : upsert par EMAIL (ON CONFLICT email) pour lier
-- le auth_id. Le pattern UPDATE + INSERT IF NOT FOUND échouait
-- quand l'email existait déjà AVEC un auth_id (l'UPDATE ne
-- matchait rien → INSERT → violation UNIQUE(email) → l'exception
-- annulait l'INSERT dans auth.users → "Database error creating
-- new user").
-- ============================================================

DROP FUNCTION IF EXISTS handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role text;
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'guest');

  INSERT INTO public.utilisateurs (
    auth_id, email, identifiant, nom, prenom, "role", "statut", force_pwd_change
  )
  VALUES (
    new.id, new.email, split_part(new.email, '@', 1),
    COALESCE(new.raw_user_meta_data->>'nom', ''),
    COALESCE(new.raw_user_meta_data->>'prenom', ''),
    v_role, 'actif', true
  )
  ON CONFLICT (email) DO UPDATE SET
    auth_id         = EXCLUDED.auth_id,
    identifiant     = EXCLUDED.identifiant,
    nom             = EXCLUDED.nom,
    prenom          = EXCLUDED.prenom,
    "role"          = EXCLUDED."role",
    force_pwd_change = EXCLUDED.force_pwd_change;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SECTION 5.B — TABLE SUGGESTION FEEDBACKS (APPRENTISSAGE IA)
-- Trace les feedbacks sur les suggestions IA pour améliorer
-- les seuils et prédictions par aérodrome
-- ============================================================

CREATE TABLE IF NOT EXISTS suggestion_feedbacks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aerodrome_id    UUID NOT NULL REFERENCES aerodromes(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL,
  mission_type_suggeree TEXT NOT NULL,
  mission_type_effectif TEXT,
  etait_pertinent BOOLEAN NOT NULL DEFAULT true,
  raison_inexactitude TEXT,
  contexte_json   JSONB,
  ecart_ids       UUID[],
  date_suggestion TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_feedback   TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggestion_fb_aerodrome ON suggestion_feedbacks(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_fb_type ON suggestion_feedbacks(suggestion_type);
CREATE INDEX IF NOT EXISTS idx_suggestion_fb_pertinent ON suggestion_feedbacks(aerodrome_id, etait_pertinent);

-- ============================================================
-- SECTION 5.C.1 — TABLE ML MODEL WEIGHTS (PERSISTANCE CÔTÉ SERVEUR)
-- Stocke les poids du modèle ML pour synchronisation multi-postes
-- Le localStorage reste la source principale, cette table permet
-- la persistance cloud et le partage entre inspecteurs
-- ============================================================

CREATE TABLE IF NOT EXISTS ml_model_weights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aerodrome_id    UUID REFERENCES aerodromes(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL DEFAULT 1,
  weights         JSONB NOT NULL DEFAULT '{}'::jsonb,
  biases          JSONB NOT NULL DEFAULT '{}'::jsonb,
  learning_rate   FLOAT NOT NULL DEFAULT 0.05,
  total_feedbacks INTEGER NOT NULL DEFAULT 0,
  accuracy_history FLOAT[] DEFAULT ARRAY[]::float[],
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(aerodrome_id)
);

CREATE INDEX IF NOT EXISTS idx_ml_weights_aerodrome ON ml_model_weights(aerodrome_id);

-- ============================================================
-- SECTION 5.C.2 — API KEYS (gestion dynamique des clés via UI admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  key_value TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN DEFAULT true,
  fallback_order INTEGER DEFAULT 0,
  last_tested_at TIMESTAMPTZ,
  last_test_ok BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_service ON api_keys (service, fallback_order);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "api_keys_admin" ON api_keys;
CREATE POLICY "api_keys_admin" ON api_keys
  FOR ALL USING (get_user_role() = 'admin');

-- ============================================================
-- TABLE self_assessments — auto-évaluation exploitants
-- ============================================================
CREATE TABLE IF NOT EXISTS self_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES utilisateurs(id) ON DELETE CASCADE,
  aerodrome_id UUID REFERENCES aerodromes(id) ON DELETE SET NULL,
  reponses JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE self_assessments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self_assessments_owner" ON self_assessments;
CREATE POLICY "self_assessments_owner" ON self_assessments
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- SECTION 5.D — COLONNES HIÉRARCHIE ANACIM
-- poste : fonction hiérarchique (inspecteur, chef_ssa, chef_sna, chef_dnsa)
-- superieur_id : lien vers le supérieur direct
-- ============================================================

DO $$ BEGIN
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS poste             text;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS superieur_id      text;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS type_inspecteur   text;
  ALTER TABLE inspecteurs  ADD COLUMN IF NOT EXISTS poste             text;
  ALTER TABLE inspecteurs  ADD COLUMN IF NOT EXISTS superieur_id      text;
  ALTER TABLE dossiers     ADD COLUMN IF NOT EXISTS extensions        jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE dossiers     ADD COLUMN IF NOT EXISTS date_limite_initiale timestamptz;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- SECTION 5.E — COLONNES MESSAGES MANQUANTES
-- cc_id : destinataires en copie (JSONB pour compatibilité multi)
-- archived_by : utilisateurs ayant archivé le message
-- ============================================================

DO $$ BEGIN
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS cc_id        JSONB DEFAULT '[]'::jsonb;
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS archived_by  JSONB DEFAULT '[]'::jsonb;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- SECTION 6 — ACTIVATION RLS (tables manquantes)
-- ============================================================

ALTER TABLE conversations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_equipe               ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveillance_equipe           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspecteur_formations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_domaines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_sous_domaines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_sous_sous_domaines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquete_aerodromes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reponses_enquete              ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes_securite              ENABLE ROW LEVEL SECURITY;
ALTER TABLE alertes_proactives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores_historique             ENABLE ROW LEVEL SECURITY;
ALTER TABLE presence_entries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_points                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_outcomes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_index_feedbacks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mesures_attenuation           ENABLE ROW LEVEL SECURITY;
ALTER TABLE homologation_exemptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE certification_exemptions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kit_documents                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulation_analyses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_suggestions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE historique_ecarts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE evenement_ecarts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecarts_redaction              ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_performance             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pac_learning_feedbacks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE preuve_learning_feedbacks     ENABLE ROW LEVEL SECURITY;

-- Tables déjà activées dans le schéma original (rappel idempotent)
ALTER TABLE utilisateurs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE aerodromes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspecteurs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE competences                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE formations                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE formation_participants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE plannings                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveillances                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecarts                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE evenements_securite           ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications                ENABLE ROW LEVEL SECURITY;
ALTER TABLE homologations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE exemptions                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquetes                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE codes_acces                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE registre_entries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profils_risque                ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE prefill_aerodrome_feedbacks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecarts_oaci_feedbacks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_feedbacks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_model_weights              ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 7 — POLICIES RLS COMPLÈTES
-- Convention : DROP + CREATE (idempotent)
-- Rôles : admin | inspector | dg_anacim | dg_operator
--         focal_operator | staff_operator | guest
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.1  UTILISATEURS                                       ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "utilisateurs_select" ON utilisateurs;
CREATE POLICY "utilisateurs_select" ON utilisateurs
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
  );
-- Tout utilisateur authentifié voit tous les users actifs
-- (nécessaire pour messagerie, affichage des équipes)

DROP POLICY IF EXISTS "utilisateurs_insert" ON utilisateurs;
CREATE POLICY "utilisateurs_insert" ON utilisateurs
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "utilisateurs_update" ON utilisateurs;
CREATE POLICY "utilisateurs_update" ON utilisateurs
  FOR UPDATE USING (
    get_user_role() = 'admin'
    OR auth_id = auth.uid()   -- chacun peut modifier son propre profil
  );

DROP POLICY IF EXISTS "utilisateurs_delete" ON utilisateurs;
CREATE POLICY "utilisateurs_delete" ON utilisateurs
  FOR DELETE USING (get_user_role() = 'admin');

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.2  AÉRODROMES                                         ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "aerodromes_select"  ON aerodromes;
DROP POLICY IF EXISTS "aerodromes_write"   ON aerodromes;
DROP POLICY IF EXISTS "aerodromes_insert"  ON aerodromes;
DROP POLICY IF EXISTS "aerodromes_update"  ON aerodromes;
DROP POLICY IF EXISTS "aerodromes_delete"  ON aerodromes;

CREATE POLICY "aerodromes_select" ON aerodromes
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator','guest')
      OR (get_user_role() IN ('focal_operator','staff_operator')
          AND id = get_user_aerodrome_id())
    )
  );

CREATE POLICY "aerodromes_insert" ON aerodromes
  FOR INSERT WITH CHECK (
    get_user_role() IN ('admin','inspector')
  );

CREATE POLICY "aerodromes_update" ON aerodromes
  FOR UPDATE USING (
    get_user_role() IN ('admin','inspector')
  );

CREATE POLICY "aerodromes_delete" ON aerodromes
  FOR DELETE USING (
    get_user_role() = 'admin'
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.3  INSPECTEURS                                        ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "inspecteurs_select" ON inspecteurs;
CREATE POLICY "inspecteurs_select" ON inspecteurs
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "inspecteurs_write" ON inspecteurs;
CREATE POLICY "inspecteurs_write" ON inspecteurs
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.4  COMPÉTENCES                                        ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "competences_select" ON competences;
CREATE POLICY "competences_select" ON competences
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "competences_write" ON competences;
CREATE POLICY "competences_write" ON competences
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.5  FORMATIONS                                         ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "formations_select" ON formations;
CREATE POLICY "formations_select" ON formations
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "formations_write" ON formations;
CREATE POLICY "formations_write" ON formations
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Formation participants
DROP POLICY IF EXISTS "formation_participants_select" ON formation_participants;
CREATE POLICY "formation_participants_select" ON formation_participants
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR utilisateur_id = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "formation_participants_write" ON formation_participants;
CREATE POLICY "formation_participants_write" ON formation_participants
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Inspecteur formations (table jonction)
DROP POLICY IF EXISTS "inspecteur_formations_select" ON inspecteur_formations;
CREATE POLICY "inspecteur_formations_select" ON inspecteur_formations
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "inspecteur_formations_write" ON inspecteur_formations;
CREATE POLICY "inspecteur_formations_write" ON inspecteur_formations
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.6  KIT DOCUMENTS                                      ║
-- ╚══════════════════════════════════════════════════════════╝

-- Colonnes manquantes (idempotent)
ALTER TABLE kit_documents
  ADD COLUMN IF NOT EXISTS format                  text,
  ADD COLUMN IF NOT EXISTS domaines                jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fichier_nom             text,
  ADD COLUMN IF NOT EXISTS fichier_taille          bigint default 0,
  ADD COLUMN IF NOT EXISTS mots_cles               jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS resume                  text,
  ADD COLUMN IF NOT EXISTS accessible_exploitant   boolean default false,
  ADD COLUMN IF NOT EXISTS telechargements         integer default 0,
  ADD COLUMN IF NOT EXISTS reference_base          text,
  ADD COLUMN IF NOT EXISTS extraits                jsonb,
  ADD COLUMN IF NOT EXISTS ia_analyse_at           timestamptz,
  ADD COLUMN IF NOT EXISTS ia_impact               text,
  ADD COLUMN IF NOT EXISTS shared_aerodrome_ids    jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS partage_exploitant      jsonb default '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contenu_complet          text,
  ADD COLUMN IF NOT EXISTS texte_extrait_le         timestamptz,
  ADD COLUMN IF NOT EXISTS items_generes            jsonb,
  ADD COLUMN IF NOT EXISTS items_generes_le         timestamptz,
  ADD COLUMN IF NOT EXISTS items_generes_version    text,
  ADD COLUMN IF NOT EXISTS texte_extrait_version    text,
  ADD COLUMN IF NOT EXISTS created_by               uuid;

DROP POLICY IF EXISTS "kit_docs_select" ON kit_documents;
CREATE POLICY "kit_docs_select" ON kit_documents
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR (
        accessible_exploitant = true
        AND get_user_role() IN ('focal_operator','staff_operator','guest','dg_operator')
        AND (
          shared_aerodrome_ids IS NULL
          OR jsonb_array_length(COALESCE(shared_aerodrome_ids, '[]'::jsonb)) = 0
          OR shared_aerodrome_ids ? get_user_aerodrome_id()::text
        )
      )
    )
  );

DROP POLICY IF EXISTS "kit_docs_write" ON kit_documents;
CREATE POLICY "kit_docs_write" ON kit_documents
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Analyses réglementaires
DROP POLICY IF EXISTS "regulation_analyses_select" ON regulation_analyses;
CREATE POLICY "regulation_analyses_select" ON regulation_analyses
  FOR SELECT USING (
    get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
  );

DROP POLICY IF EXISTS "regulation_analyses_write" ON regulation_analyses;
CREATE POLICY "regulation_analyses_write" ON regulation_analyses
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Suggestions de formations
DROP POLICY IF EXISTS "formation_suggestions_select" ON formation_suggestions;
CREATE POLICY "formation_suggestions_select" ON formation_suggestions
  FOR SELECT USING (
    get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
  );

DROP POLICY IF EXISTS "formation_suggestions_write" ON formation_suggestions;
CREATE POLICY "formation_suggestions_write" ON formation_suggestions
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.7  PLANNINGS (était VIDE → lock-out total)            ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "plannings_select" ON plannings;
CREATE POLICY "plannings_select" ON plannings
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR (get_user_role() IN ('focal_operator','staff_operator')
          AND aerodrome_id = get_user_aerodrome_id())
    )
  );

DROP POLICY IF EXISTS "plannings_write" ON plannings;
CREATE POLICY "plannings_write" ON plannings
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Planning équipe (table jonction)
DROP POLICY IF EXISTS "planning_equipe_select" ON planning_equipe;
CREATE POLICY "planning_equipe_select" ON planning_equipe
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR utilisateur_id = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "planning_equipe_write" ON planning_equipe;
CREATE POLICY "planning_equipe_write" ON planning_equipe
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.8  SURVEILLANCES                                      ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "surveillances_select" ON surveillances;
CREATE POLICY "surveillances_select" ON surveillances
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR (get_user_role() IN ('focal_operator','staff_operator')
          AND aerodrome_id = get_user_aerodrome_id())
    )
  );

DROP POLICY IF EXISTS "surveillances_write" ON surveillances;
CREATE POLICY "surveillances_write" ON surveillances
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Surveillance équipe (table jonction)
DROP POLICY IF EXISTS "surv_equipe_select" ON surveillance_equipe;
CREATE POLICY "surv_equipe_select" ON surveillance_equipe
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR utilisateur_id = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "surv_equipe_write" ON surveillance_equipe;
CREATE POLICY "surv_equipe_write" ON surveillance_equipe
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.9  CERTIFICATIONS & HOMOLOGATIONS                     ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "certs_select" ON certifications;
CREATE POLICY "certs_select" ON certifications
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator','guest')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "certs_write" ON certifications;
CREATE POLICY "certs_write" ON certifications
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "homolo_select" ON homologations;
CREATE POLICY "homolo_select" ON homologations
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "homolo_write" ON homologations;
CREATE POLICY "homolo_write" ON homologations
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.10 EXEMPTIONS (était VIDE → lock-out total)           ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "exemptions_select" ON exemptions;
CREATE POLICY "exemptions_select" ON exemptions
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "exemptions_write" ON exemptions;
CREATE POLICY "exemptions_write" ON exemptions
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Certification exemptions (jonction)
DROP POLICY IF EXISTS "cert_exemptions_select" ON certification_exemptions;
CREATE POLICY "cert_exemptions_select" ON certification_exemptions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cert_exemptions_write" ON certification_exemptions;
CREATE POLICY "cert_exemptions_write" ON certification_exemptions
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Homologation exemptions (jonction)
DROP POLICY IF EXISTS "homolo_exemptions_select" ON homologation_exemptions;
CREATE POLICY "homolo_exemptions_select" ON homologation_exemptions
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "homolo_exemptions_write" ON homologation_exemptions;
CREATE POLICY "homolo_exemptions_write" ON homologation_exemptions
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Mesures d'atténuation
DROP POLICY IF EXISTS "mesures_select" ON mesures_attenuation;
CREATE POLICY "mesures_select" ON mesures_attenuation
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "mesures_write" ON mesures_attenuation;
CREATE POLICY "mesures_write" ON mesures_attenuation
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.11 ÉVÉNEMENTS SÉCURITÉ                                ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "evts_select" ON evenements_securite;
CREATE POLICY "evts_select" ON evenements_securite
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR (get_user_role() IN ('focal_operator','staff_operator')
          AND aerodrome_id = get_user_aerodrome_id())
    )
  );

DROP POLICY IF EXISTS "evts_write" ON evenements_securite;
CREATE POLICY "evts_write" ON evenements_securite
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.12 ÉCARTS                                             ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "ecarts_select" ON ecarts;
CREATE POLICY "ecarts_select" ON ecarts
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND deleted_at IS NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR (
        get_user_role() IN ('focal_operator','staff_operator')
        AND (
          -- Correspondance directe sur aerodrome_id (cas normal)
          aerodrome_id = get_user_aerodrome_id()
          -- Fallback : l'écart est lié à une surveillance de cet aérodrome
          -- (couvre les cas où aerodrome_id n'est pas renseigné directement)
          OR surveillance_id IN (
            SELECT id FROM surveillances
            WHERE aerodrome_id = get_user_aerodrome_id()
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "ecarts_write" ON ecarts;
CREATE POLICY "ecarts_write" ON ecarts
  FOR ALL USING (
    get_user_role() IN ('admin','inspector')
    OR (
      get_user_role() = 'focal_operator'
      AND (
        aerodrome_id = get_user_aerodrome_id()
        OR surveillance_id IN (
          SELECT id FROM surveillances
          WHERE aerodrome_id = get_user_aerodrome_id()
        )
      )
    )
  );

-- Événement-Écart (jonction)
DROP POLICY IF EXISTS "evenement_ecarts_select" ON evenement_ecarts;
CREATE POLICY "evenement_ecarts_select" ON evenement_ecarts
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "evenement_ecarts_write" ON evenement_ecarts;
CREATE POLICY "evenement_ecarts_write" ON evenement_ecarts
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Historique écarts
DROP POLICY IF EXISTS "historique_ecarts_select" ON historique_ecarts;
CREATE POLICY "historique_ecarts_select" ON historique_ecarts
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historique_ecarts_insert" ON historique_ecarts;
CREATE POLICY "historique_ecarts_insert" ON historique_ecarts
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "historique_ecarts_delete" ON historique_ecarts;
CREATE POLICY "historique_ecarts_delete" ON historique_ecarts
  FOR DELETE USING (get_user_role() = 'admin');

-- Écarts rédaction
DROP POLICY IF EXISTS "ecarts_redaction_select" ON ecarts_redaction;
CREATE POLICY "ecarts_redaction_select" ON ecarts_redaction
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "ecarts_redaction_write" ON ecarts_redaction;
CREATE POLICY "ecarts_redaction_write" ON ecarts_redaction
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.13 CHECKLIST                                          ║
-- ╚══════════════════════════════════════════════════════════╝

-- Items (déjà dans schéma, réécrit complet)
DROP POLICY IF EXISTS "checklist_items_select" ON checklist_items;
CREATE POLICY "checklist_items_select" ON checklist_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_items_write" ON checklist_items;
CREATE POLICY "checklist_items_write" ON checklist_items
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Hiérarchie (domaines / sous / sous-sous)
DROP POLICY IF EXISTS "checklist_domaines_select" ON checklist_domaines;
CREATE POLICY "checklist_domaines_select" ON checklist_domaines
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_domaines_write" ON checklist_domaines;
CREATE POLICY "checklist_domaines_write" ON checklist_domaines
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "checklist_sd_select" ON checklist_sous_domaines;
CREATE POLICY "checklist_sd_select" ON checklist_sous_domaines
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_sd_write" ON checklist_sous_domaines;
CREATE POLICY "checklist_sd_write" ON checklist_sous_domaines
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "checklist_ssd_select" ON checklist_sous_sous_domaines;
CREATE POLICY "checklist_ssd_select" ON checklist_sous_sous_domaines
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_ssd_write" ON checklist_sous_sous_domaines;
CREATE POLICY "checklist_ssd_write" ON checklist_sous_sous_domaines
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.14 ENQUÊTES                                           ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "enquetes_select" ON enquetes;
CREATE POLICY "enquetes_select" ON enquetes
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR "statut" = 'active'
    )
  );

DROP POLICY IF EXISTS "enquetes_write" ON enquetes;
CREATE POLICY "enquetes_write" ON enquetes
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Enquête-Aérodromes (jonction)
DROP POLICY IF EXISTS "enquete_aerodromes_select" ON enquete_aerodromes;
CREATE POLICY "enquete_aerodromes_select" ON enquete_aerodromes
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "enquete_aerodromes_write" ON enquete_aerodromes;
CREATE POLICY "enquete_aerodromes_write" ON enquete_aerodromes
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Réponses enquête
DROP POLICY IF EXISTS "reponses_enquete_select" ON reponses_enquete;
CREATE POLICY "reponses_enquete_select" ON reponses_enquete
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "reponses_enquete_insert" ON reponses_enquete;
CREATE POLICY "reponses_enquete_insert" ON reponses_enquete
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector')
      OR (get_user_role() IN ('focal_operator','staff_operator')
          AND aerodrome_id = get_user_aerodrome_id())
    )
  );

DROP POLICY IF EXISTS "reponses_enquete_write_admin" ON reponses_enquete;
CREATE POLICY "reponses_enquete_write_admin" ON reponses_enquete
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.15 MESSAGERIE (CORRIGÉE — to_id null pour groupe)    ║
-- ╚══════════════════════════════════════════════════════════╝

-- Conversations
DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR get_user_internal_id() = ANY(participants)
    )
  );

DROP POLICY IF EXISTS "conversations_write" ON conversations;
CREATE POLICY "conversations_write" ON conversations
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector')
      OR get_user_internal_id() = ANY(participants)
    )
  );

-- Conversation participants (jonction)
DROP POLICY IF EXISTS "conv_participants_select" ON conversation_participants;
CREATE POLICY "conv_participants_select" ON conversation_participants
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR utilisateur_id = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "conv_participants_write" ON conversation_participants;
CREATE POLICY "conv_participants_write" ON conversation_participants
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector')
      OR utilisateur_id = get_user_internal_id()
    )
  );

-- Messages (FIX : couvre les messages directs, de groupe, CC et archivés)
DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() = 'admin'
      OR from_id = get_user_internal_id()
      OR to_id = get_user_internal_id()
      OR (cc_id IS NOT NULL AND cc_id::jsonb ? get_user_internal_id()::text)
      -- Message de conversation (participant au canal)
      OR (
        conversation_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = messages.conversation_id
            AND cp.utilisateur_id  = get_user_internal_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS "messages_insert" ON messages;
CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND from_id = get_user_internal_id()
  );

DROP POLICY IF EXISTS "messages_update" ON messages;
CREATE POLICY "messages_update" ON messages
  FOR UPDATE USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() = 'admin'
      OR from_id = get_user_internal_id()
      OR to_id = get_user_internal_id()
      OR (cc_id IS NOT NULL AND cc_id::jsonb ? get_user_internal_id()::text)
      OR (
        conversation_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.conversation_id = messages.conversation_id
            AND cp.utilisateur_id  = get_user_internal_id()
        )
      )
    )
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.16 REGISTRES                                          ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS registre_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('certification','homologation','surveillance','evenement','ecart','dossier','document','formation')),
  reference     TEXT NOT NULL DEFAULT '',
  titre         TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  date_entree   TIMESTAMPTZ NOT NULL DEFAULT now(),
  aerodrome_id  UUID REFERENCES aerodromes(id) ON DELETE SET NULL,
  fichiers      JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline      JSONB NOT NULL DEFAULT '[]'::jsonb,
  statut        TEXT NOT NULL DEFAULT 'valide' CHECK (statut IN ('valide','archive')),
  auto_generated BOOLEAN NOT NULL DEFAULT false,
  source_id     TEXT,
  source_type   TEXT,
  metadata      JSONB,
  ia_analysis   JSONB,
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reg_entries_type ON registre_entries(type);
CREATE INDEX IF NOT EXISTS idx_reg_entries_aerodrome ON registre_entries(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_reg_entries_date ON registre_entries(date_entree DESC);

DROP POLICY IF EXISTS "reg_entries_select" ON registre_entries;
CREATE POLICY "reg_entries_select" ON registre_entries
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "reg_entries_write" ON registre_entries;
CREATE POLICY "reg_entries_write" ON registre_entries
  FOR ALL USING (get_user_role() IN ('admin','inspector'));


-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.17 DOSSIERS                                           ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "dossiers_select" ON dossiers;
CREATE POLICY "dossiers_select" ON dossiers
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR inspecteur_id = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "dossiers_write" ON dossiers;
CREATE POLICY "dossiers_write" ON dossiers
  FOR ALL USING (
    get_user_role() IN ('admin','inspector')
    OR inspecteur_id = get_user_internal_id()
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.18 PROFILS RISQUE & SCORES                            ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "profils_select" ON profils_risque;
CREATE POLICY "profils_select" ON profils_risque
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "profils_write" ON profils_risque;
CREATE POLICY "profils_write" ON profils_risque
  FOR ALL USING (
    get_user_role() IN ('admin','inspector')
    OR (
      get_user_role() = 'focal_operator'
      AND aerodrome_id = get_user_aerodrome_id()
    )
  );

-- Scores historiques
DROP POLICY IF EXISTS "scores_hist_select" ON scores_historique;
CREATE POLICY "scores_hist_select" ON scores_historique
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "scores_hist_write" ON scores_historique;
CREATE POLICY "scores_hist_write" ON scores_historique
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Risk index feedbacks
DROP POLICY IF EXISTS "risk_feedbacks_select" ON risk_index_feedbacks;
CREATE POLICY "risk_feedbacks_select" ON risk_index_feedbacks
  FOR SELECT USING (
    get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
  );

DROP POLICY IF EXISTS "risk_feedbacks_insert" ON risk_index_feedbacks;
CREATE POLICY "risk_feedbacks_insert" ON risk_index_feedbacks
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','inspector'));

-- Prédictions
DROP POLICY IF EXISTS "prediction_hist_select" ON prediction_history;
CREATE POLICY "prediction_hist_select" ON prediction_history
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "prediction_hist_write" ON prediction_history;
CREATE POLICY "prediction_hist_write" ON prediction_history
  FOR ALL USING (
    get_user_role() IN ('admin','inspector')
    OR (
      get_user_role() = 'focal_operator'
      AND aerodrome_id = get_user_aerodrome_id()
    )
  );

-- Action outcomes
DROP POLICY IF EXISTS "action_outcomes_select" ON action_outcomes;
CREATE POLICY "action_outcomes_select" ON action_outcomes
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "action_outcomes_write" ON action_outcomes;
CREATE POLICY "action_outcomes_write" ON action_outcomes
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Change points
DROP POLICY IF EXISTS "change_points_select" ON change_points;
CREATE POLICY "change_points_select" ON change_points
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "change_points_write" ON change_points;
CREATE POLICY "change_points_write" ON change_points
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Alertes proactives
DROP POLICY IF EXISTS "alertes_pro_select" ON alertes_proactives;
CREATE POLICY "alertes_pro_select" ON alertes_proactives
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "alertes_pro_write" ON alertes_proactives;
CREATE POLICY "alertes_pro_write" ON alertes_proactives
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.19 DÉLÉGATIONS & ALERTES SÉCURITÉ                     ║
-- ╚══════════════════════════════════════════════════════════╝

-- Table delegations : était référencée par les policies RLS et la
-- synchro offline (/api/sync) mais n'était créée nulle part.
-- Idempotente : safe à ré-exécuter.
CREATE TABLE IF NOT EXISTS delegations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Références métier
  surveillance_id       UUID REFERENCES surveillances(id) ON DELETE CASCADE,
  aerodrome_id          UUID REFERENCES aerodromes(id)   ON DELETE CASCADE,
  chef_id               UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  assigne_a             UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  assigne_par           UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,

  -- Domaine réglementaire délégué (SGS, PHY, OLS, RA…)
  domaine               TEXT NOT NULL,
  domaine_nom           TEXT,
  type_surveillance     TEXT,

  -- Suivi
  items_ids             JSONB NOT NULL DEFAULT '[]'::jsonb,
  items_count           INTEGER,
  progression           INTEGER NOT NULL DEFAULT 0,
  statut                TEXT NOT NULL DEFAULT 'assigne' CHECK (statut IN (
    'assigne','checklist_en_cours','checklist_signee',
    'ecarts_en_cours','ecarts_signes','transmis_chef',
    'en_cours','termine','bloque'
  )),

  -- Signatures
  checklist_signature_url TEXT,
  checklist_signe_le      TIMESTAMPTZ,
  ecarts_signature_url    TEXT,
  ecarts_signes_le        TIMESTAMPTZ,
  transmis_le             TIMESTAMPTZ,

  -- Horodatages d'activité
  assigne_le              TIMESTAMPTZ,
  derniere_activite       TIMESTAMPTZ,
  derniere_sync           TIMESTAMPTZ
);

-- Index pour les requêtes courantes (getDelegationsBySurveillance, par inspecteur, par domaine)
CREATE INDEX IF NOT EXISTS idx_delegations_surveillance ON delegations(surveillance_id);
CREATE INDEX IF NOT EXISTS idx_delegations_assigne_a     ON delegations(assigne_a);
CREATE INDEX IF NOT EXISTS idx_delegations_domaine       ON delegations(domaine);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trigger_delegations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_delegations_updated_at ON delegations;
CREATE TRIGGER trg_delegations_updated_at
  BEFORE UPDATE ON delegations
  FOR EACH ROW EXECUTE FUNCTION trigger_delegations_updated_at();

ALTER TABLE delegations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON delegations TO authenticated;

DROP POLICY IF EXISTS "delegations_select" ON delegations;
CREATE POLICY "delegations_select" ON delegations
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR chef_id   = get_user_internal_id()
      OR assigne_a = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "delegations_write" ON delegations;
CREATE POLICY "delegations_write" ON delegations
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector')
      OR chef_id = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "alertes_sec_select" ON alertes_securite;
CREATE POLICY "alertes_sec_select" ON alertes_securite
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR declenchee_par = get_user_internal_id()
    )
  );

DROP POLICY IF EXISTS "alertes_sec_write" ON alertes_securite;
CREATE POLICY "alertes_sec_write" ON alertes_securite
  FOR ALL USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector')
      OR declenchee_par = get_user_internal_id()
    )
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.20 SIGNATURES, PRÉSENCES, NOTIFICATIONS               ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "signatures_select" ON signatures;
CREATE POLICY "signatures_select" ON signatures
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "signatures_insert" ON signatures;
CREATE POLICY "signatures_insert" ON signatures
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "signatures_delete" ON signatures;
CREATE POLICY "signatures_delete" ON signatures
  FOR DELETE USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "presence_select" ON presence_entries;
CREATE POLICY "presence_select" ON presence_entries
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "presence_write" ON presence_entries;
CREATE POLICY "presence_write" ON presence_entries
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select" ON notifications
  FOR SELECT USING (
    user_id = get_user_internal_id()
    OR get_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE USING (user_id = get_user_internal_id());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND get_user_role() IN ('admin','inspector','dg_anacim','dg_operator','focal_operator','staff_operator')
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.21 STORAGE — BUCKET DOCUMENTS                          ║
-- ╚══════════════════════════════════════════════════════════╝
-- Création idempotente du bucket (ignorée s'il existe déjà)
INSERT INTO storage.buckets (id, name, public)
SELECT 'documents', 'documents', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents');

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.22 STORAGE — POLITIQUES BUCKET DOCUMENTS               ║
-- ╚══════════════════════════════════════════════════════════╝
-- FIX : l'upload du dossier PAC (PDF) par focal_operator
--       utilise supabase.storage avec la clé anon → RLS bloquait.
--       Ces politiques sur storage.objects autorisent le upload/download.

DROP POLICY IF EXISTS "documents_select" ON storage.objects;
CREATE POLICY "documents_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "documents_insert" ON storage.objects;
CREATE POLICY "documents_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "documents_update" ON storage.objects;
CREATE POLICY "documents_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "documents_delete" ON storage.objects;
CREATE POLICY "documents_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.23 CODES D'ACCÈS                                      ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "codes_select" ON codes_acces;
CREATE POLICY "codes_select" ON codes_acces
  FOR SELECT USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "codes_write" ON codes_acces;
CREATE POLICY "codes_write" ON codes_acces
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Policy spéciale pour la lecture du code au moment du login
-- (la requête loginWithCode tourne sans session Auth → anon)
DROP POLICY IF EXISTS "codes_anon_read" ON codes_acces;
CREATE POLICY "codes_anon_read" ON codes_acces
  FOR SELECT
  TO anon
  USING ("statut" = 'actif');
-- Seuls les codes actifs sont visibles sans session, et seulement
-- les colonnes nécessaires à la validation (code, aerodrome_id,
-- code_type, expires_at). L'appli ne peut pas filtrer les colonnes
-- ici — c'est à gérer dans votre logique applicative.

-- ── Fix: laisser les admins/inspecteurs créer/révoquer des codes ──
ALTER TABLE codes_acces DROP CONSTRAINT IF EXISTS codes_acces_statut_check;
ALTER TABLE codes_acces ADD CONSTRAINT codes_acces_statut_check
  CHECK (statut IN ('actif', 'expire', 'revogue'));

DROP POLICY IF EXISTS "codes_acces_insert" ON codes_acces;
CREATE POLICY "codes_acces_insert" ON codes_acces
  FOR INSERT WITH CHECK (
    get_user_role() IN ('admin', 'inspecteur', 'super_admin')
  );

DROP POLICY IF EXISTS "codes_acces_update" ON codes_acces;
CREATE POLICY "codes_acces_update" ON codes_acces
  FOR UPDATE USING (
    get_user_role() IN ('admin', 'inspecteur', 'super_admin')
  );

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.24 AUDIT LOGS                                         ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "audit_select" ON audit_logs;
CREATE POLICY "audit_select" ON audit_logs
  FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "audit_insert" ON audit_logs;
CREATE POLICY "audit_insert" ON audit_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.25 FEEDBACKS IA                                       ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "prefill_feedbacks_select" ON prefill_aerodrome_feedbacks;
CREATE POLICY "prefill_feedbacks_select" ON prefill_aerodrome_feedbacks
  FOR SELECT USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "prefill_feedbacks_insert" ON prefill_aerodrome_feedbacks;
CREATE POLICY "prefill_feedbacks_insert" ON prefill_aerodrome_feedbacks
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "ecarts_oaci_feedbacks_select" ON ecarts_oaci_feedbacks;
CREATE POLICY "ecarts_oaci_feedbacks_select" ON ecarts_oaci_feedbacks
  FOR SELECT USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "ecarts_oaci_feedbacks_insert" ON ecarts_oaci_feedbacks;
CREATE POLICY "ecarts_oaci_feedbacks_insert" ON ecarts_oaci_feedbacks
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "pac_feedbacks_select" ON pac_learning_feedbacks;
CREATE POLICY "pac_feedbacks_select" ON pac_learning_feedbacks
  FOR SELECT USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "pac_feedbacks_insert" ON pac_learning_feedbacks;
CREATE POLICY "pac_feedbacks_insert" ON pac_learning_feedbacks
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "preuve_feedbacks_select" ON preuve_learning_feedbacks;
CREATE POLICY "preuve_feedbacks_select" ON preuve_learning_feedbacks
  FOR SELECT USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "preuve_feedbacks_insert" ON preuve_learning_feedbacks;
CREATE POLICY "preuve_feedbacks_insert" ON preuve_learning_feedbacks
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','inspector'));

-- Performances modèles IA
DROP POLICY IF EXISTS "model_perf_select" ON model_performance;
CREATE POLICY "model_perf_select" ON model_performance
  FOR SELECT USING (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "model_perf_write" ON model_performance;
CREATE POLICY "model_perf_write" ON model_performance
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.26 SUGGESTION FEEDBACKS (APPRENTISSAGE IA)           ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "suggestion_fb_select" ON suggestion_feedbacks;
CREATE POLICY "suggestion_fb_select" ON suggestion_feedbacks
  FOR SELECT USING (get_user_role() IN ('admin','inspector','dg_anacim','dg_operator'));

DROP POLICY IF EXISTS "suggestion_fb_insert" ON suggestion_feedbacks;
CREATE POLICY "suggestion_fb_insert" ON suggestion_feedbacks
  FOR INSERT WITH CHECK (get_user_role() IN ('admin','inspector'));

DROP POLICY IF EXISTS "suggestion_fb_update" ON suggestion_feedbacks;
CREATE POLICY "suggestion_fb_update" ON suggestion_feedbacks
  FOR UPDATE USING (get_user_role() = 'admin');

-- ╔══════════════════════════════════════════════════════════╗
-- ║  7.27 ML MODEL WEIGHTS (PERSISTANCE MODÈLE)             ║
-- ╚══════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "ml_weights_select" ON ml_model_weights;
CREATE POLICY "ml_weights_select" ON ml_model_weights
  FOR SELECT USING (get_user_role() IN ('admin','inspector','dg_anacim','dg_operator'));

DROP POLICY IF EXISTS "ml_weights_upsert" ON ml_model_weights;
CREATE POLICY "ml_weights_upsert" ON ml_model_weights
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- ============================================================
-- SECTION 8 — PERMISSIONS (inchangées, rappel idempotent)
-- ============================================================

GRANT USAGE              ON SCHEMA public              TO anon, authenticated;
GRANT ALL                ON ALL TABLES    IN SCHEMA public TO authenticated;
GRANT ALL                ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL                ON ALL ROUTINES  IN SCHEMA public TO authenticated;
GRANT SELECT             ON ALL TABLES    IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES    TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- ============================================================
-- SECTION 9 — SEED ADMIN (mise à jour idempotente)
-- ============================================================

INSERT INTO utilisateurs (
  id,
  auth_id,
  email,
  identifiant,
  nom,
  prenom,
  "role",
  "statut",
  force_pwd_change,
  notifications_email
)
VALUES (
  uuid_generate_v4(),
  null,
  'admin@anacim.sn',
  'admin',
  'ANACIM',
  'Administrateur',
  'admin',
  'actif',
  false,
  true
)
ON CONFLICT (email) DO UPDATE SET
  "role"           = 'admin',
  "statut"         = 'actif',
  force_pwd_change = false;
-- Note : auth_id reste null jusqu'à la première connexion Supabase Auth
-- Le trigger corrigé (section 5) le liera automatiquement.

-- ============================================================
-- SECTION 10 — VÉRIFICATIONS POST-EXÉCUTION
-- ============================================================

-- 10.A Tables avec RLS activé mais AUCUNE policy
-- → DOIT retourner 0 ligne après exécution de ce fichier
SELECT relname AS table_sans_policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND c.relname NOT IN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public'
  );

-- 10.B Compter les policies par table
SELECT tablename, count(*) AS nb_policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 10.C Vérifier que l'admin est bien en base
SELECT id, email, "role", "statut", auth_id,
       CASE WHEN auth_id IS NULL THEN '⚠ auth_id manquant' ELSE '✅ OK' END AS etat_auth
FROM utilisateurs
WHERE email = 'admin@anacim.sn';

-- ============================================================
-- ⚠  SECTION 11 — MODIFICATION REQUISE DANS auth.ts
-- CE PROBLÈME NE PEUT PAS ÊTRE RÉSOLU EN SQL SEUL
-- ============================================================
--
-- PROBLÈME : loginWithCode() ne crée pas de session Supabase Auth.
-- Les opérateurs (focal_operator, staff_operator, dg_operator)
-- ont auth.uid() = null → toutes les policies RLS les bloquent.
--
-- SOLUTION : Ajouter signInAnonymously() dans loginWithCode()
-- APRÈS avoir trouvé/créé l'utilisateur :
--
--   // Créer une session Supabase Auth anonyme
--   const { data: anonData, error: anonError } =
--     await supabase.auth.signInAnonymously()
--
--   if (!anonError && anonData?.user) {
--     // Lier cet auth_id à l'utilisateur
--     // (utiliser service_role ou une Edge Function)
--     await supabase
--       .from('utilisateurs')
--       .update({ auth_id: anonData.user.id })
--       .eq('id', utilisateur.id)
--       .eq('statut', 'actif')
--   }
--
-- PRÉREQUIS Supabase : activer "Anonymous sign-ins" dans
-- Dashboard → Authentication → Providers → Anonymous
--
-- ALTERNATIVE (plus robuste) :
-- Créer une Supabase Edge Function "login-with-code" qui
-- utilise le service_role pour lier l'auth_id, puis retourne
-- un custom JWT. Cela évite d'accumuler des sessions anonymes.
--
-- ============================================================

-- ============================================================
-- SECTION 12 — ÉVALUATION SGS PAOE (OACI Annexe 19)
-- Migration de maturite_sgs de 1-5 vers 0-100
-- Ajout de maturite_sgs_detaille (JSONB) et statut_sgs
-- ============================================================

-- 12.A Ajouter / migrer les colonnes SGS
-- ⚡ FIX 2026-05-21 : L'ancienne contrainte CHECK (maturite_sgs BETWEEN 1 AND 5)
--    bloquait l'UPDATE de migration car les nouvelles valeurs (25, 50, 75, 100)
--    violent la plage 1-5.  On la supprime EN PREMIER, avant tout UPDATE.
DO $$
BEGIN
  -- ── Étape 1 : Supprimer l'ancienne contrainte CHECK ──────────
  -- Safe que la contrainte soit sur l'échelle 1-5 ou 0-100.
  ALTER TABLE aerodromes DROP CONSTRAINT IF EXISTS aerodromes_maturite_sgs_check;

  -- ── Étape 2 : Créer la colonne si elle n'existe pas ──────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aerodromes' AND column_name = 'maturite_sgs'
  ) THEN
    ALTER TABLE aerodromes ADD COLUMN maturite_sgs integer DEFAULT 50;
  END IF;

  -- ── Étape 3 : Changer le type smallint → integer si besoin ───
  -- La vue v5_aerodromes (schéma hérité) dépend de la colonne :
  -- on la supprime temporairement, on change le type, on la recrée.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aerodromes' AND column_name = 'maturite_sgs'
      AND data_type = 'smallint'
  ) THEN
    -- Supprimer les vues dépendantes (CASCADE couvre les dépendances en cascade)
    DROP VIEW IF EXISTS v5_aerodromes CASCADE;
    ALTER TABLE aerodromes ALTER COLUMN maturite_sgs TYPE integer USING maturite_sgs::integer;
    -- Recréer la vue de compatibilité
    CREATE OR REPLACE VIEW v5_aerodromes AS SELECT * FROM aerodromes;
  END IF;

  -- ── Étape 4 : Migrer les données encore sur l'échelle 1-5 ────
  -- Couvre : migration initiale + ré-exécution partielle.
  -- Les valeurs déjà sur 0-100 (> 5) ne sont pas touchées.
  UPDATE aerodromes
  SET maturite_sgs = (maturite_sgs - 1) * 25
  WHERE maturite_sgs BETWEEN 1 AND 5;

  -- ── Étape 5 : Corriger les valeurs hors plage (sécurité) ─────
  UPDATE aerodromes
  SET maturite_sgs = 50
  WHERE maturite_sgs IS NULL OR maturite_sgs < 0 OR maturite_sgs > 100;

  -- ── Étape 6 : Remettre la contrainte sur la bonne plage ──────
  ALTER TABLE aerodromes
    ADD CONSTRAINT aerodromes_maturite_sgs_check
    CHECK (maturite_sgs >= 0 AND maturite_sgs <= 100);

  -- ── Étape 7 : Colonnes complémentaires SGS ───────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aerodromes' AND column_name = 'maturite_sgs_detaille'
  ) THEN
    ALTER TABLE aerodromes ADD COLUMN maturite_sgs_detaille jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aerodromes' AND column_name = 'statut_sgs'
  ) THEN
    ALTER TABLE aerodromes ADD COLUMN statut_sgs varchar(20) DEFAULT 'complet';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'aerodromes' AND column_name = 'sgs_checklist_template'
  ) THEN
    ALTER TABLE aerodromes ADD COLUMN sgs_checklist_template jsonb;
  END IF;
END $$;

-- 12.A.1 Valeur par défaut pour les nouveaux aérodromes
ALTER TABLE aerodromes ALTER COLUMN maturite_sgs SET DEFAULT 50;
ALTER TABLE aerodromes ALTER COLUMN statut_sgs SET DEFAULT 'complet';

-- 12.B Index pour les requêtes de filtrage par statut SGS
CREATE INDEX IF NOT EXISTS idx_aerodromes_statut_sgs ON aerodromes(statut_sgs);
CREATE INDEX IF NOT EXISTS idx_aerodromes_maturite_sgs ON aerodromes(maturite_sgs);

-- 12.C Commentaire sur les colonnes
COMMENT ON COLUMN aerodromes.maturite_sgs IS 'Score de maturité SGS 0-100 (modèle PAOE: P=25, A=50, O=75, E=100)';
COMMENT ON COLUMN aerodromes.maturite_sgs_detaille IS 'Détail de l''évaluation SGS: 5 composantes × éléments PAOE (JSONB)';
COMMENT ON COLUMN aerodromes.statut_sgs IS 'Type de SGS: complet, simplifie (hélistation), non_applicable (piste sans personnel)';

-- ============================================================
-- FIN DU FICHIER — SGDA v5 RLS FINAL CORRIGÉ + SGS PAOE
-- ============================================================

-- ============================================================
-- SECTION 13 — COLONNES MANQUANTES (cohérence code ↔ SQL)
-- Généré le : 2026-05-21
-- ✅ Idempotent : safe à ré-exécuter
-- ✅ Couvre toutes les colonnes utilisées dans datastore.ts et store.ts
-- ============================================================

-- 13.A SURVEILLANCES — colonnes core
DO $$ BEGIN
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS planning_id            uuid;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS type                   varchar(30) DEFAULT 'programmee';
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS portee                 jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS equipe_ids             jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS chef_id                uuid;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS date_debut             timestamptz;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS date_fin               timestamptz;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS statut                 varchar(30) DEFAULT 'planifiee';
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS score_global           integer DEFAULT 0;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS observations           text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS justification_declenchement text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS suggestions_maintien   jsonb;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_html           text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_type           varchar(20);
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_fichier_url    text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_fichier_nom    text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_signe_par      text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_signe_le       timestamptz;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_sig_url        text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_pdf_url        text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS checklist_pdf_url      text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS lettre_html            text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS lettre_signee_url      text;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS signatures_checklist   jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS signatures_ecarts      jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS signatures_rapport     jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS transmitted_at         timestamptz;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS created_at             timestamptz DEFAULT now();
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS created_by             uuid;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS updated_by             uuid;
  ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS progression            integer DEFAULT 0;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS checklist_hierarchy    jsonb DEFAULT '[]'::jsonb;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS sgs_evaluation_prepa     jsonb;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS sgs_evaluation_signee_le timestamptz;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS sgs_ecarts_signes_le     timestamptz;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS checklist_suivi_ecarts   jsonb;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS checklist_pac            jsonb;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_sections         text;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_versions         text;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS deleted_by             uuid;
END $$;

-- 13.B ECARTS — colonnes core
DO $$ BEGIN
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS surveillance_id             uuid;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS evenement_id                uuid;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS domaine                     varchar(50);
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS reference                   varchar(50);
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS ref_reglementaire           text;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS libelle                     text;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS niveau_risque               varchar(20);
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS cellule_risque_oaci         varchar(10);
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS probabilite_risque          integer;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS gravite_risque              varchar(5);
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS justification_risque_ia     text;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS cellule_ia_suggeree         varchar(10);
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS statut                      varchar(30) DEFAULT 'ouvert';
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS delai_pac                   timestamptz;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS delai_regularisation        timestamptz;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS inspecteur_ref_id           uuid;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS responsable_id              uuid;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS date_detection              timestamptz;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS cout_estime                 numeric(10,2);
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS pac                         jsonb;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS evaluation_pac              jsonb;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS preuves                     jsonb;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS validation_preuves          jsonb;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS validation_chef             jsonb;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS retard_inspecteur           boolean DEFAULT false;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS evaluation_niveau_risque    jsonb;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS cloture_le                  timestamptz;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS rappels_envoyes             jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS created_at                  timestamptz DEFAULT now();
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS updated_at                  timestamptz DEFAULT now();
  ALTER TABLE ecarts ADD COLUMN IF NOT EXISTS deleted_by                  uuid;
END $$;

-- 13.B-bis ECARTS_REDACTION — colonnes manquantes (miroir d'ecarts)
DO $$ BEGIN
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS domaine                    varchar(50);
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS reference                  varchar(50);
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS ref_reglementaire          text;
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS libelle                    text;
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS niveau_risque              varchar(20);
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS cellule_risque_oaci        varchar(10);
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS probabilite_risque         integer;
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS gravite_risque             varchar(5);
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS justification_risque_ia    text;
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS cellule_ia_suggeree        varchar(10);
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS created_at                 timestamptz DEFAULT now();
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS updated_at                 timestamptz DEFAULT now();
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS item_ids                   text[];
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS surveillance_id            uuid;
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS aerodrome_id               varchar(10);
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS created_by                 uuid;
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS updated_by                 uuid;
  ALTER TABLE ecarts_redaction ADD COLUMN IF NOT EXISTS niveau                     varchar(20);
  -- Convertir item_ids de uuid[] vers text[] si nécessaire (les IDs checklist ne sont pas des UUID)
  PERFORM 1 FROM information_schema.columns WHERE table_name = 'ecarts_redaction' AND column_name = 'item_ids' AND udt_name = '_uuid';
  IF FOUND THEN
    ALTER TABLE ecarts_redaction ALTER COLUMN item_ids TYPE text[] USING item_ids::text[];
  END IF;
END $$;

-- 13.C PLANNINGS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS type                     varchar(30) DEFAULT 'programmee';
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS date_debut               timestamptz;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS date_fin                 timestamptz;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS portee                   jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS equipe_ids               jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS chef_id                  uuid;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS statut                   varchar(30) DEFAULT 'planifiee';
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS priorite                 varchar(20);
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS objectifs                text;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS observations             text;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS est_proposition          boolean DEFAULT false;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS annee_cible              integer;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS surveillance_id          uuid;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS sgs_evaluation_prepa     jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS created_at               timestamptz DEFAULT now();
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS updated_at               timestamptz DEFAULT now();
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS deleted_by               uuid;
  -- Colonnes ajoutées par planningGenerator (2026-05-29)
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS rappels_envoyes         jsonb DEFAULT '{}'::jsonb;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS confirme_le             timestamptz;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS confirme_par            text;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS date_confirmee          timestamptz;
  ALTER TABLE plannings ADD COLUMN IF NOT EXISTS motif_report            text;
  -- Permettre chef_id NULL pour les surveillances auto-créées
  ALTER TABLE plannings ALTER COLUMN chef_id DROP NOT NULL;
END $$;

-- 13.D AERODROMES — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS type                    varchar(30);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS type_entite             varchar(50);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS categorie_sslia         varchar(20);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS region                  varchar(50);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS exploitant_id           uuid;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS exploitant_nom          text;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS exploitant_adresse      text;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS exploitant_telephone    text;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS statut                  varchar(20) DEFAULT 'actif';
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS lat                     numeric(10,7);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS lon                     numeric(10,7);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS altitude                integer;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS piste_principale        jsonb;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS helistation             jsonb;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS horaires                text;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS aides_visuelles         jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS contacts                jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS homologue_le            date;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS numero_homologation     varchar(50);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS statut_certification    varchar(30) DEFAULT 'non_certifie';
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS certifie_le             date;
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS numero_certificat       varchar(50);
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS created_at              timestamptz DEFAULT now();
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS updated_at              timestamptz DEFAULT now();
  ALTER TABLE aerodromes ADD COLUMN IF NOT EXISTS deleted_by              uuid;
END $$;

COMMENT ON COLUMN aerodromes.homologue_le         IS 'Date d''homologation de l''aérodrome (délivrée par l''autorité compétente)';
COMMENT ON COLUMN aerodromes.numero_homologation  IS 'Numéro de décision d''homologation (ex: HOM/ANACIM/2024/001)';
COMMENT ON COLUMN aerodromes.statut_certification IS 'Statut : certifie | homologue | non_certifie | non_homologue';
COMMENT ON COLUMN aerodromes.certifie_le          IS 'Date de délivrance du certificat (aérodromes internationaux)';
COMMENT ON COLUMN aerodromes.numero_certificat    IS 'Numéro du certificat ANACIM (ex: ANACIM/CERT/2024/001)';

-- 13.E UTILISATEURS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS telephone             text;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS password_temporaire   boolean DEFAULT false;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS notifications_sms     boolean DEFAULT false;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS matricule             varchar(30);
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS service               varchar(50);
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS last_login            timestamptz;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS competences           jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS specialites           jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS notification_email    text;
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS deleted_by            uuid;
  -- updated_at : le Dashboard Supabase a créé un trigger "handle_updated_at"
  -- qui référence NEW.updated_at ; sans cette colonne, chaque INSERT/UPDATE
  -- échoue avec `record "new" has no field "updated_at"`.
  ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();
END $$;

-- 13.E.b — Contrainte FK utilisateurs.aerodrome_id → aerodromes(id) ON DELETE SET NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_utilisateurs_aerodrome'
  ) THEN
    ALTER TABLE utilisateurs
      ADD CONSTRAINT fk_utilisateurs_aerodrome
      FOREIGN KEY (aerodrome_id) REFERENCES aerodromes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 13.E.c — FK dossiers.inspecteur_id → utilisateurs(id) : ON DELETE SET NULL
-- (contrainte créée via l'UI Supabase qui bloquait la suppression des
-- utilisateurs ayant des dossiers assignés)
DO $$
DECLARE
  v_fk text;
BEGIN
  SELECT conname INTO v_fk
  FROM pg_constraint
  WHERE conrelid = 'dossiers'::regclass
    AND contype = 'f'
    AND confrelid = 'utilisateurs'::regclass
    AND conname LIKE 'dossiers_inspecteur_id_fkey%'
  LIMIT 1;

  IF v_fk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE dossiers DROP CONSTRAINT %I', v_fk);
  END IF;
END $$;
ALTER TABLE dossiers
  ADD CONSTRAINT dossiers_inspecteur_id_fkey
  FOREIGN KEY (inspecteur_id) REFERENCES utilisateurs(id)
  ON DELETE SET NULL;

-- 13.F CERTIFICATIONS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS reference           varchar(50);
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS phase_active        integer DEFAULT 1;
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS phases_data         jsonb DEFAULT '{}'::jsonb;
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS statut_global       varchar(30) DEFAULT 'en_cours';
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS numero_cert         varchar(50);
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS date_delivrance     timestamptz;
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS date_expiration     timestamptz;
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS lettre_signee_url   text;
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS type_certification  varchar(30);
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS archived_at         timestamptz;
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS exemptions_ids      jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS created_at          timestamptz DEFAULT now();
  ALTER TABLE certifications ADD COLUMN IF NOT EXISTS updated_at          timestamptz DEFAULT now();
END $$;

-- 13.G HOMOLOGATIONS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS reference            varchar(50);
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS phase_active         integer DEFAULT 1;
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS phases_data          jsonb DEFAULT '{}'::jsonb;
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS statut_global        varchar(30) DEFAULT 'en_cours';
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS numero_decision      varchar(50);
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS date_delivrance      timestamptz;
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS date_expiration      timestamptz;
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS decision_signee_url  text;
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS type_homologation    varchar(30);
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS archived_at          timestamptz;
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS exemptions_ids       jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS created_at           timestamptz DEFAULT now();
  ALTER TABLE homologations ADD COLUMN IF NOT EXISTS updated_at           timestamptz DEFAULT now();
END $$;

-- 13.H DOSSIERS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS aerodrome_id              uuid;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS titre                     text;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS reference                 varchar(50);
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS categorie                 varchar(30);
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS demandeur                 jsonb;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS service_assigne           varchar(50);
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS inspecteur_id             uuid;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS instructions              text;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS date_instruction          timestamptz;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS date_limite               timestamptz;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS fichiers                  jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS progression               integer DEFAULT 0;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS preuve_traitement         jsonb;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS statut                    varchar(30) DEFAULT 'en_attente';
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS historique                jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS archived_at               timestamptz;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS created_at                timestamptz DEFAULT now();
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS updated_at                timestamptz DEFAULT now();
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS created_by                uuid;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS assignments               jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS urgence                   varchar(10) DEFAULT 'normale';
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS checklist_traitement      jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS checklist_generee_le      timestamptz;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS analyses_ia               jsonb DEFAULT '{}'::jsonb;
  ALTER TABLE dossiers ADD COLUMN IF NOT EXISTS formulaires               jsonb DEFAULT '[]'::jsonb;
END $$;

-- 13.H.2 DOSSIERS — index pour la recherche par inspecteur dans les assignments
DROP INDEX IF EXISTS idx_dossiers_assignments_gin;
CREATE INDEX IF NOT EXISTS idx_dossiers_assignments_gin ON dossiers USING GIN (assignments);

-- 13.I FORMATIONS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS reference               varchar(50);
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS titre                   text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS type                    varchar(30);
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS domaines                jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS date                    timestamptz;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS duree_heures            integer;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS lieu                    text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS formateur               text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS formateur_externe       text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS participants            jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS objectifs               text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS programme               text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS documents               jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS budget                  numeric(10,2);
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS certificat              text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS certificat_nom          text;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS date_debut_reelle       timestamptz;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS statut                  varchar(30);
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS presence                jsonb;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS evaluation              jsonb;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS created_at              timestamptz DEFAULT now();
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS created_by              uuid;
  ALTER TABLE formations ADD COLUMN IF NOT EXISTS deleted_by              uuid;
END $$;

-- 13.J INSPECTEURS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS matricule              varchar(30);
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS prenom                 text;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS nom                    text;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS email                  text;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS telephone              text;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS type                   varchar(30);
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS service                varchar(50);
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS domaine_principal      varchar(50);
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS photo                  text;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS statut                 varchar(20) DEFAULT 'actif';
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS competences            jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS formations             jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS user_id                uuid;
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS created_at             timestamptz DEFAULT now();
  ALTER TABLE inspecteurs ADD COLUMN IF NOT EXISTS deleted_by             uuid;
END $$;

-- 13.K COMPETENCES — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE competences ADD COLUMN IF NOT EXISTS inspecteur_id          uuid;
  ALTER TABLE competences ADD COLUMN IF NOT EXISTS domaine                varchar(50);
  ALTER TABLE competences ADD COLUMN IF NOT EXISTS niveau                 integer;
  ALTER TABLE competences ADD COLUMN IF NOT EXISTS date_obtention         timestamptz;
  ALTER TABLE competences ADD COLUMN IF NOT EXISTS source                 varchar(30);
  ALTER TABLE competences ADD COLUMN IF NOT EXISTS source_id              uuid;
  ALTER TABLE competences ADD COLUMN IF NOT EXISTS expire_le              timestamptz;
END $$;

-- 13.L EVENEMENTS_SECURITE — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS reference      varchar(50);
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS type           varchar(50);
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS gravite        varchar(20);
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS date           timestamptz;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS heure          time;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS localisation   text;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS description    text;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS aeronef        jsonb;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS blesses        jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS dommages_desc  text;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS dommages_estimation numeric(10,2);
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS actions_immediates text;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS services_alertes jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS statut         varchar(30) DEFAULT 'ouvert';
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS inspecteur_id  uuid;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS date_assignation timestamptz;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS date_cloture   timestamptz;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS ecart_ids      jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS rapport_final_url text;
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now();
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();
  ALTER TABLE evenements_securite ADD COLUMN IF NOT EXISTS created_by     uuid;
END $$;

-- 13.M NOTIFICATIONS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type                 varchar(30);
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title                text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message              text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link                 text;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS canal                varchar(20);
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent_at              timestamptz DEFAULT now();
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at              timestamptz;
  ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data                 jsonb;
END $$;

-- 13.N CHECKLIST_ITEMS — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS surveillance_id    uuid;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS type_checklist     varchar(30);
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS categorie          varchar(50);
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS reference_ras14    text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS description        text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS directive_preuve   text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS domaine            varchar(50);
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS ordre              integer;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS resultat           varchar(10);
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS observation        text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS fichiers           jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS last_modified      timestamptz;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS modified_by        uuid;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS numero             varchar(20);
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS reference_reglementaire text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS point_verification text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS prediction         varchar(10);
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS confiance          numeric(5,2);
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS justification      text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS alerte             boolean DEFAULT false;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS prefilled          boolean DEFAULT false;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS observation_stylus_data text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS directive_sa       text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS directive_ns       text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS directive_nv       text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS directive_na       text;
  ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS mode_saisie_obs    varchar(20);
END $$;

-- 13.O PROFILS_RISQUE — colonnes manquantes
DO $$ BEGIN
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS score_global        integer;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS niveau              varchar(20);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS c1                  integer;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS c2                  integer;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS c3                  integer;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS c4                  integer;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS c5                  integer;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS prediction_3m       numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS prediction_6m       numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS prediction_12m      numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS prediction_interval_3m jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS prediction_interval_6m jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS tendance            varchar(20);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS computed_at         timestamptz;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS historical_scores   jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS velocity_metrics    jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS system_stress       jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS proactive_alert     jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS hawkes_intensity    numeric(10,4);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS effectiveness_score numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS last_change_point   timestamptz;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS incident_prediction_3m  numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS incident_prediction_6m  numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS incident_prediction_12m numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS event_frequency     numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS event_severity_trend varchar(20);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS days_since_last_event integer;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS event_trend_acceleration numeric(10,4);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS bayesian_posterior  numeric(10,4);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS bayesian_prior      numeric(10,4);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS bayesian_black_swan boolean DEFAULT false;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS scenarios           jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS ensemble_confidence numeric(10,4);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS infrastructure      jsonb;
  -- MODÈLES AVANCÉS Phase 3 (stockés dans le profil côté client)
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS hmm_state       jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS survival_metrics jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS extreme_risk     jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS negbin_metrics   jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS copula_metrics   jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS ts_metrics       jsonb;
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS quality_score    numeric(10,2);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS qualite          varchar(20);
  ALTER TABLE profils_risque ADD COLUMN IF NOT EXISTS bowtie_metrics   jsonb;
END $$;

-- 13.P INDEX pour les colonnes ajoutées
CREATE INDEX IF NOT EXISTS idx_surveillances_statut ON surveillances(statut);
CREATE INDEX IF NOT EXISTS idx_surveillances_type ON surveillances(type);
CREATE INDEX IF NOT EXISTS idx_surveillances_aerodrome ON surveillances(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_surveillances_date_debut ON surveillances(date_debut);
CREATE INDEX IF NOT EXISTS idx_ecarts_surveillance ON ecarts(surveillance_id);
CREATE INDEX IF NOT EXISTS idx_ecarts_statut ON ecarts(statut);
CREATE INDEX IF NOT EXISTS idx_ecarts_niveau ON ecarts(niveau_risque);
CREATE INDEX IF NOT EXISTS idx_ecarts_aerodrome ON ecarts(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_plannings_statut ON plannings(statut);
CREATE INDEX IF NOT EXISTS idx_plannings_date_debut ON plannings(date_debut);
CREATE INDEX IF NOT EXISTS idx_certifications_statut ON certifications(statut_global);
CREATE INDEX IF NOT EXISTS idx_certifications_aerodrome ON certifications(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_homologations_statut ON homologations(statut_global);
CREATE INDEX IF NOT EXISTS idx_homologations_aerodrome ON homologations(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_statut ON dossiers(statut);
CREATE INDEX IF NOT EXISTS idx_dossiers_aerodrome ON dossiers(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_dossiers_categorie ON dossiers(categorie);
CREATE INDEX IF NOT EXISTS idx_formations_date ON formations(date);
CREATE INDEX IF NOT EXISTS idx_formations_statut ON formations(statut);
CREATE INDEX IF NOT EXISTS idx_evenements_statut ON evenements_securite(statut);
CREATE INDEX IF NOT EXISTS idx_evenements_date ON evenements_securite(date);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_checklist_surveillance ON checklist_items(surveillance_id);
CREATE INDEX IF NOT EXISTS idx_competences_inspecteur ON competences(inspecteur_id);
CREATE INDEX IF NOT EXISTS idx_profils_risque_aerodrome ON profils_risque(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_inspecteurs_statut ON inspecteurs(statut);
CREATE INDEX IF NOT EXISTS idx_inspecteurs_matricule ON inspecteurs(matricule);

-- 13.Q COMMENTAIRES sur les colonnes critiques
COMMENT ON COLUMN surveillances.portee IS 'Domaines couverts: ["SGS", "Standard", ...]';
COMMENT ON COLUMN surveillances.equipe_ids IS 'UUIDs des inspecteurs assignés';
COMMENT ON COLUMN surveillances.statut IS 'planifiee, en_cours, checklist_signee, ecarts_signes, rapport_signe, lettre_signee, transmise, archivee';
COMMENT ON COLUMN surveillances.signatures_checklist IS 'Array JSON de signatures: [{signataire_id, signataire_nom, date_signature, signature_url}]';
COMMENT ON COLUMN surveillances.signatures_ecarts IS 'Array JSON de signatures';
COMMENT ON COLUMN surveillances.signatures_rapport IS 'Array JSON de signatures';
COMMENT ON COLUMN ecarts.pac IS 'Plan d''actions correctives: {actions, observations, fichiers, soumis_par, soumis_le, version}';
COMMENT ON COLUMN ecarts.evaluation_pac IS 'Évaluation PAC: {note_pertinence, note_exhaustivite, decision, ...}';
COMMENT ON COLUMN ecarts.preuves IS 'Preuves soumises: {fichiers, commentaire, soumis_par, soumis_le}';
COMMENT ON COLUMN ecarts.validation_preuves IS 'Validation preuves: {decision, commentaire, valide_par, valide_le}';
COMMENT ON COLUMN ecarts.validation_chef IS 'Validation chef d''équipe: {type, statut, approuve_par, approuve_le, commentaire}';
COMMENT ON COLUMN certifications.phases_data IS 'Données des 5 phases: {phase1, phase2, phase3, phase4, phase5}';
COMMENT ON COLUMN homologations.phases_data IS 'Données des 3 phases: {phase1, phase2, phase3}';
COMMENT ON COLUMN dossiers.demandeur IS 'Info demandeur: {nom, organisation, contact}';
COMMENT ON COLUMN dossiers.fichiers IS 'Array JSON de fichiers: [{id, nom, url, taille, type, date_upload}]';
COMMENT ON COLUMN dossiers.historique IS 'Array JSON d''historique: [{date, action, utilisateur, commentaire}]';
COMMENT ON COLUMN aerodromes.piste_principale IS 'Info piste: {longueur, largeur, surface, orientation}';
COMMENT ON COLUMN profils_risque.scenarios IS 'Scénarios de risque prédits par l''IA';

-- ============================================================
-- SECTION 14 — AMÉLIORATIONS SESSION 2026-05-21
-- Modifications TypeScript / UI — aucune nouvelle colonne DB
-- ✅ Idempotent : safe à ré-exécuter
-- ============================================================
--
-- 14.A CORRECTIFS APPLIQUÉS
-- ─────────────────────────────────────────────────────────
-- 14.A.1  Stepper surveillance : statuts "transmise" / "archivee"
--         affichent désormais "Complété" (badge vert) au lieu de
--         "En cours" sur la dernière étape.
--         → Fichier : components/modules/surveillance/SurveillanceStepper.tsx
--         → Aucune modification DB
--
-- 14.A.2  SGS checklist (SGSEvaluation.tsx) — UX badge unique PAOE :
--         - Remplacement des 5 boutons toujours visibles par un badge
--           cliquable qui ouvre un picker flottant.
--         - Suppression de la restriction séquentielle : l'inspecteur
--           peut sélectionner n'importe quel niveau PAOE librement.
--         - Seuls les niveaux — (absent), P (présent) et A (approprié)
--           alimentent la rédaction des écarts SGS (O et E n'impliquent
--           pas d'écart selon l'Annexe 19 OACI / Doc 9859).
--         → Fichier : components/modules/surveillance/SGSEvaluation.tsx
--         → Aucune modification DB (le niveau est stocké dans
--           aerodromes.maturite_sgs_detaille JSONB — Section 12)
--
-- 14.A.3  Rédaction des écarts SGS (SurveillanceEcartsRedaction.tsx) :
--         - Badge niveau affiché spécifiquement : —, P ou A
--           (au lieu du badge générique NS/NV).
--         - Champ "Niveau de risque" masqué pour les évaluations 100 %
--           SGS (non applicable selon Annexe 19).
--         - Suggestion IA réactivée pour le SGS avec prompt dédié
--           (lib/ia/prompts.ts : SGS_ECART_SYSTEM_PROMPT) référençant
--           l'Annexe 19 et le Doc 9859 — format PAOE-aware, sans
--           mention de la matrice OACI probabilité × gravité.
--         → Fichiers : SurveillanceEcartsRedaction.tsx,
--                      lib/ia/agents/ecartAgent.ts,
--                      lib/ia/prompts.ts,
--                      app/surveillance/[id]/ecarts/sgs/page.tsx
--         → Aucune modification DB
--
-- 14.A.4  Suppression des sous-onglets "Archives" dans :
--         - CertificationModule.tsx
--         - HomologationModule.tsx
--         - SurveillanceModule.tsx
--         - PlansActionsModule.tsx
--         Ces onglets sont remplacés par un lien "Archives → Registres"
--         qui redirige vers le module Registres (setActiveModule).
--         Le module Registres reste la source unique d'archivage.
--         → Aucune modification DB
--
-- 14.A.5  Correction UUID écarts rédaction :
--         Remplacement de l'identifiant non-UUID (ecart-TIMESTAMP-RAND)
--         par crypto.randomUUID() dans SurveillanceEcartsRedaction.tsx.
--         Validation regex UUID ajoutée dans lib/store.ts comme filet
--         de sécurité pour les données IndexedDB existantes.
--         → Aucune modification DB (la colonne ecarts.id est déjà uuid)
--
-- 14.A.6  Correction "Rendered fewer hooks than expected" (app/page.tsx) :
--         Utilisation du batching React 18 pour setSyncing(true) +
--         setHydrationDone(true) dans le même callback d'hydration
--         Zustand, garantissant que TakeoffSplash est affiché pendant
--         toute la phase de synchronisation Supabase.
--         → Aucune modification DB
--
-- 14.B RAPPEL ARCHITECTURE DONNÉES SGS
-- ─────────────────────────────────────────────────────────
-- Le flux complet SGS dans Supabase :
--
--   1. Préparation (planning) :
--      plannings.sgs_evaluation_prepa  JSONB  ← Section 13.C ✅
--      (structure : { composantes, items, datePrepa, preparePar })
--
--   2. Score de maturité (aérodrome) :
--      aerodromes.maturite_sgs          INTEGER ← Section 12 ✅
--      aerodromes.maturite_sgs_detaille JSONB   ← Section 12 ✅
--      aerodromes.statut_sgs            VARCHAR ← Section 12 ✅
--
--   3. Écarts SGS convertis depuis la rédaction :
--      ecarts.domaine                   VARCHAR(50) ← Section 13.B ✅
--      ecarts.cellule_risque_oaci       VARCHAR(10) ← Section 13.B ✅
--      ecarts.probabilite_risque        INTEGER     ← Section 13.B ✅
--      ecarts.gravite_risque            VARCHAR(5)  ← Section 13.B ✅
--      ecarts.justification_risque_ia   TEXT        ← Section 13.B ✅
--      ecarts.cellule_ia_suggeree       VARCHAR(10) ← Section 13.B ✅
--
--   Note (MAJ 2026-08-25) : surveillances.sgs_evaluation_prepa,
--   sgs_evaluation_signee_le et sgs_ecarts_signes_le sont PERSISTES.
--   L'evaluation SGS signee fait partie du dossier legal et doit
--   survivre au rechargement. Voir Section 13.A (colonnes SURVEILLANCES).
--
-- ============================================================
-- FIN SECTION 14 — SGDA v5 · Session 2026-05-21
-- ============================================================

-- ============================================================
-- SECTION 15 — CORRECTIF PORTAIL EXPLOITANT (2026-05-21)
-- Résout le problème "l'exploitant ne voit rien après transmission"
-- ✅ Idempotent : safe à ré-exécuter
-- ============================================================
--
-- PROBLÈME RACINE :
--   1. signInAnonymously() crée auth.uid() = Z (session anonyme)
--   2. La policy "utilisateurs_update" bloque le UPDATE auth_id
--      car : auth_id (null) ≠ auth.uid() (Z)  ET  get_user_role()
--      retourne NULL (aucun row lié dans utilisateurs)
--   3. get_user_role() / get_user_aerodrome_id() retournent NULL
--      → toutes les tables protégées par RLS retournent 0 lignes
--   4. kit_documents absent de loadInitialData → toujours vide
--
-- SOLUTION :
--   → Fonction SECURITY DEFINER qui bypasse RLS pour lier auth_id
--   → Appelée depuis auth.ts après signInAnonymously()
--   → kit_documents ajouté dans loadInitialData (datastore.ts)
-- ============================================================

-- 15.A Fonction upsert_operator_by_code
-- Crée ou met à jour un utilisateur opérateur en liant
-- l'auth_id de la session anonyme fraîchement créée.
-- SECURITY DEFINER = s'exécute comme le propriétaire de la
-- fonction (postgres) → bypasse les RLS de la table utilisateurs.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION upsert_operator_by_code(
  p_aerodrome_id  UUID,
  p_role          TEXT,
  p_email         TEXT,
  p_identifiant   TEXT,
  p_nom           TEXT,
  p_prenom        TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID;
  v_auth_id  UUID;
  v_result   JSONB;
BEGIN
  v_auth_id := auth.uid();

  -- Sécurité : auth.uid() doit être set (signInAnonymously appelé avant)
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION
      'upsert_operator_by_code: auth.uid() est NULL — '
      'appelez signInAnonymously() avant cette fonction';
  END IF;

  -- Chercher l'utilisateur opérateur existant pour cet aérodrome + rôle
  SELECT id INTO v_user_id
  FROM utilisateurs
  WHERE aerodrome_id = p_aerodrome_id
    AND "role"       = p_role
    AND statut       = 'actif'
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- ── Utilisateur existant : lier le nouvel auth_id ────────
    UPDATE utilisateurs
    SET auth_id    = v_auth_id,
        last_login = NOW(),
        updated_at = NOW(),
        nom        = CASE WHEN p_nom    <> '' THEN p_nom    ELSE nom    END,
        prenom     = CASE WHEN p_prenom <> '' THEN p_prenom ELSE prenom END
    WHERE id = v_user_id;

  ELSE
    -- ── Pas d'utilisateur : en créer un ─────────────────────
    INSERT INTO utilisateurs(
      id,                auth_id,    email,       identifiant,
      nom,               prenom,     "role",      aerodrome_id,
      statut,            notifications_email,      notifications_sms,
      force_pwd_change,  created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), v_auth_id,  p_email,     p_identifiant,
      p_nom,             p_prenom,   p_role,       p_aerodrome_id,
      'actif',           false,       false,
      false,             NOW(),       NOW()
    )
    RETURNING id INTO v_user_id;
  END IF;

  -- Retourner toutes les colonnes de l'utilisateur en JSONB
  SELECT to_jsonb(u) INTO v_result
  FROM utilisateurs u
  WHERE u.id = v_user_id;

  RETURN v_result;
END;
$$;

-- Autoriser les utilisateurs authentifiés (y compris anonymes) à appeler
GRANT EXECUTE ON FUNCTION upsert_operator_by_code TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 15.B Rappel : activer "Anonymous sign-ins" dans Supabase
-- Dashboard → Authentication → Providers → Anonymous → Enable
-- ─────────────────────────────────────────────────────────────

-- ============================================================
-- FIN SECTION 15 — Portail exploitant
-- ============================================================

-- ============================================================
-- SECTION 16 — WORKFLOW INSTRUCTEUR SUR EXEMPTIONS
-- Colonnes ajoutées pour le processus :
--   exploitant soumet → ANACIM accuse réception → instruction
--   → décision (favorable / à réviser / défavorable)
-- ============================================================

DO $$ BEGIN
  ALTER TABLE exemptions ADD COLUMN IF NOT EXISTS workflow_statut          text;
  ALTER TABLE exemptions ADD COLUMN IF NOT EXISTS avis_final               text;
  ALTER TABLE exemptions ADD COLUMN IF NOT EXISTS inspecteur_commentaires  text;
  ALTER TABLE exemptions ADD COLUMN IF NOT EXISTS inspecteur_fichiers      jsonb DEFAULT '[]'::jsonb;
  ALTER TABLE exemptions ADD COLUMN IF NOT EXISTS date_accuse_reception    timestamptz;
  ALTER TABLE exemptions ADD COLUMN IF NOT EXISTS date_decision            timestamptz;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

COMMENT ON COLUMN exemptions.workflow_statut         IS 'en_attente | accuse | en_cours — étape workflow instructeur';
COMMENT ON COLUMN exemptions.avis_final              IS 'favorable | a_reviser | defavorable — décision finale';
COMMENT ON COLUMN exemptions.inspecteur_commentaires IS 'Avis et observations de l''inspecteur';
COMMENT ON COLUMN exemptions.inspecteur_fichiers     IS 'Fichiers joints par l''inspecteur [{nom, url}]';
COMMENT ON COLUMN exemptions.date_accuse_reception   IS 'Date de l''accusé réception par l''inspecteur';
COMMENT ON COLUMN exemptions.date_decision           IS 'Date de la décision finale';

-- ============================================================
-- FIN SECTION 16 — Workflow instructeur exemptions
-- ============================================================

-- ============================================================
-- SECTION 17 — NETTOYAGE FICHIERS ORPHELINS (2026-06-22)
-- Fichiers supprimés (plus importés depuis la refonte UI) :
--   components/modules/certification/CertDashboard.tsx
--   components/modules/homologation/HomoDashboard.tsx
-- Les KPIs sont désormais intégrés directement dans
-- CertificationModule.tsx et HomologationModule.tsx.
-- ✅ Aucune modification DB — documentation uniquement
-- ============================================================

-- ============================================================
-- SECTION 18 — CHECKLIST TEMPLATES (2026-07-29)
-- Templates maîtres importés depuis les modèles Word ANACIM
-- (IT, SOP, QSC, SGS, validation de site).
-- L'IA n'est plus utilisée pour générer la baseline ;
-- les templates officiels sont la source de vérité.
-- ============================================================

CREATE TABLE IF NOT EXISTS checklist_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type              text        NOT NULL CHECK (type IN ('IT', 'SOP', 'QSC', 'SGS', 'VALIDATION_SITE', 'HMG', 'COP', 'AUT')),
  code              text        NOT NULL,
  nom               text        NOT NULL,
  version           text        NOT NULL DEFAULT '1.0',
  edition_date      text,
  source_fichier    text,
  fichier_url       text,
  description       text,
  portee            text[]      NOT NULL DEFAULT '{}',
  type_entite_cible text        NOT NULL DEFAULT 'aerodrome' CHECK (type_entite_cible IN ('aerodrome', 'helistation', 'mixte', 'tous')),
  etat              text        NOT NULL DEFAULT 'brouillon' CHECK (etat IN ('brouillon', 'publie', 'archive')),
  categorie         text        NOT NULL DEFAULT 'autres' CHECK (categorie IN ('homologation', 'certification', 'surveillance_continue', 'validation_site', 'autres')),
  regime            text        NOT NULL DEFAULT 'tous' CHECK (regime IN ('certifie', 'homologue', 'tous')),
  hierarchie        jsonb       NOT NULL DEFAULT '[]'::jsonb,
  metadonnees       jsonb       DEFAULT '{}'::jsonb,
  actif             boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Rattrapage pour bases existantes créées par une version antérieure
-- (la table peut déjà exister SANS ces colonnes) : CREATE TABLE IF NOT
-- EXISTS ne modifie pas une table existante, il faut donc les ajouter.
-- Idempotent : sans effet si la colonne existe déjà.
ALTER TABLE checklist_templates DROP CONSTRAINT IF EXISTS checklist_templates_type_check;
ALTER TABLE checklist_templates ADD CONSTRAINT checklist_templates_type_check
  CHECK (type IN ('IT', 'SOP', 'QSC', 'SGS', 'VALIDATION_SITE', 'HMG', 'COP', 'AUT'));

ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS categorie text
  NOT NULL DEFAULT 'autres'
  CHECK (categorie IN ('homologation', 'certification', 'surveillance_continue', 'validation_site', 'autres'));

ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS regime text
  NOT NULL DEFAULT 'tous'
  CHECK (regime IN ('certifie', 'homologue', 'tous'));

ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Unicité : un seul template ACTIF par (type, code) — les versions
-- précédentes passent etat='archive' et conservent leur historique.
-- Remplace la contrainte UNIQUE(type, code, version) d'origine.
ALTER TABLE checklist_templates DROP CONSTRAINT IF EXISTS uq_checklist_template;
CREATE UNIQUE INDEX IF NOT EXISTS uq_checklist_template_active
  ON checklist_templates (type, code) WHERE actif = true;

COMMENT ON TABLE  checklist_templates              IS 'Templates maîtres de checklist importés des modèles Word ANACIM (IT, SOP, QSC, SGS, HMG, COP). Source de vérité pour la génération de checklist.';
COMMENT ON COLUMN checklist_templates.type          IS 'Préfixe de code : IT=Inspection Technique (regroupe les domaines PHY, ELEC, MFP, OLS), SOP=Procédures, QSC=Surveillance Continue, SGS=PAOE, VALIDATION_SITE=Validation site, HMG=Homologation, COP=COP, AUT=Autres';
COMMENT ON COLUMN checklist_templates.code          IS 'Identifiant unique du template. IT : un code par fichier/domaine — IT_CHKLIST_PHY, IT_CHKLIST_ELEC, IT_CHKLIST_MFP, IT_CHKLIST_OLS, IT_CHKLIST_SLI, IT_CHKLIST_RA, ou combinés (ex: IT_CHKLIST_ELEC_MFP), IT_CHKLIST_GENERAL si non spécifié. Autres : SOP_CHKLIST_GENERAL, QSC_CONTINUE, SGS_PAOE, VS_CHKLIST_GENERAL, HMG_CHKLIST_GENERAL, COP_CHKLIST_GENERAL, AUT_*';
COMMENT ON COLUMN checklist_templates.nom           IS 'Nom lisible (ex: Caractéristiques physiques et surfaces de limitation des obstacles)';
COMMENT ON COLUMN checklist_templates.version       IS 'Version du template (ex: NOV 2025)';
COMMENT ON COLUMN checklist_templates.edition_date  IS 'Date d''édition (ex: Novembre 2025)';
COMMENT ON COLUMN checklist_templates.source_fichier IS 'Nom du fichier Word d''origine importé';
COMMENT ON COLUMN checklist_templates.fichier_url   IS 'URL du fichier source stocké dans Supabase Storage';
COMMENT ON COLUMN checklist_templates.portee         IS 'Codes domaines couverts (PHY, ELEC, MFP, OLS, OPS, SLI, SGS, OBS…)';
COMMENT ON COLUMN checklist_templates.type_entite_cible IS 'aerodrome | helistation | mixte | tous';
COMMENT ON COLUMN checklist_templates.etat           IS 'brouillon | publie | archive';
COMMENT ON COLUMN checklist_templates.categorie      IS 'Famille métier guidée à l''import : homologation | certification | surveillance_continue | validation_site | autres';
COMMENT ON COLUMN checklist_templates.regime         IS 'Régime (surveillance continue) : certifie | homologue | tous';
COMMENT ON COLUMN checklist_templates.hierarchie     IS 'Arbre complet DomaineChecklist[] au format JSON : [{id, nom, description, items, sousDomaines, …}]';
COMMENT ON COLUMN checklist_templates.metadonnees    IS 'Métadonnées additionnelles : auteur, édition, références, nb_items, nb_sections, etc.';
COMMENT ON COLUMN checklist_templates.actif          IS 'Template actif (utilisable) ou désactivé';
COMMENT ON COLUMN checklist_templates.updated_by     IS 'Utilisateur ayant effectué la dernière modification';

-- Index pour recherche rapide par type + portee
CREATE INDEX IF NOT EXISTS idx_checklist_templates_type_portee ON checklist_templates USING GIN (portee);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_type_etat   ON checklist_templates (type, etat);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_actif       ON checklist_templates (actif) WHERE actif = true;
CREATE INDEX IF NOT EXISTS idx_checklist_templates_categorie   ON checklist_templates (categorie);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_regime      ON checklist_templates (regime);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_checklist_templates_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_checklist_templates_updated_at ON checklist_templates;
CREATE TRIGGER trg_checklist_templates_updated_at
  BEFORE UPDATE ON checklist_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_checklist_templates_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Lecture : tous les utilisateurs authentifiés peuvent voir les templates publiés
  CREATE POLICY checklist_templates_select
    ON checklist_templates FOR SELECT
    USING (etat = 'publie' OR etat = 'archive' OR created_by = auth.uid());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  -- Écriture : seuls admin et inspecteur peuvent créer/modifier
  CREATE POLICY checklist_templates_insert
    ON checklist_templates FOR INSERT
    WITH CHECK (get_user_role() IN ('admin', 'inspector'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY checklist_templates_update
    ON checklist_templates FOR UPDATE
    USING (get_user_role() IN ('admin', 'inspector'))
    WITH CHECK (get_user_role() IN ('admin', 'inspector'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY checklist_templates_delete
    ON checklist_templates FOR DELETE
    USING (get_user_role() = 'admin');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Grants
GRANT SELECT ON checklist_templates TO authenticated;
GRANT INSERT, UPDATE ON checklist_templates TO authenticated;

-- ============================================================
-- FIN SECTION 18 — Checklist templates
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  SECTION 19 — AMDEC (Analyse des Modes de Défaillance)    ║
-- ║  Criticité IPR = Gravité × Probabilité × Détection        ║
-- ║  Persistée par aérodrome, reliée aux écarts/PAC (ecart_id)║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS amdec_analyses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aerodrome_id     UUID NOT NULL REFERENCES aerodromes(id) ON DELETE CASCADE,
  mode_id          TEXT NOT NULL,
  domaine          TEXT NOT NULL,
  systeme          TEXT NOT NULL,
  equipement       TEXT NOT NULL DEFAULT '',
  mode_defaillance TEXT NOT NULL,
  effet            TEXT NOT NULL DEFAULT '',
  cause            TEXT NOT NULL DEFAULT '',
  detection        TEXT NOT NULL DEFAULT '',
  gravite          TEXT NOT NULL CHECK (gravite IN ('A','B','C','D','E')),
  probabilite      INTEGER NOT NULL DEFAULT 3 CHECK (probabilite BETWEEN 1 AND 5),
  detection_score  INTEGER NOT NULL DEFAULT 3 CHECK (detection_score BETWEEN 1 AND 5),
  ipr              INTEGER NOT NULL DEFAULT 0,
  niveau           TEXT NOT NULL DEFAULT 'faible' CHECK (niveau IN ('critique','eleve','moyen','faible')),
  statut           TEXT NOT NULL DEFAULT 'a_analyser' CHECK (statut IN ('a_analyser','analyse','surveille','corrige')),
  ecart_id         UUID REFERENCES ecarts(id) ON DELETE SET NULL,
  observations     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amdec_aerodrome ON amdec_analyses(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_amdec_domaine ON amdec_analyses(aerodrome_id, domaine);
CREATE INDEX IF NOT EXISTS idx_amdec_niveau ON amdec_analyses(statut, niveau);

ALTER TABLE amdec_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "amdec_select" ON amdec_analyses;
CREATE POLICY "amdec_select" ON amdec_analyses
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "amdec_write" ON amdec_analyses;
CREATE POLICY "amdec_write" ON amdec_analyses
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Grants
GRANT SELECT ON amdec_analyses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON amdec_analyses TO authenticated;

-- ============================================================
-- FIN SECTION 19 — AMDEC
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  SECTION 20 — FTA (Fault Tree Analysis / Arbre de         ║
-- ║  Défaillance)                                             ║
-- ║  Analyse causale top-down des événements (portes ET/OU)   ║
-- ╚══════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS fta_analyses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evenement_id        UUID NOT NULL REFERENCES evenements_securite(id) ON DELETE CASCADE,
  aerodrome_id        UUID REFERENCES aerodromes(id) ON DELETE CASCADE,
  domaine             TEXT NOT NULL DEFAULT '',
  evenement_label     TEXT NOT NULL DEFAULT '',
  template_id         TEXT NOT NULL DEFAULT 'generique',
  sommet_id           TEXT NOT NULL DEFAULT '',
  noeuds              JSONB NOT NULL DEFAULT '[]'::jsonb,
  statut              TEXT NOT NULL DEFAULT 'en_cours' CHECK (statut IN ('en_cours','termine')),
  probabilite_sommet  REAL NOT NULL DEFAULT 0,
  nb_coupes_minimales INTEGER NOT NULL DEFAULT 0,
  causes_identifiees  TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fta_evenement ON fta_analyses(evenement_id);
CREATE INDEX IF NOT EXISTS idx_fta_aerodrome ON fta_analyses(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_fta_domaine ON fta_analyses(aerodrome_id, domaine);

ALTER TABLE fta_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fta_select" ON fta_analyses;
CREATE POLICY "fta_select" ON fta_analyses
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      get_user_role() IN ('admin','inspector','dg_anacim','dg_operator')
      OR aerodrome_id = get_user_aerodrome_id()
    )
  );

DROP POLICY IF EXISTS "fta_write" ON fta_analyses;
CREATE POLICY "fta_write" ON fta_analyses
  FOR ALL USING (get_user_role() IN ('admin','inspector'));

-- Grants
GRANT SELECT ON fta_analyses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON fta_analyses TO authenticated;

-- ============================================================
-- FIN SECTION 20 — FTA
-- ============================================================

-- ============================================================
-- SECTION 21 — AERORISQ : LANGAGE CLAIR & ENTRAÎNEMENT (2026-08-04)
-- Persiste les échanges « langage clair » IA affichés sur les vues
-- exploitant / DG (texte + contexte chiffré + fallback + vote) et
-- alimente le dataset d'entraînement quotidien de l'IA maison AERORISQ.
-- Table 1 : ia_langage_clair — chaque texte affiché (dédoublonné par
--           (module, texte_hash) ; un vote met à jour la ligne).
-- Table 2 : ia_training_dataset — exemples validés (vote up, non-fallback).
-- Table 3 : ia_training_logs — journal des runs du cron quotidien.
-- ============================================================

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

-- NB : RLS non activé sur les tables ia_* (accès exclusif via service role,
-- identique à la migration d'origine 2026-08-04).

-- ============================================================
-- SECTION 22 — INSPECTEUR VIRTUEL : SUIVI ML (2026-08-04)
-- Suivi acceptation / correction / rejet par capacité + maturité
-- ============================================================

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

-- RLS
ALTER TABLE inspecteur_feedback ENABLE ROW LEVEL SECURITY;

-- Lecture : admin, dg_anacim et inspecteurs voient tout, opérateurs leur aérodrome
DROP POLICY IF EXISTS inspecteur_feedback_select_all ON inspecteur_feedback;
CREATE POLICY inspecteur_feedback_select_all ON inspecteur_feedback
  FOR SELECT USING (
    get_user_role() IN ('admin','dg_anacim','inspector')
    OR (
      get_user_role() IN ('dg_operator','focal_operator')
      AND aerodrome_id = get_user_aerodrome_id()
    )
  );

-- Écriture : tout utilisateur authentifié peut créer un retour
DROP POLICY IF EXISTS inspecteur_feedback_insert_all ON inspecteur_feedback;
CREATE POLICY inspecteur_feedback_insert_all ON inspecteur_feedback
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Mise à jour : seul l'auteur (id interne) ou admin peut modifier
DROP POLICY IF EXISTS inspecteur_feedback_update_owner ON inspecteur_feedback;
CREATE POLICY inspecteur_feedback_update_owner ON inspecteur_feedback
  FOR UPDATE USING (
    user_id = get_user_internal_id()
    OR get_user_role() IN ('admin','dg_anacim')
  );

-- Vue agrégée pour le tableau de bord Inspecteur Virtuel
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

GRANT SELECT ON inspecteur_feedback TO authenticated;
GRANT INSERT, UPDATE ON inspecteur_feedback TO authenticated;

-- ============================================================
-- FIN SECTION 22 — INSPECTEUR VIRTUEL
-- ============================================================

-- ============================================================
-- SECTION 23 — DEMANDES D'ACCÈS PORTEIL PUBLIC
-- Table utilisée par le bouton "Demander un accès au système"
-- du dashboard Invité. Un visiteur (anonyme ou guest) soumet une
-- demande ; l'admin la consulte et la traite (création de compte)
-- depuis le module Utilisateurs.
-- ============================================================

CREATE TABLE IF NOT EXISTS demandes_acces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Coordonnées du demandeur
  nom           TEXT NOT NULL,
  email         TEXT NOT NULL,
  structure     TEXT,          -- exploitant, société, administration…
  type_demande  TEXT NOT NULL DEFAULT 'compte' CHECK (type_demande IN ('compte','assistance','autre')),
  message       TEXT,

  -- Traitement
  statut        TEXT NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau','en_traitement','traitee','rejetee')),
  traitee_par   UUID REFERENCES utilisateurs(id) ON DELETE SET NULL,
  traitee_le    TIMESTAMPTZ,
  note_traitement TEXT
);

-- Index pour le tri par statut / date
CREATE INDEX IF NOT EXISTS idx_demandes_acces_statut ON demandes_acces(statut);
CREATE INDEX IF NOT EXISTS idx_demandes_acces_created ON demandes_acces(created_at);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION trigger_demandes_acces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_demandes_acces_updated_at ON demandes_acces;
CREATE TRIGGER trg_demandes_acces_updated_at
  BEFORE UPDATE ON demandes_acces
  FOR EACH ROW EXECUTE FUNCTION trigger_demandes_acces_updated_at();

-- RLS
ALTER TABLE demandes_acces ENABLE ROW LEVEL SECURITY;

-- Lecture : admin, dg_anacim, inspector voient toutes les demandes
DROP POLICY IF EXISTS demandes_acces_select ON demandes_acces;
CREATE POLICY demandes_acces_select ON demandes_acces
  FOR SELECT USING (
    get_user_role() IN ('admin','dg_anacim','inspector')
  );

-- Insertion : tout visiteur (anonyme ou authentifié) peut soumettre une demande
DROP POLICY IF EXISTS demandes_acces_insert ON demandes_acces;
CREATE POLICY demandes_acces_insert ON demandes_acces
  FOR INSERT WITH CHECK (
    auth.role() IN ('authenticated','anon','service_role')
  );

-- Mise à jour : admin / dg_anacim peuvent traiter
DROP POLICY IF EXISTS demandes_acces_update ON demandes_acces;
CREATE POLICY demandes_acces_update ON demandes_acces
  FOR UPDATE USING (
    get_user_role() IN ('admin','dg_anacim')
  );

GRANT SELECT ON demandes_acces TO authenticated;
GRANT INSERT ON demandes_acces TO authenticated, anon;

-- ============================================================
-- FIN SECTION 23 — DEMANDES D'ACCÈS PORTEIL PUBLIC
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  SECTION 24 — BOUCLE D'APPRENTISSAGE AERORISQ            ║
-- ║  Rattrapage des migrations 2026-07-08 → 2026-08-25       ║
-- ║                                                          ║
-- ║  24.A  ia_model_state        — poids des modèles ML      ║
-- ║  24.B  ia_feedback           — votes utilisateurs         ║
-- ║  24.C  ia_thresholds         — seuils dynamiques          ║
-- ║  24.D  ia_decisions          — historique décisions       ║
-- ║  24.E  decision outcomes     — évaluation auto 6 mois     ║
-- ║  24.F  ia_bayes_network_state— réseau bayésien causal    ║
-- ║  24.G  ml_samples            — échantillons ML terrain    ║
-- ╚══════════════════════════════════════════════════════════╝

-- ------------------------------------------------------------
-- 24.A — TABLE ia_model_state
-- Persistance durable des modèles entraînés (Bayesian, LSTM, XGBoost, RF, Ensemble)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 24.B — TABLE ia_feedback + vue d'agrégation
-- Apprentissage continu AERORISQ : votes des engines décisionnels
-- ------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_ia_feedback_aerodrome ON ia_feedback(aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_ia_feedback_engine ON ia_feedback(engine_type);
CREATE INDEX IF NOT EXISTS idx_ia_feedback_user ON ia_feedback(user_id);

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

-- Vue aggrégée pour le tableau de bord AERORISQ
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

-- ------------------------------------------------------------
-- 24.C — TABLE ia_thresholds — seuils dynamiques persistés
-- Chargés par le cron recalculate-risk avant calculateGlobalScore()
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 24.D — TABLE ia_decisions — historique des décisions AERORISQ
-- ------------------------------------------------------------
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

-- Vue agrégée : taux d'application et d'efficacité par aérodrome
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

-- ------------------------------------------------------------
-- 24.E — DECISION OUTCOMES : évaluation automatique des décisions
-- Relie chaque décision → évolution du score 6 mois après
-- Boucle d'apprentissage décision → outcome
-- ------------------------------------------------------------

-- Colonnes de suivi d'évolution à ia_decisions
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_before       NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_after_3m     NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_after_6m     NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_delta_6m     NUMERIC;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS score_tendance_at_outcome TEXT;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS evaluated_at       TIMESTAMPTZ;
ALTER TABLE ia_decisions ADD COLUMN IF NOT EXISTS auto_evaluated     BOOLEAN DEFAULT false;

-- TABLE score_history (si pas déjà créée ailleurs)
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

-- Fonction d'évaluation automatique
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

-- Vue : bilan des outcomes par aérodrome
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

-- ------------------------------------------------------------
-- 24.F — TABLE ia_bayes_network_state
-- État du réseau bayésien causal par aérodrome et domaine bow-tie.
-- Supabase est l'autorité unique. IndexedDB sert de cache de lecture.
-- Chaque ligne = les CPT (observations incluses) d'un réseau pour un couple.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 24.G — TABLE ml_samples — échantillons ML labellisés terrain
-- Chaque signature de checklist crée un échantillon :
--   features = profil de risque AVANT inspection (prédiction formule)
--   label    = conformité réellement constatée (taux SA/NS → niveau)
-- Matière première des modèles ML (Random Forest navigateur aujourd'hui,
-- XGBoost/fine-tuning serveur demain).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ml_samples (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aerodrome_id    text NOT NULL,
  surveillance_id text NOT NULL,
  features        jsonb NOT NULL,
  label           text NOT NULL CHECK (label IN ('critique', 'eleve', 'moyen', 'faible')),
  label_source    text NOT NULL DEFAULT 'terrain',
  contexte        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (surveillance_id, aerodrome_id)
);

CREATE INDEX IF NOT EXISTS idx_ml_samples_aero    ON ml_samples (aerodrome_id);
CREATE INDEX IF NOT EXISTS idx_ml_samples_created ON ml_samples (created_at);

-- ============================================================
-- FIN SECTION 24 — BOUCLE D'APPRENTISSAGE AERORISQ
-- ============================================================

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  NOTE : Fichiers migrations archivés (2026-08-25)                         ║
-- ║                                                                           ║
-- ║  Les fichiers migrations/ étaient des patches incrémentaux.               ║
-- ║  Tout est désormais consolidé dans ce fichier unique.                     ║
-- ║  → Archivés dans _archived_migrations/ (à supprimer après validation)    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

