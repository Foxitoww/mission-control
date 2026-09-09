import { randomUUID } from 'node:crypto'
import type { Db } from '../db/connection'
import { tasksRepo, POSITION_STEP } from '../repositories/tasks.repo'
import { projectsRepo } from '../repositories/projects.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { TaskStatus } from '@shared/types/domain'
import type { TaskListItem, TaskDetail } from '@shared/types/views'
import {
  createTaskInputSchema,
  updateTaskInputSchema,
  moveTaskInputSchema,
  taskFilterSchema
} from '@shared/schemas/task.schema'
import { idInputSchema } from '@shared/schemas/project.schema'

/**
 * Applique l'invariant du schéma : `status = COMPLETED` ⟺ `completed_at` renseigné.
 *
 * La base le fait respecter par une contrainte CHECK, mais une contrainte ne
 * fait qu'échouer. C'est ici que la règle est *appliquée* — et rassembler les
 * deux champs en un seul endroit empêche qu'un futur appelant n'en oublie un.
 * Terminer deux fois ne réécrit pas la date : on garde la première.
 */
function completionFor(status: TaskStatus, current: string | null, now: string): string | null {
  if (status !== 'COMPLETED') return null
  return current ?? now
}

/** Vérifie que le projet visé appartient bien à l'utilisateur courant. */
function assertProjectOwned(db: Db, userId: string, projectId: string | null): void {
  if (projectId && !projectsRepo.findById(db, userId, projectId)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'PROJECT_NOT_FOUND')
  }
}

function assertTagsOwned(db: Db, userId: string, tagIds: string[]): void {
  if (!tasksRepo.tagsBelongToUser(db, userId, tagIds)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'TAG_NOT_FOUND')
  }
}

function requireTask(db: Db, userId: string, id: string): TaskDetail {
  const task = tasksRepo.findById(db, userId, id)
  // La requête est déjà filtrée par user_id : une tâche appartenant à quelqu'un
  // d'autre est donc « introuvable », et rien ne révèle qu'elle existe.
  if (!task) throw new AppError(AppErrorCode.NOT_FOUND, 'TASK_NOT_FOUND')
  return task
}

export const tasksService = {
  list(db: Db, input: unknown): TaskListItem[] {
    const userId = session.requireUserId()
    return tasksRepo.list(db, userId, parseOrThrow(taskFilterSchema, input ?? {}))
  },

  get(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    return requireTask(db, userId, id)
  },

  create(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const data = parseOrThrow(createTaskInputSchema, input)

    assertProjectOwned(db, userId, data.projectId)
    assertTagsOwned(db, userId, data.tagIds)

    const id = randomUUID()
    const now = new Date().toISOString()

    db.transaction(() => {
      tasksRepo.insert(db, {
        id,
        userId,
        projectId: data.projectId,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        dueDate: data.dueDate,
        completedAt: completionFor(data.status, null, now),
        estimatedMinutes: data.estimatedMinutes,
        position: tasksRepo.nextPosition(db, userId),
        now
      })
      tasksRepo.setTags(db, id, data.tagIds)
    })()

    return requireTask(db, userId, id)
  },

  update(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateTaskInputSchema, input)
    const existing = requireTask(db, userId, data.id)

    if (data.projectId !== undefined) assertProjectOwned(db, userId, data.projectId)
    if (data.tagIds !== undefined) assertTagsOwned(db, userId, data.tagIds)

    const now = new Date().toISOString()
    const fields: Record<string, unknown> = {}

    if (data.title !== undefined) fields['title'] = data.title
    if (data.description !== undefined) fields['description'] = data.description
    if (data.projectId !== undefined) fields['project_id'] = data.projectId
    if (data.priority !== undefined) fields['priority'] = data.priority
    if (data.dueDate !== undefined) fields['due_date'] = data.dueDate
    if (data.estimatedMinutes !== undefined) fields['estimated_minutes'] = data.estimatedMinutes

    // Statut et date de complétion changent ENSEMBLE, jamais séparément.
    if (data.status !== undefined) {
      fields['status'] = data.status
      fields['completed_at'] = completionFor(data.status, existing.completedAt, now)
    }

    db.transaction(() => {
      tasksRepo.update(db, userId, data.id, fields, now)
      if (data.tagIds !== undefined) tasksRepo.setTags(db, data.id, data.tagIds)
    })()

    return requireTask(db, userId, data.id)
  },

  /**
   * Réordonne, et change éventuellement de colonne Kanban.
   *
   * La nouvelle position est la moyenne des voisins : UNE écriture, quel que
   * soit le nombre de tâches déplacées visuellement. Renuméroter la colonne
   * entière coûterait une écriture par ligne à chaque glisser-déposer.
   */
  move(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const data = parseOrThrow(moveTaskInputSchema, input)
    const existing = requireTask(db, userId, data.id)

    const before = data.beforeId ? tasksRepo.positionOf(db, userId, data.beforeId) : null
    const after = data.afterId ? tasksRepo.positionOf(db, userId, data.afterId) : null
    const bounds = tasksRepo.bounds(db, userId)

    let position: number
    if (before !== null && after !== null) position = (before + after) / 2
    else if (before !== null) position = before + POSITION_STEP
    else if (after !== null) position = after - POSITION_STEP
    else position = bounds.max + POSITION_STEP

    const now = new Date().toISOString()
    const fields: Record<string, unknown> = { position }

    if (data.status !== undefined && data.status !== existing.status) {
      fields['status'] = data.status
      fields['completed_at'] = completionFor(data.status, existing.completedAt, now)
    }

    tasksRepo.update(db, userId, data.id, fields, now)
    return requireTask(db, userId, data.id)
  },

  /** Bascule terminé / à faire — l'action la plus fréquente, donc la plus directe. */
  toggle(db: Db, input: unknown): TaskDetail {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    const existing = requireTask(db, userId, id)

    const status: TaskStatus = existing.status === 'COMPLETED' ? 'TODO' : 'COMPLETED'
    const now = new Date().toISOString()

    tasksRepo.update(
      db,
      userId,
      id,
      { status, completed_at: completionFor(status, null, now) },
      now
    )
    return requireTask(db, userId, id)
  },

  remove(db: Db, input: unknown): null {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    if (!tasksRepo.delete(db, userId, id)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'TASK_NOT_FOUND')
    }
    return null
  }
}
