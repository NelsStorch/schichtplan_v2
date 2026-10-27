import { describe, it, expect } from 'vitest';
import { createDecipheriv, createECDH, hkdfSync } from 'node:crypto';
import {
  createVapidAuthorizationHeader,
  encryptWebPushPayload,
  getVapidKeys,
  getVapidPublicKey,
  isValidP256dhKey,
} from './webPush.js';

describe('webPush service', () => {
  it('derives deterministic P-256 VAPID keys and signs a valid ES256 VAPID header', () => {
    const keys = getVapidKeys();
    expect(keys.publicKeyBytes.length).toBe(65);
    expect(keys.publicKeyBytes[0]).toBe(0x04);
    expect(keys.privateKeyBytes.length).toBe(32);
    expect(getVapidPublicKey()).toBe(keys.publicKeyBase64Url);

    const header = createVapidAuthorizationHeader('https://fcm.googleapis.com/fcm/send/abc123');
    expect(header.startsWith('vapid t=')).toBe(true);
    expect(header).toContain(`, k=${keys.publicKeyBase64Url}`);

    const jwtMatch = /^vapid t=([^,]+), k=/.exec(header);
    expect(jwtMatch).not.toBeNull();
    const parts = jwtMatch![1].split('.');
    expect(parts.length).toBe(3);

    const decodedPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    expect(decodedPayload.aud).toBe('https://fcm.googleapis.com');
    expect(typeof decodedPayload.exp).toBe('number');
    expect(Buffer.from(parts[2], 'base64url').length).toBe(64);
  });

  it('validates p256dh public keys accurately', () => {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const validPub = ecdh.getPublicKey().toString('base64url');
    expect(isValidP256dhKey(validPub)).toBe(true);
    expect(isValidP256dhKey('not-a-valid-key')).toBe(false);
  });

  it('encrypts payload according to RFC 8291 aes128gcm and can be decrypted by receiver', () => {
    const receiverEcdh = createECDH('prime256v1');
    receiverEcdh.generateKeys();
    const uaPublic = receiverEcdh.getPublicKey();
    const authSecret = Buffer.from('0123456789abcdef', 'utf8'); // 16 bytes

    const payloadJson = JSON.stringify({
      title: 'Deine Schicht beginnt in 1 Stunde',
      body: 'Chilbi Illnau 2026 · Festzelt – Bar & Getränke (20:00–00:00)',
      url: 'https://illnau.cevi-schichtplan.ch/events/chilbi-2026',
    });

    const body = encryptWebPushPayload(
      payloadJson,
      uaPublic.toString('base64url'),
      authSecret.toString('base64url'),
    );

    // Parse RFC 8188 header: salt(16) || rs(4) || idlen(1) || keyid(65)
    const salt = body.subarray(0, 16);
    const rs = body.readUInt32BE(16);
    const idLen = body.readUInt8(20);
    expect(rs).toBe(4096);
    expect(idLen).toBe(65);

    const asPublic = body.subarray(21, 21 + idLen);
    const ciphertextWithTag = body.subarray(21 + idLen);
    const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
    const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);

    // Receiver derives shared secret and decrypts
    const sharedSecret = receiverEcdh.computeSecret(asPublic);
    const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), uaPublic, asPublic]);
    const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, keyInfo, 32));
    const cek = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16),
    );
    const nonce = Buffer.from(
      hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12),
    );

    const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
    decipher.setAuthTag(tag);
    const decryptedPadded = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    // Last byte must be record delimiter 0x02
    expect(decryptedPadded[decryptedPadded.length - 1]).toBe(0x02);
    const decryptedText = decryptedPadded.subarray(0, decryptedPadded.length - 1).toString('utf8');
    expect(decryptedText).toBe(payloadJson);
  });
});
