/**
 * FITAIA n'envoie que des rappels LOCAUX (src/services/reminders.ts) : aucune notification poussée depuis un serveur.
 * expo-notifications ajoute pourtant le droit « aps-environment », que le profil de signature n'inclut pas
 * (échec de la build 5). On le retire ; à remettre le jour où l'app enverra de vraies notifications distantes.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function sansPushDistant(config) {
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
