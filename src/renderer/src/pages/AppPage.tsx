import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { KanbanBoard } from '@renderer/features/missions/KanbanBoard'
import { AppChat } from '@renderer/features/chat/AppChat'
import { QueryState } from '@renderer/components/QueryState'
import {
  useProjects,
  useDeleteProject,
  useUpdateProject
} from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { useToast } from '@renderer/components/Toast'
import { formatPercent, formatDue } from '@renderer/lib/format'
import './app-detail.css'

type Tab = 'board' | 'calendar' | 'chat'

/**
 * APP OUVERTE — la vue de détail d'une app.
 *
 * Ici, et seulement ici, apparaissent la todo, la progression, l'échéance.
 * Le Tableau est la SEULE vue des tâches : pas de liste à côté qui montrerait
 * les mêmes tâches sous une autre forme — une nouvelle tâche devient une
 * carte dans sa colonne, point. Calendrier reste un onglet, pas une page
 * séparée : il ne montre que les tâches de cette app.
 */
export function AppPage(): JSX.Element {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, language } = useI18n()
  const toast = useToast()

  const { data: projects = [], isPending, isError, refetch } = useProjects()
  const project = projects.find((item) => item.id === id)

  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const [tab, setTab] = useState<Tab>('board')
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
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chat'}
          className={`app-tab${tab === 'chat' ? ' app-tab--on' : ''}`}
          onClick={() => setTab('chat')}
        >
          {t('app.tabChat')}
        </button>

        {/* Le chat général n'a rien à voir avec les tâches : l'action rapide
            n'a de sens que sur les deux autres onglets. */}
        {tab !== 'chat' && (
          <button type="button" className="app-tabs__new" onClick={() => setComposing(true)}>
            + {t('task.new')}
          </button>
        )}
      </div>

      {/* `key={id}` : changer d'app tout en restant sur l'onglet Tableau doit
          démonter l'ancien DndContext plutôt que de réutiliser ses capteurs
          sur les tâches d'une autre app. */}
      {tab === 'board' && <KanbanBoard key={id} projectId={id} onOpen={setOpenTask} />}

      {tab === 'calendar' && (
        <p className="app-tab__soon">
          {t('app.tabSoon')} <Link to="/calendar">{t('nav.calendar')}</Link>
        </p>
      )}

      {tab === 'chat' && <AppChat projectId={id} />}

      {composing && <TaskEditor defaultProjectId={id} onClose={() => setComposing(false)} />}
      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
