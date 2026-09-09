import { useId, type InputHTMLAttributes } from 'react'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  hint?: string
  /** Message déjà traduit. Sa présence bascule le champ en état invalide. */
  error?: string
}

export function TextField({ label, hint, error, ...rest }: TextFieldProps): JSX.Element {
  // `useId` garantit un identifiant unique et stable même si le champ est monté
  // plusieurs fois — indispensable pour que <label for> pointe au bon endroit.
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  // On décrit le champ par son indication ET par son erreur : un lecteur d'écran
  // annonce alors la contrainte et ce qui a échoué, pas seulement l'une des deux.
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className={`mc-field${error ? ' mc-field--invalid' : ''}`}>
      <label className="mc-field__label" htmlFor={id}>
        {label}
      </label>

      <input
        id={id}
        className="mc-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...rest}
      />

      {hint && !error && (
        <span className="mc-field__hint" id={hintId}>
          {hint}
        </span>
      )}

      {/* `role="alert"` fait annoncer l'erreur dès son apparition, sans que
          l'utilisateur ait à revenir sur le champ. */}
      {error && (
        <span className="mc-field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
