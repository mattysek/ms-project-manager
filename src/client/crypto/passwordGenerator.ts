// Generátor hesel pro trezor — FR-VAULT-08.
//
// Zdrojem náhody je `crypto.getRandomValues`, nikdy `Math.random`: ten je
// predikovatelný a pro heslo, které má chránit produkční účet, nepoužitelný.

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
};

const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
// Bez uvozovek a zpětného lomítka — dělají potíže v konfiguračních souborech
// a connection stringech, kam tahle hesla typicky putují.
const SYMBOLS = '!#$%&*+-=?@^_';

/** Znaky, ze kterých se vybírá. Vizuálně zaměnitelné (l/I/1, O/0) chybí schválně. */
function alphabet(options: PasswordOptions): string {
  return [
    options.lowercase ? LOWERCASE : '',
    options.uppercase ? UPPERCASE : '',
    options.digits ? DIGITS : '',
    options.symbols ? SYMBOLS : '',
  ].join('');
}

/**
 * Náhodný index bez modulo bias.
 *
 * Prosté `value % size` zvýhodňuje začátek abecedy, protože 256 není dělitelné
 * velikostí většiny abeced. Hodnoty ze zbytkového pásma se proto zahazují.
 */
function randomIndex(size: number): number {
  const limit = Math.floor(256 / size) * size;
  const buffer = new Uint8Array(1);
  let value = limit;
  while (value >= limit) {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  }
  return value % size;
}

/** Vygeneruje heslo. Bez zvolené znakové sady vrací prázdný řetězec. */
export function generatePassword(options: PasswordOptions): string {
  const chars = alphabet(options);
  if (chars.length === 0 || options.length <= 0) return '';

  let password = '';
  for (let i = 0; i < options.length; i += 1) {
    password += chars[randomIndex(chars.length)];
  }
  return password;
}
