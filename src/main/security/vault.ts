import Database from 'better-sqlite3'
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { seal, open, DecryptionError } from './crypto'
import { applyPragmas, type Db } from '../db/connection'
import { migrate } from '../db/migrator'
import { vaultMigrations } from '../db/migrations/vault'

/**
 * Coffre : base SQLite d'un utilisateur, chiffrée au repos.
 *
 * Le fichier sur disque n'est jamais un fichier SQLite : c'est le résultat de
 * `db.serialize()` passé dans AES-256-GCM. Personne ne peut l'ouvrir avec un
 * outil SQLite, et le modifier d'un octet rend le déchiffrement impossible.
 *
 * En contrepartie, la base entière vit en MÉMOIRE pendant la session. C'est
 * acceptable ici : quelques milliers de tâches pèsent quelques mégaoctets, et
 * une application de productivité locale n'a pas vocation à en stocker des
 * millions.
 */

const MAGIC = Buffer.from('MCV1') // en-tête de format, pour un futur changement

export interface OpenVault {
  db: Db
  path: string
  /**
   * Un coffre ÉPHÉMÈRE n'est jamais écrit sur disque.
   *
   * Les tests du domaine métier travaillent sur un coffre en mémoire : ils
   * vérifient les règles, pas le chiffrement, et une dérivation scrypt par cas
   * de test rendrait la suite inutilisable. Le chiffrement, lui, a ses propres
   * tests, sur de vrais fichiers.
   */
  ephemeral?: boolean
}

function readSealed(path: string): Buffer {
  const raw = readFileSync(path)
  if (!raw.subarray(0, MAGIC.length).equals(MAGIC)) throw new DecryptionError()
  return raw.subarray(MAGIC.length)
}

/**
 * Écriture ATOMIQUE : on écrit un fichier temporaire puis on le renomme.
 *
 * `rename` est atomique sur un même volume. Écrire directement dans le fichier
 * final laisserait, en cas de coupure, un coffre tronqué — donc totalement
 * illisible, puisque GCM refuse tout contenu incomplet. Le renommage garantit
 * qu'à tout instant le fichier sur disque est soit l'ancien, soit le nouveau.
 */
function writeSealed(path: string, payload: Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, Buffer.concat([MAGIC, payload]), { mode: 0o600 })
  renameSync(temporary, path)
}

/** Crée un coffre vide, migré au dernier schéma, et l'écrit chiffré. */
export function createVault(path: string, dek: Buffer): OpenVault {
  const db = new Database(':memory:')
  applyPragmas(db)
  migrate(db, vaultMigrations)

  const vault: OpenVault = { db, path }
  flushVault(vault, dek)
  return vault
}

/**
 * Ouvre un coffre existant. Lève `DecryptionError` si la clé est fausse.
 *
 * Les migrations sont rejouées à chaque ouverture : une version de
 * l'application plus récente met ainsi le coffre à niveau au moment où son
 * propriétaire se connecte, et pas avant — puisque avant, il est illisible.
 */
export function openVault(path: string, dek: Buffer): OpenVault {
  if (!existsSync(path)) return createVault(path, dek)

  const plain = open(dek, readSealed(path))
  const db = new Database(plain)
  applyPragmas(db)

  const vault: OpenVault = { db, path }
  if (migrate(db, vaultMigrations) > 0) flushVault(vault, dek)
  return vault
}

/**
 * Sérialise, chiffre et écrit le coffre.
 *
 * Appelé après CHAQUE écriture, de façon synchrone. Un report différé gagnerait
 * quelques millisecondes au prix d'une fenêtre pendant laquelle une coupure de
 * courant perdrait du travail déjà confirmé à l'écran — un compromis que la
 * fiabilité (§42) ne justifie pas.
 */
export function flushVault(vault: OpenVault, dek: Buffer): void {
  if (vault.ephemeral) return
  writeSealed(vault.path, seal(dek, vault.db.serialize()))
}

export function closeVault(vault: OpenVault): void {
  // Un coffre éphémère n'appartient pas à la session : c'est l'environnement de
  // test qui le possède et le referme. Le fermer ici couperait la connexion
  // sous les pieds du test suivant, au premier changement d'utilisateur.
  if (vault.ephemeral) return
  vault.db.close()
}

/** Suppression définitive du coffre, à la suppression du compte. */
export function destroyVault(path: string): void {
  rmSync(path, { force: true })
  rmSync(`${path}.tmp`, { force: true })
}
