import { useId, type InputHTMLAttributes } from 'react'

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string
  hint?: string
}

export function Checkbox({ label, hint, ...rest }: CheckboxProps): JSX.Element {
  const id = useId()
  const hintId = `${id}-hint`

  return (
    <div className="mc-checkbox">
      {/* La case native reste dans le DOM et garde son comportement clavier
          (Espace pour cocher, focus, lecteurs d'écran) ; seule son apparence
          est remplacée. Reconstruire une case avec un <div role="checkbox">
          obligerait à réimplémenter tout cela à la main. */}
      <input id={id} type="checkbox" aria-describedby={hint ? hintId : undefined} {...rest} />
      <div className="mc-checkbox__text">
        <label htmlFor={id}>{label}</label>
        {hint && (
          <span className="mc-field__hint" id={hintId}>
            {hint}
          </span>
        )}
      </div>
    </div>
  )
}
