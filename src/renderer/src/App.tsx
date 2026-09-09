import { useAuth } from './features/auth/AuthProvider'
import { AuthScreen } from './features/auth/AuthScreen'
import { ProfileMenu } from './features/profile/ProfileMenu'
import { useI18n } from './i18n'

/**
 * Sol provisoire de la Phase 2 : confirme que la session tient et que le profil
 * pilote bien l'apparence. Remplacé par le vrai tableau de bord en Phase 3.
 */
function DashboardPlaceholder(): JSX.Element {
  const { t } = useI18n()

  return (
    <div className="shell">
      <header className="shell__header">
        <div>
          <span className="mc-label">Mission control</span>
          <h1 className="shell__title">{t('app.name')}</h1>
        </div>
        <ProfileMenu />
      </header>

      <section className="shell__body">
        <span className="mc-label">Phase 2 — foundation</span>
        <p className="shell__note">
          Base locale, migrations, authentification, session et profil opérationnels. Le tableau de
          bord arrive en Phase 3.
        </p>
      </section>
    </div>
  )
}

/** Écran d'attente pendant l'interrogation de la session, côté main. */
function Booting(): JSX.Element {
  const { t } = useI18n()
  return (
    <div className="booting">
      <span className="mc-label">{t('app.name')}</span>
      <span className="mc-data booting__status">INITIALISING…</span>
    </div>
  )
}

export function App(): JSX.Element {
  const { status } = useAuth()

  if (status === 'checking') return <Booting />
  if (status === 'signed-out') return <AuthScreen />
  return <DashboardPlaceholder />
}
