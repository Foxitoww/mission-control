import type { Db } from '../db/connection'
import type { PublicUser } from '@shared/types/domain'

/**
 * Enregistrement interne, avec l'empreinte du mot de passe. Ne quitte JAMAIS
 * le processus main. Le type PublicUser est le seul à traverser l'IPC.
 */
export interface UserRecord extends PublicUser {
  passwordHash: string
}

/** Matériel cryptographique d'un compte. Ne sort jamais des services de sécurité. */
export interface UserKeys {
  kdfSalt: Buffer
  dekPassword: Buffer
  recoverySalt: Buffer
  dekRecovery: Buffer
  dekOs: Buffer | null
}

interface UserRow {
  id: string
  username: string
  display_name: string
  password_hash: string
  avatar: string | null
  accent_color: string
  created_at: string
}

const PUBLIC_COLUMNS = 'id, username, display_name, avatar, accent_color, created_at'

function toPublic(row: Omit<UserRow, 'password_hash'>): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatar: row.avatar,
    accentColor: row.accent_color,
    createdAt: row.created_at
  }
}

export const usersRepo = {
  insert(
    db: Db,
    user: {
      id: string
      username: string
      displayName: string
      passwordHash: string
      avatar: string | null
      kdfSalt: Buffer
      dekPassword: Buffer
      recoverySalt: Buffer
      dekRecovery: Buffer
      now: string
    }
  ): void {
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, avatar,
                          kdf_salt, dek_password, recovery_salt, dek_recovery,
                          created_at, updated_at)
       VALUES (@id, @username, @displayName, @passwordHash, @avatar,
               @kdfSalt, @dekPassword, @recoverySalt, @dekRecovery, @now, @now)`
    ).run(user)
  },

  /** Seul point d'accès à l'empreinte — réservé à la vérification du mot de passe. */
  findByUsername(db: Db, username: string): UserRecord | null {
    const row = db
      .prepare(`SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE username = ?`)
      .get(username) as UserRow | undefined
    return row ? { ...toPublic(row), passwordHash: row.password_hash } : null
  },

  findById(db: Db, id: string): PublicUser | null {
    const row = db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`).get(id) as
      Omit<UserRow, 'password_hash'> | undefined
    return row ? toPublic(row) : null
  },

  /**
   * Profils affichés sur l'écran de connexion. N'expose que l'identité visible :
   * aucune donnée métier, aucune empreinte, aucune clé.
   */
  listPublic(db: Db): PublicUser[] {
    const rows = db
      .prepare(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY created_at ASC`)
      .all() as Omit<UserRow, 'password_hash'>[]
    return rows.map(toPublic)
  },

  keys(db: Db, userId: string): UserKeys | null {
    const row = db
      .prepare(
        'SELECT kdf_salt, dek_password, recovery_salt, dek_recovery, dek_os FROM users WHERE id = ?'
      )
      .get(userId) as
      | {
          kdf_salt: Buffer
          dek_password: Buffer
          recovery_salt: Buffer
          dek_recovery: Buffer
          dek_os: Buffer | null
        }
      | undefined

    return row
      ? {
          kdfSalt: row.kdf_salt,
          dekPassword: row.dek_password,
          recoverySalt: row.recovery_salt,
          dekRecovery: row.dek_recovery,
          dekOs: row.dek_os
        }
      : null
  },

  /**
   * Réemballe la clé de données pour un nouveau mot de passe.
   *
   * Les DONNÉES ne sont pas touchées : seuls 32 octets sont rechiffrés. C'est
   * tout l'intérêt du chiffrement enveloppe — sans lui, changer de mot de passe
   * imposerait de relire et réécrire l'intégralité du coffre.
   */
  rewrapPassword(
    db: Db,
    userId: string,
    data: { passwordHash: string; kdfSalt: Buffer; dekPassword: Buffer; now: string }
  ): void {
    db.prepare(
      `UPDATE users
          SET password_hash = @passwordHash, kdf_salt = @kdfSalt,
              dek_password = @dekPassword, updated_at = @now
        WHERE id = @userId`
    ).run({ ...data, userId })
  },

  /** Scelle (ou retire) la clé protégée par le système d'exploitation. */
  setOsKey(db: Db, userId: string, sealed: Buffer | null): void {
    db.prepare('UPDATE users SET dek_os = ? WHERE id = ?').run(sealed, userId)
  },

  /** Clé publique de messagerie d'un compte — lisible par tout autre compte. */
  messagingPublicKey(db: Db, userId: string): Buffer | null {
    const row = db.prepare('SELECT messaging_public_key FROM users WHERE id = ?').get(userId) as
      { messaging_public_key: Buffer | null } | undefined
    return row?.messaging_public_key ?? null
  },

  /** Clé privée SCELLÉE (par la DEK du compte) — jamais lue pour un autre compte. */
  messagingPrivateKeySealed(db: Db, userId: string): Buffer | null {
    const row = db
      .prepare('SELECT messaging_private_key_sealed FROM users WHERE id = ?')
      .get(userId) as { messaging_private_key_sealed: Buffer | null } | undefined
    return row?.messaging_private_key_sealed ?? null
  },

  /** Écrit la paire de clés de messagerie — une seule fois par compte (voir messages.service.ts). */
  setMessagingKeys(db: Db, userId: string, publicKey: Buffer, privateKeySealed: Buffer): void {
    db.prepare(
      'UPDATE users SET messaging_public_key = ?, messaging_private_key_sealed = ? WHERE id = ?'
    ).run(publicKey, privateKeySealed, userId)
  },

  usernameTakenByOther(db: Db, username: string, exceptUserId: string): boolean {
    return (
      db
        .prepare('SELECT 1 FROM users WHERE username = ? AND id <> ?')
        .get(username, exceptUserId) !== undefined
    )
  },

  updateProfile(
    db: Db,
    userId: string,
    data: {
      username: string
      displayName: string
      avatar: string | null
      accentColor: string
      now: string
    }
  ): void {
    db.prepare(
      `UPDATE users
          SET username = @username, display_name = @displayName, avatar = @avatar,
              accent_color = @accentColor, updated_at = @now
        WHERE id = @userId`
    ).run({ ...data, userId })
  },

  /** Efface la ligne. Le COFFRE, lui, est supprimé séparément par le service. */
  deleteById(db: Db, id: string): void {
    db.prepare('DELETE FROM users WHERE id = ?').run(id)
  }
}
