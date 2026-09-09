import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { getDb } from '../db/connection'
import { authService } from '../services/auth.service'
import { rememberStore } from '../lib/remember-store'

/**
 * Aucun handler ci-dessous ne reçoit d'identifiant utilisateur (ADR-003).
 * L'identité vient toujours de la session détenue par le processus main.
 */
export function registerAuthHandlers(): void {
  handle(IpcChannel.AUTH_REGISTER, (input: unknown) => authService.register(getDb(), input))
  handle(IpcChannel.AUTH_LOGIN, (input: unknown) =>
    authService.login(getDb(), input, rememberStore())
  )
  handle(IpcChannel.AUTH_LOGOUT, () => {
    authService.logout(getDb(), rememberStore())
    return null
  })
  handle(IpcChannel.AUTH_CURRENT_USER, () => authService.currentUser(getDb()))
  handle(IpcChannel.AUTH_LIST_USERS, () => authService.listUsers(getDb()))
  handle(IpcChannel.AUTH_DELETE_ACCOUNT, async (input: unknown) => {
    await authService.deleteAccount(getDb(), input, rememberStore())
    return null
  })
}
