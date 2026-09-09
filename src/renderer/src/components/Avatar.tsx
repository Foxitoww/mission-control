interface AvatarSource {
  displayName: string
  avatar: string | null
  accentColor: string
}

interface AvatarProps {
  user: AvatarSource
  size?: number
  className?: string
}

/**
 * Avatar d'un profil, avec trois représentations par ordre de préférence :
 * image (data URI), emoji, puis initiale sur fond d'accent.
 *
 * Il n'existe jamais d'état « vide » : un profil sans image reste identifiable
 * par sa lettre et sa couleur. C'est ce qui rend le sélecteur de profil lisible
 * même quand personne n'a pris la peine de choisir une photo (§37).
 */
export function Avatar({ user, size = 38, className }: AvatarProps): JSX.Element {
  const isImage = user.avatar?.startsWith('data:') ?? false

  const style = {
    width: size,
    height: size,
    // L'accent du profil, pas celui de l'application : dans le sélecteur, les
    // profils doivent se distinguer entre eux avant toute connexion.
    background: isImage ? 'transparent' : user.accentColor,
    fontSize: Math.round(size * 0.42)
  }

  const classes = ['mc-avatar', className ?? ''].filter(Boolean).join(' ')

  if (isImage) {
    return (
      <img
        className={classes}
        style={style}
        src={user.avatar as string}
        // Décoratif : le nom du profil est toujours écrit juste à côté, donc le
        // répéter ici ne ferait que doubler l'annonce du lecteur d'écran.
        alt=""
        draggable={false}
      />
    )
  }

  return (
    <span className={classes} style={style} aria-hidden="true">
      {user.avatar ?? user.displayName.slice(0, 1).toUpperCase()}
    </span>
  )
}
