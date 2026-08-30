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

## Correctif chaîne de fallback IA — budget séparé cloud/local (2026-08-30)

### Problème observé
`ALL_PROVIDERS_FAILED` systématiques en dev local dès que Groq est en défaut :
```
groq_0: quota dépassé (429)
groq_fallback_0: 413/429  (réponses HTTP rapides)
aerorisq_0: This operation was aborted   ← Ollama cut
```

### Diagnostic (confirmé par le reviewer)
Les providers activés sont Groq (+ fallback) et `aerorisq` = Ollama local
(fin de chaîne). Groq 429/413 = échecs quasi instantanés qui ne consomment
presque rien du budget global, si bien que le **timeout d'Ollama était
plafonné par le budget global restant (30s moins le temps cloud déjà
consommé)**. Ollama charge son modèle à froid en 10-30s+ (CPU) → `aborted`
avant la 1re réponse. Le vrai blocage était le **plafonnement par le budget
global**, pas Groq.

### Correctif appliqué et validé (portée `providers.ts` seul)
- Remplacé l'ancien `GLOBAL_BUDGET_MS` unique par **deux budgets fixes et
  indépendants** : `CLOUD_BUDGET_MS=20000` + `LOCAL_BUDGET_MS=30000`.
- Supprimé le `break` global unique et le plafonnement unique ; chaque phase
  (cloud / local) garde un timestamp de départ et un plafonnement propre.
  Le budget local ne dépend **jamais** de ce qu'a consommé la phase cloud.
- Pire cas total = 50s, **borné sous les `maxDuration` actuels (60s)**.
- Reviewer : confirme que la structure est strictement la sienne ; la
  calibration 20s/30s est « sûre », seul risque = un chargement froid très
  lent se fende encore cut (compromis documenté pour remonter à 45s).

### Point d'hébergement à confirmer (action utilisateur)
Le calibrage « acceptable en prod » dépend du **plan Vercel** :
- **Hobby** : plafond dur des fonctions serverless à **10s** (maxDuration ne
  peut pas le dépasser) → même les 50s de pire cas seraient caduques.
- **Pro** : maxDuration jusqu'à 300s → on peut remonter `LOCAL_BUDGET_MS` à
  45s **et** monter les `maxDuration` des routes IA (generate 60→90 ;
  chat/rediger-ecart/ai/* sans valeur = défaut plan) à ≥90s.
En dev local (npm run dev) il n'y a aucune limite de plateforme : le bug
corrigé ne peut pas revenir à cause d'un maxDuration en local. À vérifier
avant de considérer ce calibrage acceptable en prod.

## Warm-up Ollama & feuille de route « inspecteur virtuel » (2026-08-30)

### Volet 1 — Warm-up `keep_alive` (appliqué)
Préconisation du reviewer : garder le modèle chargé via `keep_alive` (paramètre
de requête Ollama OpenAI-compatible), pas de changement d'infrastructure.
- Appliqué : `callOllama` et `callAerorisq` (quand `AERORISQ_API_URL` est local
  = Ollama par défaut) envoient `keep_alive:'30m'` (constante
  `OLLAMA_KEEP_ALIVE`, `lib/ia/providers.ts`).
- Coût : **RAM ~4-5 Go** (modèle 7B quantifié), **zéro CPU permanent** (CPU
  seulement pendant une génération active). Valable en local/dev uniquement
  (serverless redémarre à froid ; le warm-up ne s'applique que là où Ollama
  tourne en continu — machine dev, ou plus tard VPS/mini-PC pointé par
  `AERORISQ_API_URL`).
- **Priorité non inversée** (décision utilisateur) : Ollama reste en fin de
  chaîne pendant la stabilisation. Le levier d'autonomie plus fort (Ollama en
  premier une fois chaud, Groq en secours) est à revisiter après stabilisation.
- Cache `aiClient.ts` (`getCached`/`setCached`) déjà présent, rien à ajouter.

### Volet 2 — Choix du modèle (APRÈS stabilisation, tests empiriques)
- D'abord mesurer si le problème est la **vitesse** (réglée par warm-up) ou la
  **qualité** avant de changer de modèle.
- Faiblesses probables de `mistral` 7B : fiabilité JSON (réparation défensive
  dans `aiClient._tryParseJSON` = indice), vocabulaire réglementaire
  aéronautique (dépend du RAG/few-shot injecté).
- Si qualité/JSON : tester **Qwen2.5:7b-instruct** en A/B (même gabarit CPU,
  meilleur en sortie structurée). Si français rédactionnel : **Mistral-Nemo
  12B** (2-3× plus lent en CPU, peut réintroduire la lenteur).
- **En attente de l'utilisateur** : RAM de la machine qui fait tourner Ollama
  (facteur limitant pour tout > 7B).

### Volet 3 — Feuille de route « inspecteur virtuel autonome » (APRÈS stabilisation)
Déjà en place (`lib/ia/`) : boucle d'apprentissage fermée (feedback humain →
tendances → seuils auto-ajustés via `thresholdController`), RAG applicatif +
exemples récents + cache (`ecartAgent.ts`), réconciliation auto-vs-manuel
(`decisionTracker`), recalibrage bayésien par domaine (`weightController`).
À construire, par priorité recommandée (tout additif, sans toucher aux
4 workflows) :
1. RAG réglementaire indexé (pgvector sur corpus OACI/ANACIM/PSC/fiches PAC) —
   faire citer un texte plutôt que généraliser.
2. Autonomie graduée par seuil de confiance (relier `thresholdController` à une
   politique : auto-application au-dessus du seuil, validation humaine en
   dessous) — « assistant qui suggère » → « inspecteur qui agit, sous contrôle ».
3. Justification citée (chaque suggestion référence le texte réglementaire).
4. Harnais d'évaluation hors-ligne (mesurer sur un jeu déjà validé par des
   humains, pas seulement en production).
5. Orchestration multi-étapes (diagnostic → sévérité → plan d'action → suivi,
   avec vérification intermédiaire) — le plus ambitieux, en dernier.

## Fichiers touchés
- `lib/checklistNormalize.ts` (nouveau) — dédup profonde par id.
- `lib/store.ts` — `setChecklistHierarchy` (normalisation) ; getters
  `getItemsNSNV` / `getItemsNSNVFromHierarchy` (dédup filet de sécurité).
- `app/page.tsx` — normalisation à l'hydratation.
- `app/surveillance/[id]/ecarts/page.tsx` — `itemsRedigesCount` borné.
- `components/modules/surveillance/SurveillanceEcartsRedaction.tsx` —
  `processedItemIds` dédupliqué + étiquette fiches/items.
