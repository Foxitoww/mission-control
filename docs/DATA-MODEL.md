# MISSION CONTROL — Modèle de données

## Décisions transverses

| Décision | Choix | Raison |
|---|---|---|
| Identifiants | `TEXT` UUID v4 (`crypto.randomUUID()`) | Stables à l'export/import, pas de collision entre sauvegardes, prépare une sync future. |
| Dates | `TEXT` ISO-8601 UTC | Triables lexicographiquement en SQL, lisibles dans un export JSON, sans ambiguïté de fuseau. |
| Booléens | `INTEGER` 0/1 + `CHECK` | SQLite n'a pas de type booléen natif. |
| Énumérations | `TEXT` + `CHECK (col IN (...))` | La base refuse un statut invalide, même si le code a un bug. |
| Suppression de compte | `ON DELETE CASCADE` depuis `users` | Supprimer un utilisateur efface **toutes** ses données en une transaction (§5). |
| Propriété | `user_id` sur chaque table possédée + index | Rend l'isolation vérifiable et indexée. |

## PRAGMAs (à appliquer à chaque connexion)

```sql
PRAGMA journal_mode = WAL;      -- lectures concurrentes, robustesse au crash
PRAGMA foreign_keys = ON;       -- DÉSACTIVÉ PAR DÉFAUT dans SQLite — piège classique
PRAGMA synchronous = NORMAL;    -- bon compromis durabilité/vitesse avec WAL
PRAGMA busy_timeout = 5000;
```

`foreign_keys` est **par connexion**, pas par base. Oublier ce PRAGMA rend tous les
`ON DELETE CASCADE` silencieusement inopérants — la suppression de compte laisserait
alors des données orphelines.

## Entités

### users
| Colonne | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| username | TEXT UNIQUE NOT NULL | identifiant de connexion, normalisé en minuscules |
| display_name | TEXT NOT NULL | |
| password_hash | TEXT NOT NULL | `scrypt$N$r$p$salt$hash` — jamais en clair |
| avatar | TEXT | emoji ou chemin relatif |
| created_at / updated_at | TEXT | |

### projects — *MISSIONS*
`id, user_id→users, name, description, color, icon, status, deadline, position, created_at, updated_at`
`status ∈ (ACTIVE, PAUSED, COMPLETED, ARCHIVED)`

### tasks — *OPERATIONS*
`id, user_id→users, project_id→projects(NULL OK), title, description, status, priority,`
`due_date, completed_at, estimated_minutes, position, recurrence_rule, recurrence_parent_id,`
`created_at, updated_at`
`status ∈ (TODO, IN_PROGRESS, BLOCKED, COMPLETED, ARCHIVED)`
`priority ∈ (LOW, MEDIUM, HIGH, CRITICAL)`

`position` est un `REAL`, pas un `INTEGER` : réordonner par glisser-déposer se fait en
écrivant **une seule** ligne (moyenne des voisins) au lieu de renuméroter toute la colonne.

`estimated_minutes` plutôt qu'une durée libre : une unité unique évite les conversions
et rend les statistiques agrégeables.

### subtasks
`id, task_id→tasks, title, completed, position`
Pas de `user_id` : la propriété se déduit de `task_id`, et la cascade passe par `tasks`.
Toute lecture joint `tasks` pour filtrer sur `user_id`.

### tags / task_tags
`tags: id, user_id→users, name, color` — `UNIQUE(user_id, name)`
`task_tags: task_id, tag_id` — PK composite, cascade des deux côtés.

### goals — *OBJECTIVES*
`id, user_id→users, project_id→projects(NULL OK), title, description, target_value,`
`current_value, deadline, status, created_at, updated_at`

`progress` n'est **pas** stocké : c'est `current_value / target_value`, calculé à la lecture.
Stocker une valeur dérivée garantit qu'elle devienne fausse un jour.

### settings
`user_id PK→users, theme, language, notifications_enabled, preferences (JSON TEXT)`

Une ligne par utilisateur. `preferences` en JSON absorbe les préférences d'affichage
futures sans migration — mais uniquement pour ce qui n'est **jamais interrogé en SQL**.

### Index prévus
`tasks(user_id, status)` · `tasks(user_id, due_date)` · `tasks(user_id, project_id)`
`tasks(user_id, priority)` · `projects(user_id, status)` · `subtasks(task_id)`
`task_tags(tag_id)` · `goals(user_id, status)`

Tous préfixés par `user_id` : c'est le filtre présent dans **100 %** des requêtes,
donc il doit être en tête de l'index.
