import { useMemo, useState } from 'react'
import type { TaskListItem } from '@shared/types/views'
import type { TaskFilter } from '@shared/schemas/task.schema'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { Button } from '@renderer/components/Button'
import { useTasks } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import '@renderer/features/missions/missions.css'
import './calendar.css'

/** Clé de jour local, `YYYY-MM-DD`. La même que celle des statistiques. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Grille du mois, du LUNDI au dimanche.
 *
 * `getDay()` place dimanche à 0, ce qui produirait une semaine commençant le
 * dimanche — convention américaine, déroutante pour un calendrier français.
 * On décale donc l'index.
 */
function buildMonthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7

  const start = new Date(first)
  start.setDate(start.getDate() - offset)

  // Six semaines fixes : la hauteur de la grille ne bouge pas d'un mois à
  // l'autre, donc rien ne saute sous le curseur en changeant de mois.
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })
}

export function CalendarPage(): JSX.Element {
  const { t, language } = useI18n()
  const [anchor, setAnchor] = useState(() => new Date())
  const [openTask, setOpenTask] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const grid = useMemo(() => buildMonthGrid(anchor), [anchor])

  const range = useMemo<Partial<TaskFilter>>(() => {
    const first = grid[0] as Date
    const last = grid[grid.length - 1] as Date
    const end = new Date(last)
    end.setHours(23, 59, 59, 999)
    return { dueAfter: first.toISOString(), dueBefore: end.toISOString(), includeArchived: false }
  }, [grid])

  const { data: tasks = [] } = useTasks(range)

  const byDay = useMemo(() => {
    const map = new Map<string, TaskListItem[]>()
    for (const task of tasks) {
      if (!task.dueDate) continue
      const key = dayKey(new Date(task.dueDate))
      const list = map.get(key) ?? []
      list.push(task)
      map.set(key, list)
    }
    return map
  }, [tasks])

  const monthLabel = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    month: 'long',
    year: 'numeric'
  }).format(anchor)

  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
      weekday: 'short'
    })
    // 2024-01-01 est un lundi : point de départ commode pour nommer les jours.
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 1 + index))
    )
  }, [language])

  const todayKey = dayKey(new Date())
  const currentMonth = anchor.getMonth()

  function shiftMonth(delta: number): void {
    setAnchor((previous) => new Date(previous.getFullYear(), previous.getMonth() + delta, 1))
  }

  return (
    <div className="page page--wide">
      <header className="page__head">
        <div>
          <span className="mc-label">Flight schedule</span>
          <h1 className="page__title" style={{ textTransform: 'capitalize' }}>
            {monthLabel}
          </h1>
        </div>

        <div className="filters__row">
          <Button variant="secondary" onClick={() => shiftMonth(-1)} aria-label={t('calendar.previous')}>
            ‹
          </Button>
          <Button variant="secondary" onClick={() => setAnchor(new Date())}>
            {t('calendar.today')}
          </Button>
          <Button variant="secondary" onClick={() => shiftMonth(1)} aria-label={t('calendar.next')}>
            ›
          </Button>
          <Button onClick={() => setComposing(true)}>{t('task.new')}</Button>
        </div>
      </header>

      <div className="calendar">
        <div className="calendar__weekdays">
          {weekdayLabels.map((label) => (
            <span key={label} className="mc-label">
              {label}
            </span>
          ))}
        </div>

        <div className="calendar__grid">
          {grid.map((date) => {
            const key = dayKey(date)
            const dayTasks = byDay.get(key) ?? []
            const outside = date.getMonth() !== currentMonth

            return (
              <div
                key={key}
                className={`calendar__day${outside ? ' calendar__day--outside' : ''}${
                  key === todayKey ? ' calendar__day--today' : ''
                }`}
              >
                <span className="mc-data calendar__number">{date.getDate()}</span>

                <ul className="calendar__tasks">
                  {dayTasks.slice(0, 3).map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className={`calendar__task calendar__task--${task.priority.toLowerCase()}${
                          task.status === 'COMPLETED' ? ' calendar__task--done' : ''
                        }`}
                        title={task.title}
                        onClick={() => setOpenTask(task.id)}
                      >
                        {task.title}
                      </button>
                    </li>
                  ))}

                  {/* On plafonne à trois : au-delà, la case s'étirerait et
                      déformerait toute la ligne de la semaine. */}
                  {dayTasks.length > 3 && (
                    <li className="calendar__more mc-data">+{dayTasks.length - 3}</li>
                  )}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {composing && <TaskEditor onClose={() => setComposing(false)} />}
      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
