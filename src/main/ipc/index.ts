import { registerAuthHandlers } from './auth.ipc'
import { registerSettingsHandlers } from './settings.ipc'

export function registerIpcHandlers(): void {
  registerAuthHandlers()
  registerSettingsHandlers()
}
