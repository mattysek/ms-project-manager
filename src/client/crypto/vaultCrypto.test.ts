// Šifrování trezoru — ADR-016, PRD-09 (NFR).
import { describe, expect, it } from 'vitest';
import {
  createVerifier,
  decrypt,
  decryptJson,
  deriveKey,
  encrypt,
  encryptJson,
  fromBase64,
  generateSalt,
  verifyKey,
} from './vaultCrypto';

// PBKDF2 se 600 000 iteracemi trvá stovky milisekund. Testy ověřují chování
// šifrování, ne cenu odvození, takže si berou nižší počet — parametr je
// součástí formátu právě proto, že se smí lišit.
const TEST_ITERATIONS = 1_000;

const derive = (password: string, salt: string) => deriveKey(password, salt, TEST_ITERATIONS);

describe('vaultCrypto — šifrování a dešifrování', () => {
  it('zašifrovaný objekt se vrátí beze změny', async () => {
    const key = await derive('TrezorHeslo123', generateSalt());
    const secret = { title: 'Testovací server', password: 'Tajne123' };

    const blob = await encryptJson(key, secret);

    expect(await decryptJson(key, blob)).toEqual(secret);
  });

  // @scenario: vault.feature > Server obsah trezoru nevidí
  it('ciphertext neobsahuje heslo ani název v čitelné podobě', async () => {
    const key = await derive('TrezorHeslo123', generateSalt());

    const blob = await encryptJson(key, { title: 'Testovací server', password: 'Tajne123' });

    // Ani base64, ani dekódované bajty nesmí nést plaintext — přesně tohle
    // leží v `vault_entries` a přesně tohle uvidí, kdo ukradne zálohu.
    expect(blob.ciphertext).not.toContain('Tajne123');
    expect(blob.ciphertext).not.toContain('Testovací server');
    const raw = new TextDecoder().decode(fromBase64(blob.ciphertext));
    expect(raw).not.toContain('Tajne123');
    expect(raw).not.toContain('Testovací server');
  });

  it('stejný text zašifrovaný dvakrát dá jiný ciphertext i jiné IV', async () => {
    // Opakované IV u AES-GCM prozrazuje XOR otevřených textů a láme
    // autentizaci — každý zápis proto musí dostat nové.
    const key = await derive('TrezorHeslo123', generateSalt());

    const first = await encrypt(key, 'Tajne123');
    const second = await encrypt(key, 'Tajne123');

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('cizí klíč data nedešifruje', async () => {
    const salt = generateSalt();
    const key = await derive('TrezorHeslo123', salt);
    const foreign = await derive('SpatneHeslo999', salt);

    const blob = await encrypt(key, 'Tajne123');

    await expect(decrypt(foreign, blob)).rejects.toThrow();
  });

  it('poškozený ciphertext se nedešifruje mlčky', async () => {
    // GCM authentication tag je tu proto, aby podvržený blob spadl, a ne aby
    // se z něj vyrobil nesmysl, který UI zobrazí jako heslo.
    const key = await derive('TrezorHeslo123', generateSalt());
    const blob = await encrypt(key, 'Tajne123');
    const tampered = { ...blob, ciphertext: `${blob.ciphertext.slice(0, -4)}AAAA` };

    await expect(decrypt(key, tampered)).rejects.toThrow();
  });
});

describe('vaultCrypto — odvození klíče', () => {
  it('stejné heslo a sůl dají použitelný klíč i podruhé', async () => {
    const salt = generateSalt();
    const blob = await encrypt(await derive('TrezorHeslo123', salt), 'Tajne123');

    // Klíč je neexportovatelný, takže se rovnost dokazuje přes dešifrování.
    expect(await decrypt(await derive('TrezorHeslo123', salt), blob)).toBe('Tajne123');
  });

  it('jiná sůl dá jiný klíč i pro stejné heslo', async () => {
    const blob = await encrypt(await derive('TrezorHeslo123', generateSalt()), 'Tajne123');

    await expect(decrypt(await derive('TrezorHeslo123', generateSalt()), blob)).rejects.toThrow();
  });

  it('klíč nejde vyexportovat', async () => {
    // `extractable: false` je to, co brání kódu (i XSS payloadu) klíč
    // serializovat a odeslat.
    const key = await derive('TrezorHeslo123', generateSalt());

    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('sůl je pokaždé jiná', async () => {
    expect(generateSalt()).not.toBe(generateSalt());
  });
});

describe('vaultCrypto — ověření hesla', () => {
  it('správné heslo projde proti verifieru', async () => {
    const salt = generateSalt();
    const verifier = await createVerifier(await derive('TrezorHeslo123', salt));

    expect(await verifyKey(await derive('TrezorHeslo123', salt), verifier)).toBe(true);
  });

  it('špatné heslo neprojde a nevyhodí výjimku', async () => {
    // Volající to má dostat jako „ne", ne jako pád — selhání GCM tagu je tu
    // očekávaný výsledek.
    const salt = generateSalt();
    const verifier = await createVerifier(await derive('TrezorHeslo123', salt));

    expect(await verifyKey(await derive('SpatneHeslo999', salt), verifier)).toBe(false);
  });
});
