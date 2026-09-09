-- =============================================================================
-- Base des COMPTES — non chiffrée, et volontairement pauvre.
--
-- Elle ne contient que ce qu'il faut pour afficher l'écran d'accès et ouvrir un
-- coffre : identité visible, empreinte du mot de passe, et clés de données
-- ENVELOPPÉES. Aucune tâche, aucun projet, aucune note. Quiconque lit ce
-- fichier apprend qui a un compte sur la machine, rien de plus.
--
-- La clé de données (DEK) n'apparaît jamais en clair : seulement scellée par
-- une clé dérivée du mot de passe, par une clé dérivée de la phrase de
-- récupération, et facultativement par le système d'exploitation.
-- =============================================================================

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar        TEXT,
  accent_color  TEXT NOT NULL DEFAULT '#3D7BFF',

  -- Sel de dérivation de la clé de chiffrement. DISTINCT de celui du hachage du
  -- mot de passe : sans quoi l'empreinte stockée et la clé du coffre seraient
  -- deux dérivations du même sel, et compromettre l'une aiderait pour l'autre.
  kdf_salt      BLOB NOT NULL,
  dek_password  BLOB NOT NULL,

  recovery_salt BLOB NOT NULL,
  dek_recovery  BLOB NOT NULL,

  -- Scellée par le système (DPAPI sous Windows) quand « se souvenir de moi »
  -- est actif. NULL sinon : le confort est un choix, pas un défaut.
  dek_os        BLOB,

  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE remembered_sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_remembered_sessions_user ON remembered_sessions (user_id);
