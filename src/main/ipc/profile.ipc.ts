import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { getAccountsDb } from '../db/connection'
import { profileService } from '../services/profile.service'

export function registerProfileHandlers(): void {
  handle(IpcChannel.PROFILE_UPDATE, (input: unknown) =>
    profileService.update(getAccountsDb(), input)
  )
}
