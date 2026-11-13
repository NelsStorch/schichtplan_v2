import crypto from 'crypto';
import {
  DEPARTMENT_PERMISSION_PRESETS,
  normalizePermissions,
  type DepartmentPermission,
  type DepartmentPermissionPreset,
} from '@schichtplan/shared';
import { resolveJwtSecret } from '../plugins/jwt.js';

export type InvitePreset = 'MEMBER' | DepartmentPermissionPreset;

function signInvite(departmentId: string, baseToken: string, preset: DepartmentPermissionPreset): string {
  return crypto
    .createHmac('sha256', resolveJwtSecret())
    .update(`dept-invite:${departmentId}:${baseToken}:${preset}`)
    .digest('base64url')
    .slice(0, 22);
}

/**
 * Erzeugt ein Einladungs-Token: für normale Mitglieder das Basis-Token der Abteilung,
 * bei vorausgewählter Rechte-Vorlage ein HMAC-signiertes Token `<baseToken>.<preset>.<sig>`.
 * Wird das Basis-Token der Abteilung neu erzeugt, werden auch alle signierten Tokens ungültig.
 */
export function createDepartmentInviteToken(
  departmentId: string,
  baseToken: string,
  preset: InvitePreset = 'MEMBER'
): string {
  if (preset === 'MEMBER') return baseToken;
  return `${baseToken}.${preset}.${signInvite(departmentId, baseToken, preset)}`;
}

/** Extrahiert das Basis-Token vor dem ersten Punkt (für DB-Lookup in `departments.invite_token`). */
export function extractBaseInviteToken(token: string | null | undefined): string | null {
  if (!token) return null;
  return token.trim().split('.')[0] || null;
}

/** Prüft ein einfaches oder signiertes Einladungs-Token gegen die Abteilung. */
export function verifyDepartmentInviteToken(
  departmentId: string,
  deptInviteToken: string | null | undefined,
  inputToken: string | null | undefined
): { valid: boolean; preset: InvitePreset; permissions: DepartmentPermission[] } {
  if (!deptInviteToken || !inputToken) {
    return { valid: false, preset: 'MEMBER', permissions: [] };
  }
  const clean = inputToken.trim();
  if (clean === deptInviteToken) {
    return { valid: true, preset: 'MEMBER', permissions: [] };
  }
  const parts = clean.split('.');
  if (parts.length !== 3) {
    return { valid: false, preset: 'MEMBER', permissions: [] };
  }
  const [base, rawPreset, sig] = parts;
  if (base !== deptInviteToken) {
    return { valid: false, preset: 'MEMBER', permissions: [] };
  }
  if (!Object.prototype.hasOwnProperty.call(DEPARTMENT_PERMISSION_PRESETS, rawPreset)) {
    return { valid: false, preset: 'MEMBER', permissions: [] };
  }
  const preset = rawPreset as DepartmentPermissionPreset;
  const expected = signInvite(departmentId, deptInviteToken, preset);
  const valid =
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!valid) {
    return { valid: false, preset: 'MEMBER', permissions: [] };
  }
  return {
    valid: true,
    preset,
    permissions: normalizePermissions(DEPARTMENT_PERMISSION_PRESETS[preset].permissions),
  };
}
