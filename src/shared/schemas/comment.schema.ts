import { z } from 'zod'

const id = z.string().uuid()

/**
 * Un message de fil de discussion.
 *
 * 4 000 caractères : assez pour coller une trace d'erreur ou un paragraphe de
 * contexte, pas assez pour transformer le fil en document. Ce qui déborde est
 * une description de tâche, pas un message.
 */
const body = z.string().trim().min(1, 'COMMENT_EMPTY').max(4000, 'COMMENT_TOO_LONG')

export const createCommentInputSchema = z.object({ taskId: id, body })

export const updateCommentInputSchema = z.object({ id, body })

export type CreateCommentInput = z.infer<typeof createCommentInputSchema>
export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>
