# MISSION CONTROL — Système d'agents

## Comment les agents fonctionnent réellement dans ce projet

Les neuf rôles définis au cahier des charges (§27) sont appliqués comme **portes de
revue explicites**, exécutées séquentiellement avant qu'une fonctionnalité soit
déclarée terminée. Chaque porte est une grille de lecture distincte avec ses propres
critères de rejet.

Des sous-agents parallèles peuvent être lancés à la demande pour les travaux lourds
et cloisonnables — balayage QA complet, audit de sécurité, revue de code étendue.
Ils ne sont pas lancés systématiquement : chaque sous-agent repart d'un contexte
vierge et doit re-découvrir le projet, ce qui coûte plus cher que d'appliquer la
grille en ligne. **Demande-le explicitement quand tu veux une passe parallèle.**

## Les rôles et leurs critères de rejet

| Agent | Rejette une fonctionnalité si… |
|---|---|
| **PRODUCT** | elle ajoute de la surface sans résoudre un besoin réel ; elle duplique un chemin existant ; elle complique le parcours « ouvrir → voir → créer → terminer ». |
| **ARCHITECT** | elle contourne la frontière IPC ; elle introduit une dépendance non justifiée ; elle place de la logique métier dans le renderer. |
| **UI/UX** | elle invente un style hors design system ; elle casse le responsive ; elle ignore `prefers-reduced-motion` ; elle n'a pas d'état vide / chargement / erreur. |
| **FRONTEND** | elle re-render inutilement ; elle duplique un composant existant ; elle mélange état serveur et état d'interface. |
| **LOCAL DATA** | elle écrit une requête sans `user_id` ; elle modifie une migration déjà livrée ; elle stocke une valeur dérivable ; elle manque un index sur un chemin chaud. |
| **SECURITY** | elle accepte un `userId` venu du renderer ; elle n'a pas de validation Zod côté main ; elle laisse fuiter une stack trace ; elle journalise une donnée sensible. |
| **QA** | les cas limites ne sont pas testés ; l'isolation entre utilisateurs n'est pas vérifiée ; une régression existe. |
| **CODE REVIEW** | un fichier devient monolithique ; une abstraction n'a qu'un seul usage ; du code est dupliqué ; un nom est trompeur. |

## Workflow

```
PRODUCT → ARCHITECT → UI/UX → IMPLEMENTATION → QA → SECURITY → CODE REVIEW → FIX → INTEGRATE
```

## Définition de « terminé »

Une fonctionnalité **n'est pas terminée parce qu'elle compile.** Elle est terminée quand :

- [ ] elle fonctionne, y compris sur les cas limites
- [ ] elle est couverte par des tests si elle est critique
- [ ] elle respecte l'architecture (frontière IPC, séparation des couches)
- [ ] elle respecte le design system (aucun style ad hoc)
- [ ] elle expose tous ses états UI (chargement, vide, erreur, succès, désactivé)
- [ ] elle ne casse aucune fonctionnalité existante
- [ ] elle respecte les règles d'isolation et de validation

## Journal des décisions

Toute décision structurante est consignée dans `docs/adr/` au format
**Problème → Décision → Raison → Impact**.
