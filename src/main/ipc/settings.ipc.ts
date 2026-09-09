import { z } from 'zod'
import { IpcChannel } from '@shared/ipc-contract'
import { handle } from './registry'
import { settingsRepo } from '../repositories/settings.repo'
import { session } from '../services/session.service'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import { THEMES, LANGUAGES, type Settings } from '@shared/types/domain'

const settingsPatchSchema = z.object({
  theme: z.enum(THEMES).optional(),
  language: z.enum(LANGUAGES).optional(),
  notificationsEnabled: z.boolean().optional(),
  preferences: z.record(z.unknown()).optional()
})

/** Les préférences vivent DANS le coffre : elles sont donc chiffrées au repos. */
function read(userId: string): Settings {
  const settings = settingsRepo.get(session.requireVault(), userId)
  if (!settings) throw new AppError(AppErrorCode.NOT_FOUND, 'SETTINGS_NOT_FOUND')
  return settings
}

export function registerSettingsHandlers(): void {
  handle(IpcChannel.SETTINGS_GET, () => read(session.requireUserId()))

  handle(IpcChannel.SETTINGS_UPDATE, (patch: unknown) => {
    const userId = session.requireUserId()
    settingsRepo.update(session.requireVault(), userId, parseOrThrow(settingsPatchSchema, patch))
    session.persist()
    return read(userId)
  })
}
