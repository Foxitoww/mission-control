import { useMemo, useState } from 'react'
import { TASK_STATUSES, TASK_PRIORITIES } from '@shared/types/domain'
import type { TaskStatus, TaskPriority } from '@shared/types/domain'
import type { TaskFilter } from '@shared/schemas/task.schema'
import { TaskList } from '@renderer/features/missions/TaskRow'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { Button } from '@renderer/components/Button'
import { QueryState } from '@renderer/components/QueryState'
import { useTasks, useTags, useProjects } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import '@renderer/features/missions/missions.css'
import './filters.css'

const EMPTY: Partial<TaskFilter> = {}

export function OperationsPage(): JSX.Element {
  const { t } = useI18n()
  const { data: tags = [] } = useTags()
  const { data: projects = [] } = useProjects()

  const [search, setSearch] = useState('')
  const [statuses, setStatuses] = useState<TaskStatus[]>([])
  const [priorities, setPriorities] = useState<TaskPriority[]>([])
  const [projectId, setProjectId] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [overdue, setOverdue] = useState(false)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  /**
   * Le filtre sert de CLÉ de cache. Sans mémorisation, chaque rendu produirait
   * un objet neuf, donc une clé neuve, donc une requête neuve — une boucle de
   * requêtes qui ne s'arrêterait jamais.
   */
  const filter = useMemo<Partial<TaskFilter>>(
    () => ({
      search,
      statuses,
      priorities,
      projectId: projectId === '' ? null : projectId,
      tagIds,
      overdue,
      includeArchived
    }),
    [search, statuses, priorities, projectId, tagIds, overdue, includeArchived]
  )

  const { data: tasks = [], isPending, isError, refetch } = useTasks(filter)

  const active =
    search !== '' ||
    statuses.length > 0 ||
    priorities.length > 0 ||
    projectId !== '' ||
    tagIds.length > 0 ||
    overdue ||
    includeArchived

  function reset(): void {
    setSearch('')
    setStatuses([])
    setPriorities([])
    setProjectId('')
    setTagIds([])
    setOverdue(false)
    setIncludeArchived(false)
  }

  function toggle<T>(list: T[], value: T, set: (next: T[]) => void): void {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value])
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Operations</span>
          <h1 className="page__title">{t('nav.operations')}</h1>
        </div>
        <Button onClick={() => setComposing(true)}>{t('task.new')}</Button>
      </header>

      <div className="filters">
        <input
          className="mc-field__input filters__search"
          value={search}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="filters__row">
          <div className="filters__group" role="group" aria-label={t('task.status')}>
            {TASK_STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                className="chip"
                aria-pressed={statuses.includes(value)}
                onClick={() => toggle(statuses, value, setStatuses)}
              >
                {t(`status.${value}`)}
              </button>
            ))}
          </div>

          <div className="filters__group" role="group" aria-label={t('task.priority')}>
            {TASK_PRIORITIES.map((value) => (
              <button
                key={value}
                type="button"
                className={`chip chip--${value.toLowerCase()}`}
                aria-pressed={priorities.includes(value)}
                onClick={() => toggle(priorities, value, setPriorities)}
              >
                {t(`priority.${value}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="filters__row">
          <select
            className="editor__select"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">{t('filters.allProjects')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {tags.length > 0 && (
            <div className="filters__group" role="group" aria-label={t('task.tags')}>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="chip"
                  aria-pressed={tagIds.includes(tag.id)}
                  style={
                    tagIds.includes(tag.id)
                      ? { borderColor: tag.color, background: `${tag.color}22` }
                      : undefined
                  }
                  onClick={() => toggle(tagIds, tag.id, setTagIds)}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="chip"
            aria-pressed={overdue}
            onClick={() => setOverdue((value) => !value)}
          >
            {t('filters.overdue')}
          </button>

          <button
            type="button"
            className="chip"
            aria-pressed={includeArchived}
            onClick={() => setIncludeArchived((value) => !value)}
          >
            {t('filters.archived')}
          </button>

          {active && (
            <button type="button" className="filters__reset" onClick={reset}>
              {t('filters.reset')}
            </button>
          )}
        </div>
      </div>

      <QueryState
        isPending={isPending}
        isError={isError}
        isEmpty={tasks.length === 0}
        retry={() => void refetch()}
        emptyTitle={active ? t('filters.noMatch') : t('task.emptyTitle')}
        emptyHint={active ? t('filters.noMatchHint') : t('task.emptyHint')}
      >
        <span className="mc-data panel__count">
          {String(tasks.length).padStart(2, '0')} {t('task.results')}
        </span>
        <TaskList tasks={tasks} onOpen={setOpenTask} showCode />
      </QueryState>

      {composing && <TaskEditor onClose={() => setComposing(false)} />}
      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}

export { EMPTY }
