import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, departmentSetupUrl, errorMessage, loginUrl } from './api';

describe('ApiError', () => {
  it('erstellt Instanz mit Statuscode und Zusatzdaten', () => {
    const error = new ApiError('Keine Berechtigung', 403, { code: 'FORBIDDEN', missing: 'ADMIN' });
    expect(error.message).toBe('Keine Berechtigung');
    expect(error.status).toBe(403);
    expect(error.data).toEqual({ code: 'FORBIDDEN', missing: 'ADMIN' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
  });

  it('verwendet leeres data-Objekt als Standard', () => {
    const error = new ApiError('Not Found', 404);
    expect(error.status).toBe(404);
    expect(error.data).toEqual({});
  });
});

describe('errorMessage', () => {
  it('extrahiert die Nachricht aus Error-Objekten', () => {
    expect(errorMessage(new Error('Datenbank offline'))).toBe('Datenbank offline');
    expect(errorMessage(new ApiError('Schicht voll', 409))).toBe('Schicht voll');
  });

  it('fällt bei Nicht-Error-Werten auf den Standardtext zurück', () => {
    expect(errorMessage('Direkter String')).toBe('Etwas ist schiefgelaufen');
    expect(errorMessage(null)).toBe('Etwas ist schiefgelaufen');
    expect(errorMessage(undefined)).toBe('Etwas ist schiefgelaufen');
    expect(errorMessage({ custom: 'error' })).toBe('Etwas ist schiefgelaufen');
    expect(errorMessage(500)).toBe('Etwas ist schiefgelaufen');
  });
});

describe('loginUrl & departmentSetupUrl', () => {
  it('liefert valide Login-URLs', () => {
    const url = loginUrl('/events/sommerfest');
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  it('liefert valide Abteilungs-Setup-URLs', () => {
    const url = departmentSetupUrl('/events/sommerfest');
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });
});

describe('api fetch-Wrapper', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('führt erfolgreiche GET-Anfragen aus und parst JSON', async () => {
    const mockData = { id: 'shift-1', title: 'Bar' };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => mockData,
    } as unknown as Response);

    const result = await api<typeof mockData>('/api/shifts/shift-1');
    expect(result).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith('/api/shifts/shift-1', expect.anything());
  });

  it('sendet JSON-Payloads mit Content-Type-Header', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      json: async () => ({ success: true }),
    } as unknown as Response);

    const payload = { nickname: 'Falk', birthDate: '2005-05-12' };
    await api('/api/auth/nickname-login', {
      method: 'POST',
      json: payload,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/nickname-login',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      })
    );
  });

  it('wirft ApiError bei Fehlerantworten mit Fehlertext des Backends', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      json: async () => ({ error: 'Diese Schicht ist bereits ausgebucht', code: 'SHIFT_FULL' }),
    } as unknown as Response);

    await expect(api('/api/shifts/shift-1/signup', { method: 'POST' })).rejects.toThrow(ApiError);
    try {
      await api('/api/shifts/shift-1/signup', { method: 'POST' });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.message).toBe('Diese Schicht ist bereits ausgebucht');
      expect(apiErr.status).toBe(400);
      expect(apiErr.data).toEqual({ error: 'Diese Schicht ist bereits ausgebucht', code: 'SHIFT_FULL' });
    }
  });

  it('fällt auf message oder Standardmeldung zurück, wenn error fehlt', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => ({ message: 'Bad Gateway' }),
    } as unknown as Response);

    try {
      await api('/api/status');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Bad Gateway');
      expect((err as ApiError).status).toBe(502);
    }

    // Ungültiges JSON / leerer Body
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => {
        throw new Error('Not JSON');
      },
    } as unknown as Response);

    try {
      await api('/api/crash');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe('Etwas ist schiefgelaufen');
      expect((err as ApiError).status).toBe(500);
    }
  });
});
