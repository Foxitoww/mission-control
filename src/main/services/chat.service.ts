import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Db } from '../db/connection'
import { chatMessagesRepo } from '../repositories/chatMessages.repo'
import { projectsRepo } from '../repositories/projects.repo'
import { session } from './session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { ChatMessage } from '@shared/types/views'
import {
  createChatMessageInputSchema,
  updateChatMessageInputSchema,
  reactToChatMessageInputSchema
} from '@shared/schemas/chat.schema'

const listInputSchema = z.object({ projectId: z.string().uuid() })
const idInputSchema = z.object({ id: z.string().uuid() })

/**
 * Chat général d'une app — séparé du fil de discussion d'une tâche
 * (comments.service.ts). Même contrat que lui : aucune ligne ne porte
 * `user_id`, chaque opération repasse par une vérification de propriété de
 * l'app parente.
 */
function requireOwnedProject(db: Db, userId: string, projectId: string): void {
  if (!projectsRepo.findById(db, userId, projectId)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'PROJECT_NOT_FOUND')
  }
}

function requireOwnedMessage(db: Db, userId: string, messageId: string): string {
  if (chatMessagesRepo.ownerOf(db, messageId) !== userId) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'CHAT_MESSAGE_NOT_FOUND')
  }
  const projectId = chatMessagesRepo.projectIdOf(db, messageId)
  if (!projectId) throw new AppError(AppErrorCode.NOT_FOUND, 'CHAT_MESSAGE_NOT_FOUND')
  return projectId
}

export const chatService = {
  list(db: Db, input: unknown): ChatMessage[] {
    const userId = session.requireUserId()
    const { projectId } = parseOrThrow(listInputSchema, input)
    requireOwnedProject(db, userId, projectId)
    return chatMessagesRepo.listForProject(db, projectId)
  },

  /** Ajoute un message et renvoie le fil complet, prêt à réafficher. */
  create(db: Db, input: unknown): ChatMessage[] {
    const userId = session.requireUserId()
    const data = parseOrThrow(createChatMessageInputSchema, input)
    requireOwnedProject(db, userId, data.projectId)

    chatMessagesRepo.insert(db, {
      id: randomUUID(),
      projectId: data.projectId,
      body: data.body,
      now: new Date().toISOString()
    })

    return chatMessagesRepo.listForProject(db, data.projectId)
  },

  update(db: Db, input: unknown): ChatMessage[] {
    const userId = session.requireUserId()
    const data = parseOrThrow(updateChatMessageInputSchema, input)
    const projectId = requireOwnedMessage(db, userId, data.id)

    chatMessagesRepo.update(db, data.id, data.body, new Date().toISOString())
    return chatMessagesRepo.listForProject(db, projectId)
  },

  /** Pose, change ou retire sa réaction (`reaction: null`) sur un message. */
  react(db: Db, input: unknown): ChatMessage[] {
    const userId = session.requireUserId()
    const data = parseOrThrow(reactToChatMessageInputSchema, input)
    const projectId = requireOwnedMessage(db, userId, data.id)

    chatMessagesRepo.react(db, data.id, data.reaction, new Date().toISOString())
    return chatMessagesRepo.listForProject(db, projectId)
  },

  remove(db: Db, input: unknown): ChatMessage[] {
    const userId = session.requireUserId()
    const { id } = parseOrThrow(idInputSchema, input)
    const projectId = requireOwnedMessage(db, userId, id)

    chatMessagesRepo.delete(db, id)
    return chatMessagesRepo.listForProject(db, projectId)
  }
}
