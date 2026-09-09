import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { registerInputSchema, loginInputSchema } from '@shared/schemas/auth.schema'
import { Button } from '@renderer/components/Button'
import { TextField } from '@renderer/components/TextField'
import { Avatar } from '@renderer/components/Avatar'
import { Checkbox } from '@renderer/components/Checkbox'
import { useI18n, useToggleLanguage } from '@renderer/i18n'
import { IpcError } from '@renderer/lib/ipc'
import { useAuth } from './AuthProvider'
import './auth.css'

type Mode = 'profiles' | 'login' | 'register'

/** Champ concerné par une clé de validation, pour ancrer l'erreur au bon endroit. */
function fieldFor(key: string): 'username' | 'displayName' | 'password' | null {
  if (key.startsWith('USERNAME')) return 'username'
  if (key.startsWith('DISPLAY_NAME')) return 'displayName'
  if (key.startsWith('PASSWORD')) return 'password'
  return null
}

export function AuthScreen(): JSX.Element {
  const { t, tError, language } = useI18n()
  const toggleLanguage = useToggleLanguage()
  const { profiles, signIn, signUp } = useAuth()

  const [mode, setMode] = useState<Mode>('profiles')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)

  // Premier lancement : aucun profil n'existe, la liste n'aurait rien à montrer.
  // On ouvre directement la création de compte plutôt qu'un écran vide.
  useEffect(() => {
    if (profiles.length === 0) setMode((current) => (current === 'profiles' ? 'register' : current))
  }, [profiles.length])

  function resetErrors(): void {
    setFieldErrors({})
    setFormError(null)
  }

  function goTo(next: Mode, presetUsername = ''): void {
    resetErrors()
    setMode(next)
    setUsername(presetUsername)
    setPassword('')
    setPasswordConfirm('')
    setDisplayName('')
  }

  /** Traduit une erreur de validation ou d'IPC vers le bon emplacement d'affichage. */
  function reportError(key: string): void {
    const field = fieldFor(key)
    if (field) setFieldErrors({ [field]: tError(key) })
    else setFormError(tError(key))
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    resetErrors()

    if (mode === 'register' && password !== passwordConfirm) {
      // Contrôle purement client : le main ne reçoit qu'un mot de passe, la
      // confirmation n'a de sens que dans le formulaire.
      setFieldErrors({ passwordConfirm: tError('PASSWORD_MISMATCH') })
      return
    }

    // Première barrière de validation : les MÊMES schémas Zod que le processus
    // main applique de son côté. Ici c'est pour le confort — retour immédiat,
    // sans aller-retour IPC. Là-bas c'est pour la sécurité.
    const schema = mode === 'register' ? registerInputSchema : loginInputSchema
    const payload =
      mode === 'register'
        ? { username, displayName, password, avatar: null }
        : { username, password, remember }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      reportError(parsed.error.issues[0]?.message ?? 'VALIDATION_FAILED')
      return
    }

    setBusy(true)
    try {
      if (mode === 'register') await signUp(parsed.data as never)
      else await signIn(parsed.data as never)
    } catch (error) {
      reportError(error instanceof IpcError ? error.key : 'UNKNOWN')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-grid" aria-hidden="true" />
        <div className="auth__brand-content">
          <span className="mc-label">Ground segment</span>
          <h1 className="auth__title">{t('app.name')}</h1>
          <p className="auth__tagline">{t('app.tagline')}</p>

          <dl className="auth__telemetry">
            <div>
              <dt className="mc-label">Storage</dt>
              <dd className="mc-data">LOCAL / SQLITE</dd>
            </div>
            <div>
              <dt className="mc-label">Network</dt>
              <dd className="mc-data">OFFLINE</dd>
            </div>
            <div>
              <dt className="mc-label">Profiles</dt>
              <dd className="mc-data">{String(profiles.length).padStart(2, '0')}</dd>
            </div>
          </dl>
        </div>
      </aside>

      <main className="auth__panel">
        <div className="auth__panel-inner">
          <header className="auth__header">
            <span className="mc-label">Access control</span>
            <h2 className="auth__heading">
              {mode === 'register' ? t('auth.signUp') : t('auth.signIn')}
            </h2>
          </header>

          {mode === 'profiles' && (
            <>
              <ul className="auth__profiles">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <button
                      type="button"
                      className="auth__profile"
                      // Chaque carte porte l'accent de SON profil : on reconnaît
                      // son compte à la couleur avant même de lire le nom.
                      style={{ '--mc-accent': profile.accentColor } as CSSProperties}
                      onClick={() => goTo('login', profile.username)}
                    >
                      <Avatar user={profile} size={38} />
                      <span className="auth__profile-text">
                        <span className="auth__profile-name">{profile.displayName}</span>
                        <span className="auth__profile-username mc-data">@{profile.username}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <Button variant="secondary" block onClick={() => goTo('register')}>
                {t('auth.newProfile')}
              </Button>
            </>
          )}

          {mode !== 'profiles' && (
            <form className="auth__form" onSubmit={submit} noValidate>
              {formError && (
                <div className="mc-alert" role="alert">
                  <span>{formError}</span>
                </div>
              )}

              <TextField
                label={t('auth.username')}
                value={username}
                autoFocus={mode === 'register' || username === ''}
                autoComplete="username"
                spellCheck={false}
                disabled={busy}
                onChange={(event) => setUsername(event.target.value)}
                hint={mode === 'register' ? t('auth.hint.username') : undefined}
                error={fieldErrors['username']}
              />

              {mode === 'register' && (
                <TextField
                  label={t('auth.displayName')}
                  value={displayName}
                  autoComplete="name"
                  disabled={busy}
                  onChange={(event) => setDisplayName(event.target.value)}
                  error={fieldErrors['displayName']}
                />
              )}

              <TextField
                label={t('auth.password')}
                type="password"
                value={password}
                autoFocus={mode === 'login' && username !== ''}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                disabled={busy}
                onChange={(event) => setPassword(event.target.value)}
                hint={mode === 'register' ? t('auth.hint.password') : undefined}
                error={fieldErrors['password']}
              />

              {mode === 'register' && (
                <TextField
                  label={t('auth.passwordConfirm')}
                  type="password"
                  value={passwordConfirm}
                  autoComplete="new-password"
                  disabled={busy}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  error={fieldErrors['passwordConfirm']}
                />
              )}

              {mode === 'login' && (
                <Checkbox
                  label={t('auth.remember')}
                  hint={t('auth.rememberHint')}
                  checked={remember}
                  disabled={busy}
                  onChange={(event) => setRemember(event.target.checked)}
                />
              )}

              <Button type="submit" block loading={busy}>
                {busy
                  ? mode === 'register'
                    ? t('auth.creating')
                    : t('auth.working')
                  : mode === 'register'
                    ? t('auth.signUp')
                    : t('auth.signIn')}
              </Button>

              <p className="auth__switch">
                {mode === 'register' ? t('auth.hasAccount') : t('auth.noAccount')}{' '}
                <button
                  type="button"
                  className="auth__link"
                  disabled={busy}
                  onClick={() =>
                    goTo(mode === 'register' && profiles.length > 0 ? 'profiles' : mode === 'register' ? 'login' : 'register')
                  }
                >
                  {mode === 'register'
                    ? profiles.length > 0
                      ? t('auth.backToProfiles')
                      : t('auth.signIn')
                    : t('auth.signUp')}
                </button>
              </p>
            </form>
          )}

          <footer className="auth__footer">
            <button type="button" className="auth__link mc-data" onClick={toggleLanguage}>
              {language === 'fr' ? 'EN' : 'FR'}
            </button>
          </footer>
        </div>
      </main>
    </div>
  )
}
