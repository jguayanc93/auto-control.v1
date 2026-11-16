/**
 * Combina objetos conservando getters (el spread {...a, ...b} los convierte en valores fijos).
 *   component: () => mix(credentialsMixin(), { ... })
 */
export function mix(...objects) {
  const result = {};
  for (const obj of objects) Object.defineProperties(result, Object.getOwnPropertyDescriptors(obj));
  return result;
}
