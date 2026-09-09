import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { updateService } from '../services/update.service'

export function registerUpdateHandlers(): void {
  handle(IpcChannel.UPDATE_STATUS, () => updateService.current())
  handle(IpcChannel.UPDATE_CHECK, () => updateService.check())
  handle(IpcChannel.UPDATE_INSTALL, () => {
    updateService.installNow()
    return null
  })
}
