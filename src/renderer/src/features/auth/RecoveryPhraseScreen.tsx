import { useState } from 'react'
import { Button } from '@renderer/components/Button'
import { Checkbox } from '@renderer/components/Checkbox'
import { useI18n } from '@renderer/i18n'
import { useAuth } from './AuthProvider'
import './auth.css'

/**
 * Écran de la phrase de récupération, affiché une seule fois.
 *
 * Il barre l'accès à l'application tant que l'utilisateur n'a pas confirmé
 * avoir noté sa phrase. C'est délibérément contraignant : c'est le seul instant
 * de la vie du compte où cette phrase est lisible, et la perdre signifie perdre
 * définitivement les données si le mot de passe est un jour oublié.
 */
export function RecoveryPhraseScreen(): JSX.Element {
  const { t } = useI18n()
  const { pendingRecovery, acknowledgeRecovery } = useAuth()
  const [confirmed, setConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  const phrase = pendingRecovery ?? ''

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(phrase)
      setCopied(true)
    } catch {
      // Le presse-papiers peut être refusé : la phrase reste lisible à l'écran,
      // et l'utilisateur peut la recopier à la main. Aucune raison d'alerter.
      setCopied(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-grid" aria-hidden="true" />
        <div className="auth__brand-content">
          <span className="mc-label">Recovery key</span>
          <h1 className="auth__title">{t('recovery.title')}</h1>
          <p className="auth__tagline">{t('recovery.intro')}</p>
        </div>
      </aside>

      <main className="auth__panel">
        <div className="auth__panel-inner">
          <header className="auth__header">
            <span className="mc-label">Write this down</span>
            <h2 className="auth__heading">{t('recovery.heading')}</h2>
          </header>

          {/* `data-selectable` réautorise la sélection du texte, que la coque
              applicative désactive partout ailleurs. */}
          <p className="recovery__phrase mc-data" data-selectable>
            {phrase}
          </p>

          <div className="mc-alert" role="note">
            <span>{t('recovery.warning')}</span>
          </div>

          <div className="filters__row">
            <Button variant="secondary" onClick={() => void copy()}>
              {copied ? t('recovery.copied') : t('recovery.copy')}
            </Button>
          </div>

          <Checkbox
            label={t('recovery.confirm')}
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />

          <Button block disabled={!confirmed} onClick={acknowledgeRecovery}>
            {t('recovery.continue')}
          </Button>
        </div>
      </main>
    </div>
  )
}
