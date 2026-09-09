import { randomUUID } from 'node:crypto'
import type { Db } from '../db/connection'
import { tagsRepo, type TagWithUsage } from '../repositories/tags.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { Tag } from '@shared/types/domain'
import { createTagInputSchema, updateTagInputSchema, idInputSchema } from '@shared/schemas/project.schema'

export const tagsService = {
  list(db: Db): TagWithUsage[] {
    return tagsRepo.list(db, session.requireUserId())
  },

  /**
   * Crée un tag, ou renvoie l'existant s'il porte déjà ce nom.
   *
   * Le schéma impose UNIQUE(user_id, name). Plutôt que de faire échouer une
   * saisie rapide dans le champ « ajouter un tag », on renvoie celui qui existe :
   * l'utilisateur voulait étiqueter sa tâche, pas gérer une collection.
   */
  create(db: Db, input: unknown): Tag {
    const userId = session.requireUserId()
    const data = parseOrThrow(createTagInputSchema, input)

    const existing = tagsRepo.findByName(db, userId, data.name)
    if (existing) return existing

    const id = randomUUID()
    tagsRepo.insert(db, { id, userId, name: data.name, color: data.color })
    return { id, name: data.name, color: data.color }
  },

  update(db: Db, input: unknown): Tag {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateTagInputSchema, input)

    if (data.name !== undefined && tagsRepo.nameTakenByOther(db, userId, data.name, data.id)) {
      throw new AppError(AppErrorCode.CONFLICT, 'TAG_NAME_TAKEN')
    }

    const fields: Record<string, unknown> = {}
    if (data.name !== undefined) fields['name'] = data.name
    if (data.color !== undefined) fields['color'] = data.color

    if (!tagsRepo.update(db, userId, data.id, fields)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'TAG_NOT_FOUND')
    }

    const updated = tagsRepo.list(db, userId).find((tag) => tag.id === data.id)
    if (!updated) throw new AppError(AppErrorCode.NOT_FOUND, 'TAG_NOT_FOUND')
    return { id: updated.id, name: updated.name, color: updated.color }
  },

  /** La cascade de `task_tags` retire l'étiquette de toutes les tâches concernées. */
  remove(db: Db, input: unknown): null {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    if (!tagsRepo.delete(db, userId, id)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'TAG_NOT_FOUND')
    }
    return null
  }
}
