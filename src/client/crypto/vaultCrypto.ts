// Šifrování trezoru hesel — ADR-016, PRD-09 (NFR).
//
// Celý modul běží v prohlížeči nad WebCrypto a je jediné místo, kde se pracuje
// s heslem k trezoru. Ven z něj jde vždycky jen `CryptoKey` (neexportovatelný)
// nebo hotový ciphertext — heslo samotné se nikam nepředává, neukládá ani
// neloguje.
//
// Formát na drátu je base64, protože `ciphertext` i `iv` jdou do TEXT sloupců
// v SQLite (`vault_entries`) a JSON binárku neumí.

/** Parametry odvození, tak jak se ukládají u profilu trezoru. */
export const KDF_NAME = 'PBKDF2-SHA256';

/**
 * Počet iterací PBKDF2.
 *
 * 600 000 je doporučení OWASP pro PBKDF2-HMAC-SHA256 (2023). Na tohle heslo
 * neplatí lockout jako na přihlášení — kdo má ukradenou zálohu databáze, má
 * neomezeně pokusů offline, takže cena jednoho pokusu je jediná obrana.
 *
 * Hodnota se ukládá u profilu, takže ji jde zvýšit bez změny formátu:
 * stávající trezory se dál odemknou svým původním číslem.
 */
export const PBKDF2_ITERATIONS = 600_000;

/** Délka soli v bajtech. */
const SALT_BYTES = 16;

/**
 * Délka IV pro AES-GCM v bajtech.
 *
 * 96 bitů je pro GCM doporučená délka — kratší i delší IV se interně hashují
 * a připravují o záruku jedinečnosti.
 */
const IV_BYTES = 12;

/**
 * Konstanta, kterou profil trezoru drží zašifrovanou (`verifier`).
 *
 * Odemčení je pokus o její dešifrování: GCM authentication tag selže při
 * špatném hesle dřív, než se sáhne na jediný záznam. Bez toho by „špatné
 * heslo" nešlo odlišit od „poškozená data".
 */
const VERIFIER_PLAINTEXT = 'msp-vault-verifier-v1';

export interface EncryptedBlob {
  ciphertext: string;
  iv: string;
}

/** UTF-8 bajty nad obyčejným `ArrayBuffer` — viz `fromBase64`. */
function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Náhodná sůl pro nový trezor. */
export function generateSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * Odvodí klíč trezoru z hesla.
 *
 * `extractable: false` je podstatné: ani kód aplikace se z `CryptoKey` nedostane
 * k syrovým bajtům, takže klíč nejde omylem (ani XSS payloadem) serializovat
 * do úložiště nebo odeslat.
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encodeUtf8(password), 'PBKDF2', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromBase64(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Zašifruje text novým náhodným IV. */
export async function encrypt(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  // Nové IV pro KAŽDÝ zápis. Opakované IV se stejným klíčem u GCM prozrazuje
  // XOR otevřených textů a láme autentizaci — proto se nikdy nerecykluje.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodeUtf8(plaintext)
  );

  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

/**
 * Dešifruje blob. Vyhazuje, pokud klíč nesedí nebo jsou data poškozená —
 * volající to má brát jako „špatné heslo", ne jako pád.
 */
export async function decrypt(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) },
    key,
    fromBase64(blob.ciphertext)
  );
  return new TextDecoder().decode(decrypted);
}

/** Zašifruje objekt jako JSON. */
export async function encryptJson<T>(key: CryptoKey, value: T): Promise<EncryptedBlob> {
  return encrypt(key, JSON.stringify(value));
}

/** Dešifruje objekt z JSONu. */
export async function decryptJson<T>(key: CryptoKey, blob: EncryptedBlob): Promise<T> {
  return JSON.parse(await decrypt(key, blob)) as T;
}

/** Ověřovací blob pro nový trezor. */
export async function createVerifier(key: CryptoKey): Promise<EncryptedBlob> {
  return encrypt(key, VERIFIER_PLAINTEXT);
}

/**
 * Sedí heslo? Ověřuje se proti `verifier`, ne proti záznamům — trezor jde
 * odemknout i prázdný a nemusí se kvůli tomu stahovat obsah.
 */
export async function verifyKey(key: CryptoKey, verifier: EncryptedBlob): Promise<boolean> {
  try {
    return (await decrypt(key, verifier)) === VERIFIER_PLAINTEXT;
  } catch {
    // Selhání GCM tagu je očekávaný výsledek špatného hesla, ne chyba běhu.
    return false;
  }
}
