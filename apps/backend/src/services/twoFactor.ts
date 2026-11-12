/**
 * Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP nach RFC 6238: HMAC-SHA1, 30 Sekunden, 6 Ziffern).
 * Funktioniert mit jeder Standard-App (Google Authenticator, Aegis, 2FAS, 1Password, Bitwarden …).
 *
 * - Das Secret steht AES-256-GCM-verschlüsselt in `users.totp_secret`. Schlüssel: `TOTP_ENCRYPTION_KEY`
 *   (32 Byte, Base64 oder Hex) aus der Server-`.env`. Ausserhalb der Produktion wird er aus dem
 *   JWT-Secret abgeleitet, damit lokal nichts konfiguriert werden muss.
 * - Wiederherstellungscodes: 10 Stück, je einmal gültig, in der DB nur als SHA-256-Hash.
 * - Login-Zwischenschritt: Nach Passwort (oder Cevi.DB) gibt es noch kein Login-Token, nur ein
 *   kurzlebiges, signiertes «Challenge»-Cookie. Erst mit dem Code wird das echte Token ausgestellt.
 */
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../db.js';
import { resolveJwtSecret } from '../plugins/jwt.js';
import type { LoginMethodClaim } from './adminSecurity.js';
import { createRateLimiter } from './rateLimit.js';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Erlaubte Abweichung der Handy-Uhr: ein Zeitschritt davor und danach */
const TOTP_WINDOW = 1;
export const RECOVERY_CODE_COUNT = 10;

export const TWO_FACTOR_CHALLENGE_COOKIE = 'mfa_challenge';
export const TWO_FACTOR_CHALLENGE_TTL_SECONDS = 10 * 60;

/** Falsche Codes: höchstens 5 pro Konto in 15 Minuten, 30 pro IP in 10 Minuten */
export const twoFactorFailuresByUser = createRateLimiter(15 * 60 * 1000, 5);
export const twoFactorFailuresByIp = createRateLimiter(10 * 60 * 1000, 30);

/* ------------------------------------------------------------------ Base32 (RFC 4648) */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error('Ungültiges Base32-Zeichen');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/* ------------------------------------------------------------------ TOTP */

/** Neues Secret (160 Bit, wie von RFC 4226 empfohlen), Base32-kodiert */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** Code für einen Zeitschritt (HOTP nach RFC 4226 mit dem Zeitschritt als Zähler) */
export function totpCode(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = crypto.createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return binary.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Code prüfen. Gibt den passenden Zeitschritt zurück oder null. Ein Schritt, der nicht grösser als
 * `lastStep` ist, zählt nicht: So lässt sich ein abgefangener Code kein zweites Mal verwenden.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastStep: number | null | undefined,
  nowMs: number = Date.now()
): number | null {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const current = totpStep(nowMs);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = current + delta;
    if (lastStep !== null && lastStep !== undefined && step <= lastStep) continue;
    const expected = Buffer.from(totpCode(secretBase32, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(clean))) return step;
  }
  return null;
}

/** otpauth://-Link für den QR-Code (Format von Google Authenticator, von allen Apps verstanden) */
export function otpauthUrl(secretBase32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ------------------------------------------------------------------ Verschlüsselung */

/**
 * Schlüssel für die Secrets. Produktion: nur aus `TOTP_ENCRYPTION_KEY`, sonst null (= 2FA nicht
 * konfiguriert). Lokal/Test: aus dem JWT-Secret abgeleitet.
 */
export function resolveTotpKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.TOTP_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY muss 32 Byte lang sein (Base64 oder 64 Hex-Zeichen)');
    return key;
  }
  if (env.NODE_ENV === 'production') return null;
  return crypto.createHash('sha256').update(`totp-key:${resolveJwtSecret(env)}`).digest();
}

export function isTwoFactorConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return resolveTotpKey(env) !== null;
  } catch {
    return false;
  }
}

function requireKey(): Buffer {
  const key = resolveTotpKey();
  if (!key) throw new Error('TOTP_ENCRYPTION_KEY ist nicht gesetzt');
  return key;
}

/** Format: v1.<iv>.<tag>.<ciphertext> (Base64url) */
export function encryptSecret(secretBase32: string, key: Buffer = requireKey()): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function decryptSecret(stored: string, key: Buffer = requireKey()): string {
  const [version, iv, tag, enc] = stored.split('.');
  if (version !== 'v1' || !iv || !tag || !enc) throw new Error('Unbekanntes Format des TOTP-Secrets');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]).toString('utf8');
}

/* ------------------------------------------------------------------ Wiederherstellungscodes */

