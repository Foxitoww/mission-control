| avatar | TEXT | emoji court, OU data URI d'une image 128×128. Jamais une URL distante — voir ci-dessous |
| accent_color | TEXT NOT NULL DEFAULT '#3D7BFF' | couleur du profil, visible sur l'écran de sélection |# MISSION CONTROL — Modèle de données

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

## Avatar : pourquoi les URL distantes sont interdites

`avatar` accepte un emoji court **ou** un data URI `data:image/(png|jpeg|webp);base64,…`,
et rien d'autre. Le motif de validation rejette explicitement `http(s)`.

Une URL distante serait chargée par `<img src>` au premier rendu du profil :
l'application cesserait d'être hors ligne, et l'hôte distant apprendrait à quelle
heure l'utilisateur ouvre son centre de contrôle. Interdire le schéma à la
validation est plus sûr que d'espérer que personne n'en enregistre une.

L'image est redimensionnée à 128 × 128 dans le renderer avant d'être envoyée.
Sans ce redimensionnement, une photo de 4 Mo partirait en base64 dans SQLite :
chaque lecture de profil coûterait 5 Mo et l'export JSON deviendrait inexploitable.

## Pourquoi `accent_color` est sur `users` et non dans `settings`

L'écran de sélection de profil doit teinter chaque carte **avant** toute
authentification, or `settings` n'est lisible qu'une fois la session ouverte. La
couleur d'accent fait partie de l'identité visible du profil ; le thème
clair/sombre, lui, est une préférence privée et reste dans `settings`.

## Sauvegarde : le seul artefact non chiffré

L'export (§18) produit un JSON **en clair**, et c'est délibéré. Une sauvegarde
qu'on ne peut ouvrir qu'avec le mot de passe perdu ne sauvegarde rien — or
ADR-007 rend la perte du mot de passe *et* de la phrase de récupération
définitive. L'export est donc le filet de sécurité de l'utilisateur, et
l'interface affiche l'avertissement en permanence, pas seulement au clic.

Il contient l'identité **visible** (nom affiché, avatar, couleur) et toutes les
données métier. Il ne contient **jamais** l'empreinte du mot de passe, une clé
enveloppée, un sel ou la phrase de récupération : un fichier de sauvegarde ne
doit ni permettre d'usurper un compte, ni d'ouvrir un coffre. Un test le vérifie
en cherchant ces chaînes dans le document produit.

L'import valide **tout** avant d'écrire quoi que ce soit, puis applique en une
seule transaction. Deux modes :

- **fusion** — ajoute ce qui manque ; toute ligne dont l'identifiant (ou, pour
  une étiquette, le nom) existe déjà est ignorée et comptée. Fusionner deux
  versions d'une même tâche demanderait un arbitrage que l'application ne peut
  pas rendre à la place de l'utilisateur ;
- **remplacement** — efface les données de l'utilisateur, puis restaure.

L'invariant `COMPLETED ⟺ completed_at` est réappliqué à l'import : un fichier
édité à la main pourrait le violer, et la contrainte `CHECK` ferait alors
échouer la restauration entière pour une seule ligne.
