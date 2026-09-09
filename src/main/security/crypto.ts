import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto'

/**
 * Primitives de chiffrement du coffre (ADR-007).
 *
 * Chiffrement enveloppe : les données sont chiffrées par une clé aléatoire (DEK,
 * Data Encryption Key) qui ne change JAMAIS. C'est la DEK elle-même qui est
 * chiffrée, plusieurs fois, par des clés dérivées du mot de passe, de la phrase
 * de récupération, ou scellées par le système.
 *
 * Conséquence pratique : changer de mot de passe ne rechiffre pas la base — on
 * réemballe simplement 32 octets. Sans cette indirection, chaque changement de
 * mot de passe exigerait de relire et réécrire l'intégralité des données.
 */

const KEY_BYTES = 32 // AES-256
const IV_BYTES = 12 // taille nominale d'un IV GCM
const TAG_BYTES = 16
const SALT_BYTES = 32

/** Paramètres scrypt, alignés sur ceux du hachage de mot de passe (ADR-002). */
const N = 32768
const R = 8
const P = 1
const MAXMEM = 128 * N * R * 2

/**
 * Dérive une clé de chiffrement (KEK) depuis un secret humain.
 *
 * Version SYNCHRONE, à la différence du hachage de mot de passe : elle est
 * appelée une fois à l'ouverture du coffre, hors de toute transaction, et la
 * forme synchrone évite de propager `async` dans toute la chaîne d'ouverture.
 */
export function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret.normalize('NFKC'), salt, KEY_BYTES, { N, r: R, p: P, maxmem: MAXMEM })
}

export function randomSalt(): Buffer {
  return randomBytes(SALT_BYTES)
}

export function randomKey(): Buffer {
  return randomBytes(KEY_BYTES)
}

/**
 * Chiffre avec AES-256-GCM. Format : `[IV 12][chiffré][tag 16]`.
 *
 * GCM et non CBC : GCM est authentifié. Modifier un seul octet du fichier fait
 * échouer le déchiffrement au lieu de produire des données silencieusement
 * corrompues. Pour une base de données, la différence est décisive.
 */
export function seal(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()])
}

export class DecryptionError extends Error {
  constructor() {
    super('DECRYPTION_FAILED')
    this.name = 'DecryptionError'
  }
}

/**
 * Déchiffre et VÉRIFIE l'authenticité. Lève `DecryptionError` si la clé est
 * fausse ou si le contenu a été altéré — les deux cas sont indiscernables, et
 * c'est voulu : rien ne doit indiquer laquelle des deux hypothèses est vraie.
 */
export function open(key: Buffer, sealed: Buffer): Buffer {
  if (sealed.length < IV_BYTES + TAG_BYTES) throw new DecryptionError()

  const iv = sealed.subarray(0, IV_BYTES)
  const tag = sealed.subarray(sealed.length - TAG_BYTES)
  const body = sealed.subarray(IV_BYTES, sealed.length - TAG_BYTES)

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()])
  } catch {
    throw new DecryptionError()
  }
}

/**
 * Alphabet Crockford base32 : ni I, ni L, ni O, ni U.
 *
 * Ces lettres se confondent avec 1, 0 — ou forment des mots involontaires. Une
 * phrase de récupération est recopiée à la main sur du papier, souvent des mois
 * plus tard : chaque ambiguïté supprimée est une perte de données évitée.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PHRASE_GROUPS = 6
const GROUP_LENGTH = 5

/** Phrase de récupération de 30 caractères (~150 bits), en 6 groupes de 5. */
export function generateRecoveryPhrase(): string {
  const bytes = randomBytes(PHRASE_GROUPS * GROUP_LENGTH)
  const characters = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')

  const groups: string[] = []
  for (let index = 0; index < characters.length; index += GROUP_LENGTH) {
    groups.push(characters.slice(index, index + GROUP_LENGTH))
  }
  return groups.join('-')
}

/**
 * Normalise une phrase saisie : majuscules, tirets et espaces retirés, et les
 * confusions classiques ramenées à l'alphabet (O→0, I/L→1, U→V).
 */
export function normalizeRecoveryPhrase(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V')
}

/** Comparaison à temps constant, pour tout ce qui ressemble à un secret. */
export function secretsMatch(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