/** Ohne leicht verwechselbare Zeichen (0/O, 1/I/L) */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

/** 10 Codes im Format xxxxx-xxxxx (ca. 49 Bit je Code) */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, () => RECOVERY_ALPHABET[crypto.randomInt(RECOVERY_ALPHABET.length)]);
    return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
  });
}

/** Neue Codes speichern (alte werden ungültig) und im Klartext zurückgeben: nur dieses eine Mal sichtbar */
export async function replaceRecoveryCodes(prisma: PrismaClient, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
    prisma.twoFactorRecoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ]);
  return codes;
}

/* ------------------------------------------------------------------ Zweiten Faktor prüfen */

export type SecondFactorResult = { ok: true; method: 'totp' | 'recovery' } | { ok: false };

/**
 * TOTP-Code oder Wiederherstellungscode prüfen und verbrauchen (Zeitschritt merken bzw. Code als
 * benutzt markieren). Gleichzeitige Anfragen mit demselben Code: nur eine gewinnt (bedingtes Update).
 */
export async function consumeSecondFactor(
  prisma: PrismaClient,
  user: { id: string; totpSecret: string | null; totpLastStep: number | null },
  code: string
): Promise<SecondFactorResult> {
  const input = code.trim();
  if (!input || input.length > 40) return { ok: false };

  if (/^\d[\d\s]*$/.test(input)) {
    if (!user.totpSecret) return { ok: false };
    let secret: string;
    try {
      secret = decryptSecret(user.totpSecret);
    } catch {
      return { ok: false };
    }
    const step = verifyTotp(secret, input, user.totpLastStep);
    if (step === null) return { ok: false };
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return updated.count === 1 ? { ok: true, method: 'totp' } : { ok: false };
  }

  const used = await prisma.twoFactorRecoveryCode.updateMany({
    where: { userId: user.id, codeHash: hashRecoveryCode(input), usedAt: null },
    data: { usedAt: new Date() },
  });
  return used.count === 1 ? { ok: true, method: 'recovery' } : { ok: false };
}

/* ------------------------------------------------------------------ Login-Zwischenschritt */

export interface TwoFactorChallenge {
  /** Person */
  uid: string;
  /** Anmeldeart des späteren Login-Tokens */
  amr: LoginMethodClaim;
  /** Weiterleitung nach dem Code (vom Server berechnet, z. B. nach dem Cevi.DB-Login) */
  next?: string;
  /** Ablauf in Sekunden seit 1970 */
  exp: number;
}

function challengeKey(): Buffer {
  return crypto.createHash('sha256').update(`mfa-challenge:${resolveJwtSecret()}`).digest();
}

function sign(data: string): string {
  return crypto.createHmac('sha256', challengeKey()).update(data).digest('base64url');
}

/** Bewusst kein JWT: Ein solches Token darf nirgends als Login-Token durchgehen */
export function createChallengeToken(challenge: Omit<TwoFactorChallenge, 'exp'>, nowMs = Date.now()): string {
  const payload: TwoFactorChallenge = { ...challenge, exp: Math.floor(nowMs / 1000) + TWO_FACTOR_CHALLENGE_TTL_SECONDS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

export function readChallengeToken(token: string | undefined, nowMs = Date.now()): TwoFactorChallenge | null {
  if (!token) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as TwoFactorChallenge;
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number') return null;
    if (payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Challenge-Cookie nur für die Login-Seite (ohne Domain: gilt nicht auf den Abteilungs-Subdomains) */
export function setChallengeCookie(reply: FastifyReply, challenge: Omit<TwoFactorChallenge, 'exp'>) {
  reply.setCookie(TWO_FACTOR_CHALLENGE_COOKIE, createChallengeToken(challenge), {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TWO_FACTOR_CHALLENGE_TTL_SECONDS,
  });
}

export function clearChallengeCookie(reply: FastifyReply) {
  reply.clearCookie(TWO_FACTOR_CHALLENGE_COOKIE, { path: '/' });
}

export function readChallengeCookie(request: FastifyRequest): TwoFactorChallenge | null {
  return readChallengeToken(request.cookies[TWO_FACTOR_CHALLENGE_COOKIE]);
}

/**
 * Braucht dieser Login noch den zweiten Faktor? Passwort immer (wenn 2FA aktiv), Cevi.DB/Hitobito
 * nur, wenn die Person das so eingestellt hat.
 */
export function needsSecondFactor(
  user: { totpEnabledAt: Date | null; totpOnProviderLogin: boolean },
  via: 'password' | 'provider'
): boolean {
  if (!user.totpEnabledAt) return false;
  return via === 'password' || user.totpOnProviderLogin;
}
