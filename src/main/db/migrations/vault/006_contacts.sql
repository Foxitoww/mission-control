-- =============================================================================
-- CARNET DE CONTACTS — local pour la V1, sans dépendance réseau (voir
-- contacts.service.ts pour la frontière prévue avec une future API).
--
-- Même double isolation que le reste du coffre (voir 001_vault.sql) :
-- fichier chiffré propre au compte, ET colonne user_id sur chaque ligne
-- possédée directement.
-- =============================================================================

CREATE TABLE contacts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  company    TEXT,
  notes      TEXT,
  color      TEXT NOT NULL DEFAULT '#3D7BFF',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Table de liaison, comme task_tags : ni l'un ni l'autre bout ne porte de
-- user_id propre, la propriété se déduit des deux tables qu'elle relie — le
-- service vérifie les DEUX avant d'écrire ici (voir assertProjectsOwned).
CREATE TABLE contact_projects (
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, project_id)
);

CREATE INDEX idx_contacts_user ON contacts (user_id, name);
CREATE INDEX idx_contact_projects_project ON contact_projects (project_id);
