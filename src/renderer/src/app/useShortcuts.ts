import { useEffect } from 'react'

export interface Shortcut {
  key: string
  action: () => void
}

/**
 * Un champ de saisie a-t-il le focus ?
 *
 * Sans cette garde, taper « nouvelle procédure » dans un titre déclencherait
 * « n » (nouvelle tâche) au premier caractère. C'est le seul point délicat des
 * raccourcis à touche unique — et la raison pour laquelle tant d'applications
 * y renoncent.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Raccourcis à touche unique, documentés dans l'aide.
 *
 * Les combinaisons avec Ctrl/Alt/Meta sont ignorées : elles appartiennent au
 * système et à Electron (copier, coller, outils de développement), et les
 * intercepter casserait des réflexes acquis.
 */
export function useShortcuts(shortcuts: Shortcut[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (isTyping(event.target)) return

      const match = shortcuts.find((shortcut) => shortcut.key === event.key)
      if (!match) return

      event.preventDefault()
      match.action()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcuts, enabled])
}
