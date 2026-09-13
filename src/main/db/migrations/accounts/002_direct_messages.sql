-- =============================================================================
-- MESSAGERIE PRIVÉE entre comptes.
--
-- Vit dans la base des comptes (non chiffrée au repos) parce qu'aucun coffre
-- individuel ne peut héberger une conversation entre DEUX comptes distincts.
-- Le contenu, lui, reste protégé : chaque message est chiffré (AES-256-GCM)
-- par un secret dérivé par ECDH (X25519) entre l'expéditeur et le
-- destinataire — ni ce fichier ni quiconque n'y a accès en clair sans détenir
-- la clé privée de l'un des deux comptes, elle-même scellée par sa DEK.
-- =============================================================================

-- Clé publique en clair (nécessaire pour que N'IMPORTE QUEL compte puisse
-- chiffrer un message à cette personne) ; clé privée scellée par la DEK du
-- compte, au même titre que dek_password l'est par le mot de passe.
ALTER TABLE users ADD COLUMN messaging_public_key BLOB;
ALTER TABLE users ADD COLUMN messaging_private_key_sealed BLOB;

CREATE TABLE direct_messages (
  id              TEXT PRIMARY KEY,
  sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- `seal()` : [IV 12][chiffré][tag 16]. Jamais de texte en clair ici.
  ciphertext      BLOB NOT NULL,
  created_at      TEXT NOT NULL
);

-- Une conversation se lit dans les deux sens : les deux index couvrent
-- chacun des deux ordres (sender, recipient) sans dépendre d'un OR au moment
-- de la requête.
CREATE INDEX idx_direct_messages_sender ON direct_messages (sender_id, recipient_id, created_at);
CREATE INDEX idx_direct_messages_recipient ON direct_messages (recipient_id, sender_id, created_at);

-- Pastille « non lu » d'une conversation, même geste que tasks_seen_at /
-- chat_seen_at sur les apps (voir 005_project_activity_seen.sql côté coffre) :
-- une paire (moi, l'autre) et l'instant de ma dernière visite de ce fil.
CREATE TABLE direct_message_seen (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seen_at       TEXT NOT NULL,
  PRIMARY KEY (user_id, other_user_id)
);
