/**
 * Fichiers personnels gardés sur le téléphone (selfie, GLB de l'avatar 3D) : règles pures, testées dans
 * tests/local-files.test.ts. La lecture réelle du disque est dans src/services/localFiles.ts.
 *
 * Pourquoi : sur iPhone, le dossier privé de l'app change d'adresse à chaque mise à jour (identifiant du conteneur,
 * Apple TN2406). Un chemin `file:///…/Containers/Data/Application/<ancien id>/Documents/selfie.jpg` enregistré hier ne
 * mène plus nulle part aujourd'hui, alors que le fichier est toujours là sous le nouveau dossier. On ne garde donc
 * que le nom du fichier comme vérité et on le recolle au dossier du jour.
 */

/** Le fichier est-il gardé sur l'appareil (et non une adresse réseau, une donnée en mémoire ou rien) ? */
export const isDeviceFile = (uri: string | null | undefined): uri is string => typeof uri === 'string' && uri.startsWith('file:');

/** Nom du fichier (dernier segment, décodé), ou '' si l'adresse n'en a pas. */
export function fileName(uri: string): string {
  const path = uri.replace(/[?#].*$/, '');
  const last = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Même fichier, dans le dossier privé du jour. Les adresses qui ne sont pas des fichiers de l'appareil sont rendues telles quelles. */
export function rebaseToDirectory(uri: string, directoryUri: string): string {
  if (!isDeviceFile(uri)) return uri;
  const name = fileName(uri);
  if (!name) return uri;
  return directoryUri.replace(/\/+$/, '') + '/' + encodeURIComponent(name);
}

/**
 * Retrouve un fichier personnel enregistré : à son adresse d'origine, sinon sous le même nom dans le dossier du jour.
 * `exists` est la seule question posée au disque. Rend null quand le fichier a vraiment disparu : l'app doit alors
 * oublier l'ancienne adresse plutôt qu'afficher une erreur à chaque ouverture.
 */
export function relocate(uri: string, directoryUri: string, exists: (uri: string) => boolean): string | null {
  if (!isDeviceFile(uri)) return uri;
  if (exists(uri)) return uri;
  const moved = rebaseToDirectory(uri, directoryUri);
  return moved !== uri && exists(moved) ? moved : null;
}
