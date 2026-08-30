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

## Reviewer — A/B modèle & feuille de route « inspecteur virtuel » (2026-08-30)

Suite de la préconisation volet 2/3. Specs machine : Ultra 7 255H, RAM 16 Go
(15,5 utilisables).

### A/B modèles (à exécuter sans toucher aux 4 workflows)
- **Candidats** (générations récentes, gabarit 7-8B) : `Mistral 3 (8B)`,
  `Ministral 3 (8B)` (surtout pas 14B — reproduirait le problème RAM/vitesse),
  `Qwen3 ~7-8B` ; vérifier GLM 5.x ≤8B sur ollama.com.
- **IMPORTANT ram (16 Go) — quantisation** : le tag par défaut
  `ministral-3:8b` est en **FP8 ~9.7 GB**, trop lourd en dev simultané (IDE +
  navigateur). Utiliser la variante **`ministral-3:8b-instruct-2512-q4_K_M`**
  (~6.0 GB, 8.49B, Apache 2.0) — comparable à l'empreinte du Mistral 7B actuel.
  Vérifié sur ollama.com (blobs Q4_K_M ~6.0 GB). `qwen3:8b` = 5.2 GB (OK).
- **Requiert Ollama → déjà vérifié : 0.33.2** (≥ 0.13.1 indispensable pour
  Ministral 3). ✓
- **Piège Ministral 3** : exige Ollama ≥0.13.1 (était en pré-version) → faire
  `ollama --version` avant `ollama pull ministral-3:8b`, sinon erreur de pull
  peu claire. Licence Apache 2.0 (usage pro OK).
- **Jeu de 20-30 écarts validés** (`ecarts_redaction`) rejoués avec le même
  prompt que `ecartAgent.ts` (même RAG/contexte) pour chaque candidat. Métriques
  light : taux JSON valide 1er essai (compter les passages hors tentative n°1
  de `aiClient._tryParseJSON`), cohérence terminologique vs texte validé (note
  1-5 manuelle), temps (1er token + total). Vitesse CPU typique 2-8 tok/s :
  keep_alive ≠ instantané, ne pas confondre temps de chargement et de génération.
- **Seuil relatif (pas absolu)** : un candidat ne remplace `mistral` que s'il
  améliore nettement le taux JSON 1er essai (critère n°1) sans régresser la
  terminologie de >~0,5 pt vs mistral, sans latence inacceptable. Gain
  terminologique seul ≠ switch (JSON est la priorité). Résultats proches (≤1 pt
  ou quelques % JSON) → **doubler le jeu** avant de conclure ; écart net → OK.
- **Isolation** : bascule via `OLLAMA_PRIMARY`/`AERORISQ_PRIMARY`. Changement du
  modèle par défaut en usage réel APRÈS stabilisation.

#### Résultats A/B (2026-08-30) — premier passage, 6 écarts non-SGS réels (GOTT)
Harness autonome (hors repo) : reconstitution des `itemsNSNV` depuis la
hiérarchie + prompt fidèle `ecartAgent.ts` (non-SGS) + appel direct Ollama
(temperature 0.2, num_predict 700), mode `stream:false`. Métrique automatisée :
JSON valide 1er essai (parse simple) + `libelle` STRING conforme au schéma
`ecartAgent` (le JSON.parse seul ne vérifie pas la forme).

