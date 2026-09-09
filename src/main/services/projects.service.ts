import { randomUUID } from 'node:crypto'
import type { Db } from '../db/connection'
import { projectsRepo } from '../repositories/projects.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { ProjectSummary } from '@shared/types/views'
import {
  createProjectInputSchema,
  updateProjectInputSchema,
  idInputSchema
} from '@shared/schemas/project.schema'

function requireProject(db: Db, userId: string, id: string): ProjectSummary {
  const project = projectsRepo.findById(db, userId, id)
  if (!project) throw new AppError(AppErrorCode.NOT_FOUND, 'PROJECT_NOT_FOUND')
  return project
}

export const projectsService = {
  list(db: Db): ProjectSummary[] {
    return projectsRepo.list(db, session.requireUserId())
  },

  get(db: Db, input: unknown): ProjectSummary {
    const userId = session.requireUserId()
    return requireProject(db, userId, parseOrThrow(idInputSchema, input).id)
  },

  create(db: Db, input: unknown): ProjectSummary {
    const userId = session.requireUserId()
    const data = parseOrThrow(createProjectInputSchema, input)

    const id = randomUUID()
    const now = new Date().toISOString()

    projectsRepo.insert(db, {
      id,
      userId,
      name: data.name,
      description: data.description,
      color: data.color,
      icon: data.icon,
      status: data.status,
      deadline: data.deadline,
      position: projectsRepo.nextPosition(db, userId),
      now
    })

    return requireProject(db, userId, id)
  },

  update(db: Db, input: unknown): ProjectSummary {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateProjectInputSchema, input)
    requireProject(db, userId, data.id)

    const fields: Record<string, unknown> = {}
    if (data.name !== undefined) fields['name'] = data.name
    if (data.description !== undefined) fields['description'] = data.description
    if (data.color !== undefined) fields['color'] = data.color
    if (data.icon !== undefined) fields['icon'] = data.icon
    if (data.status !== undefined) fields['status'] = data.status
    if (data.deadline !== undefined) fields['deadline'] = data.deadline

    projectsRepo.update(db, userId, data.id, fields, new Date().toISOString())
    return requireProject(db, userId, data.id)
  },

  /**
   * Supprime le projet. Ses tâches sont DÉTACHÉES, pas supprimées : le schéma
   * les remet dans la boîte de réception (ON DELETE SET NULL). Détruire du
   * travail parce qu'on range une mission serait une perte silencieuse.
   */
  remove(db: Db, input: unknown): null {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    if (!projectsRepo.delete(db, userId, id)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'PROJECT_NOT_FOUND')
    }
    return null
  }
}
