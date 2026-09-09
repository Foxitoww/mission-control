import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import './toast.css'

type Tone = 'success' | 'error'

interface Toast {
  id: number
  tone: Tone
  message: string
}

interface ToastValue {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastValue | null>(null)

/** Durée d'affichage. Assez pour être lu, assez court pour ne pas gêner. */
const LIFETIME_MS = 3500

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const push = useCallback((tone: Tone, message: string) => {
    const id = (nextId.current += 1)
    setToasts((current) => [...current, { id, tone, message }])
    // Le retrait est piloté par un minuteur plutôt que par la fin de
    // l'animation : une animation supprimée par prefers-reduced-motion ne
    // déclencherait jamais l'événement, et le message resterait à l'écran.
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), LIFETIME_MS)
  }, [])

  const value = useMemo<ToastValue>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message)
    }),
    [push]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* `aria-live="polite"` : le message est annoncé sans interrompre la
          saisie en cours. `role="status"` suffit, une alerte serait trop
          intrusive pour une confirmation. */}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <span className="toast__mark" aria-hidden="true">
              {toast.tone === 'success' ? '✓' : '▲'}
            </span>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Retourne un émetteur de notification, ou une version inerte hors contexte.
 *
 * Ne LÈVE PAS d'erreur si le fournisseur est absent : une confirmation
 * manquante ne doit jamais faire tomber un écran. C'est l'inverse du choix fait
 * pour `useAuth`, où l'absence de contexte est un vrai défaut de câblage.
 */
export function useToast(): ToastValue {
  return useContext(ToastContext) ?? { success: () => {}, error: () => {} }
}
