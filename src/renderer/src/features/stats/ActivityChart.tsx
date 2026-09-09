import { useMemo, useState } from 'react'
import type { DailyActivity } from '@shared/types/views'
import { useI18n } from '@renderer/i18n'
import './charts.css'

const WIDTH = 720
const HEIGHT = 190
const PADDING = { top: 12, right: 8, bottom: 22, left: 30 }

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom

/** Écart de 2 px entre les deux barres d'un même jour (spécification des marques). */
const BAR_GAP = 2

/**
 * Barre à extrémité arrondie, ancrée à la ligne de base.
 *
 * Un `rect` avec `rx` arrondirait aussi le bas, ce qui décollerait visuellement
 * la barre de son axe et fausserait la lecture des petites valeurs. On dessine
 * donc un tracé dont seuls les coins hauts sont arrondis.
 */
function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${y + height}`,
    'Z'
  ].join(' ')
}

interface ActivityChartProps {
  data: DailyActivity[]
}

export function ActivityChart({ data }: ActivityChartProps): JSX.Element {
  const { t, language } = useI18n()
  const [hovered, setHovered] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const max = useMemo(
    // Plancher à 1 : sans lui, une période sans activité diviserait par zéro et
    // toutes les barres deviendraient infinies.
    () => Math.max(1, ...data.map((day) => Math.max(day.created, day.completed))),
    [data]
  )

  const groupWidth = PLOT_WIDTH / Math.max(1, data.length)
  const barWidth = Math.max(2, Math.min(9, (groupWidth - BAR_GAP) / 2 - 1))

  const formatDay = (iso: string): string => {
    const [year, month, day] = iso.split('-').map(Number)
    const date = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
    return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short'
    }).format(date)
  }

  const active = hovered !== null ? data[hovered] : null

  return (
    <div className="chart">
      <header className="chart__head">
        <span className="mc-label">{t('stats.activity')}</span>

        {/* Légende obligatoire dès deux séries : l'identité ne repose jamais
            sur la seule couleur (§24). */}
        <div className="chart__legend">
          <span className="chart__legend-item">
            <span className="chart__swatch" style={{ background: 'var(--mc-chart-1)' }} />
            {t('stats.created')}
          </span>
          <span className="chart__legend-item">
            <span className="chart__swatch" style={{ background: 'var(--mc-chart-2)' }} />
            {t('stats.completed')}
          </span>
          <button type="button" className="chart__toggle" onClick={() => setShowTable((v) => !v)}>
            {showTable ? t('stats.showChart') : t('stats.showTable')}
          </button>
        </div>
      </header>

      {showTable ? (
        // Vue tabulaire : le même contenu, lisible par un lecteur d'écran et
        // copiable. Un graphique seul n'est pas une donnée accessible.
        <div className="chart__table-wrap">
          <table className="chart__table">
            <thead>
              <tr>
                <th scope="col">{t('stats.day')}</th>
                <th scope="col">{t('stats.created')}</th>
                <th scope="col">{t('stats.completed')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{formatDay(day.date)}</th>
                  <td className="mc-data">{day.created}</td>
                  <td className="mc-data">{day.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart__plot">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="chart__svg"
            role="img"
            aria-label={t('stats.activity')}
          >
            {/* Grille en retrait : elle situe, elle ne se lit pas. */}
            {[0, 0.5, 1].map((ratio) => {
              const y = PADDING.top + PLOT_HEIGHT * (1 - ratio)
              return (
                <g key={ratio}>
                  <line
                    x1={PADDING.left}
                    x2={WIDTH - PADDING.right}
                    y1={y}
                    y2={y}
                    className="chart__grid"
                  />
                  <text x={PADDING.left - 6} y={y + 3} className="chart__axis" textAnchor="end">
                    {Math.round(max * ratio)}
                  </text>
                </g>
              )
            })}

            {data.map((day, index) => {
              const groupX = PADDING.left + index * groupWidth
              const centre = groupX + groupWidth / 2
              const createdHeight = (day.created / max) * PLOT_HEIGHT
              const completedHeight = (day.completed / max) * PLOT_HEIGHT

              return (
                <g key={day.date}>
                  {/* Zone de survol plus large que les barres : viser 8 px au
                      pixel près serait pénible, surtout au pavé tactile. */}
                  <rect
                    x={groupX}
                    y={PADDING.top}
                    width={groupWidth}
                    height={PLOT_HEIGHT}
                    className={`chart__hit${hovered === index ? ' chart__hit--on' : ''}`}
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                  />
                  <path
                    d={barPath(
                      centre - barWidth - BAR_GAP / 2,
                      PADDING.top + PLOT_HEIGHT - createdHeight,
                      barWidth,
                      createdHeight
                    )}
                    fill="var(--mc-chart-1)"
                  />
                  <path
                    d={barPath(
                      centre + BAR_GAP / 2,
                      PADDING.top + PLOT_HEIGHT - completedHeight,
                      barWidth,
                      completedHeight
                    )}
                    fill="var(--mc-chart-2)"
                  />
                </g>
              )
            })}

            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={PADDING.top + PLOT_HEIGHT}
              y2={PADDING.top + PLOT_HEIGHT}
              className="chart__baseline"
            />

            {/* Étiquettes d'axe sélectives : une date sous chaque barre serait
                illisible, et les chevauchements sont le premier défaut d'un
                axe temporel dense. */}
            {data.map((day, index) => {
              const step = Math.ceil(data.length / 6)
              if (index % step !== 0) return null
              return (
                <text
                  key={day.date}
                  x={PADDING.left + index * groupWidth + groupWidth / 2}
                  y={HEIGHT - 6}
                  className="chart__axis"
                  textAnchor="middle"
                >
                  {formatDay(day.date)}
                </text>
              )
            })}
          </svg>

          {active && (
            <div className="chart__tooltip" role="status">
              <span className="chart__tooltip-date">{formatDay(active.date)}</span>
              <span>
                <span className="chart__swatch" style={{ background: 'var(--mc-chart-1)' }} />
                {t('stats.created')} <span className="mc-data">{active.created}</span>
              </span>
              <span>
                <span className="chart__swatch" style={{ background: 'var(--mc-chart-2)' }} />
                {t('stats.completed')} <span className="mc-data">{active.completed}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
