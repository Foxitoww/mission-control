import { useState, useCallback, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ProfileMenu } from '@renderer/features/profile/ProfileMenu'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { SearchPalette } from '@renderer/features/search/SearchPalette'
import { useConversations } from '@renderer/features/messages/queries'
import { useI18n, type MessageKey } from '@renderer/i18n'
import { useShortcuts } from './useShortcuts'
import './shell.css'

/**
 * DEEP SPACE MINIMAL — la coque est réduite à un rail d'icônes de 56 px.
 *
 * L'ancienne barre latérale libellée listait neuf destinations parallèles.
 * Ici, l'accueil est la BIBLIOTHÈQUE D'APPS ; Tableau et Calendrier ne sont
 * plus des pages mais des onglets DANS une app. Le rail ne garde donc que les
 * cinq vues qui traversent toutes les apps.
 */
type RailItem = { to: string; key: string; label: MessageKey; end: boolean; icon: ReactNode }

const RAIL: RailItem[] = [
  { to: '/', key: 'a', label: 'nav.apps', end: true, icon: <IconGrid /> },
  { to: '/operations', key: 'o', label: 'nav.today', end: false, icon: <IconToday /> },
  { to: '/timeline', key: 'l', label: 'nav.timeline', end: false, icon: <IconTimeline /> },
  { to: '/objectives', key: 'g', label: 'nav.goals', end: false, icon: <IconTarget /> },
  { to: '/telemetry', key: 's', label: 'nav.stats', end: false, icon: <IconChart /> },
  { to: '/messages', key: 'm', label: 'nav.messages', end: false, icon: <IconMail /> }
]

export function Shell(): JSX.Element {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [composing, setComposing] = useState(false)
  const [searching, setSearching] = useState(false)

  // Pastille du rail : allumée si AU MOINS une conversation a un message non
  // lu, tous comptes confondus — le détail (laquelle) se lit dans la page.
  const { data: conversations = [] } = useConversations()
  const hasUnreadMessages = conversations.some((conversation) => conversation.hasUnread)

  // Raccourcis coupés dès qu'un panneau est ouvert : sinon « o » naviguerait
  // pendant qu'on rédige, sous le formulaire.
  const overlayOpen = composing || searching

  const shortcuts = [
    ...RAIL.map((item) => ({ key: item.key, action: () => navigate(item.to) })),
    { key: 'n', action: () => setComposing(true) },
    { key: '/', action: () => setSearching(true) }
  ]

  useShortcuts(shortcuts, !overlayOpen)

  const closeComposer = useCallback(() => setComposing(false), [])
  const closeSearch = useCallback(() => setSearching(false), [])

  return (
    <div className="shell">
      <a className="shell__skip" href="#mc-content">
        {t('nav.skip')}
      </a>

      <nav className="rail" aria-label={t('nav.label')}>
        <NavLink to="/" end className="rail__mark" aria-label={t('nav.apps')}>
          <span aria-hidden="true" />
        </NavLink>

        <ul className="rail__list">
          {RAIL.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                title={`${t(item.label)}  ·  ${item.key.toUpperCase()}`}
                className={({ isActive }) => `rail__btn${isActive ? ' rail__btn--on' : ''}`}
              >
                {item.icon}
                {item.to === '/messages' && hasUnreadMessages && (
                  <span className="badge-dot" aria-hidden="true" />
                )}
                <span className="rail__tip">{t(item.label)}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="rail__spacer" />

        <ProfileMenu />
      </nav>

      <div className="shell__main">
        <header className="topbar">
          <button type="button" className="topbar__search" onClick={() => setSearching(true)}>
            <IconSearch />
            <span>{t('search.open')}</span>
            <kbd>/</kbd>
          </button>

          <button type="button" className="topbar__new" onClick={() => setComposing(true)}>
            <span aria-hidden="true">+</span>
            {t('task.new')}
            <kbd>N</kbd>
          </button>
        </header>

        <main className="shell__content" id="mc-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      {composing && <TaskEditor onClose={closeComposer} />}
      {searching && <SearchPalette onClose={closeSearch} />}
    </div>
  )
}

/* --- Icônes du rail ------------------------------------------------------
   Traits de 1,5 px sur une grille de 24, sans remplissage : le rail reste
   achromatique, `currentColor` suit l'état (repos / survol / actif). */

function svg(children: ReactNode): JSX.Element {
  return (
    <svg
      className="rail__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

function IconGrid(): JSX.Element {
  return svg(
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  )
}

function IconToday(): JSX.Element {
  return svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  )
}

function IconTimeline(): JSX.Element {
  return svg(
    <>
      <path d="M4 7h10M4 12h16M4 17h7" />
      <circle cx="17" cy="7" r="1.6" />
      <circle cx="13" cy="17" r="1.6" />
    </>
  )
}

function IconTarget(): JSX.Element {
  return svg(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  )
}

function IconChart(): JSX.Element {
  return svg(
    <>
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V6M17 20v-9" />
    </>
  )
}

function IconMail(): JSX.Element {
  return svg(
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4.5 6.5 7.5 6.5 7.5-6.5" />
    </>
  )
}

function IconSearch(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  )
}
