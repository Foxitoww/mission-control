import { useState, type FormEvent } from 'react'
import { ACCENT_COLORS } from '@shared/types/domain'
import { Button } from '@renderer/components/Button'
import { useTags, useCreateTag, useDeleteTag } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { IpcError } from '@renderer/lib/ipc'
import '@renderer/features/missions/missions.css'
import './filters.css'

export function TagsPage(): JSX.Element {
  const { t, tError } = useI18n()
  const { data: tags = [], isPending } = useTags()
  const createTag = useCreateTag()
  const deleteTag = useDeleteTag()

  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(ACCENT_COLORS[1])
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    if (name.trim() === '') return

    try {
      await createTag.mutateAsync({ name, color: color as (typeof ACCENT_COLORS)[number] })
      setName('')
    } catch (caught) {
      setError(tError(caught instanceof IpcError ? caught.key : 'UNKNOWN'))
    }
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Classification</span>
          <h1 className="page__title">{t('nav.tags')}</h1>
        </div>
      </header>

      <form className="filters" onSubmit={submit} noValidate>
        {error && (
          <div className="mc-alert" role="alert">
            <span>{error}</span>
          </div>
        )}

        <div className="filters__row">
          <input
            className="mc-field__input filters__search"
            value={name}
            maxLength={32}
            placeholder={t('tag.newPlaceholder')}
            onChange={(event) => setName(event.target.value)}
          />

          <div className="mc-swatches" role="group" aria-label={t('profile.accent')}>
            {ACCENT_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className="mc-swatch"
                style={{ background: value }}
                aria-pressed={color === value}
                aria-label={value}
                onClick={() => setColor(value)}
              />
            ))}
          </div>

          <Button type="submit" loading={createTag.isPending}>
            {t('tag.add')}
          </Button>
        </div>
      </form>

      {isPending ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : tags.length === 0 ? (
        <div className="state">
          <span className="state__title">{t('tag.emptyTitle')}</span>
          <span>{t('tag.emptyHint')}</span>
        </div>
      ) : (
        <ul className="task-list">
          {tags.map((tag) => (
            <li key={tag.id} className="task-row">
              <span className="task-row__body" style={{ cursor: 'default' }}>
                <span className="task-row__main">
                  <span
                    className="task-row__dot"
                    style={{ background: tag.color }}
                    aria-hidden="true"
                  />
                  <span className="task-row__title">{tag.name}</span>
                </span>

                <span className="task-row__meta">
                  {/* Le nombre d'usages rend le nettoyage possible : sans lui,
                      impossible de distinguer un tag vivant d'un oubli. */}
                  <span className="mc-data">
                    {String(tag.taskCount).padStart(2, '0')} {t('tag.uses')}
                  </span>
                  <button
                    type="button"
                    className="subtask__remove"
                    aria-label={`${t('common.delete')} ${tag.name}`}
                    onClick={() => deleteTag.mutate({ id: tag.id })}
                  >
                    ×
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
