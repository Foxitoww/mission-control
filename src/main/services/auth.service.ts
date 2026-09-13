import { randomUUID } from 'node:crypto'
import type { Db } from '../db/connection'
import { usersRepo } from '../repositories/users.repo'
import { settingsRepo } from '../repositories/settings.repo'
import { hashPassword, verifyPassword, burnEquivalentTime } from './password'
import { session, vaultPath } from './session.service'
import { messagesService } from './messages.service'
import { rememberService, type RememberStore } from './remember.service'
import { osKeyStore } from '../security/os-key'
import {
  deriveKey,
  randomKey,
  randomSalt,
  seal,
  open,
  generateRecoveryPhrase,
  normalizeRecoveryPhrase,
  DecryptionError
} from '../security/crypto'
import { createVault, openVault, destroyVault } from '../security/vault'
import { parseOrThrow } from '../lib/validate'
import { AppError, AppErrorCode } from '@shared/errors'
import type { PublicUser, Language } from '@shared/types/domain'
import {
  registerInputSchema,
  loginInputSchema,
  deleteAccountInputSchema,
  recoverInputSchema,
  changePasswordInputSchema
} from '@shared/schemas/auth.schema'

export interface RegisterResult {
  user: PublicUser
  /**
   * Affichée UNE SEULE FOIS, à la création du compte.
   *
   * Elle n'est jamais stockée en clair : la base ne contient que la clé de
   * données scellée PAR elle. La retrouver depuis le fichier est aussi
   * impossible que de retrouver le mot de passe.
   */
  recoveryPhrase: string
}

function invalidCredentials(): AppError {
  return new AppError(AppErrorCode.AUTH_INVALID_CREDENTIALS, 'AUTH_INVALID_CREDENTIALS')
}

/**
 * Ouvre le coffre et démarre la session. Facteur commun à tous les chemins d'entrée.
 *
 * `ensureKeys` ici, et pas seulement à l'inscription : un compte créé avant la
 * messagerie privée n'a pas encore de paire de clés, et le mot de passe —
 * seul secret capable de sceller la clé privée — n'est disponible qu'à cet
 * instant précis, pas plus tard depuis un canal IPC.
 */
function unlock(db: Db, userId: string, dek: Buffer): void {
  session.start(userId, openVault(vaultPath(userId), dek), dek)
  messagesService.ensureKeys(db, userId, dek)
}

