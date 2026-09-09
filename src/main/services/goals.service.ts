import { randomUUID } from 'node:crypto'
import type { Db } from '../db/connection'
import { goalsRepo } from '../repositories/goals.repo'
import { projectsRepo } from '../repositories/projects.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { GoalSummary } from '@shared/types/views'
import {
  createGoalInputSchema,
  updateGoalInputSchema,
  advanceGoalInputSchema
} from '@shared/schemas/goal.schema'
import { idInputSchema } from '@shared/schemas/project.schema'

function requireGoal(db: Db, userId: string, id: string): GoalSummary {
  const goal = goalsRepo.findById(db, userId, id)
  if (!goal) throw new AppError(AppErrorCode.NOT_FOUND, 'GOAL_NOT_FOUND')
  return goal
}

function assertProjectOwned(db: Db, userId: string, projectId: string | null): void {
  if (projectId && !projectsRepo.findById(db, userId, projectId)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'PROJECT_NOT_FOUND')
  }
}

/**
 * Atteindre la cible termine l'objectif automatiquement.
 *
 * Demander à l'utilisateur de cocher « terminé » après avoir atteint 20/20
 * serait une corvée administrative : l'information est déjà là, dans les
 * chiffres. En revanche, on ne rouvre JAMAIS un objectif terminé si la valeur
 * redescend — une correction de saisie ne doit pas défaire une réussite.
 */
function statusAfterProgress(current: GoalSummary, value: number): GoalSummary['status'] {
  if (current.status !== 'ACTIVE') return current.status
  return value >= current.targetValue ? 'COMPLETED' : 'ACTIVE'
}

export const goalsService = {
  list(db: Db): GoalSummary[] {
    return goalsRepo.list(db, session.requireUserId())
  },

  create(db: Db, input: unknown): GoalSummary {
    const userId = session.requireUserId()
    const data = parseOrThrow(createGoalInputSchema, input)
    assertProjectOwned(db, userId, data.projectId)

    const id = randomUUID()
    const now = new Date().toISOString()

    goalsRepo.insert(db, {
      id,
      userId,
      projectId: data.projectId,
      title: data.title,
      description: data.description,
      targetValue: data.targetValue,
      currentValue: data.currentValue,
      deadline: data.deadline,
      status: data.status,
      now
    })

    return requireGoal(db, userId, id)
  },

  update(db: Db, input: unknown): GoalSummary {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateGoalInputSchema, input)
    const existing = requireGoal(db, userId, data.id)

    if (data.projectId !== undefined) assertProjectOwned(db, userId, data.projectId)

    const fields: Record<string, unknown> = {}
    if (data.title !== undefined) fields['title'] = data.title
    if (data.description !== undefined) fields['description'] = data.description
    if (data.projectId !== undefined) fields['project_id'] = data.projectId
    if (data.targetValue !== undefined) fields['target_value'] = data.targetValue
    if (data.currentValue !== undefined) fields['current_value'] = data.currentValue
    if (data.deadline !== undefined) fields['deadline'] = data.deadline
    if (data.status !== undefined) fields['status'] = data.status

    // Un statut explicite l'emporte toujours sur la déduction automatique :
    // l'utilisateur a le dernier mot sur son propre objectif.
    if (data.status === undefined && data.currentValue !== undefined) {
      fields['status'] = statusAfterProgress(existing, data.currentValue)
    }

    goalsRepo.update(db, userId, data.id, fields, new Date().toISOString())
    return requireGoal(db, userId, data.id)
  },

  /** Incrément rapide depuis la carte. Ne descend jamais sous zéro. */
  advance(db: Db, input: unknown): GoalSummary {
    const userId = session.requireUserId()
    const data = parseOrThrow(advanceGoalInputSchema, input)
    const existing = requireGoal(db, userId, data.id)

    const value = Math.max(0, existing.currentValue + data.by)

    goalsRepo.update(
      db,
      userId,
      data.id,
      { current_value: value, status: statusAfterProgress(existing, value) },
      new Date().toISOString()
    )

    return requireGoal(db, userId, data.id)
  },

  remove(db: Db, input: unknown): null {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    if (!goalsRepo.delete(db, userId, id)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'GOAL_NOT_FOUND')
    }
    return null
  }
}
