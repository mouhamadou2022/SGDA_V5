# Fiche Technique — SGDA V5

**Plateforme Intelligente de Supervision de la Sécurité Aérienne**
ANACIM — Agence Nationale de l'Aviation Civile du Sénégal

---

## 1. En une phrase

SGDA V5 est la plateforme **intelligente, automatisée et assistée par IA** de supervision de la sécurité aérienne de l'ANACIM Sénégal : elle organise la surveillance, suit les écarts de leur détection à leur clôture, et prédit le risque — pour épauler la décision de l'inspecteur et du régulateur.

**Statut :** Fonctionnelle sur données réelles sénégalaises, prête pour une dimension régionale.

---

## 2. Ce que les autres solutions n'ont pas — l'intelligence embarquée (AERORISQ)

**AERORISQ** est le moteur d'explicabilité et de décision qui anime la plateforme. 100% local, aucun recours à une API externe, apprenant des corrections des inspecteurs :

- **Modèles mathématiques** : processus de Hawkes (intensité d'événements), inférence bayésienne (posterior / prior, détection "cygne noir"), chaînes de Markov cachées (HMM — transitions silencieuses vers un état critique), analyse de survie (hasard 90/180 j), théorie des valeurs extrêmes (EVT — risque de queue), loi binomiale négative (sur-dispersion des incidents), copules (dépendance de queue, scénario pire cas), Thompson Sampling (pondération des actions), détection de points de rupture et mesure de vélocité/stress du système.
- **Modèles de machine learning** : Random Forest, XGBoost, LightGBM, CatBoost et MLP (réseau neuronal) — entraînés localement, benchmarkés et sélectionnés automatiquement selon la précision (A/B testing neural vs formules).
- **Automatisation** : génération de checklists, pré-remplissage type, rédaction assistée des rapports de surveillance, pondération des composantes apprise au fil des retours.
- **Explicabilité des décisions** : décomposition du score (SHAP), langage clair, justifications de chaque classement plutôt qu'une "boîte noire".
- **Jumeau numérique & simulation** : projection "what-if" d'une surveillance ou d'un scénario sur données réelles avant exécution.
- **Évaluation de la fiabilité des modèles** : suivi de la précision, maturité, taux de pertinence et A/B testing (neural vs formules) via un tableau de bord spécialisé.

---

## 3. Modules clés

| Module | La plateforme automatise... |
|---|---|
| **Surveillance** | La planification, la constitution d'équipes, la checklist, les signatures et le rapport signé — avec assistance AERORISQ à la rédaction. |
| **Écarts & PAC** | La matrice de risque OACI, la rédaction des écarts, et le suivi des Plans d'Actions Correctives (PAC) jusqu'à clôture et validation des preuves. |
| **Certification & homologation** | Les circuits exploitant ↔ inspecteur en 3 à 5 phases, avec dossier numérique et décision tracée. |
| **Profil de risque** | Score global pondéré, tendances, prédictions, scénarios et recommandations d'action. |
| **Portails dédiés** | espaces différenciés : DN/Administrateur, Exploitant (DG / point focal / personnel), Inspecteur, chaque métier voyant ses indicateurs. |

---

## 4. Autres modules (briques de la plateforme)

Registres officiels, planification, formation, événements & incidents, enquêtes, charge de travail, délégations, signatures, kit inspecteur, exemptions, messagerie, audit, codes d'accès, AMDEC, archives — autant de briques déjà intégrées et harmonisées.

---

## 5. Architecture & sécurité

- **Application moderne** (Next.js + TypeScript), stockage local synchronisé, **fonctionnement hors ligne** — pensé pour l'inspection terrain en zone à faible couverture.
- **IA locale** : aucune donnée ne quitte le poste pour être analysée.
- **Rôles et traçabilité** : droits différenciés, historisation des modifications.

---

## 6. Évolutivité régionale

Architecture par modules, données structurées et IA embarquée : SGDA est prêt à être **mutualisé à l'échelle UEMOA** pour porter le projet de supervision régionale sans repartir de zéro.

---

## 7. Contact

**ANACIM — Division Surveillance**
[Votre nom] — [Votre fonction]
[Téléphone] — [Email]
Dakar, Sénégal