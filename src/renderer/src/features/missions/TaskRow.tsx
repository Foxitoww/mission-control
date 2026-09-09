import type { TaskListItem } from '@shared/types/views'
import { useI18n } from '@renderer/i18n'
import { formatDue, formatDuration, missionCode } from '@renderer/lib/format'
import { useToggleTask } from './queries'
import './missions.css'

interface TaskRowProps {
  task: TaskListItem
  onOpen: (id: string) => void
  /** Le code d'opération n'a d'intérêt que sur les vues denses. */
  showCode?: boolean
}

export function TaskRow({ task, onOpen, showCode = false }: TaskRowProps): JSX.Element {
  const { t, language } = useI18n()
  const toggle = useToggleTask()

  const due = formatDue(task.dueDate, language)
  const duration = formatDuration(task.estimatedMinutes)
  const done = task.status === 'COMPLETED'

  return (
    <li className={`task-row${done ? ' task-row--done' : ''}`}>
      {/* La case précède le titre et vit HORS du bouton d'ouverture : terminer
          une tâche est l'action la plus fréquente, elle ne doit jamais exiger
          d'ouvrir un panneau d'abord (§36). */}
      <input
        type="checkbox"
        className="task-row__check"
        checked={done}
        aria-label={t(done ? 'task.reopen' : 'task.complete')}
        onChange={() => toggle.mutate({ id: task.id })}
      />

      <button type="button" className="task-row__body" onClick={() => onOpen(task.id)}>
        <span className="task-row__main">
          <span
            className={`task-row__priority task-row__priority--${task.priority.toLowerCase()}`}
            // La priorité est une barre colorée ET un libellé lisible par un
            // lecteur d'écran : la couleur ne porte jamais seule l'information.
            aria-label={t(`priority.${task.priority}`)}
          />
          <span className="task-row__title">{task.title}</span>
        </span>

        <span className="task-row__meta">
          {showCode && <span className="mc-data task-row__code">{missionCode(task.id)}</span>}

          {task.projectName && (
            <span className="task-row__project">
              <span
                className="task-row__dot"
                style={{ background: task.projectColor ?? 'var(--mc-accent)' }}
                aria-hidden="true"
              />
              {task.projectName}
            </span>
          )}

          {task.tags.map((tag) => (
            <span key={tag.id} className="task-row__tag" style={{ borderColor: tag.color }}>
              {tag.name}
            </span>
          ))}

          {task.subtaskTotal > 0 && (
            <span className="mc-data task-row__subtasks">
              {task.subtaskDone}/{task.subtaskTotal}
            </span>
          )}

          {duration && <span className="mc-data task-row__duration">{duration}</span>}

          {due && (
            <span
              className={`mc-data task-row__due task-row__due--${due.tone}`}
              title={due.absolute}
            >
              {due.countdown}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}

export function TaskList({
  tasks,
  onOpen,
  showCode
}: {
  tasks: TaskListItem[]
  onOpen: (id: string) => void
  showCode?: boolean
}): JSX.Element {
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onOpen={onOpen} showCode={showCode} />
      ))}
    </ul>
  )
}
