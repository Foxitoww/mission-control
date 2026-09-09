import { useState, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@renderer/components/Button'
import { ProfileMenu } from '@renderer/features/profile/ProfileMenu'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { SearchPalette } from '@renderer/features/search/SearchPalette'
import { useI18n } from '@renderer/i18n'
import { useShortcuts } from './useShortcuts'
import './shell.css'

/**
 * Nomenclature (§38, §44) : un projet est une MISSION, une tâche une OPÉRATION.
 * Les libellés de navigation restent en anglais majuscules — la signalétique de
 * salle de contrôle — tandis que les actions restent traduites.
 */
const NAV = [
  { to: '/', label: 'Dashboard', key: 'd', end: true },
  { to: '/operations', label: 'Operations', key: 'o', end: false },
  { to: '/board', label: 'Board', key: 'b', end: false },
  { to: '/calendar', label: 'Calendar', key: 'c', end: false },
  { to: '/missions', label: 'Missions', key: 'm', end: false },
  { to: '/objectives', label: 'Objectives', key: 'g', end: false },
  { to: '/telemetry', label: 'Telemetry', key: 's', end: false },
  { to: '/tags', label: 'Tags', key: 't', end: false }
] as const

export function Shell(): JSX.Element {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [composing, setComposing] = useState(false)
  const [searching, setSearching] = useState(false)

  // Les raccourcis sont coupés quand un panneau est ouvert : sinon « o »
  // navigerait pendant qu'on rédige, sous le formulaire.
  const overlayOpen = composing || searching

  const shortcuts = [
    ...NAV.map((item) => ({ key: item.key, action: () => navigate(item.to) })),
    { key: 'n', action: () => setComposing(true) },
    { key: '/', action: () => setSearching(true) }
  ]

  useShortcuts(shortcuts, !overlayOpen)

  const closeComposer = useCallback(() => setComposing(false), [])
  const closeSearch = useCallback(() => setSearching(false), [])

  return (
    <div className="shell">
      {/* Premier element focalisable : permet de sauter la navigation. */}
      <a className="shell__skip" href="#mc-content">
        {t('nav.skip')}
      </a>

      <nav className="shell__nav" aria-label={t('nav.label')}>
        <div className="shell__brand">
          <span className="shell__brand-mark" aria-hidden="true" />
          <span className="shell__brand-text">{t('app.name')}</span>
        </div>

        <ul className="shell__nav-list">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `shell__nav-item${isActive ? ' shell__nav-item--active' : ''}`
                }
              >
                <span>{item.label}</span>
                {/* La touche est affichée à côté du libellé : un raccourci qu'on
                    ne voit nulle part n'est pas un raccourci, c'est un secret. */}
                <kbd className="shell__key">{item.key.toUpperCase()}</kbd>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="shell__nav-footer">
          <button type="button" className="shell__search" onClick={() => setSearching(true)}>
            <span>{t('search.open')}</span>
            <kbd className="shell__key">/</kbd>
          </button>
        </div>
      </nav>

      <div className="shell__main">
        <header className="shell__header">
          <Button onClick={() => setComposing(true)}>
            {t('task.new')}
            <kbd className="shell__key shell__key--on-accent">N</kbd>
          </Button>
          <ProfileMenu />
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
