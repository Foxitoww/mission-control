/**
 * Dictionnaire de traduction, sans dépendance externe.
 *
 * Le français sert de RÉFÉRENCE : `MessageKey` en est dérivé, et le dictionnaire
 * anglais est typé `Record<MessageKey, string>`. Oublier une clé en anglais
 * devient donc une erreur de compilation, et non une chaîne manquante découverte
 * en production. C'est la garantie principale qu'apporte une bibliothèque i18n
 * complète, pour une fraction du poids (§39 : pas de dépendance sans raison).
 *
 * Convention (voir DESIGN-SYSTEM.md) : les étiquettes techniques restent en
 * anglais dans les deux langues (ACTIVE, NOMINAL, T−03 DAYS) ; seule la prose
 * est traduite.
 */
const fr = {
  'app.name': 'MISSION CONTROL',
  'app.tagline': 'Centre de contrôle personnel',

  'auth.signIn': 'Se connecter',
  'auth.signUp': 'Créer un compte',
  'auth.username': "Nom d'utilisateur",
  'auth.displayName': 'Nom affiché',
  'auth.password': 'Mot de passe',
  'auth.passwordConfirm': 'Confirmer le mot de passe',
  'auth.noAccount': 'Pas encore de compte ?',
  'auth.hasAccount': 'Déjà un compte ?',
  'auth.selectProfile': 'Sélectionner un profil',
  'auth.newProfile': 'Nouveau profil',
  'auth.backToProfiles': 'Retour aux profils',
  'auth.working': 'Vérification…',
  'auth.creating': 'Création du compte…',
  'auth.signedInAs': 'Connecté en tant que',
  'auth.signOut': 'Se déconnecter',

  'auth.hint.username': '3 à 32 caractères : minuscules, chiffres, tirets et tirets bas',
  'auth.hint.password': '8 caractères minimum. La longueur compte plus que la complexité.',

  'error.AUTH_INVALID_CREDENTIALS': "Nom d'utilisateur ou mot de passe incorrect.",
  'error.AUTH_USERNAME_TAKEN': "Ce nom d'utilisateur est déjà pris.",
  'error.AUTH_REQUIRED': 'Session expirée. Reconnecte-toi.',
  'error.VALIDATION_FAILED': 'Les informations saisies sont invalides.',
  'error.USERNAME_TOO_SHORT': "Le nom d'utilisateur doit faire au moins 3 caractères.",
  'error.USERNAME_TOO_LONG': "Le nom d'utilisateur ne peut pas dépasser 32 caractères.",
  'error.USERNAME_INVALID_CHARS':
    'Seuls les minuscules, chiffres, tirets et tirets bas sont autorisés.',
  'error.PASSWORD_TOO_SHORT': 'Le mot de passe doit faire au moins 8 caractères.',
  'error.PASSWORD_TOO_LONG': 'Le mot de passe est trop long.',
  'error.PASSWORD_REQUIRED': 'Saisis ton mot de passe.',
  'error.PASSWORD_MISMATCH': 'Les deux mots de passe ne correspondent pas.',
  'error.DISPLAY_NAME_REQUIRED': 'Indique un nom affiché.',
  'error.DISPLAY_NAME_TOO_LONG': 'Le nom affiché est trop long.',
  'error.NOT_FOUND': 'Élément introuvable.',
  'error.CONFLICT': 'Conflit avec une donnée existante.',
  'error.DB_ERROR': 'Erreur de base de données locale.',
  'error.UNKNOWN': "Une erreur inattendue s'est produite.",

  'common.cancel': 'Annuler',
  'common.loading': 'Chargement…',
  'common.retry': 'Réessayer'
} as const

export type MessageKey = keyof typeof fr

const en: Record<MessageKey, string> = {
  'app.name': 'MISSION CONTROL',
  'app.tagline': 'Personal control center',

  'auth.signIn': 'Sign in',
  'auth.signUp': 'Create account',
  'auth.username': 'Username',
  'auth.displayName': 'Display name',
  'auth.password': 'Password',
  'auth.passwordConfirm': 'Confirm password',
  'auth.noAccount': 'No account yet?',
  'auth.hasAccount': 'Already have an account?',
  'auth.selectProfile': 'Select a profile',
  'auth.newProfile': 'New profile',
  'auth.backToProfiles': 'Back to profiles',
  'auth.working': 'Verifying…',
  'auth.creating': 'Creating account…',
  'auth.signedInAs': 'Signed in as',
  'auth.signOut': 'Sign out',

  'auth.hint.username': '3 to 32 characters: lowercase, digits, hyphens and underscores',
  'auth.hint.password': 'At least 8 characters. Length matters more than complexity.',

  'error.AUTH_INVALID_CREDENTIALS': 'Incorrect username or password.',
  'error.AUTH_USERNAME_TAKEN': 'That username is already taken.',
  'error.AUTH_REQUIRED': 'Session expired. Please sign in again.',
  'error.VALIDATION_FAILED': 'The information provided is invalid.',
  'error.USERNAME_TOO_SHORT': 'Username must be at least 3 characters.',
  'error.USERNAME_TOO_LONG': 'Username cannot exceed 32 characters.',
  'error.USERNAME_INVALID_CHARS': 'Only lowercase letters, digits, hyphens and underscores.',
  'error.PASSWORD_TOO_SHORT': 'Password must be at least 8 characters.',
  'error.PASSWORD_TOO_LONG': 'Password is too long.',
  'error.PASSWORD_REQUIRED': 'Enter your password.',
  'error.PASSWORD_MISMATCH': 'The two passwords do not match.',
  'error.DISPLAY_NAME_REQUIRED': 'Provide a display name.',
  'error.DISPLAY_NAME_TOO_LONG': 'Display name is too long.',
  'error.NOT_FOUND': 'Item not found.',
  'error.CONFLICT': 'Conflict with existing data.',
  'error.DB_ERROR': 'Local database error.',
  'error.UNKNOWN': 'An unexpected error occurred.',

  'common.cancel': 'Cancel',
  'common.loading': 'Loading…',
  'common.retry': 'Retry'
}

export const dictionaries = { fr, en }
