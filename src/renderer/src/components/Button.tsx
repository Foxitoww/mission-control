import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  block?: boolean
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  block = false,
  loading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = ['mc-btn', `mc-btn--${variant}`, block ? 'mc-btn--block' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={classes}
      // Un bouton en cours de traitement est désactivé sans que l'appelant ait
      // à y penser : c'est la garantie qu'on ne soumet pas deux fois.
      disabled={disabled === true || loading}
      // `aria-busy` annonce l'attente aux lecteurs d'écran, que le lecteur
      // perçoive ou non le petit indicateur rotatif.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="mc-btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}
