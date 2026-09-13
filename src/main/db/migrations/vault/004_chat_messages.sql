-- Chat général d'une app — séparé des commentaires de tâche (task_comments) :
-- une discussion qui concerne l'app entière, pas une tâche précise.
--
-- CASCADE et non SET NULL : à la différence d'une tâche (qui survit à la
-- suppression de son projet, simplement détachée), un message de discussion
-- EST le contenu du canal de l'app. Le canal disparaît avec elle, comme les
-- commentaires disparaissent avec leur tâche.
--
-- La réaction est en ligne sur le message plutôt que dans une table à part :
-- un utilisateur ne peut en activer qu'une seule à la fois (§ demande), donc
-- une valeur unique par message — nullable, retirable — suffit à représenter
-- exactement cette règle, sans table ni jointure superflues.
CREATE TABLE chat_messages (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  reaction   TEXT CHECK (reaction IS NULL OR reaction IN ('👍', '❤️', '😂')),
  edited     INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_chat_messages_project ON chat_messages (project_id, created_at);
