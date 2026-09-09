# MISSION CONTROL

Application de productivité **local-first**, inspirée des centres de contrôle spatial.

> Les missions de l'utilisateur sont ses projets.
> Les tâches sont les opérations.
> Les objectifs sont les missions prioritaires.
> Et le dashboard est son centre de contrôle.

## Principes

**Local-first · Privacy-first · Offline-first.** Aucun serveur, aucune API distante,
aucune télémétrie. Toutes les données vivent dans un fichier SQLite sur ta machine.

## Stack

Electron 44 · React 18 · TypeScript · SQLite (better-sqlite3, Node-API) · Vite

Voir [ADR-001](docs/adr/ADR-001-stack.md) pour le choix de la stack et
[ADR-004](docs/adr/ADR-004-native-modules.md) pour les contraintes de modules natifs.

## Installation

Prérequis : Node.js ≥ 22 (testé sur v24.19).

```bash
npm install
```

```bash
node node_modules/electron/install.js
```

La seconde commande télécharge le binaire Electron. Elle est nécessaire lorsque npm
bloque les scripts d'installation (`allow-scripts`), ce qui est le cas sur cette machine.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Application en développement, rechargement à chaud sur les trois processus |
| `npm run build` | Typecheck puis build de production dans `out/` |
| `npm test` | Suite Vitest (SQLite en mémoire) |
| `npm run typecheck` | Vérification TypeScript des projets Node et Web |
| `npm run package` | Exécutable Windows via electron-builder |

En développement uniquement, la variable `MC_DB_PATH` pointe l'application vers une
base jetable — pratique pour une session de test manuelle sans toucher aux vraies
données. La bascule est ignorée dans une application empaquetée.

## Base de données locale

Un unique fichier SQLite dans le dossier de données utilisateur de l'OS
(`app.getPath('userData')/mission-control.db`), en mode WAL, clés étrangères
activées. Le schéma est versionné par `PRAGMA user_version` et les migrations
sont en ajout seul — voir [DATA-MODEL.md](docs/DATA-MODEL.md).

## Documentation

| Document | Contenu |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Processus, frontière de confiance, état, erreurs |
| [Modèle de données](docs/DATA-MODEL.md) | Schéma SQLite, PRAGMAs, index |
| [Design system](docs/DESIGN-SYSTEM.md) | Palette, typographie, primitives, accessibilité |
| [Agents](docs/AGENTS.md) | Rôles de revue et définition de « terminé » |
| [Roadmap](docs/ROADMAP.md) | Phases, dépendances, journal d'exécution |
| [Décisions (ADR)](docs/adr/) | Choix structurants et leurs raisons |
| [Contribuer](CONTRIBUTING.md) | Politique de branches et procédure de release |

## État

**Phases 0 à 3 terminées.** Base locale migrée, authentification multi-utilisateurs
avec scrypt, session en mémoire, isolation des comptes vérifiée par tests, écran
d'accès bilingue FR/EN, sélection de profil et éditeur de profil (image, emoji,
pseudo, couleur d'accent, thème, langue), option « se souvenir de moi ».
Dashboard, projets, tâches, sous-tâches, tags, filtres, recherche et raccourcis
clavier. Données chiffrées au repos (AES-256-GCM, un coffre par compte) avec
phrase de récupération — voir [ADR-007](docs/adr/ADR-007-encryption-at-rest.md).
Phase 4 (Kanban, calendrier, récurrence, objectifs, statistiques) à venir.
