import { z } from 'zod'

const id = z.string().uuid()

/** Message privé entre deux comptes — même limite que le chat général d'une app. */
const body = z.string().trim().min(1, 'MESSAGE_EMPTY').max(4000, 'MESSAGE_TOO_LONG')

export const sendMessageInputSchema = z.object({ recipientId: id, body })

export type SendMessageInput = z.infer<typeof sendMessageInputSchema>
