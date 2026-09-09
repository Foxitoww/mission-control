import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@renderer/components/Avatar'
import { useI18n } from '@renderer/i18n'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { ProfileEditor } from './ProfileEditor'
import './profile.css'

export function ProfileMenu(): JSX.Element | null {
  const { t } = useI18n()
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  // Fermeture au clic extérieur et à Échap. Les deux sont attendus d'un menu :
  // sans le clic extérieur il faut viser le bouton à nouveau, sans Échap le
  // menu piège l'utilisateur au clavier.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent): void {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) return null

  return (
    <div className="profile-menu" ref={container}>
      <button
        type="button"
        className="profile-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('profile.menu')}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar user={user} size={34} />
        <span className="profile-menu__identity">
          <span className="profile-menu__name">{user.displayName}</span>
          <span className="profile-menu__username mc-data">@{user.username}</span>
        </span>
        <span className="profile-menu__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="profile-menu__panel" role="menu">
          <button
            type="button"
            className="profile-menu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setEditing(true)
            }}
          >
            {t('profile.edit')}
          </button>
          <button
            type="button"
            className="profile-menu__item profile-menu__item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
          >
            {t('auth.signOut')}
          </button>
        </div>
      )}

      {editing && <ProfileEditor onClose={() => setEditing(false)} />}
    </div>
  )
}
