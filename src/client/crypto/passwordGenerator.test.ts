// Generátor hesel — FR-VAULT-08.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PASSWORD_OPTIONS, generatePassword } from './passwordGenerator';

// @scenario: vault.feature > Generátor hesel
describe('generatePassword', () => {
  it('vygeneruje heslo výchozí délky 20 znaků', () => {
    expect(generatePassword(DEFAULT_PASSWORD_OPTIONS)).toHaveLength(20);
  });

  it('dvě po sobě vygenerovaná hesla se liší', () => {
    const first = generatePassword(DEFAULT_PASSWORD_OPTIONS);
    const second = generatePassword(DEFAULT_PASSWORD_OPTIONS);

    expect(first).not.toBe(second);
  });

  it('respektuje zvolenou délku', () => {
    expect(generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 32 })).toHaveLength(32);
  });

  it('bez zvolené znakové sady nevrací nic', () => {
    // Radši prázdno než tiše vygenerované heslo ze sady, kterou si uživatel
    // odklikal pryč.
    const password = generatePassword({
      length: 20,
      lowercase: false,
      uppercase: false,
      digits: false,
      symbols: false,
    });

    expect(password).toBe('');
  });

  it('používá jen zvolenou znakovou sadu', () => {
    const digits = generatePassword({
      length: 40,
      lowercase: false,
      uppercase: false,
      digits: true,
      symbols: false,
    });

    expect(digits).toMatch(/^[0-9]+$/);
  });

  it('vynechává vizuálně zaměnitelné znaky', () => {
    // l/I/1 a O/0 se v opisovaném heslu pletou; sada je proto bez nich.
    const password = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 400 });

    expect(password).not.toMatch(/[lIO01]/);
  });
});
