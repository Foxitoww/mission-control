/**
 * Les migrations sont importées en texte brut (`?raw`) plutôt que lues sur le
 * disque à l'exécution : le SQL est ainsi embarqué dans le bundle du processus
 * main. Un seul chemin de code fonctionne en dev, en test et dans l'application
 * empaquetée — pas de résolution de chemin qui casse après packaging.
 */
declare module '*.sql?raw' {
  const content: string
  export default content
}
