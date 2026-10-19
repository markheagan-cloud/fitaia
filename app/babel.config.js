// babel-preset-expo ajoute automatiquement le plugin Reanimated/Worklets quand le paquet est installé.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
