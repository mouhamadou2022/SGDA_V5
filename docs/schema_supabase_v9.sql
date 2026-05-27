-- ============================================================
-- SGDA v5 — Migration V9 (à appliquer par-dessus V8)
-- Généré le : 2026-05-13
-- Idempotent : safe à ré-exécuter
--
-- Nouveautés V9 :
--   1. ecarts_redaction  — colonnes risque OACI (cellule, probabilite, gravite, IA)
--   2. kit_documents     — type_document_oaci (filtre KitSearch)
--   3. prefill_aerodrome_feedbacks — feedback boucle IA pré-remplissage formulaire
--   4. ecarts_oaci_feedbacks       — feedback cellule OACI inspecteur → modèle
-- ============================================================

-- ============================================================
-- 1. ÉCARTS RÉDACTION — colonnes risque OACI
-- ============================================================

alter table ecarts_redaction
  add column if not exists cellule_risque_oaci     text,
  add column if not exists probabilite_risque       smallint check (probabilite_risque between 1 and 5),
  add column if not exists gravite_risque           text check (gravite_risque in ('A','B','C','D','E')),
  add column if not exists justification_risque_ia  text,
  add column if not exists cellule_ia_suggeree      text;

comment on column ecarts_redaction.cellule_risque_oaci
  is 'Cellule de la matrice de risque OACI validée par l'inspecteur (ex: 4C, 3A)';
comment on column ecarts_redaction.probabilite_risque
  is 'Axe probabilité OACI 1-5 (inspecteur peut ajuster la suggestion IA)';
comment on column ecarts_redaction.gravite_risque
  is 'Axe gravité OACI A-E (inspecteur peut ajuster la suggestion IA)';
comment on column ecarts_redaction.justification_risque_ia
  is 'Justification textuelle générée par l''IA pour la cellule suggérée';
comment on column ecarts_redaction.cellule_ia_suggeree
  is 'Cellule initialement suggérée par l''IA avant ajustement inspecteur';

-- ============================================================
-- 2. KIT DOCUMENTS — type OACI
-- ============================================================

alter table kit_documents
  add column if not exists type_document_oaci  text;

comment on column kit_documents.type_document_oaci
  is 'Standard OACI associé au document (ex: Annexe 14, Doc 9137, RAS 14…)';

create index if not exists idx_kit_docs_oaci
  on kit_documents(type_document_oaci)
  where type_document_oaci is not null;

-- ============================================================
-- 3. PREFILL AERODROME FEEDBACKS
--    Enregistre la suggestion IA vs choix final de l'inspecteur
--    sur chaque champ du formulaire de création d'aérodrome.
--    Utilisé pour affiner le modèle de géo-enrichissement.
-- ============================================================

create table if not exists prefill_aerodrome_feedbacks (
  id              uuid        primary key default uuid_generate_v4(),
  aerodrome_id    uuid        references aerodromes(id) on delete set null,
  champ           text        not null,       -- 'nom','code_oaci','region','type','categorie_sslia'
  valeur_ia       text        not null,       -- valeur proposée par l'IA
  valeur_finale   text        not null,       -- valeur retenue après validation inspecteur
  accepte         boolean     not null,       -- true si valeur_ia == valeur_finale
  lat             double precision,           -- coordonnées utilisées pour l'enrichissement
  lon             double precision,
  created_at      timestamptz not null default now(),
  created_by      uuid        references utilisateurs(id) on delete set null
);

create index if not exists idx_prefill_feedbacks_aerodrome
  on prefill_aerodrome_feedbacks(aerodrome_id);
create index if not exists idx_prefill_feedbacks_champ
  on prefill_aerodrome_feedbacks(champ);
create index if not exists idx_prefill_feedbacks_accepte
  on prefill_aerodrome_feedbacks(accepte);

comment on table prefill_aerodrome_feedbacks
  is 'Boucle d''apprentissage : suggestion IA vs valeur retenue lors de la création d''un aérodrome';

-- RLS
alter table prefill_aerodrome_feedbacks enable row level security;

drop policy if exists "prefill_feedbacks_select" on prefill_aerodrome_feedbacks;
create policy "prefill_feedbacks_select" on prefill_aerodrome_feedbacks
  for select using (get_user_role() in ('admin','inspector'));

drop policy if exists "prefill_feedbacks_insert" on prefill_aerodrome_feedbacks;
create policy "prefill_feedbacks_insert" on prefill_aerodrome_feedbacks
  for insert with check (get_user_role() in ('admin','inspector'));

