import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOfflineData, getLastSyncTime, recordLastSyncTime, syncOfflineOwner } from './offline';

describe('offline utils', () => {
  let mockStorage: Record<string, string>;
  let mockCaches: { keys: () => Promise<string[]>; delete: (k: string) => Promise<boolean> };

  beforeEach(() => {
    mockStorage = {};
    mockCaches = {
      keys: vi.fn().mockResolvedValue(['cache-v1', 'cache-v2']),
      delete: vi.fn().mockResolvedValue(true),
    };

    (global as any).window = {
      localStorage: {
        getItem: (key: string) => mockStorage[key] ?? null,
        setItem: (key: string, val: string) => {
          mockStorage[key] = val;
        },
        removeItem: (key: string) => {
          delete mockStorage[key];
        },
      },
      caches: mockCaches,
    };
  });

  afterEach(() => {
    delete (global as any).window;
    vi.restoreAllMocks();
  });

  it('speichert und liest den letzten Synchronisationszeitpunkt', () => {
    expect(getLastSyncTime()).toBeNull();

    const date = new Date('2026-06-20T14:30:00.000Z');
    recordLastSyncTime(date);

    const retrieved = getLastSyncTime();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.toISOString()).toBe(date.toISOString());
  });

  it('gibt null zurück, wenn ungültige Daten im Storage liegen', () => {
    mockStorage['schichtplan.last_online_sync'] = 'ungueltig';
    expect(getLastSyncTime()).toBeNull();
  });

  it('löscht Caches und Storage bei clearOfflineData', async () => {
    mockStorage['schichtplan.last_online_sync'] = '2026-06-20T14:30:00.000Z';
    mockStorage['schichtplan.offline_owner'] = 'user-1';

    await clearOfflineData();

    expect(mockStorage['schichtplan.last_online_sync']).toBeUndefined();
    expect(mockStorage['schichtplan.offline_owner']).toBeUndefined();
    expect(mockCaches.delete).toHaveBeenCalledWith('cache-v1');
    expect(mockCaches.delete).toHaveBeenCalledWith('cache-v2');
  });

  it('löscht Daten beim Wechsel des angemeldeten Benutzers', async () => {
    mockStorage['schichtplan.offline_owner'] = 'user-1';
    mockStorage['schichtplan.last_online_sync'] = '2026-06-20T14:30:00.000Z';

    // Benutzerwechsel zu user-2
    await syncOfflineOwner('user-2');

    expect(mockCaches.delete).toHaveBeenCalled();
    expect(mockStorage['schichtplan.offline_owner']).toBe('user-2');
  });

  it('löscht alle Offline-Daten beim Abmelden (userId: null)', async () => {
    mockStorage['schichtplan.offline_owner'] = 'user-1';

    await syncOfflineOwner(null);

    expect(mockStorage['schichtplan.offline_owner']).toBeUndefined();
    expect(mockCaches.delete).toHaveBeenCalled();
  });
});
