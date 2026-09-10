import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TimelineEntry, TimelineMilestone } from '@shared/types/views'
import { QueryState } from '@renderer/components/QueryState'
import { TaskEditor } from '@renderer/features/missions/TaskEditor'
import { useTimeline } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { formatPercent } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'
import './filters.css'
import './timeline.css'

/** Étendues proposées, en mois après aujourd'hui. `null` = tout l'historique. */
const SCOPES = [3, 6, 12, null] as const
type Scope = (typeof SCOPES)[number]

/** Un mois de passé visible : assez pour situer les retards, pas plus. */
const PAST_MONTHS = 1

interface Window {
  from: number
  to: number
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * Bornes des mois traversés par la fenêtre.
 *
 * Sert à la fois aux traits de grille et aux étiquettes. On les calcule une
 * fois : dessiner la grille et les libellés depuis deux sources différentes
 * finit toujours par les désaligner d'un pixel.
 */
function monthTicks(window: Window): Date[] {
  const ticks: Date[] = []
  const cursor = monthStart(new Date(window.from))

  while (cursor.getTime() <= window.to) {
    if (cursor.getTime() >= window.from) ticks.push(new Date(cursor))
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return ticks
}

function percent(time: number, window: Window): number {
  const span = window.to - window.from
  if (span <= 0) return 0
  return ((time - window.from) / span) * 100
}

/**
 * Segment visible d'une mission dans la fenêtre.
 *
 * Renvoie `null` quand la mission est entièrement hors champ — mieux vaut ne
 * rien dessiner qu'une barre écrasée sur un bord, qui suggérerait une échéance
 * imminente. Les débordements sont signalés, jamais masqués.
 */
function segment(
  entry: TimelineEntry,
  window: Window
): { left: number; width: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const start = new Date(entry.start).getTime()
  const end = entry.end ? new Date(entry.end).getTime() : start

  if (end < window.from || start > window.to) return null

  const clampedStart = Math.max(start, window.from)
  const clampedEnd = Math.min(end, window.to)

  const left = percent(clampedStart, window)
  const width = Math.max(percent(clampedEnd, window) - left, 0.6)

  return {
    left,
    width,
    clippedStart: start < window.from,
    clippedEnd: end > window.to
  }
}

function MilestoneDot({
  milestone,
  window,
  onOpen
}: {
  milestone: TimelineMilestone
  window: Window
  onOpen: (id: string) => void
}): JSX.Element | null {
  const { language } = useI18n()
  const time = new Date(milestone.dueDate).getTime()
  if (time < window.from || time > window.to) return null

  const label = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short'
  }).format(new Date(milestone.dueDate))

  return (
    <button
      type="button"
      className={`timeline__dot timeline__dot--${milestone.priority.toLowerCase()}${
        milestone.status === 'COMPLETED' ? ' timeline__dot--done' : ''
      }`}
      style={{ left: `${percent(time, window)}%` }}
      title={`${milestone.title} — ${label}`}
      aria-label={`${milestone.title}, ${label}`}
      onClick={() => onOpen(milestone.id)}
    />
  )
}

