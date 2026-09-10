import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * `promisify` ne conserve pas les surcharges de `scrypt` : TypeScript retient la
 * signature à trois arguments et refuse le quatrième (les options). On réaffirme
 * donc la signature voulue — celle qui accepte N, r, p et maxmem.
 */
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>

/**
 * Hachage de mots de passe avec scrypt (voir ADR-002).
 *
 * Format stocké, volontairement auto-descriptif :
 *   scrypt$N$r$p$<sel base64>$<clé base64>
 *
 * Les paramètres voyagent AVEC le hash. On peut donc durcir N pour les nouveaux
 * comptes, ou migrer vers argon2id plus tard, sans invalider les hashs existants :
 * la vérification lit toujours les paramètres du hash qu'elle valide.
 */

const N = 32768 // 2^15 — coût CPU et mémoire
const R = 8
const P = 1
const KEY_LEN = 64
const SALT_LEN = 32

/**
 * scrypt consomme 128 · N · r octets, soit exactement 32 Mio ici — et la limite
 * `maxmem` de Node vaut 32 Mio par défaut, donc l'appel échouerait de justesse
 * avec un « memory limit exceeded » peu explicite. On double la limite.
 */
const MAXMEM = 128 * N * R * 2

/**
 * NFKC : « é » saisi comme un caractère précomposé ou comme « e » + accent
 * combinant produit des octets différents. Sans normalisation, un mot de passe
 * accentué peut échouer selon le clavier ou l'OS utilisé pour le saisir.
 */
function normalise(password: string): string {
  return password.normalize('NFKC')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const key = await scryptAsync(normalise(password), salt, KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM
  })

  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const [, nRaw, rRaw, pRaw, saltB64, keyB64] = parts as [
    string,
    string,
    string,
    string,
    string,
    string
  ]

  const n = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scryptAsync(
    normalise(password),
    Buffer.from(saltB64, 'base64'),
    expected.length,
    {
      N: n,
      r,
      p,
      maxmem: 128 * n * r * 2
    }
  )

  // timingSafeEqual lève une exception si les longueurs diffèrent — et cette
  // différence de longueur est elle-même une fuite d'information. On la traite
  // comme un simple échec.
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/**
 * Coût d'un hachage factice, utilisé pour égaliser le temps de réponse quand
 * aucun utilisateur ne correspond. Voir AuthService.login.
 */
export async function burnEquivalentTime(): Promise<void> {
  await scryptAsync(randomBytes(16).toString('hex'), randomBytes(SALT_LEN), KEY_LEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM
  })
}
