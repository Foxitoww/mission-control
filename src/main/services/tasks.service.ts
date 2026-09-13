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
import { serializeRule, type RecurrenceRule } from '@shared/schemas/recurrence.schema'
import { nextOccurrence } from './recurrence'

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

/**
 * Avancement par défaut d'un changement de statut — dans UN SEUL sens.
 *
 * Un statut explicite fixe l'avancement à ses deux bornes : 0 % pour repartir
 * à faire, 100 % en terminant (« en cours »/« bloquée » n'ont pas de valeur
 * imposée, ils laissent l'avancement où il était). Mais l'avancement ne fait
 * JAMAIS le chemin inverse : le glisser jusqu'à une borne ne termine plus la
 * tâche automatiquement. Seul un geste qui change le statut EXPLICITEMENT —
 * le bouton Terminer/Rouvrir, le glisser-déposer dans le tableau, le champ
 * Statut de l'éditeur — déplace une carte vers sa colonne.
 *
 * Une tâche qui a des sous-tâches n'entre pas dans ce calcul par défaut : son
 * avancement leur est intégralement dérivé (voir subtasksService), y compris
 * quand on la marque terminée sans avoir coché la dernière — l'utilisateur a
 * tranché, l'avancement affiché suit.
 */
function progressFor(status: TaskStatus, current: number): number {
  if (status === 'TODO') return 0
  if (status === 'COMPLETED') return 100
  return current
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

/** Une récurrence sans échéance n'a rien à faire avancer. */
function assertRecurrenceHasDueDate(
  recurrence: RecurrenceRule | null | undefined,
  dueDate: string | null | undefined
): void {
  if (recurrence && !dueDate) {
    throw new AppError(AppErrorCode.VALIDATION_FAILED, 'RECURRENCE_NEEDS_DUE_DATE')
  }
}

/**
 * Crée l'occurrence suivante d'une tâche récurrente qui vient d'être terminée.
 *
 * La tâche terminée est CONSERVÉE : elle devient l'historique de la série. On
 * ne réutilise pas la même ligne en repoussant sa date, sinon « j'ai fait le
 * ménage 14 fois ce trimestre » serait indémontrable, et les statistiques ne
 * compteraient qu'une complétion.
 *
 * Toutes les occurrences pointent vers la PREMIÈRE tâche de la série, jamais
 * vers la précédente : une chaîne obligerait à remonter maillon par maillon, et
 * casserait dès qu'une occupation intermédiaire est supprimée.
 */
function spawnNextOccurrence(db: Db, userId: string, completed: TaskDetail, now: string): void {
  if (!completed.recurrence || !completed.dueDate) return

  const next = nextOccurrence(completed.recurrence, new Date(completed.dueDate), new Date(now))
  if (!next) return

  const id = randomUUID()
  tasksRepo.insert(db, {
    id,
    userId,
    projectId: completed.projectId,
    title: completed.title,
    description: completed.description,
    status: 'TODO',
    priority: completed.priority,
    dueDate: next.toISOString(),
    completedAt: null,
    estimatedMinutes: completed.estimatedMinutes,
    progress: 0,
    position: tasksRepo.nextPosition(db, userId),
    recurrenceRule: serializeRule(completed.recurrence),
    recurrenceParentId: completed.recurrenceParentId ?? completed.id,
    now
  })

  // Les étiquettes suivent la série : une tâche récurrente étiquetée « ménage »
  // le reste à chaque occurrence.
  tasksRepo.setTags(
    db,
    id,
    completed.tags.map((tag) => tag.id)
  )
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
    assertRecurrenceHasDueDate(data.recurrence, data.dueDate)

    const id = randomUUID()
    const now = new Date().toISOString()
    // Une tâche neuve n'a pas encore de sous-tâches : un avancement explicite
    // l'emporte, sinon il suit simplement le statut de départ.
    const progress = data.progress ?? progressFor(data.status, 0)

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
        progress,
        position: tasksRepo.nextPosition(db, userId),
        recurrenceRule: serializeRule(data.recurrence),
        recurrenceParentId: null,
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
    assertRecurrenceHasDueDate(
      data.recurrence === undefined ? existing.recurrence : data.recurrence,
      data.dueDate === undefined ? existing.dueDate : data.dueDate
    )

    const now = new Date().toISOString()
    const fields: Record<string, unknown> = {}

    if (data.title !== undefined) fields['title'] = data.title
    if (data.description !== undefined) fields['description'] = data.description
    if (data.projectId !== undefined) fields['project_id'] = data.projectId
    if (data.priority !== undefined) fields['priority'] = data.priority
    if (data.dueDate !== undefined) fields['due_date'] = data.dueDate
    if (data.estimatedMinutes !== undefined) fields['estimated_minutes'] = data.estimatedMinutes
    if (data.recurrence !== undefined) fields['recurrence_rule'] = serializeRule(data.recurrence)

    // Statut et date de complétion changent ENSEMBLE, jamais séparément ; le
    // statut fixe aussi l'avancement à sa borne par défaut (progressFor).
    if (data.status !== undefined) {
      fields['status'] = data.status
      fields['completed_at'] = completionFor(data.status, existing.completedAt, now)
      fields['progress'] = progressFor(data.status, existing.progress)
    }

    // Un avancement manuel explicite l'emporte sur cette borne par défaut —
    // mais jamais sur une tâche qui a des sous-tâches : leur décompte est la
    // SEULE source de vérité tant qu'il en existe une (subtasksService), un
    // glissé de curseur ne doit pas pouvoir la contredire.
    if (data.progress !== undefined && existing.subtaskTotal === 0) {
      fields['progress'] = data.progress
    }

    const nextStatus = data.status ?? existing.status
    const becomesComplete = nextStatus === 'COMPLETED' && existing.status !== 'COMPLETED'

    db.transaction(() => {
      tasksRepo.update(db, userId, data.id, fields, now)
      if (data.tagIds !== undefined) tasksRepo.setTags(db, data.id, data.tagIds)
      if (becomesComplete) spawnNextOccurrence(db, userId, existing, now)
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
      fields['progress'] = progressFor(data.status, existing.progress)
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
    const progress = progressFor(status, existing.progress)

    db.transaction(() => {
      tasksRepo.update(
        db,
        userId,
        id,
        { status, progress, completed_at: completionFor(status, null, now) },
        now
      )
      if (status === 'COMPLETED') spawnNextOccurrence(db, userId, existing, now)
    })()

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
