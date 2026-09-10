import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Db } from '../db/connection'
import { taskCommentsRepo } from '../repositories/taskComments.repo'
import { tasksRepo } from '../repositories/tasks.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { TaskComment } from '@shared/types/views'
import { createCommentInputSchema, updateCommentInputSchema } from '@shared/schemas/comment.schema'

const listInputSchema = z.object({ taskId: z.string().uuid() })
const idInputSchema = z.object({ id: z.string().uuid() })

/**
 * Fil de discussion d'une tâche.
 *
 * Même contrat que les sous-tâches : aucune ligne ne porte `user_id`, donc
 * chaque opération repasse par une vérification de propriété de la tâche
 * parente. Payé une fois ici, jamais dupliqué ailleurs.
 */
function requireOwnedTask(db: Db, userId: string, taskId: string): void {
  if (!tasksRepo.findById(db, userId, taskId)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'TASK_NOT_FOUND')
  }
}

function requireOwnedComment(db: Db, userId: string, commentId: string): string {
  if (taskCommentsRepo.ownerOf(db, commentId) !== userId) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'COMMENT_NOT_FOUND')
  }
  const taskId = taskCommentsRepo.taskIdOf(db, commentId)
  if (!taskId) throw new AppError(AppErrorCode.NOT_FOUND, 'COMMENT_NOT_FOUND')
  return taskId
}

export const commentsService = {
  list(db: Db, input: unknown): TaskComment[] {
    const userId = session.requireUserId()
    const { taskId } = parseOrThrow(listInputSchema, input)
    requireOwnedTask(db, userId, taskId)
    return taskCommentsRepo.listForTask(db, taskId)
  },

  /** Ajoute un message et renvoie le fil complet, prêt à réafficher. */
  create(db: Db, input: unknown): TaskComment[] {
    const userId = session.requireUserId()
    const data = parseOrThrow(createCommentInputSchema, input)
    requireOwnedTask(db, userId, data.taskId)

    taskCommentsRepo.insert(db, {
      id: randomUUID(),
      taskId: data.taskId,
      body: data.body,
      now: new Date().toISOString()
    })

    return taskCommentsRepo.listForTask(db, data.taskId)
  },

  update(db: Db, input: unknown): TaskComment[] {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateCommentInputSchema, input)
    const taskId = requireOwnedComment(db, userId, data.id)

    taskCommentsRepo.update(db, data.id, data.body, new Date().toISOString())
    return taskCommentsRepo.listForTask(db, taskId)
  },

  remove(db: Db, input: unknown): TaskComment[] {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    const taskId = requireOwnedComment(db, userId, id)

    taskCommentsRepo.delete(db, id)
    return taskCommentsRepo.listForTask(db, taskId)
  }
}
