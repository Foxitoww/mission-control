import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { TaskStatus } from '@shared/types/domain'
import type { TaskListItem } from '@shared/types/views'
import type { TaskFilter } from '@shared/schemas/task.schema'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { Button } from '@renderer/components/Button'
import { QueryState } from '@renderer/components/QueryState'
import { useTasks, useMoveTask } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { formatDue } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'
import './kanban.css'

/**
 * Colonnes du Kanban (§10). `ARCHIVED` en est absent : une colonne d'archives
 * grandirait sans fin et repousserait les colonnes utiles hors de l'écran.
 */
const COLUMNS: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']

const FILTER: Partial<TaskFilter> = { statuses: COLUMNS }

function Card({ task, onOpen }: { task: TaskListItem; onOpen: (id: string) => void }): JSX.Element {
  const { language } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status }
  })

  const due = formatDue(task.dueDate, language)

  return (
    <li
      ref={setNodeRef}
      className={`kanban-card${isDragging ? ' kanban-card--dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onDoubleClick={() => onOpen(task.id)}
    >
      <span
        className={`kanban-card__priority kanban-card__priority--${task.priority.toLowerCase()}`}
        aria-hidden="true"
      />
      <span className="kanban-card__title">{task.title}</span>

      <span className="kanban-card__meta">
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
        {task.subtaskTotal > 0 && (
          <span className="mc-data">
            {task.subtaskDone}/{task.subtaskTotal}
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="mc-data comment-badge">{task.commentCount}</span>
        )}
        {due && <span className={`mc-data task-row__due--${due.tone}`}>{due.countdown}</span>}
      </span>
    </li>
  )
}

function Column({
  status,
  tasks,
  onOpen
}: {
  status: TaskStatus
  tasks: TaskListItem[]
  onOpen: (id: string) => void
}): JSX.Element {
  const { t } = useI18n()
  // La colonne entière est une zone de dépôt, pas seulement les cartes : sans
  // cela, une colonne vide serait impossible à viser.
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` })

  return (
    <section className={`kanban-column${isOver ? ' kanban-column--over' : ''}`}>
      <header className="kanban-column__head">
        <span
          className={`mc-label kanban-column__label kanban-column__label--${status.toLowerCase()}`}
        >
          {t(`status.${status}`)}
        </span>
        <span className="mc-data panel__count">{String(tasks.length).padStart(2, '0')}</span>
      </header>

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul className="kanban-column__list" ref={setNodeRef}>
          {tasks.map((task) => (
            <Card key={task.id} task={task} onOpen={onOpen} />
          ))}
          {tasks.length === 0 && <li className="kanban-column__empty">{t('kanban.empty')}</li>}
        </ul>
      </SortableContext>
    </section>
  )
}

export function KanbanPage(): JSX.Element {
  const { t } = useI18n()
  const { data: tasks = [], isPending, isError, refetch } = useTasks(FILTER)
  const move = useMoveTask()

  const [openTask, setOpenTask] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [dragging, setDragging] = useState<TaskListItem | null>(null)

  /**
   * `KeyboardSensor` n'est pas décoratif : sans lui, le tableau serait
   * inutilisable sans souris. C'est la raison principale du choix de dnd-kit
   * plutôt que d'une implémentation maison (§24).
   */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  )

  const byColumn = useMemo(() => {
    const map = new Map<TaskStatus, TaskListItem[]>(COLUMNS.map((status) => [status, []]))
    for (const task of tasks) map.get(task.status)?.push(task)
    return map
  }, [tasks])

  function onDragStart(event: DragStartEvent): void {
    setDragging(tasks.find((task) => task.id === event.active.id) ?? null)
  }

  function onDragEnd(event: DragEndEvent): void {
    setDragging(null)
    const { active, over } = event
    if (!over) return

    const task = tasks.find((item) => item.id === active.id)
    if (!task) return

    // Le dépôt vise soit une colonne vide (`column:STATUS`), soit une carte —
    // auquel cas on hérite du statut de cette carte.
    const overId = String(over.id)
    const targetStatus = overId.startsWith('column:')
      ? (overId.slice('column:'.length) as TaskStatus)
      : (tasks.find((item) => item.id === over.id)?.status ?? task.status)

    const column = byColumn.get(targetStatus) ?? []
    const withoutTask = column.filter((item) => item.id !== task.id)
    const index = withoutTask.findIndex((item) => item.id === over.id)

    // On envoie les VOISINS, jamais une position calculée : le serveur seul
    // connaît le schéma d'ordonnancement (voir moveTaskInputSchema).
    const before = index === -1 ? withoutTask[withoutTask.length - 1] : withoutTask[index - 1]
    const after = index === -1 ? undefined : withoutTask[index]

    if (targetStatus === task.status && before?.id === undefined && after?.id === undefined) return

    move.mutate({
      id: task.id,
      status: targetStatus,
      beforeId: before?.id ?? null,
      afterId: after?.id ?? null
    })
  }

  return (
    <div className="page page--wide">
      <header className="page__head">
        <div>
          <span className="mc-label">Mission board</span>
          <h1 className="page__title">{t('nav.board')}</h1>
        </div>
        <Button onClick={() => setComposing(true)}>{t('task.new')}</Button>
      </header>

      <QueryState
        isPending={isPending}
        isError={isError}
        retry={() => void refetch()}
        skeletonHeight={240}
        skeletonCount={4}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <div className="kanban">
            {COLUMNS.map((status) => (
              <Column
                key={status}
                status={status}
                tasks={byColumn.get(status) ?? []}
                onOpen={setOpenTask}
              />
            ))}
          </div>

          {/* La carte suit le curseur au lieu de laisser un trou : on voit ce
              qu'on déplace, et la colonne d'origine garde sa hauteur. */}
          <DragOverlay>
            {dragging && (
              <div className="kanban-card kanban-card--overlay">
                <span className="kanban-card__title">{dragging.title}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </QueryState>

      <p className="mc-field__hint">{t('kanban.hint')}</p>

      {composing && <TaskEditor onClose={() => setComposing(false)} />}
      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
