import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { TaskFilter } from '@shared/schemas/task.schema'
import { TaskList } from '@renderer/features/missions/TaskRow'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { QueryState } from '@renderer/components/QueryState'
import {
  useProjects,
  useTasks,
  useDeleteProject,
  useUpdateProject
} from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { useToast } from '@renderer/components/Toast'
import { formatPercent, formatDue } from '@renderer/lib/format'
import './app-detail.css'

type Tab = 'list' | 'board' | 'calendar'

/**
 * APP OUVERTE — la vue de détail d'une app.
 *
 * Ici, et seulement ici, apparaissent la todo, la progression, l'échéance.
 * Tableau et Calendrier sont des ONGLETS de cette vue, pas des pages séparées :
 * ils ne montrent que les tâches de cette app.
 */
export function AppPage(): JSX.Element {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, language } = useI18n()
  const toast = useToast()

  const { data: projects = [], isPending, isError, refetch } = useProjects()
  const project = projects.find((item) => item.id === id)

  const filter = useMemo<Partial<TaskFilter>>(() => ({ projectId: id }), [id])
  const { data: tasks = [] } = useTasks(filter)

  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const [tab, setTab] = useState<Tab>('list')
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (isPending || isError) {
    return (
      <div className="app-detail">
        <QueryState
          isPending={isPending}
          isError={isError}
          retry={() => void refetch()}
          skeletonHeight={220}
        >
          <span />
        </QueryState>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="state">
        <span className="state__title">{t('error.NOT_FOUND')}</span>
        <button type="button" className="auth__link" onClick={() => navigate('/')}>
          {t('library.backAll')}
        </button>
      </div>
    )
  }

  const due = formatDue(project.deadline, language)

  async function remove(): Promise<void> {
    try {
      await deleteProject.mutateAsync({ id })
      toast.success(t('toast.projectDeleted'))
      navigate('/')
    } catch {
      toast.error(t('toast.failed'))
    }
  }

  return (
    <div className="app-detail" style={{ ['--detail-accent' as string]: project.color }}>
      <button type="button" className="app-detail__back" onClick={() => navigate('/')}>
        ‹ {t('library.backAll')}
      </button>

      <header className="app-detail__head">
        <span className="app-detail__icon" aria-hidden="true">
          {project.icon ?? project.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="app-detail__id">
          <h1 className="app-detail__title">{project.name}</h1>
          {project.description && <p className="app-detail__desc">{project.description}</p>}
        </div>
        <div className="app-detail__actions">
          {project.status !== 'COMPLETED' && (
            <button
              type="button"
              className="mc-btn mc-btn--secondary"
              onClick={() => updateProject.mutate({ id, status: 'COMPLETED' })}
            >
              {t('project.markComplete')}
            </button>
          )}
          {project.status !== 'ARCHIVED' && (
            <button
              type="button"
              className="mc-btn mc-btn--secondary"
              onClick={() => updateProject.mutate({ id, status: 'ARCHIVED' })}
            >
              {t('project.archive')}
            </button>
          )}
          {confirming ? (
            <>
              <button type="button" className="mc-btn mc-btn--danger" onClick={() => void remove()}>
                {t('common.confirm')}
              </button>
              <button
                type="button"
                className="mc-btn mc-btn--ghost"
                onClick={() => setConfirming(false)}
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="mc-btn mc-btn--ghost"
              onClick={() => setConfirming(true)}
            >
              {t('project.delete')}
            </button>
          )}
        </div>
      </header>

      <div className="app-chips">
        <div className="app-chip">
          <span className="mc-label">{t('app.tasks')}</span>
          <span className="app-chip__val">
            {project.taskCompleted} / {project.taskTotal}
          </span>
        </div>
        <div className="app-chip">
          <span className="mc-label">{t('app.progress')}</span>
          <span className="app-chip__val app-chip__val--good">
            {formatPercent(project.progress)}
          </span>
        </div>
        {due && (
          <div className="app-chip">
            <span className="mc-label">{t('project.deadline')}</span>
            <span
              className={`app-chip__val${due.tone === 'overdue' ? ' app-chip__val--alert' : ''}`}
              title={due.absolute}
            >
              {due.countdown}
            </span>
          </div>
        )}
        <div className="app-chip">
          <span className="mc-label">{t('task.status')}</span>
          <span className="app-chip__val app-chip__val--text">
            {t(`projectStatus.${project.status}`)}
          </span>
        </div>
      </div>

      <div className="app-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'list'}
          className={`app-tab${tab === 'list' ? ' app-tab--on' : ''}`}
          onClick={() => setTab('list')}
        >
          {t('app.tabList')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'board'}
          className={`app-tab${tab === 'board' ? ' app-tab--on' : ''}`}
          onClick={() => setTab('board')}
        >
          {t('app.tabBoard')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'calendar'}
          className={`app-tab${tab === 'calendar' ? ' app-tab--on' : ''}`}
          onClick={() => setTab('calendar')}
        >
          {t('app.tabCalendar')}
        </button>

        <button type="button" className="app-tabs__new" onClick={() => setComposing(true)}>
          + {t('task.new')}
        </button>
      </div>

      {tab === 'list' &&
        (tasks.length === 0 ? (
          <div className="state">
            <span className="state__title">{t('task.emptyTitle')}</span>
            <span>{t('task.emptyHint')}</span>
          </div>
        ) : (
          <TaskList tasks={tasks} onOpen={setOpenTask} />
        ))}

      {tab === 'board' && (
        <p className="app-tab__soon">
          {t('app.tabSoon')} <Link to="/board">{t('nav.board')}</Link>
        </p>
      )}

      {tab === 'calendar' && (
        <p className="app-tab__soon">
          {t('app.tabSoon')} <Link to="/calendar">{t('nav.calendar')}</Link>
        </p>
      )}

      {composing && <TaskEditor defaultProjectId={id} onClose={() => setComposing(false)} />}
      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
