import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { createTestAccountsDb } from '@main/db/init'
import type { Db } from '@main/db/connection'
import { authService } from '@main/services/auth.service'
import { rememberService } from '@main/services/remember.service'
import { session } from '@main/services/session.service'
import { memoryStore, useTempVaults } from './helpers'

let cleanupVaults: () => void
let db: Db
let store: ReturnType<typeof memoryStore>

const ALICE = { username: 'alice', displayName: 'Alice', password: 'correct-horse', avatar: null }
const LOGIN = { username: 'alice', password: 'correct-horse' }

function countSessions(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM remembered_sessions').get() as { n: number }).n
}

beforeAll(() => {
  cleanupVaults = useTempVaults()
})

afterAll(() => cleanupVaults())

beforeEach(async () => {
  db = createTestAccountsDb()
  store = memoryStore()
  session.discard()
  await authService.register(db, ALICE)
  session.clear()
})

afterEach(() => {
  session.discard()
  db.close()
})

describe('émission du jeton', () => {
  it("n'émet rien quand la case n'est pas cochée", async () => {
    await authService.login(db, LOGIN, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('émet un jeton quand la case est cochée', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)

    expect(store.peek()).not.toBeNull()
    expect(countSessions()).toBe(1)
  })

  it('ne stocke JAMAIS le jeton brut dans la base', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)

    const stored = store.peek() as { token: string }
    const row = db.prepare('SELECT token_hash FROM remembered_sessions').get() as {
      token_hash: string
    }

    expect(row.token_hash).not.toBe(stored.token)
    expect(row.token_hash).toHaveLength(64) // SHA-256 en hexadécimal
  })

  it('se reconnecter sans cocher révoque la session mémorisée précédente', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    authService.logout(db, store)
    await authService.login(db, LOGIN, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('ne conserve qu’une seule session mémorisée par compte', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    await authService.login(db, { ...LOGIN, remember: true }, store)

    expect(countSessions()).toBe(1)
  })
})

describe('restauration du jeton', () => {
  it('retrouve l’utilisateur au démarrage', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    const userId = session.userId
    session.clear()

    expect(rememberService.restore(db, store)).toBe(userId)
  })

  it('ne restaure rien sans jeton', () => {
    expect(rememberService.restore(db, store)).toBeNull()
  })

  it('fait TOURNER le jeton à chaque restauration', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    const before = (store.peek() as { token: string }).token

    rememberService.restore(db, store)

    // Une copie du fichier prise avant le redémarrage ne vaut plus rien.
    expect((store.peek() as { token: string }).token).not.toBe(before)
  })

  it('refuse un jeton falsifié et révoque la session', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    const stored = store.peek() as { id: string; token: string }
    store.write({ id: stored.id, token: 'jeton-invente' })

    expect(rememberService.restore(db, store)).toBeNull()
    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('refuse un jeton périmé et le purge', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    db.prepare('UPDATE remembered_sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z')

    expect(rememberService.restore(db, store)).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('purge les sessions expirées au démarrage', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    db.prepare('UPDATE remembered_sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z')

    expect(rememberService.purgeExpired(db)).toBe(1)
  })
})

describe('restauration complète de session', () => {
  it('exige AUSSI la clé scellée par le système', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    session.clear()

    // Hors d'Electron, safeStorage est indisponible : `dek_os` reste donc nul.
    // La restauration doit refuser d'ouvrir le coffre plutôt que de deviner —
    // c'est exactement le comportement attendu si l'on copiait le fichier de
    // jetons sur une autre machine (ADR-007).
    expect(db.prepare('SELECT dek_os FROM users').get()).toEqual({ dek_os: null })
    expect(authService.restore(db, store)).toBeNull()
    expect(session.userId).toBeNull()
  })
})

describe('révocation', () => {
  it('la déconnexion efface la ligne et le fichier', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    authService.logout(db, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('supprimer le compte révoque la session mémorisée', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    await authService.deleteAccount(db, { password: 'correct-horse' }, store)

    expect(store.peek()).toBeNull()
    expect(countSessions()).toBe(0)
  })

  it('un jeton d’un compte supprimé ne restaure rien', async () => {
    await authService.login(db, { ...LOGIN, remember: true }, store)
    const stolen = store.peek() as { id: string; token: string }

    await authService.deleteAccount(db, { password: 'correct-horse' }, store)

    // Le fichier est remis en place comme le ferait une copie de sauvegarde :
    // la cascade a supprimé la ligne, donc il ne correspond plus à rien.
    store.write(stolen)
    expect(rememberService.restore(db, store)).toBeNull()
  })
})
