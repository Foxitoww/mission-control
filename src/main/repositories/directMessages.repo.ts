import type { Db } from '../db/connection'

/**
 * Messagerie privée entre comptes — base des COMPTES, pas un coffre : aucune
 * de ces requêtes ne filtre par `user_id` au sens d'ADR-003 (une seule ligne
 * appartenant à un seul compte). Chaque requête filtre plutôt par la PAIRE
 * (sender_id, recipient_id) dans un ordre ou l'autre : c'est le service qui
 * garantit que l'un des deux est toujours l'utilisateur de la session.
 */
interface DirectMessageRow {
  id: string
  sender_id: string
  recipient_id: string
  ciphertext: Buffer
  created_at: string
}

export interface ConversationRow {
  other_user_id: string
  last_message_at: string
}

export const directMessagesRepo = {
  insert(
    db: Db,
    data: { id: string; senderId: string; recipientId: string; ciphertext: Buffer; now: string }
  ): void {
    db.prepare(
      `INSERT INTO direct_messages (id, sender_id, recipient_id, ciphertext, created_at)
       VALUES (@id, @senderId, @recipientId, @ciphertext, @now)`
    ).run(data)
  },

  /**
   * Les deux sens d'une conversation, du plus ancien au plus récent.
   *
   * Tri secondaire par `rowid` : deux messages arrivés dans la même
   * milliseconde (l'horodatage a une résolution d'1 ms) doivent quand même
   * réapparaître dans leur ordre d'écriture, jamais un ordre indéterminé.
   */
  listBetween(db: Db, userId: string, otherUserId: string): DirectMessageRow[] {
    return db
      .prepare(
        `SELECT id, sender_id, recipient_id, ciphertext, created_at
           FROM direct_messages
          WHERE (sender_id = @userId AND recipient_id = @otherUserId)
             OR (sender_id = @otherUserId AND recipient_id = @userId)
          ORDER BY created_at ASC, rowid ASC`
      )
      .all({ userId, otherUserId }) as DirectMessageRow[]
  },

  /** Un interlocuteur par ligne, avec l'instant du dernier message échangé. */
  conversationPartners(db: Db, userId: string): ConversationRow[] {
    return db
      .prepare(
        `SELECT other_user_id, MAX(created_at) AS last_message_at FROM (
           SELECT recipient_id AS other_user_id, created_at FROM direct_messages WHERE sender_id = @userId
           UNION ALL
           SELECT sender_id AS other_user_id, created_at FROM direct_messages WHERE recipient_id = @userId
         )
         GROUP BY other_user_id
         ORDER BY last_message_at DESC`
      )
      .all({ userId }) as ConversationRow[]
  },

  seenAt(db: Db, userId: string, otherUserId: string): string | null {
    const row = db
      .prepare('SELECT seen_at FROM direct_message_seen WHERE user_id = ? AND other_user_id = ?')
      .get(userId, otherUserId) as { seen_at: string } | undefined
    return row?.seen_at ?? null
  },

  markSeen(db: Db, userId: string, otherUserId: string, now: string): void {
    db.prepare(
      `INSERT INTO direct_message_seen (user_id, other_user_id, seen_at)
       VALUES (@userId, @otherUserId, @now)
       ON CONFLICT (user_id, other_user_id) DO UPDATE SET seen_at = @now`
    ).run({ userId, otherUserId, now })
  },

  /** Vrai si un message de `otherUserId` vers `userId` est arrivé après la dernière visite. */
  hasUnread(db: Db, userId: string, otherUserId: string): boolean {
    const row = db
      .prepare(
        `SELECT 1 FROM direct_messages m
          WHERE m.sender_id = @otherUserId AND m.recipient_id = @userId
            AND m.created_at > COALESCE(
              (SELECT seen_at FROM direct_message_seen WHERE user_id = @userId AND other_user_id = @otherUserId),
              ''
            )
          LIMIT 1`
      )
      .get({ userId, otherUserId })
    return row !== undefined
  }
}

export type { DirectMessageRow }
