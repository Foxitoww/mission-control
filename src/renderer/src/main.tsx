import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { I18nProvider } from './i18n'
import { AuthProvider } from './features/auth/AuthProvider'
import { SettingsProvider } from './features/settings/SettingsProvider'
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
    <I18nProvider>
      <AuthProvider>
        <SettingsProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </SettingsProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>
)
