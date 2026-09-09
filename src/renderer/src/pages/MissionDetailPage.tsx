import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import type { TaskFilter } from '@shared/schemas/task.schema'
import { TaskList } from '@renderer/features/missions/TaskRow'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { Button } from '@renderer/components/Button'
import {
  useProjects,
  useTasks,
  useDeleteProject,
  useUpdateProject
} from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { formatPercent, formatDue } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'

export function MissionDetailPage(): JSX.Element {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t, language } = useI18n()

  const { data: projects = [], isPending } = useProjects()
  const project = projects.find((item) => item.id === id)

  const filter = useMemo<Partial<TaskFilter>>(() => ({ projectId: id }), [id])
  const { data: tasks = [] } = useTasks(filter)

  const updateProject = useUpdateProject()
  const deleteProject = useDeleteProject()
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (isPending) return <div className="skeleton" style={{ height: 200 }} />

  if (!project) {
    return (
      <div className="state">
        <span className="state__title">{t('error.NOT_FOUND')}</span>
        <button type="button" className="auth__link" onClick={() => navigate('/missions')}>
          {t('nav.missions')}
        </button>
      </div>
    )
  }

  const due = formatDue(project.deadline, language)

  async function remove(): Promise<void> {
    await deleteProject.mutateAsync({ id })
    navigate('/missions')
  }

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Mission</span>
          <h1 className="page__title">
            {project.icon ? `${project.icon} ` : ''}
            {project.name}
          </h1>
          {project.description && <p className="mission-card__desc">{project.description}</p>}
        </div>
        <Button onClick={() => setComposing(true)}>{t('task.new')}</Button>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="mc-label">Status</span>
          <span className="stat__value" style={{ fontSize: '0.9rem' }}>
            {t(`projectStatus.${project.status}`)}
          </span>
        </div>
        <div className="stat">
          <span className="mc-label">Operations</span>
          <span className="stat__value">
            {project.taskCompleted}/{project.taskTotal}
          </span>
        </div>
        <div className="stat">
          <span className="mc-label">Mission progress</span>
          <span className="stat__value">{formatPercent(project.progress)}</span>
        </div>
        {due && (
          <div className="stat">
            <span className="mc-label">Deadline</span>
            <span
              className={`stat__value${due.tone === 'overdue' ? ' stat__value--alert' : ''}`}
              title={due.absolute}
            >
              {due.countdown}
            </span>
          </div>
        )}
      </div>

      <div className="progress">
        <div
          className="progress__bar"
          style={{ width: `${project.progress * 100}%`, background: project.color }}
        />
      </div>

      <section className="panel">
        <header className="panel__head">
          <span className="mc-label">Operations</span>
          <span className="mc-data panel__count">{String(tasks.length).padStart(2, '0')}</span>
        </header>

        {tasks.length === 0 ? (
          <div className="state">
            <span className="state__title">{t('task.emptyTitle')}</span>
            <span>{t('task.emptyHint')}</span>
          </div>
        ) : (
          <TaskList tasks={tasks} onOpen={setOpenTask} />
        )}
      </section>

      <section className="panel">
        <header className="panel__head">
          <span className="mc-label">Mission control</span>
        </header>

        <div className="filters__row">
          {project.status !== 'COMPLETED' && (
            <Button
              variant="secondary"
              onClick={() => updateProject.mutate({ id, status: 'COMPLETED' })}
            >
              {t('project.markComplete')}
            </Button>
          )}
          {project.status !== 'ARCHIVED' && (
            <Button
              variant="secondary"
              onClick={() => updateProject.mutate({ id, status: 'ARCHIVED' })}
            >
              {t('project.archive')}
            </Button>
          )}

          {/* La suppression demande confirmation en place plutôt que par une
              boîte système : elle explique aussi ce qui arrive aux tâches. */}
          {confirming ? (
            <>
              <span className="mc-field__hint">{t('project.deleteWarning')}</span>
              <Button variant="danger" onClick={() => void remove()}>
                {t('common.confirm')}
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              {t('project.delete')}
            </Button>
          )}
        </div>
      </section>

      {composing && <TaskEditor defaultProjectId={id} onClose={() => setComposing(false)} />}
      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
