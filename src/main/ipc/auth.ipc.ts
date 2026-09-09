import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { getAccountsDb } from '../db/connection'
import { authService } from '../services/auth.service'
import { rememberStore } from '../lib/remember-store'

/**
 * Aucun handler ci-dessous ne reçoit d'identifiant utilisateur (ADR-003).
 * L'identité vient toujours de la session détenue par le processus main.
 */
export function registerAuthHandlers(): void {
  handle(IpcChannel.AUTH_REGISTER, (input: unknown) => authService.register(getAccountsDb(), input))
  handle(IpcChannel.AUTH_LOGIN, (input: unknown) =>
    authService.login(getAccountsDb(), input, rememberStore())
  )
  handle(IpcChannel.AUTH_LOGOUT, () => {
    authService.logout(getAccountsDb(), rememberStore())
    return null
  })
  handle(IpcChannel.AUTH_CURRENT_USER, () => authService.currentUser(getAccountsDb()))
  handle(IpcChannel.AUTH_LIST_USERS, () => authService.listUsers(getAccountsDb()))
  handle(IpcChannel.AUTH_DELETE_ACCOUNT, async (input: unknown) => {
    await authService.deleteAccount(getAccountsDb(), input, rememberStore())
    return null
  })
  handle(IpcChannel.AUTH_RECOVER, (input: unknown) => authService.recover(getAccountsDb(), input))
  handle(IpcChannel.AUTH_CHANGE_PASSWORD, (input: unknown) =>
    authService.changePassword(getAccountsDb(), input)
  )
}
