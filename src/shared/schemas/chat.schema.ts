import { z } from 'zod'

const id = z.string().uuid()

/**
 * Chat général d'une app — les messages sont libres, à la différence des
 * réactions (voir CHAT_REACTIONS) qui sont volontairement bornées.
 */
const body = z.string().trim().min(1, 'CHAT_MESSAGE_EMPTY').max(4000, 'CHAT_MESSAGE_TOO_LONG')

/**
 * Palette FERMÉE de réactions. Trois, pas plus : au-delà, ce n'est plus une
 * réaction rapide mais un second clavier d'emojis à maintenir. `as const`
 * sert la même triple fonction que TASK_STATUSES — type, validation Zod,
 * contrainte SQL — depuis une unique déclaration.
 */
export const CHAT_REACTIONS = ['👍', '❤️', '😂'] as const
export type ChatReaction = (typeof CHAT_REACTIONS)[number]

export const createChatMessageInputSchema = z.object({ projectId: id, body })

export const updateChatMessageInputSchema = z.object({ id, body })

/**
 * Poser, changer ou retirer sa réaction sont la MÊME opération : écrire une
 * valeur (ou `null`). Il n'existe donc qu'un seul verbe, jamais un couple
 * ajouter/retirer qui pourrait diverger de « une seule réaction active ».
 */
export const reactToChatMessageInputSchema = z.object({
  id,
  reaction: z.enum(CHAT_REACTIONS).nullable()
})

export type CreateChatMessageInput = z.infer<typeof createChatMessageInputSchema>
export type UpdateChatMessageInput = z.infer<typeof updateChatMessageInputSchema>
export type ReactToChatMessageInput = z.infer<typeof reactToChatMessageInputSchema>
