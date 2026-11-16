import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);

// Hash ficticio: si el usuario no existe igual se compara contra algo,
// así la respuesta tarda lo mismo y no revela qué usuarios están registrados.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', ROUNDS);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash ?? DUMMY_HASH);

// Sin caracteres que se confunden al dictarlos o leerlos en el celular (0/O, 1/l/I).
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Contraseña temporal legible, ej. 'Hk7m-q4Rt-9xWp'. */
export function generatePassword() {
  const chars = Array.from(crypto.randomBytes(12), (b) => ALPHABET[b % ALPHABET.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8, 12)].map((g) => g.join('')).join('-');
}
