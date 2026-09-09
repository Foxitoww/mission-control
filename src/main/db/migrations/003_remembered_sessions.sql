-- =============================================================================
-- 003_remembered_sessions — Option « se souvenir de moi »
--
-- Une ligne par session persistée. Le jeton BRUT n'est jamais stocké ici : la
-- base ne contient que son empreinte SHA-256. Le jeton lui-même vit dans un
-- fichier séparé du dossier de données, ce qui permet de le révoquer en
-- supprimant l'un OU l'autre.
--
-- CASCADE depuis users : supprimer un compte révoque immédiatement toutes ses
-- sessions mémorisées, sans code applicatif dédié.
-- =============================================================================

CREATE TABLE remembered_sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_remembered_sessions_user ON remembered_sessions (user_id);
