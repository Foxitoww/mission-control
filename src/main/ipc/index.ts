import { registerAuthHandlers } from './auth.ipc'
import { registerProfileHandlers } from './profile.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import { registerUpdateHandlers } from './update.ipc'
import { registerMissionHandlers } from './missions.ipc'

export function registerIpcHandlers(): void {
  registerAuthHandlers()
  registerProfileHandlers()
  registerSettingsHandlers()
  registerUpdateHandlers()
  registerMissionHandlers()
}
