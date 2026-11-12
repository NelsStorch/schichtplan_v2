import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  createChallengeToken,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  needsSecondFactor,
  otpauthUrl,
  readChallengeToken,
  resolveTotpKey,
  totpCode,
  totpStep,
  verifyTotp,
} from './twoFactor.js';

// Testvektor aus RFC 6238, Anhang B (SHA1, Secret «12345678901234567890»), auf 6 Ziffern gekürzt
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP', () => {
  it('rechnet die Testvektoren aus RFC 6238', () => {
    expect(totpCode(RFC_SECRET, totpStep(59_000))).toBe('287082');
    expect(totpCode(RFC_SECRET, totpStep(1_111_111_109_000))).toBe('081804');
    expect(totpCode(RFC_SECRET, totpStep(2_000_000_000_000))).toBe('279037');
  });

  it('Base32 hin und zurück', () => {
    const buf = Buffer.from('Cevi Schichtplan!');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
    expect(base32Decode('gezd gnbv-gy3t')).toEqual(base32Decode('GEZDGNBVGY3T'));
  });

  it('akzeptiert einen Zeitschritt Abweichung, aber keinen alten Code nochmals', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const previous = totpCode(RFC_SECRET, step - 1);
    expect(verifyTotp(RFC_SECRET, previous, null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), null, now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), null, now)).toBeNull();
    // Schon verwendet: gleicher oder älterer Schritt gilt nicht mehr
    expect(verifyTotp(RFC_SECRET, previous, step - 1, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), step - 1, now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, '12345', null, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', null, now)).toBeNull();
  });

  it('baut einen otpauth-Link, den Authenticator-Apps verstehen', () => {
    const url = otpauthUrl('JBSWY3DPEHPK3PXP', 'anna@example.com', 'Cevi Schichtplan');
    expect(url.startsWith('otpauth://totp/Cevi%20Schichtplan%3Aanna%40example.com?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(params.get('issuer')).toBe('Cevi Schichtplan');
    expect(params.get('digits')).toBe('6');
  });
});

describe('Verschlüsselung des Secrets', () => {
  const env = { NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv;

  it('verschlüsselt mit Zufalls-IV und entschlüsselt wieder', () => {
    const key = resolveTotpKey(env)!;
    const a = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const b = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(a, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('erkennt Manipulation und falschen Schlüssel', () => {
    const key = resolveTotpKey(env)!;
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const other = resolveTotpKey({ ...env, JWT_SECRET: 'y'.repeat(40) })!;
    expect(() => decryptSecret(stored, other)).toThrow();
    const parts = stored.split('.');
    parts[3] = Buffer.from('manipuliert').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
  });

  it('verlangt in Produktion einen eigenen Schlüssel', () => {
    expect(resolveTotpKey({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeNull();
    const hex = 'ab'.repeat(32);
    expect(resolveTotpKey({ NODE_ENV: 'production', TOTP_ENCRYPTION_KEY: hex } as NodeJS.ProcessEnv)?.length).toBe(32);
    expect(() => resolveTotpKey({ NODE_ENV: 'production', TOTP_ENCRYPTION_KEY: 'zu-kurz' } as NodeJS.ProcessEnv)).toThrow();
  });
});

describe('Wiederherstellungscodes', () => {
  it('erzeugt 10 verschiedene Codes und hasht sie unabhängig von Schreibweise', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
    expect(hashRecoveryCode('abcde-fghjk')).toBe(hashRecoveryCode(' ABCDE FGHJK '));
  });
});

describe('Login-Zwischenschritt', () => {
  it('liest nur gültige, unveränderte und nicht abgelaufene Challenges', () => {
    process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
    const now = 1_700_000_000_000;
    const token = createChallengeToken({ uid: 'u1', amr: 'password' }, now);
    expect(readChallengeToken(token, now)?.uid).toBe('u1');
    expect(readChallengeToken(token, now + 11 * 60 * 1000)).toBeNull();
    const [data, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ uid: 'u2', amr: 'password', exp: 9_999_999_999 })).toString('base64url');
    expect(readChallengeToken(`${forged}.${sig}`, now)).toBeNull();
    expect(readChallengeToken(`${data}.`, now)).toBeNull();
    expect(readChallengeToken(undefined, now)).toBeNull();
  });

  it('verlangt den Code beim Passwort immer, bei Cevi.DB nur mit Einstellung', () => {
    const on = { totpEnabledAt: new Date(), totpOnProviderLogin: false };
    expect(needsSecondFactor(on, 'password')).toBe(true);
    expect(needsSecondFactor(on, 'provider')).toBe(false);
    expect(needsSecondFactor({ ...on, totpOnProviderLogin: true }, 'provider')).toBe(true);
    expect(needsSecondFactor({ totpEnabledAt: null, totpOnProviderLogin: true }, 'password')).toBe(false);
  });
});
