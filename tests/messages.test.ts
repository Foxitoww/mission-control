import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { Db } from '@main/db/connection'
import { messagesService } from '@main/services/messages.service'
import { AppErrorCode } from '@shared/errors'
import { createTestEnv, seedMessagingUser, signIn, type TestEnv } from './helpers'

let env: TestEnv
let db: Db
let aliceId: string
let bobId: string
let carolId: string

beforeEach(() => {
  env = createTestEnv()
  db = env.accounts

  aliceId = seedMessagingUser(env, 'alice')
  bobId = seedMessagingUser(env, 'bob')
  carolId = seedMessagingUser(env, 'carol')
  signIn(env, aliceId)
})

afterEach(() => env.close())

describe('messagerie privée — chiffrement de bout en bout', () => {
  it('envoie un message et le relit en clair, dans les deux sens', () => {
    const afterSend = messagesService.send(db, { recipientId: bobId, body: 'Salut Bob' })
    expect(afterSend).toHaveLength(1)
    expect(afterSend[0]?.body).toBe('Salut Bob')
    expect(afterSend[0]?.senderId).toBe(aliceId)
    expect(afterSend[0]?.recipientId).toBe(bobId)

    signIn(env, bobId)
    const bobsView = messagesService.list(db, { otherUserId: aliceId })
    expect(bobsView).toHaveLength(1)
    expect(bobsView[0]?.body).toBe('Salut Bob')
  })

  it('ne stocke jamais le texte en clair dans la base', () => {
    messagesService.send(db, { recipientId: bobId, body: 'secret de sprint' })

    const row = db.prepare('SELECT ciphertext FROM direct_messages').get() as {
      ciphertext: Buffer
    }
    expect(row.ciphertext.includes(Buffer.from('secret de sprint', 'utf8'))).toBe(false)
  })

  it('trie le fil du plus ancien au plus récent, messages des deux côtés mélangés', () => {
    messagesService.send(db, { recipientId: bobId, body: 'un' })
    signIn(env, bobId)
    messagesService.send(db, { recipientId: aliceId, body: 'deux' })
    signIn(env, aliceId)
    messagesService.send(db, { recipientId: bobId, body: 'trois' })

    const thread = messagesService.list(db, { otherUserId: bobId })
    expect(thread.map((m) => m.body)).toEqual(['un', 'deux', 'trois'])
  })

  it('refuse un message à soi-même', () => {
    expect(() => messagesService.send(db, { recipientId: aliceId, body: 'coucou moi' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })

  it('refuse un destinataire inexistant', () => {
    expect(() =>
      messagesService.send(db, { recipientId: '00000000-0000-0000-0000-000000000000', body: 'x' })
    ).toThrow(expect.objectContaining({ code: AppErrorCode.NOT_FOUND }))
  })

  it('refuse un message vide ou trop long', () => {
    expect(() => messagesService.send(db, { recipientId: bobId, body: '   ' })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
    expect(() => messagesService.send(db, { recipientId: bobId, body: 'x'.repeat(4001) })).toThrow(
      expect.objectContaining({ code: AppErrorCode.VALIDATION_FAILED })
    )
  })
})

describe('messagerie privée — isolation entre comptes', () => {
  it('un tiers ne voit jamais une conversation qui ne le concerne pas', () => {
    messagesService.send(db, { recipientId: bobId, body: 'entre alice et bob' })

    signIn(env, carolId)
    // Carol demande le fil « avec Bob » : la requête ne peut renvoyer que les
    // messages où CAROL figure, jamais ceux d'Alice — même nom de destinataire.
    expect(messagesService.list(db, { otherUserId: bobId })).toEqual([])
    expect(messagesService.conversations(db)).toEqual([])
  })

  it("n'apparaît dans la liste de conversations que pour ses deux membres", () => {
    messagesService.send(db, { recipientId: bobId, body: 'salut' })

    const aliceConversations = messagesService.conversations(db)
    expect(aliceConversations.map((c) => c.user.id)).toEqual([bobId])

    signIn(env, bobId)
    const bobConversations = messagesService.conversations(db)
    expect(bobConversations.map((c) => c.user.id)).toEqual([aliceId])

    signIn(env, carolId)
    expect(messagesService.conversations(db)).toEqual([])
  })
})

describe('messagerie privée — pastille « non lu »', () => {
  it("s'allume à la réception, s'éteint à la visite, indépendamment par conversation", () => {
    messagesService.send(db, { recipientId: bobId, body: 'pour bob' })
    messagesService.send(db, { recipientId: carolId, body: 'pour carol' })

    signIn(env, bobId)
    expect(messagesService.conversations(db).find((c) => c.user.id === aliceId)?.hasUnread).toBe(
      true
    )
    messagesService.markSeen(db, { otherUserId: aliceId })
    expect(messagesService.conversations(db).find((c) => c.user.id === aliceId)?.hasUnread).toBe(
      false
    )

    signIn(env, carolId)
    // La pastille de Carol reste allumée : marquer la conversation de Bob comme
    // vue n'a aucun effet sur celle de Carol — deux comptes, deux états.
    expect(messagesService.conversations(db).find((c) => c.user.id === aliceId)?.hasUnread).toBe(
      true
    )
  })

  it("n'allume pas la pastille pour ses propres messages envoyés", () => {
    messagesService.send(db, { recipientId: bobId, body: 'un' })
    // Alice vient d'écrire : sa propre conversation avec Bob ne doit pas se
    // marquer comme « non lue » pour elle-même.
    expect(messagesService.conversations(db).find((c) => c.user.id === bobId)?.hasUnread).toBe(
      false
    )
  })
})

describe('messagerie privée — clés', () => {
  it('ensureKeys est idempotent : un second appel ne casse pas le déchiffrement existant', () => {
    messagesService.send(db, { recipientId: bobId, body: 'avant le second ensureKeys' })
    messagesService.ensureKeys(db, aliceId, Buffer.alloc(32))

    const thread = messagesService.list(db, { otherUserId: bobId })
    expect(thread[0]?.body).toBe('avant le second ensureKeys')
  })
})
