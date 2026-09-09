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

  'auth.remember': 'Se souvenir de moi',
  'auth.rememberHint': 'Reste connecté 30 jours sur cet ordinateur. À éviter sur un poste partagé.',

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

  'profile.menu': 'Menu du profil',
  'profile.edit': 'Modifier le profil',
  'profile.title': 'Profil',
  'profile.identity': 'Identité',
  'profile.appearance': 'Apparence',
  'profile.avatar': 'Image',
  'profile.avatarUpload': 'Choisir une image',
  'profile.avatarRemove': 'Retirer',
  'profile.avatarHint': 'Redimensionnée à 128 × 128 et stockée en local.',
  'profile.emoji': 'Ou un emoji',
  'profile.accent': "Couleur d'accent",
  'profile.theme': 'Thème',
  'profile.language': 'Langue',
  'profile.saved': 'Profil enregistré.',

  'update.section': 'Application',
  'update.currentVersion': 'Version installée',
  'update.check': 'Vérifier la version',
  'update.idle': 'Aucune vérification effectuée.',
  'update.checking': 'Recherche d’une mise à jour…',
  'update.available': 'Mise à jour disponible :',
  'update.downloading': 'Téléchargement…',
  'update.ready': 'Prête à installer :',
  'update.restart': 'Redémarrer et installer',
  'update.upToDate': 'Tu es à jour.',
  'update.unsupported': 'Mises à jour indisponibles en développement. Elles fonctionnent dans l’application installée.',
  'update.error': 'Impossible de vérifier les mises à jour.',

  'theme.dark': 'Sombre',
  'theme.light': 'Clair',
  'theme.system': 'Système',

  'error.AVATAR_TOO_LARGE': "L'image est trop lourde après conversion.",
  'error.AVATAR_INVALID': "Format d'avatar non pris en charge.",
  'error.AVATAR_NOT_IMAGE': "Ce fichier n'est pas une image.",
  'error.AVATAR_SOURCE_TOO_LARGE': 'Image trop lourde : 12 Mo maximum.',
  'error.AVATAR_DECODE_FAILED': "Impossible de lire cette image.",
  'error.ACCENT_INVALID': 'Couleur non proposée par la palette.',

  'common.cancel': 'Annuler',
  'common.save': 'Enregistrer',
  'common.saving': 'Enregistrement…',
  'common.close': 'Fermer',
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

  'auth.remember': 'Remember me',
  'auth.rememberHint': 'Stay signed in for 30 days on this computer. Avoid on a shared machine.',

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

  'profile.menu': 'Profile menu',
  'profile.edit': 'Edit profile',
  'profile.title': 'Profile',
  'profile.identity': 'Identity',
  'profile.appearance': 'Appearance',
  'profile.avatar': 'Picture',
  'profile.avatarUpload': 'Choose an image',
  'profile.avatarRemove': 'Remove',
  'profile.avatarHint': 'Resized to 128 × 128 and stored locally.',
  'profile.emoji': 'Or an emoji',
  'profile.accent': 'Accent colour',
  'profile.theme': 'Theme',
  'profile.language': 'Language',
  'profile.saved': 'Profile saved.',

  'update.section': 'Application',
  'update.currentVersion': 'Installed version',
  'update.check': 'Check for updates',
  'update.idle': 'No check performed yet.',
  'update.checking': 'Looking for an update…',
  'update.available': 'Update available:',
  'update.downloading': 'Downloading…',
  'update.ready': 'Ready to install:',
  'update.restart': 'Restart and install',
  'update.upToDate': 'You are up to date.',
  'update.unsupported': 'Updates are unavailable in development. They work in the installed application.',
  'update.error': 'Could not check for updates.',

  'theme.dark': 'Dark',
  'theme.light': 'Light',
  'theme.system': 'System',

  'error.AVATAR_TOO_LARGE': 'The image is too large after conversion.',
  'error.AVATAR_INVALID': 'Unsupported avatar format.',
  'error.AVATAR_NOT_IMAGE': 'That file is not an image.',
  'error.AVATAR_SOURCE_TOO_LARGE': 'Image too large: 12 MB maximum.',
  'error.AVATAR_DECODE_FAILED': 'That image could not be read.',
  'error.ACCENT_INVALID': 'Colour not offered by the palette.',

  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.close': 'Close',
  'common.loading': 'Loading…',
  'common.retry': 'Retry'
}

export const dictionaries = { fr, en }
