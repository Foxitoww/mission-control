import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { I18nProvider } from './i18n'
import { AuthProvider } from './features/auth/AuthProvider'
import { SettingsProvider } from './features/settings/SettingsProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

/**
 * Polices EMBARQUÉES, jamais chargées depuis un CDN.
 *
 * Le design system prescrit Inter et JetBrains Mono ; les servir depuis Google
 * Fonts ferait une requête réseau à chaque démarrage — l'application cesserait
 * d'être hors ligne, et l'hôte distant apprendrait quand elle est ouverte.
 * Les variantes variables tiennent en un seul fichier par famille.
 */
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'

import './styles/global.css'
import './components/components.css'

/**
 * Réglages adaptés à une base LOCALE.
 *
 * Les valeurs par défaut de TanStack Query visent un serveur distant : elles
 * refont la requête au retour de focus et réessaient trois fois en cas d'échec.
 * Ici, une requête coûte une milliseconde et un échec est un vrai bug, pas un
 * réseau capricieux — réessayer ne ferait que retarder l'affichage de l'erreur.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 0
    }
  }
})

const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable')

createRoot(container).render(
  <StrictMode>
    {/* La frontière d'erreur enveloppe TOUT, y compris les fournisseurs : une
        exception dans l'un d'eux doit produire un écran, pas une page blanche. */}
    <ErrorBoundary>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <SettingsProvider>
              <QueryClientProvider client={queryClient}>
                <App />
              </QueryClientProvider>
            </SettingsProvider>
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>
)
