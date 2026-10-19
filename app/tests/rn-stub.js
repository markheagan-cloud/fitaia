// Remplaçant minimal de react-native pour les tests de logique pure (aucun rendu).
export const x = 0;
export const Platform = { OS: 'ios', select: (o) => (o ? (o.ios !== undefined ? o.ios : o.default) : undefined) };
