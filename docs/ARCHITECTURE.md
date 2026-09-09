# MISSION CONTROL — Architecture

## 1. Vue d'ensemble

Application desktop **local-first**, **offline-first**, **privacy-first**.
Stack : **Electron + React 18 + TypeScript + SQLite (better-sqlite3)**, build via **electron-vite**.

Aucun serveur distant. Aucune télémétrie. Toutes les données vivent dans un fichier SQLite
sur la machine de l'utilisateur.

## 2. Le principe structurant : la frontière de confiance

Electron sépare trois processus. Cette séparation n'est pas un détail de packaging :
c'est **le mécanisme d'isolation des utilisateurs** (§5, §34).

```
┌─────────────────────────────────────────────────────────────┐
│  RENDERER  (Chromium, sandboxé)                             │
│  React · TanStack Query · Zustand · Design System           │
│  Ne voit JAMAIS : fs, better-sqlite3, node:*, le userId     │
└───────────────────────────┬─────────────────────────────────┘
                            │  window.mc.*  (contextBridge)
                            │  surface étroite, typée, figée
┌───────────────────────────▼─────────────────────────────────┐
│  PRELOAD  (contextIsolation: true, nodeIntegration: false)  │
│  Expose uniquement les canaux déclarés dans ipc-contract.ts │
└───────────────────────────┬─────────────────────────────────┘
                            │  ipcRenderer.invoke → ipcMain.handle
┌───────────────────────────▼─────────────────────────────────┐
│  MAIN  (Node.js)                                            │
│  SessionService ── détient currentUserId (mémoire seule)    │
│  Services (métier) → Repositories (SQL) → SQLite (WAL)      │
└─────────────────────────────────────────────────────────────┘
```

### La règle d'or de l'isolation

> **Le renderer n'envoie jamais de `userId`. Le main l'injecte.**

Chaque handler IPC lit `session.requireUserId()` côté main et le passe au repository.
Si le renderer pouvait fournir un `userId`, n'importe quel bug d'UI deviendrait une
fuite de données entre comptes. Ici, c'est structurellement impossible : le canal
n'accepte pas ce paramètre.

Corollaire : **aucune requête SQL sur une table possédée n'est écrite sans `WHERE user_id = ?`.**
Un test de régression dédié (§33) vérifie cette propriété.

## 3. Validation en double barrière

Les schémas **Zod** vivent dans `src/shared/schemas/` et sont importés des deux côtés :

- **Renderer** — validation immédiate pour l'UX (erreurs de formulaire instantanées).
- **Main** — re-validation à l'entrée de chaque handler IPC, car le renderer est,
  par principe, non fiable.

Une seule source de vérité, deux usages distincts. On ne duplique pas les règles.

## 4. Gestion d'état côté renderer

| Type d'état | Outil | Pourquoi |
|---|---|---|
| Données persistées (tâches, projets…) | **TanStack Query** | Cache unique + invalidation → les vues Liste / Kanban / Calendrier / Timeline lisent le **même** cache et restent synchronisées (§10) sans code de synchronisation manuel. Mises à jour optimistes pour le drag & drop. |
| État d'interface (filtres, modales, thème) | **Zustand** | Minuscule, sans boilerplate, hors du cycle de requêtes. |

Les clés de cache sont préfixées par l'utilisateur courant. Au logout, le cache entier
est purgé — aucune donnée résiduelle en mémoire.

## 5. Arborescence

```
src/
├─ main/                     # Processus Node — seul à toucher le disque
│  ├─ index.ts               # cycle de vie, fenêtre, CSP
│  ├─ db/
│  │  ├─ connection.ts       # handle better-sqlite3 + PRAGMAs
│  │  ├─ migrator.ts         # migrations via PRAGMA user_version
│  │  └─ migrations/         # 001_init.sql, 002_*.sql … (append-only)
│  ├─ repositories/          # SQL uniquement, une par entité
│  ├─ services/              # logique métier (auth, session, récurrence, stats, backup)
│  └─ ipc/                   # handlers : valider → session → service → sérialiser
├─ preload/index.ts          # contextBridge, surface figée
├─ renderer/
│  ├─ app/                   # routing, providers
│  ├─ features/              # découpage vertical : tasks/, projects/, goals/, stats/
│  ├─ components/            # primitives du design system
│  ├─ stores/                # zustand
│  └─ styles/                # tokens.css, thèmes
└─ shared/                   # importé par main ET renderer
   ├─ types/
   ├─ schemas/               # Zod — source unique de validation
   └─ ipc-contract.ts        # noms de canaux + types payload/retour
```

`features/` est un découpage **vertical** (par domaine métier), pas horizontal
(par type de fichier). Une fonctionnalité se supprime en supprimant un dossier.

## 6. Gestion des erreurs (§31)

Les erreurs ne traversent jamais l'IPC sous forme brute — une `Error` Node perd sa
stack à la sérialisation et exposerait des chemins disque.

Chaque handler renvoie un résultat discriminé :

```ts
type IpcResult<T> =
  | { ok: true;  data: T }
  | { ok: false; code: AppErrorCode; message: string }
```

`code` est une énumération stable (`AUTH_INVALID_CREDENTIALS`, `VALIDATION_FAILED`,
`NOT_FOUND`…). Le renderer traduit le code en message localisé. La stack technique
complète est journalisée côté main uniquement. **Aucune stack trace n'atteint l'utilisateur.**

## 7. Migration future vers Tauri

La couche données est entièrement derrière `ipc-contract.ts`. Un portage Tauri
remplacerait `main/` par du Rust en conservant `shared/` et `renderer/` intacts.
Ce n'est pas un objectif actuel — seulement une porte laissée ouverte.
