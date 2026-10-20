/**
 * Retrouve sur le disque les fichiers personnels enregistrés (selfie, GLB) : voir src/avatar/localFiles.ts pour la règle.
 * Sur le web il n'y a pas de disque privé : les adresses sont rendues telles quelles.
 */
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { isDeviceFile, relocate } from '@/avatar/localFiles';

function exists(uri: string): boolean {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Adresse valable aujourd'hui du fichier, ou null s'il a disparu de l'appareil. */
export function findDeviceFile(uri: string | null | undefined): string | null {
  if (uri == null) return null;
  if (Platform.OS === 'web' || !isDeviceFile(uri)) return uri;
  return relocate(uri, Paths.document.uri, exists);
}
