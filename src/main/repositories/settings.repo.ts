import type { Db } from '../db/connection'
import type { Settings } from '@shared/types/domain'

interface SettingsRow {
  theme: Settings['theme']
  language: Settings['language']
  notifications_enabled: number
  preferences: string
}

function toSettings(row: SettingsRow): Settings {
  let preferences: Record<string, unknown> = {}
  try {
    // Le JSON vient de notre propre écriture, mais un fichier restauré ou édité
    // à la main pourrait être corrompu. Des préférences illisibles ne doivent
    // pas empêcher l'application de démarrer.
    preferences = JSON.parse(row.preferences) as Record<string, unknown>
  } catch {
    preferences = {}
  }

  return {
    theme: row.theme,
    language: row.language,
    notificationsEnabled: row.notifications_enabled === 1,
    preferences
  }
}

export const settingsRepo = {
  /** Créé à l'inscription, dans la même transaction que l'utilisateur. */
  insertDefaults(db: Db, userId: string, language: Settings['language']): void {
    db.prepare('INSERT INTO settings (user_id, language) VALUES (?, ?)').run(userId, language)
  },

  get(db: Db, userId: string): Settings | null {
    const row = db
      .prepare(
        'SELECT theme, language, notifications_enabled, preferences FROM settings WHERE user_id = ?'
      )
      .get(userId) as SettingsRow | undefined
    return row ? toSettings(row) : null
  },

  update(db: Db, userId: string, patch: Partial<Settings>): void {
    const current = settingsRepo.get(db, userId)
    if (!current) return
    const next = { ...current, ...patch }

    db.prepare(
      `UPDATE settings
          SET theme = ?, language = ?, notifications_enabled = ?, preferences = ?
        WHERE user_id = ?`
    ).run(
      next.theme,
      next.language,
      next.notificationsEnabled ? 1 : 0,
      JSON.stringify(next.preferences),
      userId
    )
  }
}
