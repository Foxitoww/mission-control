import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '@shared/types/domain'
import { dictionaries, type MessageKey } from './messages'

interface I18nValue {
  language: Language
  setLanguage: (language: Language) => void
  /** Traduit une clé du dictionnaire. */
  t: (key: MessageKey) => string
  /**
   * Traduit un code d'erreur venu du processus main.
   *
   * Le main ne renvoie jamais de phrase, seulement un code stable
   * (`AUTH_INVALID_CREDENTIALS`, `USERNAME_TOO_SHORT`…). C'est ici, et
   * uniquement ici, qu'un code devient une phrase — dans la langue de
   * l'utilisateur. Un code inconnu retombe sur un message générique plutôt que
   * d'afficher une chaîne technique.
   */
  tError: (code: string) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({
  children,
  initial = 'fr'
}: {
  children: ReactNode
  initial?: Language
}): JSX.Element {
  const [language, setLanguage] = useState<Language>(initial)

  const value = useMemo<I18nValue>(() => {
    const dictionary = dictionaries[language]

    const t = (key: MessageKey): string => dictionary[key]

    const tError = (code: string): string => {
      const key = `error.${code}` as MessageKey
      return key in dictionary ? dictionary[key] : dictionary['error.UNKNOWN']
    }

    return { language, setLanguage, t, tError }
  }, [language])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>')
  return context
}

/** Bascule FR ↔ EN, pratique tant que l'écran de paramètres n'existe pas. */
export function useToggleLanguage(): () => void {
  const { language, setLanguage } = useI18n()
  return useCallback(() => setLanguage(language === 'fr' ? 'en' : 'fr'), [language, setLanguage])
}
