/**
 * Notification sonore du chat général — synthétisée, pas un fichier.
 *
 * L'API Web Audio est standard sur tout moteur Chromium/WebKit, aussi bien
 * dans l'app de bureau que dans un navigateur mobile : pas de module natif
 * Electron, rien qui ne fonctionnerait que sur une seule plateforme (§
 * demande de compatibilité desktop/mobile). Générer le son évite en plus
 * d'embarquer un fichier audio et sa question de licence pour deux notes.
 */

let context: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  // UN SEUL contexte partagé : en créer un par notification en accumulerait
  // des dizaines jamais fermés, et les navigateurs plafonnent leur nombre.
  if (!context) context = new Ctor()
  return context
}

/**
 * Deux notes courtes et douces — jamais un bip strident. Un son manqué
 * (contexte bloqué par la politique de lecture automatique, navigateur
 * exotique) est sans conséquence : la fonction échoue en silence plutôt que
 * de remonter une erreur pour un simple agrément.
 */
export function playChatChime(): void {
  try {
    const audio = getContext()
    if (!audio) return
    if (audio.state === 'suspended') void audio.resume()

    const now = audio.currentTime
    const notes: Array<[frequency: number, start: number]> = [
      [880, 0],
      [1320, 0.09]
    ]

    for (const [frequency, start] of notes) {
      const oscillator = audio.createOscillator()
      const gain = audio.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      // Discret : un gain plafonné bas, et une extinction exponentielle
      // plutôt qu'une coupure nette, pour qu'on l'entende sans sursauter.
      gain.gain.setValueAtTime(0, now + start)
      gain.gain.linearRampToValueAtTime(0.06, now + start + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.14)

      oscillator.connect(gain).connect(audio.destination)
      oscillator.start(now + start)
      oscillator.stop(now + start + 0.16)
    }
  } catch {
    // Voir le commentaire au-dessus de la fonction : jamais bloquant.
  }
}