| Modèle | JSON 1er essai | `libelle` STRING | Conformité réelle | Temps moy/écart | Stabilité |
|---|---|---|---|---|---|
| **mistral:latest** (réf) | 6/6 (100 %) | 6/6 (100 %) | ✅ | ~107 s | ✅ |
| ministral-3:8b-Q4_K_M | 0/6 (0 %) | 0/6 | ❌ sortie en ```json markdown + `libelle` objet | ~152 s | ❌ connexion instable |
| qwen3:8b | 6/6 (100 % parse) | 4/6 (66 %) | ⚠️ `libelle` en array (multi-items) | ~241 s | ❌ très lent + crash |

**Conclusion (validée reviewer) : rejeter les deux candidats, garder `mistral`.**
Échecs structuraux nets, pas une nuance de qualité — jeu à 6 écarts suffisant
pour trancher (protocole 20-30 gardé en réserve pour départager un futur
candidat passant ce premier filtre). Le `107s` moyen confirme ~2-8 tok/s CPU.

- **ministral** : 0 % JSON 1er essai (markdown ` ```json ``` `) + `libelle`
  renvoyé en **objet** (`{"1.": "…", "2.": "…"}`) → casserait l'UI
  (`[object Object]`) + la connexion Ollama s'effondre sous charge CPU
  (~220-400s/écart, erreur `wsarecv ... connection closed`). **À écarter
  définitivement sur RAM 16 Go CPU.**
- **qwen** : JSON parse bien mais `libelle` en **array** sur les écarts combinés
  (exactement les cas watch-dog) → violation de schéma. **2,3× plus lent** que
  mistral (241s vs 107s) + 1 crash. Rejeté malgré un parse correct.

**Correctif appliqué (découlant de ce test, indépendant du choix de modèle)** :
`ecartAgent.ts` ne validait pas la forme de `libelle` après le JSON.parse
(qui ne vérifie que la syntaxe). Ajout d'une garde défensive de normalisation
juste après le parse : `Array.isArray(libelle) ? libelle.join(' ') :
String(libelle)`. Strictement défensif → aucun changement de comportement pour
le cas actuel (mistral produit des strings), mais protège contre toute réponse
atypique future (changement de version de modèle, cas limite). Typecheck OK.

### Feuille de route « inspecteur virtuel » (par jalons, tout additif)
Principe : **graduer par capacité, pas globalement** (selon réversibilité des
erreurs). Rédaction (faible enjeu) peut vite devenir autonome ; sévérité /
décision d'application (responsabilité réglementaire) reste « suggère sous
contrôle » durablement.
- Capacités priorisées vs existant : rédaction d'écarts (maturé via
  `ecartAgent.ts`, affiner) ; diagnostic par items (`checklistAgent`) ;
  sévérité/intervalles → **grille de qualification des manquements en règles
  déterministes**, PAS en jugement libre du LLM (encadre le manuel de mesures
  d'application AGA — rapport RSI) ; plans d'action → encoder la distinction
  curative/corrective déjà validée des fiches PAC, ne pas laisser le LLM
  réinventer ; langage clair public en dernier (pure reformulation).
- Frontière autonomie/contrôle : traçabilité systématique (toute sortie
  autonome cite sa source — dépend du RAG, jalon 2) ; seuil de confiance via
  `thresholdController` appliqué à la rédaction, jamais à la décision finale de
  sévérité/application ; réversibilité — toute action autonome reste un brouillon
  révisable dans l'audit trail (`decisionTracker`), pas d'auto-clôture.
- Souveraineté : AERORISQ_URL (raisonnement) est découplé d'Ollama par
  conception ; mais Supabase = dépendance cloud externe pour la persistance —
  « raisonnement souverain » ≠ « chaîne entièrement souveraine ». Versionner la
  quantification de chaque modèle en prod (dérive de version = risque
  conformité).
- Jalons : ① A/B modèle + keep_alive (en cours) ② RAG réglementaire pgvector
  (citation correcte sur échantillon test) ③ grille de qualification déterministe
  (testable sans réseau) ④ autonomie graduée — rédaction seule (auto-application
  au-dessus du seuil, accusé humain avant clôture) ⑤ harnais hors-ligne formalisé
  (suite répétable sur le jeu A/B) ⑥ orchestration multi-étapes (seulement une
  fois 1-5 éprouvés).

## Fichiers touchés
- `lib/checklistNormalize.ts` (nouveau) — dédup profonde par id.
- `lib/store.ts` — `setChecklistHierarchy` (normalisation) ; getters
  `getItemsNSNV` / `getItemsNSNVFromHierarchy` (dédup filet de sécurité).
- `app/page.tsx` — normalisation à l'hydratation.
- `app/surveillance/[id]/ecarts/page.tsx` — `itemsRedigesCount` borné.
- `components/modules/surveillance/SurveillanceEcartsRedaction.tsx` —
  `processedItemIds` dédupliqué + étiquette fiches/items.