-- ============================================================
-- 4. ECARTS OACI FEEDBACKS
--    Feedback cellule OACI sur les écarts (complète risk_index_feedbacks
--    qui suit l'indice global, celui-ci suit la granularité cellule par cellule).
-- ============================================================

create table if not exists ecarts_oaci_feedbacks (
  id                    uuid        primary key default uuid_generate_v4(),
  ecart_id              uuid        references ecarts(id) on delete set null,
  aerodrome_id          uuid        not null references aerodromes(id) on delete cascade,
  inspecteur_id         uuid        references utilisateurs(id) on delete set null,
  cellule_ia            text        not null,   -- ex: "4C"
  probabilite_ia        smallint    not null check (probabilite_ia between 1 and 5),
  gravite_ia            text        not null check (gravite_ia in ('A','B','C','D','E')),
  cellule_inspecteur    text        not null,   -- cellule après ajustement
  probabilite_inspecteur smallint   not null check (probabilite_inspecteur between 1 and 5),
  gravite_inspecteur    text        not null check (gravite_inspecteur in ('A','B','C','D','E')),
  justification_ia      text,
  commentaire           text,
  action                text        not null check (action in ('valide','ajuste','ignore')),
  domaine               text,
  ref_reglementaire     text,
  created_at            timestamptz not null default now()
);

create index if not exists idx_oaci_feedbacks_aerodrome
  on ecarts_oaci_feedbacks(aerodrome_id);
create index if not exists idx_oaci_feedbacks_ecart
  on ecarts_oaci_feedbacks(ecart_id);
create index if not exists idx_oaci_feedbacks_action
  on ecarts_oaci_feedbacks(action);
create index if not exists idx_oaci_feedbacks_date
  on ecarts_oaci_feedbacks(created_at desc);

comment on table ecarts_oaci_feedbacks
  is 'Boucle d''apprentissage : cellule OACI suggérée vs ajustée par l''inspecteur';

alter table ecarts_oaci_feedbacks enable row level security;

drop policy if exists "oaci_feedbacks_select" on ecarts_oaci_feedbacks;
create policy "oaci_feedbacks_select" on ecarts_oaci_feedbacks
  for select using (get_user_role() in ('admin','inspector','dg_anacim'));

drop policy if exists "oaci_feedbacks_insert" on ecarts_oaci_feedbacks;
create policy "oaci_feedbacks_insert" on ecarts_oaci_feedbacks
  for insert with check (get_user_role() in ('admin','inspector'));

-- ============================================================
-- 5. INDEX COMPLÉMENTAIRES V9
-- ============================================================

-- Retrouver rapidement les écarts redaction avec cellule OACI renseignée
create index if not exists idx_ecart_red_cellule
  on ecarts_redaction(cellule_risque_oaci)
  where cellule_risque_oaci is not null;

-- Surveillance associée pour les écarts redaction (manquait en V8)
create index if not exists idx_ecart_red_surveillance
  on ecarts_redaction(surveillance_id);

create index if not exists idx_ecart_red_aerodrome
  on ecarts_redaction(aerodrome_id);

-- ============================================================
-- 6. VUE ANALYTIQUE — taux d'acceptation suggestions IA par champ
-- ============================================================

create or replace view v_ia_prefill_stats as
select
  champ,
  count(*)                                                    as total,
  count(*) filter (where accepte)                             as acceptes,
  round(count(*) filter (where accepte)::numeric / count(*) * 100, 1) as taux_acceptation_pct
from prefill_aerodrome_feedbacks
group by champ
order by champ;

-- Vue analytique cellule OACI : taux validation/ajustement/ignoré par domaine
create or replace view v_oaci_feedback_stats as
select
  domaine,
  count(*)                                                              as total,
  count(*) filter (where action = 'valide')                            as valides,
  count(*) filter (where action = 'ajuste')                            as ajustes,
  count(*) filter (where action = 'ignore')                            as ignores,
  round(count(*) filter (where action = 'valide')::numeric / count(*) * 100, 1) as taux_validation_pct
from ecarts_oaci_feedbacks
group by domaine
order by total desc;

-- ============================================================
-- 7. PERMISSIONS — nouvelles tables
-- ============================================================

grant all on prefill_aerodrome_feedbacks to authenticated;
grant all on ecarts_oaci_feedbacks        to authenticated;
grant select on v_ia_prefill_stats        to authenticated;
grant select on v_oaci_feedback_stats     to authenticated;

alter default privileges in schema public
  grant all on tables to authenticated;

-- ============================================================
-- VÉRIFICATION V9
-- ============================================================

select
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'ecarts_redaction'
  and column_name  like '%risque%'
order by column_name;

select
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('prefill_aerodrome_feedbacks','ecarts_oaci_feedbacks','messages')
order by table_name;

-- ============================================================
-- TABLE MESSAGES
-- ============================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text,
  canal text not null default 'interne' check (canal in ('interne', 'exploitant')),
  from_id text not null,
  from_nom text not null,
  from_role text not null,
  to_id jsonb not null default '[]'::jsonb,
  cc_id jsonb default '[]'::jsonb,
  aerodrome_id text,
  subject text not null,
  body text not null,
  attachments jsonb default '[]'::jsonb,
  read_at timestamptz,
  read_by jsonb default '[]'::jsonb,
  archived_by jsonb default '[]'::jsonb,
  replied_to text,
  created_at timestamptz default now()
);

-- Index pour les recherches de messages par utilisateur (sender ou recipient)
create index if not exists idx_messages_from_id on messages (from_id);
create index if not exists idx_messages_aerodrome on messages (aerodrome_id);
create index if not exists idx_messages_created_at on messages (created_at desc);
