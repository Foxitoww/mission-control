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
import { QueryState } from '@renderer/components/QueryState'
import { ProgressBar } from '@renderer/components/ProgressBar'
import { useTasks, useMoveTask, useUpdateTask } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { formatDue } from '@renderer/lib/format'
import './missions.css'
import '@renderer/pages/kanban.css'

/**
 * Colonnes du tableau (§10). `ARCHIVED` en est absente : une colonne
 * d'archives grandirait sans fin et repousserait les colonnes utiles hors de
 * l'écran. Le type l'exclut aussi, pas seulement le tableau : c'est ce qui
 * garantit que `board.column.${status}` couvre bien toutes les valeurs
 * possibles, à la vérification des types plutôt qu'à l'exécution.
 */
type BoardStatus = Exclude<TaskStatus, 'ARCHIVED'>
const COLUMNS: BoardStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']

/**
 * Le tableau — extrait de KanbanPage pour être EMBARQUÉ dans l'onglet
 * « Tableau » d'une app (AppPage), scopé à son projet via `projectId`. La
 * page /board l'utilise sans filtre, pour toutes les apps à la fois.
 */
export function KanbanBoard({
  projectId,
  onOpen
}: {
  projectId?: string
  onOpen: (id: string) => void
}): JSX.Element {
  const { t } = useI18n()
  const filter = useMemo<Partial<TaskFilter>>(
    () => (projectId ? { statuses: COLUMNS, projectId } : { statuses: COLUMNS }),
    [projectId]
  )
  const { data: tasks = [], isPending, isError, refetch } = useTasks(filter)
  const move = useMoveTask()

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
    const map = new Map<BoardStatus, TaskListItem[]>(COLUMNS.map((status) => [status, []]))
    // `filter.statuses` (COLUMNS) exclut déjà ARCHIVED côté serveur : le
    // cast n'élargit rien, il documente une garantie que le type de
    // TaskListItem — partagé avec des écrans qui, eux, voient les 5 statuts
    // — ne peut pas exprimer lui-même.
    for (const task of tasks) map.get(task.status as BoardStatus)?.push(task)
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
      ? (overId.slice('column:'.length) as BoardStatus)
      : ((tasks.find((item) => item.id === over.id)?.status ?? task.status) as BoardStatus)

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
              onOpen={onOpen}
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

      <p className="mc-field__hint">{t('kanban.hint')}</p>
    </QueryState>
  )
}

function Card({ task, onOpen }: { task: TaskListItem; onOpen: (id: string) => void }): JSX.Element {
  const { t, language } = useI18n()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status }
  })
  const updateTask = useUpdateTask()

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

      {/* Éditable directement sur la carte, sans ouvrir la tâche : c'est le
          geste rapide, la modale reste pour un ajustement plus posé. */}
      <ProgressBar
        value={task.progress}
        onCommit={(value) => updateTask.mutate({ id: task.id, progress: value })}
        ariaLabel={t('task.progress')}
        size="sm"
      />

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
  status: BoardStatus
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
          {t(`board.column.${status}`)}
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
