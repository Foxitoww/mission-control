import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import type { Settings, Theme } from '@shared/types/domain'
import { unwrap } from '@renderer/lib/ipc'
import { useI18n } from '@renderer/i18n'
import { useAuth } from '@renderer/features/auth/AuthProvider'

interface SettingsValue {
  settings: Settings | null
  update: (patch: Partial<Settings>) => Promise<void>
}

const SettingsContext = createContext<SettingsValue | null>(null)

/**
 * Applique le thème sur `<html>`.
 *
 * `system` n'écrit pas d'attribut figé : il s'abonne à `prefers-color-scheme`,
 * pour que basculer l'OS en mode sombre à 19 h suive l'application sans qu'on
 * ait à rouvrir quoi que ce soit.
 */
function useApplyTheme(theme: Theme | undefined): void {
  useEffect(() => {
    if (!theme) return
    const root = document.documentElement

    if (theme !== 'system') {
      root.dataset['theme'] = theme
      return
    }

    const query = window.matchMedia('(prefers-color-scheme: light)')
    const sync = (): void => {
      root.dataset['theme'] = query.matches ? 'light' : 'dark'
    }

    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [theme])
}

/**
 * Applique l'accent du profil connecté.
 *
 * Une seule propriété CSS pilote toute l'identité colorée de l'interface : les
 * composants ne référencent que `--mc-accent` et ignorent jusqu'à l'existence
 * d'un profil. Hors session, on retire la surcharge pour revenir au bleu de la
 * charte sur l'écran d'accès.
 */
function useApplyAccent(accentColor: string | undefined): void {
  useEffect(() => {
    const root = document.documentElement
    if (accentColor) root.style.setProperty('--mc-accent', accentColor)
    else root.style.removeProperty('--mc-accent')
  }, [accentColor])
}

export function SettingsProvider({ children }: { children: ReactNode }): JSX.Element {
  const { status, user } = useAuth()
  const { setLanguage } = useI18n()
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    if (status !== 'signed-in') {
      // Purge à la déconnexion : aucune préférence du compte précédent ne doit
      // rester en mémoire quand l'écran d'accès réapparaît.
      setSettings(null)
      return
    }

    void (async () => {
      try {
        setSettings(await unwrap(window.mc.settings.get()))
      } catch {
        setSettings(null)
      }
    })()
  }, [status])

  // La langue est une préférence stockée, mais le dictionnaire vit au-dessus de
  // l'authentification : c'est ici que les deux se rejoignent.
  useEffect(() => {
    if (settings) setLanguage(settings.language)
  }, [settings, setLanguage])

  useApplyTheme(settings?.theme)
  useApplyAccent(user?.accentColor)

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await unwrap(window.mc.settings.update(patch)))
  }, [])

  const value = useMemo<SettingsValue>(() => ({ settings, update }), [settings, update])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>')
  return context
}
