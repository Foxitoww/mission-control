/** Côté long de l'avatar stocké. Suffisant pour un affichage à 96 px en HiDPI. */
const TARGET_SIZE = 128

/** Garde-fou sur le fichier SOURCE, avant tout décodage. */
const MAX_SOURCE_BYTES = 12 * 1024 * 1024

export class AvatarImageError extends Error {
  constructor(
    readonly key: 'AVATAR_NOT_IMAGE' | 'AVATAR_SOURCE_TOO_LARGE' | 'AVATAR_DECODE_FAILED'
  ) {
    super(key)
    this.name = 'AvatarImageError'
  }
}

/**
 * Convertit un fichier choisi par l'utilisateur en data URI carré de 128×128.
 *
 * Tout se passe dans le renderer : `<input type="file">` donne un objet `File`
 * déjà en mémoire, donc le processus main n'a jamais besoin d'un accès disque
 * pour cette fonctionnalité. C'est une capacité qu'on n'ouvre pas.
 *
 * Le redimensionnement est indispensable, pas cosmétique : sans lui, une photo
 * de 4 Mo partirait en base64 dans SQLite — chaque lecture de profil coûterait
 * alors 5 Mo, et l'export JSON deviendrait inexploitable.
 */
export async function fileToAvatarDataUri(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AvatarImageError('AVATAR_NOT_IMAGE')
  if (file.size > MAX_SOURCE_BYTES) throw new AvatarImageError('AVATAR_SOURCE_TOO_LARGE')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    // Extension trompeuse, fichier tronqué, format exotique : dans tous les cas
    // l'utilisateur a besoin d'un message, pas d'une exception non gérée.
    throw new AvatarImageError('AVATAR_DECODE_FAILED')
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = TARGET_SIZE
    canvas.height = TARGET_SIZE

    const context = canvas.getContext('2d')
    if (!context) throw new AvatarImageError('AVATAR_DECODE_FAILED')

    // Recadrage « cover » : on prend le plus grand carré centré de la source,
    // pour qu'un portrait ou un panorama ne soit jamais déformé.
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = (bitmap.width - side) / 2
    const sy = (bitmap.height - side) / 2

    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE)

    // WebP à cette taille pèse quelques kilo-octets. Le PNG reste le repli si
    // l'encodeur n'est pas disponible — toDataURL retombe alors sur du PNG.
    const dataUri = canvas.toDataURL('image/webp', 0.85)
    return dataUri.startsWith('data:image/webp') ? dataUri : canvas.toDataURL('image/png')
  } finally {
    bitmap.close()
  }
}
