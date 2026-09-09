import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ACCENT_COLORS, THEMES, LANGUAGES, type Theme, type Language } from '@shared/types/domain'
import { updateProfileInputSchema } from '@shared/schemas/profile.schema'
import { Modal } from '@renderer/components/Modal'
import { Button } from '@renderer/components/Button'
import { TextField } from '@renderer/components/TextField'
import { Avatar } from '@renderer/components/Avatar'
import { useI18n } from '@renderer/i18n'
import { IpcError } from '@renderer/lib/ipc'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { useSettings } from '@renderer/features/settings/SettingsProvider'
import { UpdateSection } from '@renderer/features/update/UpdateSection'
import { fileToAvatarDataUri, AvatarImageError } from './avatar-image'
import './profile.css'

function fieldFor(key: string): 'username' | 'displayName' | null {
  if (key.startsWith('USERNAME')) return 'username'
  if (key.startsWith('DISPLAY_NAME')) return 'displayName'
  return null
}

export function ProfileEditor({ onClose }: { onClose: () => void }): JSX.Element {
  const { t, tError } = useI18n()
  const { user, updateProfile } = useAuth()
  const { settings, update: updateSettings } = useSettings()
  const fileInput = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [avatar, setAvatar] = useState<string | null>(user?.avatar ?? null)
  const [accentColor, setAccentColor] = useState(user?.accentColor ?? ACCENT_COLORS[0])
  const [theme, setTheme] = useState<Theme>(settings?.theme ?? 'dark')
  const [language, setLanguage] = useState<Language>(settings?.language ?? 'fr')

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // L'aperçu est piloté par l'état local, pas par la valeur enregistrée : on voit
  // le résultat de son choix avant de valider, y compris la couleur d'accent.
  const preview = { displayName: displayName || '?', avatar, accentColor }

  const isEmojiAvatar = avatar !== null && !avatar.startsWith('data:')

  async function pickImage(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]
    // On vide tout de suite la valeur de l'input : sans cela, resélectionner le
    // même fichier après un retrait ne déclencherait aucun événement.
    event.target.value = ''
    if (!file) return

    setFormError(null)
    try {
      setAvatar(await fileToAvatarDataUri(file))
    } catch (error) {
      setFormError(tError(error instanceof AvatarImageError ? error.key : 'UNKNOWN'))
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setFieldErrors({})
    setFormError(null)

    const parsed = updateProfileInputSchema.safeParse({
      username,
      displayName,
      avatar,
      accentColor
    })

    if (!parsed.success) {
      const key = parsed.error.issues[0]?.message ?? 'VALIDATION_FAILED'
      const field = fieldFor(key)
      if (field) setFieldErrors({ [field]: tError(key) })
      else setFormError(tError(key))
      return
    }

    setBusy(true)
    try {
      await updateProfile(parsed.data)
      // Les préférences sont une table distincte : deux appels, mais l'ordre
      // compte peu — aucun des deux ne dépend du résultat de l'autre.
      if (theme !== settings?.theme || language !== settings?.language) {
        await updateSettings({ theme, language })
      }
      onClose()
    } catch (error) {
      const key = error instanceof IpcError ? error.key : 'UNKNOWN'
      const field = fieldFor(key)
      if (field) setFieldErrors({ [field]: tError(key) })
      else setFormError(tError(key))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={t('profile.title')} label="Operator profile" onClose={onClose}>
      <form className="profile-form" onSubmit={submit} noValidate>
        {formError && (
          <div className="mc-alert" role="alert">
            <span>{formError}</span>
          </div>
        )}

        <section className="profile-section">
          <span className="mc-label">{t('profile.avatar')}</span>
          <div className="profile-avatar-row">
            <Avatar user={preview} size={72} />
            <div className="profile-avatar-actions">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void pickImage(event)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                {t('profile.avatarUpload')}
              </Button>
              {avatar !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAvatar(null)}
                  disabled={busy}
                >
                  {t('profile.avatarRemove')}
                </Button>
              )}
              <span className="mc-field__hint">{t('profile.avatarHint')}</span>
            </div>
          </div>

          <TextField
            label={t('profile.emoji')}
            value={isEmojiAvatar ? avatar : ''}
            maxLength={16}
            disabled={busy}
            placeholder="🛰️"
            onChange={(event) => setAvatar(event.target.value || null)}
          />
        </section>

        <section className="profile-section">
          <span className="mc-label">{t('profile.identity')}</span>
          <TextField
            label={t('auth.displayName')}
            value={displayName}
            disabled={busy}
            onChange={(event) => setDisplayName(event.target.value)}
            error={fieldErrors['displayName']}
          />
          <TextField
            label={t('auth.username')}
            value={username}
            spellCheck={false}
            disabled={busy}
            onChange={(event) => setUsername(event.target.value)}
            hint={t('auth.hint.username')}
            error={fieldErrors['username']}
          />
        </section>

        <section className="profile-section">
          <span className="mc-label">{t('profile.appearance')}</span>

          <div className="profile-control">
            <span className="mc-field__label">{t('profile.accent')}</span>
            <div className="mc-swatches" role="group" aria-label={t('profile.accent')}>
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="mc-swatch"
                  style={{ background: color }}
                  aria-pressed={accentColor === color}
                  aria-label={color}
                  disabled={busy}
                  onClick={() => setAccentColor(color)}
                />
              ))}
            </div>
          </div>

          <div className="profile-control">
            <span className="mc-field__label">{t('profile.theme')}</span>
            <div className="mc-segments" role="group" aria-label={t('profile.theme')}>
              {THEMES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="mc-segment"
                  aria-pressed={theme === option}
                  disabled={busy}
                  onClick={() => setTheme(option)}
                >
                  {t(`theme.${option}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="profile-control">
            <span className="mc-field__label">{t('profile.language')}</span>
            <div className="mc-segments" role="group" aria-label={t('profile.language')}>
              {LANGUAGES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="mc-segment mc-data"
                  aria-pressed={language === option}
                  disabled={busy}
                  onClick={() => setLanguage(option)}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </section>

        <UpdateSection />

        <div className="mc-modal__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
