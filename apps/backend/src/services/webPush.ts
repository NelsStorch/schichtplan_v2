import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  randomBytes,
  sign,
} from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';
import { resolveJwtSecret } from '../plugins/jwt.js';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Push-Dienste der Browser (Chrome/Edge/Opera über FCM, Firefox, Safari, Windows). Nur dorthin schickt
 * der Server Push-Nachrichten. Sonst könnte jedes Konto eine beliebige Adresse als «Push-Endpoint»
 * eintragen und den Server Anfragen an interne Dienste schicken lassen (SSRF).
 */
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com'];
const PUSH_SERVICE_SUFFIXES = ['.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.includes(host) || PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

interface VapidKeys {
  publicKeyBase64Url: string;
  privateKeyBytes: Buffer;
  publicKeyBytes: Buffer;
}

// P-256 curve order N (big-endian)
const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

let cachedVapidKeys: VapidKeys | null = null;

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64url');
}

function fromBase64Url(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Loads VAPID keys from environment (`VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY`)
 * or deterministically derives a valid P-256 keypair from `JWT_SECRET` so all
 * backend containers share the exact same VAPID identity across restarts and
 * zero-downtime deployments without requiring manual key generation.
 */
export function getVapidKeys(): VapidKeys {
  if (cachedVapidKeys) return cachedVapidKeys;

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();

  if (envPub && envPriv) {
    const publicKeyBytes = fromBase64Url(envPub);
    const privateKeyBytes = fromBase64Url(envPriv);
    if (publicKeyBytes.length === 65 && privateKeyBytes.length === 32) {
      cachedVapidKeys = {
        publicKeyBase64Url: toBase64Url(publicKeyBytes),
        privateKeyBytes,
        publicKeyBytes,
      };
      return cachedVapidKeys;
    }
  }

  const secret = resolveJwtSecret(process.env);
  const rawSeed = Buffer.from(
    hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('cevi-schichtplan-vapid-salt', 'utf8'), Buffer.from('vapid-p256-priv', 'utf8'), 32),
  );
  // Ensure scalar is strictly in [1, N-1]
  const scalar = (BigInt('0x' + rawSeed.toString('hex')) % (P256_ORDER - 1n)) + 1n;
  const privateKeyBytes = Buffer.from(scalar.toString(16).padStart(64, '0'), 'hex');

  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(privateKeyBytes);
  const publicKeyBytes = ecdh.getPublicKey(); // 65 bytes uncompressed (0x04 || X || Y)

  cachedVapidKeys = {
    publicKeyBase64Url: toBase64Url(publicKeyBytes),
    privateKeyBytes,
    publicKeyBytes,
  };
  return cachedVapidKeys;
}

export function getVapidPublicKey(): string {
  return getVapidKeys().publicKeyBase64Url;
}

function extractEmailAddress(raw: string | undefined): string {
  if (!raw) return 'noreply@cevi-schichtplan.ch';
  const match = /<([^>]+@[^>]+)>/.exec(raw);
  if (match) return match[1].trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) return raw.trim();
  return 'noreply@cevi-schichtplan.ch';
}

/**
 * Creates a signed RFC 8292 VAPID Authorization header (`vapid t=..., k=...`).
 */
export function createVapidAuthorizationHeader(
  endpoint: string,
  subject?: string,
  keys: VapidKeys = getVapidKeys(),
): string {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600; // 12 hours
  const sub =
    subject ||
    process.env.VAPID_SUBJECT?.trim() ||
    `mailto:${extractEmailAddress(process.env.SMTP_FROM)}`;

  const header = toBase64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' }), 'utf8'));
  const payload = toBase64Url(Buffer.from(JSON.stringify({ aud: audience, exp, sub }), 'utf8'));
  const unsignedToken = `${header}.${payload}`;

  // Construct JWK from uncompressed P-256 public key (0x04 || X(32) || Y(32)) and private key D(32)
  const x = toBase64Url(keys.publicKeyBytes.subarray(1, 33));
  const y = toBase64Url(keys.publicKeyBytes.subarray(33, 65));
  const d = toBase64Url(keys.privateKeyBytes);

  const privateKeyObj = createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x, y, d },
    format: 'jwk',
  });

  const sig = sign('sha256', Buffer.from(unsignedToken, 'utf8'), {
    key: privateKeyObj,
    dsaEncoding: 'ieee-p1363', // 64-byte raw R||S required by JWS ES256
  });

  const jwt = `${unsignedToken}.${toBase64Url(sig)}`;
  return `vapid t=${jwt}, k=${keys.publicKeyBase64Url}`;
}

/**
 * Validates that a client-supplied `p256dh` key is a valid uncompressed P-256 public key on the curve.
 */
