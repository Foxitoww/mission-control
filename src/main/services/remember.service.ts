import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { z } from 'zod'
import type { Db } from '../db/connection'
import { sessionsRepo } from '../repositories/sessions.repo'

/** 256 bits d'entropie : deviner un jeton est hors de portée. */
const TOKEN_BYTES = 32

/** Durée de vie d'une session mémorisée. Au-delà, il faut ressaisir le mot de passe. */
const LIFETIME_DAYS = 30

/**
 * Le jeton est haché avec SHA-256, PAS avec scrypt.
 *
 * scrypt est délibérément lent parce qu'un mot de passe humain a peu d'entropie
 * et doit résister à une attaque par dictionnaire. Un jeton de 256 bits tiré au
 * hasard n'a pas ce problème : il n'existe aucun dictionnaire à parcourir. Un
 * hachage rapide suffit, et évite d'imposer 100 ms à chaque démarrage.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

function matches(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Persistance du jeton, isolée derrière une interface.
 *
 * Le jeton ne va PAS dans SQLite : la base ne détient que son empreinte. Les
 * deux moitiés vivent donc dans des fichiers distincts, et supprimer l'un ou
 * l'autre suffit à révoquer la session.
 */
export interface RememberStore {
  read(): { id: string; token: string } | null
  write(value: { id: string; token: string }): void
  clear(): void
}

const storedTokenSchema = z.object({ id: z.string().min(1), token: z.string().min(1) })

export function fileStore(path: string): RememberStore {
  return {
    read() {
      try {
        // Fichier absent, illisible ou corrompu : dans tous les cas, il n'y a
        // simplement pas de session à restaurer. Ce n'est pas une erreur.
        const parsed = storedTokenSchema.safeParse(JSON.parse(readFileSync(path, 'utf-8')))
        return parsed.success ? parsed.data : null
      } catch {
        return null
      }
    },
    write(value) {
      // mode 0600 : sans effet réel sur Windows, mais correct sur macOS et Linux
      // où le dossier de données peut être lisible par d'autres comptes.
      writeFileSync(path, JSON.stringify(value), { encoding: 'utf-8', mode: 0o600 })
    },
    clear() {
      rmSync(path, { force: true })
    }
  }
}

function expiryFrom(now: Date): string {
  const expires = new Date(now)
  expires.setDate(expires.getDate() + LIFETIME_DAYS)
  return expires.toISOString()
}

export const rememberService = {
  /** Ouvre une session mémorisée pour cet utilisateur, en remplaçant la précédente. */
  issue(db: Db, userId: string, store: RememberStore): void {
    // Une seule session mémorisée par compte et par machine : réutiliser
    // « se souvenir de moi » ne doit pas accumuler des jetons révocables oubliés.
    sessionsRepo.deleteForUser(db, userId)

    const id = randomUUID()
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    const now = new Date()

    sessionsRepo.insert(db, {
      id,
      userId,
      tokenHash: hashToken(token),
      createdAt: now.toISOString(),
      expiresAt: expiryFrom(now)
    })

    store.write({ id, token })
  },

  /**
   * Restaure une session au démarrage. Renvoie l'identifiant utilisateur, ou null.
   *
   * Le jeton est FAIT TOURNER à chaque restauration réussie : une copie du
   * fichier prise hier ne vaut plus rien dès que l'application a redémarré une
   * fois. Cela réduit la fenêtre d'exploitation d'un fichier exfiltré.
   */
  restore(db: Db, store: RememberStore): string | null {
    const stored = store.read()
    if (!stored) return null

    const session = sessionsRepo.findById(db, stored.id)
    if (!session) {
      store.clear()
      return null
    }

    const now = new Date()
    const expired = new Date(session.expiresAt) <= now
    if (expired || !matches(hashToken(stored.token), session.tokenHash)) {
      sessionsRepo.deleteById(db, session.id)
      store.clear()
      return null
    }

    const nextToken = randomBytes(TOKEN_BYTES).toString('base64url')
    sessionsRepo.rotate(db, session.id, hashToken(nextToken), expiryFrom(now))
    store.write({ id: session.id, token: nextToken })

    return session.userId
  },

  /** Révoque la session mémorisée : la ligne et le fichier disparaissent ensemble. */
  clear(db: Db, store: RememberStore): void {
    const stored = store.read()
    if (stored) sessionsRepo.deleteById(db, stored.id)
    store.clear()
  },

  purgeExpired(db: Db): number {
    return sessionsRepo.purgeExpired(db, new Date().toISOString())
  }
}
