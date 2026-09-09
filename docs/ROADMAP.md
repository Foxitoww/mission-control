# MISSION CONTROL — Roadmap technique

| Phase | État |
|---|---|
| 0 — Discovery | ✅ terminée |
| 1 — Architecture | ✅ terminée |
| 2 — Foundation | ✅ terminée |
| 3 — MVP | ⏳ suivante |
| 4 → 6 | à venir |

---

## PHASE 0 — DISCOVERY ✅
Machine vierge (aucun runtime). Dépôt vide (1 commit). Node LTS installé via winget.

## PHASE 1 — ARCHITECTURE ✅
Architecture, modèle de données, design system initial, système d'agents, roadmap, ADR.

## PHASE 2 — FOUNDATION ✅
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

## PHASE 3 — MVP ⏳
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

---

## Journal d'exécution

**Phase 2 — incidents natifs.** Deux échecs enchaînés sur `better-sqlite3` :
absence de binaire précompilé pour Node 24 (v11), puis chargement impossible du
binaire Node-API 10 sur Electron 33, qui n'expose que Node-API 9 — plantage muet
du processus main. Résolus par `better-sqlite3` ^13 + Electron ^44. Voir ADR-004.

**Phase 2 — état vérifié.** 31 tests passent, typecheck vert sur les deux projets
TypeScript, build de production complet, application lancée : migration appliquée
(`user_version = 1`) et écran d'accès rendu.

**Profil (avant Phase 3).** Sélection de profil enrichie et éditeur de profil :
image redimensionnée à 128 × 128, emoji, pseudo, identifiant, couleur d'accent
issue d'une palette curatée, thème et langue. Migration 002. Vérifié bout en bout
sur une base jetable : compte créé, accent modifié, persistance confirmée en base.

**Session mémorisée, installeur et mises à jour (avant Phase 3).** Option
« se souvenir de moi » (ADR-005), installeur NSIS `setup.exe` et mises à jour par
releases GitHub avec bouton « Vérifier la version » (ADR-006). Migration 003.

**Phase 3 — MVP.** Dashboard, projets, tâches, sous-tâches, priorités, tags,
filtres, recherche globale, raccourcis clavier. 41 tests de domaine, dont 7
vérifiant qu'un utilisateur ne peut atteindre ni les tâches, ni les projets, ni
les tags, ni les sous-tâches, ni les résultats de recherche d'un autre.

**Chiffrement au repos (ADR-007).** Bases séparées : `accounts.db` en clair pour
l'identité visible, un coffre `vaults/<userId>.mcv` chiffré en AES-256-GCM par
compte. Clé enveloppe, phrase de récupération, scellement DPAPI optionnel.
Vérifié : le fichier ne contient aucun texte des tâches, ni même l'en-tête SQLite.

**Phase 4 — Productivity.** Kanban avec glisser-déposer accessible au clavier,
calendrier mensuel, tâches récurrentes (quotidienne, hebdomadaire avec jours
choisis, mensuelle, intervalle personnalisé), objectifs chiffrés, page de
télémétrie et notifications locales. 30 tests supplémentaires.

Les couleurs de graphique sont des jetons DISTINCTS des couleurs sémantiques et
ont été validées (bande de luminosité, écart CVD, contraste) contre chaque
surface, en mode clair comme en mode sombre — pas choisies à l'œil.

**Phase 5 — Polish.** Menée comme un AUDIT, pas comme un ajout de
fonctionnalités. Ce que l'audit a trouvé, et ce qui a été corrigé :

| Constat | Correction |
|---|---|
| 7 pages traitaient chargement et vide, **aucune** l'erreur | Composant `QueryState` : les quatre états au même endroit |
| Aucune frontière d'erreur React — un plantage de rendu = fenêtre blanche | `ErrorBoundary` enveloppant jusqu'aux fournisseurs |
| Suppressions silencieuses | Notifications éphémères, avec signe en plus de la couleur |
| Polices déclarées mais jamais embarquées | `@fontsource-variable` en woff2 local, aucun CDN |
| 4 champs n'avaient qu'un placeholder | `aria-label` ajouté ; un placeholder n'est pas un nom |
| Aucun lien d'évitement | 8 entrées de navigation à retraverser à chaque page, corrigé |
| Fenêtre bloquée à 900 px | Abaissée à 560 px : les mises en page étroites étaient inatteignables |
| Tableau de bord à **90 ms** sur 5000 tâches | **7 ms** — voir ci-dessous |

**Le point de performance.** Mesuré avant d'optimiser : tout répondait en 2–6 ms
*sauf* le tableau de bord, dont 81 des 90 ms venaient de `projectsRepo.list`.
Cause : deux sous-requêtes corrélées par projet, soit 400 balayages pour 200
projets. Remplacées par un agrégat groupé joint une fois — **80,8 ms → 1,7 ms**.
Un fichier `performance.test.ts` verrouille le résultat : plans de requête
(déterministes) et bornes de durée larges (dix fois la mesure), pour attraper un
retour au motif quadratique sans être sensible à la machine.
