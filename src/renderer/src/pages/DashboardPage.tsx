import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TaskListItem } from '@shared/types/views'
import { TaskList } from '@renderer/features/missions/TaskRow'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { useDashboard } from '@renderer/features/missions/queries'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { useI18n } from '@renderer/i18n'
import { formatPercent } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'

function Section({
  label,
  tasks,
  onOpen,
  tone
}: {
  label: string
  tasks: TaskListItem[]
  onOpen: (id: string) => void
  tone?: 'alert'
}): JSX.Element | null {
  // Une section vide n'est pas affichée : un tableau de bord constellé de
  // « aucune tâche » ne dit rien. L'absence de bloc « retards » EST le message.
  if (tasks.length === 0) return null

  return (
    <section className="panel">
      <header className="panel__head">
        <span className="mc-label" style={tone === 'alert' ? { color: 'var(--mc-red)' } : undefined}>
          {label}
        </span>
        <span className="mc-data panel__count">{String(tasks.length).padStart(2, '0')}</span>
      </header>
      <TaskList tasks={tasks} onOpen={onOpen} />
    </section>
  )
}

export function DashboardPage(): JSX.Element {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, isPending, isError, refetch } = useDashboard()
  const [openTask, setOpenTask] = useState<string | null>(null)

  if (isPending) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="state state--error">
        <span className="state__title">{t('error.UNKNOWN')}</span>
        <button type="button" className="auth__link" onClick={() => void refetch()}>
          {t('common.retry')}
        </button>
      </div>
    )
  }

  const { stats } = data
  const nothingAtAll = stats.total === 0

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Mission control</span>
          <h1 className="page__title">
            {t('dashboard.greeting')} {user?.displayName}
          </h1>
        </div>
      </header>

      <div className="stats">
        <div className="stat">
          <span className="mc-label">Active missions</span>
          <span className="stat__value">{String(stats.active).padStart(2, '0')}</span>
        </div>
        <div className="stat">
          <span className="mc-label">Completed</span>
          <span className="stat__value stat__value--nominal">
            {String(stats.completed).padStart(2, '0')}
          </span>
        </div>
        <div className="stat">
          <span className="mc-label">Overdue</span>
          <span className={`stat__value${stats.overdue > 0 ? ' stat__value--alert' : ''}`}>
            {String(stats.overdue).padStart(2, '0')}
          </span>
        </div>
        <div className="stat">
          <span className="mc-label">Mission progress</span>
          <span className="stat__value">{formatPercent(stats.completionRate)}</span>
        </div>
      </div>

      {nothingAtAll ? (
        <div className="state">
          <span className="state__title">{t('dashboard.emptyTitle')}</span>
          <span>{t('dashboard.emptyHint')}</span>
        </div>
      ) : (
        <>
          <Section
            label="Overdue"
            tone="alert"
            tasks={data.overdue}
            onOpen={setOpenTask}
          />
          <Section label="Current objective" tasks={data.today} onOpen={setOpenTask} />
          <Section label="Mission priority" tasks={data.priority} onOpen={setOpenTask} />
          <Section label="Next deadline" tasks={data.upcoming} onOpen={setOpenTask} />

          {data.activeProjects.length > 0 && (
            <section className="panel">
              <header className="panel__head">
                <span className="mc-label">Active missions</span>
                <span className="mc-data panel__count">
                  {String(data.activeProjects.length).padStart(2, '0')}
                </span>
              </header>

              <div className="mission-grid">
                {data.activeProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="mission-card"
                    style={{ borderTopColor: project.color }}
                    onClick={() => navigate(`/missions/${project.id}`)}
                  >
                    <span className="mission-card__name">
                      {project.icon ? `${project.icon} ` : ''}
                      {project.name}
                    </span>
                    <div className="progress">
                      <div
                        className="progress__bar"
                        style={{ width: `${project.progress * 100}%`, background: project.color }}
                      />
                    </div>
                    <span className="mission-card__foot">
                      <span className="mc-data">
                        {project.taskCompleted}/{project.taskTotal}
                      </span>
                      <span className="mc-data">{formatPercent(project.progress)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <Section label="Recent activity" tasks={data.recent} onOpen={setOpenTask} />
        </>
      )}

      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
