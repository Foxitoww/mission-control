-- =============================================================================
-- 002 — Commentaires de tâche (fil de discussion façon messagerie)
--
-- Une tâche peut porter un fil de messages : on y note un blocage, un contexte,
-- une décision. Application mono-utilisateur : tous les messages sont de la même
-- personne. Le rendu reste conversationnel (bulles, horodatage) pour que ça se
-- lise comme une discussion, et pour rester prêt si une synchro multi-poste
-- arrive un jour.
--
-- Pas de `user_id` : la propriété se déduit de la tâche parente, comme pour les
-- sous-tâches. La cascade efface le fil quand la tâche disparaît.
-- =============================================================================

CREATE TABLE task_comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  edited     INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_task_comments_task ON task_comments (task_id, created_at);
