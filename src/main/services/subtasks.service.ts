import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Db } from '../db/connection'
import { subtasksRepo } from '../repositories/subtasks.repo'
import { tasksRepo } from '../repositories/tasks.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { TaskDetail } from '@shared/types/views'
import { createSubtaskInputSchema, updateSubtaskInputSchema } from '@shared/schemas/task.schema'
import { idInputSchema } from '@shared/schemas/project.schema'

const reorderInputSchema = z.object({
  taskId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).max(200)
})

/**
 * Les sous-tâches n'ont pas de `user_id` : leur propriétaire se déduit de la
 * tâche parente. Chaque opération repasse donc par cette vérification — c'est
 * le prix de la dénormalisation évitée, et il est payé à un seul endroit.
 */
function requireOwnedTask(db: Db, userId: string, taskId: string): TaskDetail {
  const task = tasksRepo.findById(db, userId, taskId)
  if (!task) throw new AppError(AppErrorCode.NOT_FOUND, 'TASK_NOT_FOUND')
  return task
}

function requireOwnedSubtask(db: Db, userId: string, subtaskId: string): void {
  if (subtasksRepo.ownerOf(db, subtaskId) !== userId) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'SUBTASK_NOT_FOUND')
  }
}

/**
 * Recalcule l'avancement de la tâche à partir de ses sous-tâches et le
 * persiste, puis renvoie la tâche à jour.
 *
 * Tant qu'une tâche a au moins une sous-tâche, leur ratio est la SEULE
 * source de vérité de son avancement — jamais le statut (progressFor,
 * tasks.service.ts), jamais un glissé manuel de la barre (bloqué côté
 * service pour ces tâches-là). Sans cascade et sans sous-tâche, l'avancement
 * reste ce qu'il était : le rendre à l'utilisateur plutôt que de le remettre
 * à zéro au hasard d'une suppression.
 */
function applySubtaskProgress(db: Db, userId: string, taskId: string): TaskDetail {
  const task = requireOwnedTask(db, userId, taskId)
  if (task.subtaskTotal === 0) return task

  const progress = Math.round((task.subtaskDone / task.subtaskTotal) * 100)
  if (progress === task.progress) return task

  tasksRepo.update(db, userId, taskId, { progress }, new Date().toISOString())
  return requireOwnedTask(db, userId, taskId)
}

export const subtasksService = {
  create(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const data = parseOrThrow(createSubtaskInputSchema, input)
    requireOwnedTask(db, userId, data.taskId)

    subtasksRepo.insert(db, {
      id: randomUUID(),
      taskId: data.taskId,
      title: data.title,
      position: subtasksRepo.nextPosition(db, data.taskId)
    })

    return applySubtaskProgress(db, userId, data.taskId)
  },

  update(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateSubtaskInputSchema, input)
    requireOwnedSubtask(db, userId, data.id)

    const fields: Record<string, unknown> = {}
    if (data.title !== undefined) fields['title'] = data.title
    // SQLite n'a pas de booléen : on convertit ici, une fois, plutôt que de
    // laisser chaque appelant se souvenir de la convention 0/1.
    if (data.completed !== undefined) fields['completed'] = data.completed ? 1 : 0

    subtasksRepo.update(db, data.id, fields)

    const taskId = db.prepare('SELECT task_id FROM subtasks WHERE id = ?').get(data.id) as
      { task_id: string } | undefined
    if (!taskId) throw new AppError(AppErrorCode.NOT_FOUND, 'SUBTASK_NOT_FOUND')

    return applySubtaskProgress(db, userId, taskId.task_id)
  },

  remove(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    requireOwnedSubtask(db, userId, id)

    const taskId = db.prepare('SELECT task_id FROM subtasks WHERE id = ?').get(id) as
      { task_id: string } | undefined
    if (!taskId) throw new AppError(AppErrorCode.NOT_FOUND, 'SUBTASK_NOT_FOUND')

    subtasksRepo.delete(db, id)
    return applySubtaskProgress(db, userId, taskId.task_id)
  },

  reorder(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const data = parseOrThrow(reorderInputSchema, input)
    requireOwnedTask(db, userId, data.taskId)

    // `reorder` filtre déjà sur task_id : une sous-tâche d'une autre tâche
    // glissée dans la liste ne serait tout simplement pas mise à jour.
    subtasksRepo.reorder(db, data.taskId, data.orderedIds)
    return requireOwnedTask(db, userId, data.taskId)
  }
}
