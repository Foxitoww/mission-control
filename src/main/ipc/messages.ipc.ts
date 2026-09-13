import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { getAccountsDb } from '../db/connection'
import { messagesService } from '../services/messages.service'

/**
 * Messagerie privée entre comptes — base des COMPTES, comme auth.ipc.ts.
 * Aucun handler ne reçoit l'identifiant de l'expéditeur (ADR-003) : il vient
 * toujours de la session détenue par le processus main.
 */
export function registerMessageHandlers(): void {
  handle(IpcChannel.MESSAGES_CONVERSATIONS, () => messagesService.conversations(getAccountsDb()))
  handle(IpcChannel.MESSAGES_LIST, (input: unknown) => messagesService.list(getAccountsDb(), input))
  handle(IpcChannel.MESSAGES_SEND, (input: unknown) => messagesService.send(getAccountsDb(), input))
  handle(IpcChannel.MESSAGES_MARK_SEEN, (input: unknown) =>
    messagesService.markSeen(getAccountsDb(), input)
  )
}
