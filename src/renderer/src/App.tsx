import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Shell } from './app/Shell'
import { LibraryPage } from './pages/LibraryPage'
import { AppPage } from './pages/AppPage'
import { OperationsPage } from './pages/OperationsPage'
import { TagsPage } from './pages/TagsPage'
import { KanbanPage } from './pages/KanbanPage'
import { CalendarPage } from './pages/CalendarPage'
import { TimelinePage } from './pages/TimelinePage'
import { GoalsPage } from './pages/GoalsPage'
import { StatsPage } from './pages/StatsPage'
import { AuthScreen } from './features/auth/AuthScreen'
import { RecoveryPhraseScreen } from './features/auth/RecoveryPhraseScreen'
import { useAuth } from './features/auth/AuthProvider'
import { useI18n } from './i18n'

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
  // Le compte est créé, mais on ne laisse pas entrer avant que la phrase de
  // récupération ait été vue et acquittée : elle ne sera plus jamais lisible.
  if (status === 'recovery-pending') return <RecoveryPhraseScreen />

  return (
    // HashRouter et non BrowserRouter : l'application empaquetée est servie
    // depuis file://, où un chemin comme /app/x ne correspond à aucun fichier.
    // Le fragment reste côté client et fonctionne partout.
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          {/* L'accueil est la bibliothèque d'apps ; une app s'ouvre sur /app/:id. */}
          <Route index element={<LibraryPage />} />
          <Route path="app/:id" element={<AppPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="board" element={<KanbanPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="objectives" element={<GoalsPage />} />
          <Route path="telemetry" element={<StatsPage />} />
          <Route path="tags" element={<TagsPage />} />
          {/* Anciens liens (/missions/:id, /dashboard) : on renvoie à l'accueil. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
