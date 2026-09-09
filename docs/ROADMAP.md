# MISSION CONTROL — Roadmap technique

| Phase | État |
|---|---|
| 0 — Discovery | ✅ terminée |
| 1 — Architecture | ✅ terminée |
| 2 — Foundation | ⏳ suivante |
| 3 → 6 | à venir |

---

## PHASE 0 — DISCOVERY ✅
Machine vierge (aucun runtime). Dépôt vide (1 commit). Node LTS installé via winget.

## PHASE 1 — ARCHITECTURE ✅
Architecture, modèle de données, design system initial, système d'agents, roadmap, ADR.

## PHASE 2 — FOUNDATION ⏳
1. Échafaudage electron-vite + TypeScript strict + ESLint/Prettier
2. `connection.ts` + PRAGMAs + migrateur `user_version`
3. Migration `001_init.sql` (schéma complet)
4. Contrat IPC + preload + enveloppe `IpcResult`
5. Hachage scrypt + `AuthService` + `SessionService`
6. Écrans connexion / inscription / sélection d'utilisateur
7. **Tests d'isolation** — la porte à ne jamais franchir sans succès
8. Tokens du design system + primitives de base

**Critère de sortie :** deux utilisateurs peuvent coexister, se connecter, et il est
*prouvé par test* qu'aucun ne voit les données de l'autre.

## PHASE 3 — MVP
Dashboard MISSION CONTROL · projets · tâches · sous-tâches · priorités · tags ·
filtres · recherche globale · raccourcis clavier.

## PHASE 4 — PRODUCTIVITY
Kanban (drag & drop) · calendrier · timeline · tâches récurrentes · objectifs ·
statistiques · notifications locales.

## PHASE 5 — POLISH
Animations · responsive mobile pensé spécifiquement · accessibilité · performance ·
états vides / erreurs / chargement.

## PHASE 6 — QUALITY
Tests complets · audits sécurité / architecture / UX · nettoyage · packaging `.exe`.

---

## Dépendances retenues

| Paquet | Rôle | Justification |
|---|---|---|
| `electron` + `electron-vite` + `electron-builder` | socle & packaging | HMR sur les trois processus |
| `better-sqlite3` | SQLite | synchrone → le plus rapide en local |
| `zod` | validation | source unique partagée main/renderer |
| `@tanstack/react-query` | état serveur | cache unique = vues synchronisées |
| `zustand` | état UI | minimal |
| `react-router-dom` | navigation | |
| `date-fns` | dates | tree-shakeable |
| `@dnd-kit/*` | drag & drop | accessible au clavier |
| `framer-motion` | micro-interactions | respecte `prefers-reduced-motion` |
| `vitest` + `@playwright/test` | tests | Vitest cible SQLite `:memory:` |

**Volontairement absents :** ORM (le SQL explicite reste lisible et indexable),
bibliothèque de composants (le design system est l'identité du produit),
client HTTP (aucun réseau), argon2 natif (voir ADR-002).