export const authService = {
  /**
   * Crée un compte, son coffre chiffré, et ouvre la session.
   *
   * ORDRE DES ÉCRITURES. Le compte et le coffre vivent désormais dans deux
   * fichiers distincts : aucune transaction ne peut les couvrir ensemble. On
   * crée donc le coffre EN PREMIER. Un coffre sans compte est un fichier inerte
   * et supprimable ; un compte sans coffre serait un profil impossible à ouvrir.
   */
  async register(db: Db, input: unknown, language: Language = 'fr'): Promise<RegisterResult> {
    const data = parseOrThrow(registerInputSchema, input)

    if (usersRepo.findByUsername(db, data.username)) {
      throw new AppError(AppErrorCode.AUTH_USERNAME_TAKEN, 'AUTH_USERNAME_TAKEN')
    }

    const passwordHash = await hashPassword(data.password)
    const id = randomUUID()
    const now = new Date().toISOString()

    // La clé de données est tirée au hasard, indépendamment du mot de passe.
    // Elle ne changera jamais de la vie du compte.
    const dek = randomKey()
    const recoveryPhrase = generateRecoveryPhrase()

    const kdfSalt = randomSalt()
    const recoverySalt = randomSalt()

    const dekPassword = seal(deriveKey(data.password, kdfSalt), dek)
    const dekRecovery = seal(deriveKey(normalizeRecoveryPhrase(recoveryPhrase), recoverySalt), dek)

    const path = vaultPath(id)
    const vault = createVault(path, dek)
    vault.db.prepare('INSERT INTO settings (user_id, language) VALUES (?, ?)').run(id, language)

    try {
      usersRepo.insert(db, {
        id,
        username: data.username,
        displayName: data.displayName,
        passwordHash,
        avatar: data.avatar ?? null,
        kdfSalt,
        dekPassword,
        recoverySalt,
        dekRecovery,
        now
      })
    } catch (error) {
      // Le compte n'existera pas : le coffre orphelin doit disparaître avec lui.
      destroyVault(path)
      throw error
    }

    session.start(id, vault, dek)
    messagesService.ensureKeys(db, id, dek)
    session.persist()

    const created = usersRepo.findById(db, id)
    if (!created) throw new AppError(AppErrorCode.DB_ERROR, 'DB_ERROR')
    return { user: created, recoveryPhrase }
  },

  /**
   * Connexion.
   *
   * NOTE DE SÉCURITÉ — énumération de comptes. Vérifier un mot de passe avec
   * scrypt prend délibérément ~100 ms. Si l'on renvoie une erreur immédiatement
   * lorsqu'aucun utilisateur ne correspond, l'écart de temps entre les deux cas
   * révèle quels noms d'utilisateur existent sur la machine.
   */
  async login(db: Db, input: unknown, store: RememberStore): Promise<PublicUser> {
    const data = parseOrThrow(loginInputSchema, input)
    const record = usersRepo.findByUsername(db, data.username)

    if (!record) {
      await burnEquivalentTime()
      throw invalidCredentials()
    }

    if (!(await verifyPassword(data.password, record.passwordHash))) throw invalidCredentials()

    const keys = usersRepo.keys(db, record.id)
    if (!keys) throw new AppError(AppErrorCode.DB_ERROR, 'DB_ERROR')

    let dek: Buffer
    try {
      dek = open(deriveKey(data.password, keys.kdfSalt), keys.dekPassword)
    } catch {
      // L'empreinte du mot de passe était bonne mais la clé ne s'ouvre pas :
      // le fichier de comptes a été altéré. Ce n'est pas une faute de frappe.
      throw new AppError(AppErrorCode.DB_ERROR, 'VAULT_KEY_CORRUPT')
    }

    unlock(db, record.id, dek)

    if (data.remember) {
      rememberService.issue(db, record.id, store)
      // Couche facultative (ADR-007) : la clé est scellée par le compte Windows,
      // ce qui permet de rouvrir le coffre au démarrage sans le mot de passe.
      usersRepo.setOsKey(db, record.id, osKeyStore.seal(dek))
    } else {
      rememberService.clear(db, store)
      usersRepo.setOsKey(db, record.id, null)
    }

    const { passwordHash: _ignored, ...publicUser } = record
    return publicUser
  },

  /**
   * Restaure une session mémorisée au démarrage.
   *
   * Exige les DEUX moitiés : un jeton valide (fichier + base) ET la clé scellée
   * par le système. Copier le seul fichier de jetons sur une autre machine ne
   * donne rien, puisque DPAPI n'y descellera pas la clé.
   */
  restore(db: Db, store: RememberStore): PublicUser | null {
    const userId = rememberService.restore(db, store)
    if (!userId) return null

    const keys = usersRepo.keys(db, userId)
    if (!keys?.dekOs) return null

    const dek = osKeyStore.open(keys.dekOs)
    if (!dek) return null

    try {
      unlock(db, userId, dek)
    } catch {
      dek.fill(0)
      return null
    }

    return usersRepo.findById(db, userId)
  },

  /**
   * Réinitialise le mot de passe à l'aide de la phrase de récupération.
   *
   * La clé de données est descellée par la phrase, puis rescellée par le nouveau
   * mot de passe. Le coffre n'est ni lu ni réécrit : c'est le bénéfice concret
   * du chiffrement enveloppe.
   */
  async recover(db: Db, input: unknown): Promise<PublicUser> {
    const data = parseOrThrow(recoverInputSchema, input)
    const record = usersRepo.findByUsername(db, data.username)
    if (!record) {
      await burnEquivalentTime()
      throw invalidCredentials()
    }

    const keys = usersRepo.keys(db, record.id)
    if (!keys) throw new AppError(AppErrorCode.DB_ERROR, 'DB_ERROR')

    let dek: Buffer
    try {
      dek = open(
        deriveKey(normalizeRecoveryPhrase(data.recoveryPhrase), keys.recoverySalt),
        keys.dekRecovery
      )
    } catch (error) {
      if (error instanceof DecryptionError) throw invalidCredentials()
      throw error
    }

    const kdfSalt = randomSalt()
    usersRepo.rewrapPassword(db, record.id, {
      passwordHash: await hashPassword(data.newPassword),
      kdfSalt,
      dekPassword: seal(deriveKey(data.newPassword, kdfSalt), dek),
      now: new Date().toISOString()
    })

    // Une réinitialisation invalide toute session mémorisée : la clé scellée par
    // le système correspondait à l'ancien contexte de confiance.
    usersRepo.setOsKey(db, record.id, null)

    unlock(db, record.id, dek)
    const user = usersRepo.findById(db, record.id)
    if (!user) throw new AppError(AppErrorCode.DB_ERROR, 'DB_ERROR')
    return user
  },

  /** Change le mot de passe d'une session ouverte, en réemballant la clé. */
  async changePassword(db: Db, input: unknown): Promise<null> {
    const userId = session.requireUserId()
    const data = parseOrThrow(changePasswordInputSchema, input)

    const user = usersRepo.findById(db, userId)
    if (!user) throw new AppError(AppErrorCode.NOT_FOUND, 'NOT_FOUND')

    const record = usersRepo.findByUsername(db, user.username)
    const keys = usersRepo.keys(db, userId)
    if (!record || !keys) throw new AppError(AppErrorCode.DB_ERROR, 'DB_ERROR')

    if (!(await verifyPassword(data.currentPassword, record.passwordHash))) {
      throw invalidCredentials()
    }

    const dek = open(deriveKey(data.currentPassword, keys.kdfSalt), keys.dekPassword)
    const kdfSalt = randomSalt()

    usersRepo.rewrapPassword(db, userId, {
      passwordHash: await hashPassword(data.newPassword),
      kdfSalt,
      dekPassword: seal(deriveKey(data.newPassword, kdfSalt), dek),
      now: new Date().toISOString()
    })

    dek.fill(0)
    return null
  },

  logout(db: Db, store: RememberStore): void {
    const userId = session.userId
    rememberService.clear(db, store)
    if (userId) usersRepo.setOsKey(db, userId, null)
    session.clear()
  },

  currentUser(db: Db): PublicUser | null {
    const userId = session.userId
    return userId ? usersRepo.findById(db, userId) : null
  },

  listUsers(db: Db): PublicUser[] {
    return usersRepo.listPublic(db)
  },

  /**
   * Supprime le compte, son coffre et toutes ses données.
   *
   * Le fichier chiffré est effacé du disque : il n'y a plus rien à déchiffrer,
   * même pour qui détiendrait le mot de passe.
   */
  async deleteAccount(db: Db, input: unknown, store: RememberStore): Promise<void> {
    const userId = session.requireUserId()
    const data = parseOrThrow(deleteAccountInputSchema, input)

    const user = usersRepo.findById(db, userId)
    if (!user) throw new AppError(AppErrorCode.NOT_FOUND, 'NOT_FOUND')

    const record = usersRepo.findByUsername(db, user.username)
    if (!record || !(await verifyPassword(data.password, record.passwordHash))) {
      throw invalidCredentials()
    }

    rememberService.clear(db, store)
    // On ferme SANS réécrire : le coffre part au rebut, l'écrire une dernière
    // fois ne ferait que recréer le fichier qu'on s'apprête à supprimer.
    session.discard()
    destroyVault(vaultPath(userId))
    usersRepo.deleteById(db, userId)
  },

  /** Paramètres : ils vivent dans le coffre, donc derrière le chiffrement. */
  settings(): typeof settingsRepo {
    return settingsRepo
  }
}

export { burnEquivalentTime }
