import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase } from '@main/db/init'
import type { Db } from '@main/db/connection'
import { authService } from '@main/services/auth.service'
import { rememberService } from '@main/services/remember.service'
import { session } from '@main/services/session.service'
import { memoryStore } from './helpers'

let db: Db
let store: ReturnType<typeof memoryStore>

const ALICE = { username: 'alice', displayName: 'Alice', password: 'correct-horse', avatar: null }

function countSessions(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM remembered_sessions').get() as { n: number }).n
}

beforeEach(async () => {
  db = createTestDatabase()
  store = memoryStore()
  session.clear()
  await authService.register(db, ALICE)
  session.clear()
})

afterEach(() => db.close())

describe('émission du jeton', () => {
  it("n'émet rien quand la case n'est pas cochée", async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse' }, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('émet un jeton quand la case est cochée', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)

    expect(store.peek()).not.toBeNull()
    expect(countSessions()).toBe(1)
  })

  it('ne stocke JAMAIS le jeton brut dans la base', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)

    const stored = store.peek() as { token: string }
    const row = db.prepare('SELECT token_hash FROM remembered_sessions').get() as {
      token_hash: string
    }

    expect(row.token_hash).not.toBe(stored.token)
    expect(row.token_hash).toHaveLength(64) // SHA-256 en hexadécimal
  })

  it('se reconnecter sans cocher révoque la session mémorisée précédente', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    authService.logout(db, store)
    await authService.login(db, { username: 'alice', password: 'correct-horse' }, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('ne conserve qu’une seule session mémorisée par compte', async () => {
    const login = {
      username: 'alice',
      password: 'correct-horse',
      remember: true
    }
    await authService.login(db, login, store)
    await authService.login(db, login, store)

    expect(countSessions()).toBe(1)
  })
})

describe('restauration', () => {
  it('restaure la session au démarrage', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    const userId = session.userId
    session.clear()

    expect(rememberService.restore(db, store)).toBe(userId)
  })

  it('ne restaure rien sans jeton', () => {
    expect(rememberService.restore(db, store)).toBeNull()
  })

  it('fait TOURNER le jeton à chaque restauration', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    const before = (store.peek() as { token: string }).token

    rememberService.restore(db, store)
    const after = (store.peek() as { token: string }).token

    // Une copie du fichier prise avant le redémarrage ne vaut plus rien.
    expect(after).not.toBe(before)
  })

  it('refuse un jeton falsifié et révoque la session', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    const stored = store.peek() as { id: string; token: string }
    store.write({ id: stored.id, token: 'jeton-invente' })

    expect(rememberService.restore(db, store)).toBeNull()
    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('refuse un jeton périmé et le purge', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    db.prepare('UPDATE remembered_sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z')

    expect(rememberService.restore(db, store)).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('purge les sessions expirées au démarrage', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    db.prepare('UPDATE remembered_sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z')

    expect(rememberService.purgeExpired(db)).toBe(1)
  })
})

describe('révocation', () => {
  it('la déconnexion efface la ligne et le fichier', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    authService.logout(db, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('supprimer le compte révoque la session mémorisée', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    await authService.deleteAccount(db, { password: 'correct-horse' }, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('un jeton d’un compte supprimé ne restaure rien', async () => {
    await authService.login(db, { username: 'alice', password: 'correct-horse', remember: true }, store)
    const stolen = store.peek() as { id: string; token: string }

    await authService.deleteAccount(db, { password: 'correct-horse' }, store)

    // Le fichier est remis en place comme le ferait une copie de sauvegarde :
    // la cascade a supprimé la ligne, donc il ne correspond plus à rien.
    store.write(stolen)
    expect(rememberService.restore(db, store)).toBeNull()
  })
})
