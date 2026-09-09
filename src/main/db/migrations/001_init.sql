-- =============================================================================
-- 001_init — Schéma initial de MISSION CONTROL
--
-- Règles appliquées ici :
--   · chaque table possédée porte user_id + ON DELETE CASCADE depuis users,
--     pour qu'une suppression de compte n'ait aucun résidu ;
--   · chaque énumération est verrouillée par CHECK, pour que la base refuse un
--     état invalide même si le code a un bug ;
--   · chaque index utile commence par user_id, car c'est le filtre présent dans
--     100 % des requêtes.
-- =============================================================================

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#3D7BFF',
  icon        TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE','PAUSED','COMPLETED','ARCHIVED')),
  deadline    TEXT,
  position    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE tasks (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- SET NULL et non CASCADE : supprimer un projet ne doit pas détruire le
  -- travail déjà consigné. Les tâches retombent dans la boîte de réception.
  project_id          TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL DEFAULT 'TODO'
                        CHECK (status IN ('TODO','IN_PROGRESS','BLOCKED','COMPLETED','ARCHIVED')),
  priority            TEXT NOT NULL DEFAULT 'MEDIUM'
                        CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  due_date            TEXT,
  completed_at        TEXT,
  estimated_minutes   INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  -- REAL : réordonner par glisser-déposer écrit UNE ligne (moyenne des voisins)
  -- au lieu de renuméroter toute la colonne.
  position            REAL NOT NULL DEFAULT 0,
  recurrence_rule     TEXT,
  recurrence_parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  -- Invariant : COMPLETED <=> completed_at renseigné. Empêche les statistiques
  -- de diverger de la réalité.
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE TABLE subtasks (
  id        TEXT PRIMARY KEY,
  -- Pas de user_id : la propriété se déduit de task_id, et la cascade suffit.
  -- Toute lecture joint tasks pour filtrer sur user_id.
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  position  REAL NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#4FD5E8',
  -- Deux utilisateurs peuvent avoir un tag "urgent" ; un seul par utilisateur.
  UNIQUE (user_id, name)
);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE goals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  target_value  REAL NOT NULL DEFAULT 100 CHECK (target_value > 0),
  current_value REAL NOT NULL DEFAULT 0   CHECK (current_value >= 0),
  deadline      TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE','COMPLETED','ABANDONED')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE settings (
  user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme                 TEXT NOT NULL DEFAULT 'dark'
                          CHECK (theme IN ('dark','light','system')),
  language              TEXT NOT NULL DEFAULT 'fr'
                          CHECK (language IN ('fr','en')),
  notifications_enabled INTEGER NOT NULL DEFAULT 1
                          CHECK (notifications_enabled IN (0,1)),
  preferences           TEXT NOT NULL DEFAULT '{}'
);

-- Index : tous préfixés par user_id (filtre universel), puis par la colonne
-- réellement utilisée pour trier ou filtrer dans chaque vue.
CREATE INDEX idx_tasks_user_status    ON tasks (user_id, status);
CREATE INDEX idx_tasks_user_due       ON tasks (user_id, due_date);
CREATE INDEX idx_tasks_user_project   ON tasks (user_id, project_id);
CREATE INDEX idx_tasks_user_priority  ON tasks (user_id, priority);
CREATE INDEX idx_projects_user_status ON projects (user_id, status);
CREATE INDEX idx_subtasks_task        ON subtasks (task_id);
CREATE INDEX idx_task_tags_tag        ON task_tags (tag_id);
CREATE INDEX idx_tags_user            ON tags (user_id);
CREATE INDEX idx_goals_user_status    ON goals (user_id, status);
