import type { Language } from '@shared/types/domain'

export type DueTone = 'overdue' | 'today' | 'soon' | 'far'

export interface DueInfo {
  /** Compte à rebours de mission : `T−03 D`, `T 00 D`, `T+02 D`. */
  countdown: string
  /** Date lisible, dans la langue de l'utilisateur. */
  absolute: string
  tone: DueTone
}

/**
 * Écart en JOURS CIVILS, pas en tranches de 24 heures.
 *
 * Une échéance à 23 h ce soir doit afficher « aujourd'hui », pas « dans 0,04
 * jour ». On compare donc des minuits locaux, ce qui est aussi la façon dont
 * un humain compte les jours.
 */
function calendarDaysUntil(target: Date, reference = new Date()): number {
  const a = new Date(target)
  a.setHours(0, 0, 0, 0)
  const b = new Date(reference)
  b.setHours(0, 0, 0, 0)
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

/**
 * Compte à rebours façon salle de contrôle.
 *
 * `T−` pour ce qui arrive, `T+` pour ce qui est dépassé. C'est la convention
 * réelle des lancements, et elle a l'avantage d'être lisible d'un coup d'œil
 * dans une colonne : le signe suffit à trier l'urgent du reste.
 */
export function formatDue(iso: string | null, language: Language): DueInfo | null {
  if (!iso) return null

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const days = calendarDaysUntil(date)
  const magnitude = String(Math.abs(days)).padStart(2, '0')

  let countdown: string
  if (days === 0) countdown = 'T 00 D'
  else if (days > 0) countdown = `T−${magnitude} D`
  else countdown = `T+${magnitude} D`

  let tone: DueTone = 'far'
  if (days < 0) tone = 'overdue'
  else if (days === 0) tone = 'today'
  else if (days <= 3) tone = 'soon'

  const absolute = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  }).format(date)

  return { countdown, absolute, tone }
}

/** `90` → `1 h 30`. Une durée en minutes seules devient illisible passé 120. */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

/** Pourcentage entier, pour un affichage stable. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`
}

/** Numéro de mission décoratif, dérivé de l'identifiant — stable et sans état. */
export function missionCode(id: string, prefix = 'OP'): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 1000
  return `${prefix}-${String(hash).padStart(3, '0')}`
}

/** Convertit une date de champ `<input type="date">` en ISO UTC, ou null. */
export function dateInputToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  // Midi local plutôt que minuit : une échéance calée sur minuit bascule d'un
  // jour dès que le fuseau change, ce qui décale toutes les listes.
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Inverse de `dateInputToIso`, pour préremplir un champ date. */
export function isoToDateInput(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
