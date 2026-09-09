import { useCallback, useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types/update'
import { Button } from '@renderer/components/Button'
import { useI18n } from '@renderer/i18n'
import { unwrap } from '@renderer/lib/ipc'
import './update.css'

/** Un état parlant plutôt qu'un écran vide pendant le premier aller-retour IPC. */
const INITIAL: UpdateStatus = { state: 'idle', currentVersion: '…' }

export function UpdateSection(): JSX.Element {
  const { t } = useI18n()
  const [status, setStatus] = useState<UpdateStatus>(INITIAL)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await unwrap(window.mc.update.status()))
      } catch {
        setStatus({ state: 'error', currentVersion: '?' })
      }
    })()

    // Le téléchargement progresse hors de toute requête : on écoute la poussée
    // du main, et on se désabonne au démontage pour ne pas fuir d'écouteur.
    return window.mc.update.onChanged(setStatus)
  }, [])

  const check = useCallback(async () => {
    setChecking(true)
    try {
      setStatus(await unwrap(window.mc.update.check()))
    } catch {
      setStatus((current) => ({ ...current, state: 'error' }))
    } finally {
      setChecking(false)
    }
  }, [])

  const message = (): string => {
    switch (status.state) {
      case 'checking':
        return t('update.checking')
      case 'available':
        return `${t('update.available')} ${status.latestVersion ?? ''}`.trim()
      case 'downloading':
        return `${t('update.downloading')} ${status.percent ?? 0} %`
      case 'ready':
        return `${t('update.ready')} ${status.latestVersion ?? ''}`.trim()
      case 'not-available':
        return t('update.upToDate')
      case 'unsupported':
        return t('update.unsupported')
      case 'error':
        return t('update.error')
      default:
        return t('update.idle')
    }
  }

  return (
    <section className="profile-section">
      <span className="mc-label">{t('update.section')}</span>

      <div className="update-row">
        <div className="update-version">
          <span className="mc-field__label">{t('update.currentVersion')}</span>
          <span className="mc-data update-version__value">{status.currentVersion}</span>
        </div>

        <Button
          type="button"
          variant="secondary"
          loading={checking || status.state === 'checking'}
          disabled={status.state === 'unsupported' || status.state === 'downloading'}
          onClick={() => void check()}
        >
          {t('update.check')}
        </Button>
      </div>

      {/* `aria-live` fait annoncer le changement d'état sans déplacer le focus :
          on n'interrompt pas quelqu'un qui remplit le formulaire au-dessus. */}
      <p className={`update-status update-status--${status.state}`} aria-live="polite">
        {message()}
      </p>

      {status.state === 'downloading' && (
        <div
          className="update-progress"
          role="progressbar"
          aria-valuenow={status.percent ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="update-progress__bar" style={{ width: `${status.percent ?? 0}%` }} />
        </div>
      )}

      {status.state === 'ready' && (
        <Button type="button" onClick={() => void window.mc.update.install()}>
          {t('update.restart')}
        </Button>
      )}
    </section>
  )
}
