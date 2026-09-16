import { randomUUID } from 'node:crypto'
import type { Db } from '../db/connection'
import { contactsRepo } from '../repositories/contacts.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { ContactSummary } from '@shared/types/views'
import { idInputSchema } from '@shared/schemas/project.schema'
import { createContactInputSchema, updateContactInputSchema } from '@shared/schemas/contact.schema'

/**
 * Carnet de contacts local (V1 hors-ligne).
 *
 * FRONTIÈRE PRÉVUE POUR UNE API FUTURE. Ce service est le SEUL point qui sait
 * que les contacts vivent aujourd'hui dans SQLite : `contactsRepo` pourrait
 * demain devenir un client HTTP sans que l'IPC (contacts.ipc.ts), le pont de
 * préchargement, ni la moindre ligne du renderer ne changent — ils ne
 * connaissent que des Promises renvoyant des objets `ContactSummary`, la
 * même forme qu'un futur appel réseau renverrait. C'est déjà le cas de tous
 * les autres services (tasks, projects…) : rien de nouveau à construire ici,
 * juste à ne pas laisser un détail SQLite (un `Db`, une ligne brute) fuiter
 * au-delà de cette frontière. Introduire une interface `IContactsRepository`
 * formelle maintenant, pour une V1 qui n'a qu'une seule implémentation,
 * ajouterait une indirection sans bénéfice actuel.
 */
function requireContact(db: Db, userId: string, id: string): ContactSummary {
  const contact = contactsRepo.findById(db, userId, id)
  if (!contact) throw new AppError(AppErrorCode.NOT_FOUND, 'CONTACT_NOT_FOUND')
  return contact
}

/** Même garde que `assertTagsOwned` dans tasks.service.ts, pour la même raison. */
function assertProjectsOwned(db: Db, userId: string, projectIds: string[]): void {
  if (!contactsRepo.projectsBelongToUser(db, userId, projectIds)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'PROJECT_NOT_FOUND')
  }
}

export const contactsService = {
  list(db: Db): ContactSummary[] {
    return contactsRepo.list(db, session.requireUserId())
  },

  get(db: Db, input: unknown): ContactSummary {
    const userId = session.requireUserId()
    return requireContact(db, userId, parseOrThrow(idInputSchema, input).id)
  },

  create(db: Db, input: unknown): ContactSummary {
    const userId = session.requireUserId()
    const data = parseOrThrow(createContactInputSchema, input)
    assertProjectsOwned(db, userId, data.projectIds)

    const id = randomUUID()
    const now = new Date().toISOString()

    contactsRepo.insert(db, {
      id,
      userId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      company: data.company,
      notes: data.notes,
      color: data.color,
      now
    })
    if (data.projectIds.length > 0) contactsRepo.setProjects(db, id, data.projectIds)

    return requireContact(db, userId, id)
  },

  update(db: Db, input: unknown): ContactSummary {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateContactInputSchema, input)
    requireContact(db, userId, data.id)
    if (data.projectIds !== undefined) assertProjectsOwned(db, userId, data.projectIds)

    const fields: Record<string, unknown> = {}
    if (data.name !== undefined) fields['name'] = data.name
    if (data.email !== undefined) fields['email'] = data.email
    if (data.phone !== undefined) fields['phone'] = data.phone
    if (data.company !== undefined) fields['company'] = data.company
    if (data.notes !== undefined) fields['notes'] = data.notes
    if (data.color !== undefined) fields['color'] = data.color

    contactsRepo.update(db, userId, data.id, fields, new Date().toISOString())
    if (data.projectIds !== undefined) contactsRepo.setProjects(db, data.id, data.projectIds)

    return requireContact(db, userId, data.id)
  },

  remove(db: Db, input: unknown): null {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    if (!contactsRepo.delete(db, userId, id)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'CONTACT_NOT_FOUND')
    }
    return null
  }
}
