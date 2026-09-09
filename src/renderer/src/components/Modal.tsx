import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  title: string
  label?: string
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Boîte de dialogue modale accessible.
 *
 * Trois comportements attendus d'une modale, et souvent oubliés :
 *   · Échap ferme ;
 *   · le focus entre dans la modale à l'ouverture et ne peut pas en sortir ;
 *   · le focus revient sur l'élément déclencheur à la fermeture.
 *
 * Sans le dernier point, refermer une modale au clavier renvoie l'utilisateur
 * au tout début de la page — l'un des défauts d'accessibilité les plus courants.
 */
export function Modal({ title, label, onClose, children }: ModalProps): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    restoreFocusTo.current = document.activeElement as HTMLElement | null

    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !panel) return

      // Piège à focus : on referme le cycle sur les bords de la liste.
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      restoreFocusTo.current?.focus()
    }
  }, [onClose])

  return (
    <div className="mc-modal-backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="mc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Sans cela, un clic à l'intérieur remonterait au fond et fermerait
        // la modale — y compris un glissement de sélection qui finit dehors.
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mc-modal__header">
          {label && <span className="mc-label">{label}</span>}
          <h2 className="mc-modal__title">{title}</h2>
        </header>
        {children}
      </div>
    </div>
  )
}
