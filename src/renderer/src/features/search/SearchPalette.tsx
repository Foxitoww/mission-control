import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '@renderer/features/missions/queries'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { useI18n } from '@renderer/i18n'
import { missionCode } from '@renderer/lib/format'
import './search.css'

/**
 * Recherche globale (§11), ouverte par « / ».
 *
 * La requête est débattue de 180 ms : la base est locale et répond en une
 * milliseconde, mais relancer une requête à chaque frappe ferait clignoter la
 * liste et rendrait la lecture pénible pendant la saisie.
 */
function useDebounced(value: string, delay = 180): string {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

export function SearchPalette({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [openTask, setOpenTask] = useState<string | null>(null)
  const debounced = useDebounced(query)
  const { data, isFetching } = useSearch(debounced)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const empty =
    debounced.trim() !== '' &&
    !isFetching &&
    data !== undefined &&
    data.tasks.length === 0 &&
    data.projects.length === 0 &&
    data.tags.length === 0

  if (openTask) {
    return (
      <TaskEditor
        taskId={openTask}
        onClose={() => {
          setOpenTask(null)
          onClose()
        }}
      />
    )
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('search.open')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          className="palette__input"
          value={query}
          autoFocus
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          onChange={(event) => setQuery(event.target.value)}
        />

        <div className="palette__results">
          {debounced.trim() === '' && (
            <p className="palette__hint">{t('search.hint')}</p>
          )}

          {empty && <p className="palette__hint">{t('search.noResult')}</p>}

          {data && data.tasks.length > 0 && (
            <section>
              <span className="mc-label palette__group">Operations</span>
              {data.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="palette__item"
                  onClick={() => setOpenTask(task.id)}
                >
                  <span className="palette__item-title">{task.title}</span>
                  <span className="mc-data palette__item-meta">{missionCode(task.id)}</span>
                </button>
              ))}
            </section>
          )}

          {data && data.projects.length > 0 && (
            <section>
              <span className="mc-label palette__group">Missions</span>
              {data.projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="palette__item"
                  onClick={() => {
                    navigate(`/app/${project.id}`)
                    onClose()
                  }}
                >
                  <span
                    className="task-row__dot"
                    style={{ background: project.color }}
                    aria-hidden="true"
                  />
                  <span className="palette__item-title">{project.name}</span>
                </button>
              ))}
            </section>
          )}

          {data && data.tags.length > 0 && (
            <section>
              <span className="mc-label palette__group">Tags</span>
              {data.tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="palette__item"
                  onClick={() => {
                    navigate('/tags')
                    onClose()
                  }}
                >
                  <span
                    className="task-row__dot"
                    style={{ background: tag.color }}
                    aria-hidden="true"
                  />
                  <span className="palette__item-title">{tag.name}</span>
                </button>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
