import { useState } from 'react'
import { ActivityChart } from '@renderer/features/stats/ActivityChart'
import { useStats } from '@renderer/features/missions/queries'
import { useI18n } from '@renderer/i18n'
import { formatPercent, formatDuration } from '@renderer/lib/format'
import '@renderer/features/missions/missions.css'
import '@renderer/features/stats/charts.css'
import './filters.css'

const RANGES = [7, 30, 90] as const

/** Couleur sémantique de chaque priorité — la même que partout ailleurs. */
const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'var(--mc-priority-low)',
  MEDIUM: 'var(--mc-priority-medium)',
  HIGH: 'var(--mc-priority-high)',
  CRITICAL: 'var(--mc-priority-critical)'
}

export function StatsPage(): JSX.Element {
  const { t } = useI18n()
  const [days, setDays] = useState<number>(30)
  const { data, isPending } = useStats(days)

  if (isPending || !data) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    )
  }

  const { totals } = data
  const maxPriority = Math.max(1, ...data.byPriority.map((entry) => entry.total))
  const estimated = formatDuration(data.estimatedMinutesCompleted)

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <span className="mc-label">Telemetry</span>
          <h1 className="page__title">{t('nav.stats')}</h1>
        </div>

        {/* Les filtres tiennent sur une seule rangée, au-dessus des graphiques. */}
        <div className="filters__group" role="group" aria-label={t('stats.range')}>
          {RANGES.map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
            >
              {value} {t('stats.days')}
            </button>
          ))}
        </div>
      </header>

      {/* Chiffres seuls : ces quatre valeurs n'ont pas besoin d'un graphique
          pour être comprises, et un graphique les rendrait moins lisibles. */}
      <div className="stats">
        <div className="stat">
          <span className="mc-label">Completed</span>
          <span className="stat__value stat__value--nominal">
            {String(totals.completed).padStart(2, '0')}
          </span>
        </div>
        <div className="stat">
          <span className="mc-label">Active</span>
          <span className="stat__value">{String(totals.active).padStart(2, '0')}</span>
        </div>
        <div className="stat">
          <span className="mc-label">Completion rate</span>
          <span className="stat__value">{formatPercent(totals.completionRate)}</span>
        </div>
        <div className="stat">
          <span className="mc-label">Streak</span>
          <span className="stat__value">
            {String(data.streak).padStart(2, '0')}
            <span className="mc-label" style={{ marginLeft: 6 }}>
              {t('stats.days')}
            </span>
          </span>
        </div>
      </div>

      <ActivityChart data={data.daily} />

      <section className="chart">
        <header className="chart__head">
          <span className="mc-label">{t('stats.byPriority')}</span>
          {estimated && (
            <span className="mc-data" style={{ color: 'var(--mc-text-muted)' }}>
              {t('stats.timeCompleted')} {estimated}
            </span>
          )}
        </header>

        <div className="priority-bars">
          {data.byPriority.map((entry) => (
            <div key={entry.priority} className="priority-bar">
              <span className="priority-bar__label">{t(`priority.${entry.priority}`)}</span>
              <div className="priority-bar__track">
                <div
                  className="priority-bar__fill"
                  style={{
                    width: `${(entry.total / maxPriority) * 100}%`,
                    background: PRIORITY_COLOR[entry.priority]
                  }}
                />
              </div>
              <span className="mc-data priority-bar__value">
                {entry.completed}/{entry.total}
              </span>
            </div>
          ))}
        </div>
      </section>

      {data.byProject.length > 0 && (
        <section className="chart">
          <header className="chart__head">
            <span className="mc-label">{t('stats.byProject')}</span>
            <span className="mc-data" style={{ color: 'var(--mc-text-muted)' }}>
              {data.goals.completed}/{data.goals.total} {t('nav.goals').toLowerCase()}
            </span>
          </header>

          <div className="priority-bars">
            {data.byProject.map((project) => (
              <div key={project.id} className="priority-bar">
                <span className="priority-bar__label">{project.name}</span>
                <div className="priority-bar__track">
                  <div
                    className="priority-bar__fill"
                    style={{ width: `${project.progress * 100}%`, background: project.color }}
                  />
                </div>
                <span className="mc-data priority-bar__value">
                  {formatPercent(project.progress)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
