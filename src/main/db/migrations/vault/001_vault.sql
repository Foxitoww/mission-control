-- =============================================================================
-- COFFRE — une base par utilisateur, chiffrée au repos (ADR-007).
--
-- Les colonnes `user_id` sont conservées bien que le coffre n'appartienne qu'à
-- une seule personne. Ce n'est pas une redondance oubliée : l'isolation repose
-- désormais sur DEUX couches indépendantes.
--
--   1. physique  — un fichier chiffré distinct par compte ;
--   2. logique   — le filtre `WHERE user_id = ?` de chaque requête.
--
-- Une faille dans l'une ne suffit pas. Et tous les tests d'isolation existants
-- continuent de valider la seconde.
--
-- Il n'y a plus de clé étrangère vers `users` : cette table vit dans une autre
-- base. La suppression d'un compte efface désormais le FICHIER entier, ce qui
-- est plus radical qu'une cascade.
-- =============================================================================

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
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
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL,
  -- SET NULL et non CASCADE : supprimer un projet ne doit pas détruire le
  -- travail déjà consigné. Les tâches retombent dans la boîte de réception.
  project_id           TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  status               TEXT NOT NULL DEFAULT 'TODO'
                         CHECK (status IN ('TODO','IN_PROGRESS','BLOCKED','COMPLETED','ARCHIVED')),
  priority             TEXT NOT NULL DEFAULT 'MEDIUM'
                         CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  due_date             TEXT,
  completed_at         TEXT,
  estimated_minutes    INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  -- REAL : réordonner par glisser-déposer écrit UNE ligne (moyenne des voisins)
  -- au lieu de renuméroter toute la colonne.
  position             REAL NOT NULL DEFAULT 0,
  recurrence_rule      TEXT,
  recurrence_parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  -- Invariant : COMPLETED <=> completed_at renseigné.
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE TABLE subtasks (
  id        TEXT PRIMARY KEY,
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  position  REAL NOT NULL DEFAULT 0
);

CREATE TABLE tags (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#4FD5E8',
  UNIQUE (user_id, name)
);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE goals (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
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
  user_id               TEXT PRIMARY KEY,
  theme                 TEXT NOT NULL DEFAULT 'dark'
                          CHECK (theme IN ('dark','light','system')),
  language              TEXT NOT NULL DEFAULT 'fr'
                          CHECK (language IN ('fr','en')),
  notifications_enabled INTEGER NOT NULL DEFAULT 1
                          CHECK (notifications_enabled IN (0,1)),
  preferences           TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_tasks_user_status    ON tasks (user_id, status);
CREATE INDEX idx_tasks_user_due       ON tasks (user_id, due_date);
CREATE INDEX idx_tasks_user_project   ON tasks (user_id, project_id);
CREATE INDEX idx_tasks_user_priority  ON tasks (user_id, priority);
CREATE INDEX idx_projects_user_status ON projects (user_id, status);
CREATE INDEX idx_subtasks_task        ON subtasks (task_id);
CREATE INDEX idx_task_tags_tag        ON task_tags (tag_id);
CREATE INDEX idx_tags_user            ON tags (user_id);
CREATE INDEX idx_goals_user_status    ON goals (user_id, status);