export function TimelinePage(): JSX.Element {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const { data, isPending, isError, refetch } = useTimeline()

  const [scope, setScope] = useState<Scope>(6)
  const [openTask, setOpenTask] = useState<string | null>(null)

  const window = useMemo<Window>(() => {
    const now = Date.now()
    const past = new Date(now)
    past.setMonth(past.getMonth() - PAST_MONTHS)

    if (scope === null && data?.range) {
      // « Tout » suit les données, avec une marge d'un mois de chaque côté pour
      // que les extrémités ne collent pas aux bords.
      const from = new Date(data.range.from)
      const to = new Date(data.range.to)
      from.setMonth(from.getMonth() - 1)
      to.setMonth(to.getMonth() + 1)
      return { from: from.getTime(), to: to.getTime() }
    }

    const future = new Date(now)
    future.setMonth(future.getMonth() + (scope ?? 6))
    return { from: past.getTime(), to: future.getTime() }
  }, [scope, data?.range])

  const ticks = useMemo(() => monthTicks(window), [window])
  const todayLeft = percent(Date.now(), window)

  const monthLabel = (date: Date): string =>
    new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
      month: 'short',
      year: date.getMonth() === 0 ? '2-digit' : undefined
    }).format(date)

  const entries = data?.entries ?? []
  const unassigned = data?.unassigned ?? []

  return (
    <div className="page page--wide">
      <header className="page__head">
        <div>
          <span className="mc-label">Flight plan</span>
          <h1 className="page__title">{t('nav.timeline')}</h1>
        </div>

        <div className="filters__group" role="group" aria-label={t('timeline.scope')}>
          {SCOPES.map((value) => (
            <button
              key={String(value)}
              type="button"
              className="chip"
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {value === null ? t('timeline.all') : `${value} ${t('timeline.months')}`}
            </button>
          ))}
        </div>
      </header>

      <QueryState
        isPending={isPending}
        isError={isError}
        isEmpty={entries.length === 0 && unassigned.length === 0}
        retry={() => void refetch()}
        emptyTitle={t('timeline.emptyTitle')}
        emptyHint={t('timeline.emptyHint')}
        skeletonHeight={54}
        skeletonCount={4}
      >
        <div className="timeline">
          {/* En-tête d'axe : les mois. Une échelle plus fine deviendrait
              illisible passé quelques semaines de portée. */}
          <div className="timeline__row timeline__row--axis">
            <span className="timeline__label mc-label">{t('timeline.mission')}</span>
            <div className="timeline__track">
              {ticks.map((tick) => (
                <span
                  key={tick.toISOString()}
                  className="timeline__tick"
                  style={{ left: `${percent(tick.getTime(), window)}%` }}
                >
                  {monthLabel(tick)}
                </span>
              ))}

              {/* L'étiquette « aujourd'hui » vit dans l'AXE, pas dans le corps :
                  posée sur les rangées, elle recouvrait la première barre. La
                  ligne, elle, traverse bien tout le corps. */}
              {todayLeft >= 0 && todayLeft <= 100 && (
                <span className="mc-data timeline__today-label" style={{ left: `${todayLeft}%` }}>
                  {t('calendar.today')}
                </span>
              )}
            </div>
          </div>

          <div className="timeline__body">
            {/* Couche de repères, alignée sur la PISTE et non sur la rangée :
                la ligne d'aujourd'hui et la grille sont ainsi tracées une seule
                fois, dans le même repère que les barres. Une ligne par rangée
                se désaligne au premier décalage de mise en page. */}
            <div className="timeline__overlay" aria-hidden="true">
              {ticks.map((tick) => (
                <div
                  key={`grid-${tick.toISOString()}`}
                  className="timeline__gridline"
                  style={{ left: `${percent(tick.getTime(), window)}%` }}
                />
              ))}

              {todayLeft >= 0 && todayLeft <= 100 && (
                <div className="timeline__today" style={{ left: `${todayLeft}%` }} />
              )}
            </div>

            {entries.map((entry) => {
              const bar = segment(entry, window)

              return (
                <div key={entry.id} className="timeline__row">
                  <button
                    type="button"
                    className="timeline__label timeline__label--action"
                    onClick={() => navigate(`/app/${entry.id}`)}
                  >
                    <span
                      className="task-row__dot"
                      style={{ background: entry.color }}
                      aria-hidden="true"
                    />
                    <span className="timeline__name">
                      {entry.icon ? `${entry.icon} ` : ''}
                      {entry.name}
                    </span>
                  </button>

                  <div className="timeline__track">
                    {bar ? (
                      <div
                        className={`timeline__bar${bar.clippedStart ? ' timeline__bar--clip-start' : ''}${
                          bar.clippedEnd ? ' timeline__bar--clip-end' : ''
                        }${entry.hasDeadline ? '' : ' timeline__bar--open'}`}
                        style={{
                          left: `${bar.left}%`,
                          width: `${bar.width}%`,
                          borderColor: entry.color
                        }}
                        title={`${entry.name} — ${formatPercent(entry.progress)}`}
                      >
                        {/* Progression peinte DANS la barre : l'avancement se lit
                            au même endroit que la durée, sans seconde échelle. */}
                        <span
                          className="timeline__fill"
                          style={{ width: `${entry.progress * 100}%`, background: entry.color }}
                        />
                        <span className="mc-data timeline__ratio">
                          {entry.taskCompleted}/{entry.taskTotal}
                        </span>
                      </div>
                    ) : (
                      <span className="timeline__offscreen mc-data">{t('timeline.offscreen')}</span>
                    )}

                    {entry.milestones.map((milestone) => (
                      <MilestoneDot
                        key={milestone.id}
                        milestone={milestone}
                        window={window}
                        onOpen={setOpenTask}
                      />
                    ))}
                  </div>
                </div>
              )
            })}

            {unassigned.length > 0 && (
              <div className="timeline__row timeline__row--loose">
                <span className="timeline__label timeline__name">{t('timeline.unassigned')}</span>
                <div className="timeline__track">
                  {unassigned.map((milestone) => (
                    <MilestoneDot
                      key={milestone.id}
                      milestone={milestone}
                      window={window}
                      onOpen={setOpenTask}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mc-field__hint">{t('timeline.hint')}</p>
      </QueryState>

      {openTask && <TaskEditor taskId={openTask} onClose={() => setOpenTask(null)} />}
    </div>
  )
}
