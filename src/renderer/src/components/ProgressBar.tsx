import { useEffect, useState } from 'react'

interface ProgressBarProps {
  /** 0 à 100. */
  value: number
  /** Absent = lecture seule (ex. avancement dérivé des sous-tâches, qui n'édite rien). */
  onCommit?: (value: number) => void
  ariaLabel: string
  /** Remplace « N % » — sert à afficher « 3/5 » quand l'avancement vient des
   *  sous-tâches plutôt que d'une valeur libre. */
  valueLabel?: string
  size?: 'sm' | 'md'
}

/**
 * Barre d'avancement d'une tâche — visible partout, modifiable où elle a la
 * place de l'être.
 *
 * Le contrôle est un `<input type="range">` NATIF plutôt qu'un curseur maison
 * en div : glisser, les flèches du clavier, le tactile et l'annonce du
 * lecteur d'écran viennent alors gratuitement (même choix que Checkbox pour
 * la case à cocher — reconstruire tout cela à la main serait le seul résultat
 * d'un `role="slider"`).
 *
 * La valeur voyage en LOCAL pendant le glissé (`draft`) et n'est envoyée au
 * serveur qu'au relâchement : valider chaque pixel parcouru inonderait l'IPC
 * d'écritures inutiles.
 */
export function ProgressBar({
  value,
  onCommit,
  ariaLabel,
  valueLabel,
  size = 'md'
}: ProgressBarProps): JSX.Element {
  const [draft, setDraft] = useState(value)

  // Le serveur peut changer la valeur sans passer par CE curseur — un
  // changement de statut, ou une sous-tâche cochée ailleurs, la resynchronise.
  // On suit alors la valeur reçue plutôt que de garder un curseur figé.
  useEffect(() => setDraft(value), [value])

  if (!onCommit) {
    return (
      <div
        className={`task-progress task-progress--${size} task-progress--static`}
        role="img"
        aria-label={`${ariaLabel} : ${valueLabel ?? `${value} %`}`}
      >
        <div className="task-progress__track">
          <div className="task-progress__fill" style={{ width: `${value}%` }} />
        </div>
        <span className="task-progress__value mc-data">{valueLabel ?? `${value}%`}</span>
      </div>
    )
  }

  function commit(): void {
    if (draft !== value) onCommit?.(draft)
  }

  return (
    <div className={`task-progress task-progress--${size}`}>
      <input
        type="range"
        className="task-progress__input"
        min={0}
        max={100}
        step={1}
        value={draft}
        aria-label={`${ariaLabel} : ${draft} %`}
        style={{ ['--task-progress-fill' as string]: `${draft}%` }}
        // La carte Kanban qui héberge ce curseur est elle-même une poignée de
        // glisser-déposer (dnd-kit) : sans cette coupure, actionner le curseur
        // commencerait aussi à déplacer la carte.
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(Number(event.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <span className="task-progress__value mc-data">{draft}%</span>
    </div>
  )
}