export function isValidP256dhKey(p256dhBase64Url: string): boolean {
  try {
    const bytes = fromBase64Url(p256dhBase64Url);
    if (bytes.length !== 65 || bytes[0] !== 0x04) return false;
    const x = toBase64Url(bytes.subarray(1, 33));
    const y = toBase64Url(bytes.subarray(33, 65));
    createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypts a UTF-8 payload using RFC 8291 (`aes128gcm` content encoding for Web Push).
 */
export function encryptWebPushPayload(
  payloadText: string,
  userPublicKeyBase64Url: string,
  userAuthBase64Url: string,
): Buffer {
  const uaPublic = fromBase64Url(userPublicKeyBase64Url);
  const authSecret = fromBase64Url(userAuthBase64Url);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error('Invalid p256dh public key (expected 65-byte uncompressed P-256 point)');
  }
  if (authSecret.length < 16) {
    throw new Error('Invalid auth secret (expected at least 16 bytes)');
  }

  // Generate ephemeral sender ECDH keypair on P-256
  const asEcdh = createECDH('prime256v1');
  asEcdh.generateKeys();
  const asPublic = asEcdh.getPublicKey(); // 65 bytes
  const ecdhSecret = asEcdh.computeSecret(uaPublic); // 32 bytes

  // Step 1: Combine ECDH shared secret with auth_secret via HKDF (RFC 8291 Section 3.3)
  // key_info = "WebPush: info" || 0x00 || ua_public || as_public
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    uaPublic,
    asPublic,
  ]);
  const ikm = Buffer.from(hkdfSync('sha256', ecdhSecret, authSecret, keyInfo, 32));

  // Step 2: Derive Content-Encryption Key (16 bytes) and Nonce (12 bytes) (RFC 8188 Section 2.2)
  const salt = randomBytes(16);
  const cekInfo = Buffer.from('Content-Encoding: aes128gcm\0', 'utf8');
  const nonceInfo = Buffer.from('Content-Encoding: nonce\0', 'utf8');

  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, cekInfo, 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, nonceInfo, 12));

  // Step 3: Pad plaintext with record delimiter 0x02 (final record) and encrypt with AES-128-GCM
  const plaintext = Buffer.concat([Buffer.from(payloadText, 'utf8'), Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // Step 4: Build RFC 8188 aes128gcm header: salt(16) || rs(4, UInt32BE=4096) || idlen(1=65) || keyid(65=asPublic)
  const header = Buffer.alloc(16 + 4 + 1 + asPublic.length);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  asPublic.copy(header, 21);

  return Buffer.concat([header, encrypted, authTag]);
}

export interface SendPushResult {
  ok: boolean;
  status: number;
  gone: boolean;
  errorText?: string;
}

/**
 * Sends a single encrypted Web Push message to a push service endpoint.
 */
export async function sendPushNotification(
  sub: PushSubscriptionKeys,
  payload: PushPayload,
  ttlSeconds = 86_400,
): Promise<SendPushResult> {
  // Auch bei älteren Abos prüfen (vorher liess sich jede Adresse speichern); «gone» räumt sie weg
  if (!isAllowedPushEndpoint(sub.endpoint)) {
    return { ok: false, status: 410, gone: true, errorText: 'Push-Endpoint nicht erlaubt' };
  }
  const body = encryptWebPushPayload(JSON.stringify(payload), sub.p256dh, sub.auth);
  const authorization = createVapidAuthorizationHeader(sub.endpoint);

  const response = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.length),
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body: new Uint8Array(body),
    // Keiner Weiterleitung folgen: sonst führte ein erlaubter Host doch noch zu einer anderen Adresse
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });

  const status = response.status;
  const gone = status === 404 || status === 410;
  const ok = status >= 200 && status < 300;
  const errorText = !ok ? await response.text().catch(() => '') : undefined;
  return { ok, status, gone, errorText };
}

/**
 * Abos mit Adressen ausserhalb der Browser-Push-Dienste löschen. Vor der Prüfung in isAllowedPushEndpoint
 * liess sich jede Adresse speichern; echte Browser-Abos bleiben, nur die unerlaubten gehen weg.
 * Läuft einmal beim Start (server.ts). Gibt die Anzahl gelöschter Abos zurück.
 */
export async function purgeDisallowedPushSubscriptions(prisma: Pick<PrismaClient, 'pushSubscription'>): Promise<number> {
  const subs = await prisma.pushSubscription.findMany({ select: { id: true, endpoint: true } });
  const ids = subs.filter((s) => !isAllowedPushEndpoint(s.endpoint)).map((s) => s.id);
  if (ids.length === 0) return 0;
  const { count } = await prisma.pushSubscription.deleteMany({ where: { id: { in: ids } } });
  return count;
}

/**
 * Sends a Web Push notification to all registered devices of a user and automatically
 * cleans up expired (`404`/`410`) subscriptions.
 */
export async function sendPushToUser(
  prisma: PrismaClient,
  userId: string,
  payload: PushPayload,
  log?: { warn: (obj: unknown, msg?: string) => void },
): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const sub of subs) {
    try {
      const res = await sendPushNotification(sub, payload);
      if (res.ok) {
        sent++;
      } else if (res.gone) {
        removed++;
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      } else {
        failed++;
        log?.warn(
          { userId, status: res.status, errorText: res.errorText },
          'Web Push Zustellung fehlgeschlagen',
        );
      }
    } catch (err) {
      failed++;
      log?.warn({ err, userId }, 'Web Push Fehler beim Senden');
    }
  }

  return { sent, failed, removed };
}
