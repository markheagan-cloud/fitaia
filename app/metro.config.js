// Metro : on ajoute les modèles 3D (GLB/glTF) aux fichiers que l'app peut embarquer via require().
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb', 'gltf');

module.exports = config;
