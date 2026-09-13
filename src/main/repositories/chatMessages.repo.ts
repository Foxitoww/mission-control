import type { Db } from '../db/connection'
import type { ChatMessage } from '@shared/types/views'
import type { ChatReaction } from '@shared/schemas/chat.schema'

/**
 * Chat général d'une app.
 *
 * Pas de `user_id` : la propriété se déduit du projet parent, comme pour les
 * commentaires de tâche (taskComments.repo.ts). Chaque méthode suppose donc
 * que l'appelant a déjà vérifié cette propriété — c'est le rôle du service.
 * `ownerOf` rend la vérification possible en une requête.
 */
interface ChatMessageRow {
  id: string
  project_id: string
  body: string
  reaction: string | null
  edited: number
  created_at: string
  updated_at: string
}

function toMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    projectId: row.project_id,
    body: row.body,
    reaction: row.reaction as ChatReaction | null,
    edited: row.edited === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export const chatMessagesRepo = {
  insert(db: Db, data: { id: string; projectId: string; body: string; now: string }): void {
    db.prepare(
      `INSERT INTO chat_messages (id, project_id, body, reaction, edited, created_at, updated_at)
       VALUES (@id, @projectId, @body, NULL, 0, @now, @now)`
    ).run(data)
  },

  /** Le fil d'une app, du plus ancien au plus récent : ordre de lecture. */
  listForProject(db: Db, projectId: string): ChatMessage[] {
    const rows = db
      .prepare(
        `SELECT id, project_id, body, reaction, edited, created_at, updated_at
           FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC`
      )
      .all(projectId) as ChatMessageRow[]
    return rows.map(toMessage)
  },

  /** Utilisateur propriétaire de l'app parente, ou `null` si le message n'existe pas. */
  ownerOf(db: Db, messageId: string): string | null {
    const row = db
      .prepare(
        `SELECT p.user_id FROM chat_messages m
           JOIN projects p ON p.id = m.project_id
          WHERE m.id = ?`
      )
      .get(messageId) as { user_id: string } | undefined
    return row?.user_id ?? null
  },

  /** App parente d'un message. */
  projectIdOf(db: Db, messageId: string): string | null {
    const row = db.prepare('SELECT project_id FROM chat_messages WHERE id = ?').get(messageId) as
      { project_id: string } | undefined
    return row?.project_id ?? null
  },

  update(db: Db, id: string, body: string, now: string): boolean {
    // `edited = 1` définitivement : un message retouché reste marqué comme tel.
    // La réaction n'est pas touchée : éditer le texte et réagir sont deux
    // gestes distincts, l'un ne doit jamais effacer l'autre.
    return (
      db
        .prepare(
          `UPDATE chat_messages SET body = @body, edited = 1, updated_at = @now WHERE id = @id`
        )
        .run({ body, now, id }).changes > 0
    )
  },

  /**
   * Pose, change ou retire la réaction — `reaction: null` la retire. Une
   * seule colonne, jamais deux méthodes qui pourraient diverger.
   */
  react(db: Db, id: string, reaction: ChatReaction | null, now: string): boolean {
    return (
      db
        .prepare('UPDATE chat_messages SET reaction = @reaction, updated_at = @now WHERE id = @id')
        .run({ reaction, now, id }).changes > 0
    )
  },

  delete(db: Db, id: string): boolean {
    return db.prepare('DELETE FROM chat_messages WHERE id = ?').run(id).changes > 0
  }
}
