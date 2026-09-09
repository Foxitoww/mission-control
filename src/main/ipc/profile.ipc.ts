import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { getDb } from '../db/connection'
import { profileService } from '../services/profile.service'

export function registerProfileHandlers(): void {
  handle(IpcChannel.PROFILE_UPDATE, (input: unknown) => profileService.update(getDb(), input))
}
