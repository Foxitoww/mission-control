import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Db } from '../db/connection'
import { usersRepo } from '../repositories/users.repo'
import { directMessagesRepo, type DirectMessageRow } from '../repositories/directMessages.repo'
import { session } from './session.service'
import { seal, open, generateMessagingKeyPair, deriveSharedKey } from '../security/crypto'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { DirectMessage, ConversationSummary } from '@shared/types/views'
import { sendMessageInputSchema } from '@shared/schemas/message.schema'

const otherUserInputSchema = z.object({ otherUserId: z.string().uuid() })

/**
 * Messagerie privée entre comptes (voir 002_direct_messages.sql).
 *
 * Chiffrement de bout en bout par paire de comptes : un secret ECDH X25519
 * statique-statique, dérivé UNE FOIS par conversation via `deriveSharedKey`,
 * chiffre chaque message avec `seal` (AES-256-GCM, nonce aléatoire par
 * message). Ni la base des comptes ni quiconque n'y a accès sans détenir la
 * clé privée de l'un des deux comptes — elle-même scellée par la DEK de ce
 * compte, donc par son mot de passe (voir ADR-007).
 */
function requireOtherUser(db: Db, otherUserId: string): void {
  if (!usersRepo.findById(db, otherUserId)) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'USER_NOT_FOUND')
  }
}

/** Secret partagé entre la session courante et `otherUserId`, ou lève si l'un des deux n'a pas de clés. */
function sharedKeyWith(db: Db, userId: string, otherUserId: string): Buffer {
  const mySealed = usersRepo.messagingPrivateKeySealed(db, userId)
  const otherPublic = usersRepo.messagingPublicKey(db, otherUserId)
  if (!mySealed || !otherPublic) {
    throw new AppError(AppErrorCode.CONFLICT, 'MESSAGING_KEYS_MISSING')
  }
  const myPrivate = session.unseal(mySealed)
  try {
    return deriveSharedKey(myPrivate, otherPublic)
  } finally {
    myPrivate.fill(0)
  }
}

function toPublic(row: DirectMessageRow, sharedKey: Buffer): DirectMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: open(sharedKey, row.ciphertext).toString('utf8'),
    createdAt: row.created_at
  }
}

export const messagesService = {
  /**
   * Génère la paire de clés de messagerie d'un compte si elle n'existe pas
   * encore — à l'inscription (clé fraîche) ET à chaque déverrouillage de
   * session (comptes créés avant cette fonctionnalité). Idempotent : ne
   * touche à rien si les clés sont déjà là.
   */
  ensureKeys(db: Db, userId: string, dek: Buffer): void {
    if (usersRepo.messagingPublicKey(db, userId)) return
    const { publicKey, privateKey } = generateMessagingKeyPair()
    try {
      usersRepo.setMessagingKeys(db, userId, publicKey, seal(dek, privateKey))
    } finally {
      privateKey.fill(0)
    }
  },

  /** La liste des interlocuteurs, la conversation la plus récente en tête. */
  conversations(db: Db): ConversationSummary[] {
    const userId = session.requireUserId()
    return directMessagesRepo.conversationPartners(db, userId).flatMap((row) => {
      const user = usersRepo.findById(db, row.other_user_id)
      // Un compte supprimé laisse ses messages passés : on n'affiche plus la
      // conversation, mais on ne perd rien pour l'autre partie.
      if (!user) return []
      return [
        {
          user,
          lastMessageAt: row.last_message_at,
          hasUnread: directMessagesRepo.hasUnread(db, userId, row.other_user_id)
        }
      ]
    })
  },

  /** Le fil complet avec un interlocuteur, déchiffré, du plus ancien au plus récent. */
  list(db: Db, input: unknown): DirectMessage[] {
    const userId = session.requireUserId()
    const { otherUserId } = parseOrThrow(otherUserInputSchema, input)
    requireOtherUser(db, otherUserId)

    const sharedKey = sharedKeyWith(db, userId, otherUserId)
    return directMessagesRepo
      .listBetween(db, userId, otherUserId)
      .map((row) => toPublic(row, sharedKey))
  },

  /** Envoie un message et renvoie le fil complet à jour, prêt à réafficher. */
  send(db: Db, input: unknown): DirectMessage[] {
    const userId = session.requireUserId()
    const data = parseOrThrow(sendMessageInputSchema, input)

    if (data.recipientId === userId) {
      throw new AppError(AppErrorCode.VALIDATION_FAILED, 'CANNOT_MESSAGE_SELF')
    }
    requireOtherUser(db, data.recipientId)

    const sharedKey = sharedKeyWith(db, userId, data.recipientId)
    directMessagesRepo.insert(db, {
      id: randomUUID(),
      senderId: userId,
      recipientId: data.recipientId,
      ciphertext: seal(sharedKey, Buffer.from(data.body, 'utf8')),
      now: new Date().toISOString()
    })

    return directMessagesRepo
      .listBetween(db, userId, data.recipientId)
      .map((row) => toPublic(row, sharedKey))
  },

  /** Éteint la pastille « non lu » d'une conversation — appelé à son ouverture. */
  markSeen(db: Db, input: unknown): null {
    const userId = session.requireUserId()
    const { otherUserId } = parseOrThrow(otherUserInputSchema, input)
    directMessagesRepo.markSeen(db, userId, otherUserId, new Date().toISOString())
    return null
  }
}
