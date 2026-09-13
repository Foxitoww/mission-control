import { registerAuthHandlers } from './auth.ipc'
import { registerProfileHandlers } from './profile.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import { registerUpdateHandlers } from './update.ipc'
import { registerBackupHandlers } from './backup.ipc'
import { registerMissionHandlers } from './missions.ipc'
import { registerMessageHandlers } from './messages.ipc'

export function registerIpcHandlers(): void {
  registerAuthHandlers()
  registerProfileHandlers()
  registerSettingsHandlers()
  registerUpdateHandlers()
  registerBackupHandlers()
  registerMissionHandlers()
  registerMessageHandlers()
}
