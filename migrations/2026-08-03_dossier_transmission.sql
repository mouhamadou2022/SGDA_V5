-- Migration 2026-08-03 — Publication du dossier PDF au portail exploitant
-- À la transmission d'une surveillance, le rapport signé et la checklist signée
-- sont générés en PDF natif et publiés dans le bucket « documents » (Supabase).
-- Ces colonnes stockent les URLs publiques pour la prévisualisation / téléchargement
-- par le point focal.

ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS rapport_pdf_url   text;
ALTER TABLE surveillances ADD COLUMN IF NOT EXISTS checklist_pdf_url text;
