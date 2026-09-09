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

Electron · React 18 · TypeScript · SQLite (better-sqlite3) · Vite

Voir [ADR-001](docs/adr/ADR-001-stack.md) pour le raisonnement.

## Documentation

| Document | Contenu |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | Processus, frontière de confiance, état, erreurs |
| [Modèle de données](docs/DATA-MODEL.md) | Schéma SQLite, PRAGMAs, index |
| [Design system](docs/DESIGN-SYSTEM.md) | Palette, typographie, primitives, accessibilité |
| [Agents](docs/AGENTS.md) | Rôles de revue et définition de « terminé » |
| [Roadmap](docs/ROADMAP.md) | Phases et dépendances |
| [Décisions (ADR)](docs/adr/) | Choix structurants et leurs raisons |

## État

**Phase 1 terminée** (architecture). Phase 2 (foundation) à venir — l'échafaudage
applicatif n'existe pas encore.

## Prérequis

Node.js LTS ≥ 20 (installé : v24.19.0).
