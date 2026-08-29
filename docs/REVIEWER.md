# Reviewer de session — SGDA V5 (Écarts & Affiliation Écarts/Items)

> Rôle : reviewer technique consultatif utilisé lors de la phase de stabilisation
> des 4 workflows (planning → surveillance → écart → portail exploitant).
> On lui fournit des extraits de code et des audits de données ; il rend des
> préconisations en lecture seule (aucune écriture en base de sa part).
> Toute fusion/suppression d'écart reste une étape séparée, délibérée et
> validée manuellement.

## Contexte et résolution validée (2026-08-29)

### Problème observé
Sur une surveillance en test, l'écran de rédaction des écarts affichait
« Écarts rédigés 36 / questions restantes 6 » → l'utilisateur additionnait
36+6=42 vs « 37 questions NS » et y voyait une incohérence.

### Diagnostic (confirmé par le reviewer)
C'est un problème d'**affichage**, pas de données/logique :
- `processedItemIds` (Set, `SurveillanceEcartsRedaction.tsx`) = **31 items
  uniques** couverts ; `itemsRestantsCount` = 37−31 = **6**. 31+6=37 ✓.
- Le « 36 » = `ecarts.length` (nombre de **fiches** écart), NON additif avec
  les items restants. Les stats NS/SA/NV sont des comptes **d'items** par
  résultat et sont correctes (NS=37, NV=0, SA=89, taux 69%).
- Un écart peut légitimement **combiner plusieurs questions NS/NV** (multi-
  items) ; une combinaison ≠ doublon. Le vrai signal de redondance est un
  même `item_id` présent dans 2 fiches d'écarts distinctes.

### Correctifs appliqués (définitifs)
1. **Cause racine — ids dupliqués dans la hiérarchie** : les templates
   importés pouvaient contenir le même `id` d'item à plusieurs endroits
   (ex. `QSC_CONTINUE_QSC51/78/79/80/81`). Corrigé par dédup profonde par
   `id` (garde la 1re occurrence, **ne renomme pas** → les `item_ids`
   des écarts restent valides) :
   - utilitaire `lib/checklistNormalize.ts` → `dedupeHierarchyItems()`;
   - appliqué au setter `setChecklistHierarchy` (`lib/store.ts`) — point
     d'entrée unique → tout futur chargement est déduplié;
   - appliqué à l'hydratation (`app/page.tsx`) pour auto-corriger l'existant;
   - base nettoyée pour la surveillance de test (120 items, 37 NS, 0 doublon),
     avec backup JSON dans Temp.
2. **Comptage d'items cohérent** : `processedItemIds` (
   `SurveillanceEcartsRedaction.tsx`) et `itemsRedigesCount` (
   `app/surveillance/[id]/ecarts/page.tsx`) dédupliqués par Set et bornés
   aux ids détectés → 31 items traités / 6 restants.
3. **Étiquette claire (une ligne, validée par le reviewer)** : la Card
   « Écarts rédigés » distingue désormais fiches et items —
   `Écarts rédigés (${ecarts.length} fiches · ${stats.traites}/${stats.total} items couverts)`.
   Aucune nouvelle prop ni logique ; typecheck passe.
4. **Références des questions (combinées incluses) déjà affichées** : le
   bloc « Questions associées » (`SurveillanceEcartsRedaction.tsx`,
   `ecart.item_ids.map`) affiche toutes les références ; rien à corriger.

### Points de non-régression (AGENTS.md)
- Correction limitée à l'affichage + normalisation des ids ; à revalider via
  le smoke-test des 4 workflows après toute nouvelle modif de `lib/store.ts`.

## Audit écart × items — candidates doublons (préconisation lecture seule)

Surveillance de test (`509f6d53-f1d5-4dfa-b4df-da4726f3a290`) : 36 écarts
non-SGS, 31 items uniques couverts, 37 questions NS.

### Doublons FORTS (même item couvert par 2 fiches, libellés quasi identiques,
même auteur `3346a110-...`)
| Item | Fiches (ids tronqués) | Indice |
|------|----------------------|--------|
| QSC73 | `2ba24233` / `21ce10b1` | libellé identique, ~26 min d'écart |
| QSC75 | `1b255f94` / `2f0ee34d` | libellé quasi identique (énergie) |
| QSC111 | `df45c2e8` / `da270621` | libellé quasi identique (hauteur obstacles) |
| QSC108 | `5a9038ab` / `477488e3` | libellé quasi identique (procédure) |
| QSC139 | `6a42bd32` / `6c92bb73` | même sujet (promotion sécurité) |
| QSC29 | `f1cfb754` / `7806fc10` | même item SLI, 2 fiches |

### À examiner (item en fiche mono-item ET dans une fiche combinée)
- **QSC05** : `c6ed63dc` (seul) + `0f4e14dc` (13+05) + `024993c2` (seul)
- **QSC13** : `b7f5d045` (seul) + `0f4e14dc` (13+05)
- **QSC21/22/24** : `dce46215` (24+22+21) + `85ac7675` (24+22) + `a1d98ec2` (21)
- **QSC74/75_2** : `ffd39345` (74+75_2) + `68264c5c` (74) + `aff9597e` (75_2+78)
- **QSC78** : `aff9597e` (75_2+78) + `50b738e4` (78 seul)
- **QSC75_2** : `ffd39345` + `aff9597e`

### Règle
Une fusion/suppression d'écart candidat-doublon est une **étape séparée et
délibérée**, après validation manuelle. Ne pas l'enchaîner automatiquement
avec un correctif d'affichage.

## Fichiers touchés
- `lib/checklistNormalize.ts` (nouveau) — dédup profonde par id.
- `lib/store.ts` — `setChecklistHierarchy` (normalisation) ; getters
  `getItemsNSNV` / `getItemsNSNVFromHierarchy` (dédup filet de sécurité).
- `app/page.tsx` — normalisation à l'hydratation.
- `app/surveillance/[id]/ecarts/page.tsx` — `itemsRedigesCount` borné.
- `components/modules/surveillance/SurveillanceEcartsRedaction.tsx` —
  `processedItemIds` dédupliqué + étiquette fiches/items.
