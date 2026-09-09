import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n'
import { AuthProvider } from './features/auth/AuthProvider'
import { SettingsProvider } from './features/settings/SettingsProvider'
import './styles/global.css'
import './components/components.css'
import './styles/shell.css'

const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable')

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>
)
