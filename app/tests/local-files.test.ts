/** Fichiers personnels sur l'appareil : recollage au dossier privé du jour (src/avatar/localFiles.ts). */
import { fileName, isDeviceFile, rebaseToDirectory, relocate } from '../src/avatar/localFiles';
import { createCheck } from './helpers/check';

const t = createCheck();
const OLD = 'file:///var/mobile/Containers/Data/Application/1111-AAAA/Documents/';
const NEW = 'file:///var/mobile/Containers/Data/Application/2222-BBBB/Documents/';

t.ok(isDeviceFile('file:///x/selfie.jpg') && !isDeviceFile('https://pc:8790/v1/a.glb') && !isDeviceFile('blob:http://x/1') && !isDeviceFile(null), 'fichier de l’appareil = file: seulement');
t.equal(fileName(OLD + 'avatar3d-abc.glb'), 'avatar3d-abc.glb', 'nom du fichier');
t.equal(fileName('file:///a/b/mon%20selfie.jpg?x=1'), 'mon selfie.jpg', 'nom décodé, sans paramètres');
t.equal(fileName('file:///a/b/'), '', 'dossier : pas de nom');

t.equal(rebaseToDirectory(OLD + 'selfie.jpg', NEW), NEW + 'selfie.jpg', 'recollé au nouveau dossier');
t.equal(rebaseToDirectory(OLD + 'selfie.jpg', NEW.replace(/\/$/, '')), NEW + 'selfie.jpg', 'dossier sans barre finale');
t.equal(rebaseToDirectory('https://pc:8790/v1/avatar/abc.glb', NEW), 'https://pc:8790/v1/avatar/abc.glb', 'adresse réseau (web) inchangée');
t.equal(rebaseToDirectory('file:///a/b/', NEW), 'file:///a/b/', 'sans nom : inchangé');

const disk = new Set([NEW + 'selfie.jpg', NEW + 'avatar3d-abc.glb', OLD + 'encore-la.jpg']);
const exists = (u: string) => disk.has(u);
t.equal(relocate(OLD + 'encore-la.jpg', NEW, exists), OLD + 'encore-la.jpg', 'fichier à sa place : adresse d’origine');
t.equal(relocate(OLD + 'selfie.jpg', NEW, exists), NEW + 'selfie.jpg', 'app mise à jour : retrouvé sous le nouveau dossier');
t.equal(relocate(OLD + 'avatar3d-abc.glb', NEW, exists), NEW + 'avatar3d-abc.glb', 'GLB retrouvé aussi');
t.equal(relocate(OLD + 'disparu.glb', NEW, exists), null, 'fichier supprimé : null, jamais une adresse inventée');
t.equal(relocate(NEW + 'disparu.glb', NEW, exists), null, 'déjà dans le dossier du jour mais absent : null');
t.equal(relocate('https://pc:8790/v1/avatar/abc.glb', NEW, () => false), 'https://pc:8790/v1/avatar/abc.glb', 'adresse réseau : pas de contrôle disque');

console.log(t.count() + ' tests fichiers personnels OK');
