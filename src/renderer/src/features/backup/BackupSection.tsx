import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ImportMode } from '@shared/schemas/backup.schema'
import { Button } from '@renderer/components/Button'
import { useToast } from '@renderer/components/Toast'
import { useI18n } from '@renderer/i18n'
import { unwrap, IpcError } from '@renderer/lib/ipc'
import './backup.css'

/**
 * Sauvegarde et restauration (§18).
 *
 * Le fichier produit est en CLAIR — c'est le seul artefact non protégé du
 * produit, et l'avertissement ci-dessous est donc affiché en permanence, pas
 * seulement au moment du clic. Le compromis est assumé : une sauvegarde qu'on ne
 * peut ouvrir qu'avec le mot de passe perdu ne sauvegarde rien (ADR-007).
 */
export function BackupSection(): JSX.Element {
  const { t, tError } = useI18n()
  const toast = useToast()
  const client = useQueryClient()

  const [mode, setMode] = useState<ImportMode>('merge')
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)

  async function runExport(): Promise<void> {
    setBusy('export')
    try {
      const report = await unwrap(window.mc.backup.export())
      // `null` = boîte de dialogue annulée. Annuler n'est pas un échec : on ne
      // dit rien plutôt que d'afficher une confirmation trompeuse.
      if (report) toast.success(`${t('backup.exported')} ${report.tasks}`)
    } catch (error) {
      toast.error(tError(error instanceof IpcError ? error.key : 'UNKNOWN'))
    } finally {
      setBusy(null)
    }
  }

  async function runImport(): Promise<void> {
    setBusy('import')
    try {
      const report = await unwrap(window.mc.backup.import({ mode }))
      if (report) {
        // Tout le cache est invalidé : après une restauration, aucune vue
        // affichée n'est encore exacte.
        void client.invalidateQueries()
        const total = report.projects + report.tasks + report.goals + report.tags
        toast.success(`${t('backup.imported')} ${total} · ${t('backup.skipped')} ${report.skipped}`)
      }
    } catch (error) {
      toast.error(tError(error instanceof IpcError ? error.key : 'UNKNOWN'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="profile-section">
      <span className="mc-label">{t('backup.section')}</span>

      <div className="mc-alert backup__warning" role="note">
        <span>{t('backup.warning')}</span>
      </div>

      <div className="backup__row">
        <Button
          type="button"
          variant="secondary"
          loading={busy === 'export'}
          disabled={busy !== null}
          onClick={() => void runExport()}
        >
          {t('backup.export')}
        </Button>
        <span className="mc-field__hint">{t('backup.exportHint')}</span>
      </div>

      <div className="backup__row">
        <div className="mc-segments" role="group" aria-label={t('backup.mode')}>
          <button
            type="button"
            className="mc-segment"
            aria-pressed={mode === 'merge'}
            disabled={busy !== null}
            onClick={() => setMode('merge')}
          >
            {t('backup.merge')}
          </button>
          <button
            type="button"
            className="mc-segment"
            aria-pressed={mode === 'replace'}
            disabled={busy !== null}
            onClick={() => setMode('replace')}
          >
            {t('backup.replace')}
          </button>
        </div>

        <Button
          type="button"
          variant={mode === 'replace' ? 'danger' : 'secondary'}
          loading={busy === 'import'}
          disabled={busy !== null}
          onClick={() => void runImport()}
        >
          {t('backup.import')}
        </Button>
      </div>

      {/* Le mode destructif s'annonce AVANT le clic, pas dans une confirmation
          après coup : c'est le moment où l'utilisateur peut encore changer d'avis. */}
      <span className="mc-field__hint">
        {mode === 'merge' ? t('backup.mergeHint') : t('backup.replaceHint')}
      </span>
    </section>
  )
}
